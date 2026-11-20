// Unit tests run in Node. Integration tests (test/int) run inside Electron's own Node (ELECTRON_RUN_AS_NODE=1),
// so the real better-sqlite3 build, real files and real sockets are used; only windows are replaced by test/shim.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const unit = readdirSync('test').filter((f) => f.endsWith('.test.ts'));
await build({ entryPoints: unit.map((f) => `test/${f}`), outdir: 'out/test', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'better-sqlite3', 'node:sqlite', 'all-the-cities', 'pg', 'undici'], logLevel: 'error' });
let r = spawnSync(process.execPath, ['--test', ...unit.map((f) => `out/test/${f.replace(/\.ts$/, '.js')}`)], { stdio: 'inherit' });
if (r.status) process.exit(r.status);

const ints = readdirSync('test/int').filter((f) => f.endsWith('.int.ts'));
if (!ints.length || process.argv.includes('--unit')) process.exit(0);
await build({ entryPoints: ints.map((f) => `test/int/${f}`), outdir: 'out/test/int', bundle: true, platform: 'node', format: 'cjs', target: 'node22', alias: { electron: './test/shim/electron.ts' }, external: ['better-sqlite3', 'all-the-cities', 'pg', 'smtp-server'], logLevel: 'error' });
const electron = createRequire(import.meta.url)('electron'); // path to the Electron binary
r = spawnSync(electron, ['--test', '--test-concurrency=1', ...ints.map((f) => `out/test/int/${f.replace(/\.ts$/, '.js')}`)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' } });
process.exit(r.status ?? 1);
