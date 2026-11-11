// Move to Worktree…: continues an agent's chat in a new worktree. It asks the same two steps as
// New Worktree, copies the chat into the new worktree's chat folder, then starts an agent there
// with `--resume <id> --fork-session '<note>'`. The old agent stays open and unchanged.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findWorktree } from '../../app/repository';
import { claudeConfigDir, moveNote } from '../../core/chats';
import type { TerminalNode } from '../../core/treeModel';
import { chatFolder, copyChat } from '../../fs/chatFiles';
import type { Hub } from '../hub';
import { guarded, terminalIdOf } from '../ui';
import { createWorktreeSteps } from './createWorktree';

export function registerMoveAgent(hub: Hub): vscode.Disposable {
  return vscode.commands.registerCommand(
    'worktreeHub.moveAgent',
    guarded(async (arg: TerminalNode | string) => {
      const id = terminalIdOf(arg);
      const rec = hub.registry.records.find((r) => r.id === id);
      if (!rec || rec.kind !== 'agent') return;

      // The chat is taken now, before the steps: it is the chat the user saw when they clicked.
      const status = hub.statuses.get(rec.id);
      const sessionId = status?.sessionId;
      const transcriptPath = status?.transcriptPath;
      const hasFile = (p: string) =>
        fs.access(p).then(
          () => true,
          () => false,
        );
      if (!status || !sessionId || !transcriptPath || !(await hasFile(transcriptPath))) {
        throw new Error('This agent has no chat yet. Send it a message first.');
      }
      if (status.state === 'working') throw new Error('Claude is still working. Move the chat when it has finished.');
      const found = findWorktree(hub.snapshot(), rec.worktreePath);
      if (!found) throw new Error(`Cannot find the worktree of this agent: ${rec.worktreePath}`);

      const project = found.project.config;
      const created = await createWorktreeSteps(hub, project, `Move to Worktree · ${path.basename(project.path)}`);
      if (!created) return;

      let copied: { backups: string[] } | Error;
      try {
        const toFolder = await chatFolder(created.folder, claudeConfigDir(process.env, os.homedir()));
        copied = await copyChat(transcriptPath, sessionId, toFolder, new Date());
      } catch (err) {
        copied = err instanceof Error ? err : new Error(String(err));
      }
      await hub.refresh();

      if (copied instanceof Error) {
        // The worktree is kept, and the switch starts a normal first agent, as New Worktree does.
        hub.output.appendLine(`Could not move the chat ${sessionId} to ${created.folder}: ${copied.message}`);
        const reason = copied.message.replace(/\.?$/, '.');
        void vscode.window.showWarningMessage(
          [`Created ${created.name}, but could not move the chat: ${reason}`, created.text].filter(Boolean).join(' '),
        );
        await hub.switcher.switchTo(created.folder, { userInitiated: true });
        return;
      }

      const linked = hub.links.groupOf(rec.worktreePath).filter((p) => p !== rec.worktreePath);
      const note = moveNote({ fromFolders: [rec.worktreePath, ...linked], toFolder: created.folder, branch: created.name });
      // Switch with no terminal first, then start the agent (the same order as New Agent), so
      // exactly one agent starts and it is the one shown.
      await hub.switcher.switchTo(created.folder, { userInitiated: false, terminal: 'none' });
      await hub.startAgent(created.folder, { sessionId, note });
      const message = [
        `Moved the chat to ${created.name}.`,
        created.text,
        ...copied.backups.map((b) => `Kept the older copy as ${b}.`),
      ]
        .filter(Boolean)
        .join(' ');
      void (created.warn ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message));
    }),
  );
}
