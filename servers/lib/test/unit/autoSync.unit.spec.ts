import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { AutoSyncService } from '../../src/files/git/git-files.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ConsoleLogger } from '../../src/util/logger.js';

// Create a mock logger that captures messages
class TestLogger extends ConsoleLogger {
    public messages: string[] = [];

    LogMsg(message: string): void {
        this.messages.push(message);
        super.LogMsg(message);
    }

    ErrorMsg(message: string): void {
        this.messages.push(message);
        super.ErrorMsg(message);
    }

    WarningMsg(message: string): void {
        this.messages.push(message);
        super.WarningMsg(message);
    }
}

describe('AutoSyncService', () => {
    let tempRepoDir: string;
    let autoSyncService: AutoSyncService;
    let testLogger: TestLogger;

    beforeEach(async () => {
        // Create a temporary directory to simulate a Git repository
        tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoSync-test-'));
        await fs.mkdir(path.join(tempRepoDir, '.git'));

        testLogger = new TestLogger();
        autoSyncService = new AutoSyncService(testLogger);

        // Set the repository path for the AutoSyncService
        autoSyncService.addRepository(tempRepoDir);

        // Initialize the dummy repository with a commit
        execSync('git init', { cwd: tempRepoDir });
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });
    });

    afterEach(async () => {
        if (tempRepoDir) {
            await fs.rm(tempRepoDir, { recursive: true, force: true });
        }
    });

    it('should detect no changes when the repository is clean', async () => {
        jest.setTimeout(15000);
        autoSyncService.start();
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const logMessages = testLogger.messages.join('\n');
        expect(logMessages).toContain('No local changes detected');
    });

    it('should commit and push changes when local modifications are made', async () => {
        jest.setTimeout(15000);

        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content');
        autoSyncService.start();

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const logMessages = testLogger.messages.join('\n');
        expect(logMessages).toContain('Adding changes');
        expect(logMessages).toContain('Pushing changes');
    });

    it('should handle errors gracefully when Git commands fail', async () => {
        jest.setTimeout(15000);

        await fs.rm(path.join(tempRepoDir, '.git'), { recursive: true, force: true });
        autoSyncService.start();

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const logMessages = testLogger.messages.join('\n');
        expect(logMessages).toContain('Error executing');
    });
});