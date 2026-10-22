// "Switch to Worktree…": a searchable list of all worktrees, for switching from the keyboard.
import * as vscode from 'vscode';
import type { Hub } from '../hub';
import { guarded } from '../ui';

export function registerQuickSwitch(hub: Hub): vscode.Disposable {
  return vscode.commands.registerCommand(
    'worktreeHub.quickSwitch',
    guarded(async () => {
      const items = hub.snapshot().projects.flatMap((p) =>
        p.worktrees
          .filter((w) => !w.missing)
          .map((w) => {
            const agents = hub.registry.forWorktrees([w.path]).filter((r) => r.kind === 'agent');
            const waiting = agents.filter((a) => hub.statuses.get(a.id)?.state === 'waiting').length;
            const detail = agents.length
              ? `${agents.length} agent${agents.length === 1 ? '' : 's'}${waiting ? ` · ${waiting} waiting` : ''}`
              : undefined;
            return { label: w.branch ?? w.head.slice(0, 7), description: p.name, detail, path: w.path };
          }),
      );
      const picked = await vscode.window.showQuickPick(items, {
        title: 'Switch to Worktree',
        placeHolder: 'Type to search branches',
        matchOnDescription: true,
      });
      if (picked) await hub.switcher.switchTo(picked.path, { userInitiated: true });
    }),
  );
}
