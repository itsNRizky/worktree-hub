// Every git command the extension runs. Git is called with execFile (no shell), so branch names
// and paths are passed as separate arguments and can never be read as shell syntax.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { countStatusLines, parseWorktreeList, type WorktreeInfo } from '../core/porcelain';

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: string[],
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/** The environment for every git call. */
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Never let git wait for a password prompt that nobody can see.
    GIT_TERMINAL_PROMPT: '0',
    // `git status` normally takes index.lock for a moment to refresh the index. The sidebar runs it
    // in the background while agents run `git add`/`git commit`, and a held lock makes their commands
    // fail with "index.lock: File exists". VS Code's own git extension sets this for the same reason.
    GIT_OPTIONAL_LOCKS: '0',
  };
}

/** Runs `git <args>` in `cwd` and returns stdout. Rejects with a GitError on a non-zero exit. */
export function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: gitEnv(),
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === 'number' ? error.code : null;
          const detail = stderr.trim() || error.message;
          reject(new GitError(`git ${args.join(' ')} failed: ${detail}`, args, stderr, code));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/** Runs git and turns "exit code 0" into true and any failure into false. */
async function succeeds(args: string[], cwd: string): Promise<boolean> {
  try {
    await runGit(args, cwd);
    return true;
  } catch (e) {
    if (e instanceof GitError) return false;
    throw e;
  }
}

export async function listWorktrees(repo: string): Promise<WorktreeInfo[]> {
  return parseWorktreeList(await runGit(['worktree', 'list', '--porcelain'], repo));
}

export async function dirtyCount(worktree: string): Promise<number> {
  return countStatusLines(await runGit(['status', '--porcelain'], worktree));
}

/**
 * True for the main checkout of a repository. In a linked worktree `.git` is a small file that
 * points back to the main repository; only the main checkout has a real `.git` directory.
 */
export async function isMainCheckout(dir: string): Promise<boolean> {
  try {
    const top = (await runGit(['rev-parse', '--show-toplevel'], dir)).trim();
    const real = await fs.realpath(dir);
    if (top !== real) return false;
    const stat = await fs.stat(path.join(dir, '.git'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export function checkBranchName(repo: string, name: string): Promise<boolean> {
  return succeeds(['check-ref-format', '--branch', name], repo);
}

export function branchExists(repo: string, name: string): Promise<boolean> {
  return succeeds(['show-ref', '--verify', '--quiet', `refs/heads/${name}`], repo);
}

/** Local and remote branch names. `origin/HEAD` is a pointer, not a branch, so it is left out. */
export async function listBranches(repo: string): Promise<{ local: string[]; remote: string[] }> {
  // Full ref names, because the short form of refs/remotes/origin/HEAD is just "origin".
  const out = await runGit(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], repo);
  const local: string[] = [];
  const remote: string[] = [];
  for (const ref of out.split('\n').filter(Boolean)) {
    if (ref.startsWith('refs/heads/')) local.push(ref.slice('refs/heads/'.length));
    else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) remote.push(ref.slice('refs/remotes/'.length));
  }
  return { local, remote };
}

/** The branch origin/HEAD points to (e.g. `origin/main`), or `main` if there is none. */
export async function remoteDefaultBranch(repo: string): Promise<string> {
  try {
    return (await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo)).trim() || 'main';
  } catch {
    return 'main';
  }
}

export async function fetchPrune(repo: string): Promise<void> {
  await runGit(['fetch', '--prune'], repo);
}

/**
 * The ref a new branch should start from. A local base such as `staging` is often older than
 * `origin/staging`, so the remote copy wins when the local branch is only behind it (or equal).
 * A local branch with commits the remote does not have is kept, so those commits are not lost.
 * It only compares refs: run `fetchPrune` first.
 */
export async function freshestBase(repo: string, base: string): Promise<{ ref: string; note?: string }> {
  if (!(await branchExists(repo, base))) return { ref: base };
  const tracked = (await runGit(['for-each-ref', '--format=%(upstream)', `refs/heads/${base}`], repo)).trim();
  let remote: string | undefined;
  // The tracked branch first; it can be gone (deleted on the remote), so check that it exists.
  for (const ref of [tracked, `refs/remotes/origin/${base}`]) {
    if (ref.startsWith('refs/remotes/') && (await succeeds(['show-ref', '--verify', '--quiet', ref], repo))) {
      remote = ref.slice('refs/remotes/'.length);
      break;
    }
  }
  if (!remote) return { ref: base };
  if (await succeeds(['merge-base', '--is-ancestor', base, remote], repo)) return { ref: remote };
  return { ref: base, note: `${base} has commits that are not on ${remote}` };
}

/**
 * `--no-track` matters: without it, a branch made from `origin/staging` would track
 * `origin/staging`, and a later `git push` could go to staging.
 */
export async function addWorktreeNewBranch(repo: string, wtPath: string, name: string, base: string): Promise<void> {
  await runGit(['worktree', 'add', '--no-track', '-b', name, wtPath, base], repo);
}

export async function addWorktreeExistingBranch(repo: string, wtPath: string, name: string): Promise<void> {
  await runGit(['worktree', 'add', wtPath, name], repo);
}

/**
 * `--force` because the user already confirmed: copied files such as `.env` are untracked, and
 * a plain remove refuses to delete a worktree with untracked files. The branch is not touched.
 */
export async function removeWorktree(repo: string, wtPath: string): Promise<void> {
  await runGit(['worktree', 'remove', '--force', wtPath], repo);
}

export async function pruneWorktrees(repo: string): Promise<void> {
  await runGit(['worktree', 'prune'], repo);
}

export async function switchBranch(repo: string, name: string): Promise<void> {
  await runGit(['switch', name], repo);
}
