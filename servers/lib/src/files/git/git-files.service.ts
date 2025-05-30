import { IFilesService } from '../interfaces/files.service.interface.js';

import { CONFIG_SERVICE } from '../../config/config.interface.js';
import LocalFilesService from '../local/local-files.service.js';
import { CONFIG_MODE } from '../../enums/config-mode.enum.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as http from 'isomorphic-git/http/node/index.cjs';
import { GitRepo } from 'src/config/config.model.js';

import { ConsoleLogger } from '../../util/logger.js';
import Config from '../../config/config.service.js';
import { Project } from 'src/types.js';
import * as git from 'isomorphic-git';

import ignore from 'ignore';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export default class GitFilesService implements IFilesService {
  private readonly dataPath: string;
  private readonly logger: Logger;
  @Inject(LocalFilesService) private localFilesService: LocalFilesService;

  constructor(@Inject(CONFIG_SERVICE) private configService: Config) {
    this.dataPath = this.configService.getLocalPath();
    this.logger = new ConsoleLogger(GitFilesService.name);
  }
  private async cloneRepositories(): Promise<void> {
    const userRepoConfigs: { [key: string]: GitRepo }[] = this.configService.getGitRepos();
    const clonePromises: Promise<void>[] = [];
    userRepoConfigs.forEach((configObj) => {
      Object.keys(configObj).forEach((userKey) => {
        if (!this.isValidUserKey(userKey)) { throw new Error(`Invalid userKey: ${userKey}`); }
        const gitRepo: GitRepo = configObj[userKey];
        if (!gitRepo || typeof gitRepo['repo-url'] !== 'string') { throw new Error('Invalid repo config'); }
        const repoUrl: string = gitRepo['repo-url'];
        const httpToken: string = gitRepo['http-token'];
        const clonePath = path.join(this.dataPath, userKey);
        const gitDirPath = path.join(this.dataPath, 'gitdir', userKey, '.git');

        // Check if the repo has already been cloned
        const alreadyCloned = fs.existsSync(path.join(gitDirPath, 'config'));

        const doClone = async () => {
          if (!alreadyCloned) {
            const typedClone = (git.clone as unknown as (opts: any) => Promise<void>);
            await typedClone({
              fs,
              http,
              dir: clonePath,
              gitdir: gitDirPath,
              url: this.buildAuthUrl(repoUrl, httpToken),
              singleBranch: true,
              depth: 1,
            });
            this.logger.log(`Done cloning ${repoUrl}`);
          } else {
            this.logger.log(`Repo already exists at ${clonePath}, skipping clone.`);
          }

          // Always start auto-sync whether cloned now or already present
          const autoSyncInstance = new PeriodicHandler(clonePath);
          const syncInterval = this.normalizeSyncInterval(gitRepo["sync-interval"]);
          autoSyncInstance.schedulePeriodicSync(syncInterval);
          this.logger.log(`Scheduled auto-sync for ${repoUrl} every ${syncInterval} seconds.`);
        };
        clonePromises.push(doClone());

      });
    });
    await Promise.all(clonePromises);
  }

  private buildAuthUrl(repoUrl: string, httpToken?: string): string {
    return httpToken ? `https://${httpToken}@${repoUrl.replace('https://', '')}` : repoUrl;
  }

  init(): Promise<void> { return this.cloneRepositories(); }
  getMode(): CONFIG_MODE { return CONFIG_MODE.GIT; }
  listDirectory(path: string): Promise<Project> { return this.localFilesService.listDirectory(path); }
  readFile(path: string): Promise<Project> { return this.localFilesService.readFile(path); }
  isValidUserKey(key: string): boolean { return /^[A-Za-z0-9_-]+$/.test(key); }
  private normalizeSyncInterval(value: unknown, fallback: number = 60): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  }

}


export interface ICheckCommitHandler { checkOrCommit(): Promise<boolean>; }
export interface IPushHandler { push(): Promise<boolean>; }
export interface IPullHandler { pull(): Promise<boolean>; }
export interface IPeriodicHandler { schedulePeriodicSync(intervalSeconds: number): void; }

