// Integration (0.23): verifies "Built" backlog items end to end inside Electron's Node with real SQLite and the app's own
// code. Outside services are replaced by recorded HTTP answers at the network boundary (globalThis.fetch); nothing else
// is mocked. Items that also need the owner's real account stay Blocked for the live part (docs/BACKLOG.md).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { promises as dnsp } from 'node:dns';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as jobs from '../../src/main/jobs';
import * as jobstore from '../../src/main/jobstore';
import * as budget from '../../src/main/budget';
import * as verify from '../../src/main/verify';
import * as integrations from '../../src/main/integrations';
import * as mb from '../../src/main/mailboxes';
import * as scope from '../../src/main/scope';
import { approveAll, createDrafts } from '../../src/main/outreach';
import { schemaDetails } from '../../src/main/intel';
import { load, save } from '../../src/main/settings';

const dir = process.env.QUARRIX_TEST_DIR!;
type Seen = { url: string; method: string; headers: Record<string, string>; body: string };
const seen: Seen[] = [];
function serve(routes: [RegExp, (s: Seen) => Response][]) {
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const s = { url: String(url), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) }, body: String(init.body ?? '') };
    seen.push(s);
    for (const [re, fn] of routes) if (re.test(s.url)) return fn(s);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

before(() => {
  db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate(); jobstore.migrate();
  (dnsp as any).resolveMx = async () => [{ exchange: 'mx.test', priority: 10 }]; // mail servers exist for every test domain
  save({ currentClient: '' });
});

test('QF-002 batch search builder: one search per business type and place, filed in the workspace', () => {
  save({ currentClient: 'Acme' });
  const ids = jobs.queueBatch(['Dentists', 'Plumbers'], ['Lahore', 'Karachi'], ['osm']) as number[];
  for (const id of ids) jobs.pauseSearch(id);
  const rows = db.raw().prepare(`SELECT category, place, client FROM searches WHERE id IN (${ids.join(',')})`).all() as any[];
  assert.equal(rows.length, 4);
  assert.deepEqual(new Set(rows.map((r) => `${r.category}@${r.place}`)), new Set(['Dentists@Lahore', 'Dentists@Karachi', 'Plumbers@Lahore', 'Plumbers@Karachi']));
  assert.ok(rows.every((r) => r.client === 'Acme'));
  save({ currentClient: '' });
});

test('QF-012 per-provider request budgets stop a source at its daily limit', () => {
  save({ allowKeyedServices: true, budgets: { tomtom: 2 } });
  budget.spend('tomtom'); budget.spend('tomtom');
  assert.throws(() => budget.spend('tomtom'), budget.BudgetError);
  assert.equal(budget.remaining('tomtom'), 0);
  save({allowKeyedServices:false});
});

test('QF-029 QF-031 QF-032 QF-040 enrichment: emails with the page they came from, waterfall trail, conflicts kept', async () => {
  save({ waterfall: { order: ['website', 'hunter'], stopOnFirst: true }, verify: { ...load().verify, provider: 'none', hunterKey: '' } });
  const page = `<html><head><title>Smile Dental</title></head><body><a href="/contact">Contact</a><p>Call <a href="tel:+442079460999">+44 20 7946 0999</a></p></body></html>`;
  const contact = `<html><body><h1>Contact</h1><p>Email us at hello@smile-dental.test or call +44 20 7946 0999</p><p>Dr Sarah Khan, Owner</p></body></html>`;
  serve([[/smile-dental\.test\/contact/, () => new Response(contact, { headers: { 'content-type': 'text/html' } })], [/smile-dental\.test\/?$/, () => new Response(page, { headers: { 'content-type': 'text/html' } })]]);
  const [id] = db.upsertLead({ name: 'Smile Dental', website: 'https://smile-dental.test/', domain: 'smile-dental.test', phone: '+44 20 7946 0000', city: 'London', country: 'GB', source: 'osm', source_ref: 'node/77', client: '' });
  await jobs.enrichOne(db.getLead(id)!);
  const l = db.getLead(id)!;
  const prov = JSON.parse(l.provenance || '{}');
  assert.equal(l.email, 'hello@smile-dental.test');
  const src = JSON.stringify(prov.emails ?? {});
  assert.match(src, /smile-dental\.test\/contact/, 'the page each email was found on is kept (QF-040)');
  assert.ok(prov.waterfall, 'the enrichment waterfall trail is recorded (QF-031)');
  assert.match(JSON.stringify(prov.conflicts ?? {}), /phone/, 'a different phone on the website is recorded as a conflict (QF-032)');
  assert.equal(l.phone, '+44 20 7946 0000', 'the listing phone is not overwritten');
});

