// Job search for job seekers: many public job boards at once, with LinkedIn-style filters.
// Every source is optional; one failing never stops the others.
import * as cheerio from 'cheerio';
import { BOT_UA, fetchText, sleep, UA } from './util';
import { complete, parseJson } from './ai';
import type { Settings } from './settings';

export type Job = {
  id: string; source: string; title: string; company: string; location: string; workplace: 'remote' | 'hybrid' | 'onsite' | '';
  type: string; level: string; salary: string; url: string; posted: string; tags: string[]; snippet: string; match?: number; why?: string;
};
export type JobQuery = {
  keywords: string; country?: string; countryName?: string; city?: string; posted?: '' | '1' | '7' | '30';
  workplace?: string[]; type?: string[]; level?: string[]; sources?: string[];
};

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
  async linkedin(q) {
    const loc = [q.city, q.countryName].filter(Boolean).join(', ') || 'Worldwide';
    const tpr = q.posted ? `&f_TPR=r${Number(q.posted) * 86400}` : '';
    const wt = (q.workplace ?? []).map((w) => ({ onsite: '1', remote: '2', hybrid: '3' } as Record<string, string>)[w]).filter(Boolean).join(',');
    const out: Job[] = [];
    for (let start = 0; start < 200; start += 25) {
      const r = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q.keywords)}&location=${encodeURIComponent(loc)}${tpr}${wt ? `&f_WT=${wt}` : ''}&start=${start}`, { ua: UA, timeout: 20000 });
      if (!r.ok) { if (start === 0) throw new Error(`HTTP ${r.status}`); break; }
      const $ = cheerio.load(r.text);
      const cards = $('li');
      if (!cards.length) break;
      cards.each((_, li) => {
        const c = $(li);
        const title = c.find('.base-search-card__title').text().trim();
        if (!title) return;
        const url = (c.find('a.base-card__full-link').attr('href') ?? '').split('?')[0];
        out.push({ id: `linkedin:${url}`, source: 'LinkedIn', title, company: c.find('.base-search-card__subtitle').text().trim(), location: c.find('.job-search-card__location').text().trim(),
          workplace: wt === '2' ? 'remote' : wt === '3' ? 'hybrid' : wt === '1' ? 'onsite' : '', type: '', level: levelOf(title), salary: c.find('.job-search-card__salary-info').text().trim().replace(/\s+/g, ' '),
          url, posted: c.find('time').attr('datetime') ?? '', tags: [], snippet: '' });
      });
      await sleep(900);
    }
    return out;
  },
  async remotive(q) {
    const j = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q.keywords)}&limit=150`);
    return (j.jobs ?? []).map((x: any): Job => ({ id: `remotive:${x.id}`, source: 'Remotive', title: x.title, company: x.company_name, location: x.candidate_required_location || 'Worldwide', workplace: 'remote',
      type: typeOf(x.job_type ?? ''), level: levelOf(x.title), salary: x.salary ?? '', url: x.url, posted: iso(x.publication_date), tags: x.tags ?? [], snippet: strip(x.description).slice(0, 400) }));
  },
  async remoteok(q) {
    const j = await getJson('https://remoteok.com/api');
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
    const j = await getJson(`https://www.reddit.com/r/forhire+hiring+jobbit+remotejs+RemoteJobs+freelance_forhire/search.json?q=${encodeURIComponent(`${q.keywords} hiring`)}&restrict_sr=1&sort=new&t=month&limit=100`);
    return (j.data?.children ?? []).map((c: any) => c.data).filter((p: any) => !/for hire/i.test(p.title)).map((p: any): Job => ({
      id: `reddit:${p.id}`, source: 'Reddit', title: p.title, company: `u/${p.author}`, location: /remote/i.test(p.title + p.selftext) ? 'Remote' : '', workplace: /remote/i.test(p.title + p.selftext) ? 'remote' : '',
      type: typeOf(p.title), level: levelOf(p.title), salary: (String(p.title + ' ' + p.selftext).match(/\$\s?\d[\d,.]*k?(?:\s?[-–]\s?\$?\d[\d,.]*k?)?(?:\s?\/\s?(?:hr|hour|year|yr|month))?/i) ?? [''])[0],
      url: `https://www.reddit.com${p.permalink}`, posted: iso(p.created_utc), tags: [], snippet: String(p.selftext ?? '').slice(0, 400) }));
  },
};
export const JOB_SOURCES = Object.keys(SOURCES);

