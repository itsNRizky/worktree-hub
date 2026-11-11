import { describe, expect, it } from 'vitest';
import {
  chatMoveSummary,
  openInMainPlan,
  openInMainSummary,
  removeDialogText,
  type MainCheck,
} from '../../src/core/removePlan';

describe('removeDialogText', () => {
  it('describes one clean worktree', () => {
    expect(removeDialogText([{ repoName: 'shop-app', branch: 'feat/x', dirtyCount: 0, openTerminals: 0, chats: 0 }])).toEqual({
      message: 'Remove worktree feat/x?',
      detail: 'shop-app · feat/x — clean\nBranches are kept.',
    });
  });

  it('lists every linked worktree with its warnings', () => {
    expect(
      removeDialogText([
        { repoName: 'shop-app', branch: 'feat/x', dirtyCount: 3, openTerminals: 2, chats: 0 },
        { repoName: 'be-shop-app', branch: 'feat/x', dirtyCount: 0, openTerminals: 0, chats: 0 },
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
      removeDialogText([{ repoName: 'shop-app', branch: 'feat/x', dirtyCount: 1, openTerminals: 1, chats: 0 }]).detail,
    ).toBe('shop-app · feat/x — 1 uncommitted change, 1 open terminal\nBranches are kept.');
  });

  it('shows the chat count and says where the chats go', () => {
    expect(removeDialogText([{ repoName: 'web-app', branch: 'feat/login', dirtyCount: 0, openTerminals: 0, chats: 2 }])).toEqual({
      message: 'Remove worktree feat/login?',
      detail: 'web-app · feat/login — clean, 2 chats\nBranches are kept.\nChats are moved to main. Open them there with /resume.',
    });
  });

  it('adds the chat count after the warnings, in the singular for one', () => {
    expect(
      removeDialogText([
        { repoName: 'web-app', branch: 'feat/x', dirtyCount: 3, openTerminals: 1, chats: 1 },
        { repoName: 'api', branch: 'feat/x', dirtyCount: 0, openTerminals: 0, chats: 0 },
      ]).detail,
    ).toBe(
      'web-app · feat/x — 3 uncommitted changes, 1 open terminal, 1 chat\n' +
        'api · feat/x — clean\n' +
        'Branches are kept.\n' +
        'Chats are moved to main. Open them there with /resume.',
    );
  });
});

describe('chatMoveSummary', () => {
  it('says nothing when every chat moved', () => {
    expect(chatMoveSummary([{ branch: 'feat/x', chatFolder: '/c/p/x', failed: 0, backups: [] }])).toBe('');
  });

  it('names backups and chats that stayed behind', () => {
    expect(
      chatMoveSummary([
        { branch: 'feat/x', chatFolder: '/c/p/x', failed: 0, backups: ['a.jsonl.bak-20261110-123456'] },
        { branch: 'feat/y', chatFolder: '/c/p/y', failed: 2, backups: [] },
      ]),
    ).toBe(
      'feat/x: main had another version of 1 chat, so this one was kept as a.jsonl.bak-20261110-123456. ' +
        'feat/y: could not move 2 chats. They stay in /c/p/y.',
    );
  });

  it('uses the singular for one chat that stayed', () => {
    expect(chatMoveSummary([{ branch: 'feat/y', chatFolder: '/c/p/y', failed: 1, backups: [] }])).toBe(
      'feat/y: could not move 1 chat. It stays in /c/p/y.',
    );
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
