// Background work: run searches one at a time, then visit websites for emails and social links.
import * as db from './db';
import { enrichWebsite, pagespeed, siteScore } from './enrich';
import { guessFit, research } from './ai';
import { searchWeb } from './sources/web';
import { searchDirectories } from './sources/directories';
import { searchPosts } from './sources/posts';
import { searchFoursquare, searchTomTom } from './sources/keyed';
import { runtimeSettings as load } from './settings';
import { cityAt, geocode, searchOsm, subAreas, type Place } from './sources/osm';
import { findWebsite } from './sources/lookup';
import { companyFacts } from './sources/companyfacts';
import { loadSources, runSdk } from './sources/sdk';
import { searchOverture } from './sources/overture';
import { app } from 'electron';
import { checkEmail, hunterDomain } from './verify';
import { diffSnapshot, scoreLead } from './intel';
import { linkCompany } from './crm';
import { searchArcgis, searchNpi, searchSocrata, searchWikidata } from './sources/opendata';
import { sourceInfo } from './sources/catalog';
import { BudgetError, remaining } from './budget';
import { bboxOf, gridCells, inside, insideBox, placeMatches, zoomFor, type Geo } from './geo';
import { searchPlaces } from './sources/places';
import { resetMaps, searchMaps, stopMaps } from './sources/gmaps';
import type { Candidate, Progress } from './sources/types';
import { countryCode, domainOf, isPlatformHost, normalizePhone, sleep } from './util';

type Notify = (event: string, data?: unknown) => void;
let notify: Notify = () => undefined;
let running = false;
let enriching = 0;
let cancelSearch = 0;
const logs = new Map<number, { at: string; msg: string }[]>();
function log(id: number, msg: string) {
  const l = logs.get(id) ?? [];
  if (l[l.length - 1]?.msg === msg) return;
  l.push({ at: new Date().toISOString(), msg });
  if (l.length > 400) l.splice(0, l.length - 400);
  logs.set(id, l);
}
export const searchLog = (id: number) => logs.get(id) ?? [];
export const isSearching = () => running;

export function start(n: Notify) {
  notify = n;
  repairCountries();
  const back = db.requeueInterrupted();
  if (back) log(0, `Resuming ${back} interrupted search(es)`);
  setInterval(() => { void runSearches(); void runEnrichment(); }, 4000);
}

export function queueSearch(category: string, place: string, sources: string[], campaignId: number | null = null, watchId: number | null = null) {
  // The search belongs to the workspace of its watch or campaign, or to the one selected now, even if the user switches later.
  const owner = (watchId ? db.raw().prepare('SELECT client FROM watches WHERE id = ?').get(watchId) : campaignId ? db.raw().prepare('SELECT client FROM campaigns WHERE id = ?').get(campaignId) : null) as { client: string } | null;
  const id = db.addSearch(category.trim(), place.trim(), sources, campaignId, watchId, owner ? owner.client : load().currentClient ?? '');
  notify('searches');
  void runSearches();
  return id;
}

export function stopSearch(id: number) {
  cancelSearch = id;
  stopMaps();
  db.updateSearch(id, { status: 'stopped', finished_at: db.now() });
  notify('searches');
}

type Checkpoint = { done: string[]; areas: Record<string, string[]>; seen: Record<string, string[]> };
type Ctx = { category: string; place: string; where: Place | null; geo: Geo | null; limit: number; progress: Progress; seen: Set<string> };

