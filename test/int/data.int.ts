// Integration: real SQLite (Electron's better-sqlite3 build), real settings file, real backup files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import { load, save } from '../../src/main/settings';
import { applyPendingRestore, makeBackup, prepareRestore } from '../../src/main/backup';

const dir = process.env.QUARRIX_TEST_DIR!;
db.openDb(join(dir, 'quarrix.db'));
db.migrateData();
crm.migrate();

test('client workspaces never merge or share companies', () => {
  const a = { name: 'Smile Dental', domain: 'smile.com', website: 'https://smile.com', city: 'Austin', address: '1 Main St', phone: '+15125550101', source: 'osm', source_ref: 'node/1' };
  const [id1] = db.upsertLead({ ...a, client: 'Client A' });
  const [id2, created2] = db.upsertLead({ ...a, client: 'Client B' });
  assert.ok(created2 && id1 !== id2, 'same business in two clients stays two records');
  const [id3, created3] = db.upsertLead({ ...a, client: 'Client A' });
  assert.equal(created3, false); assert.equal(id3, id1, 'same client merges');
  const [branch, createdBranch] = db.upsertLead({ ...a, client: 'Client A', address: '9 Elm St', city: 'Dallas', phone: '+12145550199', source_ref: 'node/2' });
  assert.ok(createdBranch, 'another branch of the chain is a new record');
  for (const id of [id1, id2, branch]) crm.linkCompany(id);
  const ca = db.getLead(id1)!, cb = db.getLead(id2)!, cbr = db.getLead(branch)!;
  assert.equal(ca.company_id, cbr.company_id, 'branches share their client\'s company');
  assert.notEqual(ca.company_id, cb.company_id, 'clients never share a company');
  assert.deepEqual((db.branchesOf(ca) as any[]).map((x) => x.id), [branch]);
  assert.throws(() => crm.mergeLeads(id1, [id2]), /different client/);
  assert.equal((crm.listCompanies('', 50, 'Client B') as any[]).length, 1);
});

test('merge and undo move history back', () => {
  const [k] = db.upsertLead({ name: 'Keep Co', city: 'Leeds', phone: '+441130000001', source: 'import', client: '' });
  const [r] = db.upsertLead({ name: 'Keep Co', city: 'Leeds', email: 'hi@keep.co', source: 'import', client: '' });
  db.logEvent(r, 'note', 'history on the duplicate');
  crm.mergeLeads(k, [r]);
  assert.equal(db.getLead(k)!.email, 'hi@keep.co');
  assert.equal(db.getLead(r), undefined);
  const m = (crm.listMerges() as any[]).find((x) => x.kept_id === k);
  crm.undoMerge(m.id);
  assert.ok(db.getLead(r));
  assert.equal(db.getLead(k)!.email, '', 'kept lead back as it was');
  assert.ok((db.eventsFor(r) as any[]).some((e) => e.detail === 'history on the duplicate'), 'history returned to its lead');
});

test('deals, stages, history and forecast', () => {
  const [lead] = db.upsertLead({ name: 'Deal Co', source: 'import', client: '' });
  const id = crm.saveDeal({ lead_id: lead, title: 'Website', value: 1200, currency: 'USD', stage: 'lead' }) as number;
  crm.moveDeal(id, 'proposal', null);
  crm.saveDeal({ id, stage: 'won' });
  assert.equal(db.getLead(lead)!.status, 'won');
  assert.ok((crm.dealHistory(id) as any[]).some((h) => h.field === 'stage' && h.after === 'won'));
  assert.equal(crm.forecast().won, 1200);
  assert.throws(() => crm.saveDeal({ title: 'x', currency: 'dollars' }), /3-letter/);
});

test('encrypted backup restores data and settings', async () => {
  save({ profile: { ...load().profile, name: 'Before Backup' } });
  const before = (db.raw().prepare('SELECT COUNT(*) n FROM leads').get() as { n: number }).n;
  const file = join(dir, 'b.qbak');
  await makeBackup(file, 'correct horse battery');
  assert.ok(!readFileSync(file).includes(Buffer.from('Before Backup')), 'backup is encrypted');
  db.upsertLead({ name: 'After Backup', source: 'import', client: '' });
  save({ profile: { ...load().profile, name: 'Changed Later' } });
  await assert.rejects(async () => prepareRestore(file, 'wrong passphrase'), /Wrong passphrase/);
  assert.deepEqual(prepareRestore(file, 'correct horse battery'), { leads: before });
  db.raw().close();
  assert.equal(applyPendingRestore(), true);
  db.openDb(join(dir, 'quarrix.db'));
  assert.equal((db.raw().prepare('SELECT COUNT(*) n FROM leads').get() as { n: number }).n, before);
  assert.match(readFileSync(join(dir, 'settings.json'), 'utf8'), /Before Backup/);
  assert.ok(existsSync(dir) && (require('node:fs').readdirSync(dir) as string[]).some((f) => f.startsWith('quarrix-before-restore-')), 'safety copy kept');
});

test('0.20 company table migrates to per-client companies', () => {
  const r = db.raw();
  r.exec("DROP TABLE companies; CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL); INSERT INTO companies (name, domain, created_at) VALUES ('Old', 'old.com', '2026-01-01')");
  crm.migrate();
  assert.ok(r.prepare("SELECT 1 FROM pragma_table_info('companies') WHERE name = 'client'").get());
  assert.equal((r.prepare("SELECT name FROM companies WHERE domain = 'old.com'").get() as any).name, 'Old');
});
