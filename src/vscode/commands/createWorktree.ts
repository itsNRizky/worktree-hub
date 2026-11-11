// New Worktree: step 1 asks for a name (used for the branch and the folder), step 2 for the base
// branch. Then: wait for git fetch → git worktree add from the latest base → copy the listed files
// → switch to it (which starts one agent). Move to Worktree… uses the same steps.
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { withTimeout } from '../../core/async';
import { checkNewWorktree, orderBaseBranches, type CreateCheckDeps } from '../../core/createCheck';
import type { ProjectConfig } from '../../core/projects';
import type { ProjectNode } from '../../core/treeModel';
import { copyFiles, formatCopyResult } from '../../fs/copyFiles';
import * as git from '../../git/git';
import type { Hub } from '../hub';
import { BACK, inputStep, pickStep } from '../multiStep';
import { guarded } from '../ui';

export function createCheckDeps(repo: string): CreateCheckDeps {
  return {
    checkBranchName: (n) => git.checkBranchName(repo, n),
    branchExists: (n) => git.branchExists(repo, n),
    worktrees: () => git.listWorktrees(repo),
    folderExists: async (p) =>
      fs.access(p).then(
        () => true,
        () => false,
      ),
  };
}

/** Asks "Use the existing branch?" Returns true for yes. */
export async function confirmExistingBranch(name: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(
    `The branch ${name} already exists. Use the existing branch?`,
    { modal: true, detail: 'The worktree will check out that branch as it is. Nothing is created from a base branch.' },
    'Use Existing Branch',
  );
  return choice === 'Use Existing Branch';
}

const FETCH_TIMEOUT_MS = 30_000;

/** A `git fetch` that runs at most once per dialog. Resolves to true when it worked. */
export type Fetch = () => Promise<boolean>;

export function fetchOnce(repo: string, log: (line: string) => void): Fetch {
  let run: Promise<boolean> | undefined;
  return () =>
    (run ??= git.fetchPrune(repo).then(
      () => true,
      (e: unknown) => {
        log(`fetch failed in ${repo}: ${String(e)}`);
        return false;
      },
    ));
}

/**
 * Creates the worktree on a new branch from the latest copy of `base`: it waits for the fetch, then
 * starts from origin's copy when the local branch is behind it. Returns what to tell the user, and
 * whether it is a warning (the start point may be old).
 */
export async function addFromLatestBase(
  repo: string,
  folder: string,
  name: string,
  base: string,
  fetch: Fetch,
): Promise<{ text: string; warn: boolean }> {
  const fetched = await withTimeout(fetch(), FETCH_TIMEOUT_MS, false);
  const from = await git.freshestBase(repo, base);
  await git.addWorktreeNewBranch(repo, folder, name, from.ref);
  const lines = [`Started from ${from.ref}.`];
  if (!fetched) lines.push('Could not get the latest from the remote, so it may be old.');
  if (from.note) lines.push(`${from.note}, so the local branch was used.`);
  return { text: lines.join(' '), warn: !fetched || !!from.note };
}

/** Step "base branch": shows the known branches at once and refreshes the list after the fetch. */
export async function pickBaseBranch(
  repo: string,
  preferredSetting: string | undefined,
  title: string,
  step: number,
  totalSteps: number,
  fetch: Fetch,
): Promise<string | typeof BACK | undefined> {
  const preferred = preferredSetting ?? (await git.remoteDefaultBranch(repo));
  const items = orderBaseBranches(await git.listBranches(repo), preferred);
  return pickStep({
    title,
    step,
    totalSteps,
    placeholder: 'Base branch for the new branch',
    items,
    refresh: async () => {
      await fetch();
      return orderBaseBranches(await git.listBranches(repo), preferred);
    },
  });
}

async function pickProject(hub: Hub, node?: ProjectNode): Promise<ProjectConfig | undefined> {
  const projects = hub.snapshot().projects.filter((p) => !p.error);
  if (node?.kind === 'project') return projects.find((p) => p.config.path === node.id)?.config;
  if (projects.length === 0) throw new Error('Add a project first.');
  if (projects.length === 1) return projects[0].config;
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({ label: p.name, description: p.config.path, config: p.config })),
    { title: 'New Worktree', placeHolder: 'Which project?' },
  );
  return picked?.config;
}

export interface CreatedWorktree {
  folder: string;
  /** The name the user typed: the branch name. */
  name: string;
  /** What to tell the user after "Created …": the start point and the copy-files result. */
  text: string;
  /** True when the start point may be old. */
  warn: boolean;
}

/**
 * The two steps and the create work: name, base branch, `git worktree add`, copy files.
 * It shows no message, does not refresh and does not switch. `undefined` = the user cancelled.
 */
export async function createWorktreeSteps(
  hub: Hub,
  project: ProjectConfig,
  title: string,
): Promise<CreatedWorktree | undefined> {
  const repo = project.path;
  const deps = createCheckDeps(repo);
  const fetch = fetchOnce(repo, (line) => hub.output.appendLine(line));

  let name = '';
  let base: string | undefined;
  let folder = '';
  let useExisting = false;
  // Loop so the Back button on step 2 returns to step 1 with the typed name kept.
  for (;;) {
    const typed = await inputStep({
      title,
      step: 1,
      totalSteps: 2,
      value: name,
      prompt: 'Name for the branch and the worktree folder',
      placeholder: 'Type your worktree name',
      validate: async (v) => {
        const r = await checkNewWorktree(repo, v, deps);
        return r.ok ? undefined : r.reason;
      },
    });
    if (typed === undefined) return undefined;
    name = typed;
    const check = await checkNewWorktree(repo, name, deps);
    if (!check.ok) throw new Error(check.reason);
    folder = check.folder;
    if (check.branchExists) {
      if (!(await confirmExistingBranch(name))) return undefined;
      useExisting = true;
      break;
    }
    const picked = await pickBaseBranch(repo, project.defaultBaseBranch, title, 2, 2, fetch);
    if (picked === BACK) continue;
    if (picked === undefined) return undefined;
    base = picked;
    break;
  }

  const { start, copied } = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating worktree ${name}…` },
    async () => {
      let start = { text: '', warn: false };
      if (useExisting) await git.addWorktreeExistingBranch(repo, folder, name);
      else start = await addFromLatestBase(repo, folder, name, base!, fetch);
      return { start, copied: await copyFiles(repo, folder, project.copyFiles) };
    },
  );
  return { folder, name, text: [start.text, formatCopyResult(copied)].filter(Boolean).join(' '), warn: start.warn };
}

export function registerCreateWorktree(hub: Hub): vscode.Disposable {
  return vscode.commands.registerCommand(
    'worktreeHub.createWorktree',
    guarded(async (node?: ProjectNode) => {
      const project = await pickProject(hub, node);
      if (!project) return;
      const created = await createWorktreeSteps(hub, project, `New Worktree · ${path.basename(project.path)}`);
      if (!created) return;
      const message = [`Created ${created.name}.`, created.text].filter(Boolean).join(' ');
      void (created.warn ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message));
      await hub.refresh();
      // A user action on a brand-new worktree, so the switch starts its first agent.
      await hub.switcher.switchTo(created.folder, { userInitiated: true });
    }),
  );
}
