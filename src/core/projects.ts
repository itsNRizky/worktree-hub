// The `worktreeHub.projects` setting. The user can edit it by hand, so every value is checked.
import * as os from 'node:os';
import { expandHome } from './names';

export interface ProjectConfig {
  /** Absolute path of the main checkout. */
  path: string;
  /** Pre-selected in the base-branch picker when creating a worktree. */
  defaultBaseBranch?: string;
  /** Files copied from the main checkout into every new worktree, e.g. `.env`. */
  copyFiles: string[];
}

export const DEFAULT_COPY_FILES: string[] = ['.env', '.claude/settings.local.json'];

function cleanPath(p: string, home: string): string {
  const expanded = expandHome(p.trim(), home);
  return expanded.length > 1 ? expanded.replace(/\/+$/, '') : expanded;
}

function entries(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null);
}

export function normalizeProjects(raw: unknown, home: string = os.homedir()): ProjectConfig[] {
  const seen = new Set<string>();
  const result: ProjectConfig[] = [];
  for (const e of entries(raw)) {
    if (typeof e.path !== 'string' || e.path.trim() === '') continue;
    const p = cleanPath(e.path, home);
    if (seen.has(p)) continue;
    seen.add(p);
    const project: ProjectConfig = {
      path: p,
      copyFiles: Array.isArray(e.copyFiles) ? e.copyFiles.filter((f): f is string => typeof f === 'string') : [],
    };
    if (typeof e.defaultBaseBranch === 'string' && e.defaultBaseBranch.trim() !== '') {
      project.defaultBaseBranch = e.defaultBaseBranch.trim();
    }
    result.push(project);
  }
  return result;
}

/** The setting's new raw value with the project added (unchanged if it is already there). */
export function addProjectEntry(raw: unknown, projectPath: string, home: string = os.homedir()): object[] {
  const list = entries(raw);
  const target = cleanPath(projectPath, home);
  if (list.some((e) => typeof e.path === 'string' && cleanPath(e.path, home) === target)) return list;
  return [...list, { path: projectPath, copyFiles: [...DEFAULT_COPY_FILES] }];
}

/** The setting's new raw value without the project. Matches `~/x` and `/Users/me/x` as the same path. */
export function removeProjectEntry(raw: unknown, projectPath: string, home: string = os.homedir()): object[] {
  const target = cleanPath(projectPath, home);
  return entries(raw).filter((e) => !(typeof e.path === 'string' && cleanPath(e.path, home) === target));
}
