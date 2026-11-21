// Job hunt memory (phase 6): followed employers, first/last seen dates and repost detection (QF-106, QF-112),
// saved searches with alerts (QF-107), link checks (QF-105) and exports (QF-113).
import { writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import Papa from 'papaparse';
import * as db from './db';
import { detectAts, employerJobs, isRecruiter, parseSalary, placeScore, postingState, titleScore, type Employer } from './ats';
import { cityCountry, cityPoint, searchJobs, type Job, type JobQuery } from './jobsearch';
import { distanceKm } from './geo';
import { countryCode } from './util';
import { load } from './settings';
import { csvSafe, fetchScope, fetchText, UA } from './util';

const raw = () => db.raw();
const now = () => db.now();

export function migrate() {
  raw().exec(`
    CREATE TABLE IF NOT EXISTS job_seen (id TEXT PRIMARY KEY, key TEXT NOT NULL, source TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, posted TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', checked_at TEXT);
    CREATE INDEX IF NOT EXISTS job_seen_key ON job_seen(key);
    CREATE TABLE IF NOT EXISTS employers (id INTEGER PRIMARY KEY, ats TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, host TEXT NOT NULL DEFAULT '', site TEXT NOT NULL DEFAULT '', added_at TEXT NOT NULL, last_run TEXT, last_count INTEGER, error TEXT NOT NULL DEFAULT '', UNIQUE (ats, slug));
    CREATE TABLE IF NOT EXISTS job_search_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, query TEXT NOT NULL, results INTEGER NOT NULL, errors TEXT NOT NULL, ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS job_alerts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, query TEXT NOT NULL, every_hours INTEGER NOT NULL DEFAULT 12, enabled INTEGER NOT NULL DEFAULT 1, last_run TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS job_alert_hits (alert_id INTEGER NOT NULL REFERENCES job_alerts(id) ON DELETE CASCADE, job_id TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (alert_id, job_id));
  `);
  // 0.22: alert scheduling, retries and per-source baselines.
  for (const c of ['next_run TEXT', 'fails INTEGER NOT NULL DEFAULT 0', "last_error TEXT NOT NULL DEFAULT ''", 'last_ok TEXT', "base_sources TEXT NOT NULL DEFAULT '[]'"]) {
    try { raw().exec(`ALTER TABLE job_alerts ADD COLUMN ${c}`); } catch { /* already there */ }
  }
  // Alerts that already ran: every source that produced hits is already baselined.
  for (const a of raw().prepare("SELECT id FROM job_alerts WHERE last_run IS NOT NULL AND base_sources = '[]'").all() as { id: number }[]) {
    const src = (raw().prepare("SELECT DISTINCT json_extract(data, '$.source') s FROM job_alert_hits WHERE alert_id = ?").all(a.id) as { s: string | null }[]).map((r) => r.s).filter(Boolean);
    if (src.length) raw().prepare('UPDATE job_alerts SET base_sources = ? WHERE id = ?').run(JSON.stringify(src), a.id);
  }
}

// ── Followed employers (QF-091 to QF-096, QF-104) ──
export const listEmployers = () => raw().prepare('SELECT * FROM employers ORDER BY name').all() as (Employer & { id: number; last_count: number | null; error: string; last_run: string | null })[];
export async function addEmployer(link: string) {
  const e = detectAts(link);
  if (!e || !e.slug) throw new Error('Could not recognise the hiring system. Paste a link to the company\'s jobs page on Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, Pinpoint or Workday.');
  const jobs = await employerJobs(e); // proves the board exists before saving it
  raw().prepare('INSERT INTO employers (ats, slug, name, host, site, added_at, last_run, last_count, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ats, slug) DO UPDATE SET last_run = excluded.last_run, last_count = excluded.last_count, error = excluded.error')
    .run(e.ats, e.slug, e.name, e.host ?? '', e.site ?? '', now(), now(), jobs.length, (jobs as Job[] & { partialReason?: string }).partialReason ?? '');
  return { ...e, jobs: jobs.length };
}
export const removeEmployer = (id: number) => raw().prepare('DELETE FROM employers WHERE id = ?').run(id);
/** All followed employers' open roles that match the keywords. */
export async function followedJobs(keywords: string): Promise<Job[]> {
  const words = keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const out: Job[] = [];
  await Promise.all(listEmployers().map(async (e) => {
    try {
      const jobs = await employerJobs(e);
      raw().prepare('UPDATE employers SET last_run = ?, last_count = ?, error = ? WHERE id = ?').run(now(), jobs.length, (jobs as Job[] & { partialReason?: string }).partialReason ?? '', e.id);
      out.push(...jobs.filter((j) => !words.length || words.some((w) => `${j.title} ${j.tags.join(' ')}`.toLowerCase().includes(w))));
    } catch (err: any) { raw().prepare('UPDATE employers SET last_run = ?, error = ? WHERE id = ?').run(now(), String(err.message ?? err).slice(0, 200), e.id); }
  }));
  return out;
}

// ── Seen dates, reposts, age (QF-106, QF-112) ──
const keyOf = (j: Job) => `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
export type Annotated = Job & { firstSeen: string; lastSeen: string; isNew: boolean; repost: boolean; ageDays: number | null; salaryYearly?: { min: number; max: number; currency: string; period: string } | null; recruiter: boolean };
export function annotate(jobs: Job[]): Annotated[] {
  const t = now();
  const get = raw().prepare('SELECT * FROM job_seen WHERE id = ?');
  const others = raw().prepare('SELECT COUNT(*) n FROM job_seen WHERE key = ? AND id <> ? AND first_seen < ?');
  const put = raw().prepare('INSERT INTO job_seen (id, key, source, first_seen, last_seen, posted, url) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, posted = CASE WHEN excluded.posted <> \'\' THEN excluded.posted ELSE posted END');
  return raw().transaction(() => jobs.map((j) => {
    const prev = get.get(j.id) as any;
    const k = keyOf(j);
    const repost = !prev && (others.get(k, j.id, new Date(Date.now() - 7 * 864e5).toISOString()) as { n: number }).n > 0;
    put.run(j.id, k, j.source, prev?.first_seen ?? t, t, j.posted ?? '', j.url ?? '');
    const s = j.salary ? parseSalary(j.salary) : null;
    const posted = j.posted || prev?.first_seen || '';
    return { ...j, firstSeen: prev?.first_seen ?? t, lastSeen: t, isNew: !prev, repost, ageDays: posted ? Math.floor((Date.now() - Date.parse(posted)) / 864e5) : null, salaryYearly: s ? { min: s.yearlyMin, max: s.yearlyMax, currency: s.currency, period: s.period } : null, recruiter: isRecruiter(j.company) };
  }))();
}

/** Light annotation for streaming batches (no database writes). */
const annotateLight = (jobs: Job[]): Annotated[] => jobs.map((j) => ({ ...j, firstSeen: '', lastSeen: '', isNew: false, repost: false, ageDays: j.posted ? Math.floor((Date.now() - Date.parse(j.posted)) / 864e5) : null, salaryYearly: null, recruiter: isRecruiter(j.company) }));

// ── Recent job searches ──
function logSearch(q: Record<string, any>, results: number, errors: string[], ms: number) {
  raw().prepare('INSERT INTO job_search_log (at, query, results, errors, ms) VALUES (?, ?, ?, ?, ?)').run(now(), JSON.stringify(q), results, JSON.stringify(errors), ms);
  raw().prepare('DELETE FROM job_search_log WHERE id NOT IN (SELECT id FROM job_search_log ORDER BY id DESC LIMIT 50)').run();
}
export const recentSearches = () => (raw().prepare('SELECT * FROM job_search_log ORDER BY id DESC LIMIT 20').all() as any[]).map((r) => ({ ...r, query: JSON.parse(r.query), errors: JSON.parse(r.errors) }));
export const clearSearches = () => raw().prepare('DELETE FROM job_search_log').run();

export type JobFilters = { strict?: boolean; radiusKm?: number; onlyNew?: boolean; salaryMin?: number; hideRecruiters?: boolean; hideCompanies?: string[]; preferCompanies?: string[]; hideReposts?: boolean; maxAgeDays?: number };
/** Search every board plus followed employers and HN, then mark new, reposted and old postings, and apply the extra filters. */
const stopRequests = new Map<number, () => void>();
/** Stop a running search: it returns at once with what the boards that already answered found. */
export function stopSearch(runId: number) { stopRequests.get(runId)?.(); }

export async function searchAll(q: JobQuery & JobFilters, onBatch: (b: { source: string; jobs: Annotated[]; error: string; ms: number }) => void = () => undefined, runId = 0) {
  const started = Date.now();
  const strictOk = (j: Job) => q.strict === false || titleScore(j.title, q.keywords) >= 0.66; // two words: both; three: two of three
  // Jobs in other countries are left out when a country is chosen (remote jobs that name no country stay).
  const placeOk = (j: Job) => jobCountryOk(j.location, q.country ?? '');
  const sofar: Job[] = [], failed: string[] = [];
  let stopped = false;
  // Stop cancels the requests still in flight (0.25), not only the wait for them.
  const ctrl = new AbortController();
  const stop = new Promise<{ jobs: Job[]; errors: string[] }>((res) => { if (runId) stopRequests.set(runId, () => { stopped = true; ctrl.abort(); res({ jobs: [...sofar], errors: [...failed, 'Stopped: the boards that had not answered yet were skipped.'] }); }); });
  const search = fetchScope.run(ctrl.signal, () => searchJobs(q, (source, list, error, ms) => {
    if (stopped) return;
    sofar.push(...list); if (error) failed.push(`${source}: ${error}`);
    onBatch({ source, jobs: annotateLight(list.filter((j) => strictOk(j) && placeOk(j))), error, ms });
  }));
  const { jobs, errors } = await Promise.race([search, stop]).finally(() => stopRequests.delete(runId));
  const s = load();
  const hide = [...(q.hideCompanies ?? []), ...(s.jobs?.hideCompanies ?? [])].map((x) => x.toLowerCase().trim()).filter(Boolean);
  const prefer = [...(q.preferCompanies ?? []), ...(s.jobs?.preferCompanies ?? [])].map((x) => x.toLowerCase().trim()).filter(Boolean);
  // Distance filter (QF-110): job locations are free text, so the first part that names a known city is used.
  const centre = q.radiusKm && q.city ? cityPoint(q.city, q.country) : null;
  const near = (j: Job) => {
    if (!centre || j.workplace === 'remote' || /remote|anywhere|worldwide/i.test(j.location)) return true;
    return jobDistanceOk(j.location, centre, q.radiusKm!, q.country ?? '');
  };
  const list = annotate(jobs).filter((j) => {
    if (!strictOk(j)) return false;
    if (!placeOk(j)) return false;
    if (!near(j)) return false;
    if (q.onlyNew && !j.isNew) return false;
    if (q.hideReposts && j.repost) return false;
    if ((q.hideRecruiters ?? s.jobs?.hideRecruiters) && j.recruiter) return false;
    if (hide.some((h) => j.company.toLowerCase().includes(h))) return false;
    if (q.salaryMin && j.salaryYearly && j.salaryYearly.max < q.salaryMin) return false;
    if (q.maxAgeDays && j.ageDays != null && j.ageDays > q.maxAgeDays) return false;
    return true;
  });
  const pref = (j: Job) => (prefer.some((p) => j.company.toLowerCase().includes(p)) ? 1 : 0);
  // Best title match first, then local before remote, then preferred employers, direct postings and newest.
  const rank = (j: Job) => titleScore(j.title, q.keywords) * 10 + placeScore(j.location, q.city, q.countryName) * 2 + pref(j) * 3 + Number(j.tags.includes('direct'));
  list.sort((a, b) => rank(b) - rank(a) || (b.posted || b.firstSeen).localeCompare(a.posted || a.firstSeen));
  logSearch(q, list.length, errors, Date.now() - started);
  return { jobs: list, errors };
}

// ── Link checks (QF-105) ──
export async function checkPosting(url: string) {
  if (!/^https?:\/\//i.test(url)) return { state: 'unknown', why: 'Not a web link' };
  const r = await fetchText(url, { ua: UA, timeout: 20000, maxBytes: 1_500_000 }).catch((e) => ({ status: 0, text: '', err: String(e.message ?? e) } as any));
  const res = r.status ? postingState(r.status, r.text) : { state: 'unknown' as const, why: r.err ?? 'Could not load' };
  raw().prepare('UPDATE job_seen SET state = ?, checked_at = ? WHERE url = ?').run(res.state, now(), url);
  return { ...res, finalUrl: r.url ?? url };
}

// ── Alerts (QF-107) ──
export const listAlerts = () => raw().prepare('SELECT a.*, (SELECT COUNT(*) FROM job_alert_hits h WHERE h.alert_id = a.id AND h.seen = 0) unseen FROM job_alerts a ORDER BY id DESC').all();
export function saveAlert(a: { id?: number; name: string; query: unknown; every_hours?: number; enabled?: boolean }) {
  const hours = Math.min(168, Math.max(1, Number(a.every_hours) || 12));
  // Changing the search starts a fresh baseline, so the old results are not reported as new.
  if (a.id) return raw().prepare("UPDATE job_alerts SET name = ?, every_hours = ?, enabled = ?, next_run = NULL, fails = 0, base_sources = CASE WHEN query = ? THEN base_sources ELSE '[]' END, query = ? WHERE id = ?").run(String(a.name).slice(0, 80), hours, a.enabled === false ? 0 : 1, JSON.stringify(a.query), JSON.stringify(a.query), a.id);
  return raw().prepare('INSERT INTO job_alerts (name, query, every_hours, created_at) VALUES (?, ?, ?, ?)').run(a.name.slice(0, 80), JSON.stringify(a.query), hours, now());
}
export const deleteAlert = (id: number) => raw().prepare('DELETE FROM job_alerts WHERE id = ?').run(id);
export const alertHits = (id: number) => (raw().prepare('SELECT * FROM job_alert_hits WHERE alert_id = ? ORDER BY at DESC LIMIT 200').all(id) as any[]).map((h) => ({ ...JSON.parse(h.data), at: h.at, seen: !!h.seen }));
export const markAlertSeen = (id: number) => raw().prepare('UPDATE job_alert_hits SET seen = 1 WHERE alert_id = ?').run(id);
let alertBusy = false;
type AlertRow = { id: number; name: string; query: string; every_hours: number; next_run: string | null; last_run: string | null; fails: number; base_sources: string };
/** Is the alert due? Pure. */
export const alertDue = (a: Pick<AlertRow, 'next_run' | 'last_run' | 'every_hours'>, nowMs: number) =>
  a.next_run ? Date.parse(a.next_run) <= nowMs : !a.last_run || nowMs - Date.parse(a.last_run) >= a.every_hours * 36e5;
/**
 * What a run means for the alert. Pure, exported for tests.
 * - A run where every board failed is a failure: nothing is recorded, and it is retried after 15, 30, 60… minutes (never later than the normal schedule).
 * - The first time a board answers, its current postings are recorded as already seen (its baseline), so a board that was down
 *   earlier never floods the alert with old postings. Only postings from already-baselined boards count as new.
 * - The next run is planned from the time this run was due, not from when it finished, so the schedule does not drift.
 */
export function alertOutcome(a: Pick<AlertRow, 'every_hours' | 'fails' | 'base_sources' | 'next_run'>, r: { jobs: { id: string; source: string }[]; errors: string[] }, nowMs: number) {
  const every = a.every_hours * 36e5;
  if (!r.jobs.length && r.errors.length) {
    const fails = a.fails + 1;
    const wait = Math.min(every, 15 * 60_000 * 2 ** Math.min(fails - 1, 8));
    return { failed: true, fails, error: r.errors.slice(0, 3).join('; ').slice(0, 300), nextRun: new Date(nowMs + wait).toISOString(), fresh: [] as string[], baseline: [] as string[], baseSources: JSON.parse(a.base_sources || '[]') as string[] };
  }
  const known = new Set<string>(JSON.parse(a.base_sources || '[]'));
  const fresh: string[] = [], baseline: string[] = [];
  for (const j of r.jobs) (known.has(j.source) ? fresh : baseline).push(j.id);
  for (const j of r.jobs) known.add(j.source);
  let next = a.next_run ? Date.parse(a.next_run) : nowMs;
  if (!Number.isFinite(next) || a.fails) next = nowMs;
  while (next <= nowMs) next += every;
  return { failed: false, fails: 0, error: r.errors.length ? `Some boards failed: ${r.errors.slice(0, 3).join('; ')}`.slice(0, 300) : '', nextRun: new Date(next).toISOString(), fresh, baseline, baseSources: [...known] };
}

/** Run alerts that are due; returns [alert name, new jobs] for notifications. */
export async function runAlerts(force = false): Promise<[string, number][]> {
  if (alertBusy) { if (force) throw new Error('Alerts are already running. Try again in a minute.'); return []; }
  alertBusy = true;
  const out: [string, number][] = [];
  try {
    for (const a of raw().prepare('SELECT * FROM job_alerts WHERE enabled = 1').all() as AlertRow[]) {
      if (!force && !alertDue(a, Date.now())) continue;
      let q: any;
      try { q = JSON.parse(a.query); } catch { raw().prepare("UPDATE job_alerts SET last_error = 'The saved search is damaged; edit and save the alert again.', enabled = 0 WHERE id = ?").run(a.id); continue; }
      const res = await searchAll(q).catch((e: any) => ({ jobs: [] as Annotated[], errors: [String(e?.message ?? e)] }));
      const o = alertOutcome(a, res, Date.now());
      raw().prepare('UPDATE job_alerts SET last_run = ?, next_run = ?, fails = ?, last_error = ?, base_sources = ?, last_ok = CASE WHEN ? THEN last_ok ELSE ? END WHERE id = ?')
        .run(now(), o.nextRun, o.fails, o.error, JSON.stringify(o.baseSources), o.failed ? 1 : 0, now(), a.id);
      if (o.failed) continue;
      const byId = new Map(res.jobs.map((j) => [j.id, j]));
      const ins = raw().prepare('INSERT OR IGNORE INTO job_alert_hits (alert_id, job_id, at, data, seen) VALUES (?, ?, ?, ?, ?)');
      let n = 0;
      raw().transaction(() => {
        for (const id of o.baseline) ins.run(a.id, id, now(), JSON.stringify(byId.get(id)), 1);
        for (const id of o.fresh) n += ins.run(a.id, id, now(), JSON.stringify(byId.get(id)), 0).changes;
      })();
      if (n) out.push([a.name, n]);
    }
  } finally { alertBusy = false; }
  return out;
}

// ── Exports (QF-113) ──
export function exportSaved(path: string) {
  const rows = db.savedJobs().map((j: any) => ({ Title: j.title, Company: j.company, Location: j.location, Status: j.status ?? 'Saved', Salary: j.salary, Source: j.source, Posted: j.posted, Link: j.url, Notes: j.studio?.notes ?? j.notes ?? '', Deadline: j.studio?.deadline ?? '', Interview: j.studio?.interview ?? '', FollowUp: j.studio?.followUp ?? '', NextAction: j.studio?.nextAction ?? '' }));
  const ext = extname(path).toLowerCase();
  if (ext === '.json') writeFileSync(path, JSON.stringify(rows, null, 2));
  else if (ext === '.md') writeFileSync(path, ['# My applications', '', '| Title | Company | Location | Status | Salary | Link | Deadline | Interview | Follow-up | Next action | Notes |', '|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${[r.Title, r.Company, r.Location, r.Status, r.Salary, r.Link, r.Deadline, r.Interview, r.FollowUp, r.NextAction, r.Notes].map((v) => String(v ?? '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ')).join(' | ')} |`)].join('\n'));
  else writeFileSync(path, '﻿' + Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])))));
  return rows.length;
}

