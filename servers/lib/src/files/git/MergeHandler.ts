import { Injectable } from '@nestjs/common';
import * as http from 'isomorphic-git/http/node/index.cjs';
import { ConsoleLogger } from '../../util/logger.js'; // Adjust the import path as needed
import * as git from 'isomorphic-git';
import fs2 from 'fs/promises';
import * as path from 'path';
import * as fs from 'fs';

export interface IMergeHandler { fetchAndMerge(repoPath: string, authUrl: string): Promise<boolean>; }

@Injectable()
export class MergeHandler implements IMergeHandler {
    private readonly logger = new ConsoleLogger(MergeHandler.name);


    /**
       * Fetches from remote and merges branch into local using "ours" strategy.
       *
       * @param repoPath  Absolute path to the working folder (where .git lives).
       * @param authUrl   Token-embedded URL (or plain URL) to fetch from.
       * @returns         true if merge succeeded (or nothing to merge), false on error.
       */
    public async fetchAndMerge(repoPath: string, authUrl: string): Promise<boolean> {
        try {
            //
            //
            //
            // ──────────────────────────────────────────────────────────────
            // 1) Read HEAD to get current local branch name. HEAD is a pointer
            //    file pointing to "refs/heads/<branch>" (e.g. "main").
            // ──────────────────────────────────────────────────────────────
            const headRaw = (await fs2.readFile(path.join(repoPath, '.git', 'HEAD'), 'utf8')).trim();
            const m = headRaw.match(/^ref:\srefs\/heads\/(.+)$/);

            const currentBranch = m ? m[1] : null;
            if (!currentBranch) {
                this.logger.error('Cannot proceed: current branch not found.');
                return false;
            }
            this.logger.LogMsg(`On branch: ${currentBranch}`);
            //
            //
            //
            // ──────────────────────────────────────────────────────────────
            // 2) Fetch the latest commits from remote into refs/remotes/origin/<branch>
            //    - fetch: download objects (commits, trees) without merging.
            //    - url: authUrl ensures we bypass reading .git/config.
            // ──────────────────────────────────────────────────────────────
            this.logger.LogMsg(`Fetching...`);
            await git.fetch({
                fs,
                http,
                dir: repoPath,
                url: authUrl,
                remote: undefined,
                singleBranch: true,
                ref: currentBranch,
                depth: 1,
            });
            this.logger.LogMsg(`Fetch completed for "${authUrl}" on branch "${currentBranch}"`);
            //
            //
            //
            // ──────────────────────────────────────────────────────────────
            // 3) Merge origin/<branch> into <branch> with "ours" strategy:
            //    - ours: keep local files on conflict.
            //    - theirs: remote branch we just fetched.
            //    - mergeStrategy: 'ours'.
            //    - fastForwardOnly: false to force an actual merge commit if needed.
            // ──────────────────────────────────────────────────────────────
            this.logger.LogMsg(`Merging...`);
            await git.merge({
                fs,
                dir: repoPath,
                ours: currentBranch,             // local branch
                theirs: `origin/${currentBranch}`,// remote-tracking branch
                fastForwardOnly: false,          // force a merge commit if needed

                author: { name: 'AutoSync', email: 'autosync@example.com' },
                committer: { name: 'AutoSync', email: 'autosync@example.com' },

                // mergeDriver callback: pick ourOid (our version) on conflict.
                // Using `params: any` because TS type lacks `ourOid`.
                mergeDriver: async (params: any) => {
                    // `ourOid` holds the object ID of our version for this file.
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