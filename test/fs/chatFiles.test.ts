import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatFolderName } from '../../src/core/chats';
import { chatFolder, copyChat, listChatIds, moveChats } from '../../src/fs/chatFiles';
import { makeTempDir } from '../helpers/tmpRepo';

// copyFile is wrapped (it still copies), so a test can add a line to a chat during a move.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, copyFile: vi.fn(actual.copyFile) };
});

const NOW = new Date(2026, 10, 10, 12, 34, 56);
const BAK = 'a.jsonl.bak-20261110-123456';

let root: string;
let from: string;
let to: string;

async function put(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const read = (file: string) => fs.readFile(file, 'utf8');

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

beforeEach(async () => {
  root = await makeTempDir();
  from = path.join(root, 'projects', 'wt');
  to = path.join(root, 'projects', 'main');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('listChatIds', () => {
  it('lists chats only: no backups, no folders, no memory', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    await put(path.join(from, 'b.jsonl'), '1\n');
    await put(path.join(from, 'a.jsonl.bak-20261110-000000'), '1\n');
    await put(path.join(from, 'memory', 'x.md'), 'm');
    await put(path.join(from, 'a', 'subagents', 's.jsonl'), 's\n');
    await put(path.join(from, '.session-aliases'), '{}');
    expect(await listChatIds(from)).toEqual(['a', 'b']);
  });

  it('gives an empty list for a folder that does not exist', async () => {
    expect(await listChatIds(path.join(root, 'nope'))).toEqual([]);
  });
});

describe('chatFolder', () => {
  it('uses the real path of the folder', async () => {
    await fs.mkdir(path.join(root, 'real'));
    await fs.symlink(path.join(root, 'real'), path.join(root, 'link'));
    expect(await chatFolder(path.join(root, 'link'), '/c')).toBe(
      path.join('/c', 'projects', chatFolderName(path.join(root, 'real'))),
    );
  });

  it('uses the path as given when the folder is gone', async () => {
    expect(await chatFolder('/Users/u/gone', '/c')).toBe('/c/projects/-Users-u-gone');
  });
});

describe('moveChats', () => {
  it('moves each chat and its subagent folder, and leaves memory and aliases', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    await put(path.join(from, 'a', 'subagents', 's.jsonl'), 's\n');
    await put(path.join(from, 'memory', 'x.md'), 'm');
    await put(path.join(from, '.session-aliases'), '{}');
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 1, backups: [], failed: [] });
    expect(await read(path.join(to, 'a.jsonl'))).toBe('1\n');
    expect(await read(path.join(to, 'a', 'subagents', 's.jsonl'))).toBe('s\n');
    expect(await exists(path.join(from, 'a.jsonl'))).toBe(false);
    expect(await exists(path.join(from, 'a'))).toBe(false);
    expect(await exists(path.join(from, 'memory', 'x.md'))).toBe(true);
    expect(await exists(path.join(from, '.session-aliases'))).toBe(true);
    expect(await exists(path.join(to, 'memory'))).toBe(false);
    expect(await exists(path.join(to, '.session-aliases'))).toBe(false);
  });

  it('creates the target folder when it does not exist', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    const deeper = path.join(root, 'new', 'deeper');
    expect((await moveChats(from, deeper, NOW)).moved).toBe(1);
    expect(await read(path.join(deeper, 'a.jsonl'))).toBe('1\n');
  });

  it('deletes an empty source folder', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    await moveChats(from, to, NOW);
    expect(await exists(from)).toBe(false);
  });

  it('does nothing for a worktree that never had a chat', async () => {
    expect(await moveChats(path.join(root, 'nope'), to, NOW)).toEqual({ moved: 0, backups: [], failed: [] });
    expect(await exists(to)).toBe(false);
  });

  it('does nothing when both folders are the same', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    expect(await moveChats(from, from, NOW)).toEqual({ moved: 0, backups: [], failed: [] });
    expect(await read(path.join(from, 'a.jsonl'))).toBe('1\n');
  });

  it("keeps main's copy when it has more (the carrier comes back)", async () => {
    await put(path.join(to, 'a.jsonl'), '1\n2\n');
    await put(path.join(from, 'a.jsonl'), '1\n');
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 1, backups: [], failed: [] });
    expect(await read(path.join(to, 'a.jsonl'))).toBe('1\n2\n');
    expect(await exists(path.join(from, 'a.jsonl'))).toBe(false);
  });

  it("replaces main's copy when the incoming one has more", async () => {
    await put(path.join(to, 'a.jsonl'), '1\n');
    await put(path.join(from, 'a.jsonl'), '1\n2\n');
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 1, backups: [], failed: [] });
    expect(await read(path.join(to, 'a.jsonl'))).toBe('1\n2\n');
    expect(await exists(path.join(from, 'a.jsonl'))).toBe(false);
    expect((await fs.readdir(to)).filter((n) => n.includes('.tmp-'))).toEqual([]);
  });

  it('keeps both when they changed in different ways', async () => {
    await put(path.join(to, 'a.jsonl'), '1\nx\n');
    await put(path.join(from, 'a.jsonl'), '1\ny\n');
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 1, backups: [BAK], failed: [] });
    expect(await read(path.join(to, 'a.jsonl'))).toBe('1\nx\n');
    expect(await read(path.join(to, BAK))).toBe('1\ny\n');
    expect(await exists(path.join(from, 'a.jsonl'))).toBe(false);
  });

  it('copies a chat again when it grows while it is moved', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    const copyFile = vi.mocked(fs.copyFile);
    const real = copyFile.getMockImplementation()!;
    copyFile.mockImplementationOnce(async (src, dst, mode) => {
      await real(src, dst, mode);
      // Claude writes a last line after the first copy.
      await fs.appendFile(path.join(from, 'a.jsonl'), '2\n');
    });
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 1, backups: [], failed: [] });
    expect(await read(path.join(to, 'a.jsonl'))).toBe('1\n2\n');
    expect(await exists(path.join(from, 'a.jsonl'))).toBe(false);
  });

  it('keeps the source chat when it changes in a different way while it is moved', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    const copyFile = vi.mocked(fs.copyFile);
    const real = copyFile.getMockImplementation()!;
    copyFile.mockImplementationOnce(async (src, dst, mode) => {
      await real(src, dst, mode);
      await fs.writeFile(path.join(from, 'a.jsonl'), 'x\n');
    });
    const r = await moveChats(from, to, NOW);
    expect(r).toEqual({ moved: 0, backups: [], failed: [{ id: 'a', reason: 'changed while it was moved' }] });
    expect(await read(path.join(from, 'a.jsonl'))).toBe('x\n');
  });

  it('keeps the source chat when the copy fails', async () => {
    await put(path.join(from, 'a.jsonl'), '1\n');
    await put(to, 'not a folder');
    const r = await moveChats(from, to, NOW);
    expect(r.moved).toBe(0);
    expect(r.failed.map((f) => f.id)).toEqual(['a']);
    expect(await read(path.join(from, 'a.jsonl'))).toBe('1\n');
  });
});

