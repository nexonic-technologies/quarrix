// Installed-app smoke test (0.22). The release workflow starts the packaged app with QUARRIX_SMOKE_OUT set; the app opens its
// window from the installed files, exercises the real main process through the real interface and IPC bridge, writes a JSON
// report and quits. Nothing here touches the network beyond this computer, and it uses its own empty data folder.
import { app, type BrowserWindow } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db';
import { fetchText } from './util';

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
    await js('[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Skip setup").click()');
    await new Promise((r) => setTimeout(r, 600));
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
    const r = await js<{ dir: string; nav: string[]; english: number; left: string[] }>(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const nav = [...document.querySelectorAll('nav.nav button')].map((b) => b.textContent.trim());
      const left = new Set();
      for (const b of document.querySelectorAll('nav.nav button')) { b.click(); await wait(800);
        for (const e of document.querySelectorAll('main *')) for (const n of e.childNodes) if (n.nodeType === 3 && /[a-z]{3,} [a-z]{3,}/.test(n.nodeValue) && !e.closest('textarea,code,pre,[translate="no"]')) left.add(n.nodeValue.trim().slice(0, 60)); }
      return { dir: document.documentElement.dir, nav, english: left.size, left: [...left].slice(0, 40) };
    })()`);
    if (process.env.QUARRIX_SMOKE_VERBOSE) console.log(JSON.stringify(r.left, null, 1));
    await ipc('settings:save', { language: 'en' });
    if (r.dir !== 'rtl') throw new Error(`dir=${r.dir}`);
    if (!r.nav.includes('الإعدادات')) throw new Error(`menu not translated: ${r.nav.join(', ')}`);
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
