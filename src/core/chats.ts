// Claude Code chats. Pure functions: no VS Code, no file system access.
//
// Claude Code keeps one chat folder per working directory: `<claude dir>/projects/<name>/`,
// with one `<session id>.jsonl` file per chat. The name rule below was checked against
// Claude Code 2.1.322, including long paths and non-ASCII letters.
import * as path from 'node:path';

/** Claude Code's own folder: `$CLAUDE_CONFIG_DIR` when it is set, else `~/.claude`. */
export function claudeConfigDir(env: Record<string, string | undefined>, home: string): string {
  return env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
}

const MAX_NAME = 200;

/**
 * The chat folder name for a folder: every character that is not an ASCII letter or digit
 * becomes `-` (one per UTF-16 unit). A name over 200 characters is cut, and a hash of the
 * unchanged path is added, so two long paths with the same start still get two folders.
 */
export function chatFolderName(absPath: string): string {
  const name = absPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (name.length <= MAX_NAME) return name;
  let h = 0;
  for (let i = 0; i < absPath.length; i++) h = ((h << 5) - h + absPath.charCodeAt(i)) | 0;
  return `${name.slice(0, MAX_NAME)}-${Math.abs(h).toString(36)}`;
}

export type ChatCompare = 'same' | 'existing-has-more' | 'incoming-has-more' | 'diverged';

/**
 * Compares two copies of the same chat. A chat file only grows at the end, so when one copy
 * is the start of the other, the longer one holds everything. Bytes are compared, not text,
 * so a half-written last line still counts.
 */
export function compareChat(existing: Uint8Array, incoming: Uint8Array): ChatCompare {
  const n = Math.min(existing.length, incoming.length);
  for (let i = 0; i < n; i++) if (existing[i] !== incoming[i]) return 'diverged';
  if (existing.length === incoming.length) return 'same';
  return existing.length > incoming.length ? 'existing-has-more' : 'incoming-has-more';
}

/**
 * `abc.jsonl` → `abc.jsonl.bak-20261110-123456` (local time). The name does not end in
 * `.jsonl`, so Claude's `/resume` does not list the backup.
 */
export function backupName(fileName: string, now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `${fileName}.bak-${date}-${time}`;
}

/**
 * The first message of a moved chat. The chat still remembers its old paths, and the user's
 * own settings may let Claude edit some of those folders without asking, so the note says
 * where to work now.
 */
export function moveNote(o: { fromFolders: string[]; toFolder: string; branch: string }): string {
  const from = o.fromFolders.join(' and ');
  return (
    `This chat moved from ${from} to ${o.toFolder}, a git worktree on branch ${o.branch}. ` +
    `From now on, read and change files only in ${o.toFolder} (and its linked folders, if any). ` +
    `Earlier paths in this chat point to ${from}; do not change files there. Reply only "OK".`
  );
}
