// Structured exports (QF-089): PostgreSQL table and S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO).
// Optional and user-configured; only leads the user chooses, never do-not-contact leads, and only sources whose terms allow export.
import { createHash, createHmac } from 'node:crypto';
import * as db from './db';
import { load } from './settings';
import { sourceInfo } from './sources/catalog';
import { fetchTrusted } from './util';

const exportable = (ids: number[]) => ids.map((id) => db.getLead(id)).filter((l): l is db.Lead => !!l && l.status !== 'do_not_contact' && !(l.email && db.isSuppressed(l.email, l.domain)) && sourceInfo(l.source)?.export !== false);
const COLS = ['id', 'name', 'category', 'email', 'phone', 'website', 'address', 'city', 'region', 'country', 'postcode', 'lat', 'lon', 'rating', 'reviews', 'status', 'grade', 'contact_name', 'contact_role', 'source', 'created_at'] as const;

export async function toPostgres(ids: number[]) {
  const c = load().exports?.postgres;
  if (!c?.url) throw new Error('Add a PostgreSQL connection link in Settings → Connections.');
  const table = (c.table || 'quarrix_leads').replace(/[^a-z0-9_]/gi, '');
  const { Client } = await import('pg');
  const client = new Client({ connectionString: c.url, ssl: /sslmode=disable/.test(c.url) ? false : { rejectUnauthorized: !c.allowSelfSigned }, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (quarrix_id INTEGER PRIMARY KEY, ${COLS.filter((k) => k !== 'id').map((k) => `${k} ${['lat', 'lon', 'rating'].includes(k) ? 'DOUBLE PRECISION' : k === 'reviews' ? 'INTEGER' : 'TEXT'}`).join(', ')}, exported_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const rows = exportable(ids);
    const cols = COLS.filter((k) => k !== 'id');
    for (const l of rows) {
      await client.query(`INSERT INTO ${table} (quarrix_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
        ON CONFLICT (quarrix_id) DO UPDATE SET ${cols.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, exported_at = now()`, [l.id, ...cols.map((k) => (l as any)[k] ?? null)]);
    }
    return { sent: rows.length, updated: 0, skipped: ids.length - rows.length, errors: [] as string[], table };
  } finally { await client.end(); }
}

/** AWS Signature V4 for a single PUT (pure, exported for tests). */
export function signS3(o: { method: string; url: string; region: string; accessKey: string; secretKey: string; body: Buffer; type: string; date: Date }) {
  const u = new URL(o.url);
  const amz = o.date.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = amz.slice(0, 8);
  const hash = createHash('sha256').update(o.body).digest('hex');
  const headers: Record<string, string> = { host: u.host, 'x-amz-content-sha256': hash, 'x-amz-date': amz, 'content-type': o.type };
  const names = Object.keys(headers).sort();
  const canonical = [o.method, u.pathname.split('/').map(encodeURIComponent).join('/'), u.searchParams.toString(), ...names.map((k) => `${k}:${headers[k]}`), '', names.join(';'), hash].join('\n');
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const kSigning = createHmac('sha256', createHmac('sha256', createHmac('sha256', createHmac('sha256', `AWS4${o.secretKey}`).update(day).digest()).update(o.region).digest()).update('s3').digest()).update('aws4_request').digest();
  const sig = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}` };
}

export async function toS3(ids: number[]) {
  const c = load().exports?.s3;
  if (!c?.endpoint || !c.bucket || !c.accessKey || !c.secretKey) throw new Error('Fill in the S3 endpoint, bucket and keys in Settings → Connections.');
  const rows = exportable(ids).map((l) => Object.fromEntries(COLS.map((k) => [k, (l as any)[k] ?? null])));
  const body = Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const key = `${(c.prefix || 'quarrix/').replace(/^\/+/, '')}leads-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const url = `${c.endpoint.replace(/\/+$/, '')}/${c.bucket}/${key}`;
  const headers = signS3({ method: 'PUT', url, region: c.region || 'us-east-1', accessKey: c.accessKey, secretKey: c.secretKey, body, type: 'application/x-ndjson', date: new Date() });
  const r = await fetchTrusted(url, { method: 'PUT', body, headers, timeout: 60000 });
  if (r.status >= 300) throw new Error(`Storage refused the upload (HTTP ${r.status}): ${r.text.replace(/<[^>]+>/g, ' ').trim().slice(0, 160)}`);
  return { sent: rows.length, updated: 0, skipped: ids.length - rows.length, errors: [] as string[], key };
}
