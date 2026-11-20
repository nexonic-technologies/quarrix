// Local SQLite database: everything stays on this computer.
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

export type Lead = {
  id: number; created_at: string; updated_at: string;
  name: string; category: string; address: string; city: string; region: string; country: string; postcode: string;
  lat: number | null; lon: number | null;
  phone: string; email: string; emails: string; website: string; domain: string; socials: string;
  rating: number | null; reviews: number | null;
  source: string; source_ref: string; search_id: number | null;
  status: string; score: number | null; audit: string; tags: string; notes: string;
  enriched_at: string | null;
  contact_name: string; contact_role: string; email_status: string; summary: string; fit: number | null; needs: string;
};

export const STATUSES = ['new', 'contacted', 'replied', 'interested', 'won', 'lost', 'do_not_contact'] as const;

let db: Database.Database;

export function openDb(file = join(app.getPath('userData'), 'quarrix.db')) {
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, category TEXT NOT NULL, place TEXT NOT NULL,
    sources TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', found INTEGER NOT NULL DEFAULT 0,
    added INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', finished_at TEXT
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
    postcode TEXT NOT NULL DEFAULT '', lat REAL, lon REAL,
    phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', emails TEXT NOT NULL DEFAULT '[]',
    website TEXT NOT NULL DEFAULT '', domain TEXT NOT NULL DEFAULT '', socials TEXT NOT NULL DEFAULT '{}',
    rating REAL, reviews INTEGER, source TEXT NOT NULL DEFAULT '', source_ref TEXT NOT NULL DEFAULT '',
    search_id INTEGER, status TEXT NOT NULL DEFAULT 'new', score INTEGER, audit TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', enriched_at TEXT
  );
  CREATE INDEX IF NOT EXISTS leads_domain ON leads(domain);
  CREATE INDEX IF NOT EXISTS leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS leads_ref ON leads(source, source_ref);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'email', step INTEGER NOT NULL DEFAULT 0, subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', due_at TEXT, sent_at TEXT,
    message_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_due ON messages(status, due_at);
  CREATE TABLE IF NOT EXISTS suppress (value TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, lead_id INTEGER, at TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
    places TEXT NOT NULL DEFAULT '[]', sources TEXT NOT NULL DEFAULT '[]', daily INTEGER NOT NULL DEFAULT 20,
    auto_send INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, cursor INTEGER NOT NULL DEFAULT 0, last_run TEXT
  );
  CREATE TABLE IF NOT EXISTS saved_jobs (id TEXT PRIMARY KEY, at TEXT NOT NULL, data TEXT NOT NULL);`);
  // Columns added after 0.3: decision maker, email check result and a short summary.
  for (const [t, c] of [['leads', "contact_name TEXT NOT NULL DEFAULT ''"], ['leads', "contact_role TEXT NOT NULL DEFAULT ''"], ['leads', "email_status TEXT NOT NULL DEFAULT ''"], ['leads', "summary TEXT NOT NULL DEFAULT ''"], ['searches', 'campaign_id INTEGER'], ['leads', 'fit INTEGER'], ['campaigns', 'proof INTEGER NOT NULL DEFAULT 1'], ['leads', "needs TEXT NOT NULL DEFAULT ''"]]) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* already there */ }
  }
  return db;
}

export const now = () => new Date().toISOString();
export const raw = () => db;

/* ---------- Leads ---------- */

const LEAD_COLS = ['name', 'category', 'address', 'city', 'region', 'country', 'postcode', 'lat', 'lon', 'phone', 'email', 'emails', 'website', 'domain', 'socials', 'rating', 'reviews', 'source', 'source_ref', 'search_id', 'status', 'score', 'audit', 'tags', 'notes', 'enriched_at', 'contact_name', 'contact_role', 'email_status', 'summary', 'fit', 'needs'];

export function findDuplicate(l: Partial<Lead>): Lead | undefined {
  if (l.source && l.source_ref) {
    const hit = db.prepare('SELECT * FROM leads WHERE source = ? AND source_ref = ?').get(l.source, l.source_ref) as Lead | undefined;
    if (hit) return hit;
  }
  if (l.domain) {
    const hit = db.prepare('SELECT * FROM leads WHERE domain = ? LIMIT 1').get(l.domain) as Lead | undefined;
    if (hit) return hit;
  }
  if (l.phone && l.name) {
    return db.prepare('SELECT * FROM leads WHERE phone = ? AND lower(name) = lower(?) LIMIT 1').get(l.phone, l.name) as Lead | undefined;
  }
  return undefined;
}

/** Insert, or fill the empty fields of the matching lead. Returns [id, created]. */
export function upsertLead(l: Partial<Lead>): [number, boolean] {
  const dup = findDuplicate(l);
  if (dup) {
    const patch: Record<string, unknown> = {};
    for (const k of LEAD_COLS) {
      const v = (l as Record<string, unknown>)[k];
      const cur = (dup as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== '' && (cur === null || cur === '' || cur === '[]' || cur === '{}')) patch[k] = v;
    }
    if (Object.keys(patch).length) updateLead(dup.id, patch);
    return [dup.id, false];
  }
  const t = now();
  const cols = LEAD_COLS.filter((k) => (l as Record<string, unknown>)[k] !== undefined);
  const info = db
    .prepare(`INSERT INTO leads (created_at, updated_at, ${cols.join(',')}) VALUES (?, ?, ${cols.map(() => '?').join(',')})`)
    .run(t, t, ...cols.map((k) => (l as Record<string, unknown>)[k] as never));
  return [Number(info.lastInsertRowid), true];
}

export function updateLead(id: number, patch: Record<string, unknown>) {
  const cols = Object.keys(patch).filter((k) => LEAD_COLS.includes(k));
  if (!cols.length) return;
  db.prepare(`UPDATE leads SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => patch[c] as never), now(), id);
}

