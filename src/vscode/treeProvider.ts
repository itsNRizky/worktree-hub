// Shows the tree model (src/core/treeModel.ts) in the "Worktrees" view.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentState } from '../core/agentTypes';
import type { ProjectNode, TerminalNode, TreeNode, WorktreeNode } from '../core/treeModel';

const COLORS = ['#61afef', '#c678dd', '#98c379', '#e5c07b', '#e06c75', '#56b6c2', '#d19a66', '#a9b1d6'];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export class WorktreeTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private model: ProjectNode[] = [];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  /** `iconDir` is a folder in the extension's global storage for the generated project icons. */
  constructor(private readonly iconDir: vscode.Uri) {}

  setModel(nodes: ProjectNode[]): void {
    this.model = nodes;
    this.changed.fire();
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) return this.model;
    return node.kind === 'project' || node.kind === 'worktree' ? node.children : [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'project':
        return this.projectItem(node);
      case 'worktree':
        return worktreeItem(node);
      case 'terminal':
        return terminalItem(node);
      case 'error': {
        const item = new vscode.TreeItem(node.label);
        item.id = `error:${node.id}`;
        item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        return item;
      }
    }
  }

  private projectItem(node: ProjectNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `project:${node.id}`;
    item.tooltip = node.id;
    item.contextValue = 'project';
    item.iconPath = this.projectIcon(node);
    return item;
  }

  /** A small rounded square with the initials (like Orca's project avatars), written once as an SVG file. */
  private projectIcon(node: ProjectNode): vscode.Uri | vscode.ThemeIcon {
    const color = colorFor(node.label);
    const file = path.join(this.iconDir.fsPath, `${node.initials}-${color.slice(1)}.svg`);
    try {
      if (!fs.existsSync(file)) {
        fs.mkdirSync(this.iconDir.fsPath, { recursive: true });
        fs.writeFileSync(
          file,
          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
            `<rect width="16" height="16" rx="3.5" fill="${color}"/>` +
            `<text x="8" y="11.2" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" ` +
            `font-size="7.5" font-weight="700" fill="#1e2127">${node.initials}</text></svg>`,
        );
      }
      return vscode.Uri.file(file);
    } catch {
      return new vscode.ThemeIcon('repo');
    }
  }
}

function worktreeItem(node: WorktreeNode): vscode.TreeItem {
  const state = node.children.length
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(node.label, state);
  item.id = `worktree:${node.id}`;
  item.description = node.description;
  item.tooltip = node.id;
  item.iconPath = node.missing
    ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'))
    : new vscode.ThemeIcon('git-branch', node.active ? new vscode.ThemeColor('charts.blue') : undefined);
  item.contextValue = node.missing
    ? 'worktree:missing'
    : node.isPrimary
      ? 'worktree:primary'
      : node.linked
        ? 'worktree:linked'
        : 'worktree:plain';
  if (!node.missing) item.command = { command: 'worktreeHub.switch', title: 'Switch', arguments: [node.id] };
  return item;
}

function stateIcon(state: AgentState | undefined): vscode.ThemeIcon {
  switch (state) {
    case 'working':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    case 'waiting':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    case 'done':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('disabledForeground'));
    case 'ended':
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

function terminalItem(node: TerminalNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label);
  item.id = `terminal:${node.id}`;
  item.description = node.description;
  item.contextValue = node.termKind;
  item.iconPath = node.termKind === 'shell' ? new vscode.ThemeIcon('terminal') : stateIcon(node.state);
  item.command = { command: 'worktreeHub.focusTerminal', title: 'Show terminal', arguments: [node.id] };
  return item;
}
