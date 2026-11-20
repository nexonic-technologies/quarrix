// Integration (0.22): client workspace isolation, the final sending guard, WhatsApp identity, OAuth apps per provider,
// job alert retries and baselines, automations per client. Real SQLite, real settings file and a real SMTP server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { SMTPServer } from 'smtp-server';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as mail from '../../src/main/mail';
import * as mb from '../../src/main/mailboxes';
import * as scope from '../../src/main/scope';
import * as jobstore from '../../src/main/jobstore';
import * as automation from '../../src/main/automation';
import { exportable } from '../../src/main/exporters';
import { exportLeads } from '../../src/main/importexport';
import { clientFor, endpointsFor } from '../../src/main/oauth';
import { load, resetCache, save, saveFromUi, splitLegacyClient } from '../../src/main/settings';
import { loadSources, sourcesDir } from '../../src/main/sources/sdk';
import { privateResponse } from '../../src/main/guard';

const dir = process.env.QUARRIX_TEST_DIR!;
const got: string[] = [];
let server: SMTPServer;
let a1 = 0, a2 = 0, b1 = 0;

before(async () => {
  db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate(); automation.migrate(); jobstore.migrate();
  server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onAuth: (_a, _s, cb) => cb(null, { user: 'x' }), onData(stream, session, cb) { stream.resume(); stream.on('end', () => { got.push(...session.envelope.rcptTo.map((r) => r.address)); cb(); }); } });
  const port = await new Promise<number>((res) => server.listen(0, '127.0.0.1', () => res((server.server.address() as any).port)));
  save({ clients: ['Acme', 'Bolt'], email: { ...load().email, auth: 'password', smtpHost: '127.0.0.1', smtpPort: port, smtpSecure: false, smtpUser: 'me@sender.test', smtpPass: 'x', fromEmail: 'me@sender.test', dailyLimit: 2, warmStart: 2, authorizedAt: '', authorizedFrom: '', pausedReason: '' }, mailboxes: [] });
  [a1] = db.upsertLead({ name: 'Acme One', email: 'one@acme.test', domain: 'acme.test', source: 'import', client: 'Acme' });
  [a2] = db.upsertLead({ name: 'Acme Two', email: 'two@acme2.test', domain: 'acme2.test', source: 'import', client: 'Acme' });
  [b1] = db.upsertLead({ name: 'Bolt One', email: 'one@bolt.test', domain: 'bolt.test', source: 'import', client: 'Bolt' });
});
after(() => server.close());

