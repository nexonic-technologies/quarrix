// Sending leads to other tools (QF-085 HubSpot, QF-086 Google Sheets, QF-087 Notion). Each uses the user's own token.
// Leads marked "do not contact" or on the do-not-contact list are never sent.
import { exportable } from './exporters';
import * as db from './db';
import { authorize, refresh, requireClient } from './oauth';
import { load, save } from './settings';
import { fetchText } from './util';

type Result = { sent: number; updated: number; skipped: number; errors: string[] };
// Same rules as every other export: workspace, do-not-contact and the source's export terms.
const consented = (ids: number[]) => exportable(ids);
async function api(url: string, token: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetchText(url, { method, body: body ? JSON.stringify(body) : undefined, timeout: 30000, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extra } });
  const j = r.text ? JSON.parse(r.text) : {};
  if (r.status === 429) throw new Error('Rate limited by the service. Try again in a minute.');
  if (!r.ok) throw new Error(j.message || j.error?.message || `HTTP ${r.status}`);
  return j;
}

// ── HubSpot: companies by domain, contacts by email, linked together ──
export async function toHubspot(ids: number[]): Promise<Result> {
  const token = load().hubspot?.token;
  if (!token) throw new Error('Add a HubSpot private app token in Settings → Connections.');
  const out: Result = { sent: 0, updated: 0, skipped: ids.length, errors: [] };
  const leads = consented(ids);
  out.skipped -= leads.length;
  const H = 'https://api.hubapi.com';
  for (const l of leads) {
    try {
      const props = { name: l.name, domain: l.domain || undefined, phone: l.phone || undefined, city: l.city || undefined, country: l.country || undefined, website: l.website || undefined, description: l.summary || undefined };
      let companyId = '';
      if (l.domain) {
        const f = await api(`${H}/crm/v3/objects/companies/search`, token, 'POST', { filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: l.domain }] }], limit: 1 });
        companyId = f.results?.[0]?.id ?? '';
      }
      if (companyId) { await api(`${H}/crm/v3/objects/companies/${companyId}`, token, 'PATCH', { properties: props }); out.updated++; }
      else { companyId = (await api(`${H}/crm/v3/objects/companies`, token, 'POST', { properties: props })).id; out.sent++; }
      if (l.email) {
        const [first, ...rest] = (l.contact_name || '').split(' ');
        const cp = { email: l.email, firstname: first || undefined, lastname: rest.join(' ') || undefined, jobtitle: l.contact_role || undefined, phone: l.phone || undefined };
        const f = await api(`${H}/crm/v3/objects/contacts/search`, token, 'POST', { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: l.email }] }], limit: 1 });
        const contactId = f.results?.[0]?.id ?? (await api(`${H}/crm/v3/objects/contacts`, token, 'POST', { properties: cp })).id;
        await api(`${H}/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`, token, 'PUT');
      }
      db.logEvent(l.id, 'sync', 'Sent to HubSpot');
    } catch (e: any) { out.errors.push(`${l.name}: ${e.message ?? e}`); if (/rate limited|401|403/i.test(String(e.message))) break; }
  }
  return out;
}

