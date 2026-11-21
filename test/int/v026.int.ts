// Integration (0.26): safe duplicate merging and undo, protected send history, persistent test-email allowance,
// and the upgrade path for existing databases.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as mb from '../../src/main/mailboxes';
import * as automation from '../../src/main/automation';
import { check } from '../../src/main/validate';

const dir = process.env.QUARRIX_TEST_DIR!;
const today = () => new Date().toISOString().slice(0, 10);
before(() => { db.openDb(join(dir, 'v026.db')); db.migrateData(); crm.migrate(); automation.migrate(); });

const lead = (name: string, extra: Record<string, unknown> = {}) => db.upsertLead({ name, source: 'import', source_ref: `${name}-${Math.random()}`, client: '', ...extra } as any)[0];
const rows = (sql: string, ...a: unknown[]) => db.raw().prepare(sql).all(...(a as never[])) as any[];

test('merge keeps every contact, moves all lead-linked rows and undo restores them exactly', () => {
  const k = lead('Merge Keep', { phone: '+15550000001' });
  const r = lead('Merge Dupe', { email: 'dupe@merge.co' });
  db.addContact({ lead_id: k, name: 'Ann', email: 'ann@merge.co' });
  db.addContact({ lead_id: r, name: 'Ann', email: 'ann@merge.co' }); // same contact on both: cannot move (UNIQUE), must not be lost
  db.raw().prepare('UPDATE contacts SET confirmed_at = ? WHERE lead_id = ? AND name = ?').run('2026-01-01T00:00:00Z', k, 'Ann');
  db.raw().prepare('UPDATE contacts SET confirmed_at = ? WHERE lead_id = ? AND name = ?').run('2026-02-01T00:00:00Z', r, 'Ann');
  db.addContact({ lead_id: r, name: 'Bob', email: 'bob@merge.co' });
  const msg = db.addMessage({ lead_id: r, subject: 'Hello', status: 'sent' });
  db.raw().prepare('INSERT INTO automation_log (at, rule, lead_id, event) VALUES (?, ?, ?, ?)').run(db.now(), 'r1', r, 'x');
  db.logEvent(r, 'note', 'dupe history');
  const before = rows('SELECT id, lead_id, name, confirmed_at FROM contacts WHERE lead_id IN (?, ?) ORDER BY id', k, r);

  crm.mergeLeads(k, [r, r, k]);
  assert.equal(db.getLead(r), undefined);
  assert.equal(db.getLead(k)!.email, 'dupe@merge.co', 'empty field filled');
  assert.deepEqual(rows('SELECT name FROM contacts WHERE lead_id = ? ORDER BY name', k).map((c) => c.name), ['Ann', 'Bob'], 'no contact lost, no duplicate');
  assert.equal(rows('SELECT confirmed_at FROM contacts WHERE lead_id = ? AND name = ?', k, 'Ann')[0].confirmed_at, '2026-02-01T00:00:00Z');
  assert.equal(rows('SELECT 1 FROM contacts WHERE lead_id = ?', r).length, 0, 'nothing left pointing at the removed lead');
  assert.equal(rows('SELECT lead_id FROM messages WHERE id = ?', msg)[0].lead_id, k);
  assert.equal(rows('SELECT 1 FROM automation_log WHERE lead_id = ?', r).length, 0, 'tables found from the schema are moved too');

  const m = (crm.listMerges() as any[]).find((x) => x.kept_id === k && !x.undone);
  crm.undoMerge(m.id);
  assert.ok(db.getLead(r));
  assert.deepEqual(rows('SELECT id, lead_id, name, confirmed_at FROM contacts WHERE lead_id IN (?, ?) ORDER BY id', k, r), before, 'every contact back with its own lead and id');
  assert.equal(rows('SELECT lead_id FROM messages WHERE id = ?', msg)[0].lead_id, r);
  assert.equal(db.getLead(k)!.email, '', 'kept lead back as it was');
  assert.throws(() => crm.undoMerge(m.id), /Nothing to undo/);
});

