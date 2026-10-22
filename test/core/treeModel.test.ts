import { describe, expect, it } from 'vitest';
import type { AgentStatus, TerminalRecord } from '../../src/core/agentTypes';
import { buildTreeModel, type TreeInput, type WorktreeNode } from '../../src/core/treeModel';
import type { ProjectEntry, WorktreeEntry } from '../../src/app/repository';

const NOW = 1_000_000_000;

function wt(p: Partial<WorktreeEntry> & { path: string }): WorktreeEntry {
  return {
    head: 'abcdef1234567',
    branch: undefined,
    detached: false,
    bare: false,
    prunable: false,
    locked: false,
    isPrimary: false,
    dirtyCount: 0,
    missing: false,
    ...p,
  };
}

const sa: ProjectEntry = {
  config: { path: '/P/shop-app', copyFiles: [] },
  name: 'shop-app',
  worktrees: [
    wt({ path: '/P/.worktrees/shop-app/zeta', branch: 'zeta' }),
    wt({ path: '/P/shop-app', branch: 'main', isPrimary: true }),
    wt({ path: '/P/.worktrees/shop-app/feat-x', branch: 'feat/x', dirtyCount: 2 }),
    wt({ path: '/P/.worktrees/shop-app/det', detached: true }),
    wt({ path: '/P/.worktrees/shop-app/gone', branch: 'gone', missing: true }),
  ],
};

const broken: ProjectEntry = {
  config: { path: '/P/nope', copyFiles: [] },
  name: 'nope',
  worktrees: [],
  error: 'Folder not found: /P/nope',
};

function input(over: Partial<TreeInput> = {}): TreeInput {
  return {
    snapshot: { projects: [sa, broken] },
    isLinked: (p) => p === '/P/.worktrees/shop-app/feat-x',
    activePaths: ['/P/.worktrees/shop-app/feat-x'],
    terminals: [],
    statuses: new Map(),
    now: NOW,
    ...over,
  };
}

const worktrees = (i: TreeInput) => buildTreeModel(i)[0].children as WorktreeNode[];
const byPath = (i: TreeInput, p: string) => worktrees(i).find((w) => w.id === p)!;

describe('buildTreeModel', () => {
  it('shows one project node per project, with initials', () => {
    const model = buildTreeModel(input());
    expect(model.map((p) => p.label)).toEqual(['shop-app', 'nope']);
    expect(model[0].initials).toBe('SA');
  });

  it('puts the primary worktree first and sorts the rest by label', () => {
    expect(worktrees(input()).map((w) => w.label)).toEqual(['main', 'abcdef1', 'feat/x*', 'gone', 'zeta']);
  });

  it('marks dirty, primary, linked, missing and active worktrees', () => {
    const i = input();
    expect(byPath(i, '/P/.worktrees/shop-app/feat-x').label).toBe('feat/x*');
    expect(byPath(i, '/P/shop-app').description).toContain('primary');
    expect(byPath(i, '/P/.worktrees/shop-app/feat-x').description).toContain('linked');
    expect(byPath(i, '/P/.worktrees/shop-app/feat-x').linked).toBe(true);
    expect(byPath(i, '/P/.worktrees/shop-app/gone').description).toContain('missing');
    expect(byPath(i, '/P/.worktrees/shop-app/gone').missing).toBe(true);
    expect(byPath(i, '/P/.worktrees/shop-app/feat-x').active).toBe(true);
    expect(byPath(i, '/P/shop-app').active).toBe(false);
  });

  it('labels a detached worktree with the short commit', () => {
    expect(byPath(input(), '/P/.worktrees/shop-app/det').label).toBe('abcdef1');
  });

  it('shows agents and shells under their worktree', () => {
    const terminals: TerminalRecord[] = [
      { id: 'a1', kind: 'agent', worktreePath: '/P/shop-app', name: 'Claude · shop-app' },
      { id: 'a2', kind: 'agent', worktreePath: '/P/shop-app', name: 'Claude · shop-app #2' },
      { id: 's1', kind: 'shell', worktreePath: '/P/shop-app', name: 'Shell · shop-app' },
    ];
    const statuses = new Map<string, AgentStatus>([
      ['a2', { agentId: 'a2', state: 'working', title: 'Trace flow', updatedAt: NOW - 27 * 60_000 }],
    ]);
    const children = byPath(input({ terminals, statuses }), '/P/shop-app').children;
    expect(children.map((c) => c.label)).toEqual(['New agent', 'Trace flow', 'Shell · shop-app']);
    expect(children[1].description).toBe('27m');
    expect(children[1].state).toBe('working');
    expect(children[2].termKind).toBe('shell');
  });

  it('shows a project error as a single error row', () => {
    const model = buildTreeModel(input());
    expect(model[1].children).toEqual([{ kind: 'error', id: '/P/nope#error', label: 'Folder not found: /P/nope' }]);
  });
});
