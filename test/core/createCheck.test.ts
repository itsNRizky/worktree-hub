import { describe, expect, it } from 'vitest';
import { checkNewWorktree, orderBaseBranches, type CreateCheckDeps } from '../../src/core/createCheck';
import type { WorktreeInfo } from '../../src/core/porcelain';

const MAIN = '/P/shop-app';

const wt = (path: string, branch: string): WorktreeInfo => ({
  path,
  head: 'h',
  branch,
  detached: false,
  bare: false,
  prunable: false,
  locked: false,
  isPrimary: false,
});

function deps(o: { invalid?: boolean; branches?: string[]; worktrees?: WorktreeInfo[]; folders?: string[] } = {}): CreateCheckDeps {
  return {
    checkBranchName: async () => !o.invalid,
    branchExists: async (n) => (o.branches ?? []).includes(n),
    worktrees: async () => o.worktrees ?? [],
    folderExists: async (p) => (o.folders ?? []).includes(p),
  };
}

describe('checkNewWorktree', () => {
  it('rejects an invalid branch name', async () => {
    expect(await checkNewWorktree(MAIN, 'bad..name', deps({ invalid: true }))).toEqual({
      ok: false,
      reason: 'Not a valid branch name: bad..name',
    });
  });

  it('rejects a name whose folder already exists (feat-a/b and feat/a-b share a folder)', async () => {
    const folder = '/P/.worktrees/shop-app/feat-a-b';
    expect(await checkNewWorktree(MAIN, 'feat-a/b', deps({ folders: [folder] }))).toEqual({
      ok: false,
      reason: `Folder already exists: ${folder}`,
    });
  });

  it('rejects a branch that another worktree already has', async () => {
    expect(
      await checkNewWorktree(MAIN, 'feat/x', deps({ branches: ['feat/x'], worktrees: [wt('/w/x', 'feat/x')] })),
    ).toEqual({ ok: false, reason: 'Branch feat/x is already checked out at /w/x' });
  });

  it('accepts an existing branch that no worktree has', async () => {
    expect(await checkNewWorktree(MAIN, 'feat/x', deps({ branches: ['feat/x'] }))).toEqual({
      ok: true,
      branchExists: true,
      folder: '/P/.worktrees/shop-app/feat-x',
    });
  });

  it('accepts a new name', async () => {
    expect(await checkNewWorktree(MAIN, 'feat/new', deps())).toEqual({
      ok: true,
      branchExists: false,
      folder: '/P/.worktrees/shop-app/feat-new',
    });
  });
});

describe('orderBaseBranches', () => {
  it('puts the preferred branch first, then local, then remote', () => {
    expect(orderBaseBranches({ local: ['main', 'staging'], remote: ['origin/main', 'origin/staging'] }, 'staging')).toEqual([
      'staging',
      'main',
      'origin/main',
      'origin/staging',
    ]);
  });

  it('keeps the order when the preferred branch does not exist', () => {
    expect(orderBaseBranches({ local: ['main'], remote: ['origin/main'] }, 'staging')).toEqual(['main', 'origin/main']);
  });
});
