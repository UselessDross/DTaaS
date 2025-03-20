// src/util/autoSync.ts

import * as cp from 'child_process'; // Import entire child_process as cp
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ConsoleLogger } from './logger.js';

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

export { AutoSync };
