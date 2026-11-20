// Per-source daily request ceilings (QF-012). Every network request is counted by host; a source over its
// ceiling stops with a clear message instead of running up an API bill.
import * as db from './db';
import { load } from './settings';
import { sourceForHost, sourceInfo } from './sources/catalog';
import { onRequest } from './util';

export class BudgetError extends Error {}

function feedHosts() {
  const out: Record<string, string> = {};
  for (const f of load().openFeeds ?? []) { try { out[new URL(f.url).hostname] = 'opendata'; } catch { /* bad URL */ } }
  return out;
}

export function spend(source: string, n = 1) {
  const cap = load().budgets?.[source] ?? 0;
  const used = db.usageToday()[source] ?? 0;
  if (cap > 0 && used + n > cap) throw new BudgetError(`${sourceInfo(source)?.name ?? source} reached today's limit of ${cap} requests (Settings → Sources → Limits).`);
  db.addUsage(source, n);
}

export const remaining = (source: string) => {
  const cap = load().budgets?.[source] ?? 0;
  return cap > 0 ? Math.max(0, cap - (db.usageToday()[source] ?? 0)) : Infinity;
};

export function install() {
  onRequest((host) => { const src = sourceForHost(host, feedHosts()); if (src) spend(src); });
}
