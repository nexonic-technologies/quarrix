#!/usr/bin/env node
// Quarrix command line (QF-082). Talks to the running app's local API (Settings → Connections → Local API).
// Usage: quarrix <command> [args]   Run "quarrix help" for the list.
import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const dir = process.env.QUARRIX_DATA || (platform() === 'darwin' ? join(homedir(), 'Library/Application Support/Quarrix') : platform() === 'win32' ? join(process.env.APPDATA || '', 'Quarrix') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Quarrix'));
function conn() {
  try { return JSON.parse(readFileSync(join(dir, 'api.json'), 'utf8')); }
  catch { console.error('Quarrix is not running with the local API on. Open Quarrix → Settings → Connections → turn on "Local API".'); process.exit(2); }
}
async function call(method, path, body) {
  const c = conn();
  const r = await fetch(c.url + path, { method, headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!r) { console.error('Could not reach Quarrix. Is the app open?'); process.exit(2); }
  const j = await r.json();
  if (!r.ok) { console.error(j.error ?? `HTTP ${r.status}`); process.exit(1); }
  return j;
}
const [cmd, ...args] = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const json = args.includes('--json') ? (args.splice(args.indexOf('--json'), 1), true) : false;
const out = (v, row) => { if (json) console.log(JSON.stringify(v, null, 2)); else for (const x of v) console.log(row(x)); };
const help = `quarrix leads [text] [--grade A] [--limit 50]   list leads
quarrix lead <id>                                one lead with contacts and deals
quarrix search "<business type>" "<place>" [--sources osm,web]   start a search
quarrix searches                                 recent searches
quarrix deals | tasks | forecast                 CRM
quarrix jobs "<keywords>" [--country US]         search jobs
quarrix saved-jobs                               your applications
Add --json to any command for machine-readable output.`;
switch (cmd) {
  case 'leads': { const q = new URLSearchParams({ q: args.join(' '), grade: flag('grade', ''), limit: flag('limit', '50') }); const r = await call('GET', `/v1/leads?${q}`); out(r.rows, (l) => `${String(l.id).padStart(6)}  ${l.grade || '-'}  ${l.name}  ${l.email || ''}  ${[l.city, l.country].filter(Boolean).join(', ')}`); if (!json) console.log(`${r.total} total`); break; }
  case 'lead': console.log(JSON.stringify(await call('GET', `/v1/leads/${Number(args[0])}`), null, 2)); break;
  case 'search': { const sources = flag('sources', 'osm,web').split(','); const r = await call('POST', '/v1/searches', { category: args[0], place: args[1], sources }); console.log(json ? JSON.stringify(r) : `Search ${r.id} queued.`); break; }
  case 'searches': out(await call('GET', '/v1/searches'), (s) => `${String(s.id).padStart(5)}  ${s.status.padEnd(8)}  ${s.category} in ${s.place}  (+${s.added})`); break;
  case 'deals': out(await call('GET', '/v1/deals'), (d) => `${String(d.id).padStart(5)}  ${d.stage.padEnd(12)}  ${d.currency} ${Math.round(d.value)}  ${d.title}`); break;
  case 'tasks': out(await call('GET', '/v1/tasks?open=1'), (t) => `${t.due_at ? t.due_at.slice(0, 16).replace('T', ' ') : 'no date         '}  ${t.title}${t.lead_name ? ` (${t.lead_name})` : ''}`); break;
  case 'forecast': console.log(JSON.stringify(await call('GET', '/v1/forecast'), null, 2)); break;
  case 'jobs': { const r = await call('POST', '/v1/jobs/search', { keywords: args.join(' '), country: flag('country', '') }); out(r.jobs, (j) => `${j.title} · ${j.company} · ${j.location || '—'}${j.isNew ? ' · NEW' : ''}\n    ${j.url}`); break; }
  case 'saved-jobs': out(await call('GET', '/v1/jobs/saved'), (j) => `${(j.status || 'Saved').padEnd(10)} ${j.title} · ${j.company}`); break;
  default: console.log(help);
}