test('undo refuses when a later merge involves the same leads', () => {
  const a = lead('Chain A'), b = lead('Chain B'), c = lead('Chain C');
  crm.mergeLeads(a, [b]);
  crm.mergeLeads(c, [a]);
  const first = (crm.listMerges() as any[]).find((x) => x.kept_id === a && !x.undone);
  assert.throws(() => crm.undoMerge(first.id), /later merge first/);
  const second = (crm.listMerges() as any[]).find((x) => x.kept_id === c && !x.undone);
  crm.undoMerge(second.id);
  crm.undoMerge(first.id);
  assert.ok(db.getLead(a) && db.getLead(b) && db.getLead(c));
});

test('sent messages cannot be deleted or rewritten, and deleting them never frees daily room', () => {
  const l = lead('Sender Co', { email: 'x@sender.co' });
  const box = 'limit-test-box';
  const before = mb.sentToday(box);
  const id = db.addMessage({ lead_id: l, subject: 'Hi', status: 'draft' });
  db.updateMessage(id, { status: 'sent', sent_at: db.now(), mailbox: box } as any);
  // mailbox was set in the same update as the status: the log uses the new row
  assert.equal(mb.sentToday(box), before + 1);
  assert.throws(() => db.deleteMessage(id), /cannot be deleted/);
  assert.throws(() => db.updateMessage(id, { status: 'draft' }), /cannot be changed/);
  assert.throws(() => db.updateMessage(id, { body: 'edited' }), /cannot be changed/);
  assert.throws(() => db.updateMessage(id, { sent_at: '2000-01-01T00:00:00.000Z' }), /cannot be changed/);
  assert.throws(() => db.raw().prepare('DELETE FROM send_log').run(), /cannot be deleted/);
  assert.throws(() => db.raw().prepare("UPDATE send_log SET at = '2000-01-01'").run(), /cannot be changed/);
  db.deleteLeads([l]); // the lead and its messages can still be removed (user's right to delete data)...
  assert.equal(mb.sentToday(box), before + 1, '...but the send still counts today');
  const draft = db.addMessage({ lead_id: lead('Draft Co'), subject: 'd' });
  assert.equal(db.deleteMessage(draft).changes, 1, 'drafts can still be deleted');
  assert.throws(() => check('messages:delete', ['x']), /not valid/);
});

test('placement tests and test emails are logged; the test allowance survives a restart', () => {
  const box = 'placement-box';
  const n = mb.sentToday(box);
  db.logEvent(null, 'placement', box);
  assert.equal(mb.sentToday(box), n + 1);
  const since = new Date(Date.now() - 864e5).toISOString();
  const t = db.testSendsSince(since);
  db.logTestSend('main');
  db.openDb(join(dir, 'v026.db')); // reopen = app restart
  assert.equal(db.testSendsSince(since), t + 1);
});

test('upgrade: an existing database keeps its sends in the daily count and warm-up', () => {
  const path = join(dir, 'old.db');
  db.openDb(path);
  // Make it look like a 0.25 database: no send log yet, but sent history in messages and events.
  db.raw().exec(`DROP TRIGGER send_log_no_delete; DROP TRIGGER send_log_insert; DROP TRIGGER send_log_update; DROP TRIGGER send_log_placement; DROP TABLE send_log;`);
  const [l] = db.upsertLead({ name: 'Old Co', source: 'import', source_ref: 'old-1', client: '' } as any);
  const t = new Date().toISOString();
  db.raw().prepare("INSERT INTO messages (lead_id, status, sent_at, created_at) VALUES (?, 'sent', ?, ?), (?, 'sent', '2026-01-02T00:00:00.000Z', ?)").run(l, t, t, l, t);
  db.raw().prepare("INSERT INTO events (at, type, detail) VALUES (?, 'placement', 'main')").run(t);
  db.openDb(path);
  assert.equal(db.sendsSince('main', today()), 2, 'today: one email + one placement test');
  assert.equal(db.firstSend('main'), '2026-01-02T00:00:00.000Z', 'warm-up age carried over');
  assert.equal((db.raw().prepare('SELECT COUNT(*) n FROM messages').get() as any).n, 2, 'messages untouched');
  db.openDb(path); // a second start does not copy the history again
  assert.equal(db.sendsSince('main', today()), 2);
  db.openDb(join(dir, 'v026.db'));
});

