// Integration: the real sending pipeline (drafts → approval → mailbox choice → SMTP) against local SMTP servers.
// These are real SMTP conversations through nodemailer; only the receiving servers are local.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { SMTPServer } from 'smtp-server';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as mail from '../../src/main/mail';
import * as mb from '../../src/main/mailboxes';
import { approve, createDrafts } from '../../src/main/outreach';
import { load, save } from '../../src/main/settings';

const dir = process.env.QUARRIX_TEST_DIR!;
type Got = { from: string; to: string[]; data: string };
const inbox: Record<string, Got[]> = { a: [], b: [] };
const servers: SMTPServer[] = [];
const start = (k: string) => new Promise<number>((res) => {
  const s = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onAuth: (_a, _s, cb) => cb(null, { user: 'x' }),
    onData(stream, session, cb) { let d = ''; stream.on('data', (c) => (d += c)); stream.on('end', () => { inbox[k].push({ from: session.envelope.mailFrom ? (session.envelope.mailFrom as any).address : '', to: session.envelope.rcptTo.map((r) => r.address), data: d }); cb(); }); } });
  servers.push(s);
  s.listen(0, '127.0.0.1', () => res((s.server.address() as any).port));
});
const tick = async () => { await mail.tick(() => undefined); };
let lead1 = 0, lead2 = 0;

before(async () => {
  db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate();
  const pa = await start('a'), pb = await start('b');
  save({
    profile: { ...load().profile, name: 'Test Sender', company: 'Test Co' },
    email: { ...load().email, auth: 'password', smtpHost: '127.0.0.1', smtpPort: pa, smtpSecure: false, smtpUser: 'main@sender.test', smtpPass: 'x', fromEmail: 'main@sender.test', windowStart: 0, windowEnd: 24, weekdaysOnly: false, gapMinutes: 0, dailyLimit: 100, warmStart: 100, unsubscribeLine: true, pausedReason: '', authorizedAt: '', authorizedFrom: '' },
    mailboxes: [{ id: 'b', label: 'Second', kind: 'smtp', on: true, fromName: '', fromEmail: 'second@sender.test', smtpHost: '127.0.0.1', smtpPort: pb, smtpSecure: false, smtpUser: 'second@sender.test', smtpPass: 'x', imapOn: false, imapHost: '', imapPort: 993, imapUser: '', imapPass: '', oauthRefresh: '', sendgridKey: '', dailyLimit: 1, authorizedAt: '', authorizedFrom: '' }],
  });
  [lead1] = db.upsertLead({ name: 'Alpha Bakery', email: 'owner@alpha.test', domain: 'alpha.test', source: 'import', client: '' });
  [lead2] = db.upsertLead({ name: 'Beta Salon', email: 'hi@beta.test', domain: 'beta.test', source: 'import', client: '' });
});
after(() => { for (const s of servers) s.close(); });

test('nothing can be approved before a mailbox is approved', async () => {
  await createDrafts([lead1, lead2]);
  assert.throws(() => approve(lead1), /approve sending/i);
  assert.throws(() => mb.authorize_('b', true) && mb.authorize_('nope', true), /not found/);
});

test('approved sequence goes out by SMTP from one mailbox, in order, within limits', async () => {
  save({ email: { ...load().email, authorizedAt: db.now(), authorizedFrom: 'main@sender.test' } });
  mb.authorize_('b', true);
  approve(lead1); approve(lead2);
  const boxes = (db.raw().prepare("SELECT lead_id, mailbox FROM messages WHERE status = 'scheduled' AND step = 0").all() as any[]);
  assert.equal(new Set(boxes.map((b) => b.mailbox)).size, 2, 'leads are spread over both approved mailboxes');
  for (const l of [lead1, lead2]) assert.equal(new Set((db.raw().prepare("SELECT mailbox FROM messages WHERE lead_id = ? AND channel = 'email'").all(l) as any[]).map((x) => x.mailbox)).size, 1, 'one mailbox per sequence');
  await tick(); await tick(); await tick();
  const all = [...inbox.a, ...inbox.b];
  assert.equal(all.length, 2, 'exactly the two first emails');
  assert.deepEqual(all.flatMap((m) => m.to).sort(), ['hi@beta.test', 'owner@alpha.test']);
  for (const m of all) { assert.match(m.data, /List-Unsubscribe/i); assert.match(m.data, /unsubscribe/); }
  assert.ok(inbox.b.every((m) => m.from === 'second@sender.test') && inbox.a.every((m) => m.from === 'main@sender.test'), 'each mailbox sends as itself');
  assert.equal((db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND step > 0").get() as any).n, 0, 'follow-ups wait for their own due date');
  assert.equal(mb.sentToday('b'), 1); assert.equal(mb.capOf(mb.boxById('b')!), 1, 'the second mailbox is at its daily limit');
});

test('suppression, removed mailboxes and pause stop sending', async () => {
  const [l3] = db.upsertLead({ name: 'Gamma', email: 'x@gamma.test', domain: 'gamma.test', source: 'import', client: '' });
  await createDrafts([l3]); approve(l3);
  db.suppress('gamma.test', 'test');
  await tick();
  assert.equal((db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE lead_id = ? AND status = 'sent'").get(l3) as any).n, 0);
  assert.match((db.raw().prepare("SELECT error FROM messages WHERE lead_id = ? AND step = 0").get(l3) as any).error, /do-not-contact/);
  const [l4] = db.upsertLead({ name: 'Delta', email: 'x@delta.test', domain: 'delta.test', source: 'import', client: '' });
  await createDrafts([l4]); approve(l4);
  db.raw().prepare("UPDATE messages SET mailbox = 'gone' WHERE lead_id = ?").run(l4);
  const before = inbox.a.length + inbox.b.length;
  await tick();
  assert.equal(inbox.a.length + inbox.b.length, before, 'never falls back to another account');
  assert.match((db.raw().prepare("SELECT error FROM messages WHERE lead_id = ? AND step = 0").get(l4) as any).error, /removed or switched off/);
  save({ email: { ...load().email, fromEmail: 'changed@sender.test' } });
  assert.equal(mb.ready(mb.boxById('main')), false, 'changing the address turns approval off');
});

test('A/B test gives every second lead version B', async () => {
  save({ email: { ...load().email, abTest: true, abSubjectB: 'Idea for {name}' } });
  const ids = [1, 2, 3, 4].map((i) => db.upsertLead({ name: `AB ${i}`, email: `ab${i}@ab.test`, source: 'import', client: '' })[0]);
  await createDrafts(ids);
  const rows = db.raw().prepare(`SELECT lead_id, variant, subject FROM messages WHERE step = 0 AND channel = 'email' AND lead_id IN (${ids.join(',')})`).all() as any[];
  assert.deepEqual(new Set(rows.map((r) => r.variant)), new Set(['A', 'B']));
  for (const r of rows.filter((x) => x.variant === 'B')) assert.match(r.subject, /^Idea for AB \d$/);
});
