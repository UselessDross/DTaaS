import { CheckCommitHandler } from '../../src/files/git/git-files.service.js';

describe('CheckCommitHandler (return-value only)', () => {
    const repoPath = 'dummy/repo/path';

    it('1 - should return false if repoPath is not set', async () => {
        const handler = new CheckCommitHandler(null as any);
        const result = await handler.checkOrCommit();
        expect(result).toBe(false);
    });

    it('2 - should return true/false depending on changes or not', async () => {
        const handler = new CheckCommitHandler(repoPath);
        const result = await handler.checkOrCommit();
        expect(typeof result).toBe('boolean');
    });
});
