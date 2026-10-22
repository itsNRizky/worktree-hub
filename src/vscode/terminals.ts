// Keeps track of the terminals the extension created: which worktree each belongs to, which ones
// run Claude, and which one the user looked at last.
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { planAdoption } from '../core/adoption';
import type { TerminalRecord } from '../core/agentTypes';
import { withTimeout } from '../core/async';
import { terminalName } from '../core/claudeCommand';

const RECORDS_KEY = 'worktreeHub.terminals';
const HAD_AGENT_KEY = 'worktreeHub.hadAgent';
const LAST_KEY = 'worktreeHub.lastTerminal';
/** A terminal's process ID normally arrives at once; a stuck terminal must not block us. */
const PID_TIMEOUT_MS = 3_000;
/** How long a kept record may wait for VS Code to re-attach its terminal after a reload. */
const REATTACH_GRACE_MS = 30_000;

type LastFocus = Record<string, { id: string; at: number }>;

/** True while a process runs. `kill(pid, 0)` sends no signal; it only checks the process exists. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class TerminalRegistry implements vscode.Disposable {
  /** Terminal objects only exist while the window lives; records survive a reload. */
  private readonly live = new Map<string, vscode.Terminal>();
  private readonly subs: vscode.Disposable[] = [];
  private graceTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly state: vscode.Memento,
    private readonly onChange: () => void,
    /** Called with the ids of records that went away, e.g. to delete their status files. */
    private readonly onRemoved: (ids: string[]) => void = () => undefined,
  ) {
    this.subs.push(
      // A terminal VS Code re-attaches after a reload: link it to its record by process ID.
      vscode.window.onDidOpenTerminal(async (t) => {
        const pid = await withTimeout(t.processId, PID_TIMEOUT_MS, undefined);
        if (pid === undefined) return;
        const rec = this.records.find((r) => r.processId === pid && !this.live.has(r.id));
        if (rec) {
          this.live.set(rec.id, t);
          this.onChange();
        }
      }),
      vscode.window.onDidCloseTerminal((t) => {
        const id = this.idOf(t);
        if (id) this.remove([id]);
      }),
      vscode.window.onDidChangeActiveTerminal((t) => {
        const id = t && this.idOf(t);
        const rec = id && this.records.find((r) => r.id === id);
        if (rec) {
          const last = { ...this.state.get<LastFocus>(LAST_KEY, {}), [rec.worktreePath]: { id: rec.id, at: Date.now() } };
          void this.state.update(LAST_KEY, last);
        }
      }),
    );
  }

  get records(): TerminalRecord[] {
    return this.state.get<TerminalRecord[]>(RECORDS_KEY, []);
  }

  private save(records: TerminalRecord[]): void {
    void this.state.update(RECORDS_KEY, records);
    this.onChange();
  }

  private idOf(t: vscode.Terminal): string | undefined {
    for (const [id, term] of this.live) if (term === t) return id;
    return undefined;
  }

  private remove(ids: string[]): void {
    for (const id of ids) this.live.delete(id);
    this.save(this.records.filter((r) => !ids.includes(r.id)));
    if (ids.length) this.onRemoved(ids);
  }

  forWorktrees(paths: string[]): TerminalRecord[] {
    return this.records.filter((r) => paths.includes(r.worktreePath));
  }

  /** The lowest free number, so closing "#2" and opening a new agent gives "#2" again. */
  private nextName(kind: 'agent' | 'shell', worktreePath: string): string {
    const taken = new Set(this.forWorktrees([worktreePath]).filter((r) => r.kind === kind).map((r) => r.name));
    const folder = path.basename(worktreePath);
    let n = 1;
    while (taken.has(terminalName(kind, folder, n))) n++;
    return terminalName(kind, folder, n);
  }

  private async create(
    kind: 'agent' | 'shell',
    worktreePath: string,
    extra: Partial<vscode.TerminalOptions>,
    id: string = randomUUID(),
  ): Promise<{ record: TerminalRecord; terminal: vscode.Terminal }> {
    const name = this.nextName(kind, worktreePath);
    const terminal = vscode.window.createTerminal({ name, cwd: worktreePath, ...extra });
    this.live.set(id, terminal);
    const processId = await withTimeout(terminal.processId, PID_TIMEOUT_MS, undefined);
    const record: TerminalRecord = { id, kind, worktreePath, name, processId };
    this.save([...this.records, record]);
    return { record, terminal };
  }

  /** Starts a shell in the worktree and types `command` (the `claude …` line) into it. */
  async createAgent(worktreePath: string, command: string): Promise<TerminalRecord> {
    const id = randomUUID();
    const { record, terminal } = await this.create(
      'agent',
      worktreePath,
      {
        // The hook script reads this to know which agent's status file to write.
        env: { WORKTREE_HUB_AGENT_ID: id },
        iconPath: new vscode.ThemeIcon('sparkle'),
      },
      id,
    );
    const had = this.state.get<string[]>(HAD_AGENT_KEY, []);
    if (!had.includes(worktreePath)) void this.state.update(HAD_AGENT_KEY, [...had, worktreePath]);
    // A plain shell plus sendText, so the shell stays open after Claude exits.
    terminal.sendText(command);
    terminal.show();
    return record;
  }

  async createShell(worktreePath: string): Promise<TerminalRecord> {
    const { record, terminal } = await this.create('shell', worktreePath, { iconPath: new vscode.ThemeIcon('terminal') });
    terminal.show();
    return record;
  }

  show(id: string, preserveFocus = false): boolean {
    const terminal = this.live.get(id);
    if (!terminal) return false;
    terminal.show(preserveFocus);
    return true;
  }

  /** The terminal of these worktrees that the user focused last (or the newest one). */
  lastFocused(paths: string[]): TerminalRecord | undefined {
    const candidates = this.forWorktrees(paths).filter((r) => this.live.has(r.id));
    if (candidates.length === 0) return undefined;
    const last = this.state.get<LastFocus>(LAST_KEY, {});
    let best: { rec: TerminalRecord; at: number } | undefined;
    for (const p of paths) {
      const entry = last[p];
      const rec = entry && candidates.find((r) => r.id === entry.id);
      if (rec && (!best || entry.at > best.at)) best = { rec, at: entry.at };
    }
    return best?.rec ?? candidates[candidates.length - 1];
  }

  /** Types a line into a terminal and presses Enter. False when the terminal is gone. */
  sendText(id: string, text: string): boolean {
    const terminal = this.live.get(id);
    if (!terminal) return false;
    terminal.sendText(text, true);
    return true;
  }

  close(id: string): void {
    const terminal = this.live.get(id);
    if (terminal) terminal.dispose();
    else this.remove([id]);
  }

  /** Closes every terminal of these worktrees (used by Remove worktree). */
  disposeForWorktrees(paths: string[]): void {
    const ids = this.forWorktrees(paths).map((r) => r.id);
    for (const id of ids) this.live.get(id)?.dispose();
    this.remove(ids);
  }

  hasEverHadAgent(worktreePath: string): boolean {
    return this.state.get<string[]>(HAD_AGENT_KEY, []).includes(worktreePath);
  }

  /** Run once at activation: reconnect stored records to the terminals VS Code restored. */
  async adopt(): Promise<void> {
    const live = await Promise.all(
      vscode.window.terminals.map(async (terminal) => ({
        terminal,
        processId: await withTimeout(terminal.processId, PID_TIMEOUT_MS, undefined),
      })),
    );
    const { keep, drop } = planAdoption(this.records, live, processAlive);
    for (const rec of keep) {
      const match = live.find((l) => l.processId === rec.processId);
      if (match) this.live.set(rec.id, match.terminal);
    }
    this.save(keep);
    if (drop.length) this.onRemoved(drop.map((r) => r.id));

    // A kept record whose terminal never re-attaches (its process ID was reused by an unrelated
    // program after a quit) is dropped after a grace period.
    this.graceTimer = setTimeout(() => {
      const orphans = this.records.filter((r) => !this.live.has(r.id)).map((r) => r.id);
      if (orphans.length) this.remove(orphans);
    }, REATTACH_GRACE_MS);
  }

  dispose(): void {
    clearTimeout(this.graceTimer);
    for (const s of this.subs) s.dispose();
  }
}
