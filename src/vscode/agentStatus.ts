// Agent status: writes the hook settings file and watches the status files the hook writes.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentStatus } from '../core/agentTypes';
import { buildHookSettings, hookCommand } from '../core/hookSettings';
import { extractSessionTitle } from '../core/sessionTitle';

const TRANSCRIPT_TAIL_BYTES = 512 * 1024;

export function statusDirOf(ctx: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(ctx.globalStorageUri, 'status');
}

/**
 * Written on every activation, because the extension's folder (and so the script path) changes
 * when the extension is updated. Returns the path passed to `claude --settings`.
 */
export async function ensureHookSettings(ctx: vscode.ExtensionContext): Promise<string> {
  const statusDir = statusDirOf(ctx).fsPath;
  await fs.promises.mkdir(statusDir, { recursive: true });
  const script = path.join(ctx.extensionPath, 'dist', 'status-hook.js');
  // process.execPath is the VS Code helper running this extension; with ELECTRON_RUN_AS_NODE it is Node.
  const settings = buildHookSettings(hookCommand(process.execPath, script, statusDir));
  const file = path.join(ctx.globalStorageUri.fsPath, 'hook-settings.json');
  await fs.promises.writeFile(file, JSON.stringify(settings, null, 2));
  return file;
}

/** Reads the end of a transcript. Titles repeat through the file, so the tail is enough. */
function readTail(file: string): string {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

export class StatusWatcher implements vscode.Disposable {
  private readonly statuses = new Map<string, AgentStatus>();
  private readonly watcher: vscode.FileSystemWatcher;

  constructor(
    private readonly statusDir: vscode.Uri,
    private readonly onChange: () => void,
    /** Called for each status read after startup, with the state it had before (for popups). */
    private readonly onStatus: (next: AgentStatus, prev: AgentStatus | undefined) => void = () => undefined,
  ) {
    fs.mkdirSync(statusDir.fsPath, { recursive: true });
    for (const name of fs.readdirSync(statusDir.fsPath)) {
      if (name.endsWith('.json')) this.read(path.join(statusDir.fsPath, name), false);
    }
    // A RelativePattern with a base folder lets VS Code watch outside the workspace.
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(statusDir, '*.json'));
    this.watcher.onDidCreate((u) => this.read(u.fsPath, true));
    this.watcher.onDidChange((u) => this.read(u.fsPath, true));
    this.watcher.onDidDelete((u) => {
      this.statuses.delete(path.basename(u.fsPath, '.json'));
      this.onChange();
    });
  }

  private read(file: string, notify: boolean): void {
    try {
      const status = JSON.parse(fs.readFileSync(file, 'utf8')) as AgentStatus;
      if (status.transcriptPath) {
        try {
          const title = extractSessionTitle(readTail(status.transcriptPath));
          if (title) status.title = title;
        } catch {
          // No transcript yet: keep the title from the first prompt.
        }
      }
      const prev = this.statuses.get(status.agentId);
      this.statuses.set(status.agentId, status);
      if (notify) {
        this.onChange();
        this.onStatus(status, prev);
      }
    } catch {
      // Ignore a file we cannot read; the next event brings a full one.
    }
  }

  get(id: string): AgentStatus | undefined {
    return this.statuses.get(id);
  }

  all(): Map<string, AgentStatus> {
    return this.statuses;
  }

  /** Deletes an agent's status file once its terminal is gone, so old files do not pile up. */
  forget(id: string): void {
    this.statuses.delete(id);
    fs.rm(path.join(this.statusDir.fsPath, `${id}.json`), { force: true }, () => undefined);
  }

  dispose(): void {
    this.watcher.dispose();
  }
}
