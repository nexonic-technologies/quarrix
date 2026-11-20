import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starsFromLabels } from '../src/main/intel';
import { factsFromClaims } from '../src/main/sources/companyfacts';
import { validate, pick, runSdk } from '../src/main/sources/sdk';
import { overlappingGroups, rowToCandidate } from '../src/main/sources/overture';
import { placeMatches } from '../src/main/geo';

test('star histogram only when it adds up', () => {
  const l = ['5 stars, 1,200 reviews', '4 stars, 300 reviews', '3 stars, 100 reviews', '2 stars, 50 reviews', '1 star, 50 reviews'];
  assert.deepEqual(starsFromLabels(l, 1700), { 5: 1200, 4: 300, 3: 100, 2: 50, 1: 50 });
  assert.equal(starsFromLabels(l, 3000), null, 'does not match the review count');
  assert.equal(starsFromLabels(l.slice(0, 3), 1600), null, 'incomplete');
});

test('company size and growth from Wikidata claims', () => {
  const q = (n: number, at: string) => ({ rank: 'normal', mainsnak: { datavalue: { value: { amount: `+${n}` } } }, qualifiers: { P585: [{ datavalue: { value: { time: `+${at}T00:00:00Z` } } }] } });
  const f = factsFromClaims('Q1', { P1128: [q(100, '2020-01-01'), q(121, '2022-01-01')], P571: [{ mainsnak: { datavalue: { value: { time: '+1999-05-01T00:00:00Z' } } } }] });
  assert.equal(f.employees, 121); assert.equal(f.employeesAt, '2022-01-01');
  assert.ok(Math.abs((f as any).employeeGrowthPerYear - 10) < 0.2, '10% a year');
  assert.equal(f.founded, '1999');
  assert.equal((factsFromClaims('Q2', {}) as any).employees, undefined);
});

test('source SDK validation rejects unsafe or broken definitions', () => {
  const ok = { id: 'acme-dir', name: 'Acme Directory', license: 'CC-BY 4.0', attribution: 'Acme', url: 'https://api.acme.test/places?q={category}&city={city}', items: 'data.results', fields: { name: 'title', phone: 'contact.phone', lat: 'geo[0]' } };
  assert.equal(validate(ok).id, 'acme-dir');
  assert.throws(() => validate({ ...ok, url: 'http://api.acme.test/x' }), /https/);
  assert.throws(() => validate({ ...ok, id: 'Bad ID!' }), /id/);
  assert.throws(() => validate({ ...ok, fields: { name: 'a;b' } }), /path/);
  assert.throws(() => validate({ ...ok, fields: {} }), /fields.name/);
  assert.throws(() => validate({ ...ok, url: 'https://x.test/?k={key}' }), /keyQuery/);
  assert.equal(pick({ a: { b: [{ c: 5 }] } }, 'a.b[0].c'), 5);
});

test('source SDK maps a real JSON response shape', async () => {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: string, o: any) => { urls.push(String(u)); return new Response(JSON.stringify({ data: { results: [{ title: 'Joe Plumbing', contact: { phone: '+1 555 0100' }, geo: [30.2, -97.7], web: 'https://joe.test' }, { title: '' }] } }), { status: 200, headers: { 'content-type': 'application/json', 'x-key-seen': String(o?.headers?.['X-Api-Key'] ?? '') } }); }) as typeof fetch;
  try {
    const src = validate({ id: 'acme', name: 'Acme', license: 'x', attribution: 'Acme', url: 'https://api.acme.test/p?q={category}&c={city}', items: 'data.results', fields: { name: 'title', phone: 'contact.phone', lat: 'geo[0]', lon: 'geo[1]', website: 'web' }, keyHeader: 'X-Api-Key' });
    const r = await runSdk(src, { category: 'plumbers', city: 'Austin', country: 'US' }, 'k1', 10, () => undefined);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].name, r[0].phone, r[0].lat, r[0].lon, r[0].website, r[0].source], ['Joe Plumbing', '+1 555 0100', 30.2, -97.7, 'https://joe.test', 'sdk:acme']);
    assert.match(urls[0], /q=plumbers&c=Austin/);
  } finally { globalThis.fetch = real; }
});

test('Overture: only overlapping row groups are read; rows map to leads', () => {
  const col = (name: string, min: number, max: number) => ({ meta_data: { path_in_schema: ['bbox', name], statistics: { min_value: min, max_value: max } } });
  const g = (x0: number, x1: number, y0: number, y1: number, n: number) => ({ num_rows: n, columns: [col('xmin', x0, x1), col('xmax', x0, x1), col('ymin', y0, y1), col('ymax', y0, y1)] });
  const meta = { row_groups: [g(-10, -5, 50, 55, 100), g(74, 75, 31, 33, 200), g(100, 110, 0, 5, 50)] };
  assert.deepEqual(overlappingGroups(meta, { s: 32, n: 32.3, w: 74.0, e: 74.3 }), [{ start: 100, end: 300 }]);
  const c = rowToCandidate({ id: 'abc', names: { primary: 'Cafe' }, categories: { primary: 'cafe' }, addresses: [{ freeform: '1 Rd', locality: 'Gujranwala', country: 'pk' }], bbox: { xmin: 74.18, xmax: 74.19, ymin: 32.15, ymax: 32.16 }, websites: ['https://cafe.pk'] })!;
  assert.deepEqual([c.name, c.country, c.city, Math.round(c.lat! * 100), c.website], ['Cafe', 'PK', 'Gujranwala', 3216, 'https://cafe.pk']);
});

test('results without coordinates are kept only when their place agrees', () => {
  const lahore = { country: 'PK', city: 'Lahore', bbox: [31.3, 31.7, 74.1, 74.5] };
  assert.equal(placeMatches({ country: 'PK', city: 'Lahore' }, lahore), true);
  assert.equal(placeMatches({ country: 'IN', city: 'Lahore' }, lahore), false);
  assert.equal(placeMatches({ country: 'PK', city: 'Karachi', address: 'Clifton, Karachi' }, lahore), false);
  assert.equal(placeMatches({}, lahore), true, 'no place at all: kept (for example web search results)');
  assert.equal(placeMatches({ country: 'PK', city: 'Karachi' }, { country: 'PK', city: '', bbox: [23, 37, 60, 78] }), true, 'country search keeps any city');
});
