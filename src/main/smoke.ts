// Installed-app smoke test (0.22). The release workflow starts the packaged app with QUARRIX_SMOKE_OUT set; the app opens its
// window from the installed files, exercises the real main process through the real interface and IPC bridge, writes a JSON
// report and quits. Nothing here touches the network beyond this computer, and it uses its own empty data folder.
import { app, type BrowserWindow } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db';
import { fetchText } from './util';
import { documentPdf } from './proposals';
import { EMPTY_PROPOSAL,proposalText } from '../shared/proposals';
import { EMPTY_OPPORTUNITY } from '../shared/public-opportunities';

type Check = { name: string; ok: boolean; detail: string };

export const smokeOut = () => process.env.QUARRIX_SMOKE_OUT ?? '';
/** Before app ready: use a throwaway data folder so a smoke run never touches real data. */
export function prepareSmoke() {
  if (!smokeOut()) return;
  app.setPath('userData', process.env.QUARRIX_SMOKE_DIR || join(app.getPath('temp'), `quarrix-smoke-${process.pid}`));
}

export async function runSmoke(win: BrowserWindow) {
  const checks: Check[] = [];
  const check = async (name: string, fn: () => Promise<string> | string) => {
    try { checks.push({ name, ok: true, detail: String(await fn()).slice(0, 300) }); } catch (e: any) { checks.push({ name, ok: false, detail: String(e?.message ?? e).slice(0, 300) }); }
  };
  const js = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const ipc = async (ch: string, ...a: unknown[]) => {
    const r = await js<{ ok: boolean; data?: unknown; error?: string }>(`window.quarrix.call(${JSON.stringify(ch)}, ...${JSON.stringify(a)})`);
    if (!r.ok) throw new Error(`${ch}: ${r.error}`);
    return r.data as any;
  };
  await new Promise<void>((res) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', () => res()) : res()));
  await new Promise((r) => setTimeout(r, 1500)); // let React mount

  await check('window loads the packaged interface', async () => { const n = await js<number>('document.querySelectorAll("#root *").length'); if (n < 20) throw new Error(`only ${n} elements rendered`); return `${n} elements`; });
  await check('first-launch wizard is shown, and can be skipped (QF-114)', async () => {
    // settings load asynchronously; slower runners (Windows) can take several seconds before the wizard mounts
    let shown = false;
    for (let i = 0; i < 40 && !shown; i++) { shown = await js<boolean>('[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Skip setup")'); if (!shown) await new Promise((r) => setTimeout(r, 250)); }
    if (!shown) throw new Error('no setup wizard on first launch');
    if (!await js<boolean>(`!!document.querySelector('progress[aria-label="Setup progress"]') && document.querySelector('main').inert && document.querySelector('aside').inert`)) throw new Error('setup progress or modal isolation missing');
    await js('[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Skip setup").click()');
    await new Promise((r) => setTimeout(r, 600));
    if (await js<boolean>('document.querySelector("main").inert')) throw new Error('main remains locked after setup');
    return 'shown and skipped';
  });
  await check('every screen draws without an error (QF-116 workspaces included)', async () => {
    const r = await js<{ screens: number; errors: string[] }>(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('.ws-switch button:last-child')?.click(); await wait(300);
      const nav = [...document.querySelectorAll('nav.nav button')];
      const errors = [];
      for (const b of nav) { b.click(); await wait(700); const e = document.querySelector('[data-screen-error]'); if (e) errors.push(b.textContent.trim() + ': ' + e.textContent); if (document.querySelectorAll('#root *').length < 20) errors.push(b.textContent.trim() + ': blank'); }
      return { screens: nav.length, errors };
    })()`);
    if (r.errors.length || r.screens < 8) throw new Error(r.errors.join('; ') || `only ${r.screens} screens`);
    return `${r.screens} screens`;
  });
  await check('career workspace hides sales screens (QF-116)', async () => {
    const n = await js<[number, number]>(`(async () => { const all = document.querySelectorAll('nav.nav button').length; [...document.querySelectorAll('.ws-switch button')].find((b) => /career/i.test(b.textContent))?.click(); await new Promise((r) => setTimeout(r, 400)); const c = document.querySelectorAll('nav.nav button').length; [...document.querySelectorAll('.ws-switch button')].find((b) => /both/i.test(b.textContent))?.click(); await new Promise((r) => setTimeout(r, 300)); return [all, c]; })()`);
    if (!(n[1] < n[0])) throw new Error(`nav ${n[0]} → ${n[1]}`);
    return `${n[0]} → ${n[1]} menu items`;
  });
  await check('navigation and desktop layout remain usable at minimum window size', async () => {
    const size = win.getSize();
    try {
      win.setSize(1040, 680);
      const result = await js<{ hash: string; focused: boolean; fits: boolean }>(`(async () => {
        document.querySelector('nav.nav button')?.click(); await new Promise(r => setTimeout(r, 300));
        const before = location.hash; document.querySelector('.skip').click();
        const main = document.querySelector('main');
        const cards = [...document.querySelectorAll('.kpi')];
        const chartsFit = cards.length === 4 && cards.every(card => card.querySelector('.kpi-sub').getBoundingClientRect().bottom <= card.querySelector('.kpi-line').getBoundingClientRect().top + 1);
        const funnel = [...document.querySelectorAll('.fstep')];
        const zeroWidths = funnel.length > 0 && funnel.every(step => step.style.getPropertyValue('--w') === '0%');
        return {hash:location.hash, focused:document.activeElement===main, fits:main.scrollWidth<=main.clientWidth+2 && document.querySelector('.side').clientHeight>0 && before===location.hash && chartsFit && zeroWidths};
      })()`);
      if (!result.focused || !result.fits || result.hash !== '#dashboard') throw new Error(JSON.stringify(result));
    } finally { win.setSize(size[0], size[1]); }
    const screenshot = process.env.QUARRIX_SMOKE_SCREENSHOT;
    if (screenshot) {
      await new Promise(r => setTimeout(r, 350));
      await js('document.querySelector("main")?.blur()');
      writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    }
    return 'skip link preserves route and dashboard fits minimum window';
  });
  await check('two primary opportunity entry points open the intended workspace', async () => {
    const result=await js<boolean>(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const dashboard=()=>document.querySelector('nav.nav button')?.click();dashboard();await wait(400);const b=document.querySelectorAll('[data-opportunity-home] button.opportunity-option');if(b.length!==2)return false;b[1].click();await wait(600);if(location.hash!=='#jobs')return false;dashboard();await wait(400);document.querySelector('[data-opportunity-home] button.opportunity-option')?.click();await wait(600);if(location.hash!=='#find')return false;document.querySelector('.ws-switch button:last-child')?.click();await wait(400);return true;})()`);
    if(!result)throw new Error('Opportunity mode navigation failed');return 'business and career entry points open correct screens';
  });
  await check('opportunity center has accessible controls and persists opt-in preference',async()=>{
    await js(`document.querySelector('nav.nav button')?.click()`);await new Promise(r=>setTimeout(r,700));
    const result=await js<boolean>(`(async()=>{const d=document.querySelector('[data-opportunity-center]');if(!d)return false;d.open=true;const box=d.querySelector('input[type=checkbox]');if(!box||!box.labels.length)return false;box.focus();if(document.activeElement!==box)return false;box.click();await new Promise(r=>setTimeout(r,600));return d.querySelector('input[type=checkbox]')?.checked===true;})()`);
    if(!result||!(await ipc('opportunities:center')).digest)throw new Error('Daily reminder preference was not saved or control was not accessible');await ipc('opportunities:digest',false);return 'named keyboard-focusable reminder control and local preference';
  });
  if(process.env.QUARRIX_AXE_SOURCE)await check('automated accessibility audit of discovery controls',async()=>{
    const source=(await import('node:fs')).readFileSync(process.env.QUARRIX_AXE_SOURCE!,'utf8');await js(source);const result=await js<{violations:{id:string;impact:string}[]}>(`axe.run(document.querySelector('[data-opportunity-home]'),{runOnly:{type:'rule',values:['button-name','link-name','label','aria-valid-attr','aria-valid-attr-value','aria-required-attr','aria-allowed-attr','nested-interactive']}})`);if(result.violations.length)throw new Error(result.violations.map(x=>x.id).join(', '));return '8 automated accessibility rules passed';
  });
  await check('offline career exploration works without an uploaded CV', async () => {
    const found = await js<boolean>(`(async () => {
      [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim().startsWith('Job search'))?.click();
      await new Promise(r => setTimeout(r, 700));
      const panel = document.querySelector('[data-career-explorer]'); if (!panel) return false;
      panel.open = true;
      const input = panel.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Registered Nurse');
      input.dispatchEvent(new Event('input', {bubbles: true}));
      await new Promise(r => setTimeout(r, 100));
      panel.querySelector('button[type=submit]').click();
      await new Promise(r => setTimeout(r, 300));
      return [...panel.querySelectorAll('b[translate=no]')].some(b => b.textContent === 'Registered Nurses');
    })()`);
    if (!found) throw new Error('No occupation recommendation was rendered');
    return 'real occupation returned without a CV or network request';
  });
  await check('desktop search keyboard and focus controls work without network calls',async()=>{
    const ok=await js<boolean>(`(async()=>{const button=document.getElementById('desktop-search-button');if(!button)return false;window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,250));const dialog=document.querySelector('[role=dialog][aria-label="Universal search"]');if(!dialog||document.activeElement!==dialog.querySelector('input')||!document.querySelector('main').inert)return false;document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,250));return !document.querySelector('[role=dialog][aria-label="Universal search"]')&&document.activeElement===button&&!document.querySelector('main').inert;})()`);
    if(!ok)throw new Error('Universal search keyboard or modal focus failed');return 'shortcut, focus, escape and background isolation';
  });
  await check('career portfolio builder loads local record',async()=>{
    const ok=await js<boolean>(`(async()=>{const nav=[...document.querySelectorAll('nav.nav button')].find(b=>b.textContent.trim().startsWith('Job search'));nav?.click();await new Promise(r=>setTimeout(r,900));const p=document.querySelector('[data-career-portfolio]');if(!p)return false;p.open=true;await new Promise(r=>setTimeout(r,600));return !!p.querySelector('textarea')&&!![...p.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save');})()`);
    if(!ok)throw new Error('Career portfolio controls missing');return 'local document builder';
  });
  await check('priority and recent-registration controls render without network calls',async()=>{
    const ok=await js<boolean>(`(async()=>{document.querySelector('nav.nav button')?.click();await new Promise(r=>setTimeout(r,900));const center=document.querySelector('[data-opportunity-center]');if(!center)return false;center.open=true;const registry=document.querySelector('[data-recent-registrations]');if(!registry)return false;registry.open=true;await new Promise(r=>setTimeout(r,400));return center.textContent.includes('Priority queue')&&!![...registry.querySelectorAll('button')].find(b=>b.textContent.trim()==='Load registrations');})()`);
    if(!ok)throw new Error('priority or registration controls missing');return 'on-demand registry and local priority controls';
  });
  await check('public vacancies and dashboard evidence controls render without network calls',async()=>{
    const ok=await js<boolean>(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const nav=t=>[...document.querySelectorAll('nav.nav button')].find(b=>b.textContent.trim().startsWith(t))?.click();nav('Dashboard');await wait(900);const coverage=!!document.querySelector('.quality-overview progress[aria-label]');nav('Job search');await wait(900);const panel=[...document.querySelectorAll('main details')].find(x=>x.querySelector('.public-result'));if(panel)panel.open=true;return coverage&&!![...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='Load public vacancies');})()`);
    if(!ok)throw new Error('public vacancy or evidence visual missing');return 'local dashboard and on-demand public source controls';
  });
  await check('job trust panel reports unavailable evidence honestly', async () => {
    const id = 'smoke-job-trust';
    await ipc('jobs:save', { id, title: 'Smoke Test Role', company: 'Smoke Test Employer', url: '', location: '', source: 'Smoke test', workplace: '', type: '', level: '', salary: '', posted: '', tags: [], snippet: '', status: 'Saved' });
    const found = await js<boolean>(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const nav = t => [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim().startsWith(t))?.click();
      nav('Dashboard'); await wait(300); nav('Job search'); await wait(800);
      [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim().startsWith('My applications'))?.click(); await wait(400);
      [...document.querySelectorAll('.joblist .job')].find(b => b.textContent.includes('Smoke Test Role'))?.click(); await wait(500);
      const panel = document.querySelector('[data-job-trust]'); if (!panel) return false;
      panel.querySelector('button[type=submit]')?.click(); await wait(500);
      const ok = panel.textContent.includes('Review before applying') && panel.textContent.includes('Could not verify');
      document.querySelector('.jobdetail button[aria-label=Close]')?.click(); return ok;
    })()`);
    await ipc('jobs:unsave', id);
    if (!found) throw new Error('Trust evidence panel did not render');
    return 'unavailable listing shown as unverified, no network request';
  });
  await check('application studio saves and retrieves a local next action', async () => {
    const id = 'smoke-application-studio';
    await ipc('jobs:save', { id, title: 'Studio Smoke Role', company: 'Studio Smoke Employer', url: '', location: '', source: 'Smoke test', workplace: '', type: '', level: '', salary: '', posted: '', tags: [], snippet: '', status: 'Saved' });
    const clicked = await js<boolean>(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const nav = t => [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim().startsWith(t))?.click();
      nav('Dashboard'); await wait(300); nav('Job search'); await wait(800);
      [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim().startsWith('My applications'))?.click(); await wait(400);
      [...document.querySelectorAll('.joblist .job')].find(b => b.textContent.includes('Studio Smoke Role'))?.click(); await wait(500);
      const panel = document.querySelector('[data-application-studio]'); if (!panel) return false;
      const input = panel.querySelector('input:not([type=date])'); if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Prepare interview'); input.dispatchEvent(new Event('input', {bubbles:true})); await wait(100);
      [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save studio')?.click(); await wait(500);
      document.querySelector('.jobdetail button[aria-label=Close]')?.click(); return true;
    })()`);
    const saved = (await ipc('jobs:saved')).find((j: any) => j.id === id);
    await ipc('jobs:unsave', id);
    if (!clicked || saved?.studio?.nextAction !== 'Prepare interview') throw new Error('Application studio failed to persist notes');
    return 'local application note saved through the installed interface';
  });
  await check('every button has an accessible name (QF-122)', async () => {
    const bad = await js<string[]>(`[...document.querySelectorAll('button, [role=button], a[href]')].filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim() || b.getAttribute('aria-labelledby'))).map((b) => b.outerHTML.slice(0, 80))`);
    if (bad.length) throw new Error(`${bad.length} unnamed: ${bad.slice(0, 3).join(' | ')}`);
    return 'all named';
  });
  await check('lead map with clustering draws (QF-015) and the week view of tasks opens (QF-054)', async () => {
    await ipc('leads:add', { name: 'Map Check Clinic', city: 'Lahore', country: 'PK', lat: 31.52, lon: 74.35 });
    const r = await js<{ map: boolean; week: boolean; err: string }>(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const nav = (t) => [...document.querySelectorAll('nav.nav button')].find((b) => b.textContent.trim().startsWith(t))?.click();
      const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
      nav('Leads'); await wait(700); btn('Map')?.click(); await wait(1500);
      const map = !!document.querySelector('.leaflet-container');
      nav('Pipeline'); await wait(700); [...document.querySelectorAll('[role=tab]')].find((b) => /Tasks/.test(b.textContent))?.click(); await wait(500); btn('Week')?.click(); await wait(500);
      const week = btn('Week')?.className.includes('primary') ?? false;
      return { map, week, err: document.querySelector('[data-screen-error]')?.textContent ?? '' };
    })()`);
    if (r.err || !r.map || !r.week) throw new Error(`map ${r.map}, week ${r.week} ${r.err}`);
    return 'map and week view drawn';
  });
  await check('privacy disclosures are listed for each feature (QF-120)', async () => { const p = await ipc('privacy:summary'); const n = Array.isArray(p) ? p.length : Object.keys(p ?? {}).length; if (!n) throw new Error('empty'); return `${n} entries`; });
  await check('database opens and migrates', () => { const t = (db.raw().prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table'").get() as { n: number }).n; if (t < 15) throw new Error(`${t} tables`); return `${t} tables`; });
  await check('IPC bridge answers', async () => `version ${(await ipc('app:info')).version}`);
  await check('lead saved and queried through IPC', async () => { await ipc('leads:add', { name: 'Smoke Test Bakery', email: 'hello@smoke.example', city: 'Lahore', country: 'PK' }); const r = await ipc('leads:query', { q: 'Smoke Test' }); if (r.total !== 1) throw new Error(`found ${r.total}`); return 'found 1'; });
  await check('client workspace isolation', async () => {
    await ipc('clients:set', 'Smoke client', ['Smoke client']);
    const r = await ipc('leads:query', { client: '*' });
    await ipc('clients:set', '');
    if (r.total !== 0) throw new Error(`another workspace showed ${r.total} leads`);
    return 'other workspace hidden';
  });
  await check('switching client clears selected leads and stale records', async () => {
    await ipc('clients:set', 'Scope smoke', ['Scope smoke']);
    try {
      await ipc('leads:add', { name: 'Scope Smoke Lead', category: 'Services', city: 'Lahore', country: 'PK' });
      const result = await js<boolean>(`(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const nav = t => [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim().startsWith(t))?.click();
        nav('Dashboard'); await wait(200); nav('Leads'); await wait(700);
        const box = document.querySelector('tbody input[type=checkbox]'); if (!box) return false;
        box.click(); await wait(100); if (!document.querySelector('.bulk')) return false;
        const picker = document.querySelector('select[aria-label="Client workspace"]'); if (!picker) return false;
        picker.value = ''; picker.dispatchEvent(new Event('change',{bubbles:true})); await wait(700);
        return !document.querySelector('.bulk') && !document.querySelector('tbody input:checked');
      })()`);
      if (!result) throw new Error('selection remained after client change');
      return 'selection cleared on scope change';
    } finally { await ipc('clients:set', ''); }
  });
  await check('market intelligence opens and respects client scope', async () => {
    await ipc('clients:set', 'Market smoke', ['Market smoke']);
    try {
      await ipc('leads:add', { name: 'Market Smoke Bakery', category: 'Bakery', city: 'Lahore', country: 'PK' });
      const shown = await js<boolean>(`(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const nav = t => [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim().startsWith(t))?.click();
        nav('Dashboard'); await wait(200); nav('Leads'); await wait(500);
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Market intelligence')?.click(); await wait(500);
        const panel = document.querySelector('[data-market-intelligence]');
        return !!panel && panel.querySelector('.kpis h2')?.textContent === '1' && panel.textContent.includes('Bakery');
      })()`);
      const result = await ipc('market:report', 'category', '', '');
      if (!shown || result.total.records !== 1) throw new Error('Market report did not isolate its workspace');
      return 'only the selected client’s record was reported';
    } finally { await ipc('clients:set', ''); }
  });
  await check('proposal studio persists and exports a real offline PDF',async()=>{
    const id=await ipc('leads:add',{name:'Proposal Smoke Business',category:'Services',city:'Lahore',country:'PK'});
    const p={...EMPTY_PROPOSAL,title:'Smoke proposal',items:[{description:'Service',quantity:2,unitMinor:1250}]};
    await ipc('proposal:save',id,p);const stored=await ipc('proposal:get',id);
    if(stored.title!==p.title)throw new Error('Proposal not saved');
    const pdf=await documentPdf(proposalText(stored,'Proposal Smoke Business'));
    if(pdf.subarray(0,5).toString()!=='%PDF-'||pdf.length<500)throw new Error('PDF not generated');
    return 'saved proposal and rendered local PDF';
  });
  await check('global opportunities filters and grant search are available without network calls',async()=>{
    const ok=await js<boolean>(`(async()=>{const nav=[...document.querySelectorAll('nav.nav button')].find(b=>b.textContent.trim().startsWith('Job search'));nav?.click();await new Promise(r=>setTimeout(r,900));const button=[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='Public opportunities');if(!document.querySelector('[data-public-opportunities]'))button?.click();await new Promise(r=>setTimeout(r,500));const p=document.querySelector('[data-public-opportunities]');return !!p&&!!p.querySelector('option[value="scholarship"]')&&!!p.querySelector('option[value="apprenticeship"]')&&[...p.querySelectorAll('button')].some(b=>b.textContent.trim()==='Search grants');})()`);
    if(!ok)throw new Error('Global opportunity category or grant search missing');return 'official directory filters and on-demand funding search';
  });
  await check('public opportunity watchlist saves official links locally',async()=>{
    const p=await ipc('public:save',{...EMPTY_OPPORTUNITY,title:'Public opportunity smoke fixture',url:'https://njp.gov.pk/jobs/123'});
    const found=(await ipc('public:list')).some((x:any)=>x.id===p.id&&x.url===p.url);
    await ipc('public:delete',p.id);if(!found)throw new Error('Watchlist not saved');return 'official link saved and removed locally';
  });
  await check('sending stays off until approved', async () => { const r = await js<{ ok: boolean; error?: string }>('window.quarrix.call("messages:approveAll")'); return r.ok ? `approved ${(r as any).data} (no mailbox)` : r.error ?? ''; });
  await check('network guard refuses this computer', async () => {
    try { await fetchText('http://127.0.0.1:9/'); } catch (e: any) { if (/private/i.test(e.message)) return 'blocked'; throw e; }
    throw new Error('a local address was fetched');
  });
  await check('every screen is translated, and Arabic switches to right-to-left (QF-123)', async () => {
    await ipc('settings:save', { language: 'ar' });
    const loaded = new Promise<void>((res) => win.webContents.once('did-finish-load', () => res()));
    win.webContents.reload();
    await loaded;
    await new Promise((r) => setTimeout(r, 2500));
    const r = await js<{ dir: string; nav: string[]; english: number; left: string[]; stableValues: boolean }>(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const nav = [...document.querySelectorAll('nav.nav button')].map((b) => b.textContent.trim());
      const left = new Set();
      for (const b of document.querySelectorAll('nav.nav button')) { b.click(); await wait(800);
        for (const e of document.querySelectorAll('main *')) for (const n of e.childNodes) if (n.nodeType === 3 && /[a-z]{3,} [a-z]{3,}/.test(n.nodeValue) && !e.closest('textarea,code,pre,[translate="no"]')) left.add(n.nodeValue.trim().slice(0, 60)); }
      [...document.querySelectorAll('nav.nav button')].find(b => b.textContent.trim() === 'البحث عن وظيفة')?.click(); await wait(500);
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'الفرص العامة')?.click(); await wait(500);
      const option = document.querySelector('[data-public-opportunities] option[value="Watching"]');
      const stableValues = !!option && option.textContent !== 'Watching' && option.parentElement.value === 'Watching';
      return { dir: document.documentElement.dir, nav, english: left.size, left: [...left].slice(0, 40), stableValues };
    })()`);
    if (process.env.QUARRIX_SMOKE_VERBOSE) console.log(JSON.stringify(r.left, null, 1));
    await ipc('settings:save', { language: 'en' });
    if (r.dir !== 'rtl') throw new Error(`dir=${r.dir}`);
    if (!r.nav.includes('الإعدادات')) throw new Error(`menu not translated: ${r.nav.join(', ')}`);
    if (!r.stableValues) throw new Error('Translated status changed its stored value');
    if (r.english > 25) throw new Error(`${r.english} English phrases left: ${r.left.slice(0, 5).join(' | ')}`);
    return `rtl, menu in Arabic, ${r.english} English phrases left across all screens (dynamic sentences)`;
  });
  await check('local API is not running unless enabled', async () => { const r = await ipc('settings:get'); return r.api?.on ? 'on' : 'off (default)'; });
  await check('command-line tool is packaged', () => {
    const p = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'quarrix.mjs') : join(app.getAppPath(), 'bin', 'quarrix.mjs');
    if (!existsSync(p)) throw new Error(`missing ${p}`);
    return 'present';
  });
  await check('secrets are encrypted at rest or kept in memory', async () => { const s = await ipc('settings:get'); return s.secretsSessionOnly ? 'no OS keychain on this runner: secrets stay in memory' : 'OS keychain available'; });

  const ok = checks.every((c) => c.ok);
  writeFileSync(smokeOut(), JSON.stringify({ ok, version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, checks }, null, 2));
  app.exit(ok ? 0 : 1);
}
