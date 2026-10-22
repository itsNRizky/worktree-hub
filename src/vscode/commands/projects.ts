// Add Project / Remove Project. Projects live in the `worktreeHub.projects` user setting.
import * as vscode from 'vscode';
import { addProjectEntry, normalizeProjects, removeProjectEntry } from '../../core/projects';
import type { ProjectNode } from '../../core/treeModel';
import { isMainCheckout } from '../../git/git';
import { readProjectsRaw, writeProjectsRaw } from '../config';
import type { Hub } from '../hub';
import { guarded } from '../ui';

export function registerProjectCommands(hub: Hub): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      'worktreeHub.addProject',
      guarded(async () => {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Add Project',
          title: 'Choose the main checkout of a git repository',
        });
        const folder = picked?.[0]?.fsPath;
        if (!folder) return;
        if (!(await isMainCheckout(folder))) {
          throw new Error(`Not the main checkout of a git repository: ${folder}`);
        }
        const raw = readProjectsRaw();
        if (normalizeProjects(raw).some((p) => p.path === folder)) {
          void vscode.window.showInformationMessage(`${folder} is already in Worktree Hub.`);
          return;
        }
        await writeProjectsRaw(addProjectEntry(raw, folder));
        await hub.refresh();
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.removeProject',
      guarded(async (node: ProjectNode) => {
        if (node?.kind !== 'project') return;
        const ok = await vscode.window.showWarningMessage(
          `Remove ${node.label} from Worktree Hub?`,
          { modal: true, detail: 'Files and worktrees are not touched.' },
          'Remove Project',
        );
        if (ok !== 'Remove Project') return;
        const project = hub.snapshot().projects.find((p) => p.config.path === node.id);
        const paths = project?.worktrees.map((w) => w.path) ?? [];
        if (hub.getActive().some((p) => paths.includes(p))) {
          await hub.switcher.switchTo(null, { userInitiated: false });
        }
        await writeProjectsRaw(removeProjectEntry(readProjectsRaw(), node.id));
        await hub.refresh();
      }),
    ),
  ];
}
