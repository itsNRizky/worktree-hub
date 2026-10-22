// Decides which editor tabs belong to the worktrees being switched away from.
import { isInside } from './names';

/** What we remember about a tab, to open it again when the user comes back. */
export interface TabRecord {
  uri: string;
  viewColumn: number;
  /** The active tab of its editor group. */
  active: boolean;
  /** [anchorLine, anchorChar, activeLine, activeChar] — only for tabs that were visible. */
  selection?: [number, number, number, number];
  topLine?: number;
}

/** A VS Code tab reduced to what the decision needs (see src/vscode/editorTabs.ts). */
export interface TabLike {
  kind: 'text' | 'claudeDiff' | 'other';
  fsPath?: string;
  uri?: string;
  viewColumn: number;
  active: boolean;
}

/**
 * - text tabs inside a worktree: remembered (`save`) and closed;
 * - other tabs inside a worktree (git diffs, previews): closed, not remembered;
 * - Claude diff tabs: never touched, because closing one tells Claude "edit rejected";
 * - everything else (settings, files outside the worktrees): left open.
 * `close` holds indexes into `tabs`.
 */
export function partitionTabs(
  tabs: TabLike[],
  worktrees: string[],
): { save: Map<string, TabRecord[]>; close: number[] } {
  const save = new Map<string, TabRecord[]>();
  const close: number[] = [];
  tabs.forEach((tab, index) => {
    if (tab.kind === 'claudeDiff' || !tab.fsPath) return;
    const owner = worktrees.find((w) => isInside(tab.fsPath!, w));
    if (!owner) return;
    close.push(index);
    if (tab.kind === 'text' && tab.uri) {
      const list = save.get(owner) ?? [];
      list.push({ uri: tab.uri, viewColumn: tab.viewColumn, active: tab.active });
      save.set(owner, list);
    }
  });
  return { save, close };
}
