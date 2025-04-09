import { jest } from '@jest/globals';
// Attach jest to globalThis for compatibility
globalThis.jest = jest;
import { CheckCommitHandler, IRunCommand } from '../../src/files/git/git-files.service';

describe('CheckCommitHandler', () => {
    const repoPath = 'dummy/repo/path';

    it('╟ 1 ╢ should return false when repository path is not provided', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn(() => 'dummy')
        };
        const handler = new CheckCommitHandler(null as any, dummyRunCommand);
        expect(handler.checkOrCommit()).toBe(false);
    });

    it('╟ 2 ╢ should return false when git status returns null', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return null;
                return 'dummy';
            })
        };
        const handler = new CheckCommitHandler(repoPath, dummyRunCommand);
        expect(handler.checkOrCommit()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git status --porcelain', repoPath);
    });

    it('╟ 3 ╢ should return false on unexpected git status output format', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return 'abc';
                return 'dummy';
            })
        };
        const handler = new CheckCommitHandler(repoPath, dummyRunCommand);
        expect(handler.checkOrCommit()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git status --porcelain', repoPath);
    });

    it('╟ 4 ╢ should return false when no local changes and commit fails', () => {
        // Simulate an empty git status (no changes) and a failing commit (returns null)
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return '';
                if (cmd.startsWith('git commit')) return null;
                return 'dummy';
            })
        };
        const handler = new CheckCommitHandler(repoPath, dummyRunCommand);
        expect(handler.checkOrCommit()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git status --porcelain', repoPath);
    });

    it('╟ 5 ╢ should return true when local changes exist and commit succeeds', () => {
        // Simulate a valid non-empty git status (e.g. " M file.txt")
        const dummyRunCommand: IRunCommand = {
            runCommand: jest.fn((cmd: string, _cwd: string) => {
                if (cmd === 'git status --porcelain') return ' M file.txt';
                // For 'git add .' and 'git commit ...' commands, return a non-null dummy value.
                if (cmd === 'git add .') return 'added';
                if (cmd.startsWith('git commit')) return 'committed';
                return 'dummy';
            })
        };
        const handler = new CheckCommitHandler(repoPath, dummyRunCommand);
        expect(handler.checkOrCommit()).toBe(true);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git status --porcelain', repoPath);
        expect(dummyRunCommand.runCommand).toHaveBeenCalledWith('git add .', repoPath);
    });
});
