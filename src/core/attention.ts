// When an agent's status change should pop up a notification, and what it says.
import type { AgentState } from './agentTypes';

export type Attention = 'waiting' | 'done';

/** Only a change into "waiting" or "done" counts, so the same state read twice pops up once. */
export function attentionFor(prev: AgentState | undefined, next: AgentState): Attention | undefined {
  if (prev === next) return undefined;
  return next === 'waiting' || next === 'done' ? next : undefined;
}

export function attentionMessage(kind: Attention, repoName: string, branch: string): string {
  const what = kind === 'done' ? 'Claude finished' : 'Claude needs your answer';
  return `${what}: ${repoName} › ${branch}`;
}
