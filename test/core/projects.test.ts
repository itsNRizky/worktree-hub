import { describe, expect, it } from 'vitest';
import { addProjectEntry, normalizeProjects, removeProjectEntry } from '../../src/core/projects';

describe('normalizeProjects', () => {
  it('expands ~, strips the trailing slash, drops bad entries and defaults copyFiles', () => {
    expect(
      normalizeProjects(
        [{ path: '~/P/a/', defaultBaseBranch: 'staging', copyFiles: ['.env'] }, { nope: 1 }, { path: '/P/a' }],
        '/H',
      ),
    ).toEqual([
      { path: '/H/P/a', defaultBaseBranch: 'staging', copyFiles: ['.env'] },
      { path: '/P/a', copyFiles: [] },
    ]);
  });

  it('keeps only the first of two entries with the same path', () => {
    expect(normalizeProjects([{ path: '/P/a', copyFiles: ['x'] }, { path: '/P/a/' }], '/H')).toEqual([
      { path: '/P/a', copyFiles: ['x'] },
    ]);
  });

  it('returns an empty list when the setting is missing', () => {
    expect(normalizeProjects(undefined)).toEqual([]);
  });
});

describe('addProjectEntry', () => {
  it('appends the project with the default copy list', () => {
    expect(addProjectEntry([], '/P/a')).toEqual([{ path: '/P/a', copyFiles: ['.env', '.claude/settings.local.json'] }]);
  });

  it('does not add the same project twice', () => {
    expect(addProjectEntry([{ path: '/P/a' }], '/P/a')).toEqual([{ path: '/P/a' }]);
  });
});

describe('removeProjectEntry', () => {
  it('removes the entry even when the setting uses ~', () => {
    expect(removeProjectEntry([{ path: '~/P/a' }, { path: '/P/b' }], '/H/P/a', '/H')).toEqual([{ path: '/P/b' }]);
  });
});