test('QF-026 business imagery comes from the business\'s own site metadata', () => {
  const d: any = schemaDetails([{ '@type': 'Dentist', logo: 'https://smile.test/logo.png', image: 'https://smile.test/front.jpg' }], '<meta property="og:image" content="https://smile.test/og.jpg">');
  assert.match(JSON.stringify(d), /smile\.test\/(logo|front|og)/);
});

test('QF-030 field freshness: leads not checked recently are found by the stale filter', () => {
  const [a] = db.upsertLead({ name: 'Old Check', source: 'import', client: '' });
  db.updateLead(a, { enriched_at: new Date(Date.now() - 200 * 864e5).toISOString() });
  const ids = db.queryLeads({ stale: 90, limit: 500 }).rows.map((r) => r.id);
  assert.ok(ids.includes(a));
});

test('QF-042 QF-043 QF-045 provider-backed email checks: verifier answer, 30-day cache, status on the lead', async () => {
  save({ allowKeyedServices:true, verify: { ...load().verify, provider: 'zerobounce', zerobounceKey: 'zb-test', maxPerDay: 50 } });
  let calls = 0;
  serve([[/api\.zerobounce\.net/, (s) => { calls++; return json({ address: new URL(s.url).searchParams.get('email'), status: 'valid', sub_status: '' }); }]]);
  const [id] = db.upsertLead({ name: 'Check Me', email: 'owner@checkme.test', domain: 'checkme.test', source: 'import', client: '' });
  const r = await verify.verifyLeads([id]);
  assert.equal(r.checked, 1);
  assert.equal(db.getLead(id)!.email_status, 'verified');
  assert.ok(db.getLead(id)!.email_checked_at, 'when it was checked is kept (QF-045)');
  await verify.checkEmail('owner@checkme.test');
  assert.equal(calls, 1, 'a fresh result is reused from the 30-day cache instead of paying again');
});

test('QF-039 bulk domain contact lookup returns emails with their source pages', async () => {
  save({ verify: { ...load().verify, hunterKey: 'hk-test' } });
  serve([[/api\.hunter\.io\/v2\/domain-search/, () => json({ data: { emails: [{ value: 'Jane@Acme.test', first_name: 'Jane', last_name: 'Doe', position: 'Owner', confidence: 94, sources: [{ uri: 'https://acme.test/team' }], type: 'personal' }] } })]]);
  const found = await verify.hunterDomain('acme.test');
  assert.deepEqual(found[0], { email: 'jane@acme.test', name: 'Jane Doe', role: 'Owner', confidence: 94, source_url: 'https://acme.test/team', type: 'personal' });
});

test('QF-054 calendar view: tasks for one week, in due order', () => {
  const [l] = db.upsertLead({ name: 'Week Lead', source: 'import', client: '' });
  const mon = new Date(); mon.setUTCHours(0, 0, 0, 0);
  crm.saveTask({ lead_id: l, title: 'Call back', due_at: new Date(+mon + 2 * 864e5).toISOString() });
  crm.saveTask({ lead_id: l, title: 'Send quote', due_at: new Date(+mon + 1 * 864e5).toISOString() });
  crm.saveTask({ lead_id: l, title: 'Next month', due_at: new Date(+mon + 40 * 864e5).toISOString() });
  const week = (crm.listTasks({ from: mon.toISOString(), to: new Date(+mon + 7 * 864e5).toISOString() }) as any[]).map((t) => t.title);
  assert.deepEqual(week.filter((t) => ['Call back', 'Send quote', 'Next month'].includes(t)), ['Send quote', 'Call back']);
});

