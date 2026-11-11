import { describe, expect, it } from 'vitest';
import { buildClaudeCommand, shellQuote, terminalName } from '../../src/core/claudeCommand';

describe('shellQuote', () => {
  it('wraps in single quotes and escapes single quotes inside', () => {
    expect(shellQuote("/My Projects/it's")).toBe(`'/My Projects/it'\\''s'`);
  });
});

describe('buildClaudeCommand', () => {
  it('passes the hook settings file, quoted', () => {
    expect(buildClaudeCommand({ settingsPath: '/s/hook settings.json', addDirs: [] })).toBe(
      `claude --settings '/s/hook settings.json'`,
    );
  });

  it('repeats --add-dir once per linked worktree', () => {
    expect(buildClaudeCommand({ settingsPath: '/s.json', addDirs: ['/w/be a', '/w/c'] })).toBe(
      `claude --settings '/s.json' --add-dir '/w/be a' --add-dir '/w/c'`,
    );
  });

  it('resumes a moved chat as a fork, with the note as the first message', () => {
    expect(
      buildClaudeCommand({
        settingsPath: '/s.json',
        addDirs: ['/w/api'],
        resume: { sessionId: 'abc-123', note: `Moved to /w/it's here. Reply only "OK".` },
      }),
    ).toBe(`claude --settings '/s.json' --add-dir '/w/api' --resume 'abc-123' --fork-session 'Moved to /w/it'\\''s here. Reply only "OK".'`);
  });
});

describe('terminalName', () => {
  it('names agents and shells after the worktree folder, numbering from the second one', () => {
    expect(terminalName('agent', 'feat-x', 1)).toBe('Claude · feat-x');
    expect(terminalName('agent', 'feat-x', 2)).toBe('Claude · feat-x #2');
    expect(terminalName('shell', 'feat-x', 1)).toBe('Shell · feat-x');
  });
});
