// Reads the title Claude gives a session from its transcript (a .jsonl file, one JSON object per
// line). The format is internal to Claude Code, so this is best effort: no title → undefined.

export function extractSessionTitle(jsonlText: string): string | undefined {
  let ai: string | undefined;
  let custom: string | undefined;
  for (const line of jsonlText.split('\n')) {
    // Cheap check first: most lines are messages, not titles.
    if (!line.includes('-title"')) continue;
    try {
      const entry = JSON.parse(line) as { type?: string; aiTitle?: unknown; customTitle?: unknown };
      if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') ai = entry.aiTitle;
      if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') custom = entry.customTitle;
    } catch {
      // A half-written or unknown line: skip it.
    }
  }
  // A title the user set (/rename) wins over Claude's own.
  return custom ?? ai;
}
