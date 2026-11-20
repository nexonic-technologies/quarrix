// Live provider checks: builds test/live and runs it inside Electron's Node, like the integration tests. Needs internet access.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
await build({ entryPoints: ['test/live/providers.live.ts'], outfile: 'out/test/live.js', bundle: true, platform: 'node', format: 'cjs', target: 'node22', alias: { electron: './test/shim/electron.ts' }, external: ['better-sqlite3', 'all-the-cities', 'pg'], logLevel: 'error' });
const electron = createRequire(import.meta.url)('electron');
const r = spawnSync(electron, ['out/test/live.js'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' } });
process.exit(r.status ?? 1);
