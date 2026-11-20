// Automations (QF-076 to QF-078): when something happens, check conditions, then act. Plus signed webhooks (QF-084).
// Conditions and actions are a fixed, safe vocabulary: no user code runs.
import { createHmac } from 'node:crypto';
import * as db from './db';
import { load } from './settings';
import { fetchTrusted, sleep } from './util';

export const TRIGGERS: Record<string, string> = {
  lead_created: 'A new lead is saved', lead_enriched: 'A lead\'s website was checked', reply: 'A reply arrives', signal: 'A buying signal appears',
  deal: 'A deal changes', sent: 'An email is sent', bounce: 'An email bounces', search_done: 'A search finishes',
};
export type Condition = { field: string; op: 'eq' | 'neq' | 'in' | 'contains' | 'gte' | 'lte' | 'empty' | 'notempty'; value?: string };
export type Action = { type: 'tag' | 'status' | 'task' | 'webhook' | 'deal' | 'draft'; value?: string; days?: number };
export type Rule = { id: string; name: string; on: boolean; trigger: string; conditions: Condition[]; actions: Action[] };

export const FIELDS = ['grade', 'relevance', 'evidence', 'fit', 'status', 'country', 'city', 'category', 'email_status', 'rating', 'reviews', 'source', 'tags', 'detail'];

/** Editable starting points (QF-077). */
export const TEMPLATES: Rule[] = [
  { id: 't1', name: 'A-grade leads with a confirmed email: draft an email', on: false, trigger: 'lead_enriched', conditions: [{ field: 'grade', op: 'eq', value: 'A' }, { field: 'email_status', op: 'in', value: 'verified,mx-ok' }], actions: [{ type: 'draft' }, { type: 'tag', value: 'auto-drafted' }] },
  { id: 't2', name: 'Interested reply: open a deal and a call task', on: false, trigger: 'reply', conditions: [{ field: 'status', op: 'eq', value: 'interested' }], actions: [{ type: 'deal', value: 'New opportunity' }, { type: 'task', value: 'Call back', days: 1 }] },
  { id: 't3', name: 'Hot signal: follow-up task tomorrow', on: false, trigger: 'signal', conditions: [{ field: 'detail', op: 'contains', value: '' }], actions: [{ type: 'task', value: 'Reach out about the signal', days: 1 }] },
  { id: 't4', name: 'Poor matches: tag for review', on: false, trigger: 'lead_enriched', conditions: [{ field: 'grade', op: 'eq', value: 'D' }], actions: [{ type: 'tag', value: 'low-fit' }] },
  { id: 't5', name: 'Send every reply to a webhook (Zapier, Make, n8n)', on: false, trigger: 'reply', conditions: [], actions: [{ type: 'webhook' }] },
];

/** Pure: does this record pass every condition? */
export function matches(rec: Record<string, unknown>, conds: Condition[]) {
  return conds.every((c) => {
    const v = rec[c.field];
    const s = v == null ? '' : String(v).toLowerCase();
    const want = (c.value ?? '').toLowerCase();
    switch (c.op) {
      case 'eq': return s === want;
      case 'neq': return s !== want;
      case 'in': return want.split(',').map((x) => x.trim()).includes(s);
      case 'contains': return s.includes(want);
      case 'gte': return v != null && v !== '' && Number(v) >= Number(c.value);
      case 'lte': return v != null && v !== '' && Number(v) <= Number(c.value);
      case 'empty': return s === '';
      case 'notempty': return s !== '';
    }
    return false;
  });
}

export const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');

