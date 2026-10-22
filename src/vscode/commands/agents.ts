// Commands for worktrees and their terminals: switch, new agent, new terminal, close, reveal.
import * as vscode from 'vscode';
import type { Switcher } from '../../app/switcher';
import type { TerminalNode, WorktreeNode } from '../../core/treeModel';
import type { StatusWatcher } from '../agentStatus';
import type { TerminalRegistry } from '../terminals';
import { guarded, terminalIdOf, worktreePathOf } from '../ui';

export interface AgentCommandDeps {
  registry: TerminalRegistry;
  statuses: StatusWatcher;
  switcher: Switcher;
  getActive(): string[];
  startAgent(worktreePath: string): Promise<void>;
}

export function registerAgentCommands(deps: AgentCommandDeps): vscode.Disposable[] {
  const { registry, statuses, switcher } = deps;

  /**
   * Makes the worktree's task active first, if it is not already. `terminal: 'none'` because every
   * caller shows or creates a terminal right after; an extra shell would only be in the way.
   */
  const ensureActive = async (worktreePath: string) => {
    if (!deps.getActive().includes(worktreePath)) {
      await switcher.switchTo(worktreePath, { userInitiated: false, terminal: 'none' });
    }
  };

  return [
    vscode.commands.registerCommand(
      'worktreeHub.switch',
      guarded(async (arg: WorktreeNode | string) => {
        const p = worktreePathOf(arg);
        if (p) await switcher.switchTo(p, { userInitiated: true });
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.focusTerminal',
      guarded(async (arg: TerminalNode | string) => {
        const id = terminalIdOf(arg);
        const rec = registry.records.find((r) => r.id === id);
        if (!rec) return;
        await ensureActive(rec.worktreePath);
        registry.show(rec.id);
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.newAgent',
      guarded(async (arg: WorktreeNode | string) => {
        const p = worktreePathOf(arg);
        if (!p) return;
        await ensureActive(p);
        await deps.startAgent(p);
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.newTerminal',
      guarded(async (arg: WorktreeNode | string) => {
        const p = worktreePathOf(arg);
        if (!p) return;
        await ensureActive(p);
        await registry.createShell(p);
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.closeTerminal',
      guarded(async (arg: TerminalNode | string) => {
        const id = terminalIdOf(arg);
        if (!id) return;
        if (statuses.get(id)?.state === 'working') {
          const ok = await vscode.window.showWarningMessage(
            'Claude is still working. Close this agent?',
            { modal: true },
            'Close Agent',
          );
          if (ok !== 'Close Agent') return;
        }
        registry.close(id);
      }),
    ),
    vscode.commands.registerCommand(
      'worktreeHub.revealInFinder',
      guarded(async (arg: WorktreeNode | string) => {
        const p = worktreePathOf(arg);
        if (p) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p));
      }),
    ),
  ];
}
