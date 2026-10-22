// Decisions for "Link to another repo".
import type { AgentStatus } from './agentTypes';
import type { WorktreeInfo } from './porcelain';

export type LinkTarget =
  | { kind: 'existing'; path: string }
  /** Create a worktree in the other repo (the caller still runs checkNewWorktree there). */
  | { kind: 'new' }
  | { kind: 'error'; reason: string };

/**
 * Git lets a branch live in only one worktree. If the other repo already has a worktree on this
 * branch, link to it. If its main checkout is on the branch, stop: linking the main checkout would
 * mean "Remove" later tries to remove it.
 */
export function planLinkTarget(targetWorktrees: WorktreeInfo[], branch: string, targetRepoName: string): LinkTarget {
  const holder = targetWorktrees.find((w) => w.branch === branch);
  if (!holder) return { kind: 'new' };
  if (holder.isPrimary) {
    return {
      kind: 'error',
      reason: `${targetRepoName}'s main checkout is on ${branch}. Switch it to another branch first.`,
    };
  }
  return { kind: 'existing', path: holder.path };
}

/**
 * Which running agents may get `/add-dir <path>` typed in. Only idle ones: typing into a busy
 * agent queues odd input, and typing into a permission prompt would answer the prompt.
 */
export function agentsToNotify(agentIds: string[], states: Map<string, AgentStatus>): { send: string[]; busy: string[] } {
  const send: string[] = [];
  const busy: string[] = [];
  for (const id of agentIds) {
    const state = states.get(id)?.state;
    if (state === 'ready' || state === 'done') send.push(id);
    else busy.push(id);
  }
  return { send, busy };
}