/** One request batch from one source for one area. Shared by real searches and the preview (QF-013). */
async function fetchFrom(src: string, area: string, left: number, c: Ctx): Promise<Candidate[]> {
  const settings = load();
  const near = area === c.place && c.where ? { lat: c.where.lat, lon: c.where.lon } : null;
  const city = c.where?.city || c.place.split(',')[0];
  switch (src) {
    case 'gmaps': return searchMaps(c.category, area, left, settings.sources.mapsDelayMs, c.progress, c.seen);
    case 'osm': return searchOsm(c.category, area, left, area === c.place ? c.where : null);
    case 'web': return searchWeb(c.category, area, left, c.progress);
    case 'dir': return searchDirectories(c.category, area, c.where?.country ?? '', left, c.progress);
    case 'tomtom': {
      const key = settings.sources.tomtomKey;
      if (!key) throw new Error('Add a free TomTom key in Settings → Sources.');
      return searchTomTom(key, c.category, area, near, c.where?.country ?? '', left, c.progress);
    }
    case 'foursquare': {
      const key = settings.sources.foursquareKey;
      if (!key) throw new Error('Add a free Foursquare key in Settings → Sources.');
      return searchFoursquare(key, c.category, area, near, left, c.progress);
    }
    case 'posts': return searchPosts(c.category, left, c.progress);
    case 'places':
      if (!settings.sources.placesKey) throw new Error('Add a Google Places API key in Settings → Sources.');
      return searchPlaces(settings.sources.placesKey, c.category, area, left, c.progress);
    case 'npi':
      if (c.where?.country && c.where.country !== 'US') throw new Error('The NPI registry covers the United States only.');
      return searchNpi(c.category, city, c.where?.region ? stateCode(c.where.region) : '', left, c.progress, settings.npiIndividuals);
    case 'wikidata': return searchWikidata(c.category, city, left, c.progress);
    case 'opendata': {
      const feeds = (settings.openFeeds ?? []).filter((f) => f.on);
      if (!feeds.length) throw new Error('Add an open data feed in Settings → Sources first.');
      const out: Candidate[] = [];
      for (const f of feeds) {
        try { out.push(...await (f.kind === 'socrata' ? searchSocrata : searchArcgis)(f, c.category, city, left - out.length, c.progress)); }
        catch (e: any) { c.progress(`${f.name}: ${e.message ?? e}`); }
      }
      return out;
    }
  }
  if (src === 'overture') {
    const g = c.geo;
    const b = g ? bboxOf(g) : c.where?.bbox?.length === 4 ? { s: c.where.bbox[0], n: c.where.bbox[1], w: c.where.bbox[2], e: c.where.bbox[3] } : null;
    if (!b) throw new Error('Overture needs a place it can find on the map, or a map area.');
    if ((b.n - b.s) * (b.e - b.w) > 4) throw new Error('That area is too large for Overture (about 200 km across at most). Pick a city or a map area.');
    return searchOverture(c.category, b, left, c.progress);
  }
  if (src.startsWith('sdk:')) {
    const def = loadSources(app.getPath('userData')).ok.find((x) => `sdk:${x.id}` === src);
    if (!def) throw new Error(`The source file for ${src.slice(4)} is missing or has an error (Settings → Sources → Your own sources).`);
    if ((def.keyHeader || def.keyQuery) && !settings.sdkKeys?.[def.id]) throw new Error('Optional source paused or missing its key. See Settings → Sources.');
    return runSdk(def, { category: c.category, city, country: c.where?.country ?? '', lat: c.where?.lat, lon: c.where?.lon }, settings.sdkKeys?.[def.id] ?? '', left, c.progress);
  }
  throw new Error(`Unknown source ${src}`);
}

const US_STATES: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC' };
const stateCode = (region: string) => US_STATES[region.toLowerCase()] ?? (region.length === 2 ? region.toUpperCase() : '');

/** Sources that search one named area at a time and benefit from neighbourhood or grid splitting. */
const AREA_SOURCES: Record<string, number> = { gmaps: Infinity, places: Infinity, web: 15, dir: 10, tomtom: 20, foursquare: 20 };