export const getLead = (id: number) => db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Lead | undefined;

export type LeadQuery = { shortlist?: boolean; q?: string; status?: string; country?: string; category?: string; hasEmail?: boolean; hasPhone?: boolean; hasWebsite?: boolean; searchId?: number; sort?: string; limit?: number; offset?: number; ids?: number[] };

export function queryLeads(f: LeadQuery) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.q) {
    where.push('(name LIKE ? OR city LIKE ? OR category LIKE ? OR email LIKE ? OR domain LIKE ? OR phone LIKE ? OR tags LIKE ? OR contact_name LIKE ?)');
    const like = `%${f.q}%`;
    args.push(like, like, like, like, like, like, like, like);
  }
  if (f.status) { where.push('status = ?'); args.push(f.status); }
  if (f.country) { where.push('country = ?'); args.push(f.country); }
  if (f.category) { where.push('category = ?'); args.push(f.category); }
  if (f.hasEmail) where.push("email <> ''");
  if (f.hasPhone) where.push("phone <> ''");
  if (f.hasWebsite) where.push("website <> ''");
  if (f.searchId) { where.push('search_id = ?'); args.push(f.searchId); }
  if (f.shortlist) where.push('fit >= 60');
  if (f.ids?.length) { where.push(`id IN (${f.ids.map(() => '?').join(',')})`); args.push(...f.ids); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sorts: Record<string, string> = { newest: 'id DESC', name: 'name COLLATE NOCASE ASC', score: 'score DESC NULLS LAST, id DESC', rating: 'rating DESC NULLS LAST', fit: 'fit DESC NULLS LAST, id DESC' };
  const order = sorts[f.sort || 'newest'] || sorts.newest;
  const total = (db.prepare(`SELECT COUNT(*) n FROM leads ${w}`).get(...(args as never[])) as { n: number }).n;
  const rows = db.prepare(`SELECT * FROM leads ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...(args as never[]), f.limit ?? 200, f.offset ?? 0) as Lead[];
  return { total, rows };
}

export function deleteLeads(ids: number[]) {
  if (!ids.length) return 0;
  return db.prepare(`DELETE FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids).changes;
}

const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));

