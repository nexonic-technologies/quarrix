// Background work: run searches one at a time, then visit websites for emails and social links.
import * as db from './db';
import { enrichWebsite, pagespeed, receivesMail, siteScore } from './enrich';
import { guessFit, research } from './ai';
import { searchWeb } from './sources/web';
import { searchDirectories } from './sources/directories';
import { searchPosts } from './sources/posts';
import { load } from './settings';
import { cityAt, geocode, searchOsm, subAreas, type Place } from './sources/osm';
import { searchPlaces } from './sources/places';
import { resetMaps, searchMaps, stopMaps } from './sources/gmaps';
import type { Candidate } from './sources/types';
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
  setInterval(() => { void runSearches(); void runEnrichment(); }, 4000);
}

export function queueSearch(category: string, place: string, sources: string[], campaignId: number | null = null) {
  const id = db.addSearch(category.trim(), place.trim(), sources, campaignId);
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
  let where: Place | null = await geocode(s.place).catch(() => null);
  let anchored = false;
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
          tags: c.chain ? 'chain' : '', summary: c.summary ?? '', contact_name: c.contact_name ?? '',
        });
        found++;
        if (created) { added++; log(s.id, `+ ${c.name}`); }
      }
    });
    tx();
    db.updateSearch(s.id, { found, added });
    notify('leads');
  };
  const progress = (msg: string) => { log(s.id, msg); notify('progress', { id: s.id, msg }); };
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
  // Google lists only about 120 places per query (Places API: 60), so after the whole-city query
  // the search repeats for each neighbourhood until the limit is reached. Duplicates are merged.
  const byArea = async (label: string, run: (where: string, left: number) => Promise<Candidate[]>, maxAreas = Infinity) => {
    const first = await run(s.place, limit);
    await anchor(first);
    save(first);
    let got = first.length;
    const list = (await moreAreas()).slice(0, maxAreas);
    for (const [i, area] of list.entries()) {
      if (cancelSearch === s.id || got >= limit) break;
      progress(`${label}: area ${i + 1} of ${list.length}, ${area.split(',')[0]}`);
      try { const c = await run(area, limit - got); got += c.length; save(c); } catch { /* skip this area */ }
    }
  };
  for (const src of sources) {
    if (cancelSearch === s.id) break;
    try {
      if (src === 'gmaps') { resetMaps(); const seen = new Set<string>(); await byArea('Google Maps', (w, left) => searchMaps(s.category, w, left, settings.sources.mapsDelayMs, progress, seen)); }
      if (src === 'osm') { progress('OpenStreetMap: searching…'); save(await searchOsm(s.category, s.place, limit, where)); }
      if (src === 'web') { await byArea('Web search', (w, left) => searchWeb(s.category, w, left, progress), 15); }
      if (src === 'dir') { const country = where?.country ?? ''; await byArea('Directories', (w, left) => searchDirectories(s.category, w, country, left, progress), 10); }
      if (src === 'posts') { progress('Job posts: searching…'); save(await searchPosts(s.category, limit, progress)); }
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
    : (db.raw().prepare("SELECT * FROM leads WHERE enriched_at IS NULL AND source <> 'reddit' ORDER BY id LIMIT 1").get() as db.Lead | undefined));
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
  if (!lead.website) {
    // No website at all: the clearest need. With a model, still ask it to judge the fit from the other facts.
    let f = guessFit(lead);
    if (settings.ai.provider !== 'none') { const ai = await research(settings, lead, '').catch(() => null); if (ai) f = { fit: ai.fit, needs: ai.needs.length ? ai.needs : f.needs }; }
    db.updateLead(lead.id, { fit: f.fit, needs: f.needs.join(', ') });
    return;
  }
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
  let contact = { contact_name: r.contact.name, contact_role: r.contact.role, summary: '' };
  let fit = guessFit(lead, r.facts, sc.score);
  if (settings.ai.provider !== 'none') {
    const ai = await research(settings, { ...lead, audit: JSON.stringify({ findings: sc.findings }) }, r.text).catch(() => null);
    if (ai) { contact = { contact_name: ai.contact_name || contact.contact_name, contact_role: ai.contact_role || contact.contact_role, summary: ai.summary }; fit = { fit: ai.fit, needs: ai.needs }; }
  }
  const email = lead.email || r.email;
  const emailStatus = email ? ((await receivesMail(email.split('@')[1]).catch(() => false)) ? 'ok' : 'no-mx') : '';
  db.updateLead(lead.id, {
    contact_name: lead.contact_name || contact.contact_name, contact_role: lead.contact_role || contact.contact_role,
    summary: lead.summary || contact.summary, email_status: emailStatus, fit: fit.fit, needs: fit.needs.join(', '),
    website: r.website, domain: r.domain, email: lead.email || r.email, emails: JSON.stringify(emails), socials: JSON.stringify(socials),
    phone: lead.phone || r.phones[0] || '', score: sc.score,
    address: lead.address || [r.schema.street, r.schema.city, r.schema.postcode].filter(Boolean).join(', '),
    city: lead.city || r.schema.city || '', region: lead.region || r.schema.region || '',
    audit: JSON.stringify({ facts: r.facts, psi, findings: sc.findings, phones: r.phones }),
  });
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
