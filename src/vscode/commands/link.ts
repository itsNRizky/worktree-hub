// Link to Another Repo / Unlink. A link puts worktrees of different repos into one task: they
// open together, agents get `--add-dir` for the others, and Remove removes them together.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findWorktree } from '../../app/repository';
import { checkNewWorktree } from '../../core/createCheck';
import { agentsToNotify, planLinkTarget } from '../../core/linkPlan';
import type { WorktreeNode } from '../../core/treeModel';
import { copyFiles, formatCopyResult } from '../../fs/copyFiles';
import * as git from '../../git/git';
import type { Hub } from '../hub';
import { BACK } from '../multiStep';
import { guarded, worktreePathOf } from '../ui';
import { confirmExistingBranch, createCheckDeps, pickBaseBranch } from './createWorktree';

export function registerLinkCommands(hub: Hub): vscode.Disposable[] {
  /** Makes the folders and the active task match the (new) group, if that task is on screen. */
  const syncActive = async (group: string[], wasActive: boolean) => {
    if (!wasActive) return;
    await hub.folders.setTaskFolders(group);
    await hub.setActive(group);
  };

  return [
    vscode.commands.registerCommand(
      'worktreeHub.link',
      guarded(async (arg: WorktreeNode | string) => {
        const source = worktreePathOf(arg);
        const found = source && findWorktree(hub.snapshot(), source);
        if (!source || !found) return;
        const branch = found.worktree.branch;
        if (!branch) throw new Error('This worktree has no branch (detached HEAD), so there is nothing to link.');

        const group = hub.links.groupOf(source);
        const groupRepos = group.map((p) => findWorktree(hub.snapshot(), p)?.project.config.path);
        const candidates = hub
          .snapshot()
          .projects.filter((p) => !p.error && !groupRepos.includes(p.config.path));
        if (candidates.length === 0) throw new Error('No other project to link. Add the other repo with Add Project first.');
        const picked = await vscode.window.showQuickPick(
          candidates.map((p) => ({ label: p.name, description: p.config.path, project: p })),
          { title: `Link ${branch} to another repo`, placeHolder: 'Which repo?' },
        );
        if (!picked) return;
        const target = picked.project;
        const repo = target.config.path;

        let targetPath: string;
        const plan = planLinkTarget(target.worktrees, branch, target.name);
        if (plan.kind === 'error') throw new Error(plan.reason);
        if (plan.kind === 'existing') {
          const ok = await vscode.window.showInformationMessage(
            `Link to the existing worktree ${plan.path}?`,
            { modal: true },
            'Link',
          );
          if (ok !== 'Link') return;
          targetPath = plan.path;
        } else {
          const check = await checkNewWorktree(repo, branch, createCheckDeps(repo));
          if (!check.ok) throw new Error(check.reason);
          let base: string | undefined;
          if (check.branchExists) {
            if (!(await confirmExistingBranch(branch))) return;
          } else {
            const chosen = await pickBaseBranch(repo, target.config.defaultBaseBranch, `Link · ${target.name}`, 1, 1);
            if (chosen === undefined || chosen === BACK) return;
            base = chosen;
          }
          const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Creating ${branch} in ${target.name}…` },
            async () => {
              if (base) await git.addWorktreeNewBranch(repo, check.folder, branch, base);
              else await git.addWorktreeExistingBranch(repo, check.folder, branch);
              return copyFiles(repo, check.folder, target.config.copyFiles);
            },
          );
          void vscode.window.showInformationMessage(`Created ${branch} in ${target.name}. ${formatCopyResult(result)}`);
          targetPath = check.folder;
        }

        const wasActive = hub.getActive().includes(source);
        await hub.links.link(source, targetPath);
        await hub.refresh();
        await syncActive(hub.links.groupOf(source), wasActive);

        // Agents that are already running were started without the new folder.
        const running = hub.registry
          .forWorktrees(group)
          .filter((r) => r.kind === 'agent')
          .map((r) => r.id);
        if (running.length === 0) return;
        const { send, busy } = agentsToNotify(running, hub.statuses.all());
        const line = `/add-dir ${targetPath}`;
        if (send.length) {
          const ok = await vscode.window.showInformationMessage(
            `Type "${line}" into ${send.length} running agent${send.length === 1 ? '' : 's'}?`,
            'Type It',
            'Not Now',
          );
          if (ok === 'Type It') for (const id of send) hub.registry.sendText(id, line);
        }
        if (busy.length) {
          void vscode.window.showInformationMessage(
            `${busy.length} busy agent${busy.length === 1 ? ' was' : 's were'} skipped. Type "${line}" in ${busy.length === 1 ? 'it' : 'them'} yourself.`,
          );
        }
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.unlink',
      guarded(async (arg: WorktreeNode | string) => {
        const p = worktreePathOf(arg);
        if (!p || !hub.links.isLinked(p)) return;
        const active = hub.getActive();
        const wasActive = active.includes(p);
        await hub.links.unlink(p);
        // Keep showing the rest of the task; if only this worktree was shown, keep showing it.
        const stay = active.find((x) => x !== p) ?? p;
        await syncActive(hub.links.groupOf(stay), wasActive);
        hub.render();
        void vscode.window.showInformationMessage(`Unlinked ${path.basename(p)}. Files and terminals are not touched.`);
      }),
    ),
  ];
}
