// Job search for job seekers: many public job boards at once, with LinkedIn-style filters.
// Every source is optional; one failing never stops the others.
import * as cheerio from 'cheerio';
import { BOT_UA, fetchText, UA } from './util';
import { complete, parseJson, tier } from './ai';
import { runtimeSettings as load, type Settings } from './settings';

export type Job = {
  id: string; source: string; title: string; company: string; location: string; workplace: 'remote' | 'hybrid' | 'onsite' | '';
  type: string; level: string; salary: string; url: string; posted: string; tags: string[]; snippet: string; match?: number; why?: string;
};
export type JobQuery = {
  keywords: string; country?: string; countryName?: string; city?: string; posted?: '' | '1' | '7' | '30';
  workplace?: string[]; type?: string[]; level?: string[]; sources?: string[];
};
export type JobList = Job[] & { partialReason?: string };

const strip = (h: string) => cheerio.load(`<div>${h ?? ''}</div>`)('div').text().replace(/\s+/g, ' ').trim();
const iso = (v: unknown) => { const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v)); return isNaN(+d) ? '' : d.toISOString(); };
const money = (min?: number, max?: number, cur = 'USD') => (min || max ? `${cur} ${[min, max].filter(Boolean).map((n) => Math.round(Number(n) / 1000) + 'k').join('–')}` : '');
export function levelOf(title: string) {
  const t = title.toLowerCase();
  if (/intern|trainee|apprentice/.test(t)) return 'Internship';
  if (/junior|jr\.?|entry|graduate|associate\b/.test(t)) return 'Entry level';
  if (/director|head of|vp\b|vice president|chief|cto|cfo|ceo/.test(t)) return 'Director';
  if (/senior|sr\.?|lead|principal|staff/.test(t)) return 'Senior';
  return 'Mid level';
}
const typeOf = (s: string) => (/part/i.test(s) ? 'Part-time' : /contract|freelance|temporary/i.test(s) ? 'Contract' : /intern/i.test(s) ? 'Internship' : 'Full-time');

