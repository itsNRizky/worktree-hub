// Texts for the status bar item and the "agents waiting" badge.
import type { AgentStatus } from './agentTypes';

/** `$(name)` is VS Code's syntax for an icon inside status bar text. */
export function statusBarText(active: { repoName: string; branch: string; linked: boolean } | undefined): string {
  if (!active) return '$(git-branch) Worktree Hub';
  return `$(git-branch) ${active.repoName} › ${active.branch}${active.linked ? ' $(link)' : ''}`;
}

export function waitingCount(statuses: Iterable<AgentStatus>): number {
  let n = 0;
  for (const s of statuses) if (s.state === 'waiting') n++;
  return n;
}

export function badgeTooltip(n: number): string {
  return n === 1 ? '1 agent is waiting for you' : `${n} agents are waiting for you`;
}
