import { describe, expect, it } from 'vitest';
import { computeFolderUpdate, hubWorkspaceJson } from '../../src/core/folders';

describe('computeFolderUpdate', () => {
  it('replaces the task folders after the hub', () => {
    expect(computeFolderUpdate(['/hub', '/a'], ['/b'])).toEqual({ start: 1, deleteCount: 1, add: ['/b'] });
  });

  it('does nothing when the same folders are already open, in any order', () => {
    expect(computeFolderUpdate(['/hub', '/a', '/b'], ['/b', '/a'])).toBeNull();
  });

  it('adds folders when only the hub is open', () => {
    expect(computeFolderUpdate(['/hub'], ['/a', '/b'])).toEqual({ start: 1, deleteCount: 0, add: ['/a', '/b'] });
  });

  it('removes every task folder for an empty task', () => {
    expect(computeFolderUpdate(['/hub', '/a'], [])).toEqual({ start: 1, deleteCount: 1, add: [] });
  });
});

describe('hubWorkspaceJson', () => {
  it('has the hub as its only folder and hides the terminal tab strip', () => {
    expect(hubWorkspaceJson()).toEqual({
      folders: [{ path: '.', name: 'Hub' }],
      settings: { 'terminal.integrated.tabs.enabled': false },
    });
  });
});
