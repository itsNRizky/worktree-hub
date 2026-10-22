import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFiles, formatCopyResult } from '../../src/fs/copyFiles';
import { makeTempDir } from '../helpers/tmpRepo';

let root: string;
let from: string;
let to: string;

beforeEach(async () => {
  root = await makeTempDir();
  from = path.join(root, 'main');
  to = path.join(root, 'wt');
  await fs.mkdir(path.join(from, '.claude'), { recursive: true });
  await fs.mkdir(to);
  await fs.writeFile(path.join(from, '.env'), 'SECRET=1');
  await fs.writeFile(path.join(from, '.claude', 'settings.local.json'), '{}');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('copyFiles', () => {
  it('copies a file into a folder that does not exist yet', async () => {
    const r = await copyFiles(from, to, ['.claude/settings.local.json']);
    expect(r.copied).toEqual(['.claude/settings.local.json']);
    expect(await fs.readFile(path.join(to, '.claude', 'settings.local.json'), 'utf8')).toBe('{}');
  });

  it('lists files that are not in the main checkout as missing', async () => {
    const r = await copyFiles(from, to, ['files/conf/.env']);
    expect(r.missing).toEqual(['files/conf/.env']);
    expect(r.copied).toEqual([]);
  });

  it('never overwrites a file that already exists', async () => {
    await fs.writeFile(path.join(to, '.env'), 'MINE=1');
    const r = await copyFiles(from, to, ['.env']);
    expect(r.skipped).toEqual(['.env']);
    expect(await fs.readFile(path.join(to, '.env'), 'utf8')).toBe('MINE=1');
  });

  it('refuses paths that leave the worktree', async () => {
    const r = await copyFiles(from, to, ['../evil', '/etc/hosts']);
    expect(r.skipped).toEqual(['../evil', '/etc/hosts']);
    await expect(fs.access(path.join(root, 'evil'))).rejects.toThrow();
  });
});

describe('formatCopyResult', () => {
  it('says what was copied and what was not found', () => {
    expect(formatCopyResult({ copied: ['.env'], missing: ['x'], skipped: [] })).toBe('Copied: .env · Not found: x');
  });

  it('says so when there was nothing to copy', () => {
    expect(formatCopyResult({ copied: [], missing: [], skipped: [] })).toBe('No files to copy.');
  });
});