/**
 * Distance check for a free-text job location (QF-110). Country names are skipped, a country named in the text
 * overrides the searched country, and the first part that is a known city decides. Unknown places are kept.
 */
/**
 * Is the job in the searched country? A job that names another country, or a city that is only in another country,
 * is left out; remote jobs that name no country and places that can't be recognised are kept. Pure apart from the
 * offline city list. Exported for tests.
 */
export function jobCountryOk(location: string, searchCountry: string) {
  if (!searchCountry) return true;
  const parts = location.split(/[,·|/()]|\s-\s/).map((x) => x.replace(/\b(remote|hybrid|on-?site|district|division|city|metropolitan area|area|tehsil|greater)\b/gi, '').trim()).filter((x) => x.length > 2);
  // Names that are both a country and a US state or region are accepted for either.
  const both: Record<string, string[]> = { georgia: ['GE', 'US'], jersey: ['JE', 'US'], 'new mexico': ['US'], 'punjab': ['PK', 'IN'] };
  for (const p of parts) { const b = both[p.toLowerCase()]; if (b) return b.includes(searchCountry); const c = countryCode(p); if (c) return c === searchCountry; }
  for (const p of parts) { const c = cityCountry(p, searchCountry); if (c) return c === searchCountry; }
  return true;
}

export function jobDistanceOk(location: string, centre: { lat: number; lon: number }, km: number, searchCountry: string) {
  const parts = location.split(/[,·|/]|\s-\s/).map((x) => x.replace(/\b(district|division|city|metropolitan area|area|tehsil)\b/gi, '').trim()).filter(Boolean);
  const named = parts.map((p) => countryCode(p)).find(Boolean);
  if (named && searchCountry && named !== searchCountry) return false;
  for (const part of parts) {
    if (countryCode(part)) continue;
    const p = cityPoint(part, named || searchCountry, !!(named || searchCountry));
    if (p) return distanceKm(centre, p) <= km;
  }
  return true;
}
