// Runtime checks for every IPC/API call that changes data (0.25): field allowlists, types and lengths, record existence
// and integrity between linked records. Runs before the workspace checks (scope.ts) and the handler.
import * as db from './db';

export class InputError extends Error { constructor(m: string) { super(m); this.name = 'InputError'; } }
const fail = (m: string): never => { throw new InputError(m); };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, what = 'record') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) fail(`That ${what} ID is not valid.`); return n; };
const str = (v: unknown, k: string, max: number) => { if (v == null) return ''; if (typeof v !== 'string' && typeof v !== 'number') fail(`${k} must be text.`); const s = String(v); if (s.length > max) fail(`${k} is too long (at most ${max} characters).`); return s; };
const bit = (v: unknown, k: string) => { if (v === true || v === 1 || v === '1') return 1; if (v === false || v === 0 || v === '0' || v == null) return 0; return fail(`${k} must be on or off.`); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const exists = (table: string, id: number) => !!db.raw().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);

const STATUSES: readonly string[] = db.STATUSES;
/** Lead fields a person may edit. Workspace (client), source, IDs and computed fields are never set from outside. */
export const LEAD_EDIT: Record<string, (v: unknown, k: string) => unknown> = {
  status: (v) => (STATUSES.includes(String(v)) ? String(v) : fail('Unknown status.')),
  notes: (v, k) => str(v, k, 20000), tags: (v, k) => str(v, k, 2000),
  name: (v, k) => { const s = str(v, k, 200).trim(); return s || fail('The name cannot be empty.'); },
  email: (v, k) => { const s = str(v, k, 254).trim().toLowerCase(); return !s || EMAIL.test(s) ? s : fail('That email address is not valid.'); },
  phone: (v, k) => str(v, k, 40).trim(), website: (v, k) => str(v, k, 500).trim(),
  contact_name: (v, k) => str(v, k, 120), contact_role: (v, k) => str(v, k, 120), category: (v, k) => str(v, k, 120),
  address: (v, k) => str(v, k, 300), city: (v, k) => str(v, k, 120), region: (v, k) => str(v, k, 120), country: (v, k) => str(v, k, 80), postcode: (v, k) => str(v, k, 20),
  wa_consent: (v, k) => bit(v, k),
};
/** Pure: only allowed fields, checked and normalised. Unknown or protected fields are refused, not ignored. */
export function leadPatch(patch: unknown, extra: Record<string, (v: unknown, k: string) => unknown> = {}) {
  if (!isObj(patch)) fail('Nothing to change.');
  const rules = { ...LEAD_EDIT, ...extra };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(rules, k)) fail(`The field "${k.slice(0, 40)}" cannot be changed here.`);
    out[k] = rules[k](v, k);
  }
  return out;
}
const coord = (min: number, max: number) => (v: unknown, k: string) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fail(`${k} is out of range.`); };
const ids = (v: unknown) => { if (!Array.isArray(v)) fail('Send a list of records.'); if ((v as unknown[]).length > 100000) fail('Too many records at once.'); return (v as unknown[]).map((x) => int(x)); };