async function runSearches() {
  if (running) return;
  const s = db.nextQueuedSearch();
  if (!s) return;
  running = true;
  const settings = load();
  const sources = JSON.parse(s.sources) as string[];
  const cp: Checkpoint = { done: [], areas: {}, seen: {}, ...JSON.parse(s.checkpoint || '{}') };
  const geo: Geo | null = s.geo ? JSON.parse(s.geo) : null;
  const resumed = cp.done.length > 0 || Object.keys(cp.areas).length > 0;
  db.updateSearch(s.id, { status: 'running' });
  notify('searches');
  let found = s.found, added = s.added;
  const errors: string[] = [];
  const progress = (msg: string) => { log(s.id, msg); notify('progress', { id: s.id, msg }); };
  if (resumed) progress('Continuing where this search stopped…');
  let where: Place | null = geo ? await cityAt(geo.lat, geo.lon).catch(() => null) : await geocode(s.place).catch(() => null);
  let anchored = !!geo;
  // Trust the real results over the typed place name: find the city around the first results' location.
  const anchor = async (list: Candidate[]) => {
    if (anchored) return;
    const pts = list.filter((c) => c.lat != null && c.lon != null);
    if (!pts.length) return;
    anchored = true;
    const mid = (k: 'lat' | 'lon') => pts.map((c) => c[k] as number).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
    const city = await cityAt(mid('lat'), mid('lon')).catch(() => null);
    if (city) where = city;
  };
  const watchRan = !!(s.watch_id && (db.raw().prepare('SELECT runs FROM watches WHERE id = ?').get(s.watch_id) as { runs: number } | undefined)?.runs);
  const save = (list: Candidate[]) => {
    if (geo) list = list.filter((c) => inside(geo, c));
    // Typed place: drop results whose map position is clearly outside it (the bounding box plus a 25% margin).
    else if (where?.bbox?.length === 4) list = list.filter((c) => (c.lat != null && c.lon != null ? insideBox(where!.bbox!, c) : placeMatches(c, where)));
    const tx = db.raw().transaction(() => {
      for (const c of list) {
        const country = c.country || where?.country || '';
        const website = c.website && !isPlatformHost(domainOf(c.website)) ? c.website : '';
        const socials = { ...(c.socials ?? {}) };
        if (c.website && !website) socials[domainOf(c.website).split('.')[0]] = c.website;
        const [id, created] = db.upsertLead({
          name: c.name, category: c.category, address: c.address, city: c.city || where?.city || '', region: c.region || where?.region || '', country,
          postcode: c.postcode, lat: c.lat, lon: c.lon, phone: normalizePhone(c.phone, country), email: c.email?.toLowerCase() ?? '',
          emails: JSON.stringify(c.email ? [c.email.toLowerCase()] : []), website, domain: website ? domainOf(website) : '',
          socials: JSON.stringify(socials), rating: c.rating ?? null, reviews: c.reviews ?? null, source: c.source, source_ref: c.source_ref, search_id: s.id,
          tags: c.chain ? 'chain' : '', summary: c.summary ?? '', contact_name: c.contact_name ?? '',
          provenance: JSON.stringify({ listing: { source: c.source, ref: c.source_ref, at: db.now(), search: s.id } }),
          details: c.details ? JSON.stringify(c.details) : '{}', client: s.client ?? '',
        });
        found++;
        if (created) {
          added++; log(s.id, `+ ${c.name}`); linkCompany(id); rescore(id); db.emit(id, 'lead_created', `${c.name} from ${c.source}`);
          // A watch that has run before: anything new on the map is a new business, often just opened.
          if (watchRan) {
            const fresh = (c.reviews ?? 0) <= 5;
            db.addSignal({ lead_id: id, type: 'new_listing', level: fresh ? 'hot' : 'warm', title: fresh ? `${c.name} looks newly opened` : `${c.name} newly listed`, detail: `${c.category} in ${c.city || s.place}${c.reviews != null ? `, ${c.reviews} reviews` : ', no reviews yet'}. New businesses need a website, branding and listings set up.`, key: `new:${id}` });
          }
        }
      }
    });
    tx();
    db.updateSearch(s.id, { found, added });
    notify('leads');
  };
  const limit = settings.sources.maxPerSearch > 0 ? settings.sources.maxPerSearch : Infinity; // 0 = everything available
  let areas: string[] | null = null;
  const moreAreas = async () => {
    if (!areas) {
      progress('Splitting the area into neighbourhoods…');
      const town = where?.city || s.place;
      areas = (await subAreas(where ?? s.place, limit === Infinity ? 200 : 40).catch(() => [])).filter((a) => a.toLowerCase() !== town.toLowerCase()).map((a) => `${a}, ${town}`);
    }
    return areas;
  };
  const checkpoint = () => db.saveCheckpoint(s.id, cp);
  for (const src of sources) {
    if (cancelSearch === s.id) break;
    if (cp.done.includes(src)) continue;
    if (src === 'gmaps') resetMaps();
    const seen = new Set(cp.seen[src] ?? []);
    const ctx: Ctx = { category: s.category, place: s.place, where, geo, limit, progress, seen };
    const doneAreas = new Set(cp.areas[src] ?? []);
    const mark = (area: string) => { doneAreas.add(area); cp.areas[src] = [...doneAreas]; cp.seen[src] = [...seen].slice(-5000); checkpoint(); };
    try {
      const label = sourceInfo(src)?.name ?? src;
      let list: string[];
      if (geo && src === 'gmaps') {
        // Radius search: a grid of small map views, centre first (QF-003, QF-004).
        const cellKm = Math.min(2.5, Math.max(0.8, geo.km / 3));
        list = gridCells(geo, cellKm).map((c) => `@${c.lat.toFixed(5)},${c.lon.toFixed(5)},${zoomFor(cellKm)}z`);
      } else if (geo && src === 'osm') {
        list = ['bbox'];
      } else {
        list = [s.place, ...(AREA_SOURCES[src] ? (await moreAreas()).slice(0, AREA_SOURCES[src]) : [])];
      }
      let got = 0;
      for (const [i, area] of list.entries()) {
        if (cancelSearch === s.id || got >= limit) break;
        if (doneAreas.has(area)) continue;
        if (list.length > 1) progress(`${label}: area ${i + 1} of ${list.length}${area.startsWith('@') ? '' : `, ${area.split(',')[0]}`}`);
        else progress(`${label}: searching…`);
        try {
          const batch = area === 'bbox'
            ? await searchOsm(s.category, s.place, limit, geoPlace(geo!, where))
            : await withRetry(() => fetchFrom(src, area, limit - got, ctx), src);
          if (i === 0) await anchor(batch);
          got += batch.length;
          save(batch);
          mark(area);
        } catch (e: any) {
          if (e instanceof BudgetError || i === 0) throw e;
          progress(`${label}: skipped an area (${String(e.message ?? e).slice(0, 80)})`);
        }
      }
      cp.done.push(src);
      checkpoint();
    } catch (e: any) {
      errors.push(String(e.message ?? e));
    }
  }
  if (cancelSearch !== s.id) { db.updateSearch(s.id, { status: errors.length && !found ? 'failed' : 'done', error: errors.join(' · '), finished_at: db.now() }); db.emit(null, 'search_done', `${s.category} in ${s.place}: ${added} new`); }
  if (s.watch_id && cancelSearch !== s.id) db.raw().prepare('UPDATE watches SET runs = runs + 1 WHERE id = ?').run(s.watch_id);
  running = false;
  notify('searches');
  void runEnrichment();
}

