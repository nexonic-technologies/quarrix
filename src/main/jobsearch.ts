// Job search for job seekers: many public job boards at once, with LinkedIn-style filters.
// Every source is optional; one failing never stops the others.
import * as cheerio from 'cheerio';
import { BOT_UA, fetchText, sleep, UA } from './util';
import { complete, parseJson, tier } from './ai';
import { load, type Settings } from './settings';
import { pageHtml } from './sources/gmaps';

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

// Sites that need a real browser (scripts, bot checks) are read through the hidden window, one at a time.
const INDEED: Record<string, string> = { US: 'www', GB: 'uk', CA: 'ca', AU: 'au', IN: 'in', PK: 'pk', AE: 'ae', SA: 'sa', DE: 'de', FR: 'fr', NL: 'nl', IE: 'ie', SG: 'sg', MY: 'malaysia', PH: 'ph', ZA: 'za', NZ: 'nz', NG: 'ng', ES: 'es', IT: 'it', BR: 'br', MX: 'mx', JP: 'jp', QA: 'qa', KW: 'kw', BH: 'bh', OM: 'om', EG: 'eg' };
let browserBusy = Promise.resolve();
const inBrowser = <T>(fn: () => Promise<T>) => { const run = browserBusy.then(fn, fn); browserBusy = run.then(() => undefined, () => undefined); return run; };