describe('copyChat', () => {
  it('copies the transcript and its subagent folder under the session id', async () => {
    await put(path.join(from, 's1.jsonl'), '1\n');
    await put(path.join(from, 's1', 'subagents', 'x.jsonl'), 'x\n');
    expect(await copyChat(path.join(from, 's1.jsonl'), 's1', to, NOW)).toEqual({ backups: [] });
    expect(await read(path.join(to, 's1.jsonl'))).toBe('1\n');
    expect(await read(path.join(to, 's1', 'subagents', 'x.jsonl'))).toBe('x\n');
    expect(await read(path.join(from, 's1.jsonl'))).toBe('1\n');
    expect(await read(path.join(from, 's1', 'subagents', 'x.jsonl'))).toBe('x\n');
  });

  it('keeps an older copy that has more as a backup, and puts the moved chat in place', async () => {
    await put(path.join(to, 's1.jsonl'), '1\n2\n');
    await put(path.join(from, 's1.jsonl'), '1\n');
    const r = await copyChat(path.join(from, 's1.jsonl'), 's1', to, NOW);
    expect(r).toEqual({ backups: ['s1.jsonl.bak-20261110-123456'] });
    expect(await read(path.join(to, 's1.jsonl'))).toBe('1\n');
    expect(await read(path.join(to, 's1.jsonl.bak-20261110-123456'))).toBe('1\n2\n');
  });

  it('replaces an older copy that is the start of the moved chat, without a backup', async () => {
    await put(path.join(to, 's1.jsonl'), '1\n');
    await put(path.join(from, 's1.jsonl'), '1\n2\n');
    expect(await copyChat(path.join(from, 's1.jsonl'), 's1', to, NOW)).toEqual({ backups: [] });
    expect(await read(path.join(to, 's1.jsonl'))).toBe('1\n2\n');
  });

  it('fails when the transcript is missing', async () => {
    await expect(copyChat(path.join(from, 'gone.jsonl'), 'gone', to, NOW)).rejects.toThrow();
  });
});
