import { describe, expect, it } from 'vitest';
import { partitionTabs, type TabLike } from '../../src/core/tabs';

const WORKTREES = ['/w/feat-a', '/w/feat-b'];

const text = (fsPath: string, viewColumn = 1, active = false): TabLike => ({
  kind: 'text',
  fsPath,
  uri: `file://${fsPath}`,
  viewColumn,
  active,
});

describe('partitionTabs', () => {
  it('saves and closes a text tab inside a worktree', () => {
    const r = partitionTabs([text('/w/feat-a/src/x.ts', 1, true)], WORKTREES);
    expect(r.save.get('/w/feat-a')).toEqual([{ uri: 'file:///w/feat-a/src/x.ts', viewColumn: 1, active: true }]);
    expect(r.close).toEqual([0]);
  });

  it('leaves a tab in a folder that only shares a name prefix', () => {
    const r = partitionTabs([text('/w/feat-ab/y.ts')], WORKTREES);
    expect(r.save.size).toBe(0);
    expect(r.close).toEqual([]);
  });

  it('leaves tabs outside every worktree', () => {
    const r = partitionTabs([text('/other/z.ts')], WORKTREES);
    expect(r.save.size).toBe(0);
    expect(r.close).toEqual([]);
  });

  it('never closes a Claude diff tab (closing it would reject the edit)', () => {
    const r = partitionTabs([{ kind: 'claudeDiff', fsPath: '/w/feat-a/x.ts', viewColumn: 1, active: false }], WORKTREES);
    expect(r.save.size).toBe(0);
    expect(r.close).toEqual([]);
  });

  it('closes other tabs inside a worktree without saving them for later', () => {
    const r = partitionTabs([{ kind: 'other', fsPath: '/w/feat-b/y.ts', viewColumn: 2, active: false }], WORKTREES);
    expect(r.save.size).toBe(0);
    expect(r.close).toEqual([0]);
  });

  it('keeps the tab order', () => {
    const r = partitionTabs(
      [text('/w/feat-a/1.ts'), text('/other/x.ts'), text('/w/feat-a/2.ts', 2), text('/w/feat-b/3.ts')],
      WORKTREES,
    );
    expect(r.save.get('/w/feat-a')!.map((t) => t.uri)).toEqual(['file:///w/feat-a/1.ts', 'file:///w/feat-a/2.ts']);
    expect(r.save.get('/w/feat-b')!.map((t) => t.uri)).toEqual(['file:///w/feat-b/3.ts']);
    expect(r.close).toEqual([0, 2, 3]);
  });
});
