import { execSync } from 'child_process';
import Config from '../config/config.service.js';
import { IConfig } from '../config/config.interface.js';
import { GitRepo } from '../config/config.model.js';
import * as path from 'path';

class AutoSync {
    private readonly dataPath: string;
    private readonly configService: IConfig;

    constructor(configService: IConfig) {
        this.configService = configService;
        this.dataPath = this.configService.getLocalPath();
        console.log(`Data path set to: ${this.dataPath}`);
    }

    private runCommand(command: string, cwd: string): string | null {
        console.log(`Running command: "${command}" in directory: ${cwd}`);
        try {
            const output = execSync(command, { cwd, stdio: 'pipe' });
            console.log(`Command output: ${output.toString().trim()}`);
            return output.toString().trim();
        } catch (error) {
            console.error(`Error running command: "${command}" in ${cwd}`);
            console.error(error instanceof Error ? error.message : error);
            return null;
        }
    }

    private async autoSync(repoPath: string): Promise<void> {
        console.log(`Starting auto sync process for repository at: ${repoPath}`);

        // 1. Pull from remote
        console.log('Pulling latest changes...');
        const pullResult = this.runCommand('git pull', repoPath);
        if (pullResult === null) return; // means pull failed

        // 2. Check if local changes exist
        console.log('Checking for changes...');
        const status = this.runCommand('git status --porcelain', repoPath);
        if (!status) {
            console.log('No local changes to commit.');
            return;
        }

        // 3. Commit & push
        console.log('Adding changes...');
        this.runCommand('git add .', repoPath);
        const timestamp = new Date().toISOString();
        console.log(`Committing changes with message: "Auto commit at ${timestamp}"`);
        this.runCommand(`git commit -m "Auto commit at ${timestamp}"`, repoPath);
        console.log('Pushing changes...');
        this.runCommand('git push', repoPath);

        console.log('Auto sync completed successfully.');
    }

    private async syncAllRepos(): Promise<void> {
        console.log('Starting sync for all repositories...');
        const userRepoConfigs: { [key: string]: GitRepo }[] = this.configService.getGitRepos();
        for (const repoConf of userRepoConfigs) {
            const user = Object.keys(repoConf)[0];
            const repoPath = path.join(this.dataPath, user);
            console.log(`Syncing repository for user: ${user}`);
            await this.autoSync(repoPath);
        }
        console.log('All repositories synced.');
    }

    public scheduleAutoSync(intervalSeconds: number): void {
        console.log(`Scheduling auto sync every ${intervalSeconds} seconds.`);
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
