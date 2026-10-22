// Turns Claude Code hook events into an agent status (the coloured dot in the sidebar).
import type { AgentState, AgentStatus } from './agentTypes';

/** The JSON Claude Code sends to a hook on stdin (only the fields we use). */
export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  prompt?: string;
  notification_type?: string;
  message?: string;
}

/**
 * Notification types that mean "the user must act". Claude also sends `idle_prompt` about a
 * minute after it finishes; that one must not turn a finished agent yellow.
 */
export const WAITING_NOTIFICATION_TYPES: readonly string[] = ['permission_prompt', 'elicitation_dialog'];

const TITLE_MAX = 60;

function titleFrom(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  return oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine;
}

export function reduceHookEvent(
  prev: AgentStatus | undefined,
  agentId: string,
  p: HookPayload,
  now: number,
): AgentStatus {
  const next = (state: AgentState, keepMessage = false): AgentStatus => {
    const s: AgentStatus = { ...(prev ?? { agentId }), agentId, state, updatedAt: now };
    if (p.session_id) s.sessionId = p.session_id;
    if (p.transcript_path) s.transcriptPath = p.transcript_path;
    if (!keepMessage) delete s.message;
    return s;
  };
  const unchanged = (): AgentStatus => prev ?? next('ready');

  switch (p.hook_event_name) {
    case 'SessionStart':
      return next('ready');
    case 'UserPromptSubmit': {
      const s = next('working');
      // The first prompt names the agent; later prompts do not rename it.
      if (!s.title && p.prompt) s.title = titleFrom(p.prompt);
      return s;
    }
    case 'PostToolUse':
      // A tool ran, so any permission question was answered.
      return next('working');
    case 'Notification': {
      if (!p.notification_type || !WAITING_NOTIFICATION_TYPES.includes(p.notification_type)) return unchanged();
      const s = next('waiting', true);
      if (p.message) s.message = p.message;
      return s;
    }
    case 'Stop':
      return next('done');
    case 'SessionEnd':
      return next('ended');
    default:
      return unchanged();
  }
}
