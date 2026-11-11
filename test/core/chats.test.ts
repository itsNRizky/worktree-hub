import { describe, expect, it } from 'vitest';
import { backupName, chatFolderName, claudeConfigDir, compareChat, moveNote } from '../../src/core/chats';

describe('claudeConfigDir', () => {
  it('uses CLAUDE_CONFIG_DIR when it is set', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/c/claude' }, '/Users/u')).toBe('/c/claude');
  });
  it('falls back to ~/.claude when it is missing or empty', () => {
    expect(claudeConfigDir({}, '/Users/u')).toBe('/Users/u/.claude');
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '' }, '/Users/u')).toBe('/Users/u/.claude');
  });
});

describe('chatFolderName', () => {
  it('changes every character that is not a letter or a digit to "-"', () => {
    expect(chatFolderName('/Users/u/Projects/.worktrees/web-app/feat-x')).toBe('-Users-u-Projects--worktrees-web-app-feat-x');
  });
  it('changes non-ASCII letters too (verified with Claude Code)', () => {
    expect(chatFolderName('/Users/u/café-日本')).toBe('-Users-u-caf----');
  });
  it('cuts a long name to 200 characters and adds a hash of the full path', () => {
    const n = chatFolderName('/Users/u/Projects/.worktrees/web-app/' + 'a'.repeat(200));
    expect(n).toHaveLength(207);
    expect(n.startsWith('-Users-u-Projects--worktrees-web-app-aaa')).toBe(true);
    // The path's hash is negative (-1232530213): Claude Code uses Math.abs, not an unsigned value.
    expect(n.endsWith('aaaaa-kdteed')).toBe(true);
  });
  it('keeps a name of exactly 200 characters as it is', () => {
    const p = '/' + 'b'.repeat(199);
    expect(chatFolderName(p)).toBe('-' + 'b'.repeat(199));
  });
});

describe('compareChat', () => {
  const b = (s: string) => new TextEncoder().encode(s);
  it('sees the same content', () => expect(compareChat(b('a\nb\n'), b('a\nb\n'))).toBe('same'));
  it('sees that the existing file has more', () => expect(compareChat(b('a\nb\n'), b('a\n'))).toBe('existing-has-more'));
  it('sees that the incoming file has more', () => expect(compareChat(b('a\n'), b('a\nb\n'))).toBe('incoming-has-more'));
  it('sees two files that changed in different ways', () => expect(compareChat(b('a\nb\n'), b('a\nc\n'))).toBe('diverged'));
  it('treats an empty file as the start of any file', () => expect(compareChat(b(''), b('a\n'))).toBe('incoming-has-more'));
});

describe('backupName', () => {
  it('adds the local date and time', () => {
    expect(backupName('abc.jsonl', new Date(2026, 10, 10, 9, 4, 5))).toBe('abc.jsonl.bak-20261110-090405');
  });
});

describe('moveNote', () => {
  it('names the old and new folder and the branch', () => {
    expect(moveNote({ fromFolders: ['/P/web-app'], toFolder: '/P/.worktrees/web-app/fix-x', branch: 'fix/x' })).toBe(
      'This chat moved from /P/web-app to /P/.worktrees/web-app/fix-x, a git worktree on branch fix/x. ' +
        'From now on, read and change files only in /P/.worktrees/web-app/fix-x (and its linked folders, if any). ' +
        'Earlier paths in this chat point to /P/web-app; do not change files there. Reply only "OK".',
    );
  });
  it('joins linked old folders with "and"', () => {
    expect(moveNote({ fromFolders: ['/P/web-app', '/P/api'], toFolder: '/W/x', branch: 'x' })).toContain(
      'moved from /P/web-app and /P/api to /W/x',
    );
  });
});
