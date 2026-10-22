// Turns the loaded data into the sidebar's rows. Pure, so the tree's content can be unit-tested;
// src/vscode/treeProvider.ts only maps these nodes to VS Code TreeItems.
import type { ProjectEntry, Snapshot, WorktreeEntry } from '../app/repository';
import type { AgentState, AgentStatus, TerminalRecord } from './agentTypes';
import { projectInitials } from './names';
import { formatRelative } from './relativeTime';

export interface ProjectNode {
  kind: 'project';
  id: string;
  label: string;
  initials: string;
  children: (WorktreeNode | ErrorNode)[];
}

export interface WorktreeNode {
  kind: 'worktree';
  id: string;
  label: string;
  description: string;
  isPrimary: boolean;
  linked: boolean;
  active: boolean;
  missing: boolean;
  children: TerminalNode[];
}

export interface TerminalNode {
  kind: 'terminal';
  id: string;
  termKind: 'agent' | 'shell';
  worktreePath: string;
  label: string;
  description: string;
  state?: AgentState;
}

export interface ErrorNode {
  kind: 'error';
  id: string;
  label: string;
}

export type TreeNode = ProjectNode | WorktreeNode | TerminalNode | ErrorNode;

export interface TreeInput {
  snapshot: Snapshot;
  isLinked(path: string): boolean;
  activePaths: string[];
  terminals: TerminalRecord[];
  statuses: Map<string, AgentStatus>;
  now: number;
}

function terminalNode(rec: TerminalRecord, input: TreeInput): TerminalNode {
  const status = input.statuses.get(rec.id);
  const isAgent = rec.kind === 'agent';
  return {
    kind: 'terminal',
    id: rec.id,
    termKind: rec.kind,
    worktreePath: rec.worktreePath,
    label: isAgent ? (status?.title ?? 'New agent') : rec.name,
    description: isAgent && status ? formatRelative(input.now - status.updatedAt) : '',
    state: isAgent ? status?.state : undefined,
  };
}

function worktreeNode(w: WorktreeEntry, input: TreeInput): WorktreeNode {
  const linked = input.isLinked(w.path);
  // Same convention as the VS Code status bar: `*` means uncommitted changes.
  const label = (w.branch ?? w.head.slice(0, 7)) + (w.dirtyCount > 0 ? '*' : '');
  const description = [w.isPrimary && 'primary', linked && 'linked', w.missing && 'missing']
    .filter(Boolean)
    .join(' · ');
  return {
    kind: 'worktree',
    id: w.path,
    label,
    description,
    isPrimary: w.isPrimary,
    linked,
    active: input.activePaths.includes(w.path),
    missing: w.missing,
    children: input.terminals.filter((t) => t.worktreePath === w.path).map((t) => terminalNode(t, input)),
  };
}

function projectNode(p: ProjectEntry, input: TreeInput): ProjectNode {
  const children: (WorktreeNode | ErrorNode)[] = p.error
    ? [{ kind: 'error', id: `${p.config.path}#error`, label: p.error }]
    : p.worktrees
        .map((w) => worktreeNode(w, input))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.label.localeCompare(b.label));
  return { kind: 'project', id: p.config.path, label: p.name, initials: projectInitials(p.name), children };
}

export function buildTreeModel(input: TreeInput): ProjectNode[] {
  return input.snapshot.projects.map((p) => projectNode(p, input));
}
