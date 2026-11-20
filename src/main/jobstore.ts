// Job hunt memory (phase 6): followed employers, first/last seen dates and repost detection (QF-106, QF-112),
// saved searches with alerts (QF-107), link checks (QF-105) and exports (QF-113).
import { writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import Papa from 'papaparse';
import * as db from './db';
import { detectAts, employerJobs, isRecruiter, parseSalary, placeScore, postingState, titleScore, type Employer } from './ats';
import { cityPoint, searchJobs, type Job, type JobQuery } from './jobsearch';
import { distanceKm } from './geo';
import { load } from './settings';
import { csvSafe, fetchText, UA } from './util';

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
}

// ── Followed employers (QF-091 to QF-096, QF-104) ──
export const listEmployers = () => raw().prepare('SELECT * FROM employers ORDER BY name').all() as (Employer & { id: number; last_count: number | null; error: string; last_run: string | null })[];
export async function addEmployer(link: string) {
  const e = detectAts(link);
  if (!e || !e.slug) throw new Error('Could not recognise the hiring system. Paste a link to the company\'s jobs page on Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, Pinpoint or Workday.');
  const jobs = await employerJobs(e); // proves the board exists before saving it
  raw().prepare('INSERT INTO employers (ats, slug, name, host, site, added_at, last_run, last_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ats, slug) DO UPDATE SET last_run = excluded.last_run, last_count = excluded.last_count, error = \'\'')
    .run(e.ats, e.slug, e.name, e.host ?? '', e.site ?? '', now(), now(), jobs.length);
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
      raw().prepare('UPDATE employers SET last_run = ?, last_count = ?, error = \'\' WHERE id = ?').run(now(), jobs.length, e.id);
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
export async function searchAll(q: JobQuery & JobFilters, onBatch: (b: { source: string; jobs: Annotated[]; error: string; ms: number }) => void = () => undefined) {
  const started = Date.now();
  const strictOk = (j: Job) => q.strict === false || titleScore(j.title, q.keywords) >= 0.66; // two words: both; three: two of three
  const { jobs, errors } = await searchJobs(q, (source, list, error, ms) => onBatch({ source, jobs: annotateLight(list.filter(strictOk)), error, ms }));
  const s = load();
  const hide = [...(q.hideCompanies ?? []), ...(s.jobs?.hideCompanies ?? [])].map((x) => x.toLowerCase().trim()).filter(Boolean);
  const prefer = [...(q.preferCompanies ?? []), ...(s.jobs?.preferCompanies ?? [])].map((x) => x.toLowerCase().trim()).filter(Boolean);
  // Distance filter (QF-110): job locations are free text, so the first part that names a known city is used.
  const centre = q.radiusKm && q.city ? cityPoint(q.city, q.country) : null;
  const near = (j: Job) => {
    if (!centre || j.workplace === 'remote' || /remote|anywhere|worldwide/i.test(j.location)) return true;
    const p = j.location.split(/[,·|/-]/).map((x) => x.trim()).filter(Boolean).map((x) => cityPoint(x, q.country)).find(Boolean);
    return !p || distanceKm(centre, p) <= q.radiusKm!;
  };
  const list = annotate(jobs).filter((j) => {
    if (!strictOk(j)) return false;
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
  if (a.id) return raw().prepare('UPDATE job_alerts SET name = ?, query = ?, every_hours = ?, enabled = ? WHERE id = ?').run(a.name, JSON.stringify(a.query), hours, a.enabled === false ? 0 : 1, a.id);
  return raw().prepare('INSERT INTO job_alerts (name, query, every_hours, created_at) VALUES (?, ?, ?, ?)').run(a.name.slice(0, 80), JSON.stringify(a.query), hours, now());
}
export const deleteAlert = (id: number) => raw().prepare('DELETE FROM job_alerts WHERE id = ?').run(id);
export const alertHits = (id: number) => (raw().prepare('SELECT * FROM job_alert_hits WHERE alert_id = ? ORDER BY at DESC LIMIT 200').all(id) as any[]).map((h) => ({ ...JSON.parse(h.data), at: h.at, seen: !!h.seen }));
export const markAlertSeen = (id: number) => raw().prepare('UPDATE job_alert_hits SET seen = 1 WHERE alert_id = ?').run(id);
let alertBusy = false;
/** Run alerts that are due; returns [alert name, new jobs] for notifications. */
export async function runAlerts(force = false): Promise<[string, number][]> {
  if (alertBusy) return [];
  alertBusy = true;
  const out: [string, number][] = [];
  try {
    for (const a of raw().prepare('SELECT * FROM job_alerts WHERE enabled = 1').all() as any[]) {
      if (!force && a.last_run && Date.now() - Date.parse(a.last_run) < a.every_hours * 36e5) continue;
      raw().prepare('UPDATE job_alerts SET last_run = ? WHERE id = ?').run(now(), a.id);
      const { jobs } = await searchAll(JSON.parse(a.query)).catch(() => ({ jobs: [] as Annotated[] }));
      const ins = raw().prepare('INSERT OR IGNORE INTO job_alert_hits (alert_id, job_id, at, data, seen) VALUES (?, ?, ?, ?, ?)');
      // The first run only records what exists, so the alert reports postings that appear after it was set up.
      const first = !a.last_run;
      let n = 0;
      raw().transaction(() => { for (const j of jobs) n += ins.run(a.id, j.id, now(), JSON.stringify(j), first ? 1 : 0).changes; })();
      if (!first && n) out.push([a.name, n]);
    }
  } finally { alertBusy = false; }
  return out;
}

// ── Exports (QF-113) ──
export function exportSaved(path: string) {
  const rows = db.savedJobs().map((j: any) => ({ Title: j.title, Company: j.company, Location: j.location, Status: j.status ?? 'Saved', Salary: j.salary, Source: j.source, Posted: j.posted, Link: j.url, Notes: j.notes ?? '' }));
  const ext = extname(path).toLowerCase();
  if (ext === '.json') writeFileSync(path, JSON.stringify(rows, null, 2));
  else if (ext === '.md') writeFileSync(path, ['# My applications', '', '| Title | Company | Location | Status | Salary | Link |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${[r.Title, r.Company, r.Location, r.Status, r.Salary, r.Link].map((v) => String(v ?? '').replace(/\|/g, '/')).join(' | ')} |`)].join('\n'));
  else writeFileSync(path, '﻿' + Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])))));
  return rows.length;
}
