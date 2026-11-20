// OpenStreetMap: free, open data (ODbL). Nominatim finds the area, Overpass lists the businesses in it.
import { categoryByName } from '../../shared/categories';
import { BOT_UA, fetchText, sleep } from '../util';
import type { Candidate } from './types';

export type Place = { label: string; city: string; region: string; country: string; lat: number; lon: number; area?: number; bbox?: number[] };
const placeCache = new Map<string, Place | null>();

export async function geocode(q: string): Promise<Place | null> {
  const key = q.trim().toLowerCase();
  if (placeCache.has(key)) return placeCache.get(key)!;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=${encodeURIComponent(q)}`;
  const r = await fetchText(url, { ua: BOT_UA, timeout: 20000 });
  let out: Place | null = null;
  try {
    const list = JSON.parse(r.text) as any[];
    const pick = list.find((p) => p.osm_type === 'relation') ?? list[0];
    if (pick) {
      const a = pick.address ?? {};
      out = {
        label: pick.display_name, city: a.city ?? a.town ?? a.village ?? a.county ?? '', region: a.state ?? '',
        country: (a.country_code ?? '').toUpperCase(), lat: +pick.lat, lon: +pick.lon,
        area: pick.osm_type === 'relation' ? 3600000000 + Number(pick.osm_id) : undefined,
        bbox: pick.boundingbox?.map(Number),
      };
    }
  } catch { /* not JSON */ }
  placeCache.set(key, out);
  await sleep(1100); // Nominatim usage policy: max 1 request per second
  return out;
}

export async function searchOsm(category: string, place: string, limit: number, known?: Place | null): Promise<Candidate[]> {
  const where = known?.area ? known : await geocode(place);
  if (!where) throw new Error(`OpenStreetMap could not find "${place}".`);
  const cat = categoryByName(category);
  const scope = where.area ? '(area.a)' : `(${where.bbox![0]},${where.bbox![2]},${where.bbox![1]},${where.bbox![3]})`;
  let filter = '';
  if (cat) {
    filter = Object.entries(cat.osm).map(([k, v]) => `nwr["${k}"="${v}"]["name"]${scope};`).join('');
  } else {
    const word = category.replace(/["\\]/g, '').replace(/s$/i, '');
    filter = ['shop', 'office', 'craft', 'amenity', 'healthcare', 'tourism', 'leisure'].map((k) => `nwr["${k}"]["name"~"${word}",i]${scope};`).join('');
  }
  const q = `[out:json][timeout:180];${where.area ? `area(${where.area})->.a;` : ''}(${filter});out tags center${Number.isFinite(limit) ? ' ' + limit * 2 : ''};`;
  const r = await overpass(q, 190000);
  if (!r.ok) throw new Error(`OpenStreetMap is busy (HTTP ${r.status}). Try again in a few minutes.`);
  const els = (JSON.parse(r.text).elements ?? []) as any[];
  const out: Candidate[] = [];
  for (const e of els) {
    const t = e.tags ?? {};
    if (!t.name) continue;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    out.push({
      source: 'osm', source_ref: `${e.type}/${e.id}`, name: t['name:en'] ?? t.name, category: cat?.name ?? category,
      address: [street, t['addr:city'], t['addr:postcode']].filter(Boolean).join(', '),
      city: t['addr:city'] ?? where.city, region: t['addr:state'] ?? where.region, country: (t['addr:country'] ?? where.country).toUpperCase(),
      postcode: t['addr:postcode'] ?? '', lat: e.lat ?? e.center?.lat ?? null, lon: e.lon ?? e.center?.lon ?? null,
      phone: t.phone ?? t['contact:phone'] ?? '', email: t.email ?? t['contact:email'] ?? '',
      website: t.website ?? t['contact:website'] ?? t.url ?? '',
      socials: Object.fromEntries(Object.entries({ facebook: t['contact:facebook'], instagram: t['contact:instagram'], linkedin: t['contact:linkedin'] }).filter(([, v]) => v)) as Record<string, string>,
      chain: !!(t.brand || t['brand:wikidata']),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Neighbourhoods, sectors and suburbs inside a place, in English where possible.
 *  Google Maps lists at most about 120 places per query, so big cities are searched area by area. */
export async function subAreas(place: string | Place | null, max = 40): Promise<string[]> {
  const where = typeof place === 'string' ? await geocode(place) : place;
  if (!where?.area) return [];
  const q = `[out:json][timeout:40];area(${where.area})->.a;node["place"~"^(suburb|neighbourhood|quarter|town|village)$"]["name"](area.a);out tags 400;`;
  try {
    const r = await overpass(q, 60000);
    if (!r.ok) return [];
    const rank: Record<string, number> = { suburb: 0, town: 1, quarter: 2, neighbourhood: 3, village: 4 };
    const els = ((JSON.parse(r.text).elements ?? []) as any[])
      .map((e) => ({ name: String(e.tags['name:en'] ?? e.tags.name), r: rank[e.tags.place] ?? 5 }))
      .filter((x) => /[a-z]/i.test(x.name))
      .sort((a, b) => a.r - b.r);
    return [...new Set(els.map((x) => x.name))].slice(0, max);
  } catch { return []; }
}

/** Overpass with a retry on a second public server when the main one is busy. */
async function overpass(q: string, timeout: number) {
  const send = (url: string) => fetchText(url, { method: 'POST', ua: BOT_UA, timeout, body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  let r = await send('https://overpass-api.de/api/interpreter').catch(() => ({ ok: false, status: 0, text: '' }) as Awaited<ReturnType<typeof fetchText>>);
  if (!r.ok) { await sleep(4000); r = await send('https://overpass.kumi.systems/api/interpreter').catch(() => r); }
  return r;
}

/** The city around a point, from real search results. Fixes typos like "Newyork" that plain geocoding gets wrong. */
export async function cityAt(lat: number, lon: number): Promise<Place | null> {
  for (const zoom of [10, 8]) {
    try {
      const r = await fetchText(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&zoom=${zoom}&lat=${lat}&lon=${lon}`, { ua: BOT_UA, timeout: 20000 });
      await sleep(1100);
      const p = JSON.parse(r.text);
      if (p?.osm_type === 'relation') {
        const a = p.address ?? {};
        return {
          label: p.display_name, city: a.city ?? a.town ?? a.county ?? '', region: a.state ?? '', country: (a.country_code ?? '').toUpperCase(),
          lat: +p.lat, lon: +p.lon, area: 3600000000 + Number(p.osm_id), bbox: p.boundingbox?.map(Number),
        };
      }
    } catch { /* try a wider zoom */ }
  }
  return null;
}
