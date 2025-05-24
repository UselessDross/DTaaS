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

  private buildAuthUrl(repoUrl: string, httpToken?: string): string { return httpToken ? `https://${httpToken}@${repoUrl.replace('https://', '')}` : repoUrl; }
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
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =
// NOTE: The auto-sync functionality is integrated in this file (see below) and is not using the separate autoSync.ts module.
// -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =  -  =





//==========================================================
//==========================================================
//==========================================================

export interface IRunCommand { runCommand(command: string, cwd: string): string | null; }
export interface ICheckCommitHandler { checkOrCommit(): boolean; }
export interface IPushHandler { push(): boolean; }
export interface IPullHandler { pull(): boolean; }
export interface IPeriodicHandler { schedulePeriodicSync(intervalSeconds: number): void; }

class PeriodicHandler implements IPeriodicHandler {
  private readonly logger: ConsoleLogger;
  private repoPath: string | null = null;
  private pullHandler: IPullHandler;
  private pushHandler: IPushHandler;
  private checkCommitHandler: ICheckCommitHandler;

  constructor(repoPath: string, runCommand?: IRunCommand) {
    this.repoPath = repoPath;
    this.logger = new ConsoleLogger();
    this.pullHandler = new PullHandler(repoPath, runCommand);
    this.pushHandler = new PushHandler(repoPath, runCommand);
    this.checkCommitHandler = new CheckCommitHandler(repoPath, runCommand);
  }

  private callPull(): boolean { return this.pullHandler.pull(); }
  private callPush(): boolean { return this.pushHandler.push(); }
  private callCheckCommit(): boolean { return this.checkCommitHandler.checkOrCommit(); }

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
        const pulled = this.callPull();
        if (pulled) {
          const changesCommitted = this.callCheckCommit();
          if (changesCommitted) { this.callPush(); }
        } else {
          this.logger.ErrorMsg('Pull failed. Skipping this commit and push cycle.');
        }
      } finally {
        isSyncing = false;
        this.logger.LogMsg('- - - - - Periodic sync cycle completed - - - - -');
      }
    };

    setInterval(syncCycle, intervalSeconds * 1000);
  }
}
class RunCommand implements IRunCommand {
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
class PullHandler implements IPullHandler {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;
  private runCommand: IRunCommand;

  constructor(repoPath_: string, runCommand_?: IRunCommand) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
    this.runCommand = runCommand_ || new RunCommand();
  }

  public pull(): boolean {
    this.logger.LogMsg('Pulling latest changes...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In PullHandler instance: No repository path set.');
      return false;
    }

    // Log status before pulling, but do NOT abort
    const status = this.runCommand.runCommand('git status --porcelain', this.repoPath);
    if (status === null) {
      this.logger.ErrorMsg('Failed to retrieve git status. Command returned null.');
      return false;
    }
    this.logger.LogMsg(`Git status output (before pull): ${status}`);

    const pullResult = this.runCommand.runCommand('git pull', this.repoPath);
    if (pullResult === null) {
      this.logger.ErrorMsg('git pull failed. Check for merge conflicts.');
      return false;
    }

    this.logger.LogMsg('Successfully pulled latest changes.');
    return true;
  }

}
class PushHandler implements IPushHandler {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;
  private runCommand: IRunCommand;

  constructor(repoPath_: string, runCommand_?: IRunCommand) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
    this.runCommand = runCommand_ || new RunCommand();
  }

  public push(): boolean {
    this.logger.LogMsg('Pushing changes to remote...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In PushHandler instance: No repository path set.');
      return false;
    }
    const status = this.runCommand.runCommand('git status --porcelain', this.repoPath);
    if (status === null) {
      this.logger.ErrorMsg('Failed to retrieve git status. Command returned null.');
      return false;
    }
    if (typeof status !== 'string') {
      this.logger.ErrorMsg('Unexpected git status output format.');
      return false;
    }
    if (status.trim() === "") {
      this.logger.LogMsg('No local changes detected. Nothing to push.');
      return true;
    }
    if (!/^[ MADRCU?!]+/.test(status.trim())) {
      this.logger.ErrorMsg('Unexpected git status output format.');
      return false;
    }
    return this.runCommand.runCommand('git push', this.repoPath) !== null;
  }
}
class CheckCommitHandler implements ICheckCommitHandler {
  private repoPath: string | null = null;
  private readonly logger: ConsoleLogger;
  private runCommand: IRunCommand;

  constructor(repoPath_: string, runCommand_?: IRunCommand) {
    this.repoPath = repoPath_;
    this.logger = new ConsoleLogger();
    this.runCommand = runCommand_ || new RunCommand();
  }

  public checkOrCommit(): boolean {
    const timestamp = new Date().toISOString();
    this.logger.LogMsg('Checking for changes...');
    if (!this.repoPath) {
      this.logger.ErrorMsg('In CheckCommitHandler instance: No repository path set.');
      return false;
    }
    const status = this.runCommand.runCommand('git status --porcelain', this.repoPath);
    if (status === null) {
      this.logger.ErrorMsg('Failed to retrieve git status. Command returned null.');
      return false;
    }
    if (typeof status !== 'string' || !/^[ MADRCU?!]+/.test(status.trim())) {
      this.logger.ErrorMsg('Unexpected git status output format.');
      return false;
    }
    if (!status) {
      this.logger.LogMsg('No local changes detected. Nothing to commit.');
      return true;
    } else {
      this.logger.LogMsg('Local changes detected. Proceeding to commit.');
      this.runCommand.runCommand('git add .', this.repoPath);

      // Check if anything was actually staged
      const diffIndex = this.runCommand.runCommand('git diff --cached --exit-code', this.repoPath);
      if (diffIndex === '') {
        this.logger.LogMsg('No staged changes detected. Skipping commit.');
        return false;
      }

      this.logger.LogMsg(`Committing changes with message: "Auto commit at ${timestamp}"`);
      this.runCommand.runCommand(`git commit -m "Auto commit at ${timestamp}"`, this.repoPath);

      this.logger.LogMsg('Ready to push changes...');
      return true;
    }
  }
}


