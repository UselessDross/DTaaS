import { jest } from '@jest/globals';
globalThis.jest = jest;

import { PeriodicHandler } from '../../src/files/git/git-files.service.js';

describe('PeriodicHandler Constituent Method Calls (manual async overrides)', () => {
    const repoPath = 'dummy/repo/path';
    const intervalSeconds = 1;

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: [] });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('1 - should call PullHandler.pull, CheckCommitHandler.checkOrCommit and PushHandler.push in a sync cycle', async () => {
        const handler = new PeriodicHandler(repoPath, repoPath + '/.git');

        // Replace internal async methods with tracked flags
        let pullCalled = false;
        let commitCalled = false;
        let pushCalled = false;

        (handler as any).callPull = async () => {
            pullCalled = true;
            return true;
        };

        (handler as any).callCheckCommit = async () => {
            commitCalled = true;
            return true;
        };

        (handler as any).callPush = async () => {
            pushCalled = true;
            return true;
        };

        handler.schedulePeriodicSync(intervalSeconds);

        // Wait for the interval and microtasks to finish
        await jest.advanceTimersByTimeAsync(intervalSeconds * 1000);

        expect(pullCalled).toBe(true);
        expect(commitCalled).toBe(true);
        expect(pushCalled).toBe(true);
    });
});
