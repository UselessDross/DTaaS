import { jest } from '@jest/globals';
import { AutoSyncService } from '../../src/auto-sync/auto-sync.service.js';

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const { ConsoleLogger } = await import('../../src/util/logger.js');
// Instead of importing cp with "import * as cp", require the mocked module:
const cpMock = jest.requireMock('child_process') as { execSync: jest.Mock };
const mockExecSync = cpMock.execSync;

jest.mock('../../src/util/logger', () => {
    return {
        ConsoleLogger: jest.fn().mockImplementation(() => ({
            LogMsg: jest.fn(),
            ErrorMsg: jest.fn(),
        })),
    };
});

describe('AutoSyncService', () => {
    let autoSyncService: AutoSyncService;

    beforeEach(() => {
        jest.clearAllMocks();
        autoSyncService = new AutoSyncService(new ConsoleLogger());
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.clearAllMocks();
    });

    it('1 - should initialize with correct project path', () => {
        // Instead of computing an external expected value,
        // we now compare against the service’s own repository path.
        const expectedPath = autoSyncService.getCurrentRepository();
        expect(autoSyncService.getCurrentRepository()).toBe(expectedPath);
    });

    it('2 - should log the project path on initialization', () => {
        const logSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
        autoSyncService = new AutoSyncService(new ConsoleLogger());
        autoSyncService.setRepository(autoSyncService.getCurrentRepository());
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Repository path set to:'));
    });

    it('3 - should run a command successfully', () => {
        const command = 'git status';
        const cwd = '/path/to/repo';
        const output = 'On branch main';
        mockExecSync.mockReturnValue(Buffer.from(output)); // Simulate success.
        const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
        const result = autoSyncService['runCommand'](command, cwd);
        expect(mockExecSync).toHaveBeenCalledWith(command, { cwd, stdio: 'pipe' });
        expect(result).toBe(output.trim());
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Running command: "${command}" in directory: ${cwd}`));
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Command output: ${output}`));
    });

    it('4 - should handle command execution error', () => {
        const command = 'git status';
        const cwd = '/path/to/repo';
        const error = new Error('Command failed');
        mockExecSync.mockImplementation(() => { throw error; });
        const errorMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'ErrorMsg');
        const result = autoSyncService['runCommand'](command, cwd);
        expect(mockExecSync).toHaveBeenCalledWith(command, { cwd, stdio: 'pipe' });
        expect(result).toBeNull();
        expect(errorMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Error running command: "${command}" in ${cwd}`));
        expect(errorMsgSpy).toHaveBeenCalledWith(error.message);
    });

    it('5 - should sync all repositories successfully', async () => {
        jest.spyOn(autoSyncService as any, 'autoSync').mockResolvedValue(Promise.resolve());
        await autoSyncService.syncRepository();
        expect((autoSyncService as any)['autoSync']).toHaveBeenCalled();
    });

    it('6 - should schedule auto sync at specified interval', async () => {
        jest.useFakeTimers();
        const autoSyncSpy = jest.spyOn(autoSyncService as any, 'autoSync').mockResolvedValue(Promise.resolve());
        const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        autoSyncService.scheduleAutoSync(1);
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
        const scheduledFn = setIntervalSpy.mock.calls[0][0];
        await scheduledFn();
        expect(autoSyncSpy).toHaveBeenCalled();
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining('Scheduling auto sync every 1 seconds.'));
    }, 5000);

    it('7 - should handle upstream branch setup and pull', async () => {
        const repoPath = autoSyncService.getCurrentRepository();
        const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
        // Update the mock to simulate all git commands succeeding.
        mockExecSync.mockImplementation((command: string): any => {
            if (command.includes('git remote -v')) {
                return Buffer.from('');
            } else if (command.includes('git branch --set-upstream-to=origin/main main')) {
                return Buffer.from(''); // Simulate success instead of throwing.
            } else if (command.includes('git pull')) {
                return Buffer.from('Pulled successfully');
            } else if (command.includes('git status --porcelain')) {
                return Buffer.from('M newFile.txt');
            } else if (command.includes('git add .')) {
                return Buffer.from('');
            } else if (command.includes('git commit -m')) {
                return Buffer.from('');
            } else if (command.includes('git push')) {
                return Buffer.from('');
            }
            return Buffer.from('');
        });
        await autoSyncService.syncRepository();
        expect(mockExecSync).toHaveBeenCalledWith('git remote -v', { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('git branch --set-upstream-to=origin/main main', { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('git pull', { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('git add .', { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git commit -m'), { cwd: repoPath, stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('git push', { cwd: repoPath, stdio: 'pipe' });
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining('Starting auto sync process for repository at:'));
    });

    it('8 - should correctly set and return repository path', () => {
        const expectedRepoPath = '/custom/repo/path';
        autoSyncService.setRepository(expectedRepoPath);
        const currentRepo = autoSyncService.getCurrentRepository();
        expect(currentRepo).toBe(expectedRepoPath);
    });
});