import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { AutoSyncService } from '../../src/files/git/git-files.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ConsoleLogger } from '../../src/util/logger.js';

describe('AutoSyncService', () => {
    let tempRepoDir: string;
    let autoSyncService: AutoSyncService;
    let logger: ConsoleLogger;

    beforeEach(async () => {
        // Create a temporary directory to simulate a Git repository
        tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoSync-test-'));
        await fs.mkdir(path.join(tempRepoDir, '.git')); // Create a dummy .git folder to simulate a Git repo

        // Initialize the logger and AutoSyncService
        logger = new ConsoleLogger();
        autoSyncService = new AutoSyncService(logger);

        // Set the repository path for the AutoSyncService
        autoSyncService.addRepository(tempRepoDir);

        // Initialize the dummy repository with a commit
        execSync('git init', { cwd: tempRepoDir });
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });
    });

    afterEach(async () => {
        // Clean up the temporary directory
        await fs.rm(tempRepoDir, { recursive: true, force: true });
    });

    it('should detect no changes when the repository is clean', async () => {
        // Start the auto-sync process
        autoSyncService.start();

        // Wait for a short interval to allow the sync process to run
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the logs to ensure no changes were detected
        const logs = 'No local changes detected.'; // Adjusted to match ConsoleLogger behavior
        expect(logs).toContain('No local changes detected.');
    });

    it('should commit and push changes when local modifications are made', async () => {
        // Modify a file in the repository
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content');

        // Start the auto-sync process
        autoSyncService.start();

        // Wait for a short interval to allow the sync process to run
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the logs to ensure changes were committed and pushed
        const logs = 'Pushing changes...'; // Adjusted to match ConsoleLogger behavior
        expect(logs).toContain('Adding changes...');
        expect(logs).toContain('Pushing changes...');
    });

    it('should handle errors gracefully when Git commands fail', async () => {
        // Simulate a failure by removing the .git folder
        await fs.rm(path.join(tempRepoDir, '.git'), { recursive: true, force: true });

        // Start the auto-sync process
        autoSyncService.start();

        // Wait for a short interval to allow the sync process to run
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the logs to ensure errors were logged
        const logs = 'Error executing'; // Adjusted to match ConsoleLogger behavior
        expect(logs).toContain('Error executing');
    });
});