export function stats() {
  const one = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...(a as never[])) as { n: number }).n;
  const byStatus = Object.fromEntries((db.prepare('SELECT status, COUNT(*) n FROM leads GROUP BY status').all() as { status: string; n: number }[]).map((r) => [r.status, r.n]));
  const countries = db.prepare("SELECT country, COUNT(*) n FROM leads WHERE country <> '' GROUP BY country ORDER BY n DESC LIMIT 8").all();
  const categories = db.prepare("SELECT category, COUNT(*) n FROM leads WHERE category <> '' GROUP BY category ORDER BY n DESC LIMIT 8").all();
  return {
    total: one('SELECT COUNT(*) n FROM leads'),
    withEmail: one("SELECT COUNT(*) n FROM leads WHERE email <> ''"),
    withPhone: one("SELECT COUNT(*) n FROM leads WHERE phone <> ''"),
    withWebsite: one("SELECT COUNT(*) n FROM leads WHERE website <> ''"),
    sentToday: one("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?", new Date().toISOString().slice(0, 10)),
    drafts: one("SELECT COUNT(*) n FROM messages WHERE status = 'draft'"),
    scheduled: one("SELECT COUNT(*) n FROM messages WHERE status = 'scheduled'"),
    byStatus, countries, categories,
    perDay: days(14).map((d) => ({
      d,
      leads: one('SELECT COUNT(*) n FROM leads WHERE substr(created_at, 1, 10) = ?', d),
      sent: one("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND substr(sent_at, 1, 10) = ?", d),
    })),
  };
}

export function facets() {
  return {
    countries: (db.prepare("SELECT DISTINCT country FROM leads WHERE country <> '' ORDER BY country").all() as { country: string }[]).map((r) => r.country),
    categories: (db.prepare("SELECT DISTINCT category FROM leads WHERE category <> '' ORDER BY category").all() as { category: string }[]).map((r) => r.category),
  };
}

/* ---------- Searches ---------- */

export type Search = { id: number; created_at: string; category: string; place: string; sources: string; status: string; found: number; added: number; error: string; finished_at: string | null; campaign_id: number | null };

export function addSearch(category: string, place: string, sources: string[], campaignId: number | null = null) {
  return Number(db.prepare('INSERT INTO searches (created_at, category, place, sources, campaign_id) VALUES (?, ?, ?, ?, ?)').run(now(), category, place, JSON.stringify(sources), campaignId).lastInsertRowid);
}

/* ---------- Autopilot campaigns ---------- */

export type Campaign = { id: number; created_at: string; name: string; category: string; places: string; sources: string; daily: number; auto_send: number; enabled: number; cursor: number; last_run: string | null; proof: number };
export function listCampaigns() {
  return db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM leads l JOIN searches s ON s.id = l.search_id WHERE s.campaign_id = c.id) leads,
    (SELECT COUNT(*) FROM leads l JOIN searches s ON s.id = l.search_id WHERE s.campaign_id = c.id AND l.email <> '') with_email,
    (SELECT COUNT(*) FROM messages m JOIN leads l ON l.id = m.lead_id JOIN searches s ON s.id = l.search_id WHERE s.campaign_id = c.id AND m.status = 'sent') sent,
    (SELECT COUNT(*) FROM leads l JOIN searches s ON s.id = l.search_id WHERE s.campaign_id = c.id AND l.status IN ('replied','interested','won')) replies
    FROM campaigns c ORDER BY c.id DESC`).all();
}
export const getCampaign = (id: number) => db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign | undefined;
export function saveCampaign(c: Partial<Campaign>) {
  const cols = ['name', 'category', 'places', 'sources', 'daily', 'auto_send', 'enabled', 'cursor', 'last_run', 'proof'].filter((k) => (c as Record<string, unknown>)[k] !== undefined);
  const vals = cols.map((k) => (c as Record<string, unknown>)[k] as never);
  if (c.id) { db.prepare(`UPDATE campaigns SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...vals, c.id); return c.id; }
  return Number(db.prepare(`INSERT INTO campaigns (created_at, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`).run(now(), ...vals).lastInsertRowid);
}
export const deleteCampaign = (id: number) => db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
export const updateSearch = (id: number, patch: Partial<Search>) => {
  const cols = Object.keys(patch);
  db.prepare(`UPDATE searches SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => (patch as Record<string, unknown>)[c] as never), id);
};
export const listSearches = (limit = 30) => db.prepare('SELECT * FROM searches ORDER BY id DESC LIMIT ?').all(limit) as Search[];
export const nextQueuedSearch = () => db.prepare("SELECT * FROM searches WHERE status = 'queued' ORDER BY id LIMIT 1").get() as Search | undefined;

/* ---------- Messages ---------- */

export type Message = { id: number; lead_id: number; channel: string; step: number; subject: string; body: string; status: string; due_at: string | null; sent_at: string | null; message_id: string; error: string; created_at: string };

export function addMessage(m: Partial<Message> & { lead_id: number }) {
  return Number(db.prepare('INSERT INTO messages (lead_id, channel, step, subject, body, status, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(m.lead_id, m.channel ?? 'email', m.step ?? 0, m.subject ?? '', m.body ?? '', m.status ?? 'draft', m.due_at ?? null, now()).lastInsertRowid);
}
export function updateMessage(id: number, patch: Partial<Message>) {
  const cols = Object.keys(patch);
  db.prepare(`UPDATE messages SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => (patch as Record<string, unknown>)[c] as never), id);
}
export const messagesFor = (leadId: number) => db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY step, id').all(leadId) as Message[];
export function listMessages(status: string, limit = 200) {
  return db.prepare(`SELECT m.*, l.name lead_name, l.email lead_email, l.city lead_city, l.country lead_country FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = ? ORDER BY COALESCE(m.due_at, m.created_at) LIMIT ?`).all(status, limit);
}
export const dueMessages = () => db.prepare("SELECT * FROM messages WHERE status = 'scheduled' AND channel = 'email' AND (due_at IS NULL OR due_at <= ?) ORDER BY step DESC, due_at LIMIT 20").all(now()) as Message[];
export const deleteMessage = (id: number) => db.prepare('DELETE FROM messages WHERE id = ?').run(id);
/** Stop every unsent message to a lead (reply, bounce or opt-out). */
export const cancelPending = (leadId: number, why: string) =>
  db.prepare("UPDATE messages SET status = 'cancelled', error = ? WHERE lead_id = ? AND status IN ('draft','scheduled')").run(why, leadId);

