// Closes a worktree's editor tabs on switch and opens them again when the user comes back.
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { isInside } from '../core/names';
import { partitionTabs, type TabLike, type TabRecord } from '../core/tabs';

/**
 * Claude Code shows a proposed edit as a diff tab whose sides use its own URI schemes
 * (`_claude_vscode_fs_left`, `_claude_fs_right`, …). Closing that tab rejects the edit.
 */
export function isClaudeDiffTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputTextDiff &&
    (input.original.scheme.startsWith('_claude') || input.modified.scheme.startsWith('_claude'))
  );
}

function toTabLike(tab: vscode.Tab, group: vscode.TabGroup): TabLike {
  const base = { viewColumn: group.viewColumn, active: tab.isActive };
  const input = tab.input;
  if (isClaudeDiffTab(tab)) return { kind: 'claudeDiff', ...base };
  if (input instanceof vscode.TabInputText) {
    const fsPath = input.uri.scheme === 'file' ? input.uri.fsPath : undefined;
    return { kind: 'text', fsPath, uri: input.uri.toString(), ...base };
  }
  if (input instanceof vscode.TabInputTextDiff && input.modified.scheme === 'file') {
    return { kind: 'other', fsPath: input.modified.fsPath, ...base };
  }
  const uri = (input as { uri?: vscode.Uri } | undefined)?.uri;
  if (uri instanceof vscode.Uri && uri.scheme === 'file') return { kind: 'other', fsPath: uri.fsPath, ...base };
  return { kind: 'other', ...base };
}

function allTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((g) => g.tabs);
}

function insideAny(uri: vscode.Uri, worktrees: string[]): boolean {
  return uri.scheme === 'file' && worktrees.some((w) => isInside(uri.fsPath, w));
}

/** Saves unsaved files in the worktrees, remembers their tabs, and closes them. */
export async function saveAndCloseTabs(worktrees: string[]): Promise<Map<string, TabRecord[]>> {
  // Saving (instead of asking) avoids a "Save?" dialog on every switch, and keeps an unsaved
  // buffer from fighting an agent that edits the same file on disk.
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.isDirty && insideAny(doc.uri, worktrees)) await doc.save();
  }

  const tabs = allTabs();
  const groups = vscode.window.tabGroups.all;
  const likes = tabs.map((t) => toTabLike(t, groups.find((g) => g.tabs.includes(t))!));
  const { save, close } = partitionTabs(likes, worktrees);

  // The cursor and scroll position are only known for editors that are visible right now.
  for (const records of save.values()) {
    for (const rec of records) {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === rec.uri && e.viewColumn === rec.viewColumn,
      );
      if (!editor) continue;
      const s = editor.selection;
      rec.selection = [s.anchor.line, s.anchor.character, s.active.line, s.active.character];
      rec.topLine = editor.visibleRanges[0]?.start.line;
    }
  }

  if (close.length) await vscode.window.tabGroups.close(close.map((i) => tabs[i]), true);
  return save;
}

/** Opens remembered tabs again: background tabs first, the active ones last so they end on top. */
export async function restoreTabs(records: TabRecord[]): Promise<void> {
  const ordered = [...records.filter((r) => !r.active), ...records.filter((r) => r.active)];
  for (const rec of ordered) {
    const uri = vscode.Uri.parse(rec.uri);
    if (uri.scheme === 'file' && !fs.existsSync(uri.fsPath)) continue;
    try {
      const selection = rec.selection
        ? new vscode.Selection(rec.selection[0], rec.selection[1], rec.selection[2], rec.selection[3])
        : undefined;
      const editor = await vscode.window.showTextDocument(uri, {
        viewColumn: rec.viewColumn,
        preview: false,
        preserveFocus: true,
        selection,
      });
      if (rec.topLine !== undefined) {
        editor.revealRange(new vscode.Range(rec.topLine, 0, rec.topLine, 0), vscode.TextEditorRevealType.AtTop);
      }
    } catch {
      // A file that cannot be opened any more is simply skipped.
    }
  }
}

/** For Remove worktree: throws away unsaved changes (the user confirmed) and closes the tabs. */
export async function discardAndCloseTabs(worktrees: string[]): Promise<void> {
  for (const doc of vscode.workspace.textDocuments) {
    if (!doc.isDirty || !insideAny(doc.uri, worktrees)) continue;
    // VS Code has no "revert this document" API, so show it and run the Revert command on it.
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('workbench.action.files.revert');
  }
  const tabs = allTabs();
  const groups = vscode.window.tabGroups.all;
  const likes = tabs.map((t) => toTabLike(t, groups.find((g) => g.tabs.includes(t))!));
  const { close } = partitionTabs(likes, worktrees);
  if (close.length) await vscode.window.tabGroups.close(close.map((i) => tabs[i]), true);
}