/*
    this.runCommand('git add -u', this.repoPath);

    // 2. Check if local changes exist


    // 3. Commit & push
    this.logger.LogMsg('Adding changes...');
    this.runCommand('git add .', this.repoPath);

    const timestamp = new Date().toISOString();
    this.logger.LogMsg(`Committing changes with message: "Auto commit at ${timestamp}"`);
    this.runCommand(`git commit -m "Auto commit at ${timestamp}"`, this.repoPath);





─ ━ │ ┃ ┄ ┅ ┆ ┇ ┈ ┉ ┊ ┋ ┌ ┍ ┎ ┏ ┐ ┑ ┒ ┓ └ ┕ ┖ ┗ ┘ ┙ ┚ ┛ 
├ ┝ ┞ ┟ ┠ ┡ ┢ ┣ ┤ ┥ ┦ ┧ ┨ ┩ ┪ ┫ ┬ ┭ ┮ ┯ ┰ ┱ ┲ ┳ ┴ ┵ ┶ ┷ -_
┸ ┹ ┺ ┻ ┼ ┽ ┾ ┿ ╀ ╁ ╂ ╃ ╄ ╅ ╆ ╇ ╈ ╉ ╊ ╋
╴╵╶╷━╸╹━╺━╻╼╽╾╿ 
╟  ╤ ╧ ╟╢ ▔━▁
═₌₌                                        ╤═╤ ┬ ┴
   ║ ╒  ╓ ╔ ╕ ╖  ╗ ╘ ╙ ╚ ╛ ╜ ╝ ╞ ┒┏	╟ ─╰─╯

╱ ╲ ╳ ╴ ╵ ╶ ╷ ╸ ╹ ╺ ╻ ╼ ╽ ╾ ╿ ─ ━ ┊ ┋ ┌ ┍ ┎ ┏ ┐ ┑ ┒ ┓ ╭─┬─╮
╔ ╗ ╚ ╝ ╠ ╣ ╦ ╧ ╨ ╤ ╥ ╙ ╘ ╓ ╖ ╒ ╕
╔═╗ ║ ╚═╝ ╠═╣ ╦ ╩ ╠═╣ ╦ ╩ ╠═╣ ╦ ╩
╔═╗ ║ ╚═╝ ╠═╣ ╦ ╩ ╠═╣ ╦ ╩ ╠═╣ ╦ ╩


┏━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━━━┓
┃ <Interface>  ┃  ┃ <Interface>  ┃  ┃ <Interface>   ┃  ┃ <Interface>    ┃
┃ IPullHandler ┃  ┃ IPushHandler ┃  ┃ ICheckHandler ┃  ┃ ICommitHandler ┃
┗━━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━━━━┛
       Δ                 Δ                 Δ                  Δ
       ╵                 ╵                 ╵                  ╵
       ╵                 ╵                 ╵                  ╵
       ╵                 ╵                 ╵                  ╵
┏━━━━━━┷━━━━━━━┓  ┏━━━━━━┷━━━━━━━┓  ┏━━━━━━┷━━━━━━━━┓  ┏━━━━━━┷━━━━━━━━━┓
┃    <Class>   ┃  ┃    <Class>   ┃  ┃    <Class>    ┃  ┃    <Class>     ┃
┃  PullHandler ┃  ┃  PushHandler ┃  ┃  CheckHandler ┃  ┃  CommitHandler ┃
┗━━━━━━┯━━━━━━━┛  ┗━━━━━━┯━━━━━━━┛  ┗━━━━━━┯━━━━━━━━┛  ┗━━━━━━┯━━━━━━━━━┛
       │                 │                 │                  │
       │                 ╰────────┬────────╯                  │
       ╰──────────────────────────┼───────────────────────────╯
                                  │
                                  ↓
                           ┏━━━━━━━━━━━━━┓                 
                           ┃ <Interface> ┃                 
                           ┃ IRunCommand ┃                 
                           ┗━━━━━━━━━━━━━┛                 
                                  Δ
                                  ╵
                                  ╵
                                  ╵
                           ┏━━━━━━┷━━━━━━┓      
                           ┃   <class>   ┃      
                           ┃  RunCommand ┃      
                           ┗━━━━━━━━━━━━━┛      

*/




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
      const result = cp.spawnSync(command, { shell: true, cwd });

      if (result.error) {
        this.logger.ErrorMsg(`Spawn error: ${result.error.message}`);
        return null;
      }

      if (result.stderr && result.stderr.length > 0) {
        this.logger.ErrorMsg(`stderr: ${result.stderr.toString().trim()}`);
      }

      const outStr = result.stdout?.toString().trim() || '';
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

export { AutoSync, RunCommand, CheckCommitHandler, PullHandler, PushHandler, PeriodicHandler };



//==========================================================
//==========================================================
//==========================================================

