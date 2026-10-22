// Parsers for git's "porcelain" output: a stable, machine-readable format meant for scripts.

export interface WorktreeInfo {
  path: string;
  head: string;
  /** Short branch name such as `feat/x` (not `refs/heads/feat/x`). Undefined when detached. */
  branch: string | undefined;
  detached: boolean;
  bare: boolean;
  /** Git still knows the worktree, but its folder is gone (deleted by hand). */
  prunable: boolean;
  locked: boolean;
  /** The main checkout. Git always lists it first. */
  isPrimary: boolean;
}

/**
 * Parses `git worktree list --porcelain`. Each worktree is a block of `key value` lines,
 * and blocks are separated by a blank line.
 */
export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const blocks = porcelain.split(/\n\s*\n/).filter((b) => b.trim() !== '');
  return blocks.map((block, index) => {
    const info: WorktreeInfo = {
      path: '',
      head: '',
      branch: undefined,
      detached: false,
      bare: false,
      prunable: false,
      locked: false,
      isPrimary: index === 0,
    };
    for (const line of block.split('\n')) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const value = space === -1 ? '' : line.slice(space + 1);
      if (key === 'worktree') info.path = value;
      else if (key === 'HEAD') info.head = value;
      else if (key === 'branch') info.branch = value.replace(/^refs\/heads\//, '');
      else if (key === 'detached') info.detached = true;
      else if (key === 'bare') info.bare = true;
      else if (key === 'prunable') info.prunable = true;
      else if (key === 'locked') info.locked = true;
    }
    return info;
  });
}

/** Number of changed or untracked files in `git status --porcelain` output (one line each). */
export function countStatusLines(porcelain: string): number {
  return porcelain.split('\n').filter((line) => line.trim() !== '').length;
}
