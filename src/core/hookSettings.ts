// The Claude Code settings file passed to agents with `claude --settings <file>`. It only adds
// hooks; the user's own settings and hooks stay as they are (verified in testing).
import { shellQuote } from './claudeCommand';

/**
 * `ELECTRON_RUN_AS_NODE=1` makes VS Code's own executable behave like plain Node, so the hook
 * works even when `node` is not on the PATH of the shell Claude runs hooks in.
 */
export function hookCommand(execPath: string, scriptPath: string, statusDir: string): string {
  return `ELECTRON_RUN_AS_NODE=1 ${shellQuote(execPath)} ${shellQuote(scriptPath)} ${shellQuote(statusDir)}`;
}

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];

export function buildHookSettings(command: string): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const event of EVENTS) {
    const handler = { hooks: [{ type: 'command', command }] };
    // Tool events need a matcher; '*' means every tool.
    hooks[event] = [event === 'PostToolUse' ? { matcher: '*', ...handler } : handler];
  }
  return { hooks };
}
