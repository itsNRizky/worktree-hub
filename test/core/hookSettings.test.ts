import { describe, expect, it } from 'vitest';
import { buildHookSettings, hookCommand } from '../../src/core/hookSettings';

describe('hookCommand', () => {
  it("runs the script with VS Code's own Node, every path quoted", () => {
    expect(hookCommand('/App/Code Helper', '/ext/dist/status-hook.js', '/g/status')).toBe(
      `ELECTRON_RUN_AS_NODE=1 '/App/Code Helper' '/ext/dist/status-hook.js' '/g/status'`,
    );
  });
});

describe('buildHookSettings', () => {
  const hooks = buildHookSettings('CMD').hooks;
  const entry = [{ hooks: [{ type: 'command', command: 'CMD' }] }];

  it('registers exactly the six events the status needs', () => {
    expect(Object.keys(hooks).sort()).toEqual(
      ['Notification', 'PostToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit'].sort(),
    );
  });

  it('runs the same command for each event, and matches every tool for PostToolUse', () => {
    expect(hooks.SessionStart).toEqual(entry);
    expect(hooks.Stop).toEqual(entry);
    expect(hooks.PostToolUse).toEqual([{ matcher: '*', hooks: [{ type: 'command', command: 'CMD' }] }]);
  });
});
