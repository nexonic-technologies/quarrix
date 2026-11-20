// Bundles each test file with esbuild and runs it with Node's built-in test runner.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('test').filter((f) => f.endsWith('.test.ts'));
await build({ entryPoints: files.map((f) => `test/${f}`), outdir: 'out/test', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'better-sqlite3'], logLevel: 'error' });
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => `out/test/${f.replace(/\.ts$/, '.js')}`)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
