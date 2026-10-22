// Workspace-folder math. Folder 0 is the permanent "Hub" folder; the active task's worktrees sit
// at index 1 and up. Changing folder 0 would restart every extension, so it is never touched.

export interface FolderUpdate {
  start: 1;
  deleteCount: number;
  add: string[];
}

/**
 * The arguments for `workspace.updateWorkspaceFolders` that turn the open folders into
 * hub + `target`. `current` includes the hub at index 0. Returns null when nothing changes.
 */
export function computeFolderUpdate(current: string[], target: string[]): FolderUpdate | null {
  const open = current.slice(1);
  const same = open.length === target.length && target.every((p) => open.includes(p));
  if (same) return null;
  return { start: 1, deleteCount: open.length, add: [...target] };
}

/** Content of the hub's `.code-workspace` file. `"."` is the folder that holds the file itself. */
export function hubWorkspaceJson(): object {
  return {
    folders: [{ path: '.', name: 'Hub' }],
    // The tab strip would list every terminal of every worktree; the sidebar lists them instead.
    settings: { 'terminal.integrated.tabs.enabled': false },
  };
}
