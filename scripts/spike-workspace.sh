#!/usr/bin/env bash
# Creates the multi-root workspace used by the Task 2 spike. Folder 0 is a permanent, empty "Hub".
set -euo pipefail
dir="$HOME/.worktree-hub-spike"
mkdir -p "$dir"
cat > "$dir/spike.code-workspace" <<'JSON'
{
  "folders": [{ "path": ".", "name": "Hub" }]
}
JSON
echo "Created $dir/spike.code-workspace"
