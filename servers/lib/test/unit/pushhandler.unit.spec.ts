// test/unit/pushhandler.unit.spec.ts
import { PushHandler } from '../../src/files/git/git-files.service.js';

describe('PushHandler (simple return value tests)', () => {
    const repoPath = 'dummy/repo/path';
    const gitdir = repoPath + '/.git';

    it('1 - should return false if repoPath is null', async () => {
        const handler = new PushHandler(null as any, gitdir);
        expect(await handler.push()).toBe(false);
    });

    it('2 - returns a boolean when gitdir is valid (integration)', async () => {
        // this will actually attempt a push; for a real test you might spin up a tmp repo
        const handler = new PushHandler(repoPath, gitdir);
        const result = await handler.push();
        expect(typeof result).toBe('boolean');
    });
});
