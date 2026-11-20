// Overture Maps places, read straight from Overture's public release files (GeoParquet on AWS Open Data, CDLA-Permissive 2.0
// / ODbL per source). There is no query API, so Quarrix reads only the file footers, picks the row groups whose bounding
// boxes overlap the searched area, and downloads just those (HTTP range requests). Attribution: Overture Maps Foundation.
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { fetchText, safeFetch } from '../util';
import type { Candidate, Progress } from './types';

const BUCKET = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
type Box = { s: number; n: number; w: number; e: number };

const keys = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((m) => m[1]);
/** Objects in a listing page with their sizes (sizes let the reader skip a HEAD request). Pure. */
export const listedFiles = (xml: string) => [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({ key: keys(m[1], 'Key')[0] ?? '', size: Number(keys(m[1], 'Size')[0] ?? 0) })).filter((f) => f.key);
/** Every page of an S3 listing (1,000 keys a page), following continuation tokens. */
async function listAll(prefix: string, delimiter = '') {
  const pages: string[] = [];
  let token = '';
  for (let i = 0; i < 50; i++) {
    const r = await fetchText(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}${delimiter ? '&delimiter=/' : ''}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`, { timeout: 20000, maxBytes: 5_000_000 });
    if (!r.ok) throw new Error(`Overture listing failed (HTTP ${r.status})`);
    pages.push(r.text);
    if (!/<IsTruncated>true<\/IsTruncated>/.test(r.text)) break;
    token = keys(r.text, 'NextContinuationToken')[0] ?? '';
    if (!token) break;
  }
  return pages;
}
async function list(prefix: string, delimiter = '') { return (await listAll(prefix, delimiter)).join('\n'); }
/** Newest release folder, e.g. release/2026-11-19.0/ */
export async function latestRelease() {
  const p = keys(await list('release/', '/'), 'Prefix').filter((x) => /^release\/\d{4}-\d{2}-\d{2}/.test(x)).sort();
  if (!p.length) throw new Error('No Overture release found.');
  return p[p.length - 1];
}

/** A box that crosses the 180° meridian (west > east) is split in two. Pure. */
export const boxes = (b: Box): Box[] => (b.w <= b.e ? [b] : [{ ...b, e: 180 }, { ...b, w: -180 }]);
export const inBox = (lat: number, lon: number, b: Box) => lat >= b.s && lat <= b.n && boxes(b).some((x) => lon >= x.w && lon <= x.e);
/** Category words: plurals reduced, short words dropped, underscores in Overture categories match spaces. Pure. */
export const categoryWords = (category: string) => category.toLowerCase().split(/[\s,/&-]+/).map((w) => w.replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1')).filter((w) => w.length > 2 && !['and', 'the', 'for', 'shop', 'store', 'services', 'service'].includes(w));
export const categoryMatches = (words: string[], primary: string, alternate: string[] = []) => !words.length || words.some((w) => `${primary} ${alternate.join(' ')}`.replace(/_/g, ' ').toLowerCase().includes(w));

/** Row groups whose bbox statistics overlap the area. Pure, exported for tests. */
export function overlappingGroups(meta: any, box: Box) {
  const colIdx = (name: string) => meta.row_groups[0]?.columns.findIndex((c: any) => (c.meta_data?.path_in_schema ?? []).join('.') === `bbox.${name}`);
  const ix = { xmin: colIdx('xmin'), xmax: colIdx('xmax'), ymin: colIdx('ymin'), ymax: colIdx('ymax') };
  if (Object.values(ix).some((i) => i < 0)) return [];
  const out: { start: number; end: number }[] = [];
  let row = 0;
  for (const g of meta.row_groups) {
    const st = (i: number) => g.columns[i].meta_data?.statistics ?? {};
    const xmin = Number(st(ix.xmin).min_value ?? st(ix.xmin).min), xmax = Number(st(ix.xmax).max_value ?? st(ix.xmax).max);
    const ymin = Number(st(ix.ymin).min_value ?? st(ix.ymin).min), ymax = Number(st(ix.ymax).max_value ?? st(ix.ymax).max);
    const n = Number(g.num_rows);
    if ([xmin, xmax, ymin, ymax].every(Number.isFinite) && ymin <= box.n && ymax >= box.s && boxes(box).some((b) => xmin <= b.e && xmax >= b.w)) out.push({ start: row, end: row + n });
    row += n;
  }
  return out;
}

/** Category of a place across Overture schema versions: `categories` (to mid-2025), then `taxonomy` and `basic_category`. Pure. */
export function placeCategory(p: any): { primary: string; alternates: string[] } {
  const t = p.taxonomy, c = p.categories;
  const primary = t?.primary ?? c?.primary ?? p.basic_category ?? '';
  const alternates = [...(t?.alternates ?? []), ...(t?.hierarchy ?? []), ...(c?.alternate ?? []), ...(p.basic_category ? [p.basic_category] : [])].map(String);
  return { primary: String(primary), alternates };
}
/** Columns this release actually has (the place schema changes between releases). Pure. */
export function placeColumns(meta: any) {
  const top = new Set<string>();
  for (const g of meta.row_groups?.slice(0, 1) ?? []) for (const c of g.columns ?? []) top.add((c.meta_data?.path_in_schema ?? [])[0]);
  const want = ['id', 'names', 'categories', 'taxonomy', 'basic_category', 'websites', 'phones', 'addresses', 'bbox'];
  return want.filter((w) => top.has(w));
}

/** One Overture place row → a Quarrix candidate. Pure. */
export function rowToCandidate(p: any): Candidate | null {
  const name = p.names?.primary;
  if (!name) return null;
  const ad = (p.addresses ?? [])[0] ?? {};
  const b = p.bbox ?? {};
  return {
    source: 'overture', source_ref: `overture:${p.id}`, name, category: placeCategory(p).primary, address: ad.freeform ?? '', city: ad.locality ?? '',
    region: ad.region ?? '', country: String(ad.country ?? '').toUpperCase(), postcode: ad.postcode ?? '',
    lat: b.ymin != null ? (Number(b.ymin) + Number(b.ymax)) / 2 : null, lon: b.xmin != null ? (Number(b.xmin) + Number(b.xmax)) / 2 : null,
    phone: (p.phones ?? [])[0] ?? '', email: '', website: (p.websites ?? [])[0] ?? '', summary: 'Overture Maps Foundation',
  };
}

/**
 * Places in a bounding box whose Overture category matches the searched business type.
 * Every release file's footer is checked (footers are small), so no part of the world is skipped; row groups are then read
 * in file order until the limit is reached or the read budget (maxGroups) is used. When the budget stops the read early,
 * the progress message says the result is partial instead of presenting it as complete.
 */
export async function searchOverture(category: string, box: Box, limit: number, progress: Progress, maxGroups = 40): Promise<Candidate[]> {
  const release = await latestRelease();
  const files = listedFiles(await list(`${release}theme=places/type=place/`)).filter((f) => f.key.endsWith('.parquet'));
  if (!files.length) throw new Error('Overture places files not found in the latest release.');
  const words = categoryWords(category);
  const plan: { file: any; meta: any; start: number; end: number }[] = [];
  for (const [i, f] of files.entries()) {
    progress(`Overture: reading index ${i + 1} of ${files.length}`);
    const file = await asyncBufferFromUrl({ url: `${BUCKET}/${f.key}`, byteLength: f.size || undefined, fetch: safeFetch as typeof fetch });
    const meta = await parquetMetadataAsync(file);
    for (const g of overlappingGroups(meta, box)) plan.push({ file, meta, ...g });
  }
  const out: Candidate[] = [];
  const seen = new Set<string>();
  let read = 0;
  for (const g of plan) {
    if (out.length >= limit) break;
    if (read >= maxGroups) { progress(`Overture: stopped after ${read} of ${plan.length} map blocks (read limit); results for this area are partial`, out.length); break; }
    read++;
    const rows = await parquetReadObjects({ file: g.file, metadata: g.meta, rowStart: g.start, rowEnd: g.end, columns: placeColumns(g.meta), compressors });
    for (const r of rows as any[]) {
      const b = r.bbox ?? {};
      const lat = (Number(b.ymin) + Number(b.ymax)) / 2, lon = (Number(b.xmin) + Number(b.xmax)) / 2;
      if (!inBox(lat, lon, box) || seen.has(r.id)) continue;
      const pc = placeCategory(r);
      if (!categoryMatches(words, pc.primary, pc.alternates)) continue;
      const c = rowToCandidate(r);
      if (c) { seen.add(r.id); out.push(c); }
    }
    progress(`Overture: ${out.length} places (${read} of ${plan.length} map blocks)`, out.length);
  }
  return out.slice(0, limit);
}
