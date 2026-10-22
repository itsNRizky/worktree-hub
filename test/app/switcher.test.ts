import { describe, expect, it } from 'vitest';
import { Switcher, type SwitchPorts } from '../../src/app/switcher';
import type { TabRecord } from '../../src/core/tabs';

const tab = (uri: string): TabRecord => ({ uri, viewColumn: 1, active: false });

interface FakeOptions {
  active?: string[];
  hasTerminal?: boolean;
  hadAgent?: boolean;
  missing?: string[];
  tabs?: Record<string, TabRecord[]>;
}

function fake(o: FakeOptions = {}) {
  const calls: string[] = [];
  let active = o.active ?? ['A'];
  const tick = () => new Promise<void>((r) => setTimeout(r, 1));
  const ports: SwitchPorts = {
    getActive: () => active,
    setActive: async (p) => {
      await tick();
      active = p;
      calls.push(`setActive(${p.join(',')})`);
    },
    saveAndCloseTabs: async (p) => {
      await tick();
      calls.push(`saveAndCloseTabs(${p.join(',')})`);
      return new Map(p.map((x) => [x, [tab(`${x}/old.ts`)]]));
    },
    storeTabs: async (w) => {
      calls.push(`storeTabs(${w})`);
    },
    loadTabs: (w) => o.tabs?.[w] ?? [],
    setFolders: async (p) => {
      await tick();
      calls.push(`setFolders(${p.join(',')})`);
    },
    restoreTabs: async (t) => {
      calls.push(`restoreTabs(${t.map((x) => x.uri).join(',')})`);
    },
    showLastTerminal: (p) => {
      calls.push(`showLastTerminal(${p.join(',')})`);
      return o.hasTerminal ?? true;
    },
    hasEverHadAgent: () => o.hadAgent ?? true,
    startAgent: async (p) => {
      calls.push(`startAgent(${p})`);
    },
    reveal: async (p) => {
      calls.push(`reveal(${p})`);
    },
    isMissing: (p) => (o.missing ?? []).includes(p),
  };
  return { ports, calls };
}

const solo = (p: string) => [p];

describe('Switcher', () => {
  it('captures the old tabs, swaps folders, restores the new tabs, then shows the terminal', async () => {
    const { ports, calls } = fake({ tabs: { B: [tab('B/x.ts')] } });
    await new Switcher(ports, solo).switchTo('B', { userInitiated: true });
    expect(calls).toEqual([
      'saveAndCloseTabs(A)',
      'storeTabs(A)',
      'setFolders(B)',
      'restoreTabs(B/x.ts)',
      'showLastTerminal(B)',
      'reveal(B)',
      'setActive(B)',
    ]);
  });

  it('only shows the terminal and the folder when the worktree is already active', async () => {
    const { ports, calls } = fake({ active: ['B'] });
    await new Switcher(ports, solo).switchTo('B', { userInitiated: true });
    expect(calls).toEqual(['showLastTerminal(B)', 'reveal(B)']);
  });

  it('opens every worktree of a linked task, in group order', async () => {
    const { ports, calls } = fake({ tabs: { B: [tab('B/1.ts')], B2: [tab('B2/2.ts')] } });
    await new Switcher(ports, () => ['B', 'B2']).switchTo('B', { userInitiated: true });
    expect(calls).toContain('setFolders(B,B2)');
    expect(calls).toContain('restoreTabs(B/1.ts,B2/2.ts)');
  });

  it('leaves out a linked worktree whose folder is missing', async () => {
    const { ports, calls } = fake({ missing: ['B2'] });
    await new Switcher(ports, () => ['B', 'B2']).switchTo('B', { userInitiated: true });
    expect(calls).toContain('setFolders(B)');
  });

  it('starts one agent when the user opens a worktree that never had one', async () => {
    const { ports, calls } = fake({ hasTerminal: false, hadAgent: false });
    await new Switcher(ports, solo).switchTo('B', { userInitiated: true });
    expect(calls.indexOf('startAgent(B)')).toBeGreaterThan(calls.indexOf('restoreTabs()'));
  });

  it('never starts an agent on a switch the extension makes by itself', async () => {
    const { ports, calls } = fake({ hasTerminal: false, hadAgent: false });
    await new Switcher(ports, solo).switchTo('B', { userInitiated: false });
    expect(calls).not.toContain('startAgent(B)');
  });

  it('does not start a new agent where the user already had one', async () => {
    const { ports, calls } = fake({ hasTerminal: false, hadAgent: true });
    await new Switcher(ports, solo).switchTo('B', { userInitiated: true });
    expect(calls).not.toContain('startAgent(B)');
  });

  it('refuses a missing worktree before touching anything', async () => {
    const { ports, calls } = fake({ missing: ['B'] });
    await expect(new Switcher(ports, solo).switchTo('B', { userInitiated: true })).rejects.toThrow(
      'The worktree folder is missing: B',
    );
    expect(calls).toEqual([]);
  });

  it('switching to nothing closes the task and leaves only the hub', async () => {
    const { ports, calls } = fake();
    await new Switcher(ports, solo).switchTo(null, { userInitiated: false });
    expect(calls).toEqual(['saveAndCloseTabs(A)', 'storeTabs(A)', 'setFolders()', 'setActive()']);
  });

  it('runs two switches one after the other, never mixed', async () => {
    const { ports, calls } = fake();
    const s = new Switcher(ports, solo);
    await Promise.all([s.switchTo('B', { userInitiated: true }), s.switchTo('C', { userInitiated: true })]);
    expect(calls.indexOf('setActive(B)')).toBeLessThan(calls.indexOf('saveAndCloseTabs(B)'));
    expect(calls.at(-1)).toBe('setActive(C)');
  });
});
