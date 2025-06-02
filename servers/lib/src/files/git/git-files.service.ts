import { IFilesService } from '../interfaces/files.service.interface.js';
import { CONFIG_SERVICE } from '../../config/config.interface.js';
import LocalFilesService from '../local/local-files.service.js';
import { CONFIG_MODE } from '../../enums/config-mode.enum.js';
import * as http from 'isomorphic-git/http/node/index.cjs'; // used by isomorphic-git

import { MergeHandler, IMergeHandler } from './MergeHandler.js';

import { GitRepo } from 'src/config/config.model.js';
import { Inject, Injectable } from '@nestjs/common';
import { ConsoleLogger } from '../../util/logger.js';
import Config from '../../config/config.service.js';
import { Project } from 'src/types.js';
import * as git from 'isomorphic-git';
import fs2 from 'fs/promises';
import * as path from 'path';
import ignore from 'ignore';
import * as fs from 'fs';


@Injectable()
export default class GitFilesService implements IFilesService {
  private readonly dataPath: string;
  private readonly logger = new ConsoleLogger(GitFilesService.name);
  @Inject(LocalFilesService) private localFilesService!: LocalFilesService;
  constructor(@Inject(CONFIG_SERVICE) private configService: Config) { this.dataPath = this.configService.getLocalPath(); }
  private async cloneRepositories(): Promise<void> {
    const userRepoConfigs: { [key: string]: GitRepo }[] = this.configService.getGitRepos();
    const clonePromises: Promise<void>[] = [];

    for (const configObj of userRepoConfigs) {
      for (const userKey of Object.keys(configObj)) {
        if (!this.isValidUserKey(userKey)) { throw new Error(`Invalid userKey: ${userKey}`); }
        const gitRepo: GitRepo = configObj[userKey];
        const repoUrl = gitRepo['repo-url'];
        const httpToken = gitRepo['http-token'];
        const clonePath = path.join(this.dataPath, userKey);
        const authUrl = this.buildAuthUrl(repoUrl, httpToken); // <-- replaced with SSH handling
        // const authUrl = this.isSSH(repoUrl) ? repoUrl : this.buildAuthUrl(repoUrl, httpToken);


        const gitDir = path.join(clonePath, '.git');
        const alreadyCloned = fs.existsSync(gitDir);

        if (alreadyCloned) {
          const actualRemote = await this.getActualRemoteUrl(clonePath);
          if (!actualRemote) throw new Error(`Missing origin remote in ${gitDir}`);
          if (actualRemote !== repoUrl) {
            this.logger.error(`Incompatible Git repo detected for userKey "${userKey}"\n` + `Config repo-url: ${repoUrl}\nActual origin:   ${actualRemote}`);
            throw new Error('Git repository mismatch – aborting.');
          }
          this.logger.log(`✓ Repo for "${userKey}" matches config`);
        }

        const doClone = async () => {
          if (!alreadyCloned) {
            await git.clone({
              fs,
              http,
              dir: clonePath,
              url: authUrl,
              singleBranch: true,
              depth: 1,
            });
            this.logger.LogMsg(`Cloned ${repoUrl} into ${clonePath}`);
          } else { this.logger.LogMsg(`Repo already exists at ${clonePath}; skipping clone.`); }
          const autoSync = new PeriodicHandler(clonePath, authUrl);
          const syncInterval = this.normalizeSyncInterval(gitRepo['sync-interval']);
          autoSync.schedulePeriodicSync(syncInterval);
          this.logger.LogMsg(`Scheduled auto-sync for ${userKey} every ${syncInterval} seconds.`);
        };
        clonePromises.push(doClone());

      }
    }
    await Promise.all(clonePromises);
  }

  private buildAuthUrl(repoUrl: string, httpToken?: string): string { return httpToken ? `https://${httpToken}@${repoUrl.replace(/^https?:\/\//, '')}` : repoUrl; }

  listDirectory(p: string): Promise<Project> { return this.localFilesService.listDirectory(p); }
  readFile(p: string): Promise<Project> { return this.localFilesService.readFile(p); }
  init(): Promise<void> { return this.cloneRepositories(); }
  getMode(): CONFIG_MODE { return CONFIG_MODE.GIT; }

  private isValidUserKey(key: string): boolean { return /^[A-Za-z0-9_-]+$/.test(key); }
  private normalizeSyncInterval(value: unknown, fallback = 60): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  }

  private async getActualRemoteUrl(repoPath: string): Promise<string | null> {
    const remotes = await git.listRemotes({ fs, dir: repoPath });
    const origin = remotes.find(r => r.remote === 'origin');
    return origin?.url ?? null;
  }

}





