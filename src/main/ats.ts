// Jobs straight from employers' own hiring systems (phase 6): Greenhouse, Lever, Ashby, SmartRecruiters,
// Workable, Recruitee, Personio, Pinpoint and Workday public job feeds (QF-091 to QF-096), ATS detection from a link (QF-104),
// Hacker News "Who is hiring" (QF-097), plus salary parsing (QF-109) and closed-posting detection (QF-105).
import { BOT_UA, fetchText } from './util';
import type { Job } from './jobsearch';

export type Employer = { ats: string; slug: string; name: string; host?: string; site?: string };

/** Recognise an employer's hiring system from any careers or job link (QF-104). Pure. */
export function detectAts(link: string): Employer | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//.test(link.trim()) ? link.trim() : `https://${link.trim()}`); } catch { return null; }
  const h = u.hostname.toLowerCase(), p = u.pathname.split('/').filter(Boolean);
  const nice = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (/(^|\.)greenhouse\.io$/.test(h) && p[0]) return { ats: 'greenhouse', slug: p[0] === 'embed' ? u.searchParams.get('for') ?? '' : p[0], name: nice(p[0] === 'embed' ? u.searchParams.get('for') ?? '' : p[0]) };
  if (h === 'jobs.lever.co' && p[0]) return { ats: 'lever', slug: p[0], name: nice(p[0]) };
  if (h === 'jobs.eu.lever.co' && p[0]) return { ats: 'lever-eu', slug: p[0], name: nice(p[0]) };
  if (h === 'jobs.ashbyhq.com' && p[0]) return { ats: 'ashby', slug: p[0], name: nice(p[0]) };
  if ((h === 'jobs.smartrecruiters.com' || h === 'careers.smartrecruiters.com') && p[0]) return { ats: 'smartrecruiters', slug: p[0], name: nice(p[0]) };
  if (h === 'apply.workable.com' && p[0]) return { ats: 'workable', slug: p[0], name: nice(p[0]) };
  const sub = (re: RegExp) => h.match(re)?.[1];
  if (sub(/^([a-z0-9-]+)\.recruitee\.com$/)) return { ats: 'recruitee', slug: sub(/^([a-z0-9-]+)\.recruitee\.com$/)!, name: nice(sub(/^([a-z0-9-]+)\.recruitee\.com$/)!) };
  if (sub(/^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/)) { const s = sub(/^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/)!; return { ats: 'personio', slug: s, name: nice(s), host: h }; }
  if (sub(/^([a-z0-9-]+)\.pinpointhq\.com$/)) return { ats: 'pinpoint', slug: sub(/^([a-z0-9-]+)\.pinpointhq\.com$/)!, name: nice(sub(/^([a-z0-9-]+)\.pinpointhq\.com$/)!) };
  const wd = h.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) { const site = p.find((x) => !/^[a-z]{2}-[A-Z]{2}$/.test(x)) ?? ''; return site ? { ats: 'workday', slug: wd[1], name: nice(wd[1]), host: h, site } : null; }
  return null;
}

const strip = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const iso = (v: unknown) => { const d = typeof v === 'number' ? new Date(v) : new Date(String(v ?? '')); return Number.isNaN(+d) ? '' : d.toISOString(); };
const remote = (s: string) => (/remote/i.test(s) ? 'remote' : /hybrid/i.test(s) ? 'hybrid' : '') as Job['workplace'];
async function getJson(url: string, opts: Parameters<typeof fetchText>[1] = {}) {
  // Big employers publish feeds of tens of MB (full descriptions); the limit is generous but still enforced.
  const r = await fetchText(url, { ua: BOT_UA, timeout: 45000, maxBytes: 40_000_000, headers: { Accept: 'application/json', ...(opts.headers ?? {}) }, ...opts });
  if (r.status === 404) throw new Error('job board not found (check the company name)');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text);
}
const job = (e: Employer, x: Partial<Job> & { id: string; title: string; url: string }): Job => ({
  source: `${e.name} (${e.ats.replace('-eu', '')})`, company: e.name, location: '', workplace: '', type: '', level: '', salary: '', posted: '', tags: ['direct'], snippet: '', ...x, id: `${e.ats}:${e.slug}:${x.id}`,
});

