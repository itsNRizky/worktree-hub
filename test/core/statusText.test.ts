import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '../../src/core/agentTypes';
import { badgeTooltip, statusBarText, waitingCount } from '../../src/core/statusText';

describe('statusBarText', () => {
  it('shows the repo and branch of the active task', () => {
    expect(statusBarText({ repoName: 'shop-app', branch: 'feat/x', linked: false })).toBe(
      '$(git-branch) shop-app › feat/x',
    );
  });

  it('adds a link icon for a linked task', () => {
    expect(statusBarText({ repoName: 'shop-app', branch: 'feat/x', linked: true })).toBe(
      '$(git-branch) shop-app › feat/x $(link)',
    );
  });

  it('shows the extension name when nothing is active', () => {
    expect(statusBarText(undefined)).toBe('$(git-branch) Worktree Hub');
  });
});

describe('waitingCount', () => {
  it('counts the agents waiting for the user', () => {
    expect(waitingCount([{ state: 'waiting' }, { state: 'working' }, { state: 'waiting' }] as AgentStatus[])).toBe(2);
  });
});

describe('badgeTooltip', () => {
  it('uses singular and plural', () => {
    expect(badgeTooltip(1)).toBe('1 agent is waiting for you');
    expect(badgeTooltip(2)).toBe('2 agents are waiting for you');
  });
});