export interface ICheckCommitHandler { checkOrCommit(): Promise<boolean>; }
export interface IPeriodicHandler { schedulePeriodicSync(intervalSeconds: number): void; }
export interface IPullHandler { pull(): Promise<boolean>; }
export interface IPushHandler { push(): Promise<boolean>; }

class PeriodicHandler implements IPeriodicHandler {
  private readonly logger = new ConsoleLogger(PeriodicHandler.name);
  private readonly repoPath: string;
  private readonly pullHandler: IPullHandler;
  private readonly pushHandler: IPushHandler;
  private readonly checkCommitHandler: ICheckCommitHandler;

  constructor(repoPath: string, authUrl: string) {
    this.repoPath = repoPath;
    this.pullHandler = new PullHandler(repoPath, authUrl);
    this.pushHandler = new PushHandler(repoPath, authUrl);
    this.checkCommitHandler = new CheckCommitHandler(repoPath);
  }

  private async callPull(): Promise<boolean> {
    this.logger.LogMsg('╸calling pull…');
    return this.pullHandler.pull();
  }

  private async callCheckCommit(): Promise<boolean> {
    this.logger.LogMsg('╸calling checkOrCommit…');
    return this.checkCommitHandler.checkOrCommit();
  }

  private async callPush(): Promise<boolean> {
    this.logger.LogMsg('╸calling push…');
    return this.pushHandler.push();
  }

  public schedulePeriodicSync(intervalSeconds: number): void {
    let isSyncing = false;
    this.logger.LogMsg(`Scheduling periodic sync every ${intervalSeconds}s for ${this.repoPath}`);

    const syncCycle = async () => {
      if (isSyncing) {
        this.logger.ErrorMsg('Sync already in progress; skipping this cycle.');
        return;
      }
      isSyncing = true;
      this.logger.LogMsg('--- Starting periodic sync cycle ---');

      try {
        const pulled = await this.callPull();
        if (!pulled) {
          this.logger.ErrorMsg('Pull failed; skipping commit and push.');
          return;
        }

        const committed = await this.callCheckCommit();
        if (!committed) {
          this.logger.ErrorMsg('Check/Commit failed; skipping push.');
          return;
        }
        this.logger.LogMsg('Check/Commit step completed.');

        await this.callPush();
        this.logger.LogMsg('Push step completed.');
      } catch (err: any) {
        this.logger.ErrorMsg(`Unexpected error in sync cycle: ${err.message}`);
      } finally {
        isSyncing = false;
        this.logger.LogMsg('--- Periodic sync cycle completed ---');
      }
    };

    setInterval(syncCycle, intervalSeconds * 1000);
  }
}

class PullHandler implements IPullHandler {
  private readonly repoPath: string;
  private readonly authUrl: string;
  private readonly mergeService: IMergeHandler; // added for merge support
  private readonly logger = new ConsoleLogger(PullHandler.name);

  constructor(repoPath: string, authUrl: string, mergeService: IMergeHandler = new MergeHandler()) {
    this.mergeService = mergeService; // added for merge support
    this.repoPath = repoPath;
    this.authUrl = authUrl;
  }

  public async pull(): Promise<boolean> {
    this.logger.LogMsg('Pulling latest changes…');
    try {
      const success = await this.mergeService.fetchAndMerge(this.repoPath, this.authUrl);

      if (success) {
        this.logger.LogMsg('Pull (fetch+merge) succeeded.');
        return true;
      } else {
        this.logger.ErrorMsg('Pull (fetch+merge) failed.');
        return false;
      }
    } catch (err: any) {
      this.logger.ErrorMsg(`Error pulling changes: ${err.message}`);
      return false;
    }
  }
}

class PushHandler implements IPushHandler {
  private readonly repoPath: string;
  private readonly authUrl: string;
  private readonly logger = new ConsoleLogger(PushHandler.name);

  constructor(repoPath: string, authUrl: string) {
    this.repoPath = repoPath;
    this.authUrl = authUrl;
  }

  public async push(): Promise<boolean> {
    // 1. If no token was embedded, authUrl === repoUrl
    const plainUrl = this.authUrl.replace(/^https?:\/\/[^@]+@/, 'https://');
    if (plainUrl === this.authUrl) {
      // No token detected → public repo
      this.logger.LogMsg('No HTTP token provided; skipping push for public repo.');
      return true;
    }

    this.logger.LogMsg('Pushing changes to remote…');
    try {
      // 2. Read HEAD to find the current branch
      const headRaw = (await fs2.readFile(path.join(this.repoPath, '.git', 'HEAD'), 'utf8')).trim();
      const m = headRaw.match(/^ref:\srefs\/heads\/(.+)$/);
      const currentBranch = m ? m[1] : null;
      if (!currentBranch) {
        this.logger.ErrorMsg('Cannot push: current branch not found.');
        return false;
      }

      // 3. Perform push with token-authenticated URL
      await git.push({
        fs,
        http,
        dir: this.repoPath,
        url: this.authUrl,      // contains token
        remote: undefined,      // skip reading .git/config
        ref: currentBranch,
      });
      this.logger.LogMsg('Push succeeded.');
      return true;
    } catch (err: any) {
      this.logger.ErrorMsg(`Push failed: ${err.message}`);
      return false;
    }
  }
}

class CheckCommitHandler implements ICheckCommitHandler {
  private readonly repoPath: string;
  private readonly logger = new ConsoleLogger(CheckCommitHandler.name);
  private readonly fs: typeof fs = fs;
  private readonly git: typeof git = git;
  private readonly createIgnore: () => { add: (rule: string) => void; ignores: (p: string) => boolean };

  constructor(
    repoPath: string,
    deps?: {
      fs?: typeof fs;
      git?: typeof git;
      ignoreFactory?: () => { add: (rule: string) => void; ignores: (p: string) => boolean };
    }
  ) {
    this.repoPath = repoPath;
    this.fs = deps?.fs ?? fs;
    this.git = deps?.git ?? git;
    this.createIgnore = deps?.ignoreFactory
      ? deps.ignoreFactory
      : (() => ignore() as any);
  }

  public async checkOrCommit(): Promise<boolean> {
    this.logger.LogMsg('Checking for local changes…');
    try {
      // 1) Load .gitignore rules
      const ig = this.createIgnore();
      const gi = path.join(this.repoPath, '.gitignore');
      if (this.fs.existsSync(gi)) {
        ig.add(this.fs.readFileSync(gi, 'utf8'));
      }

      // 2) Get statusMatrix: array of [filepath, HEAD, workingDir, stage]
      const matrix = await this.git.statusMatrix({ fs: this.fs, dir: this.repoPath });

      // 3) Filter unchanged & ignored
      const changed = matrix
        .filter(([, head, workdir, stage]) => head !== workdir || head !== stage)
        .map(([fp]) => fp)
        .filter((fp) => !ig.ignores(fp));

      if (changed.length === 0) {
        this.logger.LogMsg(' No changes detected; nothing to commit.');
        return true;
      }
      this.logger.LogMsg(` Changes to commit: ${changed.join(', ')}`);

      // 4) Stage each changed file
      for (const fp of changed) {
        this.logger.LogMsg(`• git.add ${fp}`);
        await this.git.add({ fs: this.fs, dir: this.repoPath, filepath: fp });
      }

      // 5) Read HEAD to determine branch or initial commit
      let headRaw: string;
      try {
        headRaw = (await fs2.readFile(path.join(this.repoPath, '.git', 'HEAD'), 'utf8')).trim();
      } catch {
        // No HEAD file → initial commit
        headRaw = '';
      }

      // 6) Determine or create branch
      let branchName: string;
      if (headRaw.startsWith('ref: ')) {
        const m = headRaw.match(/^ref:\srefs\/heads\/(.+)$/);
        branchName = m ? m[1] : 'master';
      } else if (headRaw === '') {
        branchName = 'master';
        this.logger.LogMsg(`• No HEAD file; creating initial branch "${branchName}"`);
      } else {
        // Detached HEAD → create “master” and check it out
        branchName = 'master';
        this.logger.LogMsg(`• Detached HEAD at ${headRaw}; creating branch "${branchName}"`);
        await this.git.branch({
          fs: this.fs,
          dir: this.repoPath,
          ref: branchName,
          checkout: true,
        });
      }

      // 7) Commit (use `initial` flag if headRaw == '')
      const message = `Auto commit at ${new Date().toISOString()}`;
      const commitArgs: any = {
        fs: this.fs,
        dir: this.repoPath,
        message,
        author: { name: 'AutoSync', email: 'autosync@example.com' },
      };
      if (headRaw === '') {
        commitArgs.initial = true;
        commitArgs.ref = branchName;
      }
      this.logger.LogMsg(`• git.commit — message: "${message}" on branch "${branchName}"`);
      await (this.git.commit as any)(commitArgs);

      this.logger.LogMsg(`Committed ${changed.length} file(s).`);
      return true;
    } catch (err: any) {
      this.logger.ErrorMsg(`checkOrCommit failed: ${err.message}`);
      return false;
    }
  }
}

export { CheckCommitHandler, PullHandler, PushHandler, PeriodicHandler };