Object.assign(SOURCES, {
  google: (q: JobQuery) => inBrowser(async () => {
    const what = `${q.keywords} jobs ${[q.city, q.countryName].filter(Boolean).join(' ')}`.trim();
    const html = await pageHtml(`https://www.google.com/search?q=${encodeURIComponent(what)}&udm=8&hl=en`, '.tNxQIb', 2000);
    const $ = cheerio.load(html);
    const out: Job[] = [];
    $('[data-preview-id], [jscontroller="qodLAe"]').each((_, el) => {
      const c = $(el);
      const title = c.find('.tNxQIb').first().text().trim();
      if (!title) return;
      const company = c.find('.a3jPc').first().text().trim();
      const [location, via] = c.find('.FqK3wc').first().text().trim().split(/\s*•\s*/);
      const text = c.text();
      out.push({ id: `google:${title}|${company}`, source: `Google Jobs${via ? ` (${via.replace(/^via\s+/i, '')})` : ''}`, title, company, location: location ?? '',
        workplace: /remote|work from home/i.test(text) ? 'remote' : /hybrid/i.test(text) ? 'hybrid' : '', type: typeOf(text), level: levelOf(title),
        salary: (text.match(/[$£€₹]\s?\d[\d,.]*K?(?:\s?[-–]\s?[$£€₹]?\d[\d,.]*K?)?(?:\s?(?:a|per)\s(?:year|hour|month))?/i) ?? [''])[0],
        url: `https://www.google.com/search?q=${encodeURIComponent(`${title} ${company}`)}&udm=8&hl=en`, posted: '', tags: [], snippet: '' });
    });
    if (!out.length) throw new Error('no results were readable');
    return out;
  }),
  indeed: (q: JobQuery) => inBrowser(async () => {
    const sub = INDEED[q.country ?? ''] ?? 'www';
    const host = sub === 'www' ? 'www.indeed.com' : `${sub}.indeed.com`;
    const out: Job[] = [];
    for (let start = 0; start < 50; start += 10) {
      const remote = q.workplace?.length === 1 && q.workplace[0] === 'remote' ? '&sc=0kf%3Aattr(DSQF7)%3B' : '';
      const $ = cheerio.load(await pageHtml(`https://${host}/jobs?q=${encodeURIComponent(q.keywords)}&l=${encodeURIComponent(q.city ?? '')}${q.posted ? `&fromage=${q.posted}` : ''}${remote}&start=${start}`, 'body', 2000));
      const cards = $('.job_seen_beacon, [data-jk]');
      if (!cards.length) { if (!start) throw new Error('no results were readable (Indeed may have asked for a check)'); break; }
      cards.each((_, el) => {
        const c = $(el);
        const jk = c.find('[data-jk]').attr('data-jk') ?? c.attr('data-jk') ?? '';
        const title = c.find('h2.jobTitle span[title], h2 span').first().text().trim();
        if (!title || !jk) return;
        out.push({ id: `indeed:${jk}`, source: 'Indeed', title, company: c.find('[data-testid="company-name"]').text().trim(), location: c.find('[data-testid="text-location"]').text().trim(),
          workplace: /remote/i.test(c.text()) ? 'remote' : /hybrid/i.test(c.text()) ? 'hybrid' : '', type: typeOf(c.find('[data-testid="attribute_snippet_testid"]').text()), level: levelOf(title),
          salary: c.find('[data-testid="attribute_snippet_testid"]').filter((_, x) => /\d/.test($(x).text())).first().text().trim(), url: `https://${host}/viewjob?jk=${jk}`, posted: '', tags: [], snippet: c.find('.job-snippet, [data-testid="jobsnippet_footer"]').text().trim().slice(0, 400) });
      });
    }
    return out;
  }),
  rozee: (q: JobQuery) => inBrowser(async () => {
    const out: Job[] = [];
    for (let page = 0; page < 3; page++) {
      const $ = cheerio.load(await pageHtml(`https://www.rozee.pk/job/jsearch/q/${encodeURIComponent(q.keywords)}${q.city ? `/fc/${encodeURIComponent(q.city)}` : ''}${page ? `/fpn/${page * 20}` : ''}`, '.job h3 a', 1500));
      let n = 0;
      $('.job').each((_, el) => {
        const c = $(el);
        const a = c.find('h3 a').first();
        const title = a.text().trim();
        if (!title) return;
        n++;
        const parts = c.find('.cname a').map((_, x) => $(x).text().replace(/^,\s*|,\s*$/g, '').trim()).get().filter(Boolean);
        const href = a.attr('href') ?? '';
        const posted = c.find('.rz-calendar').parent().text().trim();
        out.push({ id: `rozee:${href.split('?')[0]}`, source: 'Rozee.pk', title, company: parts[0] ?? '', location: parts.slice(1).join(', ') || 'Pakistan',
          workplace: /remote|work from home/i.test(c.text()) ? 'remote' : '', type: typeOf(c.text()), level: levelOf(title), salary: '',
          url: (href.startsWith('//') ? 'https:' : '') + href.split('?')[0], posted: iso(posted), tags: [c.find('.func-area-drn').text().trim()].filter(Boolean), snippet: c.find('.jbody').text().trim().slice(0, 400) });
      });
      if (n < 15) break;
    }
    if (!out.length) throw new Error('no results were readable');
    return out;
  }),
  async weworkremotely(q: JobQuery) {
    const r = await fetchText('https://weworkremotely.com/remote-jobs.rss', { ua: BOT_UA, timeout: 20000 });
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
    const j = JSON.parse(r.text || '{}');
    return (j.jobs ?? []).map((x: any): Job => ({ id: `jooble:${x.id}`, source: `Jooble${x.source ? ` (${x.source})` : ''}`, title: strip(x.title), company: x.company ?? '', location: x.location ?? '', workplace: /remote/i.test(x.title + x.snippet) ? 'remote' : '',
      type: typeOf(x.type ?? ''), level: levelOf(x.title), salary: x.salary ?? '', url: x.link, posted: iso(x.updated), tags: [], snippet: strip(x.snippet).slice(0, 400) }));
  },
});
export const JOB_SOURCES = Object.keys(SOURCES);
const DEFAULT_SOURCES = JOB_SOURCES.filter((x) => !['adzuna', 'jooble'].includes(x));

/** Runs the chosen boards in parallel, merges duplicates and applies the filters. */
export async function searchJobs(q: JobQuery): Promise<{ jobs: Job[]; errors: string[] }> {
  const keyed = (load().sources as any);
  const pick = q.sources?.length ? q.sources : [...DEFAULT_SOURCES, ...(keyed.adzunaKey ? ['adzuna'] : []), ...(keyed.joobleKey ? ['jooble'] : [])];
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
    if (place.length && !/^(LinkedIn|Indeed|Google|Rozee|Adzuna|Jooble)/.test(j.source)) {
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
const cityCache = new Map<string, string[]>();
export async function citiesOf(cc: string): Promise<string[]> {
  if (cityCache.has(cc)) return cityCache.get(cc)!;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  allCities ??= require('all-the-cities') as { name: string; country: string; population: number }[];
  const list = [...new Set(allCities.filter((c) => c.country === cc).sort((a, b) => b.population - a.population).map((c) => c.name))].slice(0, 1500);
  cityCache.set(cc, list);
  return list;
}
