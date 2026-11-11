// Remove Worktree: removes the worktree and every worktree linked to it. Branches are kept.
// The worktree's Claude chats are moved to the main checkout first, so `/resume` there finds them.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findWorktree, type ProjectEntry } from '../../app/repository';
import { claudeConfigDir } from '../../core/chats';
import {
  CHATS_MOVED_LINE,
  chatMoveSummary,
  openInMainPlan,
  openInMainSummary,
  removeDialogText,
  type ChatMoveReport,
  type MainCheck,
} from '../../core/removePlan';
import type { WorktreeNode } from '../../core/treeModel';
import { chatFolder, listChatIds, moveChats } from '../../fs/chatFiles';
import * as git from '../../git/git';
import { discardAndCloseTabs } from '../editorTabs';
import type { Hub } from '../hub';
import { guarded, worktreePathOf } from '../ui';

interface ChatSource {
  branch: string;
  /** The worktree's chat folder. Found before the removal, while the folder still has its real path. */
  from: string;
  main: string;
  chats: number;
}

const mainCheckoutOf = (project: ProjectEntry) => project.worktrees.find((w) => w.isPrimary)?.path ?? project.config.path;

export function registerRemoveWorktree(hub: Hub): vscode.Disposable {
  const configDir = claudeConfigDir(process.env, os.homedir());

  const chatSource = async (wtPath: string, project: ProjectEntry, branch: string): Promise<ChatSource> => {
    const from = await chatFolder(wtPath, configDir);
    const chats = (await listChatIds(from).catch(() => [])).length;
    return { branch, from, main: mainCheckoutOf(project), chats };
  };

  /** Never throws: a chat that cannot be moved must not stop the removal. It stays where it was. */
  const moveChatsToMain = async (c: ChatSource): Promise<ChatMoveReport> => {
    const report: ChatMoveReport = { branch: c.branch, chatFolder: c.from, failed: 0, backups: [] };
    try {
      const r = await moveChats(c.from, await chatFolder(c.main, configDir), new Date());
      for (const f of r.failed) hub.output.appendLine(`Could not move chat ${f.id} from ${c.from}: ${f.reason}`);
      report.failed = r.failed.length;
      report.backups = r.backups;
    } catch (err) {
      hub.output.appendLine(`Could not move the chats in ${c.from}: ${String(err)}`);
      report.failed = c.chats;
    }
    return report;
  };

  const showChatSummary = (reports: ChatMoveReport[]) => {
    const summary = chatMoveSummary(reports);
    if (!summary) return;
    if (reports.some((r) => r.failed > 0)) void vscode.window.showWarningMessage(summary);
    else void vscode.window.showInformationMessage(summary);
  };

  /** A worktree whose folder was deleted by hand: let git forget it. Its chats still exist, so they move too. */
  const removeMissing = async (wtPath: string, project: ProjectEntry, label: string) => {
    const source = await chatSource(wtPath, project, label);
    const detail = `Its folder is gone. Git will forget it (git worktree prune). The branch is kept.`;
    const ok = await vscode.window.showWarningMessage(
      `Forget the missing worktree ${label}?`,
      { modal: true, detail: source.chats > 0 ? `${detail}\n${CHATS_MOVED_LINE}` : detail },
      'Forget Worktree',
    );
    if (ok !== 'Forget Worktree') return;
    hub.registry.disposeForWorktrees([wtPath]);
    showChatSummary([await moveChatsToMain(source)]);
    await git.pruneWorktrees(project.config.path);
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
        await removeMissing(clicked, found.project, found.worktree.branch ?? path.basename(clicked));
        return;
      }

      const group = hub.links.groupOf(clicked);
      const entries = group
        .map((p) => findWorktree(hub.snapshot(), p))
        .filter((e): e is NonNullable<typeof e> => !!e && !e.worktree.isPrimary);
      const sources = await Promise.all(
        entries.map((e) => chatSource(e.worktree.path, e.project, e.worktree.branch ?? path.basename(e.worktree.path))),
      );
      const items = await Promise.all(
        entries.map(async (e, i) => ({
          repoName: e.project.name,
          branch: sources[i].branch,
          // Fresh count, not the cached one: the user may have changed files since the last refresh.
          dirtyCount: e.worktree.missing ? 0 : await git.dirtyCount(e.worktree.path).catch(() => e.worktree.dirtyCount),
          openTerminals: hub.registry.forWorktrees([e.worktree.path]).length,
          chats: sources[i].chats,
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
      const reports: ChatMoveReport[] = [];
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: message.replace('?', '…') },
        async () => {
          for (const [i, e] of entries.entries()) {
            // The terminals are closed. If Claude still writes a last line, moveChats copies it again.
            reports.push(await moveChatsToMain(sources[i]));
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
      showChatSummary(reports);

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
