import * as git from 'isomorphic-git';
import * as fs from 'fs';
import * as http from 'isomorphic-git/http/node/index.cjs';

export const GitAPI = {
    push: git.push,
    pull: git.pull,
    add: git.add,
    commit: git.commit,
    statusMatrix: git.statusMatrix,
    fs,
    http
};
