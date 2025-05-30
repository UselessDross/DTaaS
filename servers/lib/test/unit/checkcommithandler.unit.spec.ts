// test/unit/checkcommithandler.unit.spec.ts
import { jest } from '@jest/globals';
globalThis.jest = jest;

import * as fs from 'fs';
import type { StatusRow } from 'isomorphic-git';

// our mocks
const existsSyncMock = jest.fn();
const readFileSyncMock = jest.fn();
const statusMatrixMock = jest.fn<() => Promise<StatusRow[]>>();
const addMock = jest.fn<() => Promise<void>>();
const commitMock = jest.fn<() => Promise<string>>();
const ignoresMock = jest.fn<(path: string) => boolean>();
const ignoreMock: () => { add: (rule: string) => void; ignores: (path: string) => boolean } = jest.fn(() => ({
    add: jest.fn() as (rule: string) => void,
    ignores: ignoresMock,
}));

// mock the logger so it doesn’t spam
jest.unstable_mockModule('../../src/util/logger.js', () => ({
    ConsoleLogger: class {
        LogMsg() { }
        ErrorMsg() { }
    }
}));

// now import AFTER mocking
const { CheckCommitHandler } = await import('../../src/files/git/git-files.service');

describe('CheckCommitHandler — with injected fs/git/ignore mocks', () => {
    const repoPath = '/fake/repo';

    const mockDeps = {
        fs: {
            existsSync: existsSyncMock,
            readFileSync: readFileSyncMock,
        } as unknown as typeof fs,
        git: {
            statusMatrix: statusMatrixMock,
            add: addMock,
            commit: commitMock,
        } as unknown as typeof import('isomorphic-git'),
        ignoreFactory: ignoreMock,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('1 - returns false if repoPath is null', async () => {
        const h = new CheckCommitHandler(null as any, mockDeps);
        expect(await h.checkOrCommit()).toBe(false);
    });

    it('2 - returns true if no changes detected', async () => {
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
        addMock.mockResolvedValueOnce();
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
        expect(await h.checkOrCommit()).toBe(false);
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
