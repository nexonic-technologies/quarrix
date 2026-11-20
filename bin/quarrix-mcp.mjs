#!/usr/bin/env node
// Optional MCP server for local assistants (QF-083). Speaks MCP over stdio and calls the Quarrix local API.
// Read-only tools by default; starting a search needs confirm: true. Add to an MCP client config as:
//   { "command": "node", "args": ["/path/to/quarrix/bin/quarrix-mcp.mjs"] }
import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const dir = process.env.QUARRIX_DATA || (platform() === 'darwin' ? join(homedir(), 'Library/Application Support/Quarrix') : platform() === 'win32' ? join(process.env.APPDATA || '', 'Quarrix') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Quarrix'));
async function api(method, path, body) {
  let c;
  try { c = JSON.parse(readFileSync(join(dir, 'api.json'), 'utf8')); } catch { throw new Error('Quarrix is not running with the local API on (Settings → Connections).'); }
  const r = await fetch(c.url + path, { method, headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
const TOOLS = [
  { name: 'list_leads', description: 'List saved business leads, best grade first. Optional text filter and grade (A-D).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, grade: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, limit: { type: 'number', maximum: 200 } } }, annotations: { readOnlyHint: true } },
  { name: 'get_lead', description: 'One lead with its contacts, deals and recent activity.', inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }, annotations: { readOnlyHint: true } },
  { name: 'list_deals', description: 'Deals in the sales pipeline.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'list_tasks', description: 'Open tasks and reminders.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'forecast', description: 'Pipeline value, weighted forecast and win rate.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'search_jobs', description: 'Search job boards and followed employers.', inputSchema: { type: 'object', properties: { keywords: { type: 'string' }, country: { type: 'string' } }, required: ['keywords'] }, annotations: { readOnlyHint: true } },
  { name: 'start_business_search', description: 'Queue a business search in Quarrix. Only after the user has agreed; set confirm to true.', inputSchema: { type: 'object', properties: { category: { type: 'string' }, place: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } }, confirm: { type: 'boolean' } }, required: ['category', 'place', 'confirm'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
];
async function callTool(name, a = {}) {
  switch (name) {
    case 'list_leads': return api('GET', `/v1/leads?${new URLSearchParams({ q: a.text ?? '', grade: a.grade ?? '', limit: String(a.limit ?? 30) })}`);
    case 'get_lead': return api('GET', `/v1/leads/${Number(a.id)}`);
    case 'list_deals': return api('GET', '/v1/deals');
    case 'list_tasks': return api('GET', '/v1/tasks?open=1');
    case 'forecast': return api('GET', '/v1/forecast');
    case 'search_jobs': return api('POST', '/v1/jobs/search', { keywords: a.keywords, country: a.country ?? '' });
    case 'start_business_search':
      if (a.confirm !== true) throw new Error('Ask the user first, then call again with confirm: true.');
      return api('POST', '/v1/searches', { category: a.category, place: a.place, sources: a.sources ?? ['osm', 'web'] });
  }
  throw new Error(`Unknown tool ${name}`);
}
const reply = (id, result, error) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }) + '\n');
createInterface({ input: process.stdin }).on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notifications
  try {
    if (m.method === 'initialize') return reply(m.id, { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'quarrix', version: '1.0.0' } });
    if (m.method === 'tools/list') return reply(m.id, { tools: TOOLS });
    if (m.method === 'tools/call') {
      try { const r = await callTool(m.params?.name, m.params?.arguments); return reply(m.id, { content: [{ type: 'text', text: JSON.stringify(r, null, 2).slice(0, 100000) }] }); }
      catch (e) { return reply(m.id, { content: [{ type: 'text', text: String(e.message ?? e) }], isError: true }); }
    }
    if (m.method === 'ping') return reply(m.id, {});
    reply(m.id, undefined, { code: -32601, message: 'Method not found' });
  } catch (e) { reply(m.id, undefined, { code: -32603, message: String(e.message ?? e) }); }
});
