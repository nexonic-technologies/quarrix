import { BrowserWindow } from 'electron';
import * as db from './db';
import * as scope from './scope';
import { load } from './settings';
import { EMPTY_PROPOSAL, validateProposal, documentHtml, type Proposal } from '../shared/proposals';

export function migrateProposals() { db.raw().exec('CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL)'); }
export function getProposal(id: number): Proposal {
  scope.assertLead(id); if (!db.getLead(id)) throw new Error('Business not found.');
  const row = db.raw().prepare('SELECT data FROM proposals WHERE lead_id = ?').get(id) as { data: string } | undefined;
  return row ? validateProposal(JSON.parse(row.data)) : { ...EMPTY_PROPOSAL, provider: load().profile.company || load().profile.name, items: [] };
}
export function saveProposal(id: number, value: unknown): Proposal {
  scope.assertLead(id); if (!db.getLead(id)) throw new Error('Business not found.');
  const p = validateProposal(value);
  db.raw().prepare('INSERT INTO proposals (lead_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(lead_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(id, JSON.stringify(p), db.now());
  return p;
}
export async function documentPdf(text: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try { await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentHtml(text))); return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }); }
  finally { if (!win.isDestroyed()) win.destroy(); }
}
