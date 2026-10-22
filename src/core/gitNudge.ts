// VS Code's own Git status (bottom-left branch and sync button) follows the repo of the last file
// opened in the editor. After a switch that brings back no files, it would keep showing the old
// worktree. Opening one file of the new worktree for a moment makes it follow. These helpers
// choose that file.

/** Top-level files from `git ls-tree HEAD` ("<mode> <type> <sha>\t<name>"); folders are skipped. */
export function rootFilesFromLsTree(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const [, type] = line.slice(0, tab).split(' ');
    const name = line.slice(tab + 1);
    // Git puts unusual names in quotes with escapes; skip those rather than decode them.
    if (type === 'blob' && name && !name.startsWith('"')) files.push(name);
  }
  return files;
}

const PREFERRED = ['README.md', 'readme.md', 'README', 'package.json', 'composer.json', 'go.mod', 'pyproject.toml'];

/** A small, harmless text file to open for a moment: a README if there is one. */
export function pickNudgeFile(rootFiles: string[]): string | undefined {
  return PREFERRED.find((f) => rootFiles.includes(f)) ?? rootFiles[0];
}
