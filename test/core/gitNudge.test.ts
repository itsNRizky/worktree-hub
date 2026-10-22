import { describe, expect, it } from 'vitest';
import { pickNudgeFile, rootFilesFromLsTree } from '../../src/core/gitNudge';

describe('rootFilesFromLsTree', () => {
  it('keeps files and skips folders', () => {
    const out = [
      '100644 blob aaa\tREADME.md',
      '040000 tree bbb\tapp',
      '100644 blob ccc\tmy notes.txt',
      '100644 blob ddd\t"we\\\\ird.txt"',
    ].join('\n');
    expect(rootFilesFromLsTree(out)).toEqual(['README.md', 'my notes.txt']);
  });
});

describe('pickNudgeFile', () => {
  it('prefers a README', () => {
    expect(pickNudgeFile(['composer.json', 'README.md', 'artisan'])).toBe('README.md');
  });

  it('falls back to a common project file, then to the first file', () => {
    expect(pickNudgeFile(['artisan', 'composer.json'])).toBe('composer.json');
    expect(pickNudgeFile(['artisan', 'Makefile'])).toBe('artisan');
  });

  it('gives undefined when the worktree has no files at its top level', () => {
    expect(pickNudgeFile([])).toBeUndefined();
  });
});