/** Runs the chosen boards in parallel, merges duplicates and applies the filters. */
export async function searchJobs(q: JobQuery): Promise<{ jobs: Job[]; errors: string[] }> {
  const pick = q.sources?.length ? q.sources : JOB_SOURCES;
  const errors: string[] = [];
  const all = (await Promise.all(pick.map((s) => SOURCES[s]?.(q).catch((e) => { errors.push(`${s}: ${e.message ?? e}`); return [] as Job[]; }) ?? []))).flat();
  const seen = new Set<string>();
  const since = q.posted ? Date.now() - Number(q.posted) * 86400000 : 0;
  const place = [q.city, q.countryName, q.country].filter(Boolean).map((x) => x!.toLowerCase());
  const jobs = all.filter((j) => {
    const key = `${j.title}|${j.company}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
    if (!j.title || seen.has(key)) return false;
    seen.add(key);
    if (since && j.posted && +new Date(j.posted) < since) return false;
    if (q.workplace?.length && j.workplace && !q.workplace.includes(j.workplace)) return false;
    if (q.type?.length && j.type && !q.type.includes(j.type)) return false;
    if (q.level?.length && !q.level.includes(j.level)) return false;
    if (place.length && j.source !== 'LinkedIn') {
      const loc = j.location.toLowerCase();
      const open = /worldwide|anywhere|global|^remote$|^$/.test(loc);
      if (!open && !place.some((p) => loc.includes(p)) && !(q.country === 'US' && /\busa?\b|united states|america/.test(loc)) && !(q.country === 'GB' && /\buk\b|united kingdom|england|europe/.test(loc))) return false;
    }
    return true;
  }).sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));
  return { jobs, errors };
}

/** With a model: score how well each job fits the person's skills (0-100) with a short reason. */
export async function matchJobs(settings: Settings, jobs: Job[], profile: string) {
  const list = jobs.slice(0, 40).map((j, i) => `${i}. ${j.title} at ${j.company} (${j.location}; ${j.level}; ${j.tags.slice(0, 6).join(', ')}) ${j.snippet.slice(0, 200)}`).join('\n');
  const system = 'You match job posts to a candidate. Be strict and honest. Return JSON only: {"scores":[{"i":0,"match":0-100,"why":"max 12 words"}]}';
  const j = parseJson(await complete(settings.ai, system, `Candidate:\n${profile}\n\nJobs:\n${list}`, 2500)) ?? {};
  const out = new Map<string, { match: number; why: string }>();
  for (const s of j.scores ?? []) { const job = jobs[Number(s.i)]; if (job) out.set(job.id, { match: Math.max(0, Math.min(100, Number(s.match) || 0)), why: String(s.why ?? '').slice(0, 120) }); }
  return Object.fromEntries(out);
}

/** Cities and towns of a country, largest first, for the city picker. */
const cityCache = new Map<string, string[]>();
export async function citiesOf(cc: string): Promise<string[]> {
  if (cityCache.has(cc)) return cityCache.get(cc)!;
  const q = `[out:json][timeout:60];area["ISO3166-1"="${cc}"][admin_level=2]->.a;node["place"~"^(city|town)$"]["population"](area.a);out tags 3000;`;
  const r = await fetchText('https://overpass-api.de/api/interpreter', { method: 'POST', ua: BOT_UA, timeout: 70000, body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error('The city list is not available right now. You can type the city instead.');
  const els = (JSON.parse(r.text).elements ?? []) as any[];
  const list = [...new Set(els.map((e) => ({ n: String(e.tags['name:en'] ?? e.tags.name), p: parseInt(String(e.tags.population).replace(/\D/g, ''), 10) || 0 }))
    .filter((x) => /[a-z]/i.test(x.n)).sort((a, b) => b.p - a.p).map((x) => x.n))].slice(0, 400);
  cityCache.set(cc, list);
  return list;
}
