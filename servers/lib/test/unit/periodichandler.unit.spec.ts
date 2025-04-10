import { jest } from '@jest/globals';
globalThis.jest = jest;
import { PeriodicHandler } from '../../src/files/git/git-files.service';

describe('|=-> PeriodicHandler <-=|', () => {
    const repoPath = 'dummy/repo/path';
    const intervalSeconds = 1;

    beforeEach(() => {
        // For first two tests we can use fake timers.
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('should call pull, checkCommit and push when sync cycle succeeds', async () => {
        const handler = new PeriodicHandler(repoPath);
        // Override private methods using type assertion
        (handler as any).callPull = jest.fn(() => true);
        (handler as any).callCheckCommit = jest.fn(() => true);
        (handler as any).callPush = jest.fn();

        handler.schedulePeriodicSync(intervalSeconds);
        // Advance timers to trigger one sync cycle
        jest.advanceTimersByTime(intervalSeconds * 1000);

        // Wait for any pending promises
        await Promise.resolve();

        expect((handler as any).callPull).toHaveBeenCalled();
        expect((handler as any).callCheckCommit).toHaveBeenCalled();
        expect((handler as any).callPush).toHaveBeenCalled();
    });

    it('should skip commit and push if pull fails', async () => {
        const handler = new PeriodicHandler(repoPath);
        (handler as any).callPull = jest.fn(() => false);
        (handler as any).callCheckCommit = jest.fn();
        (handler as any).callPush = jest.fn();

        handler.schedulePeriodicSync(intervalSeconds);
        jest.advanceTimersByTime(intervalSeconds * 1000);
        await Promise.resolve();

        expect((handler as any).callPull).toHaveBeenCalled();
        expect((handler as any).callCheckCommit).not.toHaveBeenCalled();
        expect((handler as any).callPush).not.toHaveBeenCalled();
    });

    it('should prevent overlapping sync cycles', async () => {
        // Use real timers for this test.
        jest.useRealTimers();
        const handler = new PeriodicHandler(repoPath);
        const callPullSpy = jest.fn(() => {
            const start = Date.now();
            while (Date.now() - start < 500) { } // busy-wait for approx 500ms
            return true;
        });
        (handler as any).callPull = callPullSpy;
        (handler as any).callCheckCommit = jest.fn(() => true);
        (handler as any).callPush = jest.fn();

        handler.schedulePeriodicSync(1);
        // Wait for 2000ms of real time.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        expect(callPullSpy).toHaveBeenCalledTimes(1);
    });
});
