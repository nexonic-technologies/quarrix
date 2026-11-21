// Integration (0.24): career signals from the CV, generic web names repaired, AI switching models on quota.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as db from '../../src/main/db';
import * as jobstore from '../../src/main/jobstore';
import * as career from '../../src/main/career';
import { complete, resetRest, useBackups } from '../../src/main/ai';

const dir = process.env.QUARRIX_TEST_DIR!;
const calls: { url: string; model: string; auth: string }[] = [];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

before(() => { db.openDb(join(dir, 'v024.db')); jobstore.migrate(); career.migrateTables(); db.migrateData(); });

test('leads named "Contact us" get their name from the domain, signals too', () => {
  const [id] = db.upsertLead({ source: 'web', source_ref: 'moorfields.ae', name: 'Contact us', category: 'Doctors', website: 'https://moorfields.ae', domain: 'moorfields.ae', city: 'Dubai', country: 'AE' } as any);
  db.addSignal({ lead_id: id, type: 'hiring', level: 'hot', title: 'Contact us is hiring for seo', detail: '', key: `t:${id}` } as any);
  assert.ok(db.fixGenericNames() >= 1);
  assert.equal(db.getLead(id)!.name, 'Moorfields');
  assert.equal((db.raw().prepare('SELECT title FROM signals WHERE lead_id = ?').get(id) as any).title, 'Moorfields is hiring for seo');
});

test('profile radar comes from the CV, and its postings become scored job signals', () => {
  writeFileSync(join(dir, 'cv.json'), JSON.stringify({ file: 'cv.pdf', text: 'React developer', analysedWith: '', at: '', profile: { name: 'A', title: 'Frontend Developer', years: 4, skills: ['React', 'TypeScript', 'CSS'], roles: ['React Developer'], level: 'Mid level', locations: [], summary: '' } }));
  const id = career.ensureRadar();
  assert.equal(career.radar().keywords, 'React Developer');
  career.ensureRadar({ keywords: 'Web Developer', country: 'PK', countryName: 'Pakistan', city: '' });
  assert.equal(career.radar().edited, true);
  assert.equal(career.ensureRadar(), id); // still the same alert, user's words kept
  assert.equal(career.radar().keywords, 'Web Developer');
  career.resetRadar();
  assert.equal(career.radar().keywords, 'React Developer');
  const ins = db.raw().prepare('INSERT INTO job_alert_hits (alert_id, job_id, at, data, seen) VALUES (?, ?, ?, ?, ?)');
  ins.run(id, 'j1', db.now(), JSON.stringify({ id: 'j1', title: 'Senior React Developer', company: 'Acme', location: 'Lahore', source: 'linkedin', tags: ['React', 'TypeScript'], snippet: 'React TypeScript CSS', level: 'Mid level' }), 0);
  ins.run(id, 'j2', db.now(), JSON.stringify({ id: 'j2', title: 'Accountant', company: 'B', location: 'Lahore', source: 'indeed', tags: [], snippet: 'ledgers', level: '' }), 1);
  const s = career.signals();
  assert.equal(s[0].id, 'j1'); assert.equal(s[0].level, 'hot'); assert.ok(s[0].isNew);
  assert.equal(s.find((x) => x.id === 'j2')!.level, 'info');
  assert.equal(career.unseenCount(), 1);
  career.dismiss('j2'); career.markSeen();
  assert.equal(career.signals().length, 1); assert.equal(career.unseenCount(), 0);
});

test('AI switches to the next free model, then to a backup key, when quota runs out', async () => {
  resetRest();
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const u = String(url);
    if (u.endsWith('/models')) return json({ data: [{ id: 'a/one:free' }, { id: 'b/two:free' }, { id: 'paid/x' }] });
    const body = JSON.parse(init.body ?? '{}');
    calls.push({ url: u, model: body.model, auth: init.headers?.authorization ?? '' });
    if (u.includes('openrouter')) return json({ error: { message: 'Rate limit exceeded: free-models-per-day' } }, 429);
    return json({ choices: [{ message: { content: 'hello from groq' } }] });
  }) as typeof fetch;
  useBackups(() => ({ groq: 'gk' }));
  const out = await complete({ provider: 'openrouter', apiKey: 'ok', model: '', baseUrl: '' }, 's', 'p');
  assert.equal(out, 'hello from groq');
  assert.deepEqual(calls.filter((c) => c.url.includes('openrouter')).map((c) => c.model), ['a/one:free', 'b/two:free']);
  assert.ok(calls.some((c) => c.url.includes('groq') && c.auth === 'Bearer gk'));
  // A wrong key is not a quota problem: it fails at once.
  globalThis.fetch = (async (u: any) => (String(u).endsWith('/models') ? json({ data: [] }) : json({ error: { message: 'Invalid API key' } }, 401))) as typeof fetch;
  await assert.rejects(complete({ provider: 'openai', apiKey: 'bad', model: 'gpt-5-mini', baseUrl: '' }, 's', 'p'), /Invalid API key/);
  useBackups(() => ({}));
});
