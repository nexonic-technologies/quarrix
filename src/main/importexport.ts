// Import leads from CSV, Excel, JSON or PDF, and export them to CSV, Excel or JSON.
import { overtureToCandidates } from './sources/opendata';
import { sourceInfo } from './sources/catalog';
import { computed } from './crm';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as db from './db';
import { complete, parseJson } from './ai';
import { extractEmails } from './enrich';
import { load } from './settings';
import { csvSafe, domainOf, normalizePhone } from './util';

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'business', 'business name', 'company', 'company name', 'organisation', 'organization', 'title'],
  category: ['category', 'industry', 'type', 'business type', 'niche', 'sector'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'phone number', 'contact number', 'whatsapp'],
  website: ['website', 'url', 'site', 'web', 'domain', 'homepage'],
  address: ['address', 'street', 'full address', 'address 1'],
  city: ['city', 'town', 'locality'],
  region: ['state', 'region', 'province', 'county'],
  country: ['country', 'country code'],
  postcode: ['zip', 'zip code', 'postcode', 'postal code'],
  notes: ['notes', 'note', 'comments', 'description'],
  tags: ['tags', 'labels'],
};

export function mapHeaders(headers: string[]) {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const k = h.trim().toLowerCase().replace(/[_]+/g, ' ');
    for (const [field, names] of Object.entries(FIELD_ALIASES)) {
      if (!Object.values(map).includes(field) && (names.includes(k) || names.some((n) => k.startsWith(n + ' ')))) { map[h] = field; break; }
    }
  }
  return map;
}

function rowToLead(row: Record<string, unknown>, map: Record<string, string>): Partial<db.Lead> | null {
  const l: Record<string, string> = {};
  for (const [h, f] of Object.entries(map)) {
    const v = row[h];
    if (v !== undefined && v !== null && String(v).trim()) l[f] = String(typeof v === 'object' && v && 'text' in (v as any) ? (v as any).text : v).trim();
  }
  if (!l.name && !l.email && !l.website && !l.phone) return null;
  const country = (l.country || '').length === 2 ? l.country.toUpperCase() : l.country || '';
  const website = l.website || '';
  return {
    name: l.name || domainOf(website) || l.email || l.phone, category: l.category || '', email: (l.email || '').toLowerCase(),
    emails: JSON.stringify(l.email ? [l.email.toLowerCase()] : []), phone: normalizePhone(l.phone || '', country.length === 2 ? country : ''),
    website, domain: website ? domainOf(website) : '', address: l.address || '', city: l.city || '', region: l.region || '', country,
    postcode: l.postcode || '', notes: l.notes || '', tags: l.tags || '', source: 'import', status: 'new',
  };
}

async function readRows(path: string): Promise<Record<string, unknown>[]> {
  const ext = extname(path).toLowerCase();
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    return Papa.parse<Record<string, unknown>>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data;
  }
  if (ext === '.json') {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(j) ? j : j.leads ?? [];
  }
  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((r, i) => {
      const vals = (r.values as unknown[]).slice(1);
      if (i === 1) vals.forEach((v) => headers.push(String(v ?? '')));
      else rows.push(Object.fromEntries(headers.map((h, j) => [h, vals[j]])));
    });
    return rows;
  }
  throw new Error('Use a .csv, .xlsx, .json or .pdf file.');
}

export async function pdfText(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map((it: any) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
  }
  return text;
}

/** PDF: with a writing model, it reads the businesses out of the text; without one, it picks out emails, phones and websites. */
async function pdfLeads(path: string): Promise<Partial<db.Lead>[]> {
  const text = await pdfText(path);
  const s = load();
  if (s.ai.provider !== 'none') {
    const out: Partial<db.Lead>[] = [];
    for (let i = 0; i < Math.min(text.length, 60000); i += 12000) {
      const reply = await complete(s.ai, 'Extract every business or contact from the text. Return one JSON object {"leads":[{"name":"","category":"","email":"","phone":"","website":"","address":"","city":"","region":"","country":"","notes":""}]}. Use only what the text says; leave unknown fields empty.', text.slice(i, i + 12000), 4000);
      for (const l of parseJson(reply)?.leads ?? []) {
        const lead = rowToLead(l, Object.fromEntries(Object.keys(FIELD_ALIASES).map((k) => [k, k])));
        if (lead) out.push(lead);
      }
    }
    return out;
  }
  return text.split(/\n\s*\n/).map((block) => {
    const emails = extractEmails(block);
    const phone = block.match(/\+?\d[\d\s().-]{7,}\d/)?.[0] ?? '';
    const url = block.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z.]{2,}(?:\/\S*)?/i)?.[0] ?? '';
    if (!emails.length && !phone && !url) return null;
    const name = block.split('\n').map((x) => x.trim()).find((x) => x && !x.includes('@') && !/\d{5,}/.test(x)) ?? '';
    return rowToLead({ name, email: emails[0] ?? '', phone, website: url }, { name: 'name', email: 'email', phone: 'phone', website: 'website' });
  }).filter(Boolean) as Partial<db.Lead>[];
}

