import { isSafeExternalUrl } from './safety';
import * as budget from './budget';
import { checkSources } from './health';
import { SOURCES } from './sources/catalog';
import { EMAIL_STATUS, listingUrl, PRESETS } from './intel';
import { hunterDomain, verifyLeads } from './verify';
import * as oauth from './oauth';
import { checkDomain, dryRunPlan } from './deliverability';
import { onMapsLoad } from './sources/gmaps';
import { geocode } from './sources/osm';
import type { Geo } from './geo';
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
import { citiesOf, matchJobs, searchJobs } from './jobsearch';
import * as cv from './resume';
import * as proof from './proof';
import * as signals from './signals';
import { exportLeads, importFile } from './importexport';
import { closeMaps } from './sources/gmaps';
import { load, publicSettings, save, saveFromUi } from './settings';
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
  win.webContents.setWindowOpenHandler(({ url }) => { if (isSafeExternalUrl(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:') && !url.startsWith('http://localhost')) { e.preventDefault(); if (isSafeExternalUrl(url)) void shell.openExternal(url); } });
  if (process.env.QUARRIX_DEV_URL) void win.loadURL(process.env.QUARRIX_DEV_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

const KNOWN_SOURCES = new Set(SOURCES.map((x) => x.id));
const validSources = (v: unknown) => {
  const list = Array.isArray(v) ? v.map(String).filter((x) => KNOWN_SOURCES.has(x)) : [];
  if (!list.length) throw new Error('Choose at least one source.');
  return list;
};
const validGeo = (g: any): Geo | null => {
  if (!g) return null;
  const lat = Number(g.lat), lon = Number(g.lon), km = Number(g.km);
  if (![lat, lon, km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || km <= 0 || km > 100) throw new Error('The map area is not valid (radius 0.1 to 100 km).');
  return { lat, lon, km };
};

const handle = (ch: string, fn: (...a: any[]) => unknown) =>
  ipcMain.handle(ch, async (e, ...args) => {
    // Only the app's own page may call the main process.
    const from = e.senderFrame?.url ?? '';
    if (!from.startsWith('file:') && !from.startsWith('http://localhost:')) return { ok: false, error: 'Blocked a call from an unknown page.' };
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
  handle('search:pause', (id: number) => jobs.pauseSearch(Number(id)));
  handle('search:resume', (id: number) => jobs.resumeSearch(Number(id)));
  handle('search:preview', (category: string, place: string, sources: string[], geo: Geo | null) => jobs.previewSearch(String(category), String(place), validSources(sources), validGeo(geo)));
  handle('search:batch', (categories: string[], places: string[], sources: string[]) => {
    if (!Array.isArray(categories) || !Array.isArray(places)) throw new Error('Give a list of business types and places.');
    if (categories.length * places.length > 500) throw new Error('That is more than 500 searches. Split it into smaller batches.');
    return jobs.queueBatch(categories.map(String), places.map(String), validSources(sources));
  });
  handle('search:geo', (category: string, label: string, geo: Geo, sources: string[]) => {
    const g = validGeo(geo);
    if (!g) throw new Error('Pick a point on the map and a radius.');
    return jobs.queueGeoSearch(String(category), String(label), g, validSources(sources));
  });
  handle('templates:list', () => db.listTemplates());
  handle('templates:save', (t) => db.saveTemplate(t));
  handle('templates:delete', (id: number) => db.deleteTemplate(Number(id)));
  handle('sources:catalog', () => SOURCES);
  handle('icp:presets', () => PRESETS);
  handle('mail:oauth', (p: string) => { if (p !== 'google' && p !== 'microsoft') throw new Error('Unknown provider.'); return oauth.connect(p); });
  handle('mail:oauthOff', () => oauth.disconnect());
  handle('mail:authorize', (confirm: boolean) => {
    const e = load().email;
    if (!confirm) { save({ email: { authorizedAt: '', authorizedFrom: '' } }); return null; }
    const id = mail.senderId(e);
    if (!id || !id.includes('@')) throw new Error('Set the email address you send from first.');
    if (!load().profile.name || !load().profile.company) throw new Error('Add your name and company under "You and your offer" first, so people know who is writing.');
    save({ email: { authorizedAt: db.now(), authorizedFrom: id, pausedReason: '' } });
    return id;
  });
  handle('mail:resume', () => { save({ email: { pausedReason: '' } }); return true; });
  handle('mail:dns', (domain?: string) => checkDomain(domain ? String(domain) : undefined));
  handle('mail:dryrun', (days?: number) => dryRunPlan(Math.min(14, Math.max(1, Number(days) || 3))));
  handle('mail:health', () => ({ ...mail.recentHealth(), paused: load().email.pausedReason, authorized: load().email.authorizedAt, from: load().email.authorizedFrom }));
  handle('replies:list', (all?: boolean) => db.listReplies(!all));
  handle('replies:update', (id: number, patch: { intent?: string; handled?: boolean }) => { db.updateReply(Number(id), { intent: patch?.intent ? String(patch.intent) : undefined, handled: patch?.handled }); return true; });
  handle('outreach:attention', () => db.attention());
  handle('outreach:metrics', () => db.outreachMetrics());
  handle('icp:rescore', () => jobs.rescoreAll());
  handle('leads:intel', (id: number) => {
    const l = db.getLead(Number(id));
    if (!l) throw new Error('Lead not found.');
    return { contacts: db.listContacts(l.id), branches: db.branchesOf(l), snapshots: db.listSnapshots(l.id), listing: listingUrl(l.source, l.source_ref), emailCheck: l.email ? db.emailCheck(l.email) ?? null : null, statusText: EMAIL_STATUS };
  });
  handle('contacts:add', (c) => { db.addContact({ lead_id: Number(c.lead_id), name: String(c.name ?? ''), role: String(c.role ?? ''), email: String(c.email ?? ''), phone: String(c.phone ?? ''), source: 'you' }); return db.listContacts(Number(c.lead_id)); });
  handle('contacts:delete', (id: number) => db.deleteContact(Number(id)));
  handle('email:verify', async (ids: number[]) => { const r = await verifyLeads((Array.isArray(ids) ? ids : []).map(Number).slice(0, 5000), (d, t) => send('progress', { id: -1, msg: `Checked ${d} of ${t} emails` })); send('leads'); jobs.rescoreAll(); return r; });
  handle('email:find', async (id: number) => {
    const l = db.getLead(Number(id));
    if (!l?.domain) throw new Error('This lead has no website domain.');
    const found = await hunterDomain(l.domain);
    for (const f of found) db.addContact({ lead_id: l.id, name: f.name, role: f.role, email: f.email, source: 'hunter', source_url: f.source_url });
    return found.length;
  });
  handle('geo:find', async (q: string) => { const p = await geocode(String(q).slice(0, 200)); return p ? { lat: p.lat, lon: p.lon } : null; });
  handle('sources:health', () => checkSources());
  handle('sources:usage', () => db.usageToday());
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
  handle('jobs:search', (q) => searchJobs(q));
  handle('jobs:match', (jobs) => {
    const s = load(); const c = cv.getCv();
    if (!c) throw new Error('Upload your CV first.');
    if (s.ai.provider === 'none') return cv.keywordMatch(c, jobs);
    return matchJobs(s, jobs, `${c.profile.summary}\nTarget roles: ${c.profile.roles.join(', ')}\nLevel: ${c.profile.level}\nSkills: ${c.profile.skills.join(', ')}\n\n${c.text}`);
  });
  handle('cv:get', () => cv.getCv());
  handle('cv:upload', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Choose your CV', properties: ['openFile'], filters: [{ name: 'CV', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
    return r.canceled || !r.filePaths[0] ? null : cv.loadCv(r.filePaths[0]);
  });
  handle('cv:profile', (p) => cv.saveProfile(p));
  handle('proof:make', (id: number) => proof.makeReport(id));
  handle('proof:info', (id: number) => proof.reportInfo(id));
  handle('proof:open', (id: number) => shell.openPath(proof.reportPath(id)));
  handle('proof:send', (id: number) => mail.sendReport(id));
  handle('proof:save', async (id: number) => {
    const l = db.getLead(id)!;
    const r = await dialog.showSaveDialog(win!, { defaultPath: mail.reportName(l.name, load().profile.company), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    (await import('node:fs')).copyFileSync(proof.reportPath(id), r.filePath);
    return r.filePath;
  });
  handle('jobs:detail', (job) => cv.jobDetail(job));
  handle('jobs:letter', (job) => cv.coverLetter(job));
  handle('jobs:tailor', (job) => cv.tailorCv(job));
  handle('jobs:saveDoc', async (text: string, name: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `${name.replace(/[^\w -]+/g, '').slice(0, 60)}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }, { name: 'Text', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return null;
    if (r.filePath.endsWith('.txt')) (await import('node:fs')).writeFileSync(r.filePath, text); else await cv.saveDocx(r.filePath, text);
    return r.filePath;
  });
  handle('jobs:saved', () => db.savedJobs());
  handle('jobs:save', (job) => {
    const before = (db.savedJobs() as { id: string; status?: string }[]).find((j) => j.id === job.id)?.status;
    if (job.status && job.status !== before) db.logEvent(null as never, 'job_status', `${job.status}: ${job.title} at ${job.company}`);
    return db.saveJob(job);
  });
  handle('signals:list', (f) => db.listSignals(f ?? {}));
  handle('signals:counts', () => db.signalCounts());
  handle('signals:update', (id: number, patch) => db.updateSignal(id, patch));
  handle('signals:seenAll', () => db.markAllSeen());
  handle('signals:run', () => signals.run(send, true));
  handle('signals:check', async (id: number) => { const l = db.getLead(id); return l ? signals.checkLead(l) : 0; });
  handle('watches:list', () => db.listWatches());
  handle('watches:save', (w) => db.saveWatch(w));
  handle('watches:delete', (id: number) => db.deleteWatch(id));
  handle('dash:get', (days: number) => db.dashboard(days || 30));
  handle('jobs:unsave', (id: string) => db.unsaveJob(id));
  handle('geo:cities', (cc: string) => citiesOf(cc));
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
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Leads', extensions: ['csv', 'xlsx', 'json', 'geojson', 'pdf', 'tsv', 'txt'] }] });
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
  handle('open:external', (url: string) => { if (!isSafeExternalUrl(String(url))) throw new Error('Only web and email links can be opened.'); return shell.openExternal(url); });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.nexonictechnologies.quarrix');
  db.openDb();
  db.migrateData();
  registerIpc();
  createWindow();
  budget.install();
  onMapsLoad(() => budget.spend('gmaps'));
  jobs.start(send);
  autopilot.start(send);
  signals.start(send);
  setInterval(() => void mail.tick((m) => send('toast', m)), 60_000);
  setInterval(() => void mail.checkInbox().then((r) => { if (r.replies || r.bounces) { send('leads'); send('toast', `${r.replies} new replies, ${r.bounces} bounces`); } }).catch(() => undefined), 10 * 60_000);
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  closeMaps();
  if (process.platform !== 'darwin') app.quit();
});