/** An OSM place limited to the circle's bounding box (Nominatim order: south, north, west, east). */
function geoPlace(geo: Geo, where: Place | null): Place {
  const b = bboxOf(geo);
  return { label: where?.label ?? '', city: where?.city ?? '', region: where?.region ?? '', country: where?.country ?? '', lat: geo.lat, lon: geo.lon, bbox: [b.s, b.n, b.w, b.e] };
}

/** Retry a source call twice on network errors, with backoff. Captchas, missing keys and budgets fail at once. */
async function withRetry<T>(fn: () => Promise<T>, src: string): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (i >= 2 || e instanceof BudgetError || /captcha|bot check|key|limit|covers|Add an|Unknown source|must/i.test(msg)) throw e;
      log(0, `${src}: retry ${i + 1} after ${msg}`);
      await sleep(2000 * (i + 1) ** 2);
    }
  }
}

/** Run each source on the main area with a small limit and estimate the full run, without saving anything (QF-013, QF-117). */
export async function previewSearch(category: string, place: string, sources: string[], geo: Geo | null) {
  const where = geo ? await cityAt(geo.lat, geo.lon).catch(() => null) : await geocode(place).catch(() => null);
  const areaCount = geo ? null : (await subAreas(where ?? place, 200).catch(() => [])).length;
  const settings = load();
  const out: { source: string; name: string; sample: Candidate[]; error: string; seconds: number; areas: number; estimate: string; budgetLeft: number | null }[] = [];
  for (const src of sources) {
    const info = sourceInfo(src);
    const t = Date.now();
    let sample: Candidate[] = [], error = '';
    try {
      const ctx: Ctx = { category, place, where, geo, limit: 5, progress: () => undefined, seen: new Set() };
      sample = geo && src === 'gmaps'
        ? await fetchFrom(src, `@${geo.lat},${geo.lon},${zoomFor(Math.min(2.5, geo.km))}z`, 5, ctx)
        : await fetchFrom(src, place, 5, ctx);
      if (geo) sample = sample.filter((c) => inside(geo, c));
    } catch (e: any) { error = String(e.message ?? e); }
    const seconds = Math.round((Date.now() - t) / 1000);
    const areas = geo && src === 'gmaps' ? gridCells(geo, Math.min(2.5, Math.max(0.8, geo.km / 3))).length : AREA_SOURCES[src] ? 1 + Math.min(areaCount ?? 0, AREA_SOURCES[src]) : 1;
    const perArea = src === 'gmaps' ? 120 : src === 'places' ? 60 : src === 'web' ? 50 : src === 'dir' ? 60 : src === 'tomtom' || src === 'foursquare' ? 100 : null;
    const minutes = src === 'gmaps' ? Math.round((areas * 120 * (settings.sources.mapsDelayMs + 900)) / 60000) : Math.max(1, Math.round((areas * Math.max(seconds, 3)) / 60));
    const left = remaining(src);
    out.push({ source: src, name: info?.name ?? src, sample: sample.slice(0, 5), error, seconds, areas,
      estimate: error ? '' : `${areas} ${areas === 1 ? 'query' : 'areas'}${perArea ? `, up to about ${(areas * perArea).toLocaleString()} listings` : ''}, about ${minutes} min`,
      budgetLeft: Number.isFinite(left) ? left : null });
  }
  return { where: where ? `${where.city || where.label}${where.country ? `, ${where.country}` : ''}` : place, sources: out };
}

