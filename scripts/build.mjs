// Builds the main and preload processes with esbuild and the interface with Vite.
import { build, context } from 'esbuild';
import { build as viteBuild, createServer } from 'vite';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const dev = process.argv.includes('--dev');
rmSync('out', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: dev,
  minify: !dev,
  external: ['electron', 'better-sqlite3', 'pdfjs-dist', 'all-the-cities'],
  logLevel: 'info',
};
const main = { ...common, entryPoints: ['src/main/index.ts'], outfile: 'out/main/index.js' };
const preload = { ...common, entryPoints: ['src/preload/index.ts'], outfile: 'out/preload/index.js' };

if (dev) {
  const server = await createServer({ configFile: 'vite.config.mjs' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  for (const cfg of [main, preload]) await (await context(cfg)).watch();
  await build(main);
  await build(preload);
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], {
    stdio: 'inherit',
    env: { ...process.env, QUARRIX_DEV_URL: url },
  }).on('exit', () => process.exit(0));
} else {
  await Promise.all([build(main), build(preload)]);
  await viteBuild({ configFile: 'vite.config.mjs' });
}
