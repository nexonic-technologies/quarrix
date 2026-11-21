// Career signals (0.24): the job-seeker's radar. A profile search built from the CV runs on a schedule like any
// job alert; its postings, the person's own alerts and new jobs at followed employers become signals, scored against the CV.
import * as db from './db';
import { getCv, keywordMatch, type Cv } from './resume';
import { runAlerts, saveAlert } from './jobstore';

const raw = () => db.raw();
export const RADAR = 'Matches for your profile';
type Radar = { keywords: string; country: string; countryName: string; city: string; edited: boolean };

export function migrate() {
  try { raw().exec('ALTER TABLE job_alerts ADD COLUMN auto INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }
}

/** What the profile radar searches for, from the CV: the first target role, else the title, else the top skills; empty means all jobs. Pure. */
export function radarKeywords(cv: Pick<Cv, 'profile'> | null) {
  if (!cv) return '';
  const p = cv.profile;
  return (p.roles?.[0] || p.title || (p.skills ?? []).slice(0, 2).join(' ')).replace(/[|,–-].*$/, '').trim().slice(0, 60);
}

const row = () => raw().prepare('SELECT * FROM job_alerts WHERE auto > 0 ORDER BY id LIMIT 1').get() as { id: number; query: string; auto: number; last_run: string | null; next_run: string | null; last_error: string; enabled: number } | undefined;

export function radar(): Radar & { id: number | null; lastRun: string | null; nextRun: string | null; error: string; hasCv: boolean } {
  const r = row();
  const q = r ? JSON.parse(r.query) : {};
  return { id: r?.id ?? null, keywords: q.keywords ?? '', country: q.country ?? '', countryName: q.countryName ?? '', city: q.city ?? '', edited: r?.auto === 2, lastRun: r?.last_run ?? null, nextRun: r?.next_run ?? null, error: r?.last_error ?? '', hasCv: !!getCv() };
}

/** Create or refresh the profile radar. Searches the person edited keep their words; otherwise the CV decides. */
export function ensureRadar(edit?: Partial<Radar>) {
  const r = row();
  const cur = r ? JSON.parse(r.query) : {};
  const last = (raw().prepare('SELECT query FROM job_search_log ORDER BY id DESC LIMIT 1').get() as { query: string } | undefined);
  const lastQ = last ? JSON.parse(last.query) : {};
  const edited = edit ? true : r?.auto === 2;
  const query = {
    keywords: edit?.keywords ?? (edited ? cur.keywords ?? '' : radarKeywords(getCv())),
    country: edit?.country ?? cur.country ?? lastQ.country ?? '',
    countryName: edit?.countryName ?? cur.countryName ?? lastQ.countryName ?? '',
    city: edit?.city ?? cur.city ?? '',
    strict: false, maxAgeDays: 30,
  };
  query.keywords = String(query.keywords).trim().slice(0, 60);
  if (r && JSON.stringify({ ...cur }) === JSON.stringify(query) && r.auto === (edited ? 2 : 1)) return r.id;
  if (r) { saveAlert({ id: r.id, name: RADAR, query, every_hours: 6 }); raw().prepare('UPDATE job_alerts SET auto = ? WHERE id = ?').run(edited ? 2 : 1, r.id); return r.id; }
  const id = Number(saveAlert({ name: RADAR, query, every_hours: 6 }).lastInsertRowid);
  raw().prepare('UPDATE job_alerts SET auto = 1 WHERE id = ?').run(id);
  return id;
}

/** Back to the CV's own keywords. */
export function resetRadar() { const r = row(); if (r) raw().prepare('UPDATE job_alerts SET auto = 1 WHERE id = ?').run(r.id); return ensureRadar(); }

/** Is this posting from an employer the person follows? Pure. */
export const isFollowed = (jobId: string, prefixes: string[]) => prefixes.some((p) => jobId.startsWith(p));

export type CareerSignal = { id: string; at: string; isNew: boolean; type: 'match' | 'alert' | 'employer'; level: 'hot' | 'warm' | 'info'; match: number | null; why: string; alert: string; job: any };

/** Level from the CV match score. Pure. */
export const levelOf = (match: number | null): CareerSignal['level'] => (match == null ? 'info' : match >= 70 ? 'hot' : match >= 45 ? 'warm' : 'info');

export function signals(days = 21): CareerSignal[] {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = raw().prepare(`SELECT h.job_id, h.at, h.data, h.seen, a.name, a.auto FROM job_alert_hits h JOIN job_alerts a ON a.id = h.alert_id
    WHERE h.at >= ? AND a.enabled = 1 ORDER BY h.seen ASC, h.at DESC LIMIT 600`).all(since) as { job_id: string; at: string; data: string; seen: number; name: string; auto: number }[];
  const dismissed = new Set((raw().prepare('SELECT job_id FROM career_dismissed').all() as { job_id: string }[]).map((r) => r.job_id));
  // Jobs from followed employers carry the employer's own ID prefix ("greenhouse:stripe:123"); the source name is the company's.
  const followed = (raw().prepare('SELECT ats, slug FROM employers').all() as { ats: string; slug: string }[]).map((e) => `${e.ats}:${e.slug}:`);
  const seen = new Set<string>();
  const items: CareerSignal[] = [];
  for (const r of rows) {
    if (seen.has(r.job_id) || dismissed.has(r.job_id)) continue;
    seen.add(r.job_id);
    let job: any; try { job = JSON.parse(r.data); } catch { continue; }
    if (!job?.title) continue;
    items.push({ id: r.job_id, at: r.at, isNew: !r.seen, type: isFollowed(String(job.id ?? r.job_id), followed) ? 'employer' : r.auto ? 'match' : 'alert', level: 'info', match: null, why: '', alert: r.name, job });
  }
  const cv = getCv();
  if (cv) {
    const m = keywordMatch(cv, items.map((i) => i.job));
    for (const i of items) { i.match = m[i.id]?.match ?? null; i.why = m[i.id]?.why ?? ''; }
  }
  // A new posting at an employer the person follows is at least warm.
  for (const i of items) { i.level = levelOf(i.match); if (i.type === 'employer' && i.level === 'info') i.level = 'warm'; }
  const rank = { hot: 0, warm: 1, info: 2 };
  return items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || rank[a.level] - rank[b.level] || b.at.localeCompare(a.at)).slice(0, 300);
}

export function dismiss(jobId: string) {
  raw().prepare('INSERT OR IGNORE INTO career_dismissed (job_id, at) VALUES (?, ?)').run(String(jobId), db.now());
}
export const markSeen = () => raw().prepare('UPDATE job_alert_hits SET seen = 1 WHERE seen = 0').run();
/** Unread job signals: distinct postings, not dismissed, from enabled alerts, in the same window the screen shows. */
export const unseenCount = (days = 21) => (raw().prepare(`SELECT COUNT(DISTINCT h.job_id) n FROM job_alert_hits h JOIN job_alerts a ON a.id = h.alert_id
  WHERE h.seen = 0 AND a.enabled = 1 AND h.at >= ? AND h.job_id NOT IN (SELECT job_id FROM career_dismissed)`).get(new Date(Date.now() - days * 864e5).toISOString()) as { n: number }).n;

/** Scan now: refresh the radar from the CV, then run every alert. */
export async function scan() { ensureRadar(); return runAlerts(true); }

export function migrateTables() {
  raw().exec('CREATE TABLE IF NOT EXISTS career_dismissed (job_id TEXT PRIMARY KEY, at TEXT NOT NULL)');
  migrate();
}
