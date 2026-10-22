import { describe, expect, it } from 'vitest';
import { expandHome, isInside, projectInitials, worktreeFolderName, worktreePath } from '../../src/core/names';

describe('expandHome', () => {
  it('replaces a leading ~ with the home folder', () => {
    expect(expandHome('~/Projects/acme/shop-app', '/Users/n')).toBe('/Users/n/Projects/acme/shop-app');
  });

  it('leaves absolute paths alone', () => {
    expect(expandHome('/abs/path', '/Users/n')).toBe('/abs/path');
  });
});

describe('worktreeFolderName', () => {
  it('turns every slash into a dash', () => {
    expect(worktreeFolderName('feat/abc-123')).toBe('feat-abc-123');
    expect(worktreeFolderName('feat/a/b')).toBe('feat-a-b');
  });
});

describe('worktreePath', () => {
  it('puts the worktree in .worktrees/<repo>/<folder> next to the main checkout', () => {
    expect(worktreePath('/Users/n/Projects/acme/shop-app', 'feat/abc-123')).toBe(
      '/Users/n/Projects/acme/.worktrees/shop-app/feat-abc-123',
    );
  });
});

describe('projectInitials', () => {
  it('uses the first letters of the first two name parts', () => {
    expect(projectInitials('shop-app')).toBe('SA');
    expect(projectInitials('be-shop-app')).toBe('BS');
  });

  it('uses the first two letters of a one-part name', () => {
    expect(projectInitials('fokusify')).toBe('FO');
  });
});

describe('isInside', () => {
  it('is true for a file inside the folder', () => {
    expect(isInside('/w/feat-a/src/x.ts', '/w/feat-a')).toBe(true);
  });

  it('is true for the folder itself', () => {
    expect(isInside('/w/feat-a', '/w/feat-a')).toBe(true);
  });

  it('is false for a sibling folder that only shares a name prefix', () => {
    expect(isInside('/w/feat-ab/x.ts', '/w/feat-a')).toBe(false);
  });
});
