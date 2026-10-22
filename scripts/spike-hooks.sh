#!/usr/bin/env bash
# Writes the Claude Code settings used by spike checks 6–8 into .dev/ (git-ignored).
#   .dev/spike-settings.json    hooks that append every event's JSON to .dev/hook-log.jsonl
#   .dev/merge-test/            a folder with its own project hook, to see if both hooks run
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
dev="$repo/.dev"
mkdir -p "$dev/merge-test/.claude"

log="cat >> '$dev/hook-log.jsonl'; echo >> '$dev/hook-log.jsonl'"

node - "$dev" "$log" <<'NODE'
const fs = require('node:fs');
const [dev, log] = process.argv.slice(2);
const entry = (extra = {}) => [{ ...extra, hooks: [{ type: 'command', command: log }] }];
const settings = {
  hooks: {
    SessionStart: [
      ...entry(),
      { hooks: [{ type: 'command', command: `echo flag-hook >> '${dev}/merge-log.txt'` }] },
    ],
    UserPromptSubmit: entry(),
    PostToolUse: entry({ matcher: '*' }),
    Notification: entry(),
    Stop: entry(),
    SessionEnd: entry(),
  },
};
fs.writeFileSync(`${dev}/spike-settings.json`, JSON.stringify(settings, null, 2));
const project = {
  hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `echo project-hook >> '${dev}/merge-log.txt'` }] }] },
};
fs.writeFileSync(`${dev}/merge-test/.claude/settings.json`, JSON.stringify(project, null, 2));
NODE

echo "Wrote $dev/spike-settings.json and $dev/merge-test/.claude/settings.json"
