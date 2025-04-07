// test/unit/autoSync.unit.spec.ts

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { AutoSyncService } from '../../src/files/git/git-files.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
// import { fileURLToPath } from 'url';

// Define a mock logger to capture log messages.
class MockLogger {
    public messages: string[] = [];
    LogMsg(message: string): void {
        this.messages.push(`MSG: ${message}`);
        console.log(`MSG: ${message}`);
    }
    ErrorMsg(message: string): void {
        this.messages.push(`ERR: ${message}`);
        console.error(`ERR: ${message}`);
    }
    WarningMsg(message: string): void {
        this.messages.push(`WRN: ${message}`);
        console.warn(`WRN: ${message}`);
    }
}

describe('AutoSyncService (Real Git Integration)', () => {
    let tempRepoDir: string;
    let autoSyncService: AutoSyncService;
    let mockLogger: MockLogger;
    const originalSetInterval = global.setInterval;
    let intervalHandles: NodeJS.Timeout[] = [];

    // Increase timeout for integration tests
    jest.setTimeout(30000);

    beforeEach(async () => {
        // Create a temporary directory for our dummy repository.
        tempRepoDir = mkdtempSync(path.join(os.tmpdir(), 'autoSync-test-'));

        // Initialize the Git repository in the temporary directory.
        execSync('git init', { cwd: tempRepoDir });
        // Configure Git user if not set globally.
        execSync('git config user.email "test@example.com"', { cwd: tempRepoDir });
        execSync('git config user.name "Test User"', { cwd: tempRepoDir });
        // Create an initial file and commit it.
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Initial content\n');
        execSync('git add .', { cwd: tempRepoDir });
        execSync('git commit -m "Initial commit"', { cwd: tempRepoDir });
        // (Optional) Simulate a remote by adding a fake remote.
        execSync('git remote add origin https://example.com/fake.git', { cwd: tempRepoDir });

        // Setup the mock logger.
        mockLogger = new MockLogger();

        // Instantiate AutoSyncService with the mock logger.
        autoSyncService = new AutoSyncService(mockLogger as any);
        // Add our temporary repo to the service.
        autoSyncService.addRepository(tempRepoDir);

        // Spy on setInterval to capture scheduled intervals.
        jest.spyOn(global, 'setInterval').mockImplementation((fn: TimerHandler, ms: number, ...args: any[]): NodeJS.Timeout => {
            const handle = originalSetInterval(fn, ms, ...args) as unknown as NodeJS.Timeout;
            intervalHandles.push(handle);
            return handle;
        });
    });

    afterEach(async () => {
        // Clear scheduled intervals.
        intervalHandles.forEach(handle => clearInterval(handle));
        intervalHandles = [];
        jest.restoreAllMocks();
        // Remove the temporary repository directory.
        await fs.rm(tempRepoDir, { recursive: true, force: true });
    });

    it('should detect no changes when the repository is clean', async () => {
        autoSyncService.start();
        // Wait for one sync cycle.
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Run 'git status' to confirm no pending changes.
        const status = execSync('git status --porcelain', { cwd: tempRepoDir }).toString().trim();
        expect(status).toBe('');
        // Check log messages for indication that no changes were detected.
        const logs = mockLogger.messages.join('\n');
        expect(logs).toMatch(/No local changes to commit/);
    });

    it('should commit and push changes when local modifications are made', async () => {
        // Modify the file to simulate uncommitted changes.
        await fs.writeFile(path.join(tempRepoDir, 'test.txt'), 'Modified content\n');
        // Confirm there are changes.
        const statusBefore = execSync('git status --porcelain', { cwd: tempRepoDir }).toString().trim();
        expect(statusBefore).not.toBe('');
        autoSyncService.start();
        // Wait for one sync cycle.
        await new Promise(resolve => setTimeout(resolve, 2000));
        // After sync, status should be empty.
        const statusAfter = execSync('git status --porcelain', { cwd: tempRepoDir }).toString().trim();
        expect(statusAfter).toBe('');
        // Check logs for commit and push operations.
        const logs = mockLogger.messages.join('\n');
        expect(logs).toMatch(/Adding changes/);
        expect(logs).toMatch(/Committing changes with message:/);
        expect(logs).toMatch(/Pushing changes/);
    });

    it('should handle errors gracefully when Git commands fail', async () => {
        // Remove the .git directory to force Git command failures.
        rmSync(path.join(tempRepoDir, '.git'), { recursive: true, force: true });
        autoSyncService.start();
        // Wait for one sync cycle.
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Check log messages for error indications.
        const logs = mockLogger.messages.join('\n');
        expect(logs).toMatch(/Error running command: "git pull"/);
    });
});
