import { Notification } from 'electron';
import { isSafeExternalUrl } from './safety';
import { devOrigin, lockAll, lockContents } from './guard';
import * as budget from './budget';
import { checkSources,sourceHealthSnapshot } from './health';
import { SOURCES, sourceInfo } from './sources/catalog';
import { EMAIL_STATUS, listingUrl, PRESETS, reviewTrend } from './intel';
import { hunterDomain, verifyLeads } from './verify';
import * as oauth from './oauth';
import * as scope from './scope';
import { prepareSmoke, runSmoke, smokeOut } from './smoke';
import * as crm from './crm';
import * as validate from './validate';
import * as career from './career';
import * as jobstore from './jobstore';
import { marketReport, marketCsv } from './market';
import { migrateProposals, getProposal, saveProposal, documentPdf } from './proposals';
import { proposalText } from '../shared/proposals';
import { migratePublicOpportunities, listPublicOpportunities, savePublicOpportunity, deletePublicOpportunity, searchTed } from './public-opportunities';
import { checkJobTrust } from './job-trust';
import { registryLookup } from './registry';
import { officialWages, secLookup,nationalRegistry,nycVacancies,recentRegistrations } from './global-data';
import { salesByCurrency } from './market';
import { migrateDigest,centerOverview,setDigest,toggleSavedSearch,claimDigest,opportunityTrends } from './opportunity-center';
import { recommendLeads, recommendJobs, leadQuality } from '../shared/verified';
import * as automation from './automation';
import * as localapi from './localapi';
import * as cli from './cli';
import * as exporters from './exporters';
import { loadSources, sourcesDir } from './sources/sdk';
import * as mb from './mailboxes';
import { abResult } from './rules';
import * as integrations from './integrations';
import { writeDiagnostics } from './diagnostics';
import { privacySummary } from './privacy';
import * as backup from './backup';
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
import { effectiveModel, listModels, PROVIDERS, rankFree, useBackups, useModelGuard } from './ai';
import { approve, approveAll, createDrafts } from './outreach';
import * as autopilot from './autopilot';
import { citiesOf, matchJobs } from './jobsearch';
import * as cv from './resume';
import * as proof from './proof';
import * as signals from './signals';
import { EXPORT_FIELDS, exportLeads, importFile } from './importexport';
import { closeMaps } from './sources/gmaps';
import { load, publicSettings, save, saveFromUi, runtimeSettings, isLocalWriting } from './settings';
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
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (isSafeExternalUrl(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:') && !(devOrigin() && url.startsWith(devOrigin() + '/'))) { e.preventDefault(); if (isSafeExternalUrl(url)) void shell.openExternal(url); } });
  if (process.env.QUARRIX_DEV_URL) void win.loadURL(process.env.QUARRIX_DEV_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

const KNOWN_SOURCES = new Set(SOURCES.map((x) => x.id));
const validSources = (v: unknown) => {
  const sdk = new Set(loadSources(app.getPath('userData')).ok.map((x) => `sdk:${x.id}`));
  const list = Array.isArray(v) ? v.map(String).filter((x) => KNOWN_SOURCES.has(x) || sdk.has(x)) : [];
  if (!list.length) throw new Error('Choose at least one source.');
  return list;
};
const validGeo = (g: any): Geo | null => {
  if (!g) return null;
  const lat = Number(g.lat), lon = Number(g.lon), km = Number(g.km);
  if (![lat, lon, km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || km <= 0 || km > 100) throw new Error('The map area is not valid (radius 0.1 to 100 km).');
  const poly = Array.isArray(g.poly) && g.poly.length >= 3 && g.poly.length <= 60 ? (g.poly as unknown[]).map((p: any) => [Number(p[0]), Number(p[1])] as [number, number]).filter(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) <= 180) : undefined;
  return poly && poly.length >= 3 ? { lat, lon, km, poly } : { lat, lon, km };
};

/** WhatsApp: never to do-not-contact leads; Cloud API sends also need your approval and the lead's recorded opt-in. */
function waGuard(l: db.Lead, cloud: boolean) {
  const digits = l.phone.replace(/\D/g, '');
  if (l.status === 'do_not_contact' || (digits && db.isSuppressed(`tel:${digits}`)) || (l.email && db.isSuppressed(l.email, l.domain))) throw new Error('This lead is on your do-not-contact list.');
  if (sourceInfo(l.source)?.contact === false) throw new Error('The terms of the source this lead came from do not allow contacting it.');
  if (cloud) {
    const w = load().whatsapp;
    if (!w.authorizedAt) throw new Error('Approve WhatsApp sending in Settings → WhatsApp first.');
    // Sender identity: the approval is for one WhatsApp Business number; changing the number needs a new approval.
    if ((w.authorizedFor ?? '') !== w.phoneNumberId) throw new Error('The WhatsApp Business number changed since you approved sending. Approve it again in Settings → WhatsApp.');
    const today = (db.raw().prepare("SELECT COUNT(*) n FROM events WHERE type = 'whatsapp' AND detail LIKE 'Sent%' AND at >= ?").get(new Date().toISOString().slice(0, 10)) as { n: number }).n;
    if (today >= (load().whatsapp.dailyLimit || 50)) throw new Error(`Today's WhatsApp limit (${load().whatsapp.dailyLimit || 50}) is reached.`);
    if (!(l as any).wa_consent) throw new Error('WhatsApp requires the person\'s opt-in before a business sends to them. Tick "They agreed to WhatsApp messages" on the lead first.');
  }
}

const handle = (ch: string, fn: (...a: any[]) => unknown) =>
  ipcMain.handle(ch, async (e, ...args) => {
    // Only the app's own page may call the main process.
    const from = e.senderFrame?.url ?? '';
    if (!from.startsWith('file:') && !(devOrigin() && from.startsWith(devOrigin() + '/'))) return { ok: false, error: 'Blocked a call from an unknown page.' };
    try { if (JSON.stringify(args ?? []).length > 5_000_000) return { ok: false, error: 'Request too large.' }; } catch { return { ok: false, error: 'Request not readable.' }; }
    // Client workspace isolation: record IDs are checked and lists are limited to the selected workspace.
    try { const s = scope.current(); return { ok: true, data: scope.guardResult(ch, await fn(...scope.guardArgs(ch, validate.check(ch, args), s)), s) }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
  });

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, categories: CATEGORIES, providers: PROVIDERS, dataPath: app.getPath('userData') }));
  handle('settings:get', () => publicSettings());
  handle('settings:save', (patch) => { const r = saveFromUi(patch); nativeTheme.themeSource = load().theme; return r; });
  // Workspace-wide numbers are read through withScope, so a client workspace only counts its own records.
  handle('stats', () => scope.withScope(() => db.stats()));
  handle('facets', () => scope.withScope(() => db.facets()));

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
  handle('sdk:list', () => { const r = loadSources(app.getPath('userData')); return { dir: sourcesDir(app.getPath('userData')), sources: r.ok.map((x) => ({ id: x.id, name: x.name, license: x.license, attribution: x.attribution, needsKey: !!(x.keyHeader || x.keyQuery) })), errors: r.errors }; });
  handle('sdk:openDir', () => shell.openPath(sourcesDir(app.getPath('userData'))));
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
  handle('mail:dryrun', (days?: number) => scope.withScope(() => dryRunPlan(Math.min(14, Math.max(1, Number(days) || 3)))));
  handle('mail:health', () => ({ ...mail.recentHealth(), paused: load().email.pausedReason, authorized: load().email.authorizedAt, from: load().email.authorizedFrom }));
  handle('replies:list', (all?: boolean) => db.listReplies(!all));
  handle('replies:update', (id: number, patch: { intent?: string; handled?: boolean }) => { db.updateReply(Number(id), { intent: patch?.intent ? String(patch.intent) : undefined, handled: patch?.handled }); return true; });
  handle('outreach:attention', () => db.attention());
  handle('outreach:metrics', () => { const m = scope.withScope(() => db.outreachMetrics()) as any; return { ...m, ab: abResult(m.variants.A, m.variants.B), mailboxes: mb.stats() }; });
  handle('mailboxes:stats', () => mb.stats());
  handle('fields:computed', (entity: string, id: number) => { const rec = entity === 'deal' ? db.raw().prepare('SELECT * FROM deals WHERE id = ?').get(Number(id)) : db.getLead(Number(id)); return rec ? crm.computed(entity === 'deal' ? 'deal' : 'lead', rec as any) : {}; });
  handle('companies:list', (q?: string) => crm.listCompanies(String(q ?? '')));
  handle('companies:locations', (id: number) => crm.companyLocations(Number(id)));
  handle('companies:rename', (id: number, name: string) => crm.renameCompany(Number(id), String(name)));
  handle('clients:set', (current: string, list?: string[]) => { const s = load(); save({ currentClient: String(current ?? ''), clients: Array.isArray(list) ? [...new Set(list.map(String).filter(Boolean))].slice(0, 100) : s.clients }); send('leads'); return load().currentClient; });
  handle('leads:trend', (id: number) => reviewTrend((db.listSnapshots(Number(id)) as any[]).map((x) => ({ at: x.at, ...JSON.parse(x.data) }))));
  handle('mailboxes:authorize', (id: string, on: boolean) => mb.authorize_(String(id), !!on));
  handle('mailboxes:connect', (id: string, p: string) => { if (p !== 'google' && p !== 'microsoft') throw new Error('Unknown provider.'); return mb.connectBox(String(id), p); });
  handle('mail:placement', async (address: string, boxId: string) => {
    const a = String(address ?? '').trim();
    if (!/^[^@\s]+@[a-z0-9.-]*mail-tester\.com$/i.test(a)) throw new Error('Paste the address shown on mail-tester.com (it ends with @srv1.mail-tester.com or similar).');
    const box = mb.boxById(String(boxId || 'main'));
    if (!mb.ready(box)) throw new Error('Approve sending from this mailbox first.');
    if (mb.sentToday(box.id) >= mb.capOf(box)) throw new Error(`${box.label} has reached today's limit; the placement test counts towards it.`);
    const sample = db.raw().prepare("SELECT subject, body FROM messages WHERE channel = 'email' AND step = 0 ORDER BY id DESC LIMIT 1").get() as { subject: string; body: string } | undefined;
    await mail.sendRaw(a, sample?.subject ?? 'Quick question', `${sample?.body ?? 'Hello, this is a deliverability test from Quarrix.'}\n\n${mail.footer(load())}`, '', [], box.id, 'placement');
    db.logEvent(null, 'placement_sent', box.id);
    return `https://www.mail-tester.com/${a.split('@')[0]}`;
  });
  handle('crm:stages', () => crm.stages());
  handle('deals:list', () => crm.listDeals());
  handle('deals:save', (d) => crm.saveDeal(d ?? {}));
  handle('deals:move', (id: number, stage: string, beforeId: number | null) => crm.moveDeal(Number(id), String(stage), beforeId ? Number(beforeId) : null));
  handle('deals:delete', (id: number) => crm.deleteDeal(Number(id)));
  handle('deals:history', (id: number) => crm.dealHistory(Number(id)));
  handle('deals:forLead', (id: number) => crm.leadDeals(Number(id)));
  handle('deals:forecast', () => crm.forecast());
  handle('tasks:list', (f) => crm.listTasks(f ?? {}));
  handle('tasks:save', (t) => crm.saveTask(t ?? {}));
  handle('tasks:delete', (id: number) => crm.deleteTask(Number(id)));
  handle('fields:list', (entity?: string) => crm.listFields(entity));
  handle('fields:save', (f) => crm.saveField(f));
  handle('fields:delete', (id: number) => crm.deleteField(Number(id)));
  handle('fields:set', (entity: 'lead' | 'deal', id: number, key: string, value: unknown) => crm.setCustom(entity === 'deal' ? 'deal' : 'lead', Number(id), String(key), value));
  handle('views:list', (screen: string) => crm.listViews(String(screen)));
  handle('views:save', (v) => crm.saveView(v));
  handle('views:delete', (id: number) => crm.deleteView(Number(id)));
  handle('dupes:list', () => crm.duplicateGroups());
  handle('dupes:summary',()=>({count:crm.duplicateGroups(20).length,limit:20}));
  handle('dupes:merge', (keepId: number, ids: number[]) => { const r = crm.mergeLeads(Number(keepId), (ids ?? []).map(Number)); send('leads'); return r; });
  handle('dupes:apart', (ids: number[]) => crm.keepApart((ids ?? []).map(Number)));
  handle('dupes:merges', () => crm.listMerges());
  handle('dupes:undo', (id: number) => { const n = crm.undoMerge(Number(id)); send('leads'); return n; });
  handle('backup:make', async (pass: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `quarrix-backup-${new Date().toISOString().slice(0, 10)}.qbak`, filters: [{ name: 'Quarrix backup', extensions: ['qbak'] }] });
    if (r.canceled || !r.filePath) return null;
    const out = await backup.makeBackup(r.filePath, String(pass ?? ''));
    shell.showItemInFolder(r.filePath);
    return out;
  });
  handle('backup:restore', async (pass: string) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Quarrix backup', extensions: ['qbak'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return backup.prepareRestore(r.filePaths[0], String(pass ?? ''));
  });
  handle('app:restart', () => { app.relaunch(); app.exit(0); });
  handle('auto:templates', () => ({ templates: automation.TEMPLATES, triggers: automation.TRIGGERS, fields: automation.FIELDS }));
  handle('auto:runs', () => automation.recentRuns());
  handle('hooks:test', (url: string) => automation.deliver('test', { message: 'Hello from Quarrix' }, String(url)));
  handle('api:apply', () => localapi.start());
  handle('cli:info', () => cli.info());
  handle('cli:install', () => cli.install());
  handle('api:captureToken', () => localapi.captureToken());
  handle('wa:authorize', (on: boolean) => { const w = load().whatsapp; if (on && (!w.cloudToken || !w.phoneNumberId)) throw new Error('Add the Cloud API token and phone number ID first.'); save({ whatsapp: { ...w, authorizedAt: on ? db.now() : '', authorizedFor: on ? w.phoneNumberId : '' } }); return !!on; });
  handle('api:token', () => ({ token: localapi.ensureToken(), port: load().api.port }));
  handle('api:newToken', () => { save({ api: { ...load().api, token: '' } }); const t = localapi.ensureToken(); localapi.start(); return t; });
  handle('sync:hubspot', (ids: number[]) => integrations.toHubspot((ids ?? []).map(Number)));
  handle('sync:notion', (ids: number[]) => integrations.toNotion((ids ?? []).map(Number)));
  handle('sync:postgres', (ids: number[]) => exporters.toPostgres((ids ?? []).map(Number)));
  handle('sync:s3', (ids: number[]) => exporters.toS3((ids ?? []).map(Number)));
  handle('sync:sheets', (ids: number[]) => integrations.toSheets((ids ?? []).map(Number)));
  handle('sheets:connect', () => integrations.connectSheets());
  handle('diag:save', async () => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `quarrix-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    await writeDiagnostics(r.filePath);
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });
  handle('privacy:summary', () => privacySummary());
  handle('export:fields', () => EXPORT_FIELDS);
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
  handle('sources:health', (id?:string) => checkSources(id));
  handle('sources:healthSnapshot', () => sourceHealthSnapshot());
  handle('sources:usage', () => db.usageToday());
  handle('search:list', () => db.listSearches());

  handle('leads:query', (q) => db.queryLeads(scope.scopedQuery({ ...(q ?? {}) })));
  handle('market:report', (group, country, category) => marketReport(group, country, category, scope.current()));
  handle('proposal:get', (id) => getProposal(id));
  handle('proposal:save', (id,p) => saveProposal(id,p));
  handle('proposal:export', async (id, p, format) => {
    scope.assertLead(id); const lead=db.getLead(id); if(!lead) throw new Error('Business not found.');
    if(sourceInfo(lead.source)?.export === false) throw new Error('This data source does not permit export.');
    const text=proposalText(p,lead.name);
    const r=await dialog.showSaveDialog(win!,{defaultPath:`proposal.${format}`,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(r.canceled||!r.filePath)return null;
    if(format==='pdf') (await import('node:fs')).writeFileSync(r.filePath,await documentPdf(text)); else await cv.saveDocx(r.filePath,text);
    return r.filePath;
  });
  handle('market:document', async (group,country,category,format) => {
    const report=marketReport(group,country,category,scope.current());
    const text=['Client market report',load().profile.company||load().profile.name||'Quarrix',`Generated: ${report.generatedAt}`,`Grouping: ${group}; country: ${country||'All'}; category: ${category||'All'}`,'',`Business records: ${report.total.records}`,`Linked companies: ${report.total.companies}`,`Recent checks: ${report.total.recentlyChecked}`,`Scored records: ${report.total.scored}`,`Mean fit: ${report.total.averageFit??'Unknown'}`,'','GROUP SUMMARY',...report.groups.map(g=>`${g.label}: ${g.records} records; ${g.companies} linked companies; ${g.recentlyChecked} recent checks; mean fit ${g.averageFit??'Unknown'}`),'','Stored sample only, not market size, market share or revenue potential. Company counts can overlap.'].join('\n');
    const r=await dialog.showSaveDialog(win!,{defaultPath:`market-report.${format}`,filters:[{name:format.toUpperCase(),extensions:[format]}]});
    if(r.canceled||!r.filePath)return null;
    if(format==='pdf') (await import('node:fs')).writeFileSync(r.filePath,await documentPdf(text)); else await cv.saveDocx(r.filePath,text);
    return r.filePath;
  });
  handle('public:list', () => listPublicOpportunities());
  handle('public:save', (p) => savePublicOpportunity(p));
  handle('public:delete', (id) => deletePublicOpportunity(id));
  handle('public:ted', (page) => searchTed(page));
  handle('market:export', async (group, country, category) => {
    const client = scope.current();
    const r = await dialog.showSaveDialog(win!, { defaultPath: 'quarrix-market-report.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    const report = marketReport(group, country, category, client);
    (await import('node:fs')).writeFileSync(r.filePath, marketCsv(report, group, country, category));
    return report.groups.length;
  });
  handle('leads:get', (id: number) => ({ lead: db.getLead(id), messages: db.messagesFor(id), events: db.eventsFor(id) }));
  handle('leads:update', (id: number, patch) => { db.updateLead(id, patch); if (patch.status === 'do_not_contact') { const l = db.getLead(id); if (l?.email) db.suppress(l.email, 'marked do not contact'); db.cancelPending(id, 'Marked do not contact'); } return db.getLead(id); });
  handle('leads:delete', (ids: number[]) => db.deleteLeads(ids));
  handle('leads:enrich', async (ids: number[]) => { for (const id of ids) db.updateLead(id, { enriched_at: null }); await jobs.runEnrichment([...ids]); return ids.length; });
  handle('leads:add', (l) => db.upsertLead({ ...(l ?? {}), source: 'manual', client: scope.current() })[0]); // filed in the selected workspace

  handle('draft:create', (ids: number[]) => createDrafts(ids, () => send('drafts')));
  handle('messages:list', (status: string) => db.listMessages(status));
  handle('messages:update', (id: number, patch) => db.updateMessage(id, patch));
  handle('messages:delete', (id: number) => db.deleteMessage(id));
  handle('messages:approve', (leadId: number) => approve(leadId));
  handle('messages:approveAll', () => approveAll(scope.current()));
  handle('jobs:search', (q, runId?: number) => jobstore.searchAll(q ?? {}, (b) => send('jobs-batch', { runId, ...b }), Number(runId) || 0));
  handle('jobs:stop', (runId: number) => { jobstore.stopSearch(Number(runId)); return true; });
  handle('jobs:recent', () => jobstore.recentSearches());
  handle('jobs:clearRecent', () => jobstore.clearSearches());
  handle('employers:list', () => jobstore.listEmployers());
  handle('employers:add', (link: string) => jobstore.addEmployer(String(link ?? '')));
  handle('employers:remove', (id: number) => jobstore.removeEmployer(Number(id)));
  handle('jobs:check', (url: string) => jobstore.checkPosting(String(url ?? '')));
  handle('jobs:trust', (job, employerUrl) => checkJobTrust(job, employerUrl));
  handle('entity:registry', (name, country) => registryLookup(name, country));
  handle('global:wages', () => officialWages());
  handle('global:sec', (id:string) => secLookup(id));
  handle('global:nationalRegistry',(country:string,id:string)=>nationalRegistry(country,id));
  handle('global:nycJobs',()=>nycVacancies());
  handle('global:recentRegistrations',()=>recentRegistrations());
  handle('market:sales',()=>salesByCurrency(scope.current()));
  handle('opportunities:center',()=>centerOverview());
  handle('opportunities:trends',()=>opportunityTrends());
  handle('opportunities:digest',(enabled)=>setDigest(enabled));
  handle('opportunities:toggle',(kind,id,enabled)=>toggleSavedSearch(kind,id,enabled));
  handle('opportunities:overview', () => {
    const {rows,total}=db.queryLeads(scope.scopedQuery({sort:'grade',limit:100}));
    const jobs=db.savedJobs();
    const candidates=jobs as {id:string;title:string;company:string;match?:number;status?:string;snippet?:string;ageDays?:number|null;repost?:boolean}[];
    const profile=cv.getCv();const scores=profile?cv.keywordMatch(profile,candidates as any):null;
    const ranked=scores?candidates.map(j=>({...j,match:scores[j.id]?.match??0})):candidates;
    return {sample:rows.length,total,review:rows.filter(l=>leadQuality(l)==='review').length,stale:rows.filter(l=>leadQuality(l)==='check').length,leads:recommendLeads(rows).map(l=>({id:l.id,name:l.name,city:l.city,grade:l.grade})),jobs:recommendJobs(ranked).map(j=>({id:j.id,title:j.title,company:j.company,match:j.match})),localMatch:!!scores};
  });
  handle('alerts:list', () => jobstore.listAlerts());
  handle('alerts:save', (a) => jobstore.saveAlert(a));
  handle('alerts:delete', (id: number) => jobstore.deleteAlert(Number(id)));
  handle('alerts:hits', (id: number) => { const h = jobstore.alertHits(Number(id)); jobstore.markAlertSeen(Number(id)); return h; });
  handle('alerts:run', () => jobstore.runAlerts(true));
  handle('jobs:export', async (format: string) => {
    const ext = ['csv', 'json', 'md'].includes(format) ? format : 'csv';
    const r = await dialog.showSaveDialog(win!, { defaultPath: `my-applications-${new Date().toISOString().slice(0, 10)}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return null;
    const n = jobstore.exportSaved(r.filePath);
    shell.showItemInFolder(r.filePath);
    return n;
  });
  handle('jobs:match', (jobs) => {
    const s = runtimeSettings(); const c = cv.getCv();
    if (!c) throw new Error('Upload your CV first.');
    if (s.ai.provider === 'none') return cv.keywordMatch(c, jobs);
    return matchJobs(s, jobs, `${c.profile.summary}\nTarget roles: ${c.profile.roles.join(', ')}\nLevel: ${c.profile.level}\nSkills: ${c.profile.skills.join(', ')}\n\n${c.text}`);
  });
  handle('cv:get', () => cv.getCv());
  handle('cv:upload', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Choose your CV', properties: ['openFile'], filters: [{ name: 'CV', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const loaded = await cv.loadCv(r.filePaths[0]);
    career.ensureRadar();
    return loaded;
  });
  handle('cv:profile', (p) => { const r = cv.saveProfile(p); career.ensureRadar(); return r; });
  // Career signals (0.24)
  handle('career:signals', () => career.signals());
  handle('career:radar', () => career.radar());
  handle('career:saveRadar', (r) => { career.ensureRadar({ keywords: String(r?.keywords ?? ''), country: String(r?.country ?? ''), countryName: String(r?.countryName ?? ''), city: String(r?.city ?? '') }); return career.radar(); });
  handle('career:resetRadar', () => { career.resetRadar(); return career.radar(); });
  handle('career:scan', async () => { const hits = await career.scan(); send('alerts'); return hits; });
  handle('career:dismiss', (id: string) => career.dismiss(String(id)));
  handle('career:seen', () => career.markSeen());
  handle('career:unseen', () => career.unseenCount());
  handle('proof:make', (id: number) => proof.makeReport(id));
  handle('proof:info', (id: number) => proof.reportInfo(id));
  handle('proof:open', (id: number) => shell.openPath(proof.reportPath(id)));
  handle('proof:send', (id: number) => mail.sendReport(Number(id)));
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
  handle('studio:save', (id, studio) => db.saveApplicationStudio(id, studio));
  handle('jobs:save', (job) => {
    const before = (db.savedJobs() as { id: string; status?: string }[]).find((j) => j.id === job.id)?.status;
    if (job.status && job.status !== before) db.logEvent(null as never, 'job_status', `${job.status}: ${job.title} at ${job.company}`);
    return db.saveJob(job);
  });
  handle('signals:list', (f) => db.listSignals(f ?? {}));
  handle('signals:counts', () => scope.withScope(() => db.signalCounts()));
  handle('signals:update', (id: number, patch) => db.updateSignal(id, patch));
  handle('signals:seenAll', () => db.markAllSeen(scope.current()));
  handle('signals:run', () => signals.run(send, true));
  handle('signals:check', async (id: number) => { const l = db.getLead(id); return l ? signals.checkLead(l) : 0; });
  handle('watches:list', () => scope.byClient(db.listWatches()));
  handle('watches:save', (w) => db.saveWatch(scope.ownRecord('watches', w ?? {})));
  handle('watches:delete', (id: number) => { scope.ownRecord('watches', { id }); return db.deleteWatch(id); });
  handle('dash:get', (days: number) => scope.withScope(() => db.dashboard(days || 30)));
  handle('jobs:unsave', (id: string) => db.unsaveJob(id));
  handle('geo:cities', (cc: string) => citiesOf(cc));
  handle('search:log', (id: number) => jobs.searchLog(id));
  handle('campaigns:list', () => scope.byClient(db.listCampaigns()));
  handle('campaigns:save', (c) => db.saveCampaign(scope.ownRecord('campaigns', c ?? {})));
  handle('campaigns:delete', (id: number) => { scope.ownRecord('campaigns', { id }); return db.deleteCampaign(id); });
  handle('campaigns:run', (id: number) => { scope.ownRecord('campaigns', { id }); return autopilot.run(send, id); });
  handle('messages:cancel', (leadId: number) => db.cancelPending(leadId, 'Stopped by you'));

  handle('mail:test', (boxId?: string) => mail.testMailbox(boxId ? String(boxId) : 'main'));
  handle('mail:testSend', async (to: string) => {
    // A connection test, so approval is not needed, but it is capped and never goes to a do-not-contact address.
    const addr = String(to ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(addr)) throw new Error('Type a valid email address.');
    if (db.isSuppressed(addr)) throw new Error('That address is on your do-not-contact list.');
    // Counted in the send log, so restarting the app does not reset the allowance (0.26).
    if (db.testSendsSince(new Date(Date.now() - 864e5).toISOString()) >= 5) throw new Error('Five test emails a day is the limit.');
    return mail.sendRaw(addr, 'Quarrix test email', `This is a test from Quarrix.\n\n${mail.footer(load())}`, '', [], 'main', 'test');
  });
  handle('mail:cap', () => { const list = mb.boxes().filter((b) => mb.connected(b)); return list.length ? list.reduce((a, b) => a + mb.capOf(b), 0) : mail.dailyCap(); });
  handle('mail:checkInbox', () => mail.checkInbox());
  // Free models first, so the list shows what a free OpenRouter key can actually use.
  handle('ai:models', async () => { const ai = runtimeSettings().ai; if(ai.provider==='none')return []; const ids = await listModels(ai); const free = ai.provider === 'openrouter' ? rankFree(ids) : []; return [...free, ...ids.filter((m) => !free.includes(m))]; });
  handle('ai:effective', () => effectiveModel(runtimeSettings().ai));

  handle('wa:open', async (leadId: number, text: string) => { const l = db.getLead(Number(leadId)); if (!l) throw new Error('Lead not found.'); waGuard(l, false); const n = await wa.openChat(l.phone, l.country, text); db.logEvent(leadId, 'whatsapp', 'Opened WhatsApp with a drafted message'); return n; });
  handle('wa:cloud', async (leadId: number, body) => { const l = db.getLead(Number(leadId)); if (!l) throw new Error('Lead not found.'); waGuard(l, true); const id = await wa.cloudSend(l.phone, l.country, body); db.logEvent(leadId, 'whatsapp', 'Sent with the WhatsApp Cloud API'); return id; });

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
  handle('file:export', async (q, format: 'csv' | 'xlsx' | 'json', opts?: { fields?: string[]; includeDnc?: boolean; dedupeEmail?: boolean }) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `quarrix-leads-${new Date().toISOString().slice(0, 10)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (r.canceled || !r.filePath) return null;
    const rows = db.queryLeads(scope.scopedQuery({ ...(q ?? {}), limit: 1_000_000, offset: 0 })).rows;
    const n = await exportLeads(rows, r.filePath, opts ?? {});
    shell.showItemInFolder(r.filePath);
    return n;
  });
  handle('open:external', (url: string) => { if (!isSafeExternalUrl(String(url))) throw new Error('Only web and email links can be opened.'); return shell.openExternal(url); });
}

prepareSmoke();

app.whenReady().then(() => {
  app.setAppUserModelId('com.nexonictechnologies.quarrix');
  lockAll();
  loadSources(app.getPath('userData')); // registers the Source SDK files' licences before anything is exported or contacted
  app.on('web-contents-created', (_e, wc) => lockContents(wc));
  const restored = backup.applyPendingRestore();
  db.openDb();
  db.migrateData();
  useBackups(() => load().allowModelFallback === true ? runtimeSettings().aiKeys : {});
  useModelGuard(ai => { if (!isLocalWriting(ai)) budget.spend('writing'); });
  crm.migrate();
  migrateProposals(); migratePublicOpportunities(); migrateDigest();
  jobstore.migrate();
  career.migrateTables();
  try { career.ensureRadar(); } catch { /* the radar is created on the next scan */ }
  automation.migrate();
  automation.setDrafter((ids) => createDrafts(ids));
  db.onEvent((leadId, type, detail) => void automation.handle(leadId, type, detail).catch(() => undefined));
  localapi.start();
  if (restored) setTimeout(() => send('toast', 'Backup restored. Your previous data was kept as a safety copy in the app folder.'), 3000);
  registerIpc();
  createWindow();
  if (smokeOut()) { void runSmoke(win!); return; } // installed-app smoke test: no background work
  budget.install();
  onMapsLoad(() => budget.spend('gmaps'));
  jobs.start(send);
  autopilot.start(send);
  signals.start(send);
  setInterval(() => void mail.tick((m) => send('toast', m)), 60_000);
  // Job alerts (QF-107): saved searches run on their schedule while Quarrix is open.
  const alertTick = () => void jobstore.runAlerts().then((hits) => { for (const [name, n] of hits) { new Notification({ title: `${n} new job${n > 1 ? 's' : ''}: ${name}`, body: 'Open Job search → Alerts to see them.' }).show(); } send('alerts'); }).catch(() => undefined);
  // Checked every 5 minutes, and a minute after start, so an alert runs within 5 minutes of when it is due.
  setTimeout(alertTick, 60_000);
  setInterval(alertTick, 5 * 60_000);
  setInterval(()=>{try{const n=claimDigest(load().workspace);if(n){new Notification({title:'Quarrix daily opportunities',body:`${n} items need your review. Open the dashboard.`}).show();send('alerts');}}catch{/* no notification on unavailable data */}},60_000);
  // Task reminders (QF-049): a desktop notification when a task falls due.
  setInterval(() => {
    for (const t of crm.dueReminders() as any[]) {
      new Notification({ title: `Due: ${t.title}`, body: t.lead_name ? `For ${t.lead_name}` : 'Quarrix task' }).show();
      send('toast', `Task due: ${t.title}`);
    }
  }, 60_000);
  setInterval(() => void mail.checkInbox().then((r) => { if (r.replies || r.bounces) { send('leads'); send('toast', `${r.replies} new replies, ${r.bounces} bounces`); } }).catch(() => undefined), 10 * 60_000);
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  closeMaps();
  if (process.platform !== 'darwin') app.quit();
});
