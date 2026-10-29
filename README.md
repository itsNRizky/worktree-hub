# Worktree Hub

A VS Code sidebar for working on several branches at the same time, each with its own
[Claude Code](https://claude.com/claude-code) agents.

**Projects → git worktrees → agents**, in one window. Click a worktree and the whole window
follows it: the Explorer shows its folder, the editor shows its files, and the terminal shows its
agents. Click another worktree and all of it swaps. The agents you left keep running in the
background.

```
WORKTREES                                  +  ⟳
▾ WA  web-app
    ⎇ main                       primary
    ⎇ feat/login *               🔗
        ● Fix the login redirect          2m      ← green: working
        ● Add a rate-limit test           now     ← yellow: waiting for you
    ⎇ fix/crash
▾ AP  api
    ⎇ main                       primary
    ⎇ feat/login                 🔗               ← linked to web-app's feat/login
```

## Why worktrees

A **git worktree** is an extra checkout of the same repository, in its own folder, on its own
branch. All worktrees share one `.git` history, so you do not clone again, and a commit made in one
worktree is visible in the others.

Because every branch has its own folder:

- an agent can work on `fix/crash` while you (or another agent) work on `feat/login`, and their
  files never mix;
- you do not stash or commit before you change branches;
- every Claude Code agent changes only the branch of its own folder.

Git gives you the commands (`git worktree add`, `git worktree list`, `git worktree remove`).
Worktree Hub runs them for you, and gives each worktree its own files, terminals and agents in VS Code.

## How it works

### You work in one workspace that Worktree Hub creates

Worktree Hub works in its own workspace file: `~/.worktree-hub/worktree-hub.code-workspace`.
You open this workspace once and stay in it. You do not open your repositories as folders any more.

The workspace always starts with an empty folder named **Hub** (`~/.worktree-hub`). It is there on
purpose. When the first folder of a VS Code workspace changes, VS Code restarts all extensions, and
that stops running terminals. The Hub folder never changes, so a switch never restarts anything.

After the Hub folder, the workspace holds only the worktree you work on now (and its linked
worktrees, see below). So the Explorer, search, Source Control and the language servers see only
the branch you work on:

```
EXPLORER
├── Hub              ← always first, always empty
└── feat-login       ← the worktree you clicked
```

### Where worktrees are created

In a `.worktrees` folder next to your repositories:

```
~/Projects/
├── web-app/                  ← main checkout (the folder you added as a project)
├── api/
└── .worktrees/
    ├── web-app/
    │   ├── feat-login/       ← branch feat/login
    │   └── fix-crash/        ← branch fix/crash
    └── api/
        └── feat-login/       ← branch feat/login (linked to web-app's)
```

The folder name is the branch name with every `/` changed to `-`. Worktrees made by other tools
(for example Claude Code's `.claude/worktrees/`) show in the sidebar too, because git lists them.

### What happens when you click a worktree

1. The files you have open are saved, and their tabs close. Worktree Hub remembers them.
2. The clicked worktree's folder replaces the old one in the workspace.
3. The tabs you had open in this worktree last time come back.
4. Its last-used terminal comes to the front. If it has no terminal, a Claude agent starts on the
   first visit, and a plain shell after that.
5. VS Code's Source Control view and the branch in the status bar follow the switch.

The terminals of the other worktrees keep running. Claude Code's diff tabs are never closed,
because closing one rejects Claude's edit.

### Agents

An agent is the `claude` CLI in a VS Code terminal, in the worktree's folder. Worktree Hub starts
it like this, and the command is visible in the terminal:

```bash
claude --settings <hook settings file> [--add-dir <linked worktree>]...
```

The settings file adds hooks for that agent only. Your `~/.claude/settings.json` is not changed.
The hooks write the agent's status to a file, and the sidebar shows it:

- **green dot**: working · **yellow dot**: waiting for you (a permission or a question) ·
  **gray dot**: done · **outline**: started, no prompt yet · **slashed circle**: Claude exited.
- **A popup** (bottom right) when an agent finishes or needs your answer, for example
  "Claude finished: web-app › feat/login". Its **Show** button opens that agent. There is no
  popup for the agent you are looking at.
- **A number on the Worktree Hub icon**: how many agents wait for you.

The agent's name in the sidebar is Claude's session title (or your first prompt).
Agents keep running when you reload the window, and Worktree Hub finds them again.

### Linked worktrees: one task, two repositories

Some tasks change two repositories, for example a web app and its API.
**Link to Another Repo…** creates the same branch in the other repository and links the two
worktrees. Then:

- a click on either one opens both folders together. The one you clicked gets the focus: its
  terminal, the status bar and Source Control;
- new agents start with `--add-dir <the other worktree>`, so one agent can change both
  repositories. Worktree Hub offers to type `/add-dir` into agents that are already running;
- **Remove Worktree…** removes both.

### Creating a worktree

**New Worktree** (`+`) asks two things:

1. **A name.** It is used for the branch and the folder, for example `feat/login`.
2. **The base branch.** Local and remote branches; your `defaultBaseBranch` comes first.

Then Worktree Hub:

1. runs `git fetch`, and starts the new branch from the latest copy of the base. When your local
   branch (for example `main`) is behind `origin/main`, it starts from `origin/main`. Your local
   branch is not changed. If your local branch has commits that are not on the remote, it starts
   from your local branch and tells you;
2. creates the branch with `--no-track`, so a later `git push` cannot go to the base branch by
   mistake. Push it the first time with `git push -u origin <branch>`;
3. copies the `copyFiles` (for example `.env`) from the main checkout. Files that are already there
   are never overwritten;
4. switches the window to the new worktree, where a Claude agent starts.

If the name is a branch that already exists, Worktree Hub offers to check out that branch as it is.

### Removing a worktree

**Remove Worktree…** deletes the worktree's folder (and the folders of its linked worktrees). The
confirmation lists uncommitted changes and open terminals first. **Branches are always kept.**
"Remove and open in main" also checks the branch out in the main checkout, if that checkout has no
uncommitted changes.

## Requirements

- VS Code 1.140 or newer
- git (tested with 2.49)
- Claude Code: the `claude` command on your `PATH`
- Node.js to build the extension (tested with 22)

Tested on macOS.

## Install

Worktree Hub is not on the Marketplace. Build it from source:

```bash
git clone https://github.com/itsNRizky/worktree-hub.git
cd worktree-hub
npm install
npm run package          # creates worktree-hub-0.1.0.vsix
```

Then, in VS Code, run **Extensions: Install from VSIX…** and pick `worktree-hub-0.1.0.vsix`.
Or from a terminal: `code --install-extension worktree-hub-0.1.0.vsix`.

## Getting started

1. Open the **Worktree Hub** view in the activity bar and click **Set Up Workspace**. The window
   opens `~/.worktree-hub/worktree-hub.code-workspace`. Work in this window from now on.
2. Click **Add Project** and pick the main checkout of a repository (the folder you cloned).
3. Optional: change the project in your user settings (JSON):

   ```jsonc
   "worktreeHub.projects": [
     {
       "path": "~/Projects/web-app",
       "defaultBaseBranch": "origin/main",
       "copyFiles": [".env", ".claude/settings.local.json"]
     }
   ]
   ```

4. Click `+` to create your first worktree.

Tip: move the terminal panel to the secondary side bar. Then the agent of the worktree on screen
sits next to your code.

## Settings

`worktreeHub.projects` is a list. Each project has:

| Key | Meaning |
| --- | --- |
| `path` | The main checkout of the repository. `~` is allowed. |
| `defaultBaseBranch` | The base branch shown first in **New Worktree**. If it is not set: the branch `origin/HEAD` points to (for example `origin/main`). |
| `copyFiles` | Untracked files copied from the main checkout into every new worktree. **Add Project** sets `.env` and `.claude/settings.local.json`. |

## Where to click

| Where | What it does |
| --- | --- |
| Title bar `+` / `⟳` | New Worktree / Refresh |
| Title bar `…` | Add Project, Set Up Workspace |
| Project row `+` | New Worktree in that project |
| Worktree row: click | Switch to it |
| Worktree row: hover | `+` New Agent · link icon: Link to Another Repo… |
| Worktree row: right-click | New Agent, New Terminal, Link / Unlink, Reveal in Finder, Remove Worktree… |
| Agent or terminal row | Click: show it · `×`: close it |
| Command Palette | **Worktree Hub: Switch to Worktree…** to switch from the keyboard |

## What it never does

- It never runs your project's commands: no `npm install`, `composer install`, Docker or `make`.
  Run them yourself in the worktree's terminal. Every command Worktree Hub types into a terminal is
  visible there.
- It never changes your Claude Code settings.
- It never deletes a branch, and it never moves your local base branch.

Project-specific setup is yours to handle. For example, a Docker Compose project takes its name
from its folder, so a worktree folder starts a second, empty stack. Put
`COMPOSE_PROJECT_NAME=web-app` in `.env` (which `copyFiles` copies) to keep one stack.

## Development

```bash
npm install
npm test            # unit tests (vitest)
npm run typecheck
npm run build       # then press F5 in VS Code ("Run Extension")
```

How the code is organised:

- `src/core/` — pure logic, no VS Code: names and paths, git output parsing, link groups, tab
  decisions, hook events → status, tree rows, texts. Tested in `test/core/`.
- `src/git/git.ts` — every git command (run with `execFile`, never through a shell). Tested
  against real temporary repositories.
- `src/app/` — loading the data (`repository.ts`) and the order of steps in a switch (`switcher.ts`).
- `src/vscode/` — the VS Code side: tree view, terminals, tabs, folders, status bar, commands.
  `hub.ts` connects the parts.
- `src/hook/status-hook.ts` — run by Claude Code's hooks; writes one status file per agent.

## License

[MIT](LICENSE)
