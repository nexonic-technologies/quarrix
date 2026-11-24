import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, isBlockedHost, isSafeExternalUrl, sameBusiness, outreachBlock, stepReady } from '../src/main/safety';

test('private and loopback addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  assert.equal(isBlockedHost('localhost'), true);
  assert.equal(isBlockedHost('printer.local'), true);
  assert.equal(isBlockedHost('[::1]'), true);
  assert.equal(isBlockedHost('example.com'), false);
});

test('only web and mail links open externally', () => {
  assert.equal(isSafeExternalUrl('https://example.com'), true);
  assert.equal(isSafeExternalUrl('mailto:a@b.com'), true);
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('smb://host/share'), false);
});

test('branches of a chain sharing a domain are not merged', () => {
  const a = { name: 'Smile Dental', domain: 'smile.com', city: 'Austin', address: '1 Main St', phone: '+1 512 555 0101' };
  assert.equal(sameBusiness(a, { ...a, city: 'Dallas', address: '9 Elm St', phone: '+1 214 555 0199' }), false);
  assert.equal(sameBusiness(a, { ...a, address: '22 Oak Ave', phone: '+1 512 555 0177' }), false);
  assert.equal(sameBusiness(a, { ...a }), true);
  assert.equal(sameBusiness(a, { name: 'Smile Dental Austin', domain: 'smile.com', phone: '(512) 555-0101' }), true);
  assert.equal(sameBusiness({ name: 'Acme', domain: 'acme.com' }, { name: 'ACME', domain: 'acme.com' }), true);
});

test('outreach is blocked for suppressed, finished and no-solicit leads', () => {
  assert.equal(outreachBlock({ email: 'a@b.com', status: 'new' }, false), '');
  assert.match(outreachBlock({ email: '', status: 'new' }, false), /no email/);
  assert.match(outreachBlock({ email: 'a@b.com', status: 'new' }, true), /do-not-contact/);
  assert.match(outreachBlock({ email: 'a@b.com', status: 'replied' }, false), /replied/);
  assert.match(outreachBlock({ email: 'a@b.com', status: 'new', audit: JSON.stringify({ facts: { noSolicit: true } }) }, false), /no solicitation/);
  assert.equal(outreachBlock({ email: 'a@b.com', status: 'new', audit: '{bad' }, false), '');
});

test('follow-ups never go before earlier steps', () => {
  const now = '2026-11-20T10:00:00.000Z';
  assert.equal(stepReady(0, '2026-11-20T09:00:00.000Z', [], now), true);
  assert.equal(stepReady(1, null, [0], now), false, 'no due date means not due');
  assert.equal(stepReady(1, '2026-11-20T09:00:00.000Z', [], now), false, 'step 0 not sent');
  assert.equal(stepReady(2, '2026-11-20T09:00:00.000Z', [0], now), false, 'step 1 not sent');
  assert.equal(stepReady(2, '2026-11-20T09:00:00.000Z', [0, 1], now), true);
  assert.equal(stepReady(1, '2026-11-21T09:00:00.000Z', [0], now), false, 'not due yet');
});

test('due-message query keeps sequence order (real SQLite)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { DUE_SQL } = await import('../src/main/safety');
  const d = new DatabaseSync(':memory:');
  d.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, lead_id INT, channel TEXT, step INT, status TEXT, due_at TEXT)");
  const add = d.prepare('INSERT INTO messages (lead_id, channel, step, status, due_at) VALUES (?, ?, ?, ?, ?)');
  add.run(1, 'email', 0, 'scheduled', '2026-01-02');   // lead 1: first email due
  add.run(1, 'email', 1, 'scheduled', '2026-01-01');   // its follow-up has an earlier date but must wait
  add.run(2, 'email', 0, 'sent', '2026-01-01');
  add.run(2, 'email', 1, 'scheduled', null);           // no due date: never sends
  add.run(3, 'email', 0, 'sent', '2026-01-01');
  add.run(3, 'email', 1, 'failed', '2026-01-01');
  add.run(3, 'email', 2, 'scheduled', '2026-01-01');   // step 1 failed: step 2 must not go
  add.run(4, 'email', 0, 'sent', '2026-01-01');
  add.run(4, 'email', 1, 'scheduled', '2026-01-03');   // ready
  const rows = d.prepare(DUE_SQL).all('2026-02-01') as { lead_id: number; step: number }[];
  assert.deepEqual(rows.map((r) => [r.lead_id, r.step]), [[1, 0], [4, 1]]);
});

test('diagnostics redaction removes secrets and personal details', async () => {
  const { redact } = await import('../src/main/safety');
  const out = redact(JSON.stringify({ apiKey: 'sk-ant-abcdef1234567890', smtpPass: 'hunter2hunter2', note: 'mail ana@acme.com or call +1 (512) 555-0142', url: 'https://x.com/a?key=AIzaSyA1234567890abcdefg&b=1', auth: 'Bearer abcdefghijklmnop' }));
  for (const bad of ['sk-ant-abcdef', 'hunter2', 'ana@', '555-0142', 'AIzaSyA', 'abcdefghijklmnop']) assert.ok(!out.includes(bad), bad);
  assert.match(out, /\[email\]@acme\.com/);
});

test('drawn areas: polygon membership, covering circle and grid cells', async () => {
  const { inPolygon, polygonCircle, gridCells, insideBox, inside } = await import('../src/main/geo');
  const sq: [number, number][] = [[31.0, 74.0], [31.0, 74.2], [31.2, 74.2], [31.2, 74.0]];
  assert.equal(inPolygon(sq, { lat: 31.1, lon: 74.1 }), true);
  assert.equal(inPolygon(sq, { lat: 31.3, lon: 74.1 }), false);
  const g = { ...polygonCircle(sq), poly: sq };
  assert.ok(g.km > 10 && g.km < 20);
  assert.equal(inside(g, { lat: 31.25, lon: 74.1 }), false, 'outside the drawn area even if inside the circle');
  const cells = gridCells(g, 2.5);
  assert.ok(cells.length > 20 && cells.every((c) => c.lat > 30.9 && c.lat < 31.3));
  assert.equal(insideBox([31.0, 31.2, 74.0, 74.2], { lat: 31.1, lon: 74.1 }), true);
  assert.equal(insideBox([31.0, 31.2, 74.0, 74.2], { lat: 24.8, lon: 67.0 }), false, 'Karachi is not in a Gujranwala box');
});

test('job duplicates keep the same role in different cities', async () => {
  const { dedupe } = await import('../src/main/jobsearch');
  const j = (id: string, location: string) => ({ id, source: 'x', title: 'Sales Manager', company: 'Acme', location, workplace: '' as const, type: '', level: '', salary: '', url: '', posted: '', tags: [], snippet: '' });
  assert.equal(dedupe([j('1', 'Lahore'), j('2', 'Karachi'), j('3', 'Lahore')]).length, 2);
  assert.equal(dedupe([j('1', '東京'), j('2', '大阪'), j('3', '東京')]).length, 2);
  assert.equal(dedupe([j('1', 'Remote'), j('2', 'Worldwide'), j('3', '')]).length, 3);
  assert.equal(dedupe([j('1', ''), j('2', '')]).length, 2);
});

test('job provider deadlines settle promptly and handle late failures', async () => {
  const { withTimeout } = await import('../src/main/jobsearch');
  assert.equal(await withTimeout(Promise.resolve('ok'), 45_000), 'ok');
  await assert.rejects(withTimeout(Promise.reject(new Error('provider failed')), 45_000), /provider failed/);
  await assert.rejects(withTimeout(new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 20)), 5), /no answer/);
});
