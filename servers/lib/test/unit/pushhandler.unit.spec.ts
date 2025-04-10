import { jest } from '@jest/globals';
// Attach jest to globalThis for compatibility
globalThis.jest = jest;
import { PushHandler, IRunCommand } from '../../src/files/git/git-files.service';

describe(' PushHandler ', () => {
    const repoPath = 'dummy/repo/path';

    it('1 - should return false when repository path is not provided', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: (jest.fn((_cmd: string, _cwd: string) => 'dummy') as unknown) as (command: string, cwd: string) => string | null
        };
        const pushHandler = new PushHandler('', dummyRunCommand);
        expect(pushHandler.push()).toBe(false);
    });

    it('2 - should return true when git push returns a non-null output', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: (jest.fn()
                .mockImplementationOnce((cmd: string, _cwd: string) => {
                    // First call: status check
                    if (cmd === 'git status --porcelain') return "M";
                    return "";
                })
                .mockImplementationOnce((cmd: string, _cwd: string) => {
                    // Second call: push command
                    if (cmd === 'git push') return "push successful";
                    return "";
                }) as unknown) as (command: string, cwd: string) => string | null
        };
        const pushHandler = new PushHandler(repoPath, dummyRunCommand);
        expect(pushHandler.push()).toBe(true);
        expect(dummyRunCommand.runCommand).toHaveBeenNthCalledWith(2, 'git push', repoPath);
    });

    it('3 - should return false when git push returns null (simulated failure)', () => {
        const dummyRunCommand: IRunCommand = {
            runCommand: (jest.fn()
                .mockImplementationOnce((cmd: string, _cwd: string) => {
                    // First call: status check returns "M" to simulate local changes.
                    if (cmd === 'git status --porcelain') return "M";
                    return "";
                })
                .mockImplementationOnce((cmd: string, _cwd: string) => {
                    // Second call: push command returns null.
                    if (cmd === 'git push') return null;
                    return "";
                }) as unknown) as (command: string, cwd: string) => string | null
        };
        const pushHandler = new PushHandler(repoPath, dummyRunCommand);
        expect(pushHandler.push()).toBe(false);
        expect(dummyRunCommand.runCommand).toHaveBeenNthCalledWith(2, 'git push', repoPath);
    });
});
