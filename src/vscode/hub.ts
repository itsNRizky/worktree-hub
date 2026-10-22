// Builds and connects the extension's parts. Commands receive this `Hub` object.
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { findWorktree, loadSnapshot, type Snapshot } from '../app/repository';
import { Switcher, type SwitchPorts } from '../app/switcher';
import { buildClaudeCommand } from '../core/claudeCommand';
import { LinkStore } from '../core/links';
import type { TabRecord } from '../core/tabs';
import { buildTreeModel } from '../core/treeModel';
import * as git from '../git/git';
import { ensureHookSettings, statusDirOf, StatusWatcher } from './agentStatus';
import { onProjectsChanged, readProjects } from './config';
import { restoreTabs, saveAndCloseTabs } from './editorTabs';
import { FolderSwapper } from './folderSwapper';
import { pointGitAt } from './gitNudge';
import { TerminalRegistry } from './terminals';
import { WorktreeTreeProvider } from './treeProvider';
import { isHubWorkspace } from './workspaceSetup';

const ACTIVE_KEY = 'worktreeHub.active';
const TABS_KEY = 'worktreeHub.tabs';
const REFRESH_INTERVAL_MS = 15_000;

export interface Hub {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  view: vscode.TreeView<unknown>;
  links: LinkStore;
  registry: TerminalRegistry;
  statuses: StatusWatcher;
  switcher: Switcher;
  folders: FolderSwapper;
  snapshot(): Snapshot;
  /** Reloads git data, then redraws the tree. */
  refresh(): Promise<void>;
  /** Redraws the tree from the data already loaded (cheap). */
  render(): void;
  getActive(): string[];
  setActive(paths: string[]): Promise<void>;
  deleteTabs(worktrees: string[]): Promise<void>;
  startAgent(worktreePath: string): Promise<void>;
  /** Called after every render, e.g. by the status bar. */
  onRender(cb: () => void): void;
}

export async function createHub(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<Hub> {
  const state = context.workspaceState;
  const links = new LinkStore(context.globalState);
  const folders = new FolderSwapper();
  const provider = new WorktreeTreeProvider(vscode.Uri.joinPath(context.globalStorageUri, 'icons'));
  const view = vscode.window.createTreeView('worktreeHub.tree', { treeDataProvider: provider });
  context.subscriptions.push(view);

  let snapshot: Snapshot = { projects: [] };
  const renderListeners: (() => void)[] = [];

  let settingsPath = '';
  try {
    settingsPath = await ensureHookSettings(context);
  } catch (e) {
    output.appendLine(`Could not write the hook settings: ${String(e)}`);
  }

  const getActive = () => state.get<string[]>(ACTIVE_KEY, []);

  // Created before `render` exists, so they call it through these small arrows.
  const statuses = new StatusWatcher(statusDirOf(context), () => render());
  const registry = new TerminalRegistry(
    state,
    () => render(),
    (ids) => ids.forEach((id) => statuses.forget(id)),
  );
  context.subscriptions.push(statuses, registry);

  const render = () => {
    provider.setModel(
      buildTreeModel({
        snapshot,
        isLinked: (p) => links.isLinked(p),
        activePaths: getActive(),
        terminals: registry.records,
        statuses: statuses.all(),
        now: Date.now(),
      }),
    );
    for (const cb of renderListeners) cb();
  };

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
        render();
      } while (again);
    })()
      .catch((e: unknown) => output.appendLine(`refresh failed: ${String(e)}`))
      .finally(() => {
        running = undefined;
      });
    return running;
  };

  const startAgent = async (worktreePath: string) => {
    const addDirs = links.groupOf(worktreePath).filter((p) => p !== worktreePath);
    await registry.createAgent(worktreePath, buildClaudeCommand({ settingsPath, addDirs }));
  };

  const setActive = async (paths: string[]) => {
    await state.update(ACTIVE_KEY, paths);
    render();
  };

  const ports: SwitchPorts = {
    getActive,
    setActive,
    saveAndCloseTabs,
    storeTabs: async (w: string, tabs: TabRecord[]) => {
      await state.update(TABS_KEY, { ...state.get<Record<string, TabRecord[]>>(TABS_KEY, {}), [w]: tabs });
    },
    loadTabs: (w: string) => state.get<Record<string, TabRecord[]>>(TABS_KEY, {})[w] ?? [],
    setFolders: async (paths: string[]) => {
      // Outside the hub workspace, adding a folder would turn the window into a new workspace and
      // reload it, which kills running terminals. So refuse instead.
      if (!isHubWorkspace()) throw new Error('Run "Worktree Hub: Set Up Workspace" first.');
      await folders.setTaskFolders(paths);
    },
    restoreTabs,
    showLastTerminal: (paths: string[]) => {
      // Takes the focus, so the user can type into the agent right after the switch.
      const rec = registry.lastFocused(paths);
      return rec ? registry.show(rec.id) : false;
    },
    hasEverHadAgent: (p: string) => registry.hasEverHadAgent(p),
    startAgent,
    startShell: async (p: string) => {
      await registry.createShell(p);
    },
    pointGitAt,
    reveal: async (p: string) => {
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(p));
    },
    isMissing: (p: string) => findWorktree(snapshot, p)?.worktree.missing ?? !fs.existsSync(p),
  };
  const switcher = new Switcher(ports, (p) => links.groupOf(p));

  context.subscriptions.push(
    onProjectsChanged(() => void refresh()),
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) void refresh();
    }),
  );
  const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // Reconnect to the terminals VS Code kept alive over a window reload, then draw the tree.
  // Not awaited: activation (and so every command) must not wait for slow terminals.
  void registry
    .adopt()
    .then(() => {
      const known = new Set(registry.records.map((r) => r.id));
      for (const id of statuses.all().keys()) if (!known.has(id)) statuses.forget(id);
    })
    .catch((e: unknown) => output.appendLine(`Could not reconnect terminals: ${String(e)}`))
    .finally(() => void refresh());

  return {
    context,
    output,
    view: view as vscode.TreeView<unknown>,
    links,
    registry,
    statuses,
    switcher,
    folders,
    snapshot: () => snapshot,
    refresh,
    render,
    getActive,
    setActive,
    deleteTabs: async (worktrees: string[]) => {
      const all = { ...state.get<Record<string, TabRecord[]>>(TABS_KEY, {}) };
      for (const w of worktrees) delete all[w];
      await state.update(TABS_KEY, all);
    },
    startAgent,
    onRender: (cb) => renderListeners.push(cb),
  };
}