type Check = (a: any[]) => any[];
/** Checks per channel. Exported for tests. */
export const CHECKS: Record<string, Check> = {
  'jobs:trust': ([job, employer]) => {
    if (!isObj(job)) fail('Choose a job to check.');
    return [{ url: str(job.url, 'Job URL', 2000), title: str(job.title, 'Job title', 300), company: str(job.company, 'Company', 300), snippet: str(job.snippet, 'Job description', 30000) }, str(employer ?? '', 'Employer URL', 2000)];
  },
  'leads:update': ([id, patch]) => { const n = int(id, 'lead'); return [n, leadPatch(patch)]; },
  'leads:add': ([l]) => [{ ...(isObj(l) && String(l.name ?? '').trim() ? {} : fail('Give the business a name.')), ...leadPatch(l, { lat: coord(-90, 90), lon: coord(-180, 180) }), status: STATUSES.includes(String((l as any)?.status)) ? (l as any).status : 'new' }],
  'leads:delete': ([v]) => [ids(v)], 'leads:enrich': ([v, ...r]) => [ids(v), ...r], 'draft:create': ([v, ...r]) => [ids(v), ...r],
  'email:verify': ([v, ...r]) => [ids(v), ...r], 'dupes:apart': ([v]) => [ids(v)],
  'dupes:merge': ([keep, v]) => [int(keep, 'lead'), ids(v)],
  'messages:update': ([id, patch]) => {
    const n = int(id, 'message');
    if (!isObj(patch)) fail('Nothing to change.');
    const m = db.raw().prepare('SELECT status FROM messages WHERE id = ?').get(n) as { status: string } | undefined;
    if (!m) fail('That message no longer exists.');
    if (m!.status === 'sent') fail('A sent message cannot be edited.');
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch as object)) {
      if (k === 'subject') out.subject = str(v, 'Subject', 300);
      else if (k === 'body') out.body = str(v, 'Body', 50000);
      else if (k === 'due_at') out.due_at = v == null || v === '' ? null : Number.isNaN(Date.parse(String(v))) ? fail('The send time is not valid.') : new Date(String(v)).toISOString();
      else fail(`The field "${k.slice(0, 40)}" cannot be changed here.`);
    }
    return [n, out];
  },
  'messages:delete': ([id]) => [int(id, 'message')],
  'signals:update': ([id, patch]) => {
    if (!isObj(patch)) fail('Nothing to change.');
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(patch as object)) { if (k !== 'seen' && k !== 'dismissed') fail(`The field "${k.slice(0, 40)}" cannot be changed here.`); out[k] = bit(v, k); }
    return [int(id, 'signal'), out];
  },
  'replies:update': ([id, patch]) => [int(id, 'reply'), { intent: isObj(patch) && patch.intent != null ? str(patch.intent, 'Intent', 40) : undefined, handled: isObj(patch) && patch.handled !== undefined ? !!bit(patch.handled, 'Handled') : undefined }],
  'contacts:add': ([c]) => {
    if (!isObj(c)) fail('Nothing to add.');
    const lead = int(c.lead_id, 'lead'); if (!exists('leads', lead)) fail('That lead no longer exists.');
    const email = str(c.email, 'Email', 254).trim(); if (email && !EMAIL.test(email)) fail('That email address is not valid.');
    return [{ lead_id: lead, name: str(c.name, 'Name', 120), role: str(c.role, 'Role', 120), email, phone: str(c.phone, 'Phone', 40) }];
  },
  'contacts:delete': ([id]) => [int(id, 'contact')],
  'deals:save': ([d]) => {
    if (!isObj(d)) fail('Nothing to save.');
    if (d.id != null) { const n = int(d.id, 'deal'); if (!exists('deals', n)) fail('That deal no longer exists.'); }
    if (d.lead_id != null && d.lead_id !== '') { const n = int(d.lead_id, 'lead'); if (!exists('leads', n)) fail('That lead no longer exists.'); }
    if (d.title != null) str(d.title, 'Title', 200);
    return [d];
  },
  'deals:move': ([id, stage, before]) => [int(id, 'deal'), str(stage, 'Stage', 40), before ? int(before, 'deal') : null],
  'deals:delete': ([id]) => [int(id, 'deal')],
  'tasks:save': ([t]) => {
    if (!isObj(t)) fail('Nothing to save.');
    if (t.title != null) str(t.title, 'Title', 300);
    const lead = t.lead_id != null && t.lead_id !== '' ? int(t.lead_id, 'lead') : null;
    const deal = t.deal_id != null && t.deal_id !== '' ? int(t.deal_id, 'deal') : null;
    if (lead && !exists('leads', lead)) fail('That lead no longer exists.');
    if (deal) {
      const d = db.raw().prepare('SELECT lead_id FROM deals WHERE id = ?').get(deal) as { lead_id: number | null } | undefined;
      if (!d) fail('That deal no longer exists.');
      // A task cannot tie a deal to another lead (or another client's lead).
      if (lead && d!.lead_id != null && d!.lead_id !== lead) fail('That task\'s deal belongs to a different lead.');
    }
    return [t];
  },
  'tasks:delete': ([id]) => [int(id, 'task')],
  'companies:rename': ([id, name]) => { const s = str(name, 'Name', 120).trim(); if (!s) fail('The name cannot be empty.'); return [int(id, 'company'), s]; },
  'fields:set': ([entity, id, key, value]) => [entity === 'deal' ? 'deal' : 'lead', int(id), str(key, 'Field', 60), typeof value === 'object' && value !== null ? fail('Custom fields hold text, numbers or dates.') : value],
  'clients:set': ([cur, list]) => {
    const l = Array.isArray(list) ? list.map((x) => str(x, 'Client name', 80).trim()).filter(Boolean) : undefined;
    const c = str(cur, 'Client name', 80).trim();
    return [c, l];
  },
  'wa:open': ([id, ...r]) => [int(id, 'lead'), ...r], 'wa:cloud': ([id, ...r]) => [int(id, 'lead'), ...r],
};
export function check(ch: string, args: any[]) { const c = Object.prototype.hasOwnProperty.call(CHECKS, ch) ? CHECKS[ch] : undefined; return c ? c(args ?? []) : args; }
