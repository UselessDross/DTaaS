import { Injectable } from '@nestjs/common';
import { ConsoleLogger } from '../util/logger.js';
import * as cp from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

function findGitRoot(startDir: string): string {
    let current = startDir;
    const root = path.parse(startDir).root;
    while (current !== root && !existsSync(path.join(current, '.git'))) {
        current = path.dirname(current);
    }
    if (existsSync(path.join(current, '.git'))) {
        return current;
    } else {
        throw new Error('Git root not found');
    }
}

@Injectable()
export class AutoSyncService {
    private repoPath: string;

    // Logger is injected via the constructor following NestJS dependency injection.
    constructor(private readonly logger: ConsoleLogger) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.repoPath = findGitRoot(__dirname);
        this.logger.LogMsg('AutoSyncService initialized.');
    }

    // Sets the repository path to be auto-synced.
    public setRepository(repoPath: string): void {
        this.repoPath = repoPath;
        this.logger.LogMsg(`Repository path set to: ${repoPath}`);
    }

    // Returns the current repository path.
    public getCurrentRepository(): string {
        return this.repoPath;
    }

    // Executes a shell command in the specified working directory.
    private runCommand(command: string, cwd: string): string | null {
        this.logger.LogMsg(`Running command: "${command}" in directory: ${cwd}`);
        try {
            const shellOption = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
            const output = cp.execSync(command, { cwd, stdio: 'pipe', shell: shellOption });
            const outStr = output.toString().trim();
            this.logger.LogMsg(`Command output: ${outStr}`);
            return outStr;
        } catch (error) {
            this.logger.ErrorMsg(`Error running command: "${command}" in ${cwd}`);
            this.logger.ErrorMsg(error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    // Runs the actual sync process: pull, check for changes, commit, and push.
    private async autoSync(): Promise<void> {
        if (!this.repoPath) {
            this.logger.ErrorMsg('No repository set. Use setRepository() first.');
            return;
        }
        this.logger.LogMsg(`Starting auto sync process for repository at: ${this.repoPath}`);
        try {
            this.runCommand('git remote -v', this.repoPath);
            // Determine current branch name and set upstream accordingly.
            const currentBranch = this.runCommand('git rev-parse --abbrev-ref HEAD', this.repoPath);
            if (currentBranch && currentBranch !== 'HEAD') {
                this.runCommand(`git branch --set-upstream-to=origin/${currentBranch} ${currentBranch}`, this.repoPath);
            } else {
                this.logger.WarningMsg('Unable to determine current branch; skipping upstream branch setup.');
            }
        } catch (err) {
            this.logger.ErrorMsg('Error setting upstream: ' + (err instanceof Error ? err.message : err));
        }

        this.logger.LogMsg('Pulling latest changes...');
        const pullResult = this.runCommand('git pull', this.repoPath);
        if (pullResult === null) return;

        this.logger.LogMsg('Checking for changes...');
        const status = this.runCommand('git status --porcelain', this.repoPath);
        if (!status) {
            this.logger.LogMsg('No local changes to commit.');
            return;
        }

        this.logger.LogMsg('Adding changes...');
        this.runCommand('git add .', this.repoPath);

        const timestamp = new Date().toISOString();
        this.logger.LogMsg(`Committing changes with message:"🤖Auto commit🤖 at ${timestamp}"`);
        this.runCommand(`git commit -m "🤖Auto commit🤖 at ${timestamp}"`, this.repoPath);

        this.logger.LogMsg('Pushing changes...');
        this.runCommand('git push', this.repoPath);

        this.logger.LogMsg('Auto sync completed successfully.');
    }

    // Public method to trigger auto sync.
    public async syncRepository(): Promise<void> {
        await this.autoSync();
    }

    // Schedules the auto sync process at the given interval (in seconds).
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
