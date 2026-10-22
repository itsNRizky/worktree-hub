import { describe, expect, it } from 'vitest';
import { countStatusLines, parseWorktreeList } from '../../src/core/porcelain';

const SAMPLE = `worktree /r/main
HEAD aaa
branch refs/heads/main

worktree /r/.worktrees/main/feat-x
HEAD bbb
branch refs/heads/feat/x

worktree /r/.worktrees/main/det
HEAD ccc
detached

worktree /r/.worktrees/main/gone
HEAD ddd
branch refs/heads/gone
prunable gitdir file points to non-existent location
`;

describe('parseWorktreeList', () => {
  const list = parseWorktreeList(SAMPLE);

  it('returns one entry per worktree', () => {
    expect(list).toHaveLength(4);
  });

  it('marks only the first entry as the primary worktree', () => {
    expect(list.map((w) => w.isPrimary)).toEqual([true, false, false, false]);
  });

  it('strips refs/heads/ from branch names', () => {
    expect(list[1].branch).toBe('feat/x');
    expect(list[1].path).toBe('/r/.worktrees/main/feat-x');
    expect(list[1].head).toBe('bbb');
  });

  it('marks a detached worktree and gives it no branch', () => {
    expect(list[2].detached).toBe(true);
    expect(list[2].branch).toBeUndefined();
  });

  it('marks a worktree whose folder is gone as prunable', () => {
    expect(list[3].prunable).toBe(true);
    expect(list[0].prunable).toBe(false);
  });
});

describe('countStatusLines', () => {
  it('is 0 for a clean worktree', () => {
    expect(countStatusLines('')).toBe(0);
  });

  it('counts one per changed or untracked file', () => {
    expect(countStatusLines(' M a\n?? b\n')).toBe(2);
  });
});
