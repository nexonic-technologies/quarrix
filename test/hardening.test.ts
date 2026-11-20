// 0.22 hardening: credentials on redirects, oversized responses, private addresses, Source SDK terms, Overture coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchText, isSensitiveHeader, redirectHeaders, redirectUrl, TooLargeError } from '../src/main/util';
import { isBlockedHost, isPrivateAddress, outreachBlock } from '../src/main/safety';
import { validate } from '../src/main/sources/sdk';
import { registerSdk, sourceInfo } from '../src/main/sources/catalog';
import { boxes, categoryMatches, categoryWords, inBox, listedFiles, overlappingGroups, placeCategory, placeColumns, rowToCandidate } from '../src/main/sources/overture';

type Call = { url: string; headers: Record<string, string>; method: string; body: unknown };
function stub(routes: Record<string, (c: Call) => Response>) {
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    const c = { url: String(url), headers: { ...(init?.headers ?? {}) }, method: init?.method ?? 'GET', body: init?.body };
    calls.push(c);
    const h = routes[String(url)];
    return h ? h(c) : new Response('nope', { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const redirect = (to: string, status = 302) => () => new Response(null, { status, headers: { location: to } });

test('credentials never follow a redirect to another site', async () => {
  const s = stub({
    'https://api.one.test/v1': redirect('https://cdn.other.test/file?key=SECRET&page=2'),
    'https://cdn.other.test/file?page=2': () => new Response('ok'),
  });
  try {
    const r = await fetchText('https://api.one.test/v1', { headers: { Authorization: 'Bearer abc', 'X-Api-Key': 'k1', 'X-Goog-Api-Key': 'k2', Accept: 'application/json' } });
    assert.equal(r.text, 'ok');
    const second = s.calls[1];
    assert.equal(second.url, 'https://cdn.other.test/file?page=2', 'key-like query parameters are dropped too');
    assert.ok(!Object.keys(second.headers).some((k) => /authorization|api-key/i.test(k)), 'no credential headers on the other site');
    assert.equal(second.headers.Accept, 'application/json', 'ordinary headers are kept');
  } finally { s.restore(); }
});

test('same-site redirects keep credentials; downgrades and cross-site body resends are refused', async () => {
  const s = stub({
    'https://api.one.test/a': redirect('/b'),
    'https://api.one.test/b': () => new Response('fine'),
    'https://api.one.test/down': redirect('http://api.one.test/plain'),
    'https://api.one.test/post': redirect('https://evil.test/collect', 307),
  });
  try {
    await fetchText('https://api.one.test/a', { headers: { Authorization: 'Bearer abc' } });
    assert.equal(s.calls[1].headers.Authorization, 'Bearer abc');
    await assert.rejects(fetchText('https://api.one.test/down', { headers: { Authorization: 'Bearer abc' } }), /https to http/);
    await assert.rejects(fetchText('https://api.one.test/post', { method: 'POST', body: 'client_secret=x' }), /request body to another site/);
    assert.ok(!s.calls.some((c) => c.url.startsWith('https://evil.test')), 'the body was never sent to the other site');
  } finally { s.restore(); }
});

test('oversized responses are rejected, not cut off', async () => {
  const big = 'x'.repeat(5000);
  const s = stub({
    'https://big.test/declared': () => new Response(big, { headers: { 'content-length': String(big.length) } }),
    'https://big.test/stream': () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new TextEncoder().encode('y'.repeat(1000))); c.close(); } })),
  });
  try {
    await assert.rejects(fetchText('https://big.test/declared', { maxBytes: 1000 }), TooLargeError);
    await assert.rejects(fetchText('https://big.test/stream', { maxBytes: 1000 }), /larger than 1 kB/);
    const p = await fetchText('https://big.test/stream', { maxBytes: 1000, partial: true });
    assert.equal(p.truncated, true, 'callers that opt in to a partial read are told it is partial');
  } finally { s.restore(); }
});

test('redirect helpers', () => {
  for (const h of ['Authorization', 'cookie', 'X-API-Key', 'x-auth-token', 'X-Goog-Api-Key', 'Proxy-Authorization']) assert.ok(isSensitiveHeader(h), h);
  for (const h of ['Accept', 'User-Agent', 'Content-Type']) assert.ok(!isSensitiveHeader(h), h);
  assert.deepEqual(redirectHeaders({ Authorization: 'x', Accept: 'y' }, 'https://a.test/1', 'https://a.test/2'), { Authorization: 'x', Accept: 'y' });
  assert.deepEqual(redirectHeaders({ Authorization: 'x', Accept: 'y' }, 'https://a.test/1', 'https://a.test:8443/2'), { Accept: 'y' }, 'another port is another origin');
  assert.equal(redirectUrl('https://b.test/x?token=1&q=2', 'https://a.test/'), 'https://b.test/x?q=2');
  assert.equal(redirectUrl('https://a.test/x?token=1', 'https://a.test/'), 'https://a.test/x?token=1');
});

