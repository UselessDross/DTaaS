import { PeriodicHandler } from '../../src/files/git/git-files.service.js';
import { jest } from '@jest/globals';
globalThis.jest = jest;

describe('PeriodicHandler (manual async overrides)', () => {
    const dir = 'dummy/repo';
    const gitdir = dir + '/.git';

    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('calls pull → commit → push in one cycle', async () => {
        const h = new PeriodicHandler(dir, gitdir);
        let pulled = false, committed = false, pushed = false;

        // override the private methods:
        (h as any).callPull = async () => { pulled = true; return true; };
        (h as any).callCheckCommit = async () => { committed = true; return true; };
        (h as any).callPush = async () => { pushed = true; return true; };

        h.schedulePeriodicSync(1);
        // advance 1 second and wait for the async cycle to run:
        await jest.advanceTimersByTimeAsync(1000);

        expect(pulled).toBe(true);
        expect(committed).toBe(true);
        expect(pushed).toBe(true);
    });

    it('skips commit/push when pull fails', async () => {
        const h = new PeriodicHandler(dir, gitdir);
        let pulled = false, committed = false, pushed = false;

        (h as any).callPull = async () => { pulled = true; return false; };
        (h as any).callCheckCommit = async () => { committed = true; return true; };
        (h as any).callPush = async () => { pushed = true; return true; };

        h.schedulePeriodicSync(1);
        await jest.advanceTimersByTimeAsync(1000);

        expect(pulled).toBe(true);
        expect(committed).toBe(false);
        expect(pushed).toBe(false);
    });
});
