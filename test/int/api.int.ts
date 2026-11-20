// Integration: local API over real HTTP, the command line and MCP server as separate processes, signed webhooks,
// automations, and the network guard. Everything runs on this machine.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as localapi from '../../src/main/localapi';
import * as automation from '../../src/main/automation';
import { load, save } from '../../src/main/settings';
import { fetchText, safeLookup } from '../../src/main/util';

const dir = process.env.QUARRIX_TEST_DIR!;
let base = '', token = '', hook: Server, hookPort = 0;
const got: { sig: string; body: string }[] = [];
const node = process.execPath; // Electron in Node mode, like the installed CLI

before(async () => {
  db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate(); automation.migrate();
  db.onEvent((l, t, d) => void automation.handle(l, t, d));
  save({ api: { ...load().api, on: true, port: 0 } });
  db.upsertLead({ name: 'Api Dental', email: 'a@api.test', city: 'Austin', grade: 'A', source: 'import', client: '' } as any);
  hook = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ sig: String(req.headers['x-quarrix-signature']), body: b }); res.end('ok'); }); });
  await new Promise<void>((r) => hook.listen(0, '127.0.0.1', () => r()));
  hookPort = (hook.address() as any).port;
});
after(() => { localapi.stop(); hook.close(); });

test('local API: token required, capture token limited to capture', async (t) => {
  save({ api: { ...load().api, port: 47000 + Math.floor(Math.random() * 900) } });
  const port = localapi.start()!;
  base = `http://127.0.0.1:${port}`; token = localapi.ensureToken();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await fetch(`${base}/v1/leads`)).status, 401);
  const r = await fetch(`${base}/v1/leads?q=Api`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200); assert.equal((await r.json()).rows[0].name, 'Api Dental');
  const cap = localapi.captureToken();
  assert.equal((await fetch(`${base}/v1/leads`, { headers: { Authorization: `Bearer ${cap}` } })).status, 401, 'capture token cannot read leads');
  const c = await fetch(`${base}/v1/capture`, { method: 'POST', headers: { Authorization: `Bearer ${cap}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://capture-example.com/about', title: 'Capture Example | Home' }) });
  assert.equal(c.status, 201);
  assert.equal(c.headers.get('access-control-allow-origin'), '*');
  // fetch() may not set Host, so use a raw request like a rebinding page would.
  const status = await new Promise<number>((res) => request(`${base}/v1/leads`, { headers: { Authorization: `Bearer ${token}`, Host: 'evil.example' } }, (r) => { r.resume(); res(r.statusCode ?? 0); }).end());
  assert.equal(status, 403, 'DNS-rebinding host refused');
});

test('CLI and MCP server work against the running API', async () => {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', QUARRIX_DATA: dir };
  // Async on purpose: the API answers from this same process, so a blocking spawn would deadlock.
  const cli = await new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
    const p = spawn(node, ['bin/quarrix.mjs', 'leads', 'Api', '--json'], { env });
    let o = '', e = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
    const t = setTimeout(() => p.kill(), 15000);
    p.on('close', (status) => { clearTimeout(t); res({ status, stdout: o, stderr: e }); });
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout)[0].name, 'Api Dental');
  const m = spawn(node, ['bin/quarrix-mcp.mjs'], { env });
  let out = '';
  m.stdout.on('data', (d) => (out += d));
  m.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_leads', arguments: { text: 'Api' } } }) + '\n');
  await new Promise((r) => setTimeout(r, 800));
  m.kill();
  const res = JSON.parse(out.split('\n')[0]);
  assert.match(res.result.content[0].text, /Api Dental/);
});

test('webhooks are signed; automations act on events', async () => {
  save({ webhooks: [{ url: `http://127.0.0.1:${hookPort}/h`, events: ['reply'], secret: 's3cret-value', on: true }],
    automations: [{ id: 'r1', name: 'Tag replies', on: true, trigger: 'reply', conditions: [{ field: 'grade', op: 'eq', value: 'A' }], actions: [{ type: 'tag', value: 'replied-a' }, { type: 'task', value: 'Call back', days: 1 }] }] });
  const id = (db.queryLeads({ q: 'Api Dental' }).rows[0]).id;
  db.logEvent(id, 'reply', 'Sounds good');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(got.length, 1);
  assert.equal(got[0].sig, `sha256=${createHmac('sha256', 's3cret-value').update(got[0].body).digest('hex')}`);
  assert.equal(JSON.parse(got[0].body).event, 'reply');
  assert.match(db.getLead(id)!.tags, /replied-a/);
  assert.ok((crm.listTasks({ leadId: id }) as any[]).some((t) => t.title === 'Call back'));
});

test('network guard refuses this computer, including by name and after DNS', async () => {
  await assert.rejects(fetchText(`http://127.0.0.1:${hookPort}/`), /private network/);
  await assert.rejects(fetchText(`http://localhost:${hookPort}/`), /private network/);
  await assert.rejects(fetchText('http://[::1]/'), /private network/);
  const e = await new Promise<Error | null>((r) => safeLookup('localhost', {}, (err) => r(err)));
  assert.match(String(e?.message), /private network/, 'checked at connect time too');
});
