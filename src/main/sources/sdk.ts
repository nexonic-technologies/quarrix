// Source SDK (QF-080): add a business source by dropping a JSON file in the "sources" folder. No code runs:
// Quarrix fetches the URL you describe (public internet only, with the usual limits) and maps fields by path.
// Format and examples: docs/SOURCE_SDK.md.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOT_UA, fetchText, sleep } from '../util';
import type { Candidate, Progress } from './types';

export type SdkSource = {
  id: string; name: string; license: string; attribution: string; url: string;
  items: string; fields: Partial<Record<'name' | 'category' | 'address' | 'city' | 'region' | 'country' | 'postcode' | 'lat' | 'lon' | 'phone' | 'email' | 'website' | 'id', string>>;
  pages?: { param: string; start: number; step: number; max: number };
  keyHeader?: string; keyQuery?: string; delayMs?: number;
};

const ID = /^[a-z0-9-]{2,32}$/;
const PATH = /^[A-Za-z0-9_$@:-]+(\.[A-Za-z0-9_$@:-]+|\[\d+\])*$/;
/** Check a source file; returns the cleaned source or throws with a plain message. Pure. */
export function validate(x: any): SdkSource {
  const err = (m: string) => { throw new Error(`Source "${x?.id ?? '?'}": ${m}`); };
  if (!x || typeof x !== 'object') err('not a JSON object');
  if (!ID.test(x.id ?? '')) err('id must be 2–32 lowercase letters, digits or dashes');
  for (const k of ['name', 'license', 'attribution', 'url']) if (typeof x[k] !== 'string' || !x[k].trim()) err(`"${k}" is required`);
  let u: URL;
  try { u = new URL(x.url.replace(/\{[a-z]+\}/g, 'x')); } catch { return err('"url" is not a valid link'); }
  if (u.protocol !== 'https:') err('"url" must start with https://');
  if (/\{key\}/.test(x.url) && !x.keyQuery) err('use "keyQuery" or "keyHeader" for keys instead of {key} in the url');
  if (typeof x.items !== 'string' || !(x.items === '' || PATH.test(x.items))) err('"items" must be a path like "results" or "data.places"');
  if (!x.fields || typeof x.fields !== 'object' || typeof x.fields.name !== 'string') err('"fields.name" is required');
  for (const [k, v] of Object.entries(x.fields)) if (typeof v !== 'string' || !PATH.test(v)) err(`"fields.${k}" must be a path`);
  if (x.pages && !(typeof x.pages.param === 'string' && [x.pages.start, x.pages.step, x.pages.max].every((n) => Number.isInteger(n) && n >= 0) && x.pages.max <= 50)) err('"pages" needs param, start, step and max (max 50)');
  if (x.keyHeader && !/^[A-Za-z0-9-]{1,40}$/.test(x.keyHeader)) err('"keyHeader" must be a header name');
  if (x.keyQuery && !/^[A-Za-z0-9_]{1,40}$/.test(x.keyQuery)) err('"keyQuery" must be a parameter name');
  return { ...x, delayMs: Math.max(500, Number(x.delayMs) || 1000) };
}

/** Read a value by path ("a.b[0].c"). Pure. */
export function pick(o: any, path: string): any {
  if (!path) return o;
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}

export function sourcesDir(userData: string) { const d = join(userData, 'sources'); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; }
export function loadSources(userData: string): { ok: SdkSource[]; errors: string[] } {
  const ok: SdkSource[] = [], errors: string[] = [];
  for (const f of readdirSync(sourcesDir(userData)).filter((x) => x.endsWith('.json'))) {
    try { ok.push(validate(JSON.parse(readFileSync(join(sourcesDir(userData), f), 'utf8')))); } catch (e: any) { errors.push(`${f}: ${e.message}`); }
  }
  return { ok, errors };
}

export async function runSdk(src: SdkSource, q: { category: string; city: string; country: string; lat?: number; lon?: number }, key: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const pages = src.pages ?? { param: '', start: 0, step: 0, max: 1 };
  for (let i = 0; i < Math.max(1, pages.max) && out.length < limit; i++) {
    const fill = (s: string) => s.replace(/\{(category|city|country|lat|lon)\}/g, (_, k) => encodeURIComponent(String((q as any)[k] ?? '')));
    const u = new URL(fill(src.url));
    if (pages.param) u.searchParams.set(pages.param, String(pages.start + i * pages.step));
    if (src.keyQuery && key) u.searchParams.set(src.keyQuery, key);
    const r = await fetchText(u.toString(), { ua: BOT_UA, timeout: 25000, maxBytes: 5_000_000, headers: { Accept: 'application/json', ...(src.keyHeader && key ? { [src.keyHeader]: key } : {}) } });
    if (!r.ok) throw new Error(`${src.name}: HTTP ${r.status}`);
    const rows = pick(JSON.parse(r.text), src.items);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const f = (k: keyof SdkSource['fields']) => { const v = src.fields[k] ? pick(row, src.fields[k]!) : undefined; return v == null ? '' : String(v).slice(0, 300); };
      const name = f('name');
      if (!name) continue;
      const num = (k: 'lat' | 'lon') => { const n = Number(f(k)); return f(k) !== '' && Number.isFinite(n) ? n : null; };
      out.push({ source: `sdk:${src.id}` as Candidate['source'], source_ref: `${src.id}:${f('id') || name}`, name, category: f('category') || q.category, address: f('address'), city: f('city') || q.city, region: f('region'), country: (f('country') || q.country).toUpperCase().slice(0, 2), postcode: f('postcode'), lat: num('lat'), lon: num('lon'), phone: f('phone'), email: f('email'), website: /^https?:\/\//.test(f('website')) ? f('website') : '', summary: `From ${src.name} (${src.attribution})` });
    }
    progress(`${src.name}: ${out.length} records`, out.length);
    if (!pages.param) break;
    await sleep(src.delayMs ?? 1000);
  }
  return out.slice(0, limit);
}
