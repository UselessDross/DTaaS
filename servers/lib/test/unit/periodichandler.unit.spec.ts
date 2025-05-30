import { PeriodicHandler } from '../../src/files/git/git-files.service.js';
import { jest } from '@jest/globals';

describe('PeriodicHandler — method call integration (no jest.fn)', () => {
    const repoPath = 'dummy/repo/path';

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: [] });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('1 - should call pull, commit, and push in a sync cycle', async () => {
        const handler = new PeriodicHandler(repoPath);

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

        handler.schedulePeriodicSync(1);

        // Use async version to allow all microtasks to run
        await jest.advanceTimersByTimeAsync(1000);

        expect(pullCalled).toBe(true);
        expect(commitCalled).toBe(true);
        expect(pushCalled).toBe(true);
    });

    it('2 - should not call commit or push if pull fails', async () => {
        const handler = new PeriodicHandler(repoPath);

        let pullCalled = false;
        let commitCalled = false;
        let pushCalled = false;

        (handler as any).callPull = async () => {
            pullCalled = true;
            return false; // pull fails
        };

        (handler as any).callCheckCommit = async () => {
            commitCalled = true;
            return true;
        };

        (handler as any).callPush = async () => {
            pushCalled = true;
            return true;
        };

        handler.schedulePeriodicSync(1);

        // Let async callbacks run too
        await jest.advanceTimersByTimeAsync(1000);

        expect(pullCalled).toBe(true);
        expect(commitCalled).toBe(false);
        expect(pushCalled).toBe(false);
    });
});
