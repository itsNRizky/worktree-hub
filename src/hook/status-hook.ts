// Run by Claude Code for each hook event (see src/core/hookSettings.ts), outside VS Code.
//   stdin:   the event as JSON
//   argv[2]: the folder for status files
//   env:     WORKTREE_HUB_AGENT_ID, set on the agent's terminal by the extension
// It writes <statusDir>/<agentId>.json, which the extension watches.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentStatus } from '../core/agentTypes';
import { reduceHookEvent, type HookPayload } from '../core/hookState';

export function handle(
  stdin: string,
  env: Record<string, string | undefined>,
  statusDir: string,
  now: number,
): void {
  try {
    const agentId = env.WORKTREE_HUB_AGENT_ID;
    // A Claude the extension did not start: nothing to track.
    if (!agentId || !statusDir || !/^[\w-]+$/.test(agentId)) return;
    const payload = JSON.parse(stdin) as HookPayload;
    const file = path.join(statusDir, `${agentId}.json`);
    let prev: AgentStatus | undefined;
    try {
      prev = JSON.parse(fs.readFileSync(file, 'utf8')) as AgentStatus;
    } catch {
      prev = undefined;
    }
    const next = reduceHookEvent(prev, agentId, payload, now);
    fs.mkdirSync(statusDir, { recursive: true });
    // Write a temp file, then rename: the watcher never sees a half-written file.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next));
    fs.renameSync(tmp, file);
  } catch {
    // Never fail: a hook error would show up inside Claude and distract the user.
  }
}

// Only when run as a script (not when a test imports this file).
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    input = '';
  }
  handle(input, process.env, process.argv[2] ?? '', Date.now());
  process.exit(0);
}
