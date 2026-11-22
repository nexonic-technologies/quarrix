// Non-destructive source checks (QF-011): reachability, keys, rate limits and today's usage, with a fix for each failure.
import * as db from './db';
import { load } from './settings';
import { SOURCES } from './sources/catalog';
import { BOT_UA, fetchText, UA } from './util';
import { redact } from './safety';

export type Health = { id: string; name: string; status: 'ok' | 'warn' | 'fail' | 'off'; message: string; fix: string; ms: number; usedToday: number; limit: number; checkedAt:string };

async function probe(url: string, opts: Parameters<typeof fetchText>[1] = {}) {
  const r = await fetchText(url, { timeout: 15000, maxBytes: 400_000, partial: true, ...opts });
  return { status: r.status, text: r.text, ms: r.ms };
}

export const verdict = (status: number, text: string): [Health['status'], string, string] => {
  if (status === 429) return ['warn', 'Rate limited right now.', 'Wait an hour or lower how often you search.'];
  if (status === 401 || status === 403) return ['fail', `Refused (HTTP ${status}).`, 'Check the key in Settings → Sources, or the site is blocking automated visits.'];
  if (/captcha|unusual traffic|just a moment|verify you are human/i.test(text.slice(0, 5000))) return ['warn', 'Asking for a captcha or bot check.', 'Pause this source for a while, or use another one.'];
  if (status >= 500) return ['warn', `The service has a problem (HTTP ${status}).`, 'Try again later.'];
  if (status >= 400) return ['fail', `HTTP ${status}.`, 'The address may have changed; check for a Quarrix update.'];
  if(status<200||status>=300)return ['warn','Unexpected service response.','Try again later.'];
  return ['ok', 'Endpoint reachable; search results not verified.', ''];
};

