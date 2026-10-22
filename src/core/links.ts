// Link groups: worktrees in different repos that belong to the same task (e.g. a ticket that
// changes both shop-app and be-shop-app). Links are symmetric, so a group is a set.

/** The part of vscode.Memento this store needs, so tests can pass a simple fake. */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

const KEY = 'worktreeHub.linkGroups';

export class LinkStore {
  constructor(private readonly store: KeyValueStore) {}

  private groups(): string[][] {
    return this.store.get<string[][]>(KEY) ?? [];
  }

  private save(groups: string[][]): PromiseLike<void> {
    // A "group" of one worktree is the same as no link, so it is not stored.
    return this.store.update(KEY, groups.filter((g) => g.length > 1));
  }

  /** Every worktree in the same task, including `path` itself. */
  groupOf(path: string): string[] {
    return this.groups().find((g) => g.includes(path)) ?? [path];
  }

  isLinked(path: string): boolean {
    return this.groupOf(path).length > 1;
  }

  async link(a: string, b: string): Promise<void> {
    const groups = this.groups();
    const ga = groups.find((g) => g.includes(a)) ?? [a];
    const gb = groups.find((g) => g.includes(b)) ?? [b];
    const merged = [...new Set([...ga, ...gb])];
    await this.save([...groups.filter((g) => g !== ga && g !== gb), merged]);
  }

  async unlink(path: string): Promise<void> {
    await this.save(this.groups().map((g) => g.filter((p) => p !== path)));
  }

  async removeGroup(path: string): Promise<void> {
    await this.save(this.groups().filter((g) => !g.includes(path)));
  }
}
