// The command line typed into an agent terminal. It is typed (not hidden), so the user sees it.

/** POSIX shell quoting: `'...'`, with each `'` written as `'\''` (close, escaped quote, reopen). */
export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * `--add-dir` accepts several values, so a bare word after it would be read as another folder.
 * Repeating the flag once per folder keeps the command unambiguous.
 */
export function buildClaudeCommand(o: { settingsPath: string; addDirs: string[] }): string {
  const parts = ['claude', '--settings', shellQuote(o.settingsPath)];
  for (const dir of o.addDirs) parts.push('--add-dir', shellQuote(dir));
  return parts.join(' ');
}

export function terminalName(kind: 'agent' | 'shell', worktreeFolder: string, n: number): string {
  const base = `${kind === 'agent' ? 'Claude' : 'Shell'} · ${worktreeFolder}`;
  return n > 1 ? `${base} #${n}` : base;
}
