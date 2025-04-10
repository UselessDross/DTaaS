import { jest } from '@jest/globals';
globalThis.jest = jest;
import { PeriodicHandler, PullHandler, CheckCommitHandler, PushHandler } from '../../src/files/git/git-files.service';

describe('PeriodicHandler Constituent Method Calls', () => {
    const repoPath = 'dummy/repo/path';
    const intervalSeconds = 1;

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('1 - should call PullHandler.pull, CheckCommitHandler.checkOrCommit and PushHandler.push in a sync cycle', async () => {
        const pullSpy = jest.spyOn(PullHandler.prototype, 'pull').mockReturnValue(true);
        const checkCommitSpy = jest.spyOn(CheckCommitHandler.prototype, 'checkOrCommit').mockReturnValue(true);
        const pushSpy = jest.spyOn(PushHandler.prototype, 'push').mockReturnValue(true);

        const periodicHandler = new PeriodicHandler(repoPath);
        periodicHandler.schedulePeriodicSync(intervalSeconds);
        // Advance timers to trigger one sync cycle
        jest.advanceTimersByTime(intervalSeconds * 1000 + 100);
        await Promise.resolve();

        expect(pullSpy).toHaveBeenCalled();
        expect(checkCommitSpy).toHaveBeenCalled();
        expect(pushSpy).toHaveBeenCalled();
    });
});
