import { jest } from '@jest/globals';
globalThis.jest = jest;

import type { StatusRow } from 'isomorphic-git';

const existsSyncMock = jest.fn();
const readFileSyncMock = jest.fn();
const statusMatrixMock = jest.fn<() => Promise<StatusRow[]>>();
const addMock = jest.fn<() => Promise<void>>();
const commitMock = jest.fn<() => Promise<string>>();
const ignoresMock = jest.fn();
const ignoreMock = jest.fn(() => ({ add: jest.fn(), ignores: ignoresMock }));

// Mock ConsoleLogger
jest.unstable_mockModule('../../src/util/logger.js', () => ({
    ConsoleLogger: class {
        LogMsg() { }
        ErrorMsg() { }
    }
}));

// Load class after mocking
const { CheckCommitHandler } = await import('../../src/files/git/git-files.service.js');

describe('CheckCommitHandler — with injected fs/git/ignore mocks', () => {
    const repoPath = '/fake/repo';

    const mockDeps = {
        fs: {
            existsSync: existsSyncMock,
            readFileSync: readFileSyncMock
        } as unknown as typeof import('fs'),
        git: {
            statusMatrix: statusMatrixMock,
            add: addMock,
            commit: commitMock
        } as any,
        ignore: ignoreMock
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('1 - returns false if repoPath is null', async () => {
        const h = new CheckCommitHandler(null as any, mockDeps);
        expect(await h.checkOrCommit()).toBe(false);
    });

    it('2 - returns true if no changes are detected', async () => {
        statusMatrixMock.mockResolvedValueOnce([['file.txt', 1, 1, 1]]);
        ignoresMock.mockReturnValue(false);
        existsSyncMock.mockReturnValue(false);

        const h = new CheckCommitHandler(repoPath, mockDeps);
        expect(await h.checkOrCommit()).toBe(true);
    });

    it('3 - commits changes when files differ', async () => {
        statusMatrixMock.mockResolvedValueOnce([['foo.txt', 1, 2, 1]]);
        ignoresMock.mockReturnValue(false);
        existsSyncMock.mockReturnValue(false);
        addMock.mockResolvedValueOnce(undefined);
        commitMock.mockResolvedValueOnce('some-oid');

        const h = new CheckCommitHandler(repoPath, mockDeps);
        const ok = await h.checkOrCommit();
        expect(ok).toBe(true);
        expect(addMock).toHaveBeenCalledWith({ fs: expect.anything(), dir: repoPath, filepath: 'foo.txt' });
        expect(commitMock).toHaveBeenCalled();
    });

    it('4 - returns false if statusMatrix throws', async () => {
        statusMatrixMock.mockRejectedValueOnce(new Error('fail'));
        const h = new CheckCommitHandler(repoPath, mockDeps);
        const ok = await h.checkOrCommit();
        expect(ok).toBe(false);
    });

    it('5 - skips files ignored by .gitignore', async () => {
        statusMatrixMock.mockResolvedValueOnce([['ignored.txt', 1, 2, 1]]);
        existsSyncMock.mockReturnValue(true);
        readFileSyncMock.mockReturnValue('ignored.txt');
        ignoresMock.mockReturnValue(true);

        const h = new CheckCommitHandler(repoPath, mockDeps);
        const ok = await h.checkOrCommit();
        expect(ok).toBe(true);
        expect(addMock).not.toHaveBeenCalled();
        expect(commitMock).not.toHaveBeenCalled();
    });
});