test('private addresses, including IPv4 hidden in IPv6 and numeric host tricks', () => {
  for (const a of ['::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::127.0.0.1', '64:ff9b::a00:1', '2002:c0a8:101::1', 'fe80::1', 'fd12::1', 'fec0::1', 'ff02::1', '2001:db8::1', '169.254.169.254', '100.64.0.1']) assert.ok(isPrivateAddress(a), a);
  for (const a of ['2606:4700::1111', '2a00:1450:4001::200e', '8.8.8.8', '::ffff:8.8.8.8', '64:ff9b::808:808']) assert.ok(!isPrivateAddress(a), a);
  for (const h of ['2130706433', '0x7f.1', '017700000001', 'printer.lan', 'nas.home.arpa', 'metadata.google.internal']) assert.ok(isBlockedHost(h), h);
  assert.ok(!isBlockedHost('example.com'));
});

test('Source SDK: terms default to no export and no contact, and are enforced', () => {
  const base = { id: 'city-shops', name: 'City shops', license: 'CC BY 4.0', attribution: 'City', url: 'https://data.city.test/shops.json', items: 'rows', fields: { name: 'name', email: 'email' } };
  const plain = validate(base);
  assert.deepEqual([plain.terms.export, plain.terms.contact], [false, false], 'nothing is allowed until the file says so');
  assert.throws(() => validate({ ...base, terms: { export: 'yes' } }), /must be true or false/);
  const open = validate({ ...base, id: 'open-shops', terms: { export: true, contact: true, restrictions: 'Credit the city.' } });
  registerSdk([plain, open]);
  assert.equal(sourceInfo('sdk:city-shops')?.export, false);
  assert.equal(sourceInfo('sdk:open-shops')?.contact, true);
  assert.equal(sourceInfo('sdk:open-shops')?.restrictions, 'Credit the city.');
  assert.deepEqual(sourceInfo('sdk:open-shops')?.hosts, ['data.city.test']);
  const gone = sourceInfo('sdk:deleted-file');
  assert.deepEqual([gone?.export, gone?.contact], [false, false], 'a removed source file allows nothing');
  assert.match(outreachBlock({ email: 'a@b.test' }, false, false), /terms of the source/);
  assert.equal(outreachBlock({ email: 'a@b.test' }, false, true), '');
});

test('Overture: listing pages, antimeridian boxes and category words', () => {
  const xml = '<ListBucketResult><Contents><Key>a/part-1.parquet</Key><Size>123</Size></Contents><Contents><Key>a/part-2.parquet</Key><Size>456</Size></Contents><IsTruncated>true</IsTruncated></ListBucketResult>';
  assert.deepEqual(listedFiles(xml), [{ key: 'a/part-1.parquet', size: 123 }, { key: 'a/part-2.parquet', size: 456 }]);
  const fiji = { s: -19, n: -16, w: 177, e: -179 };
  assert.equal(boxes(fiji).length, 2);
  assert.ok(inBox(-17.7, 178.4, fiji) && inBox(-17.7, -179.5, fiji) && !inBox(-17.7, 170, fiji));
  const col = (name: string, min: number, max: number) => ({ meta_data: { path_in_schema: ['bbox', name], statistics: { min_value: min, max_value: max } } });
  const group = (xmin: number, xmax: number) => ({ num_rows: 10, columns: [col('xmin', xmin, xmax), col('xmax', xmin, xmax), col('ymin', -18, -17), col('ymax', -18, -17)] });
  const meta = { row_groups: [group(178, 179), group(-179.9, -179.1), group(10, 20)] };
  assert.deepEqual(overlappingGroups(meta, fiji), [{ start: 0, end: 10 }, { start: 10, end: 20 }], 'both sides of the 180° line are read');
  assert.deepEqual(categoryWords('Dentists'), ['dentist']);
  assert.deepEqual(categoryWords('Coffee shops & bakeries'), ['coffee', 'bakery']);
  assert.ok(categoryMatches(categoryWords('Hair salons'), 'beauty_salon', ['hair_salon']));
  assert.ok(!categoryMatches(categoryWords('Dentists'), 'restaurant'));
});

test('Overture: old and new place schemas (categories → taxonomy/basic_category)', () => {
  assert.deepEqual(placeCategory({ categories: { primary: 'dentist', alternate: ['health'] } }), { primary: 'dentist', alternates: ['health'] });
  const n = placeCategory({ taxonomy: { primary: 'general_dentistry', hierarchy: ['health_care', 'dentist', 'general_dentistry'], alternates: [] }, basic_category: 'dentist' });
  assert.equal(n.primary, 'general_dentistry');
  assert.ok(categoryMatches(categoryWords('Dentists'), n.primary, n.alternates));
  const meta = { row_groups: [{ columns: ['id', 'names', 'taxonomy', 'taxonomy', 'basic_category', 'bbox'].map((x) => ({ meta_data: { path_in_schema: [x, 'x'] } })) }] };
  assert.deepEqual(placeColumns(meta), ['id', 'names', 'taxonomy', 'basic_category', 'bbox'], 'only columns the file has are requested');
  assert.equal(rowToCandidate({ id: '1', names: { primary: 'Smile' }, basic_category: 'dentist' })?.category, 'dentist');
});
