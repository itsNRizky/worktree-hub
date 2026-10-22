// Loads everything the sidebar shows from git: projects, their worktrees and dirty state.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WorktreeInfo } from '../core/porcelain';
import type { ProjectConfig } from '../core/projects';

export interface WorktreeEntry extends WorktreeInfo {
  dirtyCount: number;
  /** The folder is gone (deleted by hand) but git still lists the worktree. */
  missing: boolean;
}

export interface ProjectEntry {
  config: ProjectConfig;
  /** Folder name of the main checkout, e.g. `shop-app`. */
  name: string;
  worktrees: WorktreeEntry[];
  /** Set when the project could not be read. The tree shows it as an error row. */
  error?: string;
}

export interface Snapshot {
  projects: ProjectEntry[];
}

/** The git functions this module needs (src/git/git.ts fits; tests can pass fakes). */
export interface GitApi {
  listWorktrees(repo: string): Promise<WorktreeInfo[]>;
  dirtyCount(worktree: string): Promise<number>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadProject(config: ProjectConfig, git: GitApi): Promise<ProjectEntry> {
  const name = path.basename(config.path);
  if (!(await exists(config.path))) {
    return { config, name, worktrees: [], error: `Folder not found: ${config.path}` };
  }
  let infos: WorktreeInfo[];
  try {
    infos = await git.listWorktrees(config.path);
  } catch {
    return { config, name, worktrees: [], error: `Not a git repository: ${config.path}` };
  }
  const worktrees = await Promise.all(
    infos
      .filter((w) => !w.bare)
      .map(async (w): Promise<WorktreeEntry> => {
        const missing = w.prunable || !(await exists(w.path));
        // Asking git about a folder that does not exist would only fail.
        const dirty = missing ? 0 : await git.dirtyCount(w.path).catch(() => 0);
        return { ...w, dirtyCount: dirty, missing };
      }),
  );
  return { config, name, worktrees };
}

/** Never throws: a broken project becomes an entry with `error`, the others still load. */
export async function loadSnapshot(projects: ProjectConfig[], git: GitApi): Promise<Snapshot> {
  return { projects: await Promise.all(projects.map((p) => loadProject(p, git))) };
}

export function findWorktree(
  s: Snapshot,
  worktreePath: string,
): { project: ProjectEntry; worktree: WorktreeEntry } | undefined {
  for (const project of s.projects) {
    const worktree = project.worktrees.find((w) => w.path === worktreePath);
    if (worktree) return { project, worktree };
  }
  return undefined;
}
