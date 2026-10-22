// Makes VS Code's own Git status (bottom-left branch, sync button) show the new worktree after a
// switch that brought back no files. VS Code shows the repo of the last file opened in the editor
// and keeps it after that file closes, so opening one file of the worktree for a moment is enough.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { withTimeout } from '../core/async';
import { pickNudgeFile, rootFilesFromLsTree } from '../core/gitNudge';
import { runGit } from '../git/git';

/** The part of the built-in Git extension's API that this needs. */
interface BuiltInGitApi {
  getRepository(uri: vscode.Uri): unknown;
  openRepository?(root: vscode.Uri): Promise<unknown>;
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

export async function pointGitAt(worktree: string): Promise<void> {
  const root = vscode.Uri.file(worktree);
  const api = await builtInGit().catch(() => undefined);
  // The Git extension opens a newly added folder's repo on its own, but maybe not yet: ask for it,
  // because the trick only works once VS Code knows the repo.
  if (api && !api.getRepository(root) && api.openRepository) {
    await withTimeout(api.openRepository(root), OPEN_REPO_TIMEOUT_MS, null);
  }

  const name = pickNudgeFile(rootFilesFromLsTree(await runGit(['ls-tree', 'HEAD'], worktree).catch(() => '')));
  if (!name) return;
  const uri = vscode.Uri.file(path.join(worktree, name));
  try {
    // Not a preview tab: opening a preview would replace a preview tab the user already has open.
    await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: true });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const tab = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri.toString());
    if (tab) await vscode.window.tabGroups.close(tab, true);
  } catch {
    // A file that cannot be shown (binary, deleted): VS Code's Git simply keeps its old repo.
  }
}
