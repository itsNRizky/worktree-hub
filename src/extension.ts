import * as vscode from 'vscode';
import { registerSpike } from './spike/spike';
import { registerAgentCommands } from './vscode/commands/agents';
import { registerCreateWorktree } from './vscode/commands/createWorktree';
import { registerLinkCommands } from './vscode/commands/link';
import { registerProjectCommands } from './vscode/commands/projects';
import { registerQuickSwitch } from './vscode/commands/quickSwitch';
import { registerRemoveWorktree } from './vscode/commands/removeWorktree';
import { registerStatusBar } from './vscode/statusBar';
import { createHub } from './vscode/hub';
import { isHubWorkspace, setupWorkspace } from './vscode/workspaceSetup';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Worktree Hub');
  context.subscriptions.push(output);
  void vscode.commands.executeCommand('setContext', 'worktreeHub.isHub', isHubWorkspace());

  const hub = await createHub(context, output);

  context.subscriptions.push(
    vscode.commands.registerCommand('worktreeHub.refresh', () => hub.refresh()),
    vscode.commands.registerCommand('worktreeHub.setupWorkspace', setupWorkspace),
    ...registerAgentCommands({
      registry: hub.registry,
      statuses: hub.statuses,
      switcher: hub.switcher,
      getActive: hub.getActive,
      startAgent: hub.startAgent,
    }),
    ...registerProjectCommands(hub),
    registerCreateWorktree(hub),
    ...registerLinkCommands(hub),
    registerRemoveWorktree(hub),
    registerQuickSwitch(hub),
    registerStatusBar(hub),
  );

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    registerSpike(context, output);
  }
}

export function deactivate(): void {}
