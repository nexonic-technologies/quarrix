// Client workspace isolation (0.22). When a client workspace is selected, every screen, export, sync, automation and
// API call sees and changes only that client's records. "All clients" (no workspace selected) is the agency overview.
// Records are tied to a client through their lead: messages, replies, deals, tasks, contacts and signals all carry lead_id.
import * as db from './db';
import { load } from './settings';

export const current = () => load().currentClient ?? '';
export class ScopeError extends Error { constructor() { super('That record belongs to another client workspace. Switch workspace to open it.'); this.name = 'ScopeError'; } }

/** SQL fragment limiting a lead_id column to the workspace; pair with scopeArgs(). */
export const scopeSql = (col = 'lead_id') => `(? = '' OR ${col} IN (SELECT id FROM leads WHERE client = ?))`;
export const scopeArgs = (s = current()) => [s, s];

const leadClient = (id: unknown) => (db.raw().prepare('SELECT client FROM leads WHERE id = ?').get(Number(id)) as { client: string } | undefined)?.client;
/** True when a lead may be used in the current workspace. Missing leads are left to the handler (it reports "not found"). */
export function leadOk(id: unknown, s = current()) {
  if (!s || id == null || id === '') return true;
  const c = leadClient(id);
  return c === undefined || c === s;
}
export function assertLead(id: unknown, s = current()) { if (!leadOk(id, s)) throw new ScopeError(); }
export function filterIds(ids: unknown, s = current()): number[] {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
  if (!s || !list.length) return list;
  const ok = new Set(inScopeIds(s));
  return list.filter((id) => ok.has(id));
}
const inScopeIds = (s: string) => (db.raw().prepare('SELECT id FROM leads WHERE client = ?').all(s) as { id: number }[]).map((r) => r.id);
/** Rows tied to leads (lead_id) limited to the workspace; rows without a lead are hidden inside a client workspace. */
export function filterRows<T>(rows: T, s = current(), key = 'lead_id'): T {
  if (!s || !Array.isArray(rows)) return rows;
  const ok = new Set(inScopeIds(s));
  return rows.filter((r: any) => r && ok.has(Number(r[key]))) as T;
}
const owner = (table: 'messages' | 'deals' | 'contacts' | 'replies' | 'signals', id: unknown) => (db.raw().prepare(`SELECT lead_id FROM ${table} WHERE id = ?`).get(Number(id)) as { lead_id: number | null } | undefined);
function assertOwned(table: 'messages' | 'deals' | 'contacts' | 'replies' | 'signals', id: unknown, s = current()) {
  if (!s) return;
  const r = owner(table, id);
  if (r && (r.lead_id == null || !leadOk(r.lead_id, s))) throw new ScopeError();
}
function assertTask(id: unknown, s = current()) {
  if (!s) return;
  const t = db.raw().prepare('SELECT lead_id, deal_id FROM tasks WHERE id = ?').get(Number(id)) as { lead_id: number | null; deal_id: number | null } | undefined;
  if (!t) return;
  if (t.lead_id != null) return assertLead(t.lead_id, s);
  if (t.deal_id != null) return assertOwned('deals', t.deal_id, s);
  throw new ScopeError();
}
function assertCompany(id: unknown, s = current()) {
  if (!s) return;
  const c = db.raw().prepare('SELECT client FROM companies WHERE id = ?').get(Number(id)) as { client: string } | undefined;
  if (c && c.client !== s) throw new ScopeError();
}

function assertSearch(id: unknown, s = current()) {
  if (!s) return;
  const r = db.raw().prepare('SELECT client FROM searches WHERE id = ?').get(Number(id)) as { client: string } | undefined;
  if (r && r.client !== s) throw new ScopeError();
}

