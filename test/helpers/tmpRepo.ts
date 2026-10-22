// Creates throwaway git repositories for tests: a bare "origin" and a clone "main" with one commit.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd });
  return stdout;
}

/** A temp folder with symlinks resolved (on macOS /var is a link to /private/var, and git reports real paths). */
export async function makeTempDir(): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'wh-test-')));
}

export interface TmpRepo {
  root: string;
  main: string;
  origin: string;
  cleanup(): Promise<void>;
}

export async function makeRepo(): Promise<TmpRepo> {
  const root = await makeTempDir();
  const origin = path.join(root, 'origin.git');
  const main = path.join(root, 'main');
  await git(root, 'init', '--bare', '-b', 'main', origin);
  await git(root, 'clone', '-q', origin, main);
  await git(main, 'config', 'user.name', 'Test');
  await git(main, 'config', 'user.email', 'test@example.com');
  await git(main, 'switch', '-q', '-c', 'main');
  await fs.writeFile(path.join(main, 'README.md'), '# test\n');
  await git(main, 'add', '.');
  await git(main, 'commit', '-q', '-m', 'init');
  await git(main, 'push', '-q', '-u', 'origin', 'main');
  await git(main, 'remote', 'set-head', 'origin', 'main');
  return { root, main, origin, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
