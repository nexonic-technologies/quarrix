// Overture Maps places, read straight from Overture's public release files (GeoParquet on AWS Open Data, CDLA-Permissive 2.0
// / ODbL per source). There is no query API, so Quarrix reads only the file footers, picks the row groups whose bounding
// boxes overlap the searched area, and downloads just those (HTTP range requests). Attribution: Overture Maps Foundation.
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { fetchText } from '../util';
import type { Candidate, Progress } from './types';

const BUCKET = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
type Box = { s: number; n: number; w: number; e: number };

const keys = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((m) => m[1]);
async function list(prefix: string, delimiter = '') {
  const r = await fetchText(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}${delimiter ? '&delimiter=/' : ''}`, { timeout: 20000 });
  if (!r.ok) throw new Error(`Overture listing failed (HTTP ${r.status})`);
  return r.text;
}
/** Newest release folder, e.g. release/2026-11-19.0/ */
export async function latestRelease() {
  const p = keys(await list('release/', '/'), 'Prefix').filter((x) => /^release\/\d{4}-\d{2}-\d{2}/.test(x)).sort();
  if (!p.length) throw new Error('No Overture release found.');
  return p[p.length - 1];
}

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
    if ([xmin, xmax, ymin, ymax].every(Number.isFinite) && xmin <= box.e && xmax >= box.w && ymin <= box.n && ymax >= box.s) out.push({ start: row, end: row + n });
    row += n;
  }
  return out;
}

/** One Overture place row → a Quarrix candidate. Pure. */
export function rowToCandidate(p: any): Candidate | null {
  const name = p.names?.primary;
  if (!name) return null;
  const ad = (p.addresses ?? [])[0] ?? {};
  const b = p.bbox ?? {};
  return {
    source: 'overture', source_ref: `overture:${p.id}`, name, category: p.categories?.primary ?? '', address: ad.freeform ?? '', city: ad.locality ?? '',
    region: ad.region ?? '', country: String(ad.country ?? '').toUpperCase(), postcode: ad.postcode ?? '',
    lat: b.ymin != null ? (Number(b.ymin) + Number(b.ymax)) / 2 : null, lon: b.xmin != null ? (Number(b.xmin) + Number(b.xmax)) / 2 : null,
    phone: (p.phones ?? [])[0] ?? '', email: '', website: (p.websites ?? [])[0] ?? '', summary: 'Overture Maps Foundation',
  };
}

/** Places in a bounding box whose Overture category matches the searched business type. Reads at most maxGroups row groups. */
export async function searchOverture(category: string, box: Box, limit: number, progress: Progress, maxGroups = 8): Promise<Candidate[]> {
  const release = await latestRelease();
  const files = keys(await list(`${release}theme=places/type=place/`), 'Key').filter((k) => k.endsWith('.parquet'));
  if (!files.length) throw new Error('Overture places files not found in the latest release.');
  const words = category.toLowerCase().replace(/s\b/g, '').split(/\s+/).filter((w) => w.length > 2);
  const out: Candidate[] = [];
  let groups = 0;
  for (const [i, key] of files.entries()) {
    if (out.length >= limit || groups >= maxGroups) break;
    progress(`Overture: checking file ${i + 1} of ${files.length}`);
    const file = await asyncBufferFromUrl({ url: `${BUCKET}/${key}` });
    const meta = await parquetMetadataAsync(file);
    for (const g of overlappingGroups(meta, box)) {
      if (groups++ >= maxGroups || out.length >= limit) break;
      const rows = await parquetReadObjects({ file, metadata: meta, rowStart: g.start, rowEnd: g.end, columns: ['id', 'names', 'categories', 'websites', 'phones', 'addresses', 'bbox'], compressors });
      for (const r of rows as any[]) {
        const b = r.bbox ?? {};
        const lat = (Number(b.ymin) + Number(b.ymax)) / 2, lon = (Number(b.xmin) + Number(b.xmax)) / 2;
        if (!(lat >= box.s && lat <= box.n && lon >= box.w && lon <= box.e)) continue;
        const cat = `${r.categories?.primary ?? ''} ${(r.categories?.alternate ?? []).join(' ')}`.replace(/_/g, ' ').toLowerCase();
        if (words.length && !words.some((w) => cat.includes(w))) continue;
        const c = rowToCandidate(r);
        if (c) out.push(c);
      }
      progress(`Overture: ${out.length} places`, out.length);
    }
  }
  return out.slice(0, limit);
}
