// Moves and copies Claude Code chat files between chat folders (see src/core/chats.ts).
// Remove moves a worktree's chats to the main checkout; Move copies one chat into a new
// worktree. The content of a chat file is never changed: a file is only copied, replaced by a
// longer version of the same chat, or kept next to it as a backup.
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { backupName, chatFolderName, compareChat } from '../core/chats';

/** The chat folder of a folder. A removed worktree has no real path, so its path is used as given. */
export async function chatFolder(dir: string, configDir: string): Promise<string> {
  const real = await fs.realpath(dir).catch(() => dir);
  return path.join(configDir, 'projects', chatFolderName(real));
}

function isMissing(e: unknown): boolean {
  return (e as NodeJS.ErrnoException).code === 'ENOENT';
}

/** The id of every `<id>.jsonl` file. Backups (`.bak-…`), `memory/` and folders are not chats. */
export async function listChatIds(folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl') && e.name !== '.jsonl')
    .map((e) => e.name.slice(0, -'.jsonl'.length))
    .sort();
}

/** A chat's files and folders, relative to its chat folder: `<id>.jsonl`, and everything under `<id>/`. */
async function chatEntries(folder: string, id: string): Promise<{ files: string[]; dirs: string[] }> {
  const files = [`${id}.jsonl`];
  const dirs: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(folder, id), { recursive: true, withFileTypes: true });
  } catch (e) {
    if (isMissing(e)) return { files, dirs };
    throw e;
  }
  dirs.push(id);
  for (const e of entries) {
    const rel = path.relative(folder, path.join(e.parentPath, e.name));
    if (e.isFile()) files.push(rel);
    else if (e.isDirectory()) dirs.push(rel);
  }
  return { files, dirs };
}

/** Writes `src` over `dst` through a temp file, so a crash never leaves a half-written chat. */
async function replaceFile(src: string, dst: string): Promise<void> {
  // The temp name does not end in `.jsonl`, so Claude never lists it as a chat.
  const tmp = path.join(path.dirname(dst), `.${path.basename(dst)}.tmp-${randomBytes(4).toString('hex')}`);
  try {
    await fs.copyFile(src, tmp, fs.constants.COPYFILE_EXCL);
    await fs.rename(tmp, dst);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/**
 * Puts `src` at `dst` when `dst` may already hold another version of the same chat.
 * `existing` (Remove) keeps the copy that has more; `incoming` (Move) always puts `src` at `dst`.
 * Whatever has to make room is kept as a backup. Returns the file that now holds `src`'s content.
 */
async function placeFile(
  src: string,
  dst: string,
  prefer: 'existing' | 'incoming',
  now: Date,
): Promise<{ holder: string; backup?: string }> {
  const incoming = await fs.readFile(src);
  let existing: Buffer;
  try {
    existing = await fs.readFile(dst);
  } catch (e) {
    if (!isMissing(e)) throw e;
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
    return { holder: dst };
  }
  const compare = compareChat(existing, incoming);
  if (compare === 'same') return { holder: dst };
  if (compare === 'incoming-has-more') {
    await replaceFile(src, dst);
    return { holder: dst };
  }
  if (prefer === 'existing' && compare === 'existing-has-more') return { holder: dst };
  const backup = backupName(path.basename(dst), now);
  const backupPath = path.join(path.dirname(dst), backup);
  // COPYFILE_EXCL: a backup is never overwritten. A clash fails this chat instead.
  if (prefer === 'existing') {
    await fs.copyFile(src, backupPath, fs.constants.COPYFILE_EXCL);
    return { holder: backupPath, backup };
  }
  await fs.copyFile(dst, backupPath, fs.constants.COPYFILE_EXCL);
  await replaceFile(src, dst);
  return { holder: dst, backup };
}

/** How often a chat that grows during a move is copied before the move gives up on it. */
const COPY_ATTEMPTS = 3;

export interface MoveChatsResult {
  moved: number;
  /** File names of backups written in the target folder. */
  backups: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Remove's move: every chat of `fromFolder` goes to `toFolder`. A chat is deleted from
 * `fromFolder` only after `toFolder` holds all of it. A chat that fails stays where it was.
 * Throws only when `fromFolder` cannot be listed.
 */
export async function moveChats(fromFolder: string, toFolder: string, now: Date): Promise<MoveChatsResult> {
  const result: MoveChatsResult = { moved: 0, backups: [], failed: [] };
  if (path.resolve(fromFolder) === path.resolve(toFolder)) return result;
  for (const id of await listChatIds(fromFolder)) {
    try {
      const { files, dirs } = await chatEntries(fromFolder, id);
      const holders: string[] = [];
      for (const file of files) {
        const placed = await placeFile(path.join(fromFolder, file), path.join(toFolder, file), 'existing', now);
        holders.push(placed.holder);
        if (placed.backup) result.backups.push(placed.backup);
      }
      // Claude may write a last line after its terminal closed. So each source file is read
      // again right before the delete. When it only grew, it is copied again; any other change
      // fails the chat, and the source stays.
      for (const [i, file] of files.entries()) {
        const src = path.join(fromFolder, file);
        for (let attempt = 1; ; attempt++) {
          const compare = compareChat(await fs.readFile(holders[i]), await fs.readFile(src));
          if (compare === 'same' || compare === 'existing-has-more') break;
          if (compare !== 'incoming-has-more' || attempt === COPY_ATTEMPTS) throw new Error('changed while it was moved');
          await replaceFile(src, holders[i]);
        }
      }
      // Only the files that were moved are deleted. A file that appeared since stays.
      for (const file of files) await fs.rm(path.join(fromFolder, file));
      for (const dir of dirs.sort((a, b) => b.length - a.length)) {
        await fs.rmdir(path.join(fromFolder, dir)).catch(() => undefined);
      }
      result.moved++;
    } catch (e) {
      result.failed.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  // An empty chat folder goes away. One that still holds `memory/` or a failed chat stays.
  await fs.rmdir(fromFolder).catch(() => undefined);
  return result;
}

/**
 * Move's copy: one chat into `toFolder` as `<sessionId>.jsonl`, with its `<sessionId>/` folder.
 * The moved chat always ends up in place, because it is the chat the user picked. Throws on any failure.
 */
export async function copyChat(
  transcriptPath: string,
  sessionId: string,
  toFolder: string,
  now: Date,
): Promise<{ backups: string[] }> {
  const fromFolder = path.dirname(transcriptPath);
  const { files } = await chatEntries(fromFolder, sessionId);
  const backups: string[] = [];
  for (const file of files) {
    const src = file === `${sessionId}.jsonl` ? transcriptPath : path.join(fromFolder, file);
    const placed = await placeFile(src, path.join(toFolder, file), 'incoming', now);
    if (placed.backup) backups.push(placed.backup);
  }
  return { backups };
}
