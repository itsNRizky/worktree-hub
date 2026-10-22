// Builds the extension into dist/.
//   node esbuild.mjs               one development build (with source maps)
//   node esbuild.mjs --watch       rebuild on every change
//   node esbuild.mjs --production  minified build for the .vsix
import { context } from 'esbuild';
import { existsSync, rmSync } from 'node:fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// A release build starts from an empty dist/, so old source maps do not end up in the .vsix.
if (production) rmSync('dist', { recursive: true, force: true });

// Two separate bundles:
// - extension.js runs inside VS Code.
// - status-hook.js is run by Claude Code's hooks, outside VS Code, so it must not import 'vscode'.
const entries = [
  { in: 'src/extension.ts', out: 'extension' },
  { in: 'src/hook/status-hook.ts', out: 'status-hook' },
].filter((e) => existsSync(e.in));

const ctx = await context({
  entryPoints: entries,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // 'vscode' is provided by VS Code at runtime; it is not a real npm package.
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
