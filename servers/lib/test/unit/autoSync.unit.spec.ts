import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { AutoSyncService } from '../../src/files/git/git-files.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ConsoleLogger } from '../../src/util/logger.js';

describe('AutoSyncService', () => {
    let tempRepoDir;
    let autoSyncService;
    let testLogger;

    beforeEach(async () => {
        tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoSync-test-'));

        execSync('git init', { cwd: tempRepoDir });
        execSync('git config user.email "test@example.com"', { cwd: tempRepoDir });
        execSync('git config user.name "Test User"', { cwd: tempRepoDir });

        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });
        execSync('git remote add origin https://example.com/fake.git', { cwd: tempRepoDir });

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

    it('logs no changes message when repository is clean', async () => {
        autoSyncService.start();
        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(testLogger.LogMsg).toHaveBeenCalledWith(
            expect.stringContaining('No local changes detected')
        );
    });

    it('commits and pushes changes when local modifications are made', async () => {
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content');

        autoSyncService.start();
        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(testLogger.LogMsg).toHaveBeenCalledWith(
            expect.stringContaining('Syncing repository')
        );
        expect(testLogger.LogMsg).not.toHaveBeenCalledWith(
            expect.stringContaining('No local changes detected')
        );
    });

    it('logs error if Git commands fail', async () => {
        await fs.rm(path.join(tempRepoDir, '.git'), { recursive: true, force: true });

        autoSyncService.start();
        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(testLogger.ErrorMsg).toHaveBeenCalledWith(
            expect.stringContaining('Error executing')
        );
    });
});
