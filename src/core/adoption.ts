// After a window reload, VS Code reconnects to the same terminal processes but forgets the names
// and options we gave them (seen in the spike, docs/spike-results.md #5). The process ID is the
// only thing that stays, so stored records are matched to live terminals by process ID.
import type { TerminalRecord } from './agentTypes';

export interface LiveTerminal {
  processId: number | undefined;
}

export function planAdoption(
  records: TerminalRecord[],
  live: LiveTerminal[],
): { keep: TerminalRecord[]; drop: TerminalRecord[] } {
  const livePids = new Set(live.map((t) => t.processId).filter((p): p is number => p !== undefined));
  const keep: TerminalRecord[] = [];
  const drop: TerminalRecord[] = [];
  for (const r of records) {
    // After a full quit VS Code starts new shells with new process IDs, so old records drop out.
    if (r.processId !== undefined && livePids.has(r.processId)) keep.push(r);
    else drop.push(r);
  }
  return { keep, drop };
}
