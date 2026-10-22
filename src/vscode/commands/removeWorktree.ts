// Remove Worktree: removes the worktree and every worktree linked to it. Branches are kept.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findWorktree } from '../../app/repository';
import { openInMainPlan, openInMainSummary, removeDialogText, type MainCheck } from '../../core/removePlan';
import type { WorktreeNode } from '../../core/treeModel';
import * as git from '../../git/git';
import { discardAndCloseTabs } from '../editorTabs';
import type { Hub } from '../hub';
import { guarded, worktreePathOf } from '../ui';

export function registerRemoveWorktree(hub: Hub): vscode.Disposable {
  /** A worktree whose folder was deleted by hand: let git forget it. */
  const removeMissing = async (wtPath: string, repo: string, label: string) => {
    const ok = await vscode.window.showWarningMessage(
      `Forget the missing worktree ${label}?`,
      { modal: true, detail: `Its folder is gone. Git will forget it (git worktree prune). The branch is kept.` },
      'Forget Worktree',
    );
    if (ok !== 'Forget Worktree') return;
    await git.pruneWorktrees(repo);
    hub.registry.disposeForWorktrees([wtPath]);
    await hub.deleteTabs([wtPath]);
    await hub.links.unlink(wtPath);
    await hub.refresh();
  };

  return vscode.commands.registerCommand(
    'worktreeHub.removeWorktree',
    guarded(async (arg: WorktreeNode | string) => {
      const clicked = worktreePathOf(arg);
      const found = clicked && findWorktree(hub.snapshot(), clicked);
      if (!clicked || !found) return;
      if (found.worktree.isPrimary) throw new Error('The main checkout cannot be removed.');
      if (found.worktree.missing) {
        await removeMissing(clicked, found.project.config.path, found.worktree.branch ?? path.basename(clicked));
        return;
      }

      const group = hub.links.groupOf(clicked);
      const entries = group
        .map((p) => findWorktree(hub.snapshot(), p))
        .filter((e): e is NonNullable<typeof e> => !!e && !e.worktree.isPrimary);
      const items = await Promise.all(
        entries.map(async (e) => ({
          repoName: e.project.name,
          branch: e.worktree.branch ?? path.basename(e.worktree.path),
          // Fresh count, not the cached one: the user may have changed files since the last refresh.
          dirtyCount: e.worktree.missing ? 0 : await git.dirtyCount(e.worktree.path).catch(() => e.worktree.dirtyCount),
          openTerminals: hub.registry.forWorktrees([e.worktree.path]).length,
        })),
      );

      const { message, detail } = removeDialogText(items);
      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        'Remove',
        'Remove and open in main',
      );
      if (choice !== 'Remove' && choice !== 'Remove and open in main') return;
      const paths = entries.map((e) => e.worktree.path);

      // First stop the agents and drop unsaved edits (the user confirmed), so the switch below has
      // nothing to save into folders that are about to be deleted.
      hub.registry.disposeForWorktrees(paths);
      await discardAndCloseTabs(paths);
      // Then move the window away, so the folders are not open while they are deleted.
      if (hub.getActive().some((p) => paths.includes(p))) {
        const primary = found.project.worktrees.find((w) => w.isPrimary);
        await hub.switcher.switchTo(primary?.path ?? null, { userInitiated: false });
      }
      await hub.deleteTabs(paths);

      const errors: string[] = [];
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: message.replace('?', '…') },
        async () => {
          for (const e of entries) {
            try {
              await git.removeWorktree(e.project.config.path, e.worktree.path);
              // Tidy up `.worktrees/<repo>` when it is empty. Non-recursive: never deletes files.
              await fs.rmdir(path.dirname(e.worktree.path)).catch(() => undefined);
            } catch (err) {
              errors.push(err instanceof Error ? err.message : String(err));
            }
          }
        },
      );

      if (choice === 'Remove and open in main') {
        const checks: MainCheck[] = await Promise.all(
          entries
            .filter((e) => e.worktree.branch)
            .map(async (e) => {
              const primary = e.project.worktrees.find((w) => w.isPrimary)!;
              return {
                repoName: e.project.name,
                repo: e.project.config.path,
                branch: e.worktree.branch!,
                mainDirty: await git.dirtyCount(primary.path).catch(() => 1),
              };
            }),
        );
        const plan = openInMainPlan(checks);
        const switched: MainCheck[] = [];
        for (const c of plan.switch) {
          try {
            await git.switchBranch(c.repo, c.branch);
            switched.push(c);
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }
        const summary = openInMainSummary(switched, plan.skipped);
        if (summary) void vscode.window.showInformationMessage(summary);
      }

      await hub.links.removeGroup(clicked);
      await hub.refresh();
      if (errors.length) throw new Error(errors.join(' · '));
    }),
  );
}
