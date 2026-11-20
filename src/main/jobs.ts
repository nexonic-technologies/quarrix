// Background work: run searches one at a time, then visit websites for emails and social links.
import * as db from './db';
import { enrichWebsite, pagespeed, siteScore } from './enrich';
import { load } from './settings';
import { geocode, searchOsm, subAreas } from './sources/osm';
import { searchPlaces } from './sources/places';
import { resetMaps, searchMaps, stopMaps } from './sources/gmaps';
import type { Candidate } from './sources/types';
import { domainOf, isPlatformHost, normalizePhone, sleep } from './util';

type Notify = (event: string, data?: unknown) => void;
let notify: Notify = () => undefined;
let running = false;
let enriching = 0;
let cancelSearch = 0;

export function start(n: Notify) {
  notify = n;
  setInterval(() => { void runSearches(); void runEnrichment(); }, 4000);
}

export function queueSearch(category: string, place: string, sources: string[]) {
  const id = db.addSearch(category.trim(), place.trim(), sources);
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

async function runSearches() {
  if (running) return;
  const s = db.nextQueuedSearch();
  if (!s) return;
  running = true;
  const settings = load();
  const sources = JSON.parse(s.sources) as string[];
  db.updateSearch(s.id, { status: 'running' });
  notify('searches');
  let found = 0, added = 0;
  const errors: string[] = [];
  const where = await geocode(s.place).catch(() => null);
  const save = (list: Candidate[]) => {
    const tx = db.raw().transaction(() => {
      for (const c of list) {
        const country = c.country || where?.country || '';
        const website = c.website && !isPlatformHost(domainOf(c.website)) ? c.website : '';
        const socials = { ...(c.socials ?? {}) };
        if (c.website && !website) socials[domainOf(c.website).split('.')[0]] = c.website;
        const [, created] = db.upsertLead({
          name: c.name, category: c.category, address: c.address, city: c.city || where?.city || '', region: c.region || where?.region || '', country,
          postcode: c.postcode, lat: c.lat, lon: c.lon, phone: normalizePhone(c.phone, country), email: c.email?.toLowerCase() ?? '',
          emails: JSON.stringify(c.email ? [c.email.toLowerCase()] : []), website, domain: website ? domainOf(website) : '',
          socials: JSON.stringify(socials), rating: c.rating ?? null, reviews: c.reviews ?? null, source: c.source, source_ref: c.source_ref, search_id: s.id,
          tags: c.chain ? 'chain' : '',
        });
        found++;
        if (created) added++;
      }
    });
    tx();
    db.updateSearch(s.id, { found, added });
    notify('leads');
  };
  const progress = (msg: string) => notify('progress', { id: s.id, msg });
  const limit = settings.sources.maxPerSearch;
  let areas: string[] | null = null;
  const moreAreas = async () => {
    if (!areas) { progress('Splitting the area into neighbourhoods…'); areas = (await subAreas(s.place).catch(() => [])).map((a) => `${a}, ${s.place}`); }
    return areas;
  };
  // Google lists only about 120 places per query (Places API: 60), so after the whole-city query
  // the search repeats for each neighbourhood until the limit is reached. Duplicates are merged.
  const byArea = async (label: string, run: (where: string, left: number) => Promise<Candidate[]>) => {
    let got = 0;
    const list = [s.place, ...(await moreAreas())];
    for (const [i, where] of list.entries()) {
      if (cancelSearch === s.id || got >= limit) break;
      if (i > 0) progress(`${label}: area ${i} of ${list.length - 1}, ${where.split(',')[0]}`);
      try { const c = await run(where, limit - got); got += c.length; save(c); } catch (e) { if (i === 0) throw e; }
    }
  };
  for (const src of sources) {
    if (cancelSearch === s.id) break;
    try {
      if (src === 'gmaps') { resetMaps(); const seen = new Set<string>(); await byArea('Google Maps', (w, left) => searchMaps(s.category, w, left, settings.sources.mapsDelayMs, progress, seen)); }
      if (src === 'osm') { progress('OpenStreetMap: searching…'); save(await searchOsm(s.category, s.place, limit)); }
      if (src === 'places') {
        if (!settings.sources.placesKey) throw new Error('Add a Google Places API key in Settings → Sources.');
        await byArea('Google Places', (w, left) => searchPlaces(settings.sources.placesKey, s.category, w, left, progress));
      }
    } catch (e: any) {
      errors.push(String(e.message ?? e));
    }
  }
  if (cancelSearch !== s.id) db.updateSearch(s.id, { status: errors.length && !found ? 'failed' : 'done', error: errors.join(' · '), finished_at: db.now() });
  running = false;
  notify('searches');
  void runEnrichment();
}

/** Website visits run three at a time, oldest first. */
export async function runEnrichment(ids?: number[]) {
  const settings = load();
  if (!ids && !settings.enrich.auto) return;
  const pick = () => (ids
    ? (ids.length ? db.getLead(ids.shift()!) : undefined)
    : (db.raw().prepare("SELECT * FROM leads WHERE website <> '' AND enriched_at IS NULL ORDER BY id LIMIT 1").get() as db.Lead | undefined));
  while (enriching < 3) {
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
  if (!lead.website) return;
  const r = await enrichWebsite(lead.website, lead.country, settings.enrich.pages).catch((e) => ({ ok: false as const, error: String(e.message ?? e) }));
  if (!r.ok) {
    db.updateLead(lead.id, { audit: JSON.stringify({ error: r.error }) });
    return;
  }
  const emails = [...new Set([...JSON.parse(lead.emails || '[]'), ...r.emails])];
  const socials = { ...JSON.parse(lead.socials || '{}'), ...r.socials };
  let psi;
  if (settings.enrich.audit) psi = await pagespeed(r.website, settings.sources.pagespeedKey).catch(() => undefined);
  const sc = siteScore(r.facts, psi);
  db.updateLead(lead.id, {
    website: r.website, domain: r.domain, email: lead.email || r.email, emails: JSON.stringify(emails), socials: JSON.stringify(socials),
    phone: lead.phone || r.phones[0] || '', score: sc.score,
    address: lead.address || [r.schema.street, r.schema.city, r.schema.postcode].filter(Boolean).join(', '),
    city: lead.city || r.schema.city || '', region: lead.region || r.schema.region || '',
    audit: JSON.stringify({ facts: r.facts, psi, findings: sc.findings, phones: r.phones }),
  });
}
