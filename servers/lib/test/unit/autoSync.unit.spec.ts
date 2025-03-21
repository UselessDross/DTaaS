import { jest } from '@jest/globals';

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));
jest.mock('../../src/util/logger', () => {
    return {
        ConsoleLogger: jest.fn().mockImplementation(() => ({
            LogMsg: jest.fn(),
            ErrorMsg: jest.fn(),
        })),
    };
});

const cpMock = jest.requireMock('child_process') as { execSync: jest.Mock };
let mockExecSync = cpMock.execSync;

let autoSyncService: any; // will be assigned after module import

describe('AutoSyncService', () => {

    beforeEach(async () => {
        jest.resetModules();
        // Re-import child_process using requireMock so that our mock functions are preserved
        const cpModule = jest.requireMock('child_process') as { execSync: jest.Mock };
        mockExecSync = cpModule.execSync;
        const autoSyncModule = await import('../../src/auto-sync/auto-sync.service.js');
        autoSyncService = new autoSyncModule.AutoSyncService(new (await import('../../src/util/logger.js')).ConsoleLogger());
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.clearAllMocks();
    });

    it('1 - should initialize with correct project path', () => {
        const expectedPath = autoSyncService.getCurrentRepository();
        expect(autoSyncService.getCurrentRepository()).toBe(expectedPath);
    });

    it('2 - should log the project path on initialization', async () => {
        const logSpy = jest.spyOn((await import('../../src/util/logger.js')).ConsoleLogger.prototype, 'LogMsg');
        autoSyncService = new (await import('../../src/auto-sync/auto-sync.service.js')).AutoSyncService(new (await import('../../src/util/logger.js')).ConsoleLogger());
        autoSyncService.setRepository(autoSyncService.getCurrentRepository());
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Repository path set to:'));
    });

    it('3 - should run a command successfully', async () => {
        const command = 'git status';
        const cwd = '/path/to/repo';
        const output = 'On branch main';
        mockExecSync.mockReturnValue(Buffer.from(output));
        const logMsgSpy = jest.spyOn((await import('../../src/util/logger.js')).ConsoleLogger.prototype, 'LogMsg');
        const result = autoSyncService['runCommand'](command, cwd);
        expect(mockExecSync).toHaveBeenCalledWith(command, { cwd, stdio: 'pipe' });
        expect(result).toBe(output.trim());
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Running command: "${command}" in directory: ${cwd}`));
        expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Command output: ${output}`));
    });

    it('4 - should handle command execution error', async () => {
        const command = 'git status';
        const cwd = '/path/to/repo';
        const error = new Error('Command failed');
        mockExecSync.mockImplementation(() => { throw error; });
        const errorMsgSpy = jest.spyOn((await import('../../src/util/logger.js')).ConsoleLogger.prototype, 'ErrorMsg');
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
        const logMsgSpy = jest.spyOn((await import('../../src/util/logger.js')).ConsoleLogger.prototype, 'LogMsg');
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
        const logMsgSpy = jest.spyOn((await import('../../src/util/logger.js')).ConsoleLogger.prototype, 'LogMsg');
        mockExecSync.mockImplementation((command: string): any => {
            if (command.includes('git remote -v')) {
                return Buffer.from('');
            } else if (command.includes('git branch --set-upstream-to=origin/main main')) {
                return Buffer.from('');
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