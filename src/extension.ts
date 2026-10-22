import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Worktree Hub');
  context.subscriptions.push(output);
}

export function deactivate(): void {}
