import { describe, expect, it } from 'vitest';
import { attentionFor, attentionMessage } from '../../src/core/attention';

describe('attentionFor', () => {
  it('pops up when an agent finishes', () => {
    expect(attentionFor('working', 'done')).toBe('done');
  });

  it('pops up when an agent needs an answer', () => {
    expect(attentionFor('working', 'waiting')).toBe('waiting');
    expect(attentionFor('done', 'waiting')).toBe('waiting');
  });

  it('pops up for an agent seen for the first time in a done or waiting state', () => {
    expect(attentionFor(undefined, 'done')).toBe('done');
  });

  it('does not pop up again when the state did not change (the file watcher can fire twice)', () => {
    expect(attentionFor('done', 'done')).toBeUndefined();
    expect(attentionFor('waiting', 'waiting')).toBeUndefined();
  });

  it('does not pop up for other states', () => {
    expect(attentionFor('ready', 'working')).toBeUndefined();
    expect(attentionFor('done', 'ended')).toBeUndefined();
    expect(attentionFor(undefined, 'ready')).toBeUndefined();
  });
});

describe('attentionMessage', () => {
  it('names the repo and the branch', () => {
    expect(attentionMessage('done', 'be-shop-app', 'feat/abc-456')).toBe(
      'Claude finished: be-shop-app › feat/abc-456',
    );
    expect(attentionMessage('waiting', 'shop-app', 'feat/abc-456')).toBe(
      'Claude needs your answer: shop-app › feat/abc-456',
    );
  });
});
