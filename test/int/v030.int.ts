import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import { marketReport, marketCsv } from '../../src/main/market';
import { check } from '../../src/main/validate';

const now = new Date('2026-11-22T00:00:00.000Z');
before(() => { db.openDb(join(process.env.QUARRIX_TEST_DIR!, 'v030.db')); db.migrateData(); crm.migrate(); });
test('market metrics are scoped, count locations separately and keep missing scores unknown', () => {
  const [a] = db.upsertLead({ name: 'A One', client: 'A', category: 'Retail', country: 'US', city: 'Boston', source: 'manual', source_ref: 'a1', website: 'https://example.com', rating: 4, fit: 60 });
  db.raw().prepare('UPDATE leads SET checked_at = ? WHERE id = ?').run('2026-11-01T00:00:00.000Z', a);
  const [b] = db.upsertLead({ name: 'A Two', client: 'A', category: 'Retail', country: 'US', city: 'Boston', source: 'manual', source_ref: 'a2', fit: null, status: 'won' });
  db.upsertLead({ name: 'A Three', client: 'A', category: 'Services', country: 'GB', city: 'London', source: 'manual', source_ref: 'a3', fit: 90 });
  db.upsertLead({ name: 'B private', client: 'B', category: 'Private category', country: 'US', source: 'manual', source_ref: 'b1', fit: 100, email: 'private@example.test' });
  const id = Number(db.raw().prepare('INSERT INTO companies (name,domain,client,created_at) VALUES (?,?,?,?)').run('Shared brand','example.test','A',now.toISOString()).lastInsertRowid);
  db.raw().prepare('UPDATE leads SET company_id = ? WHERE id IN (?, ?)').run(id,a,b);
  const r = marketReport('category','','','A',now);
  assert.equal(r.total.records,3); assert.equal(r.total.companies,1); assert.equal(r.total.unlinked,1); assert.equal(r.total.scored,2); assert.equal(r.total.averageFit,75);
  assert.deepEqual(r.groups.map(g => g.label),['Retail','Services']);
  const retail = r.groups[0]; assert.equal(retail.records,2); assert.equal(retail.companies,1); assert.equal(retail.averageFit,60); assert.equal(retail.recentlyChecked,1); assert.equal(retail.won,1);
  assert.equal(marketReport('city','GB','','A',now).total.records,1);
  assert.equal(marketReport('company','','','A',now).groups[0].records,2);
  assert.equal(marketReport('category','','','B',now).total.records,1);
  assert.equal(marketReport('category','','','',now).total.records,4);
  const csv = marketCsv(r,'category','',''); assert.match(csv,/LinkedCompanies/); assert.doesNotMatch(csv,/private@example|Private category|A One/);
  assert.equal(marketReport('category','ZZ','','A',now).total.averageFit,null);
});
test('report grouping and filter validation enforce known choices and bounded values', () => {
  assert.deepEqual(check('market:report',['category','US','Retail']),['category','US','Retail']);
  assert.throws(() => check('market:report',['invalid','','']),/grouping/);
  assert.throws(() => check('market:export',['city','x'.repeat(81),'']),/too long/);
});