/* ---------- Suppression and events ---------- */

export const suppress = (value: string, reason: string) => db.prepare('INSERT OR IGNORE INTO suppress (value, reason, at) VALUES (?, ?, ?)').run(value.toLowerCase().trim(), reason, now());
export const unsuppress = (value: string) => db.prepare('DELETE FROM suppress WHERE value = ?').run(value.toLowerCase().trim());
export const suppressedList = () => db.prepare('SELECT * FROM suppress ORDER BY at DESC').all();
export function isSuppressed(email: string, domain = '') {
  const e = email.toLowerCase();
  const d = (domain || e.split('@')[1] || '').toLowerCase();
  return !!db.prepare('SELECT 1 FROM suppress WHERE value IN (?, ?)').get(e, d);
}
export const logEvent = (leadId: number | null, type: string, detail = '') => db.prepare('INSERT INTO events (lead_id, at, type, detail) VALUES (?, ?, ?, ?)').run(leadId, now(), type, detail.slice(0, 2000));
export const eventsFor = (leadId: number) => db.prepare('SELECT * FROM events WHERE lead_id = ? ORDER BY id DESC LIMIT 100').all(leadId);
export const recentEvents = (limit = 100) => db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);

/* ---------- Saved jobs ---------- */
export const savedJobs = () => (db.prepare('SELECT data FROM saved_jobs ORDER BY at DESC').all() as { data: string }[]).map((r) => JSON.parse(r.data));
export const saveJob = (job: { id: string }) => db.prepare('INSERT OR REPLACE INTO saved_jobs (id, at, data) VALUES (?, ?, ?)').run(job.id, now(), JSON.stringify(job));
export const unsaveJob = (id: string) => db.prepare('DELETE FROM saved_jobs WHERE id = ?').run(id);

