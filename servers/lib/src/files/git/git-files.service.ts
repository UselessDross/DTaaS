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


class RunCommand {
  private readonly logger: ConsoleLogger;
  constructor() {
    this.logger = new ConsoleLogger();
  }
  public runCommand(command: string, cwd: string): string | null {
    this.logger.LogMsg(`Running command: "${command}" in directory: ${cwd}`);
    try {
      const output = cp.execSync(command, { cwd, stdio: 'pipe' });
      const outStr = output.toString().trim();
      this.logger.LogMsg(`Command output: ${outStr}`);
      return outStr;
    } catch (error) {
      this.logger.ErrorMsg(`Error running command: "${command}" in ${cwd}`);
      this.logger.ErrorMsg(error instanceof Error ? error.message : String(error));
      return null;
    }
  }
}


class AutoSync {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.repoPath = path.join(__dirname, '../../../../../');

    this.logger = new ConsoleLogger();
    this.logger.LogMsg('AutoSync initialized.');
  }
  /**
   * Set the repository path to be auto-synced.
   * @param repoPath The absolute path to the repository.
   */
  public setRepository(repoPath: string): void {
    this.repoPath = repoPath;
    this.logger.LogMsg(`Repository path set to: ${repoPath}`);
  }

  public GetCurrentRepository(): string { return this.repoPath; }

  private runCommand(command: string, cwd: string): string | null {
    this.logger.LogMsg(`Running command: "${command}" in directory: ${cwd}`);
    try {
      const output = cp.execSync(command, { cwd, stdio: 'pipe' });
      const outStr = output.toString().trim();
      this.logger.LogMsg(`Command output: ${outStr}`);
      return outStr;
    } catch (error) {
      this.logger.ErrorMsg(`Error running command: "${command}" in ${cwd}`);
      this.logger.ErrorMsg(error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  private async autoSync(): Promise<void> {
    if (!this.repoPath) {
      this.logger.ErrorMsg('No repository set. Use setRepository() first.');
      return;
    }

    this.logger.LogMsg(`Starting auto sync process for repository at: ${this.repoPath}`);
    try {
      this.runCommand('git remote -v', this.repoPath);
      this.runCommand('git branch --set-upstream-to=origin/main main', this.repoPath);
    } catch (err) {
      console.log('Error setting upstream:', err.message);
    }

    // 1. Pull from remote
    this.logger.LogMsg('Pulling latest changes...');
    const pullResult = this.runCommand('git pull', this.repoPath);
    if (pullResult === null) return;

    // 2. Check if local changes exist
    this.logger.LogMsg('Checking for changes...');
    const status = this.runCommand('git status --porcelain', this.repoPath);
    if (!status) {
      this.logger.LogMsg('No local changes to commit.');
      return;
    }

    // 3. Commit & push
    this.logger.LogMsg('Adding changes...');
    this.runCommand('git add .', this.repoPath);

    const timestamp = new Date().toISOString();
    this.logger.LogMsg(`Committing changes with message: "Auto commit at ${timestamp}"`);
    this.runCommand(`git commit -m "Auto commit at ${timestamp}"`, this.repoPath);

    this.logger.LogMsg('Pushing changes...');
    this.runCommand('git push', this.repoPath);

    this.logger.LogMsg('Auto sync completed successfully.');
  }
  public async syncRepository(): Promise<void> { await this.autoSync(); }

  public scheduleAutoSync(intervalSeconds: number): void {
    if (!this.repoPath) {
      this.logger.ErrorMsg('No repository set. Use setRepository() first.');
      return;
    }

    this.logger.LogMsg(`Scheduling auto sync every ${intervalSeconds} seconds.`);
    setInterval(async () => {
      await this.autoSync();
    }, intervalSeconds * 1000);
  }


}

export { AutoSync, RunCommand };



//==========================================================
//==========================================================
//==========================================================

