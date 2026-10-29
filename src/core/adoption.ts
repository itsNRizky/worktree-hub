// After a window reload, VS Code reconnects to the same terminal processes but forgets the names
// and options we gave them (seen in testing). The process ID is the
// only thing that stays, so stored records are matched to live terminals by process ID.
import type { TerminalRecord } from './agentTypes';

export interface LiveTerminal {
  processId: number | undefined;
}

/**
 * `isAlive(pid)` says whether the process still runs. VS Code may re-attach restored terminals a
 * little after the extension starts, so a record whose process runs is kept even before its
 * terminal shows up (it is linked when the terminal opens). After a full quit the old processes
 * are dead, so their records drop out.
 */
export function planAdoption(
  records: TerminalRecord[],
  live: LiveTerminal[],
  isAlive: (pid: number) => boolean,
): { keep: TerminalRecord[]; drop: TerminalRecord[] } {
  const livePids = new Set(live.map((t) => t.processId).filter((p): p is number => p !== undefined));
  const keep: TerminalRecord[] = [];
  const drop: TerminalRecord[] = [];
  for (const r of records) {
    if (r.processId !== undefined && (livePids.has(r.processId) || isAlive(r.processId))) keep.push(r);
    else drop.push(r);
  }
  return { keep, drop };
}