/* ---------- Dashboard ---------- */
export function dashboard(days = 30) {
  const one = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...(a as never[])) as { n: number }).n;
  const today = new Date().toISOString().slice(0, 10);
  const since = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const series = Array.from({ length: days }, (_, i) => since(days - 1 - i));
  const byDay = (sql: string) => {
    const m = new Map((db.prepare(sql).all(since(days - 1)) as { d: string; n: number }[]).map((r) => [r.d, r.n]));
    return series.map((d) => m.get(d) ?? 0);
  };
  const jobs = savedJobs() as { status?: string; title: string; company: string }[];
  const jobStatus: Record<string, number> = { Saved: 0, Applied: 0, Interview: 0, Offer: 0, Rejected: 0 };
  for (const j of jobs) jobStatus[j.status ?? 'Saved'] = (jobStatus[j.status ?? 'Saved'] ?? 0) + 1;
  const week = (sql: string, a: number, b: number) => one(sql, since(a), since(b));
  return {
    days: series,
    series: {
      leads: byDay("SELECT substr(created_at,1,10) d, COUNT(*) n FROM leads WHERE created_at >= ? GROUP BY d"),
      sent: byDay("SELECT substr(sent_at,1,10) d, COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ? GROUP BY d"),
      replies: byDay("SELECT substr(at,1,10) d, COUNT(*) n FROM events WHERE type = 'reply' AND at >= ? GROUP BY d"),
      applied: byDay("SELECT substr(at,1,10) d, COUNT(*) n FROM events WHERE type = 'job_status' AND detail LIKE 'Applied%' AND at >= ? GROUP BY d"),
    },
    totals: {
      leads: one('SELECT COUNT(*) n FROM leads'),
      leadsToday: one('SELECT COUNT(*) n FROM leads WHERE created_at >= ?', today),
      leadsWeek: week('SELECT COUNT(*) n FROM leads WHERE created_at >= ? AND created_at < ?', 6, -1),
      leadsPrevWeek: week('SELECT COUNT(*) n FROM leads WHERE created_at >= ? AND created_at < ?', 13, 6),
      withEmail: one("SELECT COUNT(*) n FROM leads WHERE email <> ''"),
      verified: one("SELECT COUNT(*) n FROM leads WHERE email_status = 'ok'"),
      shortlisted: one('SELECT COUNT(*) n FROM leads WHERE fit >= 60'),
      reports: one("SELECT COUNT(*) n FROM events WHERE type = 'report'"),
      drafts: one("SELECT COUNT(DISTINCT lead_id) n FROM messages WHERE status = 'draft' AND channel = 'email'"),
      scheduled: one("SELECT COUNT(*) n FROM messages WHERE status = 'scheduled'"),
      sent: one("SELECT COUNT(*) n FROM messages WHERE status = 'sent'"),
      sentToday: one("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?", today),
      sentWeek: week("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?", 6, -1),
      sentPrevWeek: week("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?", 13, 6),
      failed: one("SELECT COUNT(*) n FROM messages WHERE status = 'failed'"),
      replies: one("SELECT COUNT(*) n FROM events WHERE type = 'reply'"),
      repliesWeek: week("SELECT COUNT(*) n FROM events WHERE type = 'reply' AND at >= ? AND at < ?", 6, -1),
      repliesPrevWeek: week("SELECT COUNT(*) n FROM events WHERE type = 'reply' AND at >= ? AND at < ?", 13, 6),
      contactedLeads: one("SELECT COUNT(DISTINCT lead_id) n FROM messages WHERE status = 'sent'"),
      won: one("SELECT COUNT(*) n FROM leads WHERE status = 'won'"),
      interested: one("SELECT COUNT(*) n FROM leads WHERE status IN ('interested','replied')"),
      applied: jobStatus.Applied + jobStatus.Interview + jobStatus.Offer + jobStatus.Rejected,
      appliedWeek: week("SELECT COUNT(*) n FROM events WHERE type = 'job_status' AND detail LIKE 'Applied%' AND at >= ? AND at < ?", 6, -1),
      appliedPrevWeek: week("SELECT COUNT(*) n FROM events WHERE type = 'job_status' AND detail LIKE 'Applied%' AND at >= ? AND at < ?", 13, 6),
      campaigns: one('SELECT COUNT(*) n FROM campaigns WHERE enabled = 1'),
    },
    jobStatus,
    sources: db.prepare("SELECT source, COUNT(*) n FROM leads GROUP BY source ORDER BY n DESC LIMIT 8").all(),
    categories: db.prepare("SELECT category, COUNT(*) n FROM leads WHERE category <> '' GROUP BY category ORDER BY n DESC LIMIT 6").all(),
    countries: db.prepare("SELECT country, COUNT(*) n FROM leads WHERE country <> '' GROUP BY country ORDER BY n DESC LIMIT 6").all(),
    running: db.prepare("SELECT id, category, place, status, found, added FROM searches WHERE status IN ('running','queued') ORDER BY id").all(),
    nextSend: (db.prepare("SELECT m.due_at, l.name FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'scheduled' AND m.due_at IS NOT NULL ORDER BY m.due_at LIMIT 1").get() ?? null),
    activity: db.prepare(`SELECT e.id, e.at, e.type, e.detail, l.name FROM events e LEFT JOIN leads l ON l.id = e.lead_id ORDER BY e.id DESC LIMIT 18`).all(),
  };
}
