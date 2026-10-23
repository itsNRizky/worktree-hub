// Keeps VS Code's own Git in step with a switch.
// - Source Control view: VS Code's Git does not always close a repo when its folder leaves the
//   workspace, and it never re-opens a repo it closed. So the extension closes and opens them.
// - Bottom-left branch and sync button: VS Code shows the repo of the last file opened in the
//   editor and keeps it after that file closes. When a switch brings back no files, opening one
//   file of the new worktree for a moment makes it follow.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { withTimeout } from '../core/async';
import { pickNudgeFile, rootFilesFromLsTree } from '../core/gitNudge';
import { runGit } from '../git/git';

/** The parts of the built-in Git extension's API that this needs. */
interface BuiltInRepo {
  rootUri: vscode.Uri;
}
interface BuiltInGitApi {
  getRepository(uri: vscode.Uri): BuiltInRepo | null;
  openRepository?(root: vscode.Uri): Promise<BuiltInRepo | null>;
}

const OPEN_REPO_TIMEOUT_MS = 3_000;
/** Lets VS Code register the open file as the active editor before the tab closes again. */
const SETTLE_MS = 100;

async function builtInGit(): Promise<BuiltInGitApi | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(version: 1): BuiltInGitApi }>('vscode.git');
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : await ext.activate();
  return exports.getAPI(1);
}

/** The repo whose root is exactly this folder (not a repo that merely contains it). */
function exactRepo(api: BuiltInGitApi, folder: string): BuiltInRepo | undefined {
  const repo = api.getRepository(vscode.Uri.file(folder));
  return repo && path.resolve(repo.rootUri.fsPath) === path.resolve(folder) ? repo : undefined;
}

async function flashFile(worktree: string, log: (line: string) => void): Promise<void> {
  const name = pickNudgeFile(rootFilesFromLsTree(await runGit(['ls-tree', 'HEAD'], worktree).catch(() => '')));
  if (!name) {
    log(`git: no file to open in ${worktree}; the bottom-left branch may lag`);
    return;
  }
  const uri = vscode.Uri.file(path.join(worktree, name));
  try {
    // Not a preview tab: opening a preview would replace a preview tab the user already has open.
    await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: true });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const tab = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri.toString());
    if (tab) await vscode.window.tabGroups.close(tab, true);
    log(`git: pointed VS Code's Git at ${worktree} (opened ${name} for a moment)`);
  } catch (e) {
    log(`git: could not open ${name}: ${String(e)}`);
  }
}

export async function syncGit(
  change: { left: string[]; arrived: string[]; nudge?: string },
  log: (line: string) => void,
): Promise<void> {
  const api = await builtInGit().catch(() => undefined);
  if (!api) {
    log('git: the built-in Git extension is not available');
    return;
  }
  for (const folder of change.left) {
    // Only an exact root match: `git.close` given a path inside another repo would close that one.
    if (!exactRepo(api, folder)) continue;
    await vscode.commands.executeCommand('git.close', vscode.Uri.file(folder)).then(
      () => log(`git: closed ${folder} in Source Control`),
      (e: unknown) => log(`git: could not close ${folder}: ${String(e)}`),
    );
  }
  for (const folder of change.arrived) {
    if (exactRepo(api, folder) || !api.openRepository) continue;
    // openRepository also re-opens a repo VS Code closed earlier (it would not do that by itself).
    const repo = await withTimeout(api.openRepository(vscode.Uri.file(folder)), OPEN_REPO_TIMEOUT_MS, null);
    log(repo ? `git: opened ${folder} in Source Control` : `git: could not open ${folder} in Source Control`);
  }
  if (change.nudge) await flashFile(change.nudge, log);
}
