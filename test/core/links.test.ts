import { beforeEach, describe, expect, it } from 'vitest';
import { LinkStore, type KeyValueStore } from '../../src/core/links';

class FakeStore implements KeyValueStore {
  data = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

const set = (xs: string[]) => new Set(xs);

let store: FakeStore;
let links: LinkStore;

beforeEach(() => {
  store = new FakeStore();
  links = new LinkStore(store);
});

describe('LinkStore', () => {
  it('treats an unlinked worktree as a group of one', () => {
    expect(links.groupOf('/a')).toEqual(['/a']);
    expect(links.isLinked('/a')).toBe(false);
  });

  it('links two worktrees, and a third one joins the same group', async () => {
    await links.link('/a', '/b');
    expect(set(links.groupOf('/b'))).toEqual(set(['/a', '/b']));
    await links.link('/b', '/c');
    expect(set(links.groupOf('/a'))).toEqual(set(['/a', '/b', '/c']));
    expect(links.isLinked('/c')).toBe(true);
  });

  it('merges two existing groups', async () => {
    await links.link('/a', '/b');
    await links.link('/c', '/d');
    await links.link('/a', '/d');
    expect(set(links.groupOf('/c'))).toEqual(set(['/a', '/b', '/c', '/d']));
  });

  it('unlinks one worktree and drops a group that becomes a single worktree', async () => {
    await links.link('/a', '/b');
    await links.link('/b', '/c');
    await links.unlink('/b');
    expect(set(links.groupOf('/a'))).toEqual(set(['/a', '/c']));
    expect(links.isLinked('/b')).toBe(false);
    await links.unlink('/a');
    expect(links.isLinked('/a')).toBe(false);
    expect(links.isLinked('/c')).toBe(false);
  });

  it('removes a whole group', async () => {
    await links.link('/a', '/b');
    await links.link('/b', '/c');
    await links.removeGroup('/a');
    expect(links.isLinked('/a')).toBe(false);
    expect(links.isLinked('/b')).toBe(false);
    expect(links.isLinked('/c')).toBe(false);
  });

  it('keeps links in the store, so a new LinkStore sees them', async () => {
    await links.link('/a', '/b');
    const again = new LinkStore(store);
    expect(set(again.groupOf('/a'))).toEqual(set(['/a', '/b']));
  });
});
