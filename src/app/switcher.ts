// The switch: makes the whole window show one task (a worktree plus its linked worktrees).
// It talks to VS Code only through `SwitchPorts`, so the order of steps can be unit-tested.
import type { TabRecord } from '../core/tabs';

export interface SwitchPorts {
  getActive(): string[];
  setActive(paths: string[]): Promise<void>;
  saveAndCloseTabs(paths: string[]): Promise<Map<string, TabRecord[]>>;
  storeTabs(worktree: string, tabs: TabRecord[]): Promise<void>;
  loadTabs(worktree: string): TabRecord[];
  setFolders(paths: string[]): Promise<void>;
  restoreTabs(tabs: TabRecord[]): Promise<void>;
  /** Shows the task's last-used terminal. False when the task has no terminal. */
  showLastTerminal(paths: string[]): boolean;
  hasEverHadAgent(path: string): boolean;
  startAgent(path: string): Promise<void>;
  /** Opens a plain shell in the worktree. Nothing is typed into it. */
  startShell(path: string): Promise<void>;
  /**
   * Keeps VS Code's own Git (Source Control view, bottom-left branch) in step with the switch:
   * close the repos of worktrees that `left`, open those that `arrived`, and, when `nudge` is set,
   * make VS Code's status show that worktree (see src/core/gitNudge.ts).
   */
  syncGit(change: { left: string[]; arrived: string[]; nudge?: string }): Promise<void>;
  reveal(path: string): Promise<void>;
  isMissing(path: string): boolean;
}

export interface SwitchOptions {
  /** A click by the user. Only then may a first agent start by itself. */
  userInitiated: boolean;
  /**
   * 'auto' (default): if the task has no terminal, open one, so the terminal on screen always
   * belongs to the task on screen. 'none': the caller opens its own terminal right after.
   */
  terminal?: 'auto' | 'none';
}

export class Switcher {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly ports: SwitchPorts,
    private readonly groupOf: (path: string) => string[],
  ) {}

  /**
   * `path` = the worktree the user clicked (its linked worktrees come along); null = hub only.
   * Switches run one after another: a second click waits until the first switch is finished.
   */
  switchTo(path: string | null, opts: SwitchOptions): Promise<void> {
    const run = this.chain.then(() => this.run(path, opts));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(path: string | null, opts: SwitchOptions): Promise<void> {
    const p = this.ports;
    if (path !== null && p.isMissing(path)) throw new Error(`The worktree folder is missing: ${path}`);

    // The clicked worktree goes first: it is the task's focus (status bar, VS Code's Git, terminal).
    const target =
      path === null ? [] : [path, ...this.groupOf(path).filter((w) => w !== path && !p.isMissing(w))];
    const active = p.getActive();
    const sameTask = path !== null && active.length === target.length && target.every((w) => active.includes(w));

    if (sameTask && active[0] !== path) {
      // Another row of the linked task on screen: its folders and tabs are already open, only the
      // focus moves to the clicked worktree.
      await p.setActive(target);
      await p.syncGit({ left: [], arrived: [], nudge: path! });
    }
    if (!sameTask) {
      // Order matters: the old tabs must be captured and closed while their folders are still in
      // the workspace, and the new tabs can only be opened once the new folders are there.
      if (active.length) {
        const saved = await p.saveAndCloseTabs(active);
        for (const w of active) await p.storeTabs(w, saved.get(w) ?? []);
      }
      await p.setFolders(target);
      // Record the new task as soon as its folders are open: if a later step fails, the next switch
      // must save B's tabs, not overwrite A's remembered tabs with an empty list.
      await p.setActive(target);
      const left = active.filter((w) => !target.includes(w));
      const arrived = target.filter((w) => !active.includes(w));
      if (path === null) {
        await p.syncGit({ left, arrived });
        return;
      }
      const tabs = target.flatMap((w) => p.loadTabs(w));
      await p.restoreTabs(tabs);
      // A restored file already makes VS Code's Git follow; without one, it would keep the old repo.
      await p.syncGit({ left, arrived, nudge: tabs.length === 0 ? path : undefined });
    }
    if (path === null) return;

    // Reveal before the terminal: revealing moves focus to the Explorer, and the terminal (or a new
    // agent) should end up with the focus, ready for typing.
    await p.reveal(path);
    // Only the clicked worktree's own terminals: in a linked task, clicking the backend row must not
    // show the frontend's agent.
    if (opts.terminal === 'none' || p.showLastTerminal([path])) return;
    // No terminal here. Without one, the previous terminal would stay on screen and look like it
    // belongs here. A first agent starts only if the whole task never had one; a linked task's
    // existing agent already reaches this folder through --add-dir.
    if (opts.userInitiated && !target.some((w) => p.hasEverHadAgent(w))) await p.startAgent(path);
    else await p.startShell(path);
  }
}
