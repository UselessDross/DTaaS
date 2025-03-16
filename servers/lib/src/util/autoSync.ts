import { execSync } from 'child_process';
import Config from '../config/config.service.js';
import { IConfig } from '../config/config.interface.js';
import { GitRepo } from '../config/config.model.js';
import * as path from 'path';
import { ConsoleLogger } from './logger.js';

class AutoSync {
    private readonly dataPath: string;
    private readonly configService: IConfig;
    private readonly logger: ConsoleLogger;

    constructor(configService: IConfig) {
        this.configService = configService;
        this.dataPath = this.configService.getLocalPath();
        this.logger = new ConsoleLogger();
        this.logger.LogMsg(`Data path set to: ${this.dataPath}`);
    }

    private runCommand(command: string, cwd: string): string | null {
        this.logger.LogMsg(`Running command: "${command}" in directory: ${cwd}`);
        try {
            const output = execSync(command, { cwd, stdio: 'pipe' });
            this.logger.LogMsg(`Command output: ${output.toString().trim()}`);
            return output.toString().trim();
        } catch (error) {
            this.logger.ErrorMsg(`Error running command: "${command}" in ${cwd}`);
            this.logger.ErrorMsg(error instanceof Error ? error.message : error);
            return null;
        }
    }

    private async autoSync(repoPath: string): Promise<void> {
        this.logger.LogMsg(`Starting auto sync process for repository at: ${repoPath}`);

        // 1. Pull from remote
        this.logger.LogMsg('Pulling latest changes...');
        const pullResult = this.runCommand('git pull', repoPath);
        if (pullResult === null) return; // means pull failed

        // 2. Check if local changes exist
        this.logger.LogMsg('Checking for changes...');
        const status = this.runCommand('git status --porcelain', repoPath);
        if (!status) {
            this.logger.LogMsg('No local changes to commit.');
            return;
        }

        // 3. Commit & push
        this.logger.LogMsg('Adding changes...');
        this.runCommand('git add .', repoPath);
        const timestamp = new Date().toISOString();
        this.logger.LogMsg(`Committing changes with message: "Auto commit at ${timestamp}"`);
        this.runCommand(`git commit -m "Auto commit at ${timestamp}"`, repoPath);
        this.logger.LogMsg('Pushing changes...');
        this.runCommand('git push', repoPath);

        this.logger.LogMsg('Auto sync completed successfully.');
    }

    private async syncAllRepos(): Promise<void> {
        this.logger.LogMsg('Starting sync for all repositories...');
        const userRepoConfigs: { [key: string]: GitRepo }[] = this.configService.getGitRepos();
        for (const repoConf of userRepoConfigs) {
            const user = Object.keys(repoConf)[0];
            const repoPath = path.join(this.dataPath, user);
            this.logger.LogMsg(`Syncing repository for user: ${user}`);
            await this.autoSync(repoPath);
        }
        this.logger.LogMsg('All repositories synced.');
    }

    public scheduleAutoSync(intervalSeconds: number): void {
        this.logger.LogMsg(`Scheduling auto sync every ${intervalSeconds} seconds.`);
        // Immediately run once
        this.syncAllRepos();
        // Then schedule repeating
        setInterval(() => this.syncAllRepos(), intervalSeconds * 1000);
    }
}

// If you want to run it directly with: `yarn start`
if (import.meta.url === `file://${process.argv[1]}`) {
    const configService = new Config(); // Assuming you have a way to instantiate ConfigService
    configService.loadConfig('c:/Education/Bachelor/BachelorWorkRepo/DTaaS/servers/lib/config/libms.dev.yaml').then(() => {
        const autoSync = new AutoSync(configService);
        autoSync.scheduleAutoSync(5); // Schedule every 5 seconds for testing
    }).catch((err) => {
        console.error('Failed to load configuration:', err);
    });
}

export { AutoSync };