type Guard = (args: any[], s: string) => any[];
const arg0Lead: Guard = (a, s) => (assertLead(a[0], s), a);
const arg0Ids: Guard = (a, s) => [filterIds(a[0], s), ...a.slice(1)];
const owned = (t: Parameters<typeof assertOwned>[0]): Guard => (a, s) => (assertOwned(t, a[0], s), a);
/** Argument checks for IPC channels that take record IDs. Pure mapping, exported for tests. */
export const ARG_GUARDS: Record<string, Guard> = {
  'leads:get': arg0Lead, 'leads:update': arg0Lead, 'leads:trend': arg0Lead, 'leads:intel': arg0Lead, 'messages:approve': arg0Lead, 'deals:forLead': arg0Lead,
  'email:find': arg0Lead, 'proof:make': arg0Lead, 'proof:info': arg0Lead, 'proof:open': arg0Lead, 'proof:send': arg0Lead, 'proof:save': arg0Lead,
  'signals:check': arg0Lead, 'wa:open': arg0Lead, 'wa:cloud': arg0Lead, 'contacts:list': arg0Lead,
  'leads:delete': arg0Ids, 'leads:enrich': arg0Ids, 'draft:create': arg0Ids, 'email:verify': arg0Ids, 'dupes:apart': arg0Ids,
  'sync:hubspot': arg0Ids, 'sync:notion': arg0Ids, 'sync:postgres': arg0Ids, 'sync:s3': arg0Ids, 'sync:sheets': arg0Ids,
  'messages:update': owned('messages'), 'messages:delete': owned('messages'), 'replies:update': owned('replies'), 'signals:update': owned('signals'),
  'deals:move': owned('deals'), 'deals:delete': owned('deals'), 'deals:history': owned('deals'), 'contacts:delete': owned('contacts'),
  'tasks:delete': (a, s) => (assertTask(a[0], s), a),
  'companies:locations': (a, s) => (assertCompany(a[0], s), a), 'companies:rename': (a, s) => (assertCompany(a[0], s), a),
  'contacts:add': (a, s) => (assertLead(a[0]?.lead_id, s), a),
  'deals:save': (a, s) => { const d = a[0] ?? {}; if (d.id) assertOwned('deals', d.id, s); if (s && !d.id && d.lead_id == null) throw new ScopeError(); if (d.lead_id != null) assertLead(d.lead_id, s); return a; },
  'tasks:save': (a, s) => { const t = a[0] ?? {}; if (t.id) assertTask(t.id, s); if (t.lead_id != null) assertLead(t.lead_id, s); if (t.deal_id != null) assertOwned('deals', t.deal_id, s); if (s && !t.id && t.lead_id == null && t.deal_id == null) throw new ScopeError(); return a; },
  'fields:set': (a, s) => (a[0] === 'deal' ? assertOwned('deals', a[1], s) : assertLead(a[1], s), a),
  'fields:computed': (a, s) => (a[0] === 'deal' ? assertOwned('deals', a[1], s) : assertLead(a[1], s), a),
  'search:stop': (a, s) => (assertSearch(a[0], s), a), 'search:pause': (a, s) => (assertSearch(a[0], s), a),
  'search:resume': (a, s) => (assertSearch(a[0], s), a), 'search:log': (a, s) => (assertSearch(a[0], s), a),
  'dupes:undo': (a, s) => { const m = db.raw().prepare('SELECT kept_id FROM merges WHERE id = ?').get(Number(a[0])) as { kept_id: number } | undefined; if (m) assertLead(m.kept_id, s); return a; },
  'dupes:merge': (a, s) => { assertLead(a[0], s); const ids = Array.isArray(a[1]) ? a[1].map(Number) : []; if (filterIds(ids, s).length !== ids.length) throw new ScopeError(); return a; },
};
const rows = (r: unknown, s: string) => filterRows(r, s);
/** Result filters for list channels. */
export const RESULT_GUARDS: Record<string, (r: any, s: string) => any> = {
  'messages:list': rows, 'replies:list': rows, 'signals:list': rows,
  'outreach:attention': (r, s) => (r && s ? { ...r, failed: filterRows(r.failed, s), blocked: filterRows(r.blocked, s), review: filterRows(r.review, s) } : r),
  'dupes:list': (r, s) => (Array.isArray(r) && s ? r.map((g: any) => (Array.isArray(g?.leads) ? { ...g, leads: filterRows(g.leads, s, 'id') } : Array.isArray(g) ? filterRows(g, s, 'id') : g)).filter((g: any) => (Array.isArray(g) ? g.length > 1 : (g?.leads?.length ?? 2) > 1)) : r),
  'dupes:merges': (r, s) => (Array.isArray(r) && s ? filterRows(r, s, 'kept_id') : r),
  'search:list': (r, s) => (Array.isArray(r) && s ? r.filter((x: any) => (x.client ?? '') === s) : r),
};
const own = <T>(o: Record<string, T>, k: string) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
export function guardArgs(ch: string, args: any[], s = current()) { const g = own(ARG_GUARDS, ch); return g && s ? g(args, s) : args; }
export function guardResult(ch: string, r: unknown, s = current()) { const g = own(RESULT_GUARDS, ch); return g && s ? g(r, s) : r; }
/** Lead queries always stay inside the selected workspace, whatever the caller asks for. */
export const scopedQuery = <T extends Record<string, any>>(q: T, s = current()): T & { client?: string } => (s ? { ...q, client: s } : q);

