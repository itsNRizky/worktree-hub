// Texts and decisions for "Remove worktree".

export interface RemoveItem {
  repoName: string;
  branch: string;
  dirtyCount: number;
  openTerminals: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The confirm dialog. Commits that are not pushed are no warning: the branch is kept. */
export function removeDialogText(items: RemoveItem[]): { message: string; detail: string } {
  const message = items.length === 1 ? `Remove worktree ${items[0].branch}?` : `Remove ${items.length} linked worktrees?`;
  const lines = items.map((i) => {
    const warnings = [
      i.dirtyCount > 0 && plural(i.dirtyCount, 'uncommitted change'),
      i.openTerminals > 0 && plural(i.openTerminals, 'open terminal'),
    ].filter(Boolean);
    return `${i.repoName} · ${i.branch} — ${warnings.length ? warnings.join(', ') : 'clean'}`;
  });
  return { message, detail: [...lines, 'Branches are kept.'].join('\n') };
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
