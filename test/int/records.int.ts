// Integration: record keeping on real SQLite and real files: tasks and reminders, saved views, contacts, exports,
// job history (new and reposted), interrupted-search recovery, re-contact rule and the attention queue.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as jobstore from '../../src/main/jobstore';
import { exportLeads } from '../../src/main/importexport';
import { contactedRecently } from '../../src/main/mail';

const dir = process.env.QUARRIX_TEST_DIR!;
before(() => { db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate(); jobstore.migrate(); });

test('tasks fall due once and saved views round-trip', () => {
  const [lead] = db.upsertLead({ name: 'Task Co', source: 'import', client: '' });
  crm.saveTask({ lead_id: lead, title: 'Call', due_at: new Date(Date.now() - 1000).toISOString() });
  crm.saveTask({ lead_id: lead, title: 'Later', due_at: new Date(Date.now() + 864e5).toISOString() });
  assert.deepEqual((crm.dueReminders() as any[]).map((t) => t.title), ['Call']);
  assert.equal(crm.dueReminders().length, 0, 'never reminded twice');
  crm.saveView({ screen: 'leads', name: 'A grades', filters: { grade: 'A' } });
  assert.deepEqual(JSON.parse((crm.listViews('leads') as any[])[0].filters), { grade: 'A' });
});

test('contacts, role filter and export wizard choices', async () => {
  const [l] = db.upsertLead({ name: 'Export Co', email: 'a@export.test', domain: 'export.test', source: 'import', client: '' });
  const [dnc] = db.upsertLead({ name: 'Do Not', email: 'x@dnc.test', domain: 'dnc.test', source: 'import', status: 'do_not_contact', client: '' } as any);
  db.addContact({ lead_id: l, name: 'Ana Ruiz', role: 'Owner', email: 'ana@export.test', source: 'website' });
  assert.equal(db.queryLeads({ role: 'owner' }).rows[0].id, l);
  const file = join(dir, 'leads.csv');
  const n = await exportLeads(db.queryLeads({ ids: [l, dnc] }).rows, file, { fields: ['Name', 'Email', 'Data credit'] });
  assert.equal(n, 1, 'do-not-contact left out by default');
  const csv = readFileSync(file, 'utf8').replace(/^﻿/, '');
  assert.equal(csv.split(/\r?\n/)[0], 'Name,Email,Data credit');
});

test('jobs: first seen, new and reposted', () => {
  const j = (id: string) => ({ id, source: 'x', title: 'Data Analyst', company: 'Acme', location: 'Lahore', workplace: '' as const, type: '', level: '', salary: 'PKR 150000 per month', url: `https://x.test/${id}`, posted: '', tags: [], snippet: '' });
  const first = jobstore.annotate([j('1')])[0];
  assert.equal(first.isNew, true);
  assert.equal(first.salaryYearly?.min, 1800000);
  assert.equal(jobstore.annotate([j('1')])[0].isNew, false, 'seen before');
  db.raw().prepare("UPDATE job_seen SET first_seen = '2026-01-01T00:00:00.000Z' WHERE id = '1'").run();
  assert.equal(jobstore.annotate([j('2')])[0].repost, true, 'same role re-listed under a new id');
});

test('interrupted searches resume; re-contact rule; attention queue', () => {
  const id = db.addSearch('Dentists', 'Austin', ['osm'], null, null);
  db.updateSearch(id, { status: 'running' });
  assert.equal(db.requeueInterrupted(), 1);
  assert.equal(db.nextQueuedSearch()?.id, id);
  const [a] = db.upsertLead({ name: 'Branch One', email: 'one@chain.test', domain: 'chain.test', city: 'A', phone: '+1 1', source: 'import', client: '' });
  const [b] = db.upsertLead({ name: 'Branch Two', email: 'two@chain.test', domain: 'chain.test', city: 'B', phone: '+1 2', source: 'import', client: '' });
  const m = db.addMessage({ lead_id: a, step: 0, subject: 's', body: 'b' });
  db.updateMessage(m, { status: 'sent', sent_at: db.now() });
  assert.equal(contactedRecently(db.getLead(b)!, 90), true, 'same company, other branch');
  assert.equal(contactedRecently(db.getLead(b)!, 0), false);
  // A sent message cannot become a failure (0.26 lock); a separate message fails.
  const f = db.addMessage({ lead_id: a, step: 1, subject: 's', body: 'b' });
  db.updateMessage(f, { status: 'failed', error: 'Mailbox full' });
  assert.ok((db.attention().failed as any[]).some((x) => x.error === 'Mailbox full'));
});
