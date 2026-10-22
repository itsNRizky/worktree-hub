import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '../../src/core/agentTypes';
import { agentsToNotify, planLinkTarget } from '../../src/core/linkPlan';
import type { WorktreeInfo } from '../../src/core/porcelain';

const wt = (path: string, branch: string, isPrimary = false): WorktreeInfo => ({
  path,
  head: 'h',
  branch,
  detached: false,
  bare: false,
  prunable: false,
  locked: false,
  isPrimary,
});

describe('planLinkTarget', () => {
  it('offers an existing worktree that already has the branch', () => {
    const list = [wt('/P/be-shop-app', 'staging', true), wt('/P/.worktrees/be-shop-app/feat-x', 'feat/x')];
    expect(planLinkTarget(list, 'feat/x', 'be-shop-app')).toEqual({
      kind: 'existing',
      path: '/P/.worktrees/be-shop-app/feat-x',
    });
  });

  it('refuses when the main checkout of the other repo is on that branch', () => {
    const list = [wt('/P/be-shop-app', 'feat/x', true)];
    expect(planLinkTarget(list, 'feat/x', 'be-shop-app')).toEqual({
      kind: 'error',
      reason: "be-shop-app's main checkout is on feat/x. Switch it to another branch first.",
    });
  });

  it('creates a new worktree when nobody has the branch', () => {
    expect(planLinkTarget([wt('/P/be-shop-app', 'staging', true)], 'feat/x', 'be-shop-app')).toEqual({
      kind: 'new',
    });
  });
});

describe('agentsToNotify', () => {
  it('types /add-dir only into agents that are idle; busy or waiting ones are skipped', () => {
    const s = (state: AgentStatus['state']): AgentStatus => ({ agentId: 'x', state, updatedAt: 1 });
    const states = new Map([
      ['a', s('ready')],
      ['b', s('done')],
      ['c', s('working')],
      ['d', s('waiting')],
    ]);
    expect(agentsToNotify(['a', 'b', 'c', 'd'], states)).toEqual({ send: ['a', 'b'], busy: ['c', 'd'] });
  });

  it('treats an agent without a status as busy, to be safe', () => {
    expect(agentsToNotify(['z'], new Map())).toEqual({ send: [], busy: ['z'] });
  });
});