export async function importFile(path: string) {
  const ext = extname(path).toLowerCase();
  const geo = ext === '.geojson' || ext === '.json' ? (() => { try { const j = JSON.parse(readFileSync(path, 'utf8')); return j?.type === 'FeatureCollection' ? j : null; } catch { return null; } })() : null;
  const leads = geo
    ? overtureToCandidates(geo).map((c) => ({ ...c, socials: JSON.stringify(c.socials ?? {}), domain: c.website ? domainOf(c.website) : '', emails: '[]', status: 'new', provenance: JSON.stringify({ listing: { source: 'overture', ref: c.source_ref, at: db.now(), file: path.split(/[\\/]/).pop() } }) }) as Partial<db.Lead>)
    : ext === '.pdf'
    ? await pdfLeads(path)
    : await (async () => {
      const rows = await readRows(path);
      const map = mapHeaders(Object.keys(rows[0] ?? {}));
      if (!Object.values(map).some((f) => ['name', 'email', 'website', 'phone'].includes(f))) throw new Error('No name, email, phone or website column found. Rename a column header and try again.');
      return rows.map((r) => rowToLead(r, map)).filter(Boolean) as Partial<db.Lead>[];
    })();
  let added = 0, merged = 0;
  const tx = db.raw().transaction(() => {
    for (const l of leads) {
      const [, created] = db.upsertLead({ ...l, client: load().currentClient ?? '' });
      created ? added++ : merged++;
    }
  });
  tx();
  return { added, merged, total: leads.length };
}

const EXPORT_COLS: [keyof db.Lead, string][] = [['name', 'Name'], ['category', 'Category'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['address', 'Address'], ['city', 'City'], ['region', 'Region'], ['country', 'Country'], ['postcode', 'Postcode'], ['rating', 'Rating'], ['reviews', 'Reviews'], ['status', 'Status'], ['score', 'Website score'], ['tags', 'Tags'], ['notes', 'Notes'], ['source', 'Source'], ['created_at', 'Added']];

export const EXPORT_FIELDS = [...EXPORT_COLS.map(([, l]) => l), 'Facebook', 'Instagram', 'Linkedin', 'X', 'Youtube', 'Tiktok', 'Other emails', 'Data credit', 'Grade'];

/** Export with the wizard's choices (QF-118): chosen columns, do-not-contact left out unless asked, optional one row per email. */
export async function exportLeads(all: db.Lead[], path: string, opts: { fields?: string[]; includeDnc?: boolean; dedupeEmail?: boolean } = {}) {
  const ext = extname(path).toLowerCase();
  // Sources whose terms do not allow exporting stored data (QF-017) are left out.
  let rows = all.filter((r) => sourceInfo(r.source)?.export !== false);
  if (!opts.includeDnc) rows = rows.filter((r) => r.status !== 'do_not_contact' && !(r.email && db.isSuppressed(r.email, r.domain)));
  if (opts.dedupeEmail) { const seen = new Set<string>(); rows = rows.filter((r) => !r.email || (seen.has(r.email) ? false : (seen.add(r.email), true))); }
  const labels = Object.fromEntries((db.raw().prepare("SELECT key, label FROM custom_fields WHERE entity = 'lead'").all() as { key: string; label: string }[]).map((f) => [f.key, f.label]));
  const flat = rows.map((r) => {
    const o: Record<string, unknown> = Object.fromEntries(EXPORT_COLS.map(([k, label]) => [label, r[k]]));
    const socials = JSON.parse(r.socials || '{}');
    for (const k of ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok']) o[k[0].toUpperCase() + k.slice(1)] = socials[k] ?? '';
    o['Other emails'] = JSON.parse(r.emails || '[]').filter((e: string) => e !== r.email).join(', ');
    o['Data credit'] = sourceInfo(r.source)?.attribution ?? '';
    o.Grade = (r as any).grade ?? '';
    for (const [k, v] of Object.entries({ ...JSON.parse((r as any).custom || '{}'), ...computed('lead', r as any) })) o[labels[k] ?? k] = v;
    if (opts.fields?.length) for (const k of Object.keys(o)) if (!opts.fields.includes(k) && !Object.values(labels).includes(k)) delete o[k];
    return o;
  });
  if (ext === '.json') writeFileSync(path, JSON.stringify(flat, null, 2));
  else if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Quarrix';
    const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = Object.keys(flat[0] ?? Object.fromEntries(EXPORT_COLS.map(([, l]) => [l, ''])));
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
    flat.forEach((r) => ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)]))));
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
    await wb.xlsx.writeFile(path);
  } else {
    writeFileSync(path, '﻿' + Papa.unparse(flat.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])))));
  }
  return rows.length;
}
