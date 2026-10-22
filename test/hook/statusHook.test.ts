import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../src/hook/status-hook';
import { makeTempDir } from '../helpers/tmpRepo';

let dir: string;

beforeEach(async () => {
  dir = await makeTempDir();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const read = async (id: string) => JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));

describe('status hook', () => {
  it("writes the agent's status file", async () => {
    handle('{"hook_event_name":"UserPromptSubmit","prompt":"hi","session_id":"s1"}', { WORKTREE_HUB_AGENT_ID: 'a1' }, dir, 5);
    const s = await read('a1');
    expect(s.state).toBe('working');
    expect(s.sessionId).toBe('s1');
  });

  it('builds on the previous status', async () => {
    handle('{"hook_event_name":"UserPromptSubmit","prompt":"hi"}', { WORKTREE_HUB_AGENT_ID: 'a1' }, dir, 5);
    handle('{"hook_event_name":"Stop"}', { WORKTREE_HUB_AGENT_ID: 'a1' }, dir, 6);
    const s = await read('a1');
    expect(s.state).toBe('done');
    expect(s.title).toBe('hi');
  });

  it('does nothing for a Claude that Worktree Hub did not start', async () => {
    expect(() => handle('{"hook_event_name":"Stop"}', {}, dir, 5)).not.toThrow();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('never throws on bad input', () => {
    expect(() => handle('not json', { WORKTREE_HUB_AGENT_ID: 'a1' }, dir, 5)).not.toThrow();
  });
});
