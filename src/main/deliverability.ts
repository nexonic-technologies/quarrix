// Sender domain checks (QF-069) and the pre-send dry run (QF-065). Read-only.
import { resolveTxt } from 'node:dns/promises';
import * as db from './db';
import { dailyCap, recipientZone, senderId } from './mail';
import { dryRun, explainDns } from './rules';
import { outreachBlock } from './safety';
import { load } from './settings';

const txt = (name: string) => resolveTxt(name).then((r) => r.map((x) => x.join(''))).catch(() => [] as string[]);
const SELECTORS = ['google', 'selector1', 'selector2', 'default', 'k1', 's1', 's2', 'mail', 'dkim', 'smtp'];

export async function checkDomain(domain?: string) {
  const s = load();
  const d = (domain || senderId(s.email).split('@')[1] || '').toLowerCase().trim();
  if (!d) throw new Error('Set your sending email address first.');
  const [spf, dmarc, ...dk] = await Promise.all([txt(d), txt(`_dmarc.${d}`), ...SELECTORS.map((sel) => txt(`${sel}._domainkey.${d}`))]);
  const dkim = Object.fromEntries(SELECTORS.map((sel, i) => [sel, dk[i].some((x) => /v=dkim1|p=/i.test(x))]));
  const host = s.email.smtpHost.includes('google') ? '_spf.google.com' : s.email.smtpHost.includes('office365') || s.email.smtpHost.includes('outlook') ? 'spf.protection.outlook.com' : '';
  return { domain: d, checks: explainDns(d, spf, dmarc, dkim, host) };
}

export function dryRunPlan(days = 3) {
  const s = load();
  const rows = db.raw().prepare("SELECT m.id, m.step, m.due_at, l.* FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'scheduled' AND m.channel = 'email' ORDER BY COALESCE(m.due_at, '9999'), m.step LIMIT 500").all() as any[];
  const sentToday = (db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?").get(new Date().toISOString().slice(0, 10)) as { n: number }).n;
  const due = rows.filter((r) => r.due_at).map((r) => ({ id: r.id, lead: r.name, email: r.email, step: r.step, dueAt: r.due_at, zone: recipientZone(r, s), block: outreachBlock(r, !!r.email && db.isSuppressed(r.email, r.domain)) }));
  const plan = dryRun(due, { now: new Date(), cap: dailyCap(s), sentToday, gapMinutes: s.email.gapMinutes, window: s.email, days });
  const waiting = rows.filter((r) => !r.due_at).length;
  return { plan, waiting, cap: dailyCap(s), sentToday, authorized: !!s.email.authorizedAt, paused: s.email.pausedReason };
}
