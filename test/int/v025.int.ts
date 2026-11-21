// Integration (0.25): input checks on mutations, workspace guards, franchise dedupe, career signal fixes,
// Workday retries and real cancellation of job searches.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as jobstore from '../../src/main/jobstore';
import * as career from '../../src/main/career';
import * as scope from '../../src/main/scope';
import { check, leadPatch } from '../../src/main/validate';
import { workdayJobs } from '../../src/main/ats';
import { fetchScope, fetchText } from '../../src/main/util';
import { keywordMatch } from '../../src/main/resume';

const dir = process.env.QUARRIX_TEST_DIR!;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
before(() => { db.openDb(join(dir, 'v025.db')); db.migrateData(); crm.migrate(); jobstore.migrate(); career.migrateTables(); });

test('lead edits: protected fields are refused, values are checked', () => {
  assert.throws(() => leadPatch({ client: 'Other' }), /cannot be changed/);
  assert.throws(() => leadPatch({ search_id: 3 }), /cannot be changed/);
  assert.throws(() => leadPatch({ status: 'bogus' }), /Unknown status/);
  assert.throws(() => leadPatch({ email: 'not-an-email' }), /not valid/);
  assert.throws(() => leadPatch({ notes: { $gt: 1 } }), /must be text/);
  assert.deepEqual(leadPatch({ status: 'won', wa_consent: true, email: ' A@B.CO ' }), { status: 'won', wa_consent: 1, email: 'a@b.co' });
  assert.throws(() => check('leads:update', ['abc', { status: 'won' }]), /not valid/);
  assert.throws(() => check('leads:add', [{ name: 'Shop', client: 'Other' }]), /cannot be changed/);
  assert.throws(() => check('leads:add', [{ name: 'Shop', lat: 300 }]), /out of range/);
  assert.equal(check('leads:add', [{ name: 'Shop', lat: 10 }])[0].status, 'new');
});

test('signals: only seen/dismissed change; column names cannot be injected; no reassignment', () => {
  const [a] = db.upsertLead({ name: 'A', source: 'manual', source_ref: 'a', client: 'X' });
  const [b] = db.upsertLead({ name: 'B', source: 'manual', source_ref: 'b', client: 'Y' });
  db.addSignal({ lead_id: a, type: 'site_down', level: 'hot', title: 't', detail: '', key: 'k-a' } as any);
  const sid = (db.raw().prepare('SELECT id FROM signals WHERE key = ?').get('k-a') as any).id;
  assert.throws(() => check('signals:update', [sid, { lead_id: b }]), /cannot be changed/);
  assert.throws(() => check('signals:update', [sid, { 'seen = 1, lead_id': b }]), /cannot be changed/);
  db.updateSignal(sid, { 'lead_id = 2, seen': 1 } as any); // direct call is also safe
  assert.equal((db.raw().prepare('SELECT lead_id FROM signals WHERE id = ?').get(sid) as any).lead_id, a);
  const [id, patch] = check('signals:update', [sid, { dismissed: true }]); db.updateSignal(id, patch);
  assert.equal((db.raw().prepare('SELECT dismissed FROM signals WHERE id = ?').get(sid) as any).dismissed, 1);
  // Workspace guard: a signal of client X cannot be changed from client Y.
  assert.throws(() => scope.guardArgs('signals:update', [sid, {}], 'Y'), /another client/);
  assert.throws(() => scope.guardArgs('messages:cancel', [a], 'Y'), /another client/);
});

test('messages: sent ones cannot be edited; only subject, body and send time', () => {
  const [l] = db.upsertLead({ name: 'M', source: 'manual', source_ref: 'm', email: 'm@m.co' });
  const ins = db.raw().prepare("INSERT INTO messages (lead_id, step, subject, body, status, created_at) VALUES (?, 0, 's', 'b', ?, ?)");
  const draft = Number(ins.run(l, 'draft', db.now()).lastInsertRowid), sent = Number(ins.run(l, 'sent', db.now()).lastInsertRowid);
  assert.throws(() => check('messages:update', [sent, { body: 'x' }]), /sent message/);
  assert.throws(() => check('messages:update', [draft, { status: 'sent' }]), /cannot be changed/);
  assert.throws(() => check('messages:update', [draft, { due_at: 'soon' }]), /not valid/);
  assert.deepEqual(check('messages:update', [draft, { subject: 'Hi' }]), [draft, { subject: 'Hi' }]);
});

