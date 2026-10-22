// Checks a typed worktree name before anything is created.
import { worktreePath } from './names';
import type { WorktreeInfo } from './porcelain';

export type CreateCheck = { ok: true; folder: string; branchExists: boolean } | { ok: false; reason: string };

/** The git and file checks needed, passed in so tests can use fakes. */
export interface CreateCheckDeps {
  checkBranchName(name: string): Promise<boolean>;
  branchExists(name: string): Promise<boolean>;
  worktrees(): Promise<WorktreeInfo[]>;
  folderExists(path: string): Promise<boolean>;
}

export async function checkNewWorktree(mainCheckout: string, name: string, deps: CreateCheckDeps): Promise<CreateCheck> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'Type a name, for example feat/my-ticket.' };
  if (!(await deps.checkBranchName(trimmed))) return { ok: false, reason: `Not a valid branch name: ${trimmed}` };

  // Two names can map to the same folder (feat/a-b and feat-a/b both become feat-a-b).
  // Never reuse or overwrite a folder: stop here instead.
  const folder = worktreePath(mainCheckout, trimmed);
  if (await deps.folderExists(folder)) return { ok: false, reason: `Folder already exists: ${folder}` };

  const exists = await deps.branchExists(trimmed);
  if (exists) {
    // Git allows a branch in only one worktree at a time.
    const holder = (await deps.worktrees()).find((w) => w.branch === trimmed);
    if (holder) return { ok: false, reason: `Branch ${trimmed} is already checked out at ${holder.path}` };
  }
  return { ok: true, folder, branchExists: exists };
}

/** The base-branch picker's items: the preferred branch first, then local, then remote branches. */
export function orderBaseBranches(b: { local: string[]; remote: string[] }, preferred: string): string[] {
  const all = [...new Set([...b.local, ...b.remote])];
  return all.includes(preferred) ? [preferred, ...all.filter((x) => x !== preferred)] : all;
}