test('client workspace isolation: records, lists, queries, exports, CRM and watches', async () => {
  save({ currentClient: 'Acme' });
  assert.throws(() => scope.guardArgs('leads:get', [b1]), /another client workspace/);
  assert.doesNotThrow(() => scope.guardArgs('leads:get', [a1]));
  assert.deepEqual(scope.guardArgs('leads:delete', [[a1, b1, a2]])[0], [a1, a2], 'bulk actions drop the other client\'s leads');
  assert.deepEqual(scope.guardArgs('sync:hubspot', [[b1]])[0], []);
  assert.equal(db.queryLeads(scope.scopedQuery({ client: '*', limit: 50 })).total, 2, 'the renderer cannot ask for every workspace');
  // CRM: deals and tasks
  const dA = crm.saveDeal({ lead_id: a1, title: 'A deal', value: 100 }) as any;
  save({ currentClient: 'Bolt' });
  crm.saveDeal({ lead_id: b1, title: 'B deal', value: 50 });
  assert.deepEqual((crm.listDeals() as any[]).map((d) => d.title), ['B deal']);
  assert.equal(crm.forecast().pipeline, 50);
  assert.throws(() => scope.guardArgs('deals:delete', [typeof dA === 'number' ? dA : dA?.id ?? 1]), /another client/);
  assert.throws(() => scope.guardArgs('deals:save', [{ title: 'no lead' }]), /another client/, 'a deal without a lead cannot be made inside a client');
  assert.throws(() => scope.guardArgs('tasks:save', [{ lead_id: a1, title: 'x' }]), /another client/);
  // messages and the attention list
  db.addMessage({ lead_id: a1, step: 0, subject: 's', body: 'b', status: 'draft' } as any);
  db.addMessage({ lead_id: b1, step: 0, subject: 's', body: 'b', status: 'draft' } as any);
  assert.deepEqual((scope.guardResult('messages:list', db.listMessages('draft')) as any[]).map((m) => m.lead_id), [b1]);
  const msgA = (db.raw().prepare('SELECT id FROM messages WHERE lead_id = ?').get(a1) as any).id;
  assert.throws(() => scope.guardArgs('messages:update', [msgA, { body: 'x' }]), /another client/);
  // exports and integrations
  assert.deepEqual(exportable([a1, b1]).map((l) => l.id), [b1]);
  const file = join(dir, 'x.csv');
  const n = await exportLeads([db.getLead(a1)!, db.getLead(b1)!], file);
  assert.equal(n, 1, 'file exports keep to the workspace even if handed other rows');
  // watches belong to their workspace
  const w = db.saveWatch(scope.ownRecord('watches', { category: 'cafe', place: 'Lahore', sources: '["osm"]', every_days: 7, client: 'Acme' }));
  assert.equal((db.raw().prepare('SELECT client FROM watches WHERE id = ?').get(w) as any).client, 'Bolt', 'the caller cannot choose another workspace');
  save({ currentClient: 'Acme' });
  assert.equal((scope.byClient(db.listWatches()) as any[]).length, 0);
  assert.throws(() => scope.ownRecord('watches', { id: w }), /another client/);
  // agency overview: no workspace selected sees everything
  save({ currentClient: '' });
  assert.equal(db.queryLeads(scope.scopedQuery({ limit: 50 })).total, 3);
  assert.equal((crm.listDeals() as any[]).length, 2);
});

