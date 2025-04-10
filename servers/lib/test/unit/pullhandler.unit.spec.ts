// ...existing imports...
import { jest } from '@jest/globals';
// Attach jest to globalThis for compatibility
globalThis.jest = jest;
import { PullHandler, IRunCommand } from '../../src/files/git/git-files.service';

describe('PullHandler', () => {
    const repoPath = 'dummy/repo/path';

    it('should return false when repository path is not provided', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn(() => 'dummy')
        };
        const pullHandler = new PullHandler(null as any, dummyRunCommand);
        expect(pullHandler.pull()).toBe(false);
    });

    it('should return true when git pull returns a non-null output', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return ""; // clean working directory
                if (cmd === 'git pull') return "pull successful";
                return "";
            })
        };
        const pullHandler = new PullHandler(repoPath, dummyRunCommand);
        expect(pullHandler.pull()).toBe(true);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git pull', repoPath);
    });

    it('should return false when git pull returns null', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return ""; // clean working directory
                if (cmd === 'git pull') return null;
                return "";
            })
        };
        const pullHandler = new PullHandler(repoPath, dummyRunCommand);
        expect(pullHandler.pull()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git pull', repoPath);
    });
});