test('sent report records retain their actual mailbox and delivery metadata', () => {
  const l = lead('Proof Report');
  const box = 'proof-box';
  const at = db.now();
  const deliveryId = '<proof@test.local>';
  db.reserveEmail(box, 'outreach', deliveryId, 2);
  const id = db.addMessage({ lead_id: l, step: 99, status: 'sent', mailbox: box, sent_at: at, message_id: deliveryId });
  assert.equal(db.messagesFor(l)[0].mailbox, box);
  assert.equal(db.messagesFor(l)[0].sent_at, at);
  assert.equal(db.messagesFor(l)[0].message_id, deliveryId);
  assert.equal(mb.sentToday(box), 1);
  assert.throws(() => db.updateMessage(id, { message_id: '<changed@test.local>' }), /cannot be changed/);
});

test('duplicate review separates multiple locations sharing a telephone number', () => {
  const ids = [lead('Location A', { phone: '+15559990111', city: 'Austin', address: '1 Main St' }), lead('Location B', { phone: '+15559990111', city: 'Dallas', address: '9 Elm St' })];
  for (const [city, address] of [['Austin', '1 Main St'], ['Dallas', '9 Elm St']]) {
    const stamp = db.now();
    ids.push(Number(db.raw().prepare('INSERT INTO leads (name, phone, city, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('Duplicate', '+15559990111', city, address, stamp, stamp).lastInsertRowid));
  }
  const groups = crm.duplicateGroups().map(g => g.leads.map(l => l.id));
  assert.ok(groups.some(g => g.includes(ids[0]) && g.includes(ids[2]) && !g.includes(ids[1])));
  assert.ok(groups.some(g => g.includes(ids[1]) && g.includes(ids[3]) && !g.includes(ids[0])));
});

test('merge preserves notes and undo protects later edits', () => {
  const k = lead('Undo Keep', { notes: 'first' }), r = lead('Undo Removed', { notes: 'second' });
  crm.mergeLeads(k, [r]);
  assert.equal(db.getLead(k)!.notes, 'first\n\nsecond');
  const m = (crm.listMerges() as any[]).find(x => x.kept_id === k);
  db.updateLead(k, { notes: 'edited after merging' });
  assert.throws(() => crm.undoMerge(m.id), /changed after/);
  assert.equal(db.getLead(k)!.notes, 'edited after merging');
  assert.equal(db.getLead(r), undefined);
});

test('merge preserves restrictive contact preferences and aborts conflicting contact metadata', () => {
  const k = lead('Contact Keep'), r = lead('Contact Remove', { status: 'do_not_contact' });
  db.addContact({ lead_id: k, name: 'Ann', email: 'ann@example.test', role: 'Owner' });
  db.addContact({ lead_id: r, name: 'Ann', email: 'ann@example.test', role: 'Manager' });
  assert.throws(() => crm.mergeLeads(k, [r]), /Conflicting contacts/);
  assert.ok(db.getLead(k) && db.getLead(r));
  assert.equal(rows('SELECT role FROM contacts WHERE lead_id = ?', r)[0].role, 'Manager');
  const x = lead('Opt-out Record', { status: 'do_not_contact' });
  crm.mergeLeads(k, [x]);
  assert.equal(db.getLead(k)!.status, 'do_not_contact');
});
