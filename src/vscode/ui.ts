// Small UI helpers shared by the commands.
import * as vscode from 'vscode';
import type { TerminalNode, WorktreeNode } from '../core/treeModel';

/** Wraps a command so any error becomes a visible message instead of failing silently. */
export function guarded<A extends unknown[]>(fn: (...args: A) => unknown): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (e) {
      void vscode.window.showErrorMessage(`Worktree Hub: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}

/** Commands get a tree node when run from the sidebar, or a path when run from code. */
export function worktreePathOf(arg: WorktreeNode | string | undefined): string | undefined {
  if (typeof arg === 'string') return arg;
  return arg?.kind === 'worktree' ? arg.id : undefined;
}

export function terminalIdOf(arg: TerminalNode | string | undefined): string | undefined {
  if (typeof arg === 'string') return arg;
  return arg?.kind === 'terminal' ? arg.id : undefined;
}
