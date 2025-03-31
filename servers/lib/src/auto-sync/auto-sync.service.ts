// src/util/autoSync.service.ts

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
    private repoPaths: string[] = [];
    private readonly logger: ConsoleLogger;

    constructor(private readonly loggerDep: ConsoleLogger) {
        // For a default value, we can use the Git root of this file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        // Default: assume the current Git repo is the base repository.
        const defaultRepo = findGitRoot(__dirname);
        this.repoPaths.push(defaultRepo);
        this.logger = this.loggerDep;
        this.logger.LogMsg('AutoSyncService initialized with default repository: ' + defaultRepo);
    }

    /**
     * Sets the repository paths based on an array.
     * Typically, you would extract these from your YAML configuration.
     * For each git-repo key (e.g. "user1", "user2", "common"), 
     * the full path is constructed as: <local-path>/<repo-key>.
     */
    public setRepositories(repoPaths: string[]): void {
        this.repoPaths = repoPaths;
        this.logger.LogMsg('Repository paths set to: ' + this.repoPaths.join(', '));
    }

    /**
     * Returns the current repository paths.
     */
    public getRepositoryPaths(): string[] {
        return this.repoPaths;
    }

    /**
     * Executes a command in a given working directory.
     */
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



    /**
     * Performs the pull, commit, and push cycle on a single repository.
     */
    private async autoSyncForRepo(repoPath: string): Promise<void> {
        this.logger.LogMsg(`Starting auto sync for repository at: ${repoPath}`);
        try {
            // Optionally set up the upstream branch if not already configured.
            this.runCommand('git remote -v', repoPath);
            const currentBranch = this.runCommand('git rev-parse --abbrev-ref HEAD', repoPath);
            if (currentBranch && currentBranch !== 'HEAD') {
                this.runCommand(`git branch --set-upstream-to=origin/${currentBranch} ${currentBranch}`, repoPath);
            } else {
                this.logger.WarningMsg('Unable to determine current branch; skipping upstream setup.');
            }
        } catch (err) {
            this.logger.ErrorMsg('Error setting upstream: ' + (err instanceof Error ? err.message : err));
        }

        // Pull latest changes.
        this.logger.LogMsg('Pulling latest changes...');
        const pullResult = this.runCommand('git pull', repoPath);
        if (pullResult === null) return;

        // Check for local changes.
        this.logger.LogMsg('Checking for changes...');
        const status = this.runCommand('git status --porcelain', repoPath);
        if (!status) {
            this.logger.LogMsg('No local changes to commit.');
            return;
        }

        // Commit and push changes.
        this.logger.LogMsg('Adding changes...');
        this.runCommand('git add .', repoPath);

        const timestamp = new Date().toISOString();
        this.logger.LogMsg(`Committing changes with message: "🤖Auto commit🤖 at ${timestamp}"`);
        this.runCommand(`git commit -m "🤖Auto commit🤖 at ${timestamp}"`, repoPath);

        this.logger.LogMsg('Pushing changes...');
        this.runCommand('git push', repoPath);

        this.logger.LogMsg('Auto sync completed successfully for repository at: ' + repoPath);
    }

    /**
     * Iterates over all repository paths and synchronizes each one.
     */
    public async syncAllRepositories(): Promise<void> {
        this.logger.LogMsg('Starting auto sync for all repositories...');
        for (const repoPath of this.repoPaths) {
            await this.autoSyncForRepo(repoPath);
        }
        this.logger.LogMsg('All repositories have been synced.');
    }

    /**
     * Schedules periodic auto sync for all repositories using the provided interval (in seconds).
     */
    public scheduleAutoSync(intervalSeconds: number): void {
        if (this.repoPaths.length === 0) {
            this.logger.ErrorMsg('No repositories set. Use setRepositories() first.');
            return;
        }
        this.logger.LogMsg(`Scheduling auto sync every ${intervalSeconds} seconds.`);
        // Immediately sync all repositories.
        this.syncAllRepositories();
        // Then schedule subsequent syncs.
        setInterval(() => {
            this.syncAllRepositories();
        }, intervalSeconds * 1000);
    }
}
