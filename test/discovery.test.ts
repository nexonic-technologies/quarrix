import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bboxOf, distanceKm, gridCells, inside, zoomFor } from '../src/main/geo';
import { websiteEvidence } from '../src/main/sources/lookup';
import { overtureToCandidates, searchArcgis, searchNpi, searchSocrata, type OpenFeed } from '../src/main/sources/opendata';
import { SOURCES, sourceForHost, sourceInfo } from '../src/main/sources/catalog';

test('radius geometry', () => {
  assert.ok(Math.abs(distanceKm({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 }) - 344) < 3, 'London to Paris is about 344 km');
  const g = { lat: 40.7128, lon: -74.006, km: 5 };
  const b = bboxOf(g);
  assert.ok(b.s < g.lat && b.n > g.lat && b.w < g.lon && b.e > g.lon);
  const cells = gridCells(g, 2);
  assert.ok(cells.length >= 20 && cells.length <= 40, `cells: ${cells.length}`);
  assert.ok(distanceKm(cells[0], g) <= distanceKm(cells[cells.length - 1], g), 'centre first');
  assert.equal(new Set(cells.map((c) => c.key)).size, cells.length, 'no repeated cells');
  assert.equal(inside(g, { lat: 40.72, lon: -74.0 }), true);
  assert.equal(inside(g, { lat: 41.5, lon: -74.0 }), false);
  assert.equal(inside(g, { lat: null, lon: null }), true);
  assert.ok(zoomFor(2) >= 13 && zoomFor(2) <= 15);
});

test('website lookup needs evidence', () => {
  const lead = { name: 'Bright Smile Dental', city: 'Austin', phone: '+1 (512) 555-0142' };
  assert.equal(websiteEvidence('<p>Call 512.555.0142</p>', lead), 'phone number on the page');
  assert.equal(websiteEvidence('<h1>Bright Smile Dental</h1><p>Serving Austin, TX</p>', lead), 'name and city on the page');
  assert.equal(websiteEvidence('<h1>Bright Smile Dental</h1><p>Dallas</p>', lead), '');
  assert.equal(websiteEvidence('<h1>Smile Studio Austin</h1>', lead), '');
});

test('source catalog covers every source with terms and hosts', () => {
  for (const id of ['gmaps', 'osm', 'web', 'dir', 'tomtom', 'foursquare', 'posts', 'places', 'npi', 'wikidata', 'opendata']) {
    const s = sourceInfo(id);
    assert.ok(s, id);
    assert.ok(s!.license && s!.attribution && s!.restrictions, id);
  }
  assert.equal(sourceInfo('hotfrog')?.id, 'dir');
  assert.equal(sourceInfo('socrata')?.id, 'opendata');
  assert.equal(sourceForHost('api.tomtom.com'), 'tomtom');
  assert.equal(sourceForHost('data.city.gov', { 'data.city.gov': 'opendata' }), 'opendata');
  assert.equal(sourceForHost('example.com'), null);
  assert.equal(SOURCES.find((s) => s.id === 'places')!.export, false);
});

test('Overture GeoJSON import', () => {
  const c = overtureToCandidates({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.12, 51.5] }, properties: { id: 'abc', names: { primary: 'Cafe Uno' }, categories: { primary: 'cafe' }, websites: ['https://cafeuno.co.uk'], phones: ['+44 20 7946 0000'], socials: ['https://www.facebook.com/cafeuno'], addresses: [{ freeform: '1 High St', locality: 'London', country: 'gb', postcode: 'N1 1AA' }], sources: [{ dataset: 'meta' }] } },
    { type: 'Feature', geometry: null, properties: {} },
  ] });
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].name, c[0].category, c[0].country, c[0].lat, c[0].lon, c[0].source_ref], ['Cafe Uno', 'cafe', 'GB', 51.5, -0.12, 'overture:abc']);
  assert.equal(c[0].socials?.facebook, 'https://www.facebook.com/cafeuno');
});

// Connector parsing against recorded response shapes (fetch is stubbed, no network).
function stubFetch(handler: (url: string) => unknown) {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify(handler(String(u))), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = real; } };
}
const quiet = () => undefined;

test('NPI registry connector', async () => {
  const f = stubFetch(() => ({ result_count: 1, results: [{ number: 1234567890, basic: { organization_name: 'AUSTIN FAMILY DENTAL PLLC', status: 'A', authorized_official_first_name: 'ANA', authorized_official_last_name: 'RUIZ' }, addresses: [{ address_purpose: 'MAILING', city: 'X' }, { address_purpose: 'LOCATION', address_1: '100 CONGRESS AVE', city: 'AUSTIN', state: 'TX', postal_code: '787011234', telephone_number: '512-555-0100' }], taxonomies: [{ desc: 'Dentist', primary: true }] }] }));
  try {
    const r = await searchNpi('Dentist', 'Austin', 'TX', 10, quiet);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].name, r[0].city, r[0].postcode, r[0].phone, r[0].category, r[0].source_ref, r[0].contact_name], ['AUSTIN FAMILY DENTAL PLLC', 'AUSTIN', '78701', '512-555-0100', 'Dentist', 'npi:1234567890', 'ANA RUIZ']);
    assert.match(f.urls[0], /enumeration_type=NPI-2/);
    assert.match(f.urls[0], /state=TX/);
  } finally { f.restore(); }
});

const feed = (kind: OpenFeed['kind'], url: string): OpenFeed => ({ kind, name: 'Test feed', url, on: true, nameField: 'dba_name', categoryField: 'license_type', addressField: 'address', cityField: 'city', phoneField: 'phone', websiteField: '', extraWhere: '' });

test('Socrata connector', async () => {
  const f = stubFetch(() => [{ ':id': 'row-1', dba_name: 'Joe Plumbing', license_type: 'Plumber', address: '5 Elm', city: 'CHICAGO', phone: '312-555-0000', location: { latitude: '41.88', longitude: '-87.63' } }]);
  try {
    const r = await searchSocrata(feed('socrata', 'https://data.cityofchicago.org/resource/uupf-x98q.json'), 'plumber', 'Chicago', 50, quiet);
    assert.deepEqual([r[0].name, r[0].lat, r[0].lon, r[0].source], ['Joe Plumbing', 41.88, -87.63, 'socrata']);
    assert.match(decodeURIComponent(f.urls[0]).replace(/\+/g, ' '), /upper\(license_type\) like '%PLUMBER%'/);
    await assert.rejects(searchSocrata(feed('socrata', 'https://example.com/foo'), 'x', '', 5, quiet), /must look like/);
  } finally { f.restore(); }
});

test('ArcGIS connector', async () => {
  const f = stubFetch(() => ({ features: [{ attributes: { OBJECTID: 7, dba_name: "O'Brien Bakery", license_type: 'Food', address: '9 Main', city: 'BOSTON', phone: '' }, geometry: { x: -71.06, y: 42.36 } }] }));
  try {
    const r = await searchArcgis(feed('arcgis', 'https://services.arcgis.com/abc/arcgis/rest/services/Biz/FeatureServer/0'), "o'brien", 'Boston', 50, quiet);
    assert.deepEqual([r[0].name, r[0].lat, r[0].lon], ["O'Brien Bakery", 42.36, -71.06]);
    assert.match(decodeURIComponent(f.urls[0]).replace(/\+/g, ' '), /LIKE '%O''BRIEN%'/, 'quotes are escaped');
  } finally { f.restore(); }
});
