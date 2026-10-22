// Throwaway spike commands (Task 2). Registered only in development mode; deleted in Task 16.
// They check VS Code behaviour the design depends on (spec section 9).
import * as vscode from 'vscode';

export function registerSpike(context: vscode.ExtensionContext, out: vscode.OutputChannel): void {
  // If this number goes up after a folder swap, the extension host restarted.
  const n = (context.globalState.get<number>('spike.activations') ?? 0) + 1;
  void context.globalState.update('spike.activations', n);
  out.appendLine(`activate #${n}`);
  out.show(true);

  const reg = (id: string, fn: () => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(`worktreeHub.spike.${id}`, fn));

  reg('setFolder', async () => {
    const p = await vscode.window.showInputBox({ prompt: 'Absolute folder path for workspace index 1' });
    if (!p) return;
    const folders = vscode.workspace.workspaceFolders ?? [];
    const started = Date.now();
    const changed = new Promise<void>((resolve) => {
      const sub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        sub.dispose();
        resolve();
      });
    });
    const ok = vscode.workspace.updateWorkspaceFolders(1, Math.max(0, folders.length - 1), { uri: vscode.Uri.file(p) });
    out.appendLine(`updateWorkspaceFolders returned ${ok}`);
    await changed;
    out.appendLine(`swap ms=${Date.now() - started} → ${p}`);
  });

  reg('terminal', async () => {
    const folder = vscode.workspace.workspaceFolders?.[1];
    if (!folder) return vscode.window.showWarningMessage('Run "setFolder" first.');
    const t = vscode.window.createTerminal({ name: 'spike', cwd: folder.uri });
    t.show();
    out.appendLine(`spike terminal pid=${await t.processId} cwd=${folder.uri.fsPath}`);
  });

  reg('show', () => {
    const t = vscode.window.terminals.find((x) => x.name === 'spike');
    if (!t) return out.appendLine('no terminal named spike');
    t.show();
    out.appendLine('spike terminal shown');
  });

  reg('terminals', async () => {
    for (const t of vscode.window.terminals) {
      out.appendLine(`terminal "${t.name}" pid=${await t.processId} options=${JSON.stringify(t.creationOptions)}`);
    }
    out.show(true);
  });
}
