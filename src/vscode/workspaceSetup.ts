// The hub workspace: a saved .code-workspace whose first folder is an empty "Hub" folder.
// It must be a saved workspace from the start: adding a second folder to a single-folder window
// would reload the window and kill running terminals.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { hubWorkspaceJson } from '../core/folders';

export function hubPaths(home: string = os.homedir()): { dir: string; file: string } {
  const dir = path.join(home, '.worktree-hub');
  return { dir, file: path.join(dir, 'worktree-hub.code-workspace') };
}

export function isHubWorkspace(): boolean {
  const file = vscode.workspace.workspaceFile;
  return file?.scheme === 'file' && file.fsPath === hubPaths().file;
}

export async function setupWorkspace(): Promise<void> {
  if (isHubWorkspace()) {
    void vscode.window.showInformationMessage('This window already uses the Worktree Hub workspace.');
    return;
  }
  const { dir, file } = hubPaths();
  // Opening a workspace reloads this window, so ask first and explain the one setting it changes.
  const choice = await vscode.window.showInformationMessage(
    'Open the Worktree Hub workspace?',
    {
      modal: true,
      detail:
        `This window reloads and opens ${file}.\n\n` +
        'Worktree Hub turns off the terminal tab strip in that workspace, because the sidebar lists the terminals.',
    },
    'Open Workspace',
  );
  if (choice !== 'Open Workspace') return;
  await fs.mkdir(dir, { recursive: true });
  try {
    // 'wx' fails if the file exists, so an existing workspace (with its folders) is never overwritten.
    await fs.writeFile(file, JSON.stringify(hubWorkspaceJson(), null, 2), { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(file));
}