/** Post an event to every matching webhook, signed, with up to three tries (QF-084). */
export async function deliver(event: string, payload: unknown, only?: string) {
  const hooks = (load().webhooks ?? []).filter((w) => w.on && (only ? w.url === only : !w.events.length || w.events.includes(event)));
  for (const w of hooks) {
    const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetchTrusted(w.url, { method: 'POST', body, timeout: 15000, headers: { 'Content-Type': 'application/json', 'X-Quarrix-Event': event, 'X-Quarrix-Signature': `sha256=${sign(w.secret, body)}` } });
        db.raw().prepare('INSERT INTO webhook_log (at, url, event, status) VALUES (?, ?, ?, ?)').run(db.now(), w.url, event, r.status);
        if (r.status < 500) break;
      } catch (e: any) { db.raw().prepare('INSERT INTO webhook_log (at, url, event, status, error) VALUES (?, ?, ?, 0, ?)').run(db.now(), w.url, event, String(e.message ?? e).slice(0, 200)); }
      await sleep(2000 * 4 ** i);
    }
  }
}

let drafting: (ids: number[]) => Promise<unknown> = async () => undefined;
export const setDrafter = (fn: typeof drafting) => { drafting = fn; };

async function act(a: Action, leadId: number | null, rec: Record<string, any>, rule: Rule) {
  const lead = leadId ? db.getLead(leadId) : null;
  switch (a.type) {
    case 'tag': if (lead && a.value) { const tags = new Set(lead.tags.split(',').map((x) => x.trim()).filter(Boolean)); tags.add(a.value); db.updateLead(lead.id, { tags: [...tags].join(', ') }); } break;
    case 'status': if (lead && a.value && db.STATUSES.includes(a.value as never)) db.updateLead(lead.id, { status: a.value }); break;
    case 'task': db.raw().prepare('INSERT INTO tasks (lead_id, title, kind, due_at, created_at) VALUES (?, ?, ?, ?, ?)').run(leadId, a.value || rule.name, 'task', new Date(Date.now() + (a.days ?? 1) * 864e5).toISOString(), db.now()); break;
    case 'deal': if (lead && !db.raw().prepare("SELECT 1 FROM deals WHERE lead_id = ? AND stage NOT IN ('won','lost')").get(lead.id)) db.raw().prepare("INSERT INTO deals (lead_id, title, stage, created_at, updated_at) VALUES (?, ?, 'talking', ?, ?)").run(lead.id, `${lead.name}: ${a.value || 'Opportunity'}`, db.now(), db.now()); break;
    case 'draft': if (lead?.email && !db.raw().prepare("SELECT 1 FROM messages WHERE lead_id = ? AND status IN ('draft','scheduled','sent')").get(lead.id)) await drafting([lead.id]); break; // drafts still need approval
    case 'webhook': await deliver(rule.trigger, { rule: rule.name, lead: lead ?? null, ...rec }, a.value || undefined); break;
  }
}

/** Called for every event. Rules run in order; each rule's run is logged. */
export async function handle(leadId: number | null, type: string, detail: string) {
  const rules = (load().automations ?? []).filter((r) => r.on && r.trigger === type);
  const hooks = (load().webhooks ?? []).filter((w) => w.on && w.events.includes(type));
  if (!rules.length && !hooks.length) return;
  const lead = leadId ? db.getLead(leadId) : null;
  const rec: Record<string, unknown> = { ...(lead ?? {}), detail };
  if (hooks.length) void deliver(type, { lead, detail });
  for (const r of rules) {
    if (!matches(rec, r.conditions)) continue;
    for (const a of r.actions) {
      try { await act(a, leadId, rec, r); } catch (e: any) { db.logEvent(leadId, 'automation_error', `${r.name}: ${e.message ?? e}`); }
    }
    db.raw().prepare('INSERT INTO automation_log (at, rule, lead_id, event) VALUES (?, ?, ?, ?)').run(db.now(), r.name, leadId, type);
  }
}

export function migrate() {
  db.raw().exec(`CREATE TABLE IF NOT EXISTS webhook_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, url TEXT NOT NULL, event TEXT NOT NULL, status INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS automation_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, rule TEXT NOT NULL, lead_id INTEGER, event TEXT NOT NULL);`);
}
export const recentRuns = () => ({ rules: db.raw().prepare('SELECT * FROM automation_log ORDER BY id DESC LIMIT 50').all(), hooks: db.raw().prepare('SELECT * FROM webhook_log ORDER BY id DESC LIMIT 50').all() });