/** Queue every category × place combination (QF-002). */
export function queueBatch(categories: string[], places: string[], sources: string[]) {
  const ids: number[] = [];
  for (const p of places.map((x) => x.trim()).filter(Boolean)) for (const c of categories.map((x) => x.trim()).filter(Boolean)) ids.push(db.addSearch(c, p, sources, null, null, load().currentClient ?? ''));
  notify('searches');
  void runSearches();
  return ids;
}

export function queueGeoSearch(category: string, label: string, geo: Geo, sources: string[]) {
  const id = db.addSearch(category.trim(), label, sources, null, null, load().currentClient ?? '');
  db.addSearchGeo(id, JSON.stringify(geo));
  notify('searches');
  void runSearches();
  return id;
}

/** Pause keeps the checkpoint; resume puts the search back in the queue (QF-001). */
export function pauseSearch(id: number) {
  cancelSearch = id;
  stopMaps();
  db.updateSearch(id, { status: 'paused' });
  notify('searches');
}
export function resumeSearch(id: number) {
  if (cancelSearch === id) cancelSearch = 0;
  db.updateSearch(id, { status: 'queued', error: '' });
  notify('searches');
  void runSearches();
}

/** Website visits run three at a time, oldest first. */
export async function runEnrichment(ids?: number[]) {
  const settings = load();
  if (!ids && !settings.enrich.auto) return;
  const pick = () => (ids
    ? (ids.length ? db.getLead(ids.shift()!) : undefined)
    : (db.raw().prepare(`SELECT * FROM leads WHERE source <> 'reddit' AND (enriched_at IS NULL
        OR (enrich_tries BETWEEN 1 AND 2 AND audit LIKE '{"error"%' AND enriched_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (enrich_tries * 6) || ' hours')))
      ORDER BY enriched_at IS NOT NULL, id LIMIT 1`).get() as db.Lead | undefined));
  while (enriching < 6) {
    const lead = pick();
    if (!lead) break;
    enriching++;
    void enrichOne(lead).finally(() => { enriching--; notify('leads'); });
    await sleep(50);
  }
}