const checks: Record<string, () => Promise<[Health['status'], string, string, number]>> = {
  osm: async () => {
    const n = await probe('https://nominatim.openstreetmap.org/status?format=json', { ua: BOT_UA });
    const nVerdict = verdict(n.status, n.text);
    if (nVerdict[0] !== 'ok') return [...nVerdict, n.ms];
    const o = await probe('https://overpass-api.de/api/status', { ua: BOT_UA });
    const slots = /(\d+) slots available now/.exec(o.text)?.[1];
    if (o.status !== 200) return [...verdict(o.status, o.text), o.ms];
    const base=verdict(o.status,o.text);if(base[0]!=='ok')return [...base,o.ms];
    return slots === '0' ? ['warn', 'Overpass is busy (no free slots). Try again later.', 'Try again in a minute.', o.ms] : ['ok', `Status endpoint reachable${slots ? `, ${slots} Overpass slots free` : ''}; search results not verified.`, '', n.ms + o.ms];
  },
  gmaps: async () => { const r = await probe('https://www.google.com/maps?hl=en', { ua: UA }); return [...verdict(r.status, r.text), r.ms]; },
  web: async () => { const r = await probe('https://www.bing.com/search?q=plumber+london', { ua: UA }); return [...verdict(r.status, r.text), r.ms]; },
  dir: async () => { const r = await probe('https://www.hotfrog.com/', { ua: UA }); return [...verdict(r.status, r.text), r.ms]; },
  posts: async () => { const r = await probe('https://www.reddit.com/r/forhire/new/.rss', { ua: BOT_UA }); return [...verdict(r.status, r.text), r.ms]; },
  npi: async () => { const r = await probe('https://npiregistry.cms.hhs.gov/api/?version=2.1&city=Austin&state=TX&limit=1', { ua: BOT_UA }); return [...verdict(r.status, r.text), r.ms]; },
  wikidata: async () => { const r = await probe(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent('ASK { wd:Q42 ?p ?o }')}`, { ua: BOT_UA, headers: { Accept: 'application/sparql-results+json' } }); return [...verdict(r.status, r.text), r.ms]; },
  tomtom: async () => {
    const key = load().sources.tomtomKey;
    if (!key) return ['off', 'No key added.', 'Add a free TomTom key in Settings → Sources.', 0];
    const r = await probe(`https://api.tomtom.com/search/2/poiSearch/cafe.json?limit=1&key=${encodeURIComponent(key)}`);
    return [...verdict(r.status, r.text), r.ms];
  },
  foursquare: async () => {
    const key = load().sources.foursquareKey;
    if (!key) return ['off', 'No key added.', 'Add a free Foursquare key in Settings → Sources.', 0];
    const r = await probe('https://places-api.foursquare.com/places/search?query=cafe&near=London&limit=1', { headers: { Authorization: `Bearer ${key}`, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' } });
    return [...verdict(r.status, r.text), r.ms];
  },
  places: async () => {
    const key = load().sources.placesKey;
    if (!key) return ['off', 'No key added.', 'Add a Google Places API key in Settings → Sources (paid).', 0];
    const r = await probe('https://places.googleapis.com/v1/places:searchText', { method: 'POST', body: JSON.stringify({ textQuery: 'cafe in London', pageSize: 1 }), headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' } });
    return [...verdict(r.status, r.text), r.ms];
  },
  opendata: async () => {
    const feeds = (load().openFeeds ?? []).filter((f) => f.on);
    if (!feeds.length) return ['off', 'No feeds added.', 'Add a Socrata or ArcGIS feed in Settings → Sources.', 0];
    const bad: string[] = [];
    let ms = 0;
    for (const f of feeds) {
      const url = f.kind === 'socrata' ? `${f.url.replace(/\?.*$/, '')}?$limit=1` : `${f.url.replace(/\/$/, '')}/query?where=1%3D1&resultRecordCount=1&f=json`;
      try { const r = await probe(url, { ua: BOT_UA }); ms += r.ms; if (r.status !== 200 || /"error"/.test(r.text.slice(0, 300))) bad.push(f.name); } catch { bad.push(f.name); }
    }
    return bad.length ? ['fail', `Not answering: ${bad.join(', ')}.`, 'Check the feed link and field names in Settings → Sources.', ms] : ['ok', `${feeds.length} feed(s) working.`, '', ms];
  },
};

const latest=new Map<string,Health>(),inflight=new Map<string,Promise<Health>>();
export const sourceHealthSnapshot=()=>[...latest.values()];
export async function checkSources(id?:string): Promise<Health[]> {
  const selected=SOURCES.filter(s=>(!id||id===s.id)&&Object.hasOwn(checks,s.id));
  if(id&&!selected.length)throw new Error('This source has no reachability check.');
  const check=(s:typeof SOURCES[number])=>{
    const running=inflight.get(s.id);if(running)return running;
    const previous=latest.get(s.id);if(previous&&Date.now()-Date.parse(previous.checkedAt)<60000)return Promise.resolve(previous);
    const job=(async()=>{
    let res: [Health['status'], string, string, number];
    const limit=load().budgets?.[s.id]??0, used=db.usageToday()[s.id]??0;
    if(limit>0&&used>=limit)res=['warn',`Today's limit of ${limit} requests is used up.`,'Wait until tomorrow.',0];
    else try { res = await checks[s.id](); } catch (e: any) { res = ['fail', redact(String(e.message ?? e)).slice(0, 160), 'Check your internet connection or firewall.', 0]; }
    const usedToday = db.usageToday()[s.id] ?? 0;
    if (res[0] === 'ok' && limit > 0 && usedToday >= limit) res = ['warn', `Today's limit of ${limit} requests is used up.`, 'Raise it in Settings → Sources → Limits, or wait until tomorrow.', res[3]];
    const result={ id: s.id, name: s.name, status: res[0], message: res[1], fix: res[2], ms: res[3], usedToday, limit,checkedAt:new Date().toISOString() };latest.set(s.id,result);return result;
    })();inflight.set(s.id,job);void job.then(()=>inflight.delete(s.id),()=>inflight.delete(s.id));return job;
  };
  const out:Health[]=[];for(let i=0;i<selected.length;i+=3)out.push(...await Promise.all(selected.slice(i,i+3).map(check)));return out;
}
