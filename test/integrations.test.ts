import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { matches, sign, TEMPLATES } from '../src/main/automation';

test('automation conditions', () => {
  const lead = { grade: 'A', email_status: 'verified', country: 'US', rating: 3.9, tags: 'chain, vip', email: '' };
  assert.equal(matches(lead, [{ field: 'grade', op: 'eq', value: 'a' }]), true);
  assert.equal(matches(lead, [{ field: 'email_status', op: 'in', value: 'verified, mx-ok' }]), true);
  assert.equal(matches(lead, [{ field: 'rating', op: 'lte', value: '4' }, { field: 'country', op: 'neq', value: 'GB' }]), true);
  assert.equal(matches(lead, [{ field: 'tags', op: 'contains', value: 'vip' }, { field: 'email', op: 'empty' }]), true);
  assert.equal(matches(lead, [{ field: 'grade', op: 'eq', value: 'B' }]), false);
  assert.equal(matches({ rating: null }, [{ field: 'rating', op: 'gte', value: '0' }]), false, 'missing numbers never pass');
  assert.equal(matches(lead, []), true);
  assert.ok(TEMPLATES.length >= 5 && TEMPLATES.every((t) => !t.on), 'templates start switched off');
});

test('webhook signatures are HMAC-SHA256', () => {
  const body = '{"event":"reply"}';
  assert.equal(sign('s3cret', body), createHmac('sha256', 's3cret').update(body).digest('hex'));
});

test('MCP server speaks the protocol over stdio', async () => {
  const p = spawn(process.execPath, ['bin/quarrix-mcp.mjs'], { env: { ...process.env, QUARRIX_DATA: '/nonexistent' } });
  const lines: any[] = [];
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const sendMsg = (m: unknown) => p.stdin.write(JSON.stringify(m) + '\n');
  sendMsg({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  sendMsg({ jsonrpc: '2.0', method: 'notifications/initialized' });
  sendMsg({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  sendMsg({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'start_business_search', arguments: { category: 'x', place: 'y', confirm: false } } });
  sendMsg({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_leads', arguments: {} } });
  await new Promise((r) => setTimeout(r, 800));
  p.kill();
  const by = (id: number) => lines.find((l) => l.id === id);
  assert.equal(by(1).result.serverInfo.name, 'quarrix');
  assert.ok(by(2).result.tools.some((t: any) => t.name === 'list_leads' && t.annotations.readOnlyHint));
  assert.match(by(3).result.content[0].text, /confirm: true/);
  assert.equal(by(4).result.isError, true, 'no app running: a clear error, not a crash');
  assert.match(by(4).result.content[0].text, /not running/);
});

test('CLI prints help and explains when the app is not running', () => {
  const h = spawnSync(process.execPath, ['bin/quarrix.mjs', 'help'], { encoding: 'utf8' });
  assert.match(h.stdout, /quarrix leads/);
  const r = spawnSync(process.execPath, ['bin/quarrix.mjs', 'leads'], { encoding: 'utf8', env: { ...process.env, QUARRIX_DATA: '/nonexistent' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Local API/);
});