test('tasks cannot tie a deal to another lead; merges stay inside one client', () => {
  const [l1] = db.upsertLead({ name: 'T1', source: 'manual', source_ref: 't1', client: 'X' });
  const [l2] = db.upsertLead({ name: 'T2', source: 'manual', source_ref: 't2', client: 'Y' });
  const deal = crm.saveDeal({ title: 'D', lead_id: l1 });
  assert.throws(() => check('tasks:save', [{ title: 'x', deal_id: deal, lead_id: l2 }]), /different lead/);
  assert.throws(() => check('tasks:save', [{ title: 'x', deal_id: 999999 }]), /no longer exists/);
  assert.throws(() => crm.mergeLeads(l1, [l2]), /different client/);
});

test('franchise branches with a shared central phone stay separate leads', () => {
  const base = { name: 'Pizza Hut', phone: '+92 21 111 241 241', domain: 'pizzahut.com.pk', source: 'osm' as const, client: '' };
  const [x] = db.upsertLead({ ...base, source_ref: 'p1', city: 'Karachi', address: 'Clifton Block 5' });
  const [y, created] = db.upsertLead({ ...base, source_ref: 'p2', city: 'Karachi', address: 'Gulshan Block 13' });
  assert.ok(created); assert.notEqual(x, y);
  const [z, created2] = db.upsertLead({ ...base, source_ref: 'p3', city: 'Karachi', address: 'Clifton Block 5' });
  assert.equal(created2, false); assert.equal(z, x);
  assert.ok(!crm.duplicateGroups().some((g) => g.leads.some((l: any) => l.id === x) && g.leads.some((l: any) => l.id === y)));
});

test('career: followed employers classified, whole-word CV match, unread excludes dismissed and repeats', () => {
  db.raw().prepare("INSERT OR IGNORE INTO employers (ats, slug, name, added_at) VALUES ('greenhouse', 'stripe', 'Stripe', ?)").run(db.now());
  const a1 = Number(jobstore.saveAlert({ name: 'A', query: { keywords: 'java' } }).lastInsertRowid);
  const a2 = Number(jobstore.saveAlert({ name: 'B', query: { keywords: 'dev' } }).lastInsertRowid);
  const ins = db.raw().prepare('INSERT INTO job_alert_hits (alert_id, job_id, at, data, seen) VALUES (?, ?, ?, ?, 0)');
  const j = (id: string, title: string, source: string) => JSON.stringify({ id, title, company: 'C', location: '', source, tags: [], snippet: '' });
  ins.run(a1, 'greenhouse:stripe:1', db.now(), j('greenhouse:stripe:1', 'Java Engineer', 'Stripe (greenhouse)'));
  ins.run(a2, 'greenhouse:stripe:1', db.now(), j('greenhouse:stripe:1', 'Java Engineer', 'Stripe (greenhouse)'));
  ins.run(a1, 'li:2', db.now(), j('li:2', 'JavaScript Developer', 'LinkedIn'));
  const s = career.signals();
  assert.equal(s.find((x) => x.id === 'greenhouse:stripe:1')!.type, 'employer');
  assert.equal(career.unseenCount(), 2); // the repeat counts once
  career.dismiss('li:2'); assert.equal(career.unseenCount(), 1);
  const cv: any = { profile: { skills: ['Java'], roles: ['Java Developer'], level: '', title: '' } };
  const m = keywordMatch(cv, [{ id: 'a', title: 'JavaScript Developer', tags: [], snippet: '' } as any, { id: 'b', title: 'Senior Java Developer', snippet: 'Java, Spring' } as any]);
  assert.equal(m.a.match, 0); assert.ok(m.b.match >= 45);
});

test('Workday: busy answers are retried, HTML pages explained, partial results kept', async () => {
  let n = 0;
  globalThis.fetch = (async () => { n++; if (n === 1) return new Response('busy', { status: 503 }); if (n === 2) return json({ total: 40, jobPostings: Array.from({ length: 20 }, (_, i) => ({ title: `Job ${i}`, externalPath: `/job/${i}` })) }); return new Response('<html>Maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } }); }) as typeof fetch;
  const e = { ats: 'workday', slug: 'acme', name: 'Acme', host: 'acme.wd1.myworkdayjobs.com', site: 'Ext' } as any;
  const jobs = await workdayJobs(e, async () => undefined);
  assert.equal(jobs.length, 20); // first page kept although the second answered with a web page
  globalThis.fetch = (async () => new Response('<html>bot check</html>', { status: 200 })) as typeof fetch;
  await assert.rejects(workdayJobs(e, async () => undefined), /web page instead of job data/);
});

test('Stop cancels requests still in flight', async () => {
  let aborted = false;
  globalThis.fetch = ((_u: any, init: any) => new Promise((_, rej) => { init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }); })) as typeof fetch;
  const ctrl = new AbortController();
  const p = fetchScope.run(ctrl.signal, () => fetchText('https://example.com/slow', { timeout: 60000, allowLocal: true }));
  setTimeout(() => ctrl.abort(), 20);
  await assert.rejects(p, /Stopped/);
  assert.ok(aborted);
});
