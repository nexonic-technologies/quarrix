import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import * as db from './db';
import * as jobs from './jobs';
import * as mail from './mail';
import * as wa from './whatsapp';
import { listModels, PROVIDERS } from './ai';
import { approve, approveAll, createDrafts } from './outreach';
import * as autopilot from './autopilot';
import { exportLeads, importFile } from './importexport';
import { closeMaps } from './sources/gmaps';
import { load, publicSettings, saveFromUi } from './settings';
import { CATEGORIES } from '../shared/categories';

let win: BrowserWindow | null = null;
const send = (event: string, data?: unknown) => win?.webContents.send('event', event, data);

function createWindow() {
  const s = load();
  nativeTheme.themeSource = s.theme;
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1040, minHeight: 680, show: false, title: 'Quarrix',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14201D' : '#EEF2EF',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.QUARRIX_DEV_URL) void win.loadURL(process.env.QUARRIX_DEV_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

const handle = (ch: string, fn: (...a: any[]) => unknown) =>
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
  });

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, categories: CATEGORIES, providers: PROVIDERS, dataPath: app.getPath('userData') }));
  handle('settings:get', () => publicSettings());
  handle('settings:save', (patch) => { const r = saveFromUi(patch); nativeTheme.themeSource = load().theme; return r; });
  handle('stats', () => db.stats());
  handle('facets', () => db.facets());

  handle('search:start', (category: string, place: string, sources: string[]) => jobs.queueSearch(category, place, sources));
  handle('search:stop', (id: number) => jobs.stopSearch(id));
  handle('search:list', () => db.listSearches());

  handle('leads:query', (q) => db.queryLeads(q));
  handle('leads:get', (id: number) => ({ lead: db.getLead(id), messages: db.messagesFor(id), events: db.eventsFor(id) }));
  handle('leads:update', (id: number, patch) => { db.updateLead(id, patch); if (patch.status === 'do_not_contact') { const l = db.getLead(id); if (l?.email) db.suppress(l.email, 'marked do not contact'); db.cancelPending(id, 'Marked do not contact'); } return db.getLead(id); });
  handle('leads:delete', (ids: number[]) => db.deleteLeads(ids));
  handle('leads:enrich', async (ids: number[]) => { for (const id of ids) db.updateLead(id, { enriched_at: null }); await jobs.runEnrichment([...ids]); return ids.length; });
  handle('leads:add', (l) => db.upsertLead({ ...l, source: 'manual' })[0]);

  handle('draft:create', (ids: number[]) => createDrafts(ids, () => send('drafts')));
  handle('messages:list', (status: string) => db.listMessages(status));
  handle('messages:update', (id: number, patch) => db.updateMessage(id, patch));
  handle('messages:delete', (id: number) => db.deleteMessage(id));
  handle('messages:approve', (leadId: number) => approve(leadId));
  handle('messages:approveAll', () => approveAll());
  handle('search:log', (id: number) => jobs.searchLog(id));
  handle('campaigns:list', () => db.listCampaigns());
  handle('campaigns:save', (c) => db.saveCampaign(c));
  handle('campaigns:delete', (id: number) => db.deleteCampaign(id));
  handle('campaigns:run', (id: number) => autopilot.run(send, id));
  handle('messages:cancel', (leadId: number) => db.cancelPending(leadId, 'Stopped by you'));

  handle('mail:test', () => mail.testMailbox());
  handle('mail:testSend', (to: string) => mail.sendRaw(to, 'Quarrix test email', `This is a test from Quarrix.\n\n${mail.footer(load())}`));
  handle('mail:cap', () => mail.dailyCap());
  handle('mail:checkInbox', () => mail.checkInbox());
  handle('ai:models', () => listModels(load().ai));

  handle('wa:open', async (leadId: number, text: string) => { const l = db.getLead(leadId)!; const n = await wa.openChat(l.phone, l.country, text); db.logEvent(leadId, 'whatsapp', 'Opened WhatsApp with a drafted message'); return n; });
  handle('wa:cloud', async (leadId: number, body) => { const l = db.getLead(leadId)!; const id = await wa.cloudSend(l.phone, l.country, body); db.logEvent(leadId, 'whatsapp', 'Sent with the WhatsApp Cloud API'); return id; });

  handle('dnc:list', () => db.suppressedList());
  handle('dnc:add', (v: string) => db.suppress(v, 'added by you'));
  handle('dnc:remove', (v: string) => db.unsuppress(v));

  handle('file:import', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Leads', extensions: ['csv', 'xlsx', 'json', 'pdf', 'tsv', 'txt'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const out = await importFile(r.filePaths[0]);
    send('leads');
    void jobs.runEnrichment();
    return out;
  });
  handle('file:export', async (q, format: 'csv' | 'xlsx' | 'json') => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `quarrix-leads-${new Date().toISOString().slice(0, 10)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (r.canceled || !r.filePath) return null;
    const rows = db.queryLeads({ ...q, limit: 1_000_000, offset: 0 }).rows;
    const n = await exportLeads(rows, r.filePath);
    shell.showItemInFolder(r.filePath);
    return n;
  });
  handle('open:external', (url: string) => shell.openExternal(url));
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.nexonictechnologies.quarrix');
  db.openDb();
  registerIpc();
  createWindow();
  jobs.start(send);
  autopilot.start(send);
  setInterval(() => void mail.tick((m) => send('toast', m)), 60_000);
  setInterval(() => void mail.checkInbox().then((r) => { if (r.replies || r.bounces) { send('leads'); send('toast', `${r.replies} new replies, ${r.bounces} bounces`); } }).catch(() => undefined), 10 * 60_000);
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  closeMaps();
  if (process.platform !== 'darwin') app.quit();
});
