import { Injectable } from '@nestjs/common';
import * as http from 'isomorphic-git/http/node/index.cjs';
import { ConsoleLogger } from '../../util/logger.js';
import * as git from 'isomorphic-git';
// import fs2 from 'fs/promises';
// import * as path from 'path';
import * as fs from 'fs';

export interface IMergeHandler {
    fetchAndMerge(repoPath: string, gitDir: string, authUrl: string): Promise<boolean>;
}

@Injectable()
export class MergeHandler implements IMergeHandler {
    private readonly logger = new ConsoleLogger(MergeHandler.name);

    public async fetchAndMerge(repoPath: string, gitDir: string, authUrl: string): Promise<boolean> {
        try {
            // Get current branch name using isomorphic-git helper
            const currentBranch = await git.currentBranch({ fs, dir: repoPath, gitdir: gitDir, fullname: false });
            if (!currentBranch) {
                this.logger.error('Cannot proceed: current branch not found.');
                return false;
            }
            this.logger.LogMsg(`On branch: ${currentBranch}`);

            // Fetch latest commits from remote origin/currentBranch
            this.logger.LogMsg('Fetching...');
            await git.fetch({
                fs,
                http,
                dir: repoPath,
                gitdir: gitDir,
                url: authUrl,
                remote: 'origin',
                singleBranch: true,
                ref: currentBranch,
                // Removed depth to avoid shallow clone issues
            });
            this.logger.LogMsg(`Fetch completed for "${authUrl}" on branch "${currentBranch}".`);

            // Merge origin/currentBranch into currentBranch with "ours" strategy
            this.logger.LogMsg('Merging...');
            await git.merge({
                fs,
                dir: repoPath,
                gitdir: gitDir,
                ours: currentBranch, // local branch name (e.g. "main")
                theirs: `origin/${currentBranch}`, // remote-tracking branch

                fastForwardOnly: false, // force a merge commit if needed

                author: { name: 'AutoSync', email: 'autosync@example.com' },
                committer: { name: 'AutoSync', email: 'autosync@example.com' },

                mergeDriver: async (params: any) => {
                    // On conflict, keep local version (ours)
                    return params.ourOid;
                },
            });
            this.logger.LogMsg(`Merge (ours) completed on "${currentBranch}".`);

            return true;
        } catch (err: any) {
            this.logger.ErrorMsg(`fetchAndMerge failed: ${err.message}`);
            return false;
        }
    }
}
