// Open and public-sector data: the US NPI healthcare registry, Wikidata, and any Socrata or ArcGIS layer the user adds.
// All are documented public APIs. Each result keeps a link back to its record (source_ref) for provenance.
import { BOT_UA, fetchText, sleep } from '../util';
import type { Candidate, Progress } from './types';

const blank = (c: Partial<Candidate>): Candidate => ({ source: 'npi', source_ref: '', name: '', category: '', address: '', city: '', region: '', country: '', postcode: '', lat: null, lon: null, phone: '', email: '', website: '', ...c });
const getJson = async (url: string, opts: Parameters<typeof fetchText>[1] = {}) => {
  const r = await fetchText(url, { ua: BOT_UA, timeout: 30000, headers: { Accept: 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  try { return JSON.parse(r.text); } catch { throw new Error('The service did not return JSON.'); }
};

/** US National Provider Identifier registry (CMS). Organisations (NPI-2) by default, or individual practitioners (NPI-1). */
export async function searchNpi(category: string, city: string, state: string, limit: number, progress: Progress, individuals = false): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let skip = 0; skip <= 1000 && out.length < limit; skip += 200) {
    const q = new URLSearchParams({ version: '2.1', enumeration_type: individuals ? 'NPI-1' : 'NPI-2', taxonomy_description: category, limit: '200', skip: String(skip) });
    if (city) q.set('city', city);
    if (state) q.set('state', state);
    const j = await getJson(`https://npiregistry.cms.hhs.gov/api/?${q}`);
    if (j.Errors?.length) throw new Error(`NPI registry: ${j.Errors[0].description}`);
    const rows: any[] = j.results ?? [];
    for (const r of rows) {
      const a = (r.addresses ?? []).find((x: any) => x.address_purpose === 'LOCATION') ?? r.addresses?.[0] ?? {};
      const b = r.basic ?? {};
      const name = b.organization_name || [b.first_name, b.last_name].filter(Boolean).join(' ');
      if (!name) continue;
      const tax = (r.taxonomies ?? []).find((t: any) => t.primary) ?? r.taxonomies?.[0];
      out.push(blank({
        source: 'npi', source_ref: `npi:${r.number}`, name, category: tax?.desc || category,
        address: [a.address_1, a.address_2].filter(Boolean).join(', '), city: a.city ?? '', region: a.state ?? '', country: 'US', postcode: (a.postal_code ?? '').slice(0, 5),
        phone: a.telephone_number ?? '', summary: `${individuals ? 'Individual practitioner' : 'Organisation'} · NPI ${r.number}${b.status === 'A' ? ' · active' : ''}`,
        contact_name: b.authorized_official_first_name ? `${b.authorized_official_first_name} ${b.authorized_official_last_name}` : '',
      }));
    }
    progress(`NPI registry: ${out.length} providers`, out.length);
    if (rows.length < 200) break;
    await sleep(500);
  }
  return out.slice(0, limit);
}

/** Wikidata: organisations located in the city whose type label matches the category. CC0 data. */
export async function searchWikidata(category: string, city: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const found = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&search=${encodeURIComponent(city)}`);
  const qid = found.search?.[0]?.id;
  if (!qid) throw new Error(`Wikidata has no place called "${city}".`);
  const word = category.toLowerCase().replace(/s$/, '').replace(/["\\]/g, '');
  const sparql = `SELECT ?item ?itemLabel ?typeLabel ?site ?phone ?coord ?addr WHERE {
    { ?item wdt:P131 wd:${qid} } UNION { ?item wdt:P131/wdt:P131 wd:${qid} }
    ?item wdt:P31 ?type . ?type rdfs:label ?tl . FILTER(LANG(?tl) = "en" && CONTAINS(LCASE(?tl), "${word}"))
    OPTIONAL { ?item wdt:P856 ?site } OPTIONAL { ?item wdt:P1329 ?phone } OPTIONAL { ?item wdt:P625 ?coord } OPTIONAL { ?item wdt:P6375 ?addr }
    FILTER NOT EXISTS { ?item wdt:P576 [] }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT ${Math.min(Number.isFinite(limit) ? limit : 1000, 1000)}`;
  const j = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { timeout: 60000, headers: { Accept: 'application/sparql-results+json' } });
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const b of j.results?.bindings ?? []) {
    const id = b.item.value.split('/').pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const m = b.coord?.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    out.push(blank({ source: 'wikidata', source_ref: `wd:${id}`, name: b.itemLabel?.value ?? id, category: b.typeLabel?.value ?? category, address: b.addr?.value ?? '', city, phone: b.phone?.value ?? '', website: b.site?.value ?? '', lat: m ? +m[2] : null, lon: m ? +m[1] : null }));
  }
  progress(`Wikidata: ${out.length} organisations`, out.length);
  return out;
}

export type OpenFeed = {
  kind: 'socrata' | 'arcgis'; name: string; url: string; on: boolean;
  nameField: string; categoryField: string; addressField: string; cityField: string; phoneField: string; websiteField: string; extraWhere: string;
};

const pick = (row: Record<string, any>, f: string) => (f && row[f] != null ? String(row[f]).trim() : '');
const sqlText = (s: string) => s.replace(/'/g, "''").toUpperCase();

/** A Socrata dataset (data.cityofnewyork.us, data.sfgov.org, …): url is https://domain/resource/abcd-1234.json */
export async function searchSocrata(feed: OpenFeed, category: string, city: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const base = feed.url.replace(/\?.*$/, '').replace(/\/?$/, '').replace(/(\.json)?$/, '.json');
  if (!/\/resource\/[a-z0-9]{4}-[a-z0-9]{4}\.json$/.test(base)) throw new Error(`${feed.name}: the link must look like https://data.example.gov/resource/abcd-1234.json`);
  const where = [feed.categoryField ? `upper(${feed.categoryField}) like '%${sqlText(category)}%'` : '', feed.cityField && city ? `upper(${feed.cityField}) = '${sqlText(city)}'` : '', feed.extraWhere].filter(Boolean).join(' AND ');
  const out: Candidate[] = [];
  for (let offset = 0; out.length < limit; offset += 1000) {
    const q = new URLSearchParams({ $limit: '1000', $offset: String(offset) });
    if (where) q.set('$where', where); else q.set('$q', category);
    const rows: any[] = await getJson(`${base}?${q}`);
    for (const [i, r] of rows.entries()) {
      const name = pick(r, feed.nameField);
      if (!name) continue;
      const loc = r.location ?? r.geocoded_column ?? null;
      out.push(blank({
        source: 'socrata', source_ref: `${base}#${r[':id'] ?? offset + i}:${name}`, name, category: pick(r, feed.categoryField) || category,
        address: pick(r, feed.addressField), city: pick(r, feed.cityField) || city, phone: pick(r, feed.phoneField), website: pick(r, feed.websiteField),
        lat: loc?.latitude ? +loc.latitude : loc?.coordinates ? +loc.coordinates[1] : null, lon: loc?.longitude ? +loc.longitude : loc?.coordinates ? +loc.coordinates[0] : null,
        summary: `From ${feed.name}`,
      }));
    }
    progress(`${feed.name}: ${out.length} records`, out.length);
    if (rows.length < 1000) break;
  }
  return out.slice(0, limit);
}

/** A public ArcGIS FeatureServer or MapServer layer: url ends with /FeatureServer/0 (or /MapServer/0). */
export async function searchArcgis(feed: OpenFeed, category: string, city: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const base = feed.url.replace(/\?.*$/, '').replace(/\/query$/, '').replace(/\/$/, '');
  if (!/\/(FeatureServer|MapServer)\/\d+$/i.test(base)) throw new Error(`${feed.name}: the link must end with /FeatureServer/<number>`);
  const where = [feed.categoryField ? `UPPER(${feed.categoryField}) LIKE '%${sqlText(category)}%'` : '', feed.cityField && city ? `UPPER(${feed.cityField}) = '${sqlText(city)}'` : '', feed.extraWhere].filter(Boolean).join(' AND ') || '1=1';
  const out: Candidate[] = [];
  for (let offset = 0; out.length < limit; offset += 1000) {
    const q = new URLSearchParams({ where, outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json', resultOffset: String(offset), resultRecordCount: '1000' });
    const j = await getJson(`${base}/query?${q}`);
    if (j.error) throw new Error(`${feed.name}: ${j.error.message}`);
    const rows: any[] = j.features ?? [];
    for (const f of rows) {
      const a = f.attributes ?? {};
      const name = pick(a, feed.nameField);
      if (!name) continue;
      const g = f.geometry ?? {};
      out.push(blank({
        source: 'arcgis', source_ref: `${base}#${a.OBJECTID ?? a.FID ?? a.objectid ?? name}`, name, category: pick(a, feed.categoryField) || category,
        address: pick(a, feed.addressField), city: pick(a, feed.cityField) || city, phone: pick(a, feed.phoneField), website: pick(a, feed.websiteField),
        lat: g.y ?? null, lon: g.x ?? null, summary: `From ${feed.name}`,
      }));
    }
    progress(`${feed.name}: ${out.length} records`, out.length);
    if (!j.exceededTransferLimit && rows.length < 1000) break;
  }
  return out.slice(0, limit);
}

/** Overture Maps places exported as GeoJSON (for example with the `overturemaps download --type=place -f geojson` tool). CDLA-Permissive / ODbL. */
export function overtureToCandidates(geojson: any): Candidate[] {
  const out: Candidate[] = [];
  for (const f of geojson?.features ?? []) {
    const p = f.properties ?? {};
    const name = p.names?.primary ?? p['names.primary'];
    if (!name) continue;
    const ad = (p.addresses ?? [])[0] ?? {};
    const [lon, lat] = f.geometry?.type === 'Point' ? f.geometry.coordinates : [null, null];
    out.push(blank({
      source: 'overture', source_ref: `overture:${p.id ?? f.id ?? name}`, name, category: p.categories?.primary ?? p.basic_category ?? '',
      address: ad.freeform ?? '', city: ad.locality ?? '', region: ad.region ?? '', country: (ad.country ?? '').toUpperCase(), postcode: ad.postcode ?? '',
      lat, lon, phone: (p.phones ?? [])[0] ?? '', website: (p.websites ?? [])[0] ?? '',
      socials: Object.fromEntries((p.socials ?? []).map((u: string) => [new URL(u).hostname.replace(/^www\./, '').split('.')[0], u])),
      summary: `Overture Maps (${(p.sources ?? []).map((s: any) => s.dataset).filter(Boolean).join(', ') || 'open data'})`,
    }));
  }
  return out;
}
