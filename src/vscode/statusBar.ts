// The status bar item (active task) and the badge on the Worktree Hub icon (agents waiting).
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findWorktree } from '../app/repository';
import { badgeTooltip, statusBarText, waitingCount } from '../core/statusText';
import type { Hub } from './hub';

export function registerStatusBar(hub: Hub): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'workbench.view.extension.worktreeHub';
  item.tooltip = 'Show Worktree Hub';
  item.show();

  const update = () => {
    const first = hub.getActive()[0];
    const found = first ? findWorktree(hub.snapshot(), first) : undefined;
    item.text = statusBarText(
      found && {
        repoName: found.project.name,
        branch: found.worktree.branch ?? path.basename(first),
        linked: hub.links.isLinked(first),
      },
    );
    // Only agents that still have a terminal count.
    const ids = new Set(hub.registry.records.map((r) => r.id));
    const live = [...hub.statuses.all().values()].filter((s) => ids.has(s.agentId));
    const n = waitingCount(live);
    hub.view.badge = n > 0 ? { value: n, tooltip: badgeTooltip(n) } : undefined;
  };

  hub.onRender(update);
  update();
  return item;
}
