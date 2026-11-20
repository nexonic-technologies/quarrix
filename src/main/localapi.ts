// Opt-in local REST API (QF-081): 127.0.0.1 only, bearer token, small JSON surface. Used by the CLI (QF-082),
// the MCP server (QF-083) and the capture bookmarklet (QF-090). Off by default.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import * as db from './db';
import * as crm from './crm';
import * as jobs from './jobs';
import * as jobstore from './jobstore';
import { load, save } from './settings';
import { domainOf, isPlatformHost } from './util';
import { SOURCES } from './sources/catalog';

let server: Server | null = null;
export const tokenFile = () => join(app.getPath('userData'), 'api.json');

/** A second token that can only save websites (/v1/capture). It is the one placed in the bookmarklet and extension,
 *  because a web page could read a bookmarklet's code; the full token never leaves Quarrix. */
export function captureToken() {
  let t = load().api?.captureToken;
  if (!t) { t = randomBytes(18).toString('base64url'); save({ api: { ...load().api, captureToken: t } }); }
  return t;
}
const hits: number[] = [];
const rateOk = () => { const now = Date.now(); while (hits.length && now - hits[0] > 60000) hits.shift(); hits.push(now); return hits.length <= 30; };

export function ensureToken() {
  let t = load().api?.token;
  if (!t) { t = randomBytes(24).toString('base64url'); save({ api: { ...(load().api ?? {}), token: t } }); }
  return t;
}

const send = (res: ServerResponse, code: number, body: unknown, cors = false) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}) });
  res.end(JSON.stringify(body));
};
const readBody = (req: IncomingMessage) => new Promise<any>((resolve, reject) => {
  let n = 0; const parts: Buffer[] = [];
  req.on('data', (c: Buffer) => { n += c.length; if (n > 1_000_000) { reject(new Error('Body too large')); req.destroy(); } else parts.push(c); });
  req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {}); } catch { reject(new Error('Body must be JSON')); } });
});
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const bearer = (req: IncomingMessage) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
const authed = (req: IncomingMessage, token: string) => same(bearer(req), token);

async function route(req: IncomingMessage, res: ServerResponse, token: string) {
  const u = new URL(req.url ?? '/', 'http://127.0.0.1');
  const path = u.pathname.replace(/\/+$/, '');
  // The capture bookmarklet runs on other sites, so it needs CORS and Chrome's private-network preflight.
  if (path === '/v1/capture' && req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Private-Network': 'true' });
    return res.end();
  }
  if (path === '/v1/health') return send(res, 200, { ok: true, app: 'Quarrix', version: app.getVersion() });
  if (path === '/v1/capture') {
    if (!(authed(req, token) || same(bearer(req), captureToken()))) return send(res, 401, { error: 'Wrong capture token. Copy the bookmarklet again from Settings → Connections.' }, true);
    if (!rateOk()) return send(res, 429, { error: 'Too many captures, wait a minute.' }, true);
  } else if (!authed(req, token)) return send(res, 401, { error: 'Missing or wrong token. Copy it from Settings → Connections.' });
  const num = (k: string, d: number, max = 1000) => Math.min(max, Math.max(1, Number(u.searchParams.get(k)) || d));
  if (req.method === 'GET' && path === '/v1/leads') return send(res, 200, db.queryLeads({ q: u.searchParams.get('q') ?? undefined, grade: u.searchParams.get('grade') ?? undefined, status: u.searchParams.get('status') ?? undefined, country: u.searchParams.get('country') ?? undefined, sort: u.searchParams.get('sort') ?? 'grade', limit: num('limit', 50), offset: Number(u.searchParams.get('offset')) || 0 }));
  const lm = path.match(/^\/v1\/leads\/(\d+)$/);
  if (req.method === 'GET' && lm) { const l = db.getLead(+lm[1]); return l ? send(res, 200, { lead: l, contacts: db.listContacts(l.id), deals: crm.leadDeals(l.id), events: db.eventsFor(l.id).slice(0, 30) }) : send(res, 404, { error: 'Not found' }); }
  if (req.method === 'GET' && path === '/v1/searches') return send(res, 200, db.listSearches(num('limit', 30, 200)));
  if (req.method === 'POST' && path === '/v1/searches') {
    const b = await readBody(req);
    const ids = new Set(SOURCES.map((s) => s.id));
    const srcs = (Array.isArray(b.sources) ? b.sources : ['osm', 'web']).map(String).filter((x: string) => ids.has(x));
    if (!b.category || !b.place || !srcs.length) return send(res, 400, { error: 'Send category, place and sources.' });
    return send(res, 201, { id: jobs.queueSearch(String(b.category).slice(0, 100), String(b.place).slice(0, 200), srcs) });
  }
  if (req.method === 'GET' && path === '/v1/deals') return send(res, 200, crm.listDeals());
  if (req.method === 'GET' && path === '/v1/forecast') return send(res, 200, crm.forecast());
  if (req.method === 'GET' && path === '/v1/tasks') return send(res, 200, crm.listTasks({ open: u.searchParams.get('open') === '1' }));
  if (req.method === 'GET' && path === '/v1/jobs/saved') return send(res, 200, db.savedJobs());
  if (req.method === 'POST' && path === '/v1/jobs/search') { const b = await readBody(req); if (!b.keywords) return send(res, 400, { error: 'Send keywords.' }); return send(res, 200, await jobstore.searchAll(b)); }
  if (req.method === 'POST' && path === '/v1/capture') {
    const b = await readBody(req);
    let url = '';
    try { const p = new URL(String(b.url)); if (/^https?:$/.test(p.protocol)) url = `${p.protocol}//${p.host}`; } catch { /* bad */ }
    if (!url || isPlatformHost(domainOf(url))) return send(res, 400, { error: 'Open the business\'s own website, then capture.' }, true);
    const [id, created] = db.upsertLead({ name: String(b.title || domainOf(url)).split(/\s[|–—-]\s/)[0].slice(0, 120), website: url, domain: domainOf(url), source: 'capture', source_ref: url, status: 'new', provenance: JSON.stringify({ listing: { source: 'capture', ref: String(b.url).slice(0, 500), at: db.now() } }) });
    if (created) void jobs.runEnrichment([id]);
    return send(res, created ? 201 : 200, { id, created }, true);
  }
  return send(res, 404, { error: 'Unknown endpoint. See docs/INTEGRATIONS.md.' });
}

export function start() {
  stop();
  const s = load().api;
  if (!s?.on) return null;
  const token = ensureToken();
  const port = Number(s.port) || 47811;
  server = createServer((req, res) => {
    // Refuse anything that did not come from this computer, and DNS-rebinding hosts.
    const host = (req.headers.host ?? '').split(':')[0];
    if (req.socket.remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.destroy(); return; }
    if (host && !['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'Bad host' });
    route(req, res, token).catch((e) => send(res, 500, { error: String(e.message ?? e) }));
  });
  server.listen(port, '127.0.0.1');
  // The CLI and MCP server read the port and token from here (file readable only by this user).
  writeFileSync(tokenFile(), JSON.stringify({ url: `http://127.0.0.1:${port}`, token }), { mode: 0o600 });
  return port;
}

export function stop() {
  server?.close();
  server = null;
  try { rmSync(tokenFile(), { force: true }); } catch { /* none */ }
}