test('the final sending guard: approval, identity, do-not-contact, limits; tests are capped separately', async () => {
  await assert.rejects(mail.sendRaw('one@acme.test', 'Hi', 'Body'), /not approved/);
  await mail.sendRaw('me+test@sender.test', 'Test', 'Body', '', [], 'main', 'test');
  assert.deepEqual(got, ['me+test@sender.test'], 'a connection test needs no approval');
  save({ email: { ...load().email, authorizedAt: db.now(), authorizedFrom: 'me@sender.test' } });
  db.suppress('one@acme.test', 'test');
  await assert.rejects(mail.sendRaw('ONE@acme.test', 'Hi', 'Body'), /do-not-contact/, 'suppression is checked at the last step, case-insensitively');
  await assert.rejects(mail.sendRaw('two@acme2.test, x@evil.test', 'Hi', 'Body'), /not valid/, 'one recipient only');
  await mail.sendRaw('two@acme2.test', 'Hi\r\nBcc: x@evil.test', 'Body');
  assert.ok(got.includes('two@acme2.test') && !got.includes('x@evil.test'), 'header injection through the subject is neutralised');
  db.raw().prepare("INSERT INTO messages (lead_id, step, subject, body, status, channel, created_at, sent_at, mailbox) VALUES (?, 0, 's', 'b', 'sent', 'email', ?, ?, 'main'), (?, 1, 's', 'b', 'sent', 'email', ?, ?, 'main')").run(a2, db.now(), db.now(), a2, db.now(), db.now());
  await assert.rejects(mail.sendRaw('one@bolt.test', 'Hi', 'Body'), /today's limit/);
  save({ email: { ...load().email, fromEmail: 'other@sender.test' } });
  assert.equal(mb.ready(mb.boxById('main')), false, 'a changed sender address needs a new approval');
  save({ email: { ...load().email, fromEmail: 'me@sender.test' } });
  db.logEvent(null, 'placement', 'main');
  assert.equal(mb.sentToday('main'), 3, 'placement tests count towards the daily limit');
});

test('WhatsApp approval is tied to one business number and cannot be set from the interface', () => {
  save({ whatsapp: { ...load().whatsapp, cloudToken: 't', phoneNumberId: '111', authorizedAt: db.now(), authorizedFor: '111' } });
  saveFromUi({ whatsapp: { ...load().whatsapp, phoneNumberId: '222', authorizedAt: 'x', authorizedFor: '222' } });
  const w = load().whatsapp;
  assert.equal(w.authorizedFor, '111', 'the interface cannot re-approve a new number');
  assert.notEqual(w.authorizedFor, w.phoneNumberId, 'so sending to the new number is refused until approved again');
});

test('OAuth: separate Google and Microsoft apps, tenant, and migration of the old shared client', () => {
  assert.deepEqual(splitLegacyClient('123-abc.apps.googleusercontent.com', 's3', 'password'), { googleClientId: '123-abc.apps.googleusercontent.com', googleClientSecret: 's3', msClientId: '' });
  assert.deepEqual(splitLegacyClient('0b1c2d3e-1111-2222-3333-444455556666', '', 'password'), { googleClientId: '', googleClientSecret: '', msClientId: '0b1c2d3e-1111-2222-3333-444455556666' });
  const e = { googleClientId: 'g.apps.googleusercontent.com', googleClientSecret: 'gs', msClientId: 'm-id', msTenant: 'contoso.onmicrosoft.com' };
  assert.deepEqual(clientFor('google', e), { id: 'g.apps.googleusercontent.com', secret: 'gs', tenant: '' });
  assert.deepEqual(clientFor('microsoft', e), { id: 'm-id', secret: '', tenant: 'contoso.onmicrosoft.com' }, 'the Google secret is never sent to Microsoft');
  assert.equal(clientFor('microsoft', { ...e, msTenant: 'bad/../tenant' }).tenant, 'common');
  assert.equal(endpointsFor('microsoft', 'contoso.onmicrosoft.com').token, 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token');
  // a settings file from 0.21 with one shared client is migrated on load
  const f = join(dir, 'settings.json');
  const old = JSON.parse(readFileSync(f, 'utf8'));
  old.email.oauthClientId = '0b1c2d3e-1111-2222-3333-444455556666'; old.email.msClientId = ''; old.email.googleClientId = '';
  writeFileSync(f, JSON.stringify(old));
  resetCache();
  assert.equal(load().email.msClientId, '0b1c2d3e-1111-2222-3333-444455556666');
  assert.equal(load().email.oauthClientId, '');
  resetCache();
  assert.equal(load().email.msClientId, '0b1c2d3e-1111-2222-3333-444455556666', 'the migration was saved');
});

test('job alerts: failures retry with backoff, boards are baselined, the schedule does not drift', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const a = { every_hours: 12, fails: 0, base_sources: '[]', next_run: '2026-11-20T09:55:00.000Z' };
  const failed = jobstore.alertOutcome(a, { jobs: [], errors: ['linkedin: HTTP 429', 'remoteok: timeout'] }, now);
  assert.equal(failed.failed, true);
  assert.equal(failed.nextRun, '2026-11-20T10:15:00.000Z', 'first retry after 15 minutes');
  assert.equal(jobstore.alertOutcome({ ...a, fails: 3 }, { jobs: [], errors: ['x'] }, now).nextRun, '2026-11-20T12:00:00.000Z', 'then 30, 60, 120 minutes');
  assert.equal(jobstore.alertOutcome({ ...a, fails: 9 }, { jobs: [], errors: ['x'] }, now).nextRun, '2026-11-20T22:00:00.000Z', 'never later than the normal schedule');
  const first = jobstore.alertOutcome(a, { jobs: [{ id: 'g1', source: 'greenhouse' }], errors: ['linkedin: HTTP 429'] }, now);
  assert.deepEqual([first.fresh, first.baseline], [[], ['g1']], 'first answer from a board is its baseline');
  assert.equal(first.nextRun, '2026-11-20T21:55:00.000Z', 'planned from when it was due');
  assert.match(first.error, /Some boards failed/);
  const second = jobstore.alertOutcome({ ...a, base_sources: JSON.stringify(first.baseSources) }, { jobs: [{ id: 'g2', source: 'greenhouse' }, { id: 'l1', source: 'linkedin' }], errors: [] }, now);
  assert.deepEqual([second.fresh, second.baseline], [['g2'], ['l1']], 'a board that was down earlier does not flood the alert');
  assert.equal(jobstore.alertDue({ next_run: '2026-11-20T09:59:00Z', last_run: null, every_hours: 12 }, now), true);
  assert.equal(jobstore.alertDue({ next_run: null, last_run: '2026-11-20T09:00:00Z', every_hours: 12 }, now), false);
});

test('job alerts: a run where every board fails records nothing and schedules a retry', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  try {
    jobstore.saveAlert({ name: 'React Lahore', query: { keywords: 'react developer', country: 'PK' } });
    const id = (db.raw().prepare('SELECT MAX(id) id FROM job_alerts').get() as any).id;
    const hits = await jobstore.runAlerts(true);
    assert.deepEqual(hits, []);
    const row = db.raw().prepare('SELECT * FROM job_alerts WHERE id = ?').get(id) as any;
    assert.equal(row.fails, 1);
    assert.ok(row.last_error, 'the reason is kept for the interface');
    assert.equal(row.base_sources, '[]', 'no baseline from a failed run');
    assert.equal((db.raw().prepare('SELECT COUNT(*) n FROM job_alert_hits WHERE alert_id = ?').get(id) as any).n, 0);
    assert.ok(Date.parse(row.next_run) - Date.now() <= 15 * 60_000 + 5000);
  } finally { globalThis.fetch = orig; }
});