export async function employerJobs(e: Employer): Promise<Job[]> {
  switch (e.ats) {
    case 'greenhouse': {
      const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(e.slug)}/jobs?content=true`);
      return (j.jobs ?? []).map((x: any) => job(e, { id: String(x.id), title: x.title, url: x.absolute_url, location: x.location?.name ?? '', workplace: remote(x.location?.name ?? ''), posted: iso(x.first_published ?? x.updated_at), snippet: strip(x.content).slice(0, 600), tags: ['direct', ...(x.departments ?? []).map((d: any) => d.name)] }));
    }
    case 'lever': case 'lever-eu': {
      const host = e.ats === 'lever-eu' ? 'api.eu.lever.co' : 'api.lever.co';
      const j = await getJson(`https://${host}/v0/postings/${encodeURIComponent(e.slug)}?mode=json`);
      return (j ?? []).map((x: any) => job(e, { id: x.id, title: x.text, url: x.hostedUrl, location: x.categories?.location ?? '', workplace: x.workplaceType === 'remote' ? 'remote' : x.workplaceType === 'hybrid' ? 'hybrid' : x.workplaceType === 'onsite' ? 'onsite' : remote(x.categories?.location ?? ''), type: x.categories?.commitment ?? '', posted: iso(x.createdAt), snippet: strip(x.descriptionPlain ?? x.description).slice(0, 600), salary: x.salaryRange ? `${x.salaryRange.currency} ${x.salaryRange.min}–${x.salaryRange.max} ${x.salaryRange.interval ?? ''}`.trim() : '', tags: ['direct', x.categories?.team].filter(Boolean) }));
    }
    case 'ashby': {
      const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(e.slug)}?includeCompensation=true`);
      return (j.jobs ?? []).filter((x: any) => x.isListed !== false).map((x: any) => job(e, { id: x.id, title: x.title, url: x.jobUrl, location: x.location ?? '', workplace: x.isRemote ? 'remote' : remote(x.workplaceType ?? x.location ?? ''), type: x.employmentType ?? '', posted: iso(x.publishedAt), salary: x.compensation?.compensationTierSummary ?? '', snippet: strip(x.descriptionPlain ?? x.descriptionHtml).slice(0, 600), tags: ['direct', x.department, x.team].filter(Boolean) }));
    }
    case 'smartrecruiters': {
      const out: Job[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(e.slug)}/postings?limit=100&offset=${offset}`);
        for (const x of j.content ?? []) out.push(job(e, { id: x.id, title: x.name, url: `https://jobs.smartrecruiters.com/${e.slug}/${x.id}`, location: [x.location?.city, x.location?.country?.toUpperCase()].filter(Boolean).join(', '), workplace: x.location?.remote ? 'remote' : x.location?.hybrid ? 'hybrid' : '', type: x.typeOfEmployment?.label ?? '', level: x.experienceLevel?.label ?? '', posted: iso(x.releasedDate) }));
        if ((j.content ?? []).length < 100) break;
      }
      return out;
    }
    case 'workable': {
      const r = await fetchText(`https://apply.workable.com/api/v3/accounts/${encodeURIComponent(e.slug)}/jobs`, { method: 'POST', ua: BOT_UA, timeout: 25000, body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status === 404 ? 'job board not found (check the company name)' : `HTTP ${r.status}`);
      return (JSON.parse(r.text).results ?? []).map((x: any) => job(e, { id: x.shortcode, title: x.title, url: `https://apply.workable.com/${e.slug}/j/${x.shortcode}/`, location: [x.location?.city, x.location?.country].filter(Boolean).join(', '), workplace: x.remote ? 'remote' : x.workplace === 'hybrid' ? 'hybrid' : '', type: x.type ?? '', posted: iso(x.published) }));
    }
    case 'recruitee': {
      const j = await getJson(`https://${e.slug}.recruitee.com/api/offers/`);
      return (j.offers ?? []).map((x: any) => job(e, { id: String(x.id), title: x.title, url: x.careers_url, location: x.location ?? '', workplace: x.remote ? 'remote' : x.hybrid ? 'hybrid' : '', type: x.employment_type_code ?? '', posted: iso(x.published_at ?? x.created_at), snippet: strip(x.description).slice(0, 600), salary: x.salary?.min ? `${x.salary.currency ?? ''} ${x.salary.min}–${x.salary.max} ${x.salary.period ?? ''}`.trim() : '' }));
    }
    case 'personio': {
      const r = await fetchText(`https://${e.host ?? `${e.slug}.jobs.personio.de`}/xml?language=en`, { ua: BOT_UA, timeout: 25000 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tag = (x: string, t: string) => strip(x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') ?? '');
      return [...r.text.matchAll(/<position>([\s\S]*?)<\/position>/g)].map((m) => job(e, { id: tag(m[1], 'id'), title: tag(m[1], 'name'), url: `https://${e.host ?? `${e.slug}.jobs.personio.de`}/job/${tag(m[1], 'id')}`, location: tag(m[1], 'office'), type: tag(m[1], 'schedule'), level: tag(m[1], 'seniority'), posted: iso(tag(m[1], 'createdAt')) }));
    }
    case 'pinpoint': {
      const j = await getJson(`https://${e.slug}.pinpointhq.com/postings.json`);
      return (j.data ?? []).map((x: any) => job(e, { id: String(x.id), title: x.title, url: x.url, location: x.location?.name ?? '', workplace: remote(x.workplace_type ?? ''), type: x.employment_type_text ?? '', salary: x.compensation ?? '', posted: '' }));
    }
    case 'workday': {
      const out: Job[] = [];
      for (let offset = 0; offset < 400; offset += 20) {
        const r = await fetchText(`https://${e.host}/wday/cxs/${e.slug}/${e.site}/jobs`, { method: 'POST', ua: BOT_UA, timeout: 25000, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = JSON.parse(r.text);
        for (const x of j.jobPostings ?? []) out.push(job(e, { id: x.externalPath ?? x.title, title: x.title, url: `https://${e.host}/${e.site}${x.externalPath}`, location: x.locationsText ?? '', workplace: remote(x.locationsText ?? ''), posted: '' }));
        if ((j.jobPostings ?? []).length < 20) break;
      }
      return out;
    }
  }
  throw new Error(`Unknown hiring system ${e.ats}`);
}

/** The latest Hacker News "Ask HN: Who is hiring?" thread, filtered by keywords (QF-097). */
export async function hnHiring(keywords: string): Promise<Job[]> {
  const s = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=1');
  const story = s.hits?.[0];
  if (!story) return [];
  const t = await getJson(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  const words = keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  return (t.children ?? []).filter((c: any) => c.text && (!words.length || words.every((w) => c.text.toLowerCase().includes(w)))).map((c: any) => {
    const text = strip(c.text);
    const head = text.split(/\s\|\s|\n/).map((x: string) => x.trim());
    const parts = text.split('|').map((x: string) => x.trim());
    return { id: `hn:${c.id}`, source: 'Hacker News: Who is hiring', title: parts[1]?.slice(0, 120) || head[0].slice(0, 120), company: parts[0]?.slice(0, 80) ?? '', location: parts.find((p: string) => /remote|onsite|hybrid|[A-Z][a-z]+, [A-Z]{2}/.test(p))?.slice(0, 80) ?? '', workplace: remote(text), type: /contract/i.test(text) ? 'contract' : '', level: '', salary: text.match(/[$€£]\s?\d[\d,.]*k?(\s?[-–]\s?[$€£]?\s?\d[\d,.]*k?)?/)?.[0] ?? '', url: `https://news.ycombinator.com/item?id=${c.id}`, posted: iso(c.created_at), tags: ['direct'], snippet: text.slice(0, 600) } as Job;
  });
}

// ── Salary (QF-109, QF-110) ──
const CUR: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR', 'rs': 'PKR', 'pkr': 'PKR', 'aed': 'AED', 'usd': 'USD', 'gbp': 'GBP', 'eur': 'EUR', 'cad': 'CAD', 'aud': 'AUD', 'inr': 'INR', 'sgd': 'SGD' };
const PER: Record<string, number> = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
/** Parse "£45,000 - £55,000 a year", "$40-50/hr", "USD 120k" into numbers, keeping the original period. */
export function parseSalary(text: string) {
  const t = (text ?? '').toLowerCase().replace(/,/g, '');
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/g)].map((m) => Number(m[1]) * (m[2] === 'k' ? 1000 : m[2] === 'm' ? 1e6 : 1)).filter((n) => n > 0);
  if (!nums.length) return null;
  const cur = Object.entries(CUR).find(([k]) => (k.length === 1 ? t.includes(k) : new RegExp(`\\b${k}\\b`).test(t)))?.[1] ?? '';
  const period = /\b(per |an? |\/ ?)?(hour|hr|hourly)\b/.test(t) ? 'hour' : /\b(day|daily)\b/.test(t) ? 'day' : /\b(week|weekly|wk)\b/.test(t) ? 'week' : /\b(month|monthly|mo|pm)\b/.test(t) ? 'month' : 'year';
  const min = nums[0], max = nums[1] && nums[1] >= nums[0] ? nums[1] : nums[0];
  return { min, max, currency: cur, period, yearlyMin: Math.round(min * PER[period]), yearlyMax: Math.round(max * PER[period]) };
}

/** Text that shows a posting is closed (QF-105). Pure. */
export const CLOSED = /no longer (accepting|available|open)|position (has been )?(filled|closed)|job (is )?(closed|expired|no longer)|this (job|posting|role) (has )?(expired|closed|been removed)|applications? (are )?closed|page (you('re| are) looking for )?(was )?not found/i;
export function postingState(status: number, text: string): { state: 'open' | 'closed' | 'unknown'; why: string } {
  if (status === 404 || status === 410) return { state: 'closed', why: `HTTP ${status}` };
  if (status >= 400) return { state: 'unknown', why: `HTTP ${status}` };
  const m = text.slice(0, 200000).match(CLOSED);
  return m ? { state: 'closed', why: `"${m[0]}"` } : { state: 'open', why: 'Page loads and shows no closed notice' };
}

/** Likely recruiter or staffing agency rather than the employer (QF-111). Pure. */
export const isRecruiter = (company: string) => /\b(recruit\w*|staffing|talent (acquisition|solutions|partners)|search partners|headhunt\w*|personnel|manpower|resourcing|employment agency|jobs? (agency|consult\w*))\b/i.test(company);

// ── Title relevance (multi-word searches) ──
const SYN: Record<string, string[]> = {
  admin: ['admin', 'administrator', 'administration', 'sysadmin', 'sys admin'], administrator: ['admin', 'administrator', 'sysadmin'],
  system: ['system', 'systems', 'sysadmin', 'infrastructure'], systems: ['system', 'systems', 'sysadmin'],
  dev: ['dev', 'developer', 'development', 'engineer'], developer: ['developer', 'dev', 'engineer', 'programmer'], engineer: ['engineer', 'engineering', 'developer'],
  manager: ['manager', 'mgr', 'management', 'lead', 'head'], mgr: ['manager', 'mgr'], sr: ['sr', 'senior'], senior: ['senior', 'sr'], jr: ['jr', 'junior'], junior: ['junior', 'jr'],
  frontend: ['frontend', 'front end', 'front-end'], backend: ['backend', 'back end', 'back-end'], fullstack: ['fullstack', 'full stack', 'full-stack'],
  it: ['it', 'information technology'], hr: ['hr', 'human resources', 'people'], qa: ['qa', 'quality assurance', 'tester', 'test'],
  devops: ['devops', 'dev ops', 'sre', 'site reliability', 'platform'], network: ['network', 'networking', 'noc'], support: ['support', 'helpdesk', 'help desk', 'service desk'],
  marketing: ['marketing', 'marketer', 'growth'], designer: ['designer', 'design'], accountant: ['accountant', 'accounting', 'accounts'],
};
const STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'in', 'at', 'to', 'with', 'job', 'jobs', 'remote']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').split(/[\s/,-]+/).filter(Boolean);
/** How well a job title matches the searched words: 1 = every word (or a synonym) is in the title. Pure. */
export function titleScore(title: string, keywords: string) {
  const t = ` ${words(title).join(' ')} `;
  const want = words(keywords).filter((w) => !STOPWORDS.has(w));
  if (!want.length) return 1;
  let hit = 0;
  for (const w of want) if ((SYN[w] ?? [w]).some((v) => t.includes(` ${v} `) || t.includes(` ${v}s `) || (v.length > 4 && t.includes(v)))) hit++;
  return hit / want.length;
}
/** Local first: 2 = in the chosen city, 1 = in the country, 0.5 = remote, 0 = elsewhere. Pure. */
export function placeScore(location: string, city = '', country = '') {
  const l = location.toLowerCase();
  if (city && l.includes(city.toLowerCase())) return 2;
  if (country && l.includes(country.toLowerCase())) return 1;
  if (/remote|anywhere|worldwide|global/.test(l) || !l) return 0.5;
  return 0;
}
