import { describe, expect, it } from 'vitest';
import { openInMainPlan, openInMainSummary, removeDialogText, type MainCheck } from '../../src/core/removePlan';

describe('removeDialogText', () => {
  it('describes one clean worktree', () => {
    expect(removeDialogText([{ repoName: 'shop-app', branch: 'feat/x', dirtyCount: 0, openTerminals: 0 }])).toEqual({
      message: 'Remove worktree feat/x?',
      detail: 'shop-app · feat/x — clean\nBranches are kept.',
    });
  });

  it('lists every linked worktree with its warnings', () => {
    expect(
      removeDialogText([
        { repoName: 'shop-app', branch: 'feat/x', dirtyCount: 3, openTerminals: 2 },
        { repoName: 'be-shop-app', branch: 'feat/x', dirtyCount: 0, openTerminals: 0 },
      ]),
    ).toEqual({
      message: 'Remove 2 linked worktrees?',
      detail:
        'shop-app · feat/x — 3 uncommitted changes, 2 open terminals\n' +
        'be-shop-app · feat/x — clean\n' +
        'Branches are kept.',
    });
  });

  it('uses the singular for one change and one terminal', () => {
    expect(
      removeDialogText([{ repoName: 'shop-app', branch: 'feat/x', dirtyCount: 1, openTerminals: 1 }]).detail,
    ).toBe('shop-app · feat/x — 1 uncommitted change, 1 open terminal\nBranches are kept.');
  });
});

const main = (repoName: string, mainDirty: number): MainCheck => ({
  repoName,
  repo: `/P/${repoName}`,
  branch: 'feat/x',
  mainDirty,
});

describe('openInMainPlan', () => {
  it('switches only main checkouts without uncommitted changes', () => {
    const a = main('shop-app', 0);
    const b = main('be-shop-app', 2);
    expect(openInMainPlan([a, b])).toEqual({ switch: [a], skipped: [b] });
  });
});

describe('openInMainSummary', () => {
  it('says what was switched and what was skipped', () => {
    expect(openInMainSummary([main('shop-app', 0)], [main('be-shop-app', 2)])).toBe(
      'Switched shop-app to feat/x. Skipped be-shop-app: uncommitted changes in the main checkout.',
    );
  });
});
