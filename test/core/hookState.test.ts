import { describe, expect, it } from 'vitest';
import type { AgentStatus } from '../../src/core/agentTypes';
import { reduceHookEvent } from '../../src/core/hookState';

const NOW = 1000;
const status = (s: Partial<AgentStatus>): AgentStatus => ({ agentId: 'a1', state: 'ready', updatedAt: 1, ...s });

describe('reduceHookEvent', () => {
  it('SessionStart makes a new agent ready', () => {
    expect(reduceHookEvent(undefined, 'a1', { hook_event_name: 'SessionStart' }, NOW).state).toBe('ready');
  });

  it('the first prompt makes it working and becomes the title', () => {
    const next = reduceHookEvent(
      status({}),
      'a1',
      { hook_event_name: 'UserPromptSubmit', prompt: 'Trace the auto-delete job flow' },
      NOW,
    );
    expect(next.state).toBe('working');
    expect(next.title).toBe('Trace the auto-delete job flow');
  });

  it('later prompts keep the first title', () => {
    const next = reduceHookEvent(
      status({ state: 'working', title: 'X' }),
      'a1',
      { hook_event_name: 'UserPromptSubmit', prompt: 'second' },
      NOW,
    );
    expect(next.title).toBe('X');
  });

  it('cuts a long first prompt to 60 characters', () => {
    const next = reduceHookEvent(status({}), 'a1', { hook_event_name: 'UserPromptSubmit', prompt: 'a'.repeat(100) }, NOW);
    expect(next.title).toBe('a'.repeat(59) + '…');
  });

  it('a permission request makes it waiting, with the message', () => {
    const next = reduceHookEvent(
      status({ state: 'working' }),
      'a1',
      {
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Claude needs your permission to use Bash',
      },
      NOW,
    );
    expect(next.state).toBe('waiting');
    expect(next.message).toBe('Claude needs your permission to use Bash');
  });

  it('a tool finishing after the permission makes it working again and clears the message', () => {
    const next = reduceHookEvent(status({ state: 'waiting', message: 'm' }), 'a1', { hook_event_name: 'PostToolUse' }, NOW);
    expect(next.state).toBe('working');
    expect(next.message).toBeUndefined();
  });

  it('the idle reminder does not turn a finished agent yellow', () => {
    const prev = status({ state: 'done' });
    expect(
      reduceHookEvent(prev, 'a1', { hook_event_name: 'Notification', notification_type: 'idle_prompt' }, NOW),
    ).toBe(prev);
  });

  it('Stop makes it done and SessionEnd makes it ended', () => {
    expect(reduceHookEvent(status({ state: 'working' }), 'a1', { hook_event_name: 'Stop' }, NOW).state).toBe('done');
    expect(reduceHookEvent(status({ state: 'done' }), 'a1', { hook_event_name: 'SessionEnd' }, NOW).state).toBe('ended');
  });

  it('ignores events it does not know', () => {
    const prev = status({ state: 'working' });
    expect(reduceHookEvent(prev, 'a1', { hook_event_name: 'PreCompact' }, NOW)).toBe(prev);
  });

  it('stores the session id and transcript path, and the time of the change', () => {
    const next = reduceHookEvent(
      undefined,
      'a1',
      { hook_event_name: 'SessionStart', session_id: 's1', transcript_path: '/t.jsonl' },
      NOW,
    );
    expect(next).toEqual({ agentId: 'a1', state: 'ready', sessionId: 's1', transcriptPath: '/t.jsonl', updatedAt: NOW });
  });
});