test('QF-062 QF-072 unified replies and per-mailbox metrics', () => {
  const [l] = db.upsertLead({ name: 'Reply Lead', email: 'r@reply.test', source: 'import', client: '' });
  for (const [box, subj] of [['main', 'Re: hello'], ['b2', 'Re: idea']]) db.raw().prepare("INSERT INTO replies (lead_id, at, from_addr, subject, intent, handled, mailbox) VALUES (?, ?, 'r@reply.test', ?, 'interested', 0, ?)").run(l, db.now(), subj, box);
  const rows = (db.listReplies(true) as any[]).filter((r) => r.lead_id === l);
  assert.deepEqual(rows.map((r) => r.mailbox).sort(), ['b2', 'main'], 'replies from every mailbox in one list (QF-062)');
  const m: any = db.outreachMetrics();
  assert.ok(m && typeof m === 'object' && 'variants' in m, 'campaign and A/B metrics are computed (QF-072)');
  assert.ok(Array.isArray(mb.stats()), 'per-mailbox numbers are listed');
});

test('QF-085 QF-086 QF-087 CRM sync adapters send the right requests (recorded API answers)', async () => {
  const [l] = db.upsertLead({ name: 'Sync Co', email: 'hi@sync.test', domain: 'sync.test', website: 'https://sync.test', city: 'Austin', country: 'US', source: 'osm', source_ref: 'n/9', client: '' });
  save({ hubspot: { token: 'hs-test' }, notion: { token: 'nt-test', databaseId: '0123456789abcdef0123456789abcdef' }, sheets: { spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', refresh: 'rt', user: 'me' }, email: { ...load().email, googleClientId: 'g.apps.googleusercontent.com', googleClientSecret: 'gs' } });
  seen.length = 0;
  serve([
    [/hubapi\.com\/crm\/v3\/objects\/companies\/search/, () => json({ results: [] })],
    [/hubapi\.com\/crm\/v3\/objects\/companies$/, () => json({ id: 'c1' }, 201)],
    [/hubapi\.com\/crm\/v3\/objects\/contacts\/search/, () => json({ results: [] })],
    [/hubapi\.com\/crm\/v3\/objects\/contacts$/, () => json({ id: 'p1' }, 201)],
    [/hubapi\.com/, () => json({}, 200)],
    [/api\.notion\.com\/v1\/databases\//, () => json({ properties: { Name: { type: 'title' }, Email: { type: 'email' }, Website: { type: 'url' }, City: { type: 'rich_text' } } })],
    [/api\.notion\.com\/v1\/pages/, () => json({ id: 'pg1' })],
    [/oauth2\.googleapis\.com\/token/, () => json({ access_token: 'at', expires_in: 3600 })],
    [/sheets\.googleapis\.com/, () => json({ updates: { updatedRows: 1 } })],
  ]);
  const hs = await integrations.toHubspot([l]);
  assert.equal(hs.errors.length, 0, hs.errors.join('; '));
  const hsCreate = seen.find((s) => /objects\/companies$/.test(s.url) && s.method === 'POST')!;
  assert.equal(hsCreate.headers.Authorization, 'Bearer hs-test');
  assert.equal(JSON.parse(hsCreate.body).properties.domain, 'sync.test');
  const nt = await integrations.toNotion([l]);
  assert.equal(nt.errors.length, 0, nt.errors.join('; '));
  const page = JSON.parse(seen.find((s) => /api\.notion\.com\/v1\/pages/.test(s.url))!.body);
  assert.equal(page.properties.Email.email, 'hi@sync.test');
  const sh = await integrations.toSheets([l]);
  assert.equal(sh.errors.length, 0, sh.errors.join('; '));
  assert.ok(seen.some((s) => /sheets\.googleapis\.com\/v4\/spreadsheets\/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\/values/.test(s.url)));
});

test('QF-075 SendGrid mailbox sends through the v3 API as the approved sender', async () => {
  save({ mailboxes: [{ id: 'sg', label: 'SendGrid', kind: 'sendgrid', on: true, fromName: 'Me', fromEmail: 'me@sender.test', sendgridKey: 'SG.test', smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', imapOn: false, imapHost: '', imapPort: 993, imapUser: '', imapPass: '', oauthRefresh: '', dailyLimit: 10, authorizedAt: '', authorizedFrom: '' }] as any });
  serve([[/api\.sendgrid\.com\/v3\/mail\/send/, () => new Response(null, { status: 202 })]]);
  seen.length = 0;
  await mb.deliver(mb.boxById('sg')!, { from: { name: 'Me', address: 'me@sender.test' }, to: 'x@to.test', subject: 'Hi', text: 'Body', messageId: '<a@b>', attachments: [], headers: {} } as any);
  const sent = JSON.parse(seen[0].body);
  assert.equal(seen[0].headers.Authorization, 'Bearer SG.test');
  assert.equal(sent.from.email, 'me@sender.test');
  assert.equal(sent.personalizations[0].to[0].email, 'x@to.test');
});

test('QF-113 job result exports: CSV, JSON and Markdown files', () => {
  db.saveJob?.({ id: 'j1', title: 'React Developer', company: 'Acme', location: 'Lahore', url: 'https://jobs.test/1', source: 'Test', salary: '', posted: '', tags: [], snippet: '', workplace: '', type: '', level: '' } as any);
  const out = mkdtempSync(join(tmpdir(), 'qx-exp-'));
  for (const ext of ['csv', 'json', 'md']) {
    const p = join(out, `jobs.${ext}`);
    jobstore.exportSaved(p);
    assert.ok(existsSync(p));
    if (db.savedJobs().length) assert.match(readFileSync(p, 'utf8'), /React Developer/);
  }
});

test('QF-090 browser extension: MV3, capture-only token, posts only to the local API', () => {
  const m = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  const code = ['popup.js', 'options.js'].filter((f) => existsSync(`extension/${f}`)).map((f) => readFileSync(`extension/${f}`, 'utf8')).join('\n');
  assert.match(code, /127\.0\.0\.1|localhost/);
  assert.match(code, /\/v1\/capture/);
  assert.doesNotMatch(code, /\/v1\/leads|\/v1\/searches|\/v1\/deals/, 'the extension can only capture pages');
});

test('workspace isolation 0.23: Approve All, manual leads, dashboards and counts stay in the workspace', async () => {
  save({ clients: ['Acme', 'Bolt'], currentClient: 'Bolt' });
  const manual = db.upsertLead({ name: 'Manual Bolt', email: 'm@bolt-manual.test', source: 'manual', client: scope.current() })[0];
  assert.equal(db.getLead(manual)!.client, 'Bolt');
  const [acme] = db.upsertLead({ name: 'Acme Draft', email: 'a@acme-draft.test', domain: 'acme-draft.test', source: 'import', client: 'Acme' });
  await createDrafts([acme, manual]);
  save({ email: { ...load().email, smtpUser: 'me@sender.test', smtpPass: 'x', smtpHost: '127.0.0.1', fromEmail: 'me@sender.test', authorizedAt: db.now(), authorizedFrom: 'me@sender.test', pausedReason: '' }, mailboxes: [] });
  approveAll('Bolt');
  const status = (id: number) => (db.raw().prepare("SELECT status FROM messages WHERE lead_id = ? AND step = 0 AND channel = 'email'").get(id) as any)?.status;
  assert.equal(status(acme), 'draft', 'Approve All inside Bolt never schedules Acme\'s emails');
  assert.equal(status(manual), 'scheduled');
  const all = scope.withScope(() => db.stats(), '') as any;
  const bolt = scope.withScope(() => db.stats(), 'Bolt') as any;
  assert.ok(bolt.total < all.total && bolt.total >= 1, 'statistics count only the workspace');
  const dash = scope.withScope(() => db.dashboard(30), 'Bolt') as any;
  assert.ok(dash, 'the dashboard reads through the workspace views');
  assert.equal((db.raw().prepare("SELECT COUNT(*) n FROM temp.sqlite_master WHERE type = 'view'").get() as any).n, 0, 'views are removed after each read');
  assert.equal(scope.sqlText("O'Brien"), "'O''Brien'", 'client names are quoted safely');
  save({ currentClient: '' });
});