/** Watches and campaigns belong to the workspace they were made in. */
export const byClient = <T>(rows: T, s = current()): T => (s && Array.isArray(rows) ? (rows.filter((r: any) => (r.client ?? '') === s) as T) : rows);
export function ownRecord<T extends { id?: number; client?: string }>(table: 'watches' | 'campaigns', r: T, s = current()): T {
  const out = { ...r } as T;
  delete out.client; // set here, never by the caller
  if (r.id) {
    const row = db.raw().prepare(`SELECT client FROM ${table} WHERE id = ?`).get(Number(r.id)) as { client: string } | undefined;
    if (row && s && row.client !== s) throw new ScopeError();
    return out;
  }
  return { ...out, client: s };
}

// Read-only views of one workspace (0.23). For the duration of a synchronous read, temporary views with the same names as
// the tables shadow them (SQLite looks in the temp schema first), so dashboards, statistics and counts written for the
// whole database see only the selected client's rows. Writes never run inside withScope.
const lead = (s: string) => `lead_id IN (SELECT id FROM main.leads WHERE client = ${s})`;
const VIEWS: Record<string, (s: string) => string> = {
  leads: (s) => `client = ${s}`, searches: (s) => `client = ${s}`, companies: (s) => `client = ${s}`,
  watches: (s) => `client = ${s}`, campaigns: (s) => `client = ${s}`,
  messages: lead, replies: lead, signals: lead, contacts: lead, events: lead, lead_snapshots: lead, deals: lead,
  tasks: (s) => `COALESCE(lead_id, (SELECT d.lead_id FROM main.deals d WHERE d.id = deal_id)) IN (SELECT id FROM main.leads WHERE client = ${s})`,
};
/** SQL string literal for a client name. Pure, exported for tests. */
export const sqlText = (v: string) => `'${String(v).replace(/'/g, "''")}'`;
export function withScope<T>(fn: () => T, s = current()): T {
  if (!s) return fn();
  const r = db.raw();
  const have = new Set((r.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((x) => x.name));
  const made: string[] = [];
  try {
    for (const [t, cond] of Object.entries(VIEWS)) {
      if (!have.has(t)) continue;
      r.exec(`DROP VIEW IF EXISTS temp.${t}; CREATE TEMP VIEW ${t} AS SELECT * FROM main.${t} WHERE ${cond(sqlText(s))}`);
      made.push(t);
    }
    const out = fn();
    if (out && typeof (out as any).then === 'function') throw new Error('withScope only takes synchronous reads');
    return out;
  } finally {
    for (const t of made) r.exec(`DROP VIEW IF EXISTS temp.${t}`);
  }
}
