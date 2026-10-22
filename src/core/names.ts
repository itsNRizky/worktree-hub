// Path and name helpers. Pure functions: no VS Code, no file system access.
import * as os from 'node:os';
import * as path from 'node:path';

/** Turns `~/x` into `<home>/x`. Settings may contain `~`, but Node's fs does not understand it. */
export function expandHome(p: string, home: string = os.homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return p;
}

/**
 * The folder name for a worktree. The branch keeps its slashes (`feat/x`), but a slash in a
 * folder name would create a sub-folder (`feat/`), so the folder uses dashes (`feat-x`).
 */
export function worktreeFolderName(name: string): string {
  return name.replaceAll('/', '-');
}

/**
 * Where a new worktree lives: `<parent of main checkout>/.worktrees/<repo>/<folder>`.
 * It sits outside the repo on purpose, so the main checkout's search, file watchers and
 * dev servers never see the copies.
 */
export function worktreePath(mainCheckout: string, name: string): string {
  const repoName = path.basename(mainCheckout);
  return path.join(path.dirname(mainCheckout), '.worktrees', repoName, worktreeFolderName(name));
}

/** Two letters for the project's icon: `shop-app` → `SA`, `fokusify` → `FO`. */
export function projectInitials(repoName: string): string {
  const parts = repoName.split(/[-_. ]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : repoName.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * True when `child` is `parent` itself or somewhere below it.
 * A plain `startsWith` is wrong: `/w/feat-ab` starts with `/w/feat-a` but is not inside it.
 */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