export async function enrichOne(lead: db.Lead) {
  const settings = load();
  db.updateLead(lead.id, { enriched_at: db.now() });
  if (!lead.website && settings.findWebsites && lead.source !== 'reddit' && lead.name && lead.city) {
    const hit = await findWebsite(lead).catch(() => null);
    if (hit) {
      const prov = { ...JSON.parse(lead.provenance || '{}'), website: { url: hit.url, method: 'web search', evidence: hit.evidence, query: hit.query, at: db.now() } };
      db.updateLead(lead.id, { website: hit.url, domain: domainOf(hit.url), provenance: JSON.stringify(prov) });
      lead = db.getLead(lead.id)!;
    }
  }
  if (!lead.website) {
    // No website at all: the clearest need. With a model, still ask it to judge the fit from the other facts.
    let f = guessFit(lead);
    if (settings.ai.provider !== 'none') { const ai = await research(settings, lead, '').catch(() => null); if (ai) f = { fit: ai.fit, needs: ai.needs.length ? ai.needs : f.needs }; }
    db.updateLead(lead.id, { fit: f.fit, needs: f.needs.join(', ') });
    snapshotAndDiff(lead.id);
    rescore(lead.id);
    return;
  }
  const r = await enrichWebsite(lead.website, lead.country, settings.enrich.pages).catch((e) => ({ ok: false as const, error: String(e.message ?? e) }));
  if (!r.ok) {
    // Website did not load: try again after 6 and 12 hours before giving up (sites are often down briefly).
    db.updateLead(lead.id, { audit: JSON.stringify({ error: r.error, tries: (lead.enrich_tries ?? 0) + 1 }), enrich_tries: (lead.enrich_tries ?? 0) + 1 });
    rescore(lead.id);
    return;
  }
  const emails = [...new Set([...JSON.parse(lead.emails || '[]'), ...r.emails])];
  const socials = { ...JSON.parse(lead.socials || '{}'), ...r.socials };
  let psi;
  if (settings.enrich.audit) psi = await pagespeed(r.website, settings.sources.pagespeedKey).catch(() => undefined);
  const sc = siteScore(r.facts, psi);
  let contact = { contact_name: r.contact.name, contact_role: r.contact.role, summary: '' };
  let fit = guessFit(lead, r.facts, sc.score);
  if (settings.ai.provider !== 'none') {
    const ai = await research(settings, { ...lead, audit: JSON.stringify({ findings: sc.findings }) }, r.text).catch(() => null);
    if (ai) { contact = { contact_name: ai.contact_name || contact.contact_name, contact_role: ai.contact_role || contact.contact_role, summary: ai.summary }; fit = { fit: ai.fit, needs: ai.needs }; }
  }
  const prov = JSON.parse(lead.provenance || '{}');
  prov.emails = { ...(prov.emails ?? {}), ...r.emailSources };
  prov.checked = { website: r.website, at: db.now(), pages: Object.values(r.emailSources).length };
  // Email waterfall (QF-031): sources in the order set in Settings, stopping at the first email when chosen.
  // Each step is recorded with what it found, so the evidence card can show where the email came from.
  let email = lead.email;
  const trail: { step: string; found: string; at: string }[] = [];
  for (const step of settings.waterfall?.order ?? ['website', 'hunter']) {
    if (email && (settings.waterfall?.stopOnFirst ?? true)) break;
    if (step === 'website') { trail.push({ step, found: r.email || '', at: db.now() }); if (!email && r.email) email = r.email; }
    if (step === 'hunter' && settings.verify.findWithHunter && settings.verify.hunterKey && r.domain) {
      const found = await hunterDomain(r.domain).catch(() => []);
      for (const f of found) db.addContact({ lead_id: lead.id, name: f.name, role: f.role, email: f.email, source: 'hunter', source_url: f.source_url });
      const best = found.filter((f) => f.type !== 'personal' || f.name).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      trail.push({ step, found: best?.email ?? '', at: db.now() });
      if (best && !email) { email = best.email; prov.emails[best.email] = `Hunter${best.source_url ? `: ${best.source_url}` : ''} (confidence ${best.confidence ?? '?'})`; }
    }
  }
  prov.waterfall = trail;
  const check = email ? await checkEmail(email, settings.verify.auto).catch(() => null) : null;
  // Keep both values when sources disagree instead of silently overwriting (QF-032).
  const conflicts: Record<string, { value: string; source: string }[]> = { ...(prov.conflicts ?? {}) };
  const differs = (a: string, b: string) => !!a && !!b && a.replace(/\D/g, '').slice(-9) !== b.replace(/\D/g, '').slice(-9);
  if (differs(lead.phone, r.phones[0] ?? '')) conflicts.phone = [{ value: lead.phone, source: lead.source }, { value: r.phones[0], source: 'website' }];
  if (lead.city && r.schema.city && lead.city.toLowerCase() !== r.schema.city.toLowerCase()) conflicts.city = [{ value: lead.city, source: lead.source }, { value: r.schema.city, source: 'website' }];
  prov.conflicts = conflicts;
  if (contact.contact_name) db.addContact({ lead_id: lead.id, name: contact.contact_name, role: contact.contact_role, email: email && email.split('@')[0].includes(contact.contact_name.split(' ')[0].toLowerCase()) ? email : '', source: 'website', source_url: r.website });
  for (const p of r.people.slice(0, 10)) db.addContact({ lead_id: lead.id, name: p.name, role: p.role, source: 'website', source_url: r.website });
  for (const e of r.emails.slice(0, 5)) db.addContact({ lead_id: lead.id, email: e, source: 'website', source_url: r.emailSources[e] ?? r.website });
  // Company size and growth from Wikidata, when the company has an entry with this official website.
  const company = settings.companyFacts !== false && r.domain ? await companyFacts(r.domain).catch(() => null) : null;
  db.updateLead(lead.id, {
    contact_name: lead.contact_name || contact.contact_name, contact_role: lead.contact_role || contact.contact_role,
    summary: lead.summary || contact.summary, email_status: check?.status ?? '', email_checked_at: check?.at ?? null, fit: fit.fit, needs: fit.needs.join(', '),
    website: r.website, domain: r.domain, email, emails: JSON.stringify([...new Set([...emails, ...(email ? [email] : [])])]), socials: JSON.stringify(socials),
    phone: lead.phone || r.phones[0] || '', score: sc.score,
    address: lead.address || [r.schema.street, r.schema.city, r.schema.postcode].filter(Boolean).join(', '),
    city: lead.city || r.schema.city || '', region: lead.region || r.schema.region || '',
    audit: JSON.stringify({ facts: { ...r.facts, tech: r.tech }, psi, findings: sc.findings, phones: r.phones }),
    details: JSON.stringify({ ...JSON.parse(lead.details || '{}'), links: r.links, ...(Object.keys(r.extra).length ? { site: r.extra } : {}), ...(company ? { company } : {}) }),
    provenance: JSON.stringify(prov),
  });
  snapshotAndDiff(lead.id);
  linkCompany(lead.id);
  rescore(lead.id);
  db.emit(lead.id, 'lead_enriched', r.website);
}

