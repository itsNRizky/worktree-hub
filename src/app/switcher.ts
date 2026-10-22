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
  reveal(path: string): Promise<void>;
  isMissing(path: string): boolean;
}

export class Switcher {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly ports: SwitchPorts,
    private readonly groupOf: (path: string) => string[],
  ) {}

  /**
   * `path` = the worktree the user clicked (its linked worktrees come along); null = hub only.
   * `userInitiated` = a click by the user. Only then may a first agent start by itself.
   * Switches run one after another: a second click waits until the first switch is finished.
   */
  switchTo(path: string | null, opts: { userInitiated: boolean }): Promise<void> {
    const run = this.chain.then(() => this.run(path, opts));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async run(path: string | null, opts: { userInitiated: boolean }): Promise<void> {
    const p = this.ports;
    if (path !== null && p.isMissing(path)) throw new Error(`The worktree folder is missing: ${path}`);

    const target = path === null ? [] : this.groupOf(path).filter((w) => w === path || !p.isMissing(w));
    const active = p.getActive();
    const sameTask = path !== null && active.length === target.length && target.every((w) => active.includes(w));
    if (sameTask) {
      p.showLastTerminal(target);
      await p.reveal(path);
      return;
    }

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
    if (path === null) return;
    await p.restoreTabs(target.flatMap((w) => p.loadTabs(w)));
    // Reveal before the terminal: revealing moves focus to the Explorer, and the terminal (or a new
    // agent) should end up with the focus, ready for typing.
    await p.reveal(path);
    const shown = p.showLastTerminal(target);
    if (!shown && opts.userInitiated && !p.hasEverHadAgent(path)) await p.startAgent(path);
  }
}
