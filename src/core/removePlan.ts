// Texts and decisions for "Remove worktree".

export interface RemoveItem {
  repoName: string;
  branch: string;
  dirtyCount: number;
  openTerminals: number;
  /** Claude chats in the worktree's chat folder. They are moved to the main checkout. */
  chats: number;
}

export const CHATS_MOVED_LINE = 'Chats are moved to main. Open them there with /resume.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The confirm dialog. Commits that are not pushed are no warning: the branch is kept. */
export function removeDialogText(items: RemoveItem[]): { message: string; detail: string } {
  const message = items.length === 1 ? `Remove worktree ${items[0].branch}?` : `Remove ${items.length} linked worktrees?`;
  const lines = items.map((i) => {
    const warnings = [
      i.dirtyCount > 0 && plural(i.dirtyCount, 'uncommitted change'),
      i.openTerminals > 0 && plural(i.openTerminals, 'open terminal'),
    ].filter(Boolean);
    const chats = i.chats > 0 ? `, ${plural(i.chats, 'chat')}` : '';
    return `${i.repoName} · ${i.branch} — ${warnings.length ? warnings.join(', ') : 'clean'}${chats}`;
  });
  const chatLine = items.some((i) => i.chats > 0) ? [CHATS_MOVED_LINE] : [];
  return { message, detail: [...lines, 'Branches are kept.', ...chatLine].join('\n') };
}

export interface ChatMoveReport {
  branch: string;
  /** The removed worktree's chat folder, where chats that could not be moved stay. */
  chatFolder: string;
  failed: number;
  backups: string[];
}

/** The message after the chats were moved. Empty when every chat moved without a backup. */
export function chatMoveSummary(reports: ChatMoveReport[]): string {
  const parts: string[] = [];
  for (const r of reports) {
    if (r.backups.length) {
      parts.push(
        `${r.branch}: main had another version of ${plural(r.backups.length, 'chat')}, ` +
          `so this one was kept as ${r.backups.join(', ')}.`,
      );
    }
    if (r.failed > 0) {
      const stay = r.failed === 1 ? 'It stays' : 'They stay';
      parts.push(`${r.branch}: could not move ${plural(r.failed, 'chat')}. ${stay} in ${r.chatFolder}.`);
    }
  }
  return parts.join(' ');
}

export interface MainCheck {
  repoName: string;
  repo: string;
  branch: string;
  /** Uncommitted changes in the repo's main checkout. */
  mainDirty: number;
}

/** "Remove and open in main": a main checkout with uncommitted changes is not switched. */
export function openInMainPlan(items: MainCheck[]): { switch: MainCheck[]; skipped: MainCheck[] } {
  return {
    switch: items.filter((i) => i.mainDirty === 0),
    skipped: items.filter((i) => i.mainDirty > 0),
  };
}

export function openInMainSummary(switched: MainCheck[], skipped: MainCheck[]): string {
  const parts = [
    ...switched.map((i) => `Switched ${i.repoName} to ${i.branch}.`),
    ...skipped.map((i) => `Skipped ${i.repoName}: uncommitted changes in the main checkout.`),
  ];
  return parts.join(' ');
}
