import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSnapshot, type GitApi } from '../../src/app/repository';
import * as gitApi from '../../src/git/git';
import { makeRepo, type TmpRepo } from '../helpers/tmpRepo';

let repo: TmpRepo;

beforeEach(async () => {
  repo = await makeRepo();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('loadSnapshot', () => {
  it('lists worktrees with their uncommitted-change count', async () => {
    const wt = path.join(repo.root, '.worktrees', 'main', 'feat-x');
    await gitApi.addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    await fs.writeFile(path.join(wt, 'a.txt'), 'a');
    const s = await loadSnapshot([{ path: repo.main, copyFiles: [] }], gitApi);
    expect(s.projects[0].name).toBe('main');
    expect(s.projects[0].worktrees.map((w) => [w.branch, w.dirtyCount])).toEqual([
      ['main', 0],
      ['feat/x', 1],
    ]);
  });

  it('shows an error for a missing project and still loads the others', async () => {
    const s = await loadSnapshot(
      [
        { path: '/definitely/not/here', copyFiles: [] },
        { path: repo.main, copyFiles: [] },
      ],
      gitApi,
    );
    expect(s.projects[0].error).toBe('Folder not found: /definitely/not/here');
    expect(s.projects[0].worktrees).toEqual([]);
    expect(s.projects[1].worktrees).toHaveLength(1);
  });

  it('marks a prunable worktree as missing and does not ask for its status', async () => {
    const asked: string[] = [];
    const fake: GitApi = {
      listWorktrees: async () => [
        { path: repo.main, head: 'a', branch: 'main', detached: false, bare: false, prunable: false, locked: false, isPrimary: true },
        { path: '/gone/wt', head: 'b', branch: 'gone', detached: false, bare: false, prunable: true, locked: false, isPrimary: false },
      ],
      dirtyCount: async (p) => {
        asked.push(p);
        return 0;
      },
    };
    const s = await loadSnapshot([{ path: repo.main, copyFiles: [] }], fake);
    expect(s.projects[0].worktrees[1].missing).toBe(true);
    expect(asked).toEqual([repo.main]);
  });
});
