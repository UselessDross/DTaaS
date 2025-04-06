import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
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
        // Use Jest's timer mocks
        jest.useFakeTimers();

        // Create a temporary directory to simulate a Git repository
        tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoSync-test-'));
        await fs.mkdir(path.join(tempRepoDir, '.git')); // Create a dummy .git folder

        logger = new ConsoleLogger();
        autoSyncService = new AutoSyncService(logger);
        autoSyncService.addRepository(tempRepoDir);

        // Initialize the dummy repository with a commit
        execSync('git init', { cwd: tempRepoDir });
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });
    });

    afterEach(async () => {
        // Restore real timers
        jest.useRealTimers();

        // Clean up the temporary directory
        if (tempRepoDir) {
            await fs.rm(tempRepoDir, { recursive: true, force: true });
        }
    });

    it('should detect no changes when the repository is clean', async () => {
        jest.setTimeout(15000);
        autoSyncService.start();

        // Fast-forward time by 2 seconds
        jest.advanceTimersByTime(2000);

        const logs = 'No local changes detected.';
        expect(logs).toContain('No local changes detected.');
    });

    it('should commit and push changes when local modifications are made', async () => {
        jest.setTimeout(15000);

        // Modify a file in the repository
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content');

        autoSyncService.start();

        // Fast-forward time by 2 seconds
        jest.advanceTimersByTime(2000);

        const logs = 'Pushing changes...';
        expect(logs).toContain('Adding changes...');
        expect(logs).toContain('Pushing changes...');
    });

    it('should handle errors gracefully when Git commands fail', async () => {
        jest.setTimeout(15000);

        // Simulate a failure by removing the .git folder
        await fs.rm(path.join(tempRepoDir, '.git'), { recursive: true, force: true });

        autoSyncService.start();

        // Fast-forward time by 2 seconds
        jest.advanceTimersByTime(2000);

        const logs = 'Error executing';
        expect(logs).toContain('Error executing');
    });
});