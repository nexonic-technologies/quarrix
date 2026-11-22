// Per-source daily request ceilings (QF-012). Every network request is counted by host; a source over its
// ceiling stops with a clear message instead of running up an API bill.
import * as db from './db';
import { load } from './settings';
import { sourceForHost, sourceInfo } from './sources/catalog';
import { onRequest } from './util';

export class BudgetError extends Error {}
export const KEYED_LIMITS: Record<string,number> = { places:200,tomtom:2000,foursquare:500,hunter:25,zerobounce:50,adzuna:20,jooble:20,writing:50 };
const capFor = (source:string) => { const n=load().budgets?.[source]; return Object.hasOwn(KEYED_LIMITS,source) ? (Number.isFinite(n)&&n>0?Math.floor(n):0) : n??0; };

function feedHosts() {
  const out: Record<string, string> = {};
  for (const f of load().openFeeds ?? []) { try { out[new URL(f.url).hostname] = 'opendata'; } catch { /* bad URL */ } }
  return out;
}

export function spend(source: string, n = 1) {
  const cap = capFor(source);
  if(Object.hasOwn(KEYED_LIMITS,source)&&(load().allowKeyedServices!==true||cap===0))throw new BudgetError('Optional service paused; enable credential-based services and a positive daily limit in Settings.');
  const used = db.usageToday()[source] ?? 0;
  if (cap > 0 && used + n > cap) throw new BudgetError(`${sourceInfo(source)?.name ?? source} reached today's limit of ${cap} requests (Settings → Sources → Limits).`);
  db.addUsage(source, n);
}

export const remaining = (source: string) => {
  const cap = capFor(source);
  if(Object.hasOwn(KEYED_LIMITS,source)&&(load().allowKeyedServices!==true||cap===0))return 0;
  return cap > 0 ? Math.max(0, cap - (db.usageToday()[source] ?? 0)) : Infinity;
};

export function install() {
  onRequest((host) => { const src = host==='api.adzuna.com'?'adzuna':host==='jooble.org'?'jooble':sourceForHost(host)??sourceForHost(host, feedHosts()); if (src) spend(src); });
}