// ── Notion: one page per lead in a database, matching property names and types ──
export async function toNotion(ids: number[]): Promise<Result> {
  const { token, databaseId } = load().notion ?? { token: '', databaseId: '' };
  if (!token || !databaseId) throw new Error('Add a Notion integration token and database ID in Settings → Connections.');
  const N = 'https://api.notion.com/v1', V = { 'Notion-Version': '2022-06-28' };
  const dbInfo = await api(`${N}/databases/${databaseId}`, token, 'GET', undefined, V);
  const props = dbInfo.properties as Record<string, { type: string }>;
  const title = Object.entries(props).find(([, p]) => p.type === 'title')?.[0];
  if (!title) throw new Error('That Notion database has no title column.');
  const find = (names: string[], type: string) => Object.entries(props).find(([k, p]) => p.type === type && names.includes(k.toLowerCase()))?.[0];
  const map: [string | undefined, (l: db.Lead) => unknown][] = [
    [find(['email', 'e-mail'], 'email'), (l) => (l.email ? { email: l.email } : null)],
    [find(['phone', 'telephone'], 'phone_number'), (l) => (l.phone ? { phone_number: l.phone } : null)],
    [find(['website', 'url', 'site'], 'url'), (l) => (l.website ? { url: l.website } : null)],
    [find(['city', 'location'], 'rich_text'), (l) => ({ rich_text: [{ text: { content: [l.city, l.country].filter(Boolean).join(', ') } }] })],
    [find(['category', 'type', 'industry'], 'rich_text'), (l) => ({ rich_text: [{ text: { content: l.category } }] })],
    [find(['status', 'stage'], 'select'), (l) => ({ select: { name: l.status } })],
    [find(['grade'], 'select'), (l) => (l.grade ? { select: { name: l.grade } } : null)],
    [find(['contact', 'contact person', 'owner'], 'rich_text'), (l) => ({ rich_text: [{ text: { content: [l.contact_name, l.contact_role].filter(Boolean).join(', ') } }] })],
  ];
  const out: Result = { sent: 0, updated: 0, skipped: ids.length, errors: [] };
  const leads = consented(ids);
  out.skipped -= leads.length;
  for (const l of leads) {
    try {
      const properties: Record<string, unknown> = { [title]: { title: [{ text: { content: l.name.slice(0, 200) } }] } };
      for (const [k, fn] of map) { const v = k ? fn(l) : null; if (k && v) properties[k] = v; }
      await api(`${N}/pages`, token, 'POST', { parent: { database_id: databaseId }, properties }, V);
      out.sent++;
      db.logEvent(l.id, 'sync', 'Sent to Notion');
      await new Promise((r) => setTimeout(r, 350)); // Notion allows about 3 requests a second
    } catch (e: any) { out.errors.push(`${l.name}: ${e.message ?? e}`); if (/rate limited|401|403/i.test(String(e.message))) break; }
  }
  return out;
}

// ── Google Sheets: append rows with the Sheets API, signed in with the user's own Google OAuth client ──
const SHEETS = 'https://www.googleapis.com/auth/spreadsheets openid email';
export async function connectSheets() {
  const c = requireClient('google'); // the Google client from Settings → Email also works for Sheets
  const t = await authorize('google', SHEETS, c.id, c.secret);
  if (!t.refresh_token) throw new Error('Google did not return a long-lived token. Remove Quarrix from your Google account\'s connected apps and try again.');
  let user = '';
  try { user = JSON.parse(Buffer.from((t.id_token ?? '').split('.')[1], 'base64').toString()).email ?? ''; } catch { /* no id token */ }
  save({ sheets: { ...(load().sheets ?? {}), refresh: t.refresh_token, user } });
  return user;
}
export async function toSheets(ids: number[]): Promise<Result> {
  const s = load();
  const id = (s.sheets?.spreadsheetId ?? '').match(/[-\w]{25,}/)?.[0];
  if (!id) throw new Error('Paste the Google Sheet link or ID in Settings → Connections.');
  if (!s.sheets?.refresh) throw new Error('Connect Google Sheets in Settings → Connections.');
  const g = requireClient('google');
  const tok = (await refresh('google', s.sheets.refresh, SHEETS, g.id, g.secret)).access_token;
  const leads = consented(ids);
  const rows = leads.map((l) => [l.name, l.category, l.email, l.phone, l.website, l.address, l.city, l.country, l.status, l.grade, l.contact_name, l.source, new Date().toISOString().slice(0, 10)]);
  const head = [['Name', 'Category', 'Email', 'Phone', 'Website', 'Address', 'City', 'Country', 'Status', 'Grade', 'Contact', 'Source', 'Exported']];
  const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, tok);
  const tab = meta.sheets?.[0]?.properties?.title ?? 'Sheet1';
  const existing = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1:A2`)}`, tok);
  const values = (existing.values?.length ? [] : head).concat(rows.map((r) => r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v ?? ''))));
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, tok, 'POST', { values });
  for (const l of leads) db.logEvent(l.id, 'sync', 'Sent to Google Sheets');
  return { sent: leads.length, updated: 0, skipped: ids.length - leads.length, errors: [] };
}
