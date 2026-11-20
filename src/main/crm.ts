// CRM (phase 5): deals and pipeline stages, tasks and reminders, custom fields, saved views,
// duplicate review with undo, and forecast numbers. Uses the same SQLite file as the leads.
import * as db from './db';
import { load } from './settings';

const raw = () => db.raw();
const now = () => db.now();

export type Stage = { key: string; label: string; probability: number };
export const DEFAULT_STAGES: Stage[] = [
  { key: 'lead', label: 'New lead', probability: 10 }, { key: 'talking', label: 'Talking', probability: 25 }, { key: 'proposal', label: 'Proposal sent', probability: 50 },
  { key: 'negotiation', label: 'Negotiation', probability: 75 }, { key: 'won', label: 'Won', probability: 100 }, { key: 'lost', label: 'Lost', probability: 0 },
];
export const stages = (): Stage[] => (load().crm?.stages?.length ? load().crm.stages : DEFAULT_STAGES);

export function migrate() {
  raw().exec(`
    CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, title TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
      probability INTEGER, stage TEXT NOT NULL DEFAULT 'lead', expected_close TEXT, products TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', lost_reason TEXT NOT NULL DEFAULT '',
      custom TEXT NOT NULL DEFAULT '{}', position REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT);
    CREATE INDEX IF NOT EXISTS deals_stage ON deals(stage, position);
    CREATE TABLE IF NOT EXISTS deal_history (id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE, at TEXT NOT NULL, field TEXT NOT NULL, before TEXT, after TEXT);
    CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE, deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE, title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'task', due_at TEXT, done_at TEXT, notes TEXT NOT NULL DEFAULT '', reminded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tasks_due ON tasks(done_at, due_at);
    CREATE TABLE IF NOT EXISTS custom_fields (id INTEGER PRIMARY KEY, entity TEXT NOT NULL, key TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, options TEXT NOT NULL DEFAULT '[]', UNIQUE (entity, key));
    CREATE TABLE IF NOT EXISTS saved_views (id INTEGER PRIMARY KEY, screen TEXT NOT NULL, name TEXT NOT NULL, filters TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS merges (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kept_id INTEGER NOT NULL, removed TEXT NOT NULL, kept_before TEXT NOT NULL, moved TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
  `);
  for (const [t, c] of [['leads', "custom TEXT NOT NULL DEFAULT '{}'"]]) { try { raw().exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch { /* exists */ } }
}

// ── Deals (QF-047, QF-048) ──
const DEAL_FIELDS = ['lead_id', 'title', 'value', 'currency', 'probability', 'stage', 'expected_close', 'products', 'notes', 'lost_reason', 'custom', 'position'] as const;
export function listDeals() {
  return raw().prepare(`SELECT d.*, l.name lead_name, l.city lead_city, l.email lead_email,
    (SELECT MIN(due_at) FROM tasks t WHERE t.deal_id = d.id AND t.done_at IS NULL) next_task FROM deals d LEFT JOIN leads l ON l.id = d.lead_id ORDER BY d.stage, d.position, d.id`).all();
}
export function saveDeal(d: Record<string, any>) {
  const st = stages();
  if (d.stage && !st.some((s) => s.key === d.stage)) throw new Error('Unknown stage.');
  if (d.value != null && (!Number.isFinite(Number(d.value)) || Number(d.value) < 0)) throw new Error('The value must be a positive number.');
  if (d.probability != null && d.probability !== '' && (Number(d.probability) < 0 || Number(d.probability) > 100)) throw new Error('Probability is 0 to 100.');
  if (d.currency && !/^[A-Z]{3}$/.test(String(d.currency))) throw new Error('Use a 3-letter currency code, for example USD.');
  const cols = DEAL_FIELDS.filter((k) => d[k] !== undefined);
  const vals = cols.map((k) => (k === 'custom' && typeof d[k] !== 'string' ? JSON.stringify(d[k]) : d[k] === '' && (k === 'probability' || k === 'expected_close') ? null : d[k]));
  if (!d.id) {
    if (!d.title) throw new Error('Give the deal a title.');
    const id = Number(raw().prepare(`INSERT INTO deals (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`).run(...vals, now(), now()).lastInsertRowid);
    if (d.lead_id) db.logEvent(Number(d.lead_id), 'deal', `Deal created: ${d.title}`);
    return id;
  }
  const before = raw().prepare('SELECT * FROM deals WHERE id = ?').get(d.id) as Record<string, any> | undefined;
  if (!before) throw new Error('Deal not found.');
  // Audit trail: every field change is kept (QF-047).
  const hist = raw().prepare('INSERT INTO deal_history (deal_id, at, field, before, after) VALUES (?, ?, ?, ?, ?)');
  cols.forEach((k, i) => { if (k !== 'position' && String(before[k] ?? '') !== String(vals[i] ?? '')) hist.run(d.id, now(), k, before[k] == null ? null : String(before[k]), vals[i] == null ? null : String(vals[i])); });
  const closing = d.stage && d.stage !== before.stage ? (d.stage === 'won' || d.stage === 'lost' ? now() : null) : undefined;
  raw().prepare(`UPDATE deals SET ${cols.map((k) => `${k} = ?`).join(', ')}${closing !== undefined ? ', closed_at = ?' : ''}, updated_at = ? WHERE id = ?`).run(...vals, ...(closing !== undefined ? [closing] : []), now(), d.id);
  if (d.stage && d.stage !== before.stage && before.lead_id) {
    db.logEvent(before.lead_id, 'deal', `${before.title}: ${stages().find((s) => s.key === before.stage)?.label ?? before.stage} → ${stages().find((s) => s.key === d.stage)?.label ?? d.stage}`);
    if (d.stage === 'won') db.updateLead(before.lead_id, { status: 'won' });
    if (d.stage === 'lost') db.updateLead(before.lead_id, { status: 'lost' });
  }
  return d.id;
}
export const deleteDeal = (id: number) => raw().prepare('DELETE FROM deals WHERE id = ?').run(id);
export const dealHistory = (id: number) => raw().prepare('SELECT * FROM deal_history WHERE deal_id = ? ORDER BY id DESC LIMIT 100').all(id);
export const leadDeals = (leadId: number) => raw().prepare('SELECT * FROM deals WHERE lead_id = ? ORDER BY id DESC').all(leadId);

/** Move a card: stage and position in one step (drag and drop, or the keyboard buttons). */
export function moveDeal(id: number, stage: string, beforeId: number | null) {
  const list = raw().prepare('SELECT id, position FROM deals WHERE stage = ? AND id <> ? ORDER BY position, id').all(stage, id) as { id: number; position: number }[];
  const idx = beforeId ? list.findIndex((x) => x.id === beforeId) : list.length;
  const prev = idx > 0 ? list[idx - 1].position : (list[0]?.position ?? 1) - 1;
  const next = idx >= 0 && idx < list.length ? list[idx].position : prev + 2;
  return saveDeal({ id, stage, position: (prev + next) / 2 });
}

// ── Forecast (QF-055) ──
export function forecast() {
  const st = stages();
  const deals = raw().prepare('SELECT * FROM deals').all() as any[];
  const prob = (d: any) => d.probability ?? st.find((s) => s.key === d.stage)?.probability ?? 0;
  const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const byStage = st.map((s) => { const ds = deals.filter((d) => d.stage === s.key); return { stage: s.key, label: s.label, count: ds.length, value: ds.reduce((a, d) => a + d.value, 0), weighted: ds.reduce((a, d) => a + (d.value * prob(d)) / 100, 0) }; });
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
  const won = deals.filter((d) => d.stage === 'won'), lost = deals.filter((d) => d.stage === 'lost');
  return {
    open: open.length, pipeline: open.reduce((a, d) => a + d.value, 0), weighted: open.reduce((a, d) => a + (d.value * prob(d)) / 100, 0),
    won: won.reduce((a, d) => a + d.value, 0), winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    byStage, currencies: [...new Set(deals.map((d) => d.currency))],
    byMonth: months.map((m) => ({ month: m, won: won.filter((d) => (d.closed_at ?? '').startsWith(m)).reduce((a, d) => a + d.value, 0), expected: open.filter((d) => (d.expected_close ?? '').startsWith(m)).reduce((a, d) => a + (d.value * prob(d)) / 100, 0) })),
    lostReasons: raw().prepare("SELECT lost_reason reason, COUNT(*) n FROM deals WHERE stage = 'lost' AND lost_reason <> '' GROUP BY lost_reason ORDER BY n DESC LIMIT 6").all(),
  };
}

// ── Tasks and reminders (QF-049, QF-054) ──
export function listTasks(f: { leadId?: number; dealId?: number; open?: boolean; from?: string; to?: string } = {}) {
  const w: string[] = [], a: unknown[] = [];
  if (f.leadId) { w.push('t.lead_id = ?'); a.push(f.leadId); }
  if (f.dealId) { w.push('t.deal_id = ?'); a.push(f.dealId); }
  if (f.open) w.push('t.done_at IS NULL');
  if (f.from) { w.push('t.due_at >= ?'); a.push(f.from); }
  if (f.to) { w.push('t.due_at < ?'); a.push(f.to); }
  return raw().prepare(`SELECT t.*, l.name lead_name, d.title deal_title FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN deals d ON d.id = t.deal_id
    ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY t.done_at IS NOT NULL, t.due_at IS NULL, t.due_at, t.id LIMIT 500`).all(...(a as never[]));
}
export function saveTask(t: Record<string, any>) {
  if (!t.id && !t.title) throw new Error('Give the task a title.');
  if (t.due_at && Number.isNaN(Date.parse(t.due_at))) throw new Error('The due date is not valid.');
  const f = ['lead_id', 'deal_id', 'title', 'kind', 'due_at', 'notes'].filter((k) => t[k] !== undefined);
  if (!t.id) return Number(raw().prepare(`INSERT INTO tasks (${f.join(', ')}, created_at) VALUES (${f.map(() => '?').join(', ')}, ?)`).run(...f.map((k) => t[k] || null), now()).lastInsertRowid);
  raw().prepare(`UPDATE tasks SET ${f.map((k) => `${k} = ?`).join(', ')}${t.due_at !== undefined ? ', reminded = 0' : ''} WHERE id = ?`).run(...f.map((k) => t[k] ?? null), t.id);
  if (t.done !== undefined) raw().prepare('UPDATE tasks SET done_at = ? WHERE id = ?').run(t.done ? now() : null, t.id);
  return t.id;
}
export const deleteTask = (id: number) => raw().prepare('DELETE FROM tasks WHERE id = ?').run(id);
/** Tasks that just became due and have not been announced yet. */
export function dueReminders() {
  const rows = raw().prepare("SELECT t.*, l.name lead_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id WHERE t.done_at IS NULL AND t.reminded = 0 AND t.due_at IS NOT NULL AND t.due_at <= ?").all(now()) as any[];
  if (rows.length) raw().prepare(`UPDATE tasks SET reminded = 1 WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id));
  return rows;
}

// ── Custom fields (QF-050) ──
const TYPES = ['text', 'number', 'date', 'select', 'url'];
export const listFields = (entity?: string) => raw().prepare(`SELECT * FROM custom_fields ${entity ? 'WHERE entity = ?' : ''} ORDER BY id`).all(...(entity ? [entity] : []));
export function saveField(f: { id?: number; entity: string; label: string; type: string; options?: string[] }) {
  if (!['lead', 'deal'].includes(f.entity)) throw new Error('Fields can be added to leads or deals.');
  if (!TYPES.includes(f.type)) throw new Error('Unknown field type.');
  if (!f.label?.trim()) throw new Error('Name the field.');
  const key = f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'field';
  const opts = JSON.stringify((f.options ?? []).map((o) => String(o).trim()).filter(Boolean));
  if (f.id) return raw().prepare('UPDATE custom_fields SET label = ?, type = ?, options = ? WHERE id = ?').run(f.label.trim(), f.type, opts, f.id);
  return raw().prepare('INSERT INTO custom_fields (entity, key, label, type, options) VALUES (?, ?, ?, ?, ?)').run(f.entity, key, f.label.trim(), f.type, opts);
}
export const deleteField = (id: number) => raw().prepare('DELETE FROM custom_fields WHERE id = ?').run(id);
/** Validate one value against its field type; returns the cleaned value or throws. */
export function cleanValue(type: string, v: unknown, options: string[] = []) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (type === 'number') { const n = Number(s); if (!Number.isFinite(n)) throw new Error(`"${s}" is not a number.`); return n; }
  if (type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(`"${s}" is not a date (YYYY-MM-DD).`); return s; }
  if (type === 'url') { try { const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`); return u.toString(); } catch { throw new Error(`"${s}" is not a link.`); } }
  if (type === 'select') { if (options.length && !options.includes(s)) throw new Error(`"${s}" is not one of the choices.`); return s; }
  return s.slice(0, 2000);
}
export function setCustom(entity: 'lead' | 'deal', id: number, key: string, value: unknown) {
  const f = raw().prepare('SELECT * FROM custom_fields WHERE entity = ? AND key = ?').get(entity, key) as any;
  if (!f) throw new Error('Unknown field.');
  const v = cleanValue(f.type, value, JSON.parse(f.options));
  const t = entity === 'lead' ? 'leads' : 'deals';
  const cur = JSON.parse((raw().prepare(`SELECT custom FROM ${t} WHERE id = ?`).get(id) as any)?.custom ?? '{}');
  cur[key] = v;
  raw().prepare(`UPDATE ${t} SET custom = ? WHERE id = ?`).run(JSON.stringify(cur), id);
  return cur;
}

