import { describe, expect, it } from 'vitest';
import { planAdoption } from '../../src/core/adoption';
import type { TerminalRecord } from '../../src/core/agentTypes';

const rec = (id: string, processId?: number): TerminalRecord => ({
  id,
  kind: 'agent',
  worktreePath: '/w',
  name: `Claude · w ${id}`,
  processId,
});

describe('planAdoption', () => {
  it('keeps a record whose process is still running (window reload)', () => {
    const r = rec('a', 93886);
    expect(planAdoption([r], [{ processId: 93886 }])).toEqual({ keep: [r], drop: [] });
  });

  it('drops a record whose process is gone (VS Code started a new shell after a quit)', () => {
    const r = rec('a', 93886);
    expect(planAdoption([r], [{ processId: 15642 }])).toEqual({ keep: [], drop: [r] });
  });

  it('drops a record without a process id', () => {
    const r = rec('a');
    expect(planAdoption([r], [{ processId: undefined }])).toEqual({ keep: [], drop: [r] });
  });

  it('ignores live terminals that match no record', () => {
    expect(planAdoption([], [{ processId: 1 }, { processId: 2 }])).toEqual({ keep: [], drop: [] });
  });
});
