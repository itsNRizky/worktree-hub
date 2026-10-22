// Puts the active task's worktrees into the workspace (index 1 and up).
import * as vscode from 'vscode';
import { computeFolderUpdate } from '../core/folders';

const TIMEOUT_MS = 10_000;

export class FolderSwapper {
  private chain: Promise<void> = Promise.resolve();

  /**
   * VS Code's rule: do not call updateWorkspaceFolders again until onDidChangeWorkspaceFolders
   * has fired for the previous call. So calls are chained and each one waits for its event.
   */
  setTaskFolders(paths: string[]): Promise<void> {
    const run = this.chain.then(() => this.apply(paths));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async apply(paths: string[]): Promise<void> {
    const current = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    if (current.length === 0) throw new Error('Open the Worktree Hub workspace first.');
    const update = computeFolderUpdate(current, paths);
    if (!update) return;

    let listener: vscode.Disposable | undefined;
    let timer: NodeJS.Timeout | undefined;
    // Listen before calling, so the event cannot fire before we are waiting for it.
    const changed = new Promise<void>((resolve, reject) => {
      listener = vscode.workspace.onDidChangeWorkspaceFolders(() => resolve());
      timer = setTimeout(() => reject(new Error('VS Code did not confirm the folder change.')), TIMEOUT_MS);
    });
    try {
      // start is always 1: index 0 is the hub, and changing it would restart all extensions.
      const ok = vscode.workspace.updateWorkspaceFolders(
        update.start,
        update.deleteCount,
        ...update.add.map((p) => ({ uri: vscode.Uri.file(p) })),
      );
      if (!ok) throw new Error('VS Code refused the folder change.');
      await changed;
    } finally {
      listener?.dispose();
      clearTimeout(timer);
    }
  }
}
