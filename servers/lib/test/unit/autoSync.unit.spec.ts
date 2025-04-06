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
    let testLogger: ConsoleLogger;

    beforeEach(async () => {
        // Create and initialize a real Git repo for testing
        tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoSync-test-'));
        await fs.mkdir(path.join(tempRepoDir, '.git'));

        // Initialize git repo with a commit
        execSync('git init', { cwd: tempRepoDir });
        execSync('git config --global user.email "test@example.com"', { cwd: tempRepoDir });
        execSync('git config --global user.name "Test User"', { cwd: tempRepoDir });
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });

        // Create remote repo simulation
        execSync('git remote add origin https://example.com/fake.git', { cwd: tempRepoDir });

        // Setup test logger and service
        testLogger = new ConsoleLogger();
        jest.spyOn(testLogger, 'LogMsg');
        jest.spyOn(testLogger, 'ErrorMsg');
        jest.spyOn(testLogger, 'WarningMsg');

        autoSyncService = new AutoSyncService(testLogger);
        autoSyncService.addRepository(tempRepoDir);
    });

    afterEach(async () => {
        if (tempRepoDir) {
            await fs.rm(tempRepoDir, { recursive: true, force: true });
        }
        jest.restoreAllMocks();
    });

    it('should detect no changes when the repository is clean', async () => {
        // Start auto sync
        autoSyncService.start();

        // Wait for sync cycle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify logger was called with expected message
        expect(testLogger.LogMsg).toHaveBeenCalledWith(
            expect.stringContaining('No local changes detected')
        );
    });

    it('should commit and push changes when local modifications are made', async () => {
        // Make a change to the repo
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content');

        // Start auto sync
        autoSyncService.start();

        // Wait for sync cycle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify logger was called with expected messages
        expect(testLogger.LogMsg).toHaveBeenCalledWith(
            expect.stringContaining('Adding changes')
        );
        expect(testLogger.LogMsg).toHaveBeenCalledWith(
            expect.stringContaining('Pushing changes')
        );
    });

    it('should handle errors gracefully when Git commands fail', async () => {
        // Break the Git repo to simulate failure
        await fs.rm(path.join(tempRepoDir, '.git'), { recursive: true, force: true });

        // Start auto sync
        autoSyncService.start();

        // Wait for sync cycle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify error was logged
        expect(testLogger.ErrorMsg).toHaveBeenCalledWith(
            expect.stringContaining('Error executing')
        );
    });
});