// ── Saved views (QF-051) ──
export const listViews = (screen: string) => raw().prepare('SELECT * FROM saved_views WHERE screen = ? ORDER BY name').all(screen);
export const saveView = (v: { screen: string; name: string; filters: unknown }) => raw().prepare('INSERT INTO saved_views (screen, name, filters, created_at) VALUES (?, ?, ?, ?)').run(v.screen, v.name.trim().slice(0, 60), JSON.stringify(v.filters), now());
export const deleteView = (id: number) => raw().prepare('DELETE FROM saved_views WHERE id = ?').run(id);

// ── Duplicate review with undo (QF-053) ──
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function duplicateGroups(limit = 100) {
  const rows = raw().prepare('SELECT id, name, phone, email, domain, city, address, source, created_at FROM leads').all() as any[];
  const groups = new Map<string, any[]>();
  const add = (k: string, r: any) => { if (!k) return; const g = groups.get(k) ?? []; g.push(r); groups.set(k, g); };
  for (const r of rows) {
    const digits = (r.phone ?? '').replace(/\D/g, '').slice(-9);
    if (digits.length >= 7) add(`p:${digits}`, r);
    if (r.email) add(`e:${r.email.toLowerCase()}`, r);
    if (r.name && r.city) add(`n:${norm(r.name)}|${norm(r.city)}`, r);
  }
  const seen = new Set<string>();
  const out: { reason: string; leads: any[] }[] = [];
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    const sig = g.map((x) => x.id).sort().join(',');
    if (seen.has(sig) || raw().prepare('SELECT 1 FROM merges WHERE removed LIKE ? AND undone = 0').get(`%"keep_apart":"${sig}"%`)) continue;
    seen.add(sig);
    out.push({ reason: k.startsWith('p:') ? 'Same phone number' : k.startsWith('e:') ? 'Same email' : 'Same name in the same city', leads: g.slice(0, 6) });
    if (out.length >= limit) break;
  }
  return out;
}
const CHILD_TABLES: [string, string][] = [['messages', 'lead_id'], ['events', 'lead_id'], ['contacts', 'lead_id'], ['signals', 'lead_id'], ['deals', 'lead_id'], ['tasks', 'lead_id'], ['replies', 'lead_id'], ['lead_snapshots', 'lead_id']];
/** Merge leads into one: empty fields are filled from the others, their history moves over, and it can be undone. */
export function mergeLeads(keepId: number, removeIds: number[]) {
  const keep = db.getLead(keepId);
  if (!keep) throw new Error('Lead not found.');
  const removed = removeIds.filter((x) => x !== keepId).map((id) => db.getLead(id)).filter(Boolean) as db.Lead[];
  if (!removed.length) throw new Error('Choose at least two leads.');
  const moved: Record<string, [number, number][]> = {};
  raw().transaction(() => {
    const patch: Record<string, unknown> = {};
    for (const r of removed) for (const [k, v] of Object.entries(r)) if (!['id', 'created_at', 'updated_at'].includes(k) && v != null && v !== '' && v !== '[]' && v !== '{}' && ((keep as any)[k] == null || (keep as any)[k] === '' || (keep as any)[k] === '[]' || (keep as any)[k] === '{}') && patch[k] == null) patch[k] = v;
    for (const [t, c] of CHILD_TABLES) {
      const pairs = (raw().prepare(`SELECT id, ${c} owner FROM ${t} WHERE ${c} IN (${removed.map(() => '?').join(',')})`).all(...removed.map((r) => r.id)) as { id: number; owner: number }[]).map((x) => [x.id, x.owner] as [number, number]);
      if (!pairs.length) continue;
      moved[t] = pairs;
      const ids = pairs.map((x) => x[0]);
      raw().prepare(`UPDATE OR IGNORE ${t} SET ${c} = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(keepId, ...ids);
    }
    raw().prepare('INSERT INTO merges (at, kept_id, removed, kept_before, moved) VALUES (?, ?, ?, ?, ?)').run(now(), keepId, JSON.stringify(removed), JSON.stringify(keep), JSON.stringify(moved));
    for (const r of removed) raw().prepare('DELETE FROM leads WHERE id = ?').run(r.id);
    db.updateLead(keepId, patch);
    db.logEvent(keepId, 'merge', `Merged ${removed.length} duplicate${removed.length > 1 ? 's' : ''}: ${removed.map((r) => r.name).join(', ')}`);
  })();
  return keepId;
}
/** Put the merged leads back exactly as they were. */
export function undoMerge(mergeId: number) {
  const m = raw().prepare('SELECT * FROM merges WHERE id = ? AND undone = 0').get(mergeId) as any;
  if (!m) throw new Error('Nothing to undo.');
  const removed = JSON.parse(m.removed) as Record<string, unknown>[];
  const before = JSON.parse(m.kept_before) as Record<string, unknown>;
  const moved = JSON.parse(m.moved) as Record<string, [number, number][]>;
  raw().transaction(() => {
    for (const r of removed) {
      const cols = Object.keys(r).filter((k) => /^[a-z_]+$/.test(k));
      raw().prepare(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((k) => r[k] as never));
    }
    // Moved rows go back to their original lead.
    for (const [t, pairs] of Object.entries(moved)) {
      const col = CHILD_TABLES.find(([x]) => x === t)?.[1];
      if (!col) continue;
      const put = raw().prepare(`UPDATE ${t} SET ${col} = ? WHERE id = ?`);
      for (const [id, owner] of pairs) put.run(owner, id);
    }
    const cols = Object.keys(before).filter((k) => /^[a-z_]+$/.test(k) && k !== 'id');
    raw().prepare(`UPDATE leads SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => before[k] as never), m.kept_id);
    raw().prepare('UPDATE merges SET undone = 1 WHERE id = ?').run(mergeId);
  })();
  return removed.length;
}
export const listMerges = () => raw().prepare('SELECT id, at, kept_id, removed, undone FROM merges ORDER BY id DESC LIMIT 50').all();
/** Mark a suggested group as "not duplicates" so it is not suggested again. */
export const keepApart = (ids: number[]) => raw().prepare('INSERT INTO merges (at, kept_id, removed, kept_before, moved, undone) VALUES (?, 0, ?, \'{}\', \'{}\', 0)').run(now(), JSON.stringify({ keep_apart: [...ids].sort().join(',') }));