async function getJson(url: string) {
  const r = await fetchText(url, { ua: BOT_UA, timeout: 25000, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text);
}

const SOURCES: Record<string, (q: JobQuery) => Promise<Job[]>> = {
  async remotive(q) {
    const j = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q.keywords)}&limit=150`);
    return (j.jobs ?? []).map((x: any): Job => ({ id: `remotive:${x.id}`, source: 'Remotive', title: x.title, company: x.company_name, location: x.candidate_required_location || 'Worldwide', workplace: 'remote',
      type: typeOf(x.job_type ?? ''), level: levelOf(x.title), salary: x.salary ?? '', url: x.url, posted: iso(x.publication_date), tags: x.tags ?? [], snippet: strip(x.description).slice(0, 400) }));
  },
  async remoteok(q) {
    const r = await fetchText('https://remoteok.com/api', { ua: UA, timeout: 25000, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = JSON.parse(r.text);
    const kw = q.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    return (j as any[]).filter((x) => x.position && kw.every((k) => `${x.position} ${(x.tags ?? []).join(' ')} ${x.company}`.toLowerCase().includes(k)))
      .map((x): Job => ({ id: `remoteok:${x.id}`, source: 'RemoteOK', title: x.position, company: x.company, location: x.location || 'Worldwide', workplace: 'remote', type: 'Full-time', level: levelOf(x.position),
        salary: money(x.salary_min, x.salary_max), url: x.url, posted: iso(x.date), tags: x.tags ?? [], snippet: strip(x.description).slice(0, 400) }));
  },
  async jobicy(q) {
    const j = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=100&tag=${encodeURIComponent(q.keywords)}`);
    return (j.jobs ?? []).map((x: any): Job => ({ id: `jobicy:${x.id}`, source: 'Jobicy', title: strip(x.jobTitle), company: x.companyName, location: x.jobGeo || 'Worldwide', workplace: 'remote',
      type: typeOf([x.jobType].flat().join(' ')), level: x.jobLevel && x.jobLevel !== 'Any' ? x.jobLevel : levelOf(x.jobTitle), salary: money(x.annualSalaryMin, x.annualSalaryMax, x.salaryCurrency), url: x.url,
      posted: iso(x.pubDate), tags: [x.jobIndustry].flat().filter(Boolean).map(strip), snippet: strip(x.jobExcerpt).slice(0, 400) }));
  },
  async himalayas(q) {
    const out: Job[] = [];
    const kw = q.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    for (let offset = 0; offset < 400; offset += 100) {
      const j = await getJson(`https://himalayas.app/jobs/api?limit=100&offset=${offset}`);
      for (const x of j.jobs ?? []) {
        if (!kw.every((k) => `${x.title} ${(x.categories ?? []).join(' ')} ${x.companyName}`.toLowerCase().includes(k))) continue;
        out.push({ id: `himalayas:${x.guid}`, source: 'Himalayas', title: x.title, company: x.companyName, location: (x.locationRestrictions ?? []).join(', ') || 'Worldwide', workplace: 'remote',
          type: typeOf(x.employmentType ?? ''), level: (x.seniority ?? [])[0] ?? levelOf(x.title), salary: money(x.minSalary, x.maxSalary, x.currency || 'USD'), url: x.applicationLink, posted: iso(x.pubDate), tags: x.categories ?? [], snippet: strip(x.excerpt).slice(0, 400) });
      }
      if (!(j.jobs ?? []).length) break;
    }
    return out;
  },
  async arbeitnow(q) {
    const out: Job[] = [];
    const kw = q.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    for (let page = 1; page <= 4; page++) {
      const j = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const x of j.data ?? []) {
        if (!kw.every((k) => `${x.title} ${(x.tags ?? []).join(' ')}`.toLowerCase().includes(k))) continue;
        out.push({ id: `arbeitnow:${x.slug}`, source: 'Arbeitnow', title: x.title, company: x.company_name, location: x.location, workplace: x.remote ? 'remote' : 'onsite', type: typeOf((x.job_types ?? []).join(' ')),
          level: levelOf(x.title), salary: '', url: x.url, posted: iso(x.created_at), tags: x.tags ?? [], snippet: strip(x.description).slice(0, 400) });
      }
    }
    return out;
  },
  async reddit(q) {
    // The RSS feed works without an account, unlike the JSON API.
    const r = await fetchText(`https://www.reddit.com/r/forhire+hiring+jobbit+remotejs+RemoteJobs+freelance_forhire/search.rss?q=${encodeURIComponent(`${q.keywords} hiring`)}&restrict_sr=1&sort=new&t=month&limit=100`, { ua: UA, timeout: 20000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const $ = cheerio.load(r.text, { xmlMode: true });
    return $('entry').map((_, e) => {
      const title = $(e).find('title').text().trim();
      const body = strip($(e).find('content').text());
      const remote = /remote/i.test(title + body);
      return { id: `reddit:${$(e).find('id').text()}`, source: 'Reddit', title, company: $(e).find('author name').text().replace(/^\/u\//, 'u/'), location: remote ? 'Remote' : '', workplace: remote ? 'remote' : '',
        type: typeOf(title), level: levelOf(title), salary: ((title + ' ' + body).match(/\$\s?\d[\d,.]*k?(?:\s?[-–]\s?\$?\d[\d,.]*k?)?(?:\s?\/\s?(?:hr|hour|year|yr|month))?/i) ?? [''])[0],
        url: $(e).find('link').attr('href') ?? '', posted: iso($(e).find('updated').text()), tags: [], snippet: body.slice(0, 400) } as Job;
    }).get().filter((j) => j.title && !/for hire/i.test(j.title));
  },
};

Object.assign(SOURCES, {
  async weworkremotely(q: JobQuery) {
    const r = await fetchText('https://weworkremotely.com/remote-jobs.rss', { ua: BOT_UA, timeout: 20000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const $ = cheerio.load(r.text, { xmlMode: true });
    const kw = q.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    return $('item').map((_, it) => {
      const t = $(it).find('title').text();
      const [company, ...rest] = t.split(': ');
      const title = rest.join(': ') || t;
      return { id: `wwr:${$(it).find('guid').text()}`, source: 'We Work Remotely', title, company, location: $(it).find('region').text() || 'Worldwide', workplace: 'remote', type: typeOf($(it).find('type').text()),
        level: levelOf(title), salary: '', url: $(it).find('link').text() || $(it).find('guid').text(), posted: iso($(it).find('pubDate').text()), tags: [$(it).find('category').text()].filter(Boolean), snippet: strip($(it).find('description').text()).slice(0, 400) } as Job;
    }).get().filter((j) => kw.every((k) => `${j.title} ${j.tags.join(' ')}`.toLowerCase().includes(k)));
  },
  async workingnomads(q: JobQuery) {
    const j = await getJson('https://www.workingnomads.com/api/exposed_jobs/');
    const kw = q.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    return (j as any[]).filter((x) => kw.every((k) => `${x.title} ${x.tags} ${x.category_name}`.toLowerCase().includes(k))).map((x): Job => ({ id: `wn:${x.url}`, source: 'Working Nomads', title: x.title, company: x.company_name,
      location: x.location || 'Worldwide', workplace: 'remote', type: 'Full-time', level: levelOf(x.title), salary: '', url: x.url, posted: iso(x.pub_date), tags: String(x.tags ?? '').split(',').filter(Boolean), snippet: strip(x.description).slice(0, 400) }));
  },
  async adzuna(q: JobQuery) {
    const s = load().sources as any;
    if (!s.adzunaId || !s.adzunaKey) throw new Error('add your free Adzuna keys in Settings → Sources');
    const cc = (q.country || 'GB').toLowerCase().replace('gb', 'gb');
    const out: Job[] = [];
    for (let page = 1; page <= 3; page++) {
      const j = await getJson(`https://api.adzuna.com/v1/api/jobs/${cc}/search/${page}?app_id=${s.adzunaId}&app_key=${s.adzunaKey}&results_per_page=50&what=${encodeURIComponent(q.keywords)}${q.city ? `&where=${encodeURIComponent(q.city)}` : ''}${q.posted ? `&max_days_old=${q.posted}` : ''}`);
      for (const x of j.results ?? []) out.push({ id: `adzuna:${x.id}`, source: 'Adzuna', title: strip(x.title), company: x.company?.display_name ?? '', location: x.location?.display_name ?? '', workplace: /remote/i.test(x.title + x.description) ? 'remote' : '',
        type: typeOf(`${x.contract_time ?? ''} ${x.contract_type ?? ''}`), level: levelOf(x.title), salary: money(x.salary_min, x.salary_max, ''), url: x.redirect_url, posted: iso(x.created), tags: [x.category?.label].filter(Boolean), snippet: strip(x.description).slice(0, 400) });
      if ((j.results ?? []).length < 50) break;
    }
    return out;
  },
  async jooble(q: JobQuery) {
    const key = (load().sources as any).joobleKey;
    if (!key) throw new Error('add your free Jooble key in Settings → Sources');
    const r = await fetchText(`https://jooble.org/api/${key}`, { method: 'POST', timeout: 25000, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: q.keywords, location: [q.city, q.countryName].filter(Boolean).join(', '), page: 1 }) });
    if(!r.ok)throw new Error(`Jooble HTTP ${r.status}`);
    const j = JSON.parse(r.text || '{}');
    return (j.jobs ?? []).map((x: any): Job => ({ id: `jooble:${x.id}`, source: `Jooble${x.source ? ` (${x.source})` : ''}`, title: strip(x.title), company: x.company ?? '', location: x.location ?? '', workplace: /remote/i.test(x.title + x.snippet) ? 'remote' : '',
      type: typeOf(x.type ?? ''), level: levelOf(x.title), salary: x.salary ?? '', url: x.link, posted: iso(x.updated), tags: [], snippet: strip(x.snippet).slice(0, 400) }));
  },
});
// Direct-from-employer sources (phase 6). Imported lazily to avoid a circular import with jobstore.
SOURCES.employers = async (q) => (await import('./jobstore')).followedJobs(q.keywords);
SOURCES.hn = async (q) => (await import('./ats')).hnHiring(q.keywords);
export const JOB_SOURCES = Object.keys(SOURCES);
const DEFAULT_SOURCES = JOB_SOURCES.filter((x) => !['adzuna', 'jooble', 'hn'].includes(x));

const SLOW = new Set(['employers']);
const MANUAL_BOARDS = new Set(['google','indeed','rozee','linkedin']);
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`no answer after ${Math.round(ms / 1000)} s`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/**
 * Runs the chosen boards in parallel, each with a time limit, and reports each board's jobs as soon as it answers
 * (onBatch), so the screen fills in while slower boards are still working. Then merges duplicates and applies the filters.
 */
export async function searchJobs(q: JobQuery, onBatch: (source: string, jobs: Job[], error: string, ms: number) => void = () => undefined): Promise<{ jobs: Job[]; errors: string[] }> {
  const keyed = (load().sources as any);
  const pick = [...new Set(q.sources?.length ? q.sources : [...DEFAULT_SOURCES, ...(keyed.adzunaKey ? ['adzuna'] : []), ...(keyed.joobleKey ? ['jooble'] : [])])];
  const errors: string[] = [];
  const all = (await Promise.all(pick.map(async (s) => {
    const t = Date.now();
    if (!SOURCES[s]) { const msg=MANUAL_BOARDS.has(s)?'Manual access only; use the official job board directly.':'Unknown job board.';errors.push(`${s}: ${msg}`);onBatch(s,[],msg,Date.now()-t);return [] as Job[]; }
    try {
      const result = await withTimeout(SOURCES[s](q), SLOW.has(s) ? 45000 : 20000) as JobList;
      const list = filterJobs(result, q);
      if (result.partialReason) errors.push(`${s}: ${result.partialReason}`);
      onBatch(s, list, result.partialReason ?? '', Date.now() - t);
      return list;
    } catch (e: any) {
      const msg = String(e?.message ?? e).replace(/^Error:\s*/, '').slice(0, 140);
      errors.push(`${s}: ${msg}`);
      onBatch(s, [], msg, Date.now() - t);
      return [] as Job[];
    }
  }))).flat();
  return { jobs: dedupe(all).sort((a, b) => (b.posted || '').localeCompare(a.posted || '')), errors };
}

export function dedupe(list: Job[]) {
  const seen = new Set<string>();
  const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
  return list.filter((j) => {
    // Preserve international locations, remote scope, and distinct work arrangements.
    const loc = normalize(j.location), employer = normalize(j.company);
    const key = employer && loc ? JSON.stringify([normalize(j.title), employer, loc, j.workplace, j.type]) : JSON.stringify([j.source, j.id]);
    if (!j.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterJobs(list: Job[], q: JobQuery) {
  const since = q.posted ? Date.now() - Number(q.posted) * 86400000 : 0;
  const place = [q.city, q.countryName, q.country].filter(Boolean).map((x) => x!.toLowerCase());
  return list.filter((j) => {
    if (!j.title) return false;
    if (since && j.posted && +new Date(j.posted) < since) return false;
    if (q.workplace?.length && j.workplace && !q.workplace.includes(j.workplace)) return false;
    if (q.type?.length && j.type && !q.type.includes(j.type)) return false;
    if (q.level?.length && !q.level.includes(j.level)) return false;
    if (place.length && !/^(LinkedIn|Indeed|Google|Rozee|Adzuna|Jooble)/.test(j.source) && !(j.tags.includes('direct') && !j.location)) {
      const loc = j.location.toLowerCase();
      const open = /worldwide|anywhere|global|^remote$|^$/.test(loc);
      if (!open && !place.some((p) => loc.includes(p)) && !(q.country === 'US' && /\busa?\b|united states|america/.test(loc)) && !(q.country === 'GB' && /\buk\b|united kingdom|england|europe/.test(loc))) return false;
    }
    return true;
  });
}

/** With a model: score how well each job fits the person's skills (0-100) with a short reason. */
export async function matchJobs(settings: Settings, jobs: Job[], profile: string) {
  const n = tier(settings.ai) === 'paid' ? 60 : 20;
  const list = jobs.slice(0, n).map((j, i) => `${i}. ${j.title} at ${j.company} (${j.location}; ${j.level}; ${j.tags.slice(0, 6).join(', ')}) ${j.snippet.slice(0, 200)}`).join('\n');
  const system = 'You match job posts to a candidate. Be strict and honest. Return JSON only: {"scores":[{"i":0,"match":0-100,"why":"max 12 words"}]}';
  const j = parseJson(await complete(settings.ai, system, `Candidate:\n${profile.slice(0, tier(settings.ai) === 'paid' ? 9000 : 3500)}\n\nJobs:\n${list}`, n * 45)) ?? {};
  const out = new Map<string, { match: number; why: string }>();
  for (const s of j.scores ?? []) { const job = jobs[Number(s.i)]; if (job) out.set(job.id, { match: Math.max(0, Math.min(100, Number(s.match) || 0)), why: String(s.why ?? '').slice(0, 120) }); }
  return Object.fromEntries(out);
}

/** Cities and towns of a country, largest first, for the city picker.
 *  From the bundled GeoNames list (all places over 1,000 people), so it works offline and instantly. */
let allCities: { name: string; country: string; population: number }[] | null = null;
let byName: Map<string, any[]> | null = null;
const cityCache = new Map<string, string[]>();
/** Coordinates of a city by name (largest match, preferring the given country), from the offline GeoNames list (QF-110). */
export function cityPoint(name: string, cc = '', strict = false): { lat: number; lon: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  allCities ??= require('all-the-cities');
  const n = name.toLowerCase().trim();
  if (!n) return null;
  if (!byName) { byName = new Map(); for (const c of allCities as any[]) { const k = c.name.toLowerCase(); const l = byName.get(k); l ? l.push(c) : byName.set(k, [c]); } }
  const hits = byName.get(n) ?? [];
  const best = hits.filter((c) => !cc || c.country === cc).sort((a, b) => b.population - a.population)[0] ?? (strict && cc ? undefined : hits.sort((a, b) => b.population - a.population)[0]);
  return best ? { lat: best.loc.coordinates[1], lon: best.loc.coordinates[0] } : null;
}

/**
 * The country a place name points to: the searched country when it has a city of that name, otherwise the country of
 * the largest city with that name (towns under 50,000 people are ignored, to avoid false matches). '' when unknown.
 */
export function cityCountry(name: string, preferCc = ''): string {
  if (preferCc && cityPoint(name, preferCc, true)) return preferCc;
  const n = name.toLowerCase().trim();
  if (!n || !byName) cityPoint(n || 'x');
  const best = (byName?.get(n) ?? []).filter((c: any) => c.population >= 50000).sort((a: any, b: any) => b.population - a.population)[0];
  return best ? String(best.country) : '';
}

export async function citiesOf(cc: string): Promise<string[]> {
  if (cityCache.has(cc)) return cityCache.get(cc)!;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  allCities ??= require('all-the-cities');
  const list = [...new Set(allCities!.filter((c) => c.country === cc).sort((a, b) => b.population - a.population).map((c) => c.name))].slice(0, 1500);
  cityCache.set(cc, list);
  return list;
}