class PeriodicHandler implements IPeriodicHandler {
  private readonly logger: ConsoleLogger;
  private repoPath: string | null = null;
  private pullHandler: IPullHandler;
  private pushHandler: IPushHandler;
  private checkCommitHandler: ICheckCommitHandler;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.logger = new ConsoleLogger();
    this.pullHandler = new PullHandler(repoPath);
    this.pushHandler = new PushHandler(repoPath);
    this.checkCommitHandler = new CheckCommitHandler(repoPath);
  }

  private async callPull(): Promise<boolean> {
    this.logger.LogMsg('calling pull...');

    return await this.pullHandler.pull();
  }

  private async callPush(): Promise<boolean> {
    return await this.pushHandler.push();
  }

  private async callCheckCommit(): Promise<boolean> {
    return await this.checkCommitHandler.checkOrCommit();
  }

  public schedulePeriodicSync(intervalSeconds: number): void {
    if (!this.repoPath) {
      this.logger.ErrorMsg('No repository path set for PeriodicHandler.');
      return;
    }

    this.logger.LogMsg(`Scheduling periodic sync for repository updates every ${intervalSeconds} seconds.`);

    let isSyncing = false;

    const syncCycle = async () => {
      if (isSyncing) {
        this.logger.ErrorMsg('Sync already in progress. Skipping this cycle.');
        return;
      }

      isSyncing = true;
      this.logger.LogMsg('- - - - - Starting periodic sync cycle - - - - -');

      try {
        const pulled = await this.callPull();

        if (pulled) {
          const committed = await this.callCheckCommit();

          if (committed) {
            await this.callPush();
          }
        } else {
          this.logger.ErrorMsg('Pull failed. Skipping this commit and push cycle.');
        }
      } catch (error) {
        this.logger.ErrorMsg(`Unexpected error during sync cycle: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        isSyncing = false;
        this.logger.LogMsg('- - - - - Periodic sync cycle completed - - - - -');
      }
    };

    setInterval(syncCycle, intervalSeconds * 1000);
  }
}


class PullHandler implements IPullHandler {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;
  constructor(repoPath_: string) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
  }
  public async pull(): Promise<boolean> {
    this.logger.LogMsg('Pulling latest changes...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In PullHandler instance: No repository path set.');
      return false;
    }
    try {
      const result = await git.pull({
        fs,
        http,
        dir: this.repoPath,
        singleBranch: true,
        author: {
          name: 'AutoSync',
          email: ' ',
        },
        fastForward: true,
      });
      this.logger.LogMsg(`Pull result: ${JSON.stringify(result, null, 2)}`);
      return true; // on successful pull
    } catch (error) {
      if (error instanceof git.Errors.MergeConflictError) { this.logger.ErrorMsg('Merge conflict detected during pull. Please resolve conflicts manually.'); }
      else { this.logger.ErrorMsg(`Error pulling changes: ${error instanceof Error ? error.message : String(error)}`); }
      return false;
    }
  }
}
class PushHandler implements IPushHandler {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;
  private readonly httpToken?: string;
  constructor(repoPath_: string, httpToken?: string) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
    this.httpToken = httpToken;
  }

  public async push(): Promise<boolean> {
    this.logger.LogMsg('Pushing changes to remote...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In PushHandler instance: No repository path set.');
      return false;
    }

    try {
      //const status = this.runCommand.runCommand('git status --porcelain', this.repoPath);
      const result = await git.push({
        fs,
        http,
        dir: this.repoPath,
        remote: 'origin',
        ref: 'main', // or 'master' depending on your branch name
        url: `https://${this.httpToken}@gitlab.com/your-org/repo.git`,
      });

      this.logger.LogMsg(`Push result: ${JSON.stringify(result, null, 2)}`);
      return true;
    } catch (error) {
      this.logger.ErrorMsg(`Push failed: ${error.message}`);
      return false;
    }
  }
}

class CheckCommitHandler implements ICheckCommitHandler {
  private repoPath: string | null;
  private readonly logger: ConsoleLogger;
  private readonly fs: typeof fs;
  private readonly git: typeof git;
  private readonly ignoreFactory: () => ReturnType<typeof ignore>;

  constructor(
    repoPath_: string,
    deps?: {
      fs?: typeof fs;
      git?: typeof git;
      ignoreFactory?: () => ReturnType<typeof ignore>;
    }
  ) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
    this.fs = deps?.fs ?? fs;
    this.git = deps?.git ?? git;
    this.ignoreFactory = deps?.ignoreFactory ?? ignore;
  }

  public async checkOrCommit(): Promise<boolean> {
    this.logger.LogMsg('Checking for changes...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In CheckCommitHandler instance: No repository path set.');
      return false;
    }

    try {
      const ig = this.ignoreFactory();
      const gitignorePath = path.join(this.repoPath, '.gitignore');

      if (this.fs.existsSync(gitignorePath)) {
        const content = this.fs.readFileSync(gitignorePath, 'utf8');
        ig.add(content);
      }

      const statusMatrix = await this.git.statusMatrix({ fs: this.fs, dir: this.repoPath });
      const changedFiles = statusMatrix
        .filter(([, head, workdir, stage]) => head !== workdir || head !== stage)
        .filter(([filepath]) => !ig.ignores(filepath))
        .map(([filepath]) => filepath);

      if (changedFiles.length === 0) {
        this.logger.LogMsg('No changes detected. Skipping commit.');
        return true;
      }

      this.logger.LogMsg(`Changes detected in ${changedFiles.length} file(s).`);

      for (const filepath of changedFiles) {
        await this.git.add({ fs: this.fs, dir: this.repoPath, filepath });
      }

      const timestamp = new Date().toISOString();
      await this.git.commit({
        fs: this.fs,
        dir: this.repoPath,
        message: `Auto commit at ${timestamp}`,
        author: {
          name: 'AutoSync',
          email: 'autosync@example.com',
        },
      });

      this.logger.LogMsg(`Committed ${changedFiles.length} file(s) at ${timestamp}`);
      return true;
    } catch (error) {
      this.logger.ErrorMsg('Failed to retrieve git status. Command returned null.');
      return false;
    }
  }
}




export { CheckCommitHandler, PullHandler, PushHandler, PeriodicHandler };


