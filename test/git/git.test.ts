import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addWorktreeNewBranch,
  branchExists,
  checkBranchName,
  dirtyCount,
  GitError,
  isMainCheckout,
  listBranches,
  listWorktrees,
  remoteDefaultBranch,
  removeWorktree,
  runGit,
  switchBranch,
} from '../../src/git/git';
import { git, makeRepo, makeTempDir, type TmpRepo } from '../helpers/tmpRepo';

let repo: TmpRepo;
let wt: string;

beforeEach(async () => {
  repo = await makeRepo();
  wt = path.join(repo.root, '.worktrees', 'main', 'feat-x');
});

afterEach(async () => {
  await repo.cleanup();
});

describe('addWorktreeNewBranch', () => {
  it('creates the worktree on a new branch', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    const list = await listWorktrees(repo.main);
    expect(list).toHaveLength(2);
    expect(list[1].branch).toBe('feat/x');
    expect(list[1].path).toBe(wt);
  });

  it('does not make the new branch track its base (so git push cannot target the base)', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    await expect(runGit(['config', '--get', 'branch.feat/x.merge'], repo.main)).rejects.toBeInstanceOf(GitError);
  });
});

describe('dirtyCount', () => {
  it('counts an untracked file', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    await fs.writeFile(path.join(wt, 'new.txt'), 'x');
    expect(await dirtyCount(wt)).toBe(1);
  });
});

describe('isMainCheckout', () => {
  it('is true only for the main checkout', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    const plain = await makeTempDir();
    expect(await isMainCheckout(repo.main)).toBe(true);
    expect(await isMainCheckout(wt)).toBe(false);
    expect(await isMainCheckout(plain)).toBe(false);
    await fs.rm(plain, { recursive: true, force: true });
  });
});

describe('checkBranchName', () => {
  it('accepts a normal name and rejects an invalid one', async () => {
    expect(await checkBranchName(repo.main, 'feat/x')).toBe(true);
    expect(await checkBranchName(repo.main, 'bad..name')).toBe(false);
  });
});

describe('branchExists', () => {
  it('knows which local branches exist', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    expect(await branchExists(repo.main, 'feat/x')).toBe(true);
    expect(await branchExists(repo.main, 'nope')).toBe(false);
  });
});

describe('listBranches', () => {
  it('lists local and remote branches without origin/HEAD', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    const b = await listBranches(repo.main);
    expect(b.local).toEqual(expect.arrayContaining(['main', 'feat/x']));
    expect(b.remote).toContain('origin/main');
    expect(b.remote).not.toContain('origin/HEAD');
    expect(b.remote).not.toContain('origin');
  });
});

describe('remoteDefaultBranch', () => {
  it('reads origin/HEAD', async () => {
    expect(await remoteDefaultBranch(repo.main)).toBe('origin/main');
  });

  it('falls back to main when there is no remote', async () => {
    const lonely = await makeTempDir();
    await git(lonely, 'init', '-q', '-b', 'trunk');
    expect(await remoteDefaultBranch(lonely)).toBe('main');
    await fs.rm(lonely, { recursive: true, force: true });
  });
});

describe('removeWorktree', () => {
  it('removes the folder even with untracked files, and keeps the branch', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    await fs.writeFile(path.join(wt, 'untracked.txt'), 'x');
    await removeWorktree(repo.main, wt);
    await expect(fs.access(wt)).rejects.toThrow();
    expect(await branchExists(repo.main, 'feat/x')).toBe(true);
  });
});

describe('switchBranch', () => {
  it('switches the main checkout to a kept branch', async () => {
    await addWorktreeNewBranch(repo.main, wt, 'feat/x', 'origin/main');
    await removeWorktree(repo.main, wt);
    await switchBranch(repo.main, 'feat/x');
    expect(await runGit(['branch', '--show-current'], repo.main)).toBe('feat/x\n');
  });
});

describe('runGit', () => {
  it('rejects with a GitError that carries stderr', async () => {
    const err = await runGit(['nope'], repo.main).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitError);
    expect((err as GitError).stderr).not.toBe('');
  });
});
