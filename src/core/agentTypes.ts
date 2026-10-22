// Shared types for terminals and agent status.

/**
 * ready = Claude started, no prompt yet · working = busy · waiting = needs the user (permission
 * or a question) · done = finished its turn · ended = the Claude session exited.
 */
export type AgentState = 'ready' | 'working' | 'waiting' | 'done' | 'ended';

/** Written by the hook script (src/hook/status-hook.ts), one file per agent. */
export interface AgentStatus {
  agentId: string;
  state: AgentState;
  sessionId?: string;
  transcriptPath?: string;
  title?: string;
  message?: string;
  updatedAt: number;
}

/** A terminal the extension created. Stored in workspaceState so it survives a window reload. */
export interface TerminalRecord {
  id: string;
  kind: 'agent' | 'shell';
  worktreePath: string;
  /** The label we gave it. VS Code's own terminal name changes after a reload, this one does not. */
  name: string;
  processId?: number;
}
