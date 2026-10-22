// Reads and writes the `worktreeHub.projects` user setting.
import * as vscode from 'vscode';
import { normalizeProjects, type ProjectConfig } from '../core/projects';

const SECTION = 'worktreeHub';
const KEY = 'projects';

export function readProjectsRaw(): unknown {
  return vscode.workspace.getConfiguration(SECTION).get(KEY);
}

export function readProjects(): ProjectConfig[] {
  return normalizeProjects(readProjectsRaw());
}

/** Saved in the user settings (Global), not in the hub workspace, so projects follow the user. */
export function writeProjectsRaw(raw: object[]): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(KEY, raw, vscode.ConfigurationTarget.Global);
}

export function onProjectsChanged(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(`${SECTION}.${KEY}`)) cb();
  });
}