/** Recompute relevance, evidence and grade from the user's ideal customer profile. */
export function rescore(id: number) {
  const l = db.getLead(id);
  if (!l) return;
  const r = scoreLead(l, load().icp);
  db.updateLead(id, { relevance: r.relevance, evidence: r.evidence, grade: r.grade, reasons: JSON.stringify(r.reasons) });
}

export function rescoreAll() {
  const ids = (db.raw().prepare('SELECT id FROM leads').all() as { id: number }[]).map((x) => x.id);
  db.raw().transaction(() => { for (const id of ids) rescore(id); })();
  notify('leads');
  return ids.length;
}

/** Keep a dated copy of the key fields and raise a signal when something real changed since the last check (QF-036, QF-037). */
function snapshotAndDiff(id: number) {
  const l = db.getLead(id);
  if (!l) return;
  const data = { rating: l.rating, reviews: l.reviews, phone: l.phone, email: l.email, website: l.website, address: l.address };
  const prev = db.lastSnapshot(id);
  if (prev) {
    const changes = diffSnapshot(JSON.parse(prev.data), data);
    if (!changes.length) return;
    const text = changes.map((c) => `${c.field}: ${c.before ?? '—'} → ${c.after ?? '—'}`).join('; ');
    const drop = changes.find((c) => c.field === 'rating' && Number(c.after) < Number(c.before));
    db.addSignal({ lead_id: id, type: 'changed', level: drop ? 'warm' : 'info', title: `${l.name}: ${changes.map((c) => c.field).join(', ')} changed`, detail: text, key: `chg:${id}:${prev.id}`, evidence: `Compared with the check on ${prev.at.slice(0, 10)}` });
  }
  db.addSnapshot(id, data);
}

/** Earlier versions could store the wrong country for Google Maps leads (for example JP for New York). */
function repairCountries() {
  const rows = db.raw().prepare("SELECT id, address, country FROM leads WHERE source = 'gmaps' AND address <> ''").all() as { id: number; address: string; country: string }[];
  const fix = db.raw().prepare('UPDATE leads SET country = ? WHERE id = ?');
  for (const r of rows) {
    const code = countryCode(r.address.split(',').pop() ?? '');
    if (code && code !== r.country) fix.run(code, r.id);
  }
}
