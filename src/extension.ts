import * as vscode from 'vscode';
import { registerSpike } from './spike/spike';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Worktree Hub');
  context.subscriptions.push(output);

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    registerSpike(context, output);
  }
}

export function deactivate(): void {}
