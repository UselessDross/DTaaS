import { jest } from '@jest/globals';
// Attach jest to globalThis for compatibility
globalThis.jest = jest;
import { PushHandler, IRunCommand } from '../../src/files/git/git-files.service';

describe('}-> PushHandler <-{', () => {
    const repoPath = 'dummy/repo/path';

    it('should return false when repository path is not provided', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_cmd: string, _cwd: string) => 'dummy')
        };
        const pushHandler = new PushHandler('', dummyRunCommand);
        expect(pushHandler.push()).toBe(false);
    });

    it('should return true when git push returns a non-null output', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_cmd: string, _cwd: string) => 'push successful')
        };
        const pushHandler = new PushHandler(repoPath, dummyRunCommand);
        expect(pushHandler.push()).toBe(true);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git push', repoPath);
    });

    it('should return false when git push returns null (simulated failure)', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_cmd: string, _cwd: string) => null)
        };
        const pushHandler = new PushHandler(repoPath, dummyRunCommand);
        expect(pushHandler.push()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git push', repoPath);
    });
});
