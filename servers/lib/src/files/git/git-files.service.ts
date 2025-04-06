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
import * as cp from 'child_process';
import { fileURLToPath } from 'url';
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
        const typedClone = (git.clone as unknown as (opts: any) => Promise<void>);
        const clonePromise = typedClone({
          fs,
          http,
          dir: path.join(this.dataPath, userKey),
          gitdir: path.join(this.dataPath, 'gitdir', userKey, '.git'),
          url: this.buildAuthUrl(repoUrl, httpToken),
          singleBranch: true,
          depth: 1,
        }).then(() => this.logger.log(`Done cloning ${repoUrl}`));
        clonePromises.push(clonePromise);
      });
    });
    await Promise.all(clonePromises);
  }

  private buildAuthUrl(repoUrl: string, httpToken?: string): string { return httpToken ? `https://${httpToken}@${repoUrl.replace('https://', '')}` : repoUrl; }
  init(): Promise<void> { return this.cloneRepositories(); }
  getMode(): CONFIG_MODE { return CONFIG_MODE.GIT; }
  listDirectory(path: string): Promise<Project> { return this.localFilesService.listDirectory(path); }
  readFile(path: string): Promise<Project> { return this.localFilesService.readFile(path); }
  isValidUserKey(key: string): boolean { return /^[A-Za-z0-9_-]+$/.test(key); }
}
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// NOTE: The auto-sync functionality is integrated in this file (see below) and is not using the separate autoSync.ts module.
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =





//==========================================================
//==========================================================
//==========================================================
function findGitRoot(dir: string): string {
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Git root not found');
}

class CommandExecutor {
  constructor(private logger: ConsoleLogger) { }

  run(command: string, cwd: string): string | null {
    try {
      const output = cp.execSync(command, { cwd, stdio: 'pipe' });
      return output.toString().trim();
    } catch (error) {
      this.logger.ErrorMsg(
        `Error executing "${command}" in ${cwd}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}

class UpstreamHandler {
  constructor(private executor: CommandExecutor, private logger: ConsoleLogger) { }

  setUpstream(cwd: string): void {
    const branch = this.executor.run('git rev-parse --abbrev-ref HEAD', cwd);
    if (branch && branch !== 'HEAD') {
      this.executor.run(`git branch --set-upstream-to=origin/${branch} ${branch}`, cwd);
    } else {
      this.logger.WarningMsg('Unable to determine current branch; skipping upstream setup.');
    }
  }
}

class RepositoryPullerHandler {
  constructor(private executor: CommandExecutor, private logger: ConsoleLogger) { }

  pull(cwd: string): boolean {
    const result = this.executor.run('git pull', cwd);
    if (result === null) {
      this.logger.WarningMsg(`Failed to pull updates in ${cwd}`);
      return false;
    }
    return true;
  }
}

class RepositoryPusherHandler {
  constructor(private executor: CommandExecutor, private logger: ConsoleLogger) { }

  push(cwd: string): void {
    const result = this.executor.run('git push', cwd);
    if (result === null) {
      this.logger.WarningMsg(`Failed to push updates in ${cwd}`);
    }
  }
}

class RepositoryCommitterHandler {
  constructor(private executor: CommandExecutor, private logger: ConsoleLogger) { }

  hasChanges(cwd: string): boolean {
    return Boolean(this.executor.run('git status --porcelain', cwd));
  }

  commit(cwd: string, message?: string): void {
    if (!this.hasChanges(cwd)) {
      this.logger.ErrorMsg('No local changes to commit.');
      return;
    }
    this.executor.run('git add .', cwd);
    const timestamp = new Date().toISOString();
    const commitMessage = message || `🤖Auto commit🤖 at ${timestamp}`;
    const result = this.executor.run(`git commit -m "${commitMessage}"`, cwd);
    if (result === null) {
      this.logger.WarningMsg(`Commit failed in ${cwd}`);
    }
  }
}

class PeriodicSyncManager {
  private puller: RepositoryPullerHandler;
  private committer: RepositoryCommitterHandler;
  private pusher: RepositoryPusherHandler;
  private upstreamManager: UpstreamHandler;

  constructor(private _executor: CommandExecutor, private intervalSeconds: number, private logger: ConsoleLogger) {
    this.puller = new RepositoryPullerHandler(this._executor, logger);
    this.committer = new RepositoryCommitterHandler(this._executor, logger);
    this.pusher = new RepositoryPusherHandler(this._executor, logger);
    this.upstreamManager = new UpstreamHandler(this._executor, logger);
  }

  private checkAccess(cwd: string, mode: number, errorMsg: string): boolean {
    try {
      fs.accessSync(cwd, mode);
      return true;
    } catch (error) {
      this.logger.ErrorMsg(`${errorMsg}: ${cwd}`);
      return false;
    }
  }

  private syncOnce(cwd: string): void {
    this.logger.LogMsg(`Syncing repository at: ${cwd}`);

    if (!this.checkAccess(cwd, fs.constants.W_OK, 'No write access for directory')) {
      this.logger.WarningMsg(`Skipping sync for ${cwd} due to write permission issues.`);
      return;
    }
    if (!this.checkAccess(cwd, fs.constants.R_OK, 'No read access for directory')) {
      this.logger.WarningMsg(`Skipping sync for ${cwd} due to read permission issues.`);
      return;
    }

    this.upstreamManager.setUpstream(cwd);

    if (!this.puller.pull(cwd)) {
      return;
    }

    if (this.committer.hasChanges(cwd)) {
      this.committer.commit(cwd);
      this.pusher.push(cwd);
    } else {
      this.logger.LogMsg('No local changes detected.');
    }
  }

  scheduleSync(cwd: string): void {
    this.syncOnce(cwd);
    setInterval(() => {
      this.syncOnce(cwd);
    }, this.intervalSeconds * 1000);
  }
}

@Injectable()
export class AutoSyncService {
  private repoPaths: string[] = [];
  private readonly logger: ConsoleLogger;
  private readonly executor: CommandExecutor;
  private readonly periodicSyncManager: PeriodicSyncManager;

  constructor(private readonly loggerDep: ConsoleLogger) {
    // Get current file details to identify the default Git repository root.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const defaultRepo = findGitRoot(__dirname);
    this.repoPaths.push(defaultRepo);

    this.logger = this.loggerDep;
    this.executor = new CommandExecutor(this.logger);
    // Set the sync interval to 30 seconds, adjust as needed.
    this.periodicSyncManager = new PeriodicSyncManager(this.executor, 30, this.logger);
    this.logger.LogMsg(`AutoSyncService initialized. Default repo: ${defaultRepo}`);
  }

  start(): void {
    for (const repoPath of this.repoPaths) {
      this.periodicSyncManager.scheduleSync(repoPath);
    }
  }

  addRepository(repoPath: string): void {
    this.repoPaths.push(repoPath);
  }
}


//==========================================================
//==========================================================
//==========================================================

