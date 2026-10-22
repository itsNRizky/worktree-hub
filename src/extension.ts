import * as vscode from 'vscode';
import { loadSnapshot, type Snapshot } from './app/repository';
import { buildTreeModel } from './core/treeModel';
import * as git from './git/git';
import { registerSpike } from './spike/spike';
import { onProjectsChanged, readProjects } from './vscode/config';
import { WorktreeTreeProvider } from './vscode/treeProvider';

const REFRESH_INTERVAL_MS = 15_000;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Worktree Hub');
  context.subscriptions.push(output);

  const provider = new WorktreeTreeProvider(vscode.Uri.joinPath(context.globalStorageUri, 'icons'));
  const view = vscode.window.createTreeView('worktreeHub.tree', { treeDataProvider: provider });
  context.subscriptions.push(view);

  let snapshot: Snapshot = { projects: [] };

  // Refreshes can be triggered from many places at once (timer, focus, settings). Only one runs at a
  // time; a request that arrives while one is running schedules exactly one more run afterwards.
  let running: Promise<void> | undefined;
  let again = false;
  const refresh = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        const projects = readProjects();
        void vscode.commands.executeCommand('setContext', 'worktreeHub.noProjects', projects.length === 0);
        snapshot = await loadSnapshot(projects, git);
        provider.setModel(
          buildTreeModel({
            snapshot,
            isLinked: () => false,
            activePaths: [],
            terminals: [],
            statuses: new Map(),
            now: Date.now(),
          }),
        );
      } while (again);
    })()
      .catch((e: unknown) => output.appendLine(`refresh failed: ${String(e)}`))
      .finally(() => {
        running = undefined;
      });
    return running;
  };

  void vscode.commands.executeCommand('setContext', 'worktreeHub.isHub', false);

  context.subscriptions.push(
    vscode.commands.registerCommand('worktreeHub.refresh', refresh),
    onProjectsChanged(refresh),
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) void refresh();
    }),
  );
  const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void refresh();

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    registerSpike(context, output);
  }
}

export function deactivate(): void {}