test('automations and webhooks limited to a client only run for that client', async () => {
  assert.equal(automation.appliesTo('', { client: 'Bolt' }), true);
  assert.equal(automation.appliesTo('Acme', { client: 'Bolt' }), false);
  assert.equal(automation.appliesTo('Acme', null), false);
  save({ automations: [{ id: 'r1', name: 'Tag Acme', on: true, trigger: 'lead_created', client: 'Acme', conditions: [], actions: [{ type: 'tag', value: 'acme-rule' }] }] });
  await automation.handle(b1, 'lead_created', 'x');
  await automation.handle(a2, 'lead_created', 'x');
  assert.doesNotMatch(db.getLead(b1)!.tags, /acme-rule/);
  assert.match(db.getLead(a2)!.tags, /acme-rule/);
});

test('Source SDK terms block contact and export for leads from that source', () => {
  writeFileSync(join(sourcesDir(dir), 'shops.json'), JSON.stringify({ id: 'shops', name: 'Shops', license: 'Custom', attribution: 'Shops Inc', url: 'https://shops.test/api', items: 'rows', fields: { name: 'n' }, terms: { export: false, contact: false } }));
  loadSources(dir);
  const [id] = db.upsertLead({ name: 'Shop', email: 'hi@shop.test', domain: 'shop.test', source: 'sdk:shops', client: '' });
  save({ currentClient: '' });
  assert.match(db.blockOf(db.getLead(id)!), /terms of the source/);
  assert.deepEqual(exportable([id]), []);
});

test('browser guard: responses from private addresses are stopped', () => {
  assert.equal(privateResponse('10.0.0.5', 'https://rebind.test/'), true);
  assert.equal(privateResponse('::ffff:192.168.1.1', 'https://rebind.test/'), true);
  assert.equal(privateResponse('93.184.216.34', 'https://example.com/'), false);
  assert.equal(privateResponse('127.0.0.1', 'http://localhost:5173/x', 'http://localhost:5173'), false, 'only the dev server is allowed locally');
});
