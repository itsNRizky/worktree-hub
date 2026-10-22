// Copies untracked files (such as `.env`) from the main checkout into a new worktree.
// A new worktree only has the files git tracks, so these would be missing otherwise.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isInside } from '../core/names';

export interface CopyResult {
  copied: string[];
  /** Not found in the main checkout. */
  missing: string[];
  /** Already present in the worktree (never overwritten), or a path that leaves the worktree. */
  skipped: string[];
}

export async function copyFiles(fromRoot: string, toRoot: string, files: string[]): Promise<CopyResult> {
  const result: CopyResult = { copied: [], missing: [], skipped: [] };
  for (const file of files) {
    const src = path.resolve(fromRoot, file);
    const dst = path.resolve(toRoot, file);
    // A setting like "../x" or "/etc/hosts" must never write outside the worktree.
    if (path.isAbsolute(file) || !isInside(src, fromRoot) || !isInside(dst, toRoot)) {
      result.skipped.push(file);
      continue;
    }
    try {
      await fs.access(src);
    } catch {
      result.missing.push(file);
      continue;
    }
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      // COPYFILE_EXCL makes the copy fail instead of overwriting an existing file.
      await fs.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
      result.copied.push(file);
    } catch {
      result.skipped.push(file);
    }
  }
  return result;
}

export function formatCopyResult(r: CopyResult): string {
  const parts: string[] = [];
  if (r.copied.length) parts.push(`Copied: ${r.copied.join(', ')}`);
  if (r.missing.length) parts.push(`Not found: ${r.missing.join(', ')}`);
  if (r.skipped.length) parts.push(`Skipped: ${r.skipped.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'No files to copy.';
}
