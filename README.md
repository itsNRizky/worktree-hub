# Worktree Hub

An Orca-style sidebar for VS Code: **projects → git worktrees → Claude Code agents**, in one window.
Click a worktree and the whole window follows it: its folder in the Explorer, its open files in the
editor, and its terminals (with its Claude agents). Click another worktree and all three swap.
The agents keep running in the background.

## Install

```bash
npm install
npm run package          # creates worktree-hub-0.1.0.vsix
```

Then in VS Code: **Extensions: Install from VSIX…** and pick `worktree-hub-0.1.0.vsix`.
(Or, if the `code` command is not on your PATH:
`"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension worktree-hub-0.1.0.vsix`.)

## First run

1. Open the Worktree Hub view and click **Set Up Workspace**. The window reloads into
   `~/.worktree-hub/worktree-hub.code-workspace`. The first folder ("Hub") is empty on purpose:
   changing the first folder of a workspace restarts all extensions, so the hub never changes.
2. Click **Add Project** and pick the main checkout of a repository.
3. Open your user settings (JSON) and adjust the project:

   ```jsonc
   "worktreeHub.projects": [
     {
       "path": "~/Projects/acme/shop-app",
       "defaultBaseBranch": "staging",
       "copyFiles": [".env", ".claude/settings.local.json"]
     }
   ]
   ```

   - `defaultBaseBranch`: pre-selected when you create a worktree.
   - `copyFiles`: untracked files copied from the main checkout into every new worktree.
     Existing files are never overwritten.

## Using it

- **`+` (New Worktree)**: type a name (used for the branch and the folder), pick a base branch.
  The worktree is created in `<repos folder>/.worktrees/<repo>/<name with / → ->/`, the listed
  files are copied, and one Claude agent starts in it.
- **Click a worktree** to switch. Unsaved files of the old worktree are saved, its tabs close and
  come back when you return. Claude Code diff tabs are never closed (closing one rejects the edit).
- **Hover a worktree**: `+` starts another agent, the link icon links it to another repo.
- **Link to Another Repo**: makes the same branch in the other repo. Both open together, and new
  agents start with `--add-dir <other worktree>`.
- **Remove Worktree**: removes the worktree and its linked worktree. Branches are always kept.
  "Remove and open in main" also checks the branch out in each main checkout (if it is clean).
- **Agent dots**: green = working, yellow = waiting for you, gray = done. The number on the
  Worktree Hub icon counts agents waiting for you.
- **Switch to Worktree…** (Command Palette): switch from the keyboard.

## What it never does

- It never runs project commands: no `npm install`, `composer install`, Docker or `make`.
  Run those yourself in the worktree's terminal. Every command the extension types into a
  terminal is visible there.
- It never changes your Claude Code settings (`~/.claude/settings.json`). Agent status comes from
  hooks passed only to the agents it starts (`claude --settings <file>`).
- It never deletes a branch.

Project-specific setup is yours to handle. Example: a Docker Compose project named after its
folder would start a second, empty stack from a worktree folder; adding
`COMPOSE_PROJECT_NAME=shop-app` to `.env` (which `copyFiles` copies) keeps one stack.

## How the code is organised

- `src/core/` — pure logic, no VS Code: names and paths, git output parsing, link groups,
  tab decisions, hook → status, tree rows, texts. Unit-tested in `test/core/`.
- `src/git/git.ts` — every git command (via `execFile`, never a shell). Tested against real temp repos.
- `src/app/` — loading data (`repository.ts`) and the switch order (`switcher.ts`).
- `src/vscode/` — the VS Code side: tree view, terminals, tabs, folders, status bar, commands.
  `hub.ts` connects the parts.
- `src/hook/status-hook.ts` — run by Claude Code's hooks; writes one status file per agent.

Design and plan: `docs/superpowers/specs/` and `docs/superpowers/plans/`. Spike results that shaped
the design: `docs/spike-results.md`.

## Develop

```bash
npm test            # unit tests
npm run typecheck
npm run build       # then press F5 in VS Code ("Run Extension")
```
