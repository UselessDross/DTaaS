// ...existing imports...
import { jest } from '@jest/globals';
// Attach jest to globalThis for compatibility
globalThis.jest = jest;
import { PullHandler, IRunCommand } from '../../src/files/git/git-files.service';

describe('PullHandler', () => {
    const repoPath = 'dummy/repo/path';

    it('╟ 1 ╢ should return false when repository path is not provided', () => {
        // Pass a fake runCommand implementation that simulates success.
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_command: string, _cwd: string) => 'success')
        };
        // Force repoPath to null by casting
        const pullHandler = new PullHandler(null as any, dummyRunCommand);
        expect(pullHandler.pull()).toBe(false);
    });

    it('╟ 2 ╢ should return true when git pull returns a non-null output', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_command: string, _cwd: string) => 'pull successful')
        };
        const pullHandler = new PullHandler(repoPath, dummyRunCommand);
        expect(pullHandler.pull()).toBe(true);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git pull', repoPath);
    });

    it('╟ 3 ╢ should return false when git pull returns null', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((_command: string, _cwd: string) => null)
        };
        const pullHandler = new PullHandler(repoPath, dummyRunCommand);
        expect(pullHandler.pull()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git pull', repoPath);
    });
});
