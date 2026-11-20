// Google Maps through a hidden browser window on this computer, at a human pace.
// Google changes its page often; every selector here has a fallback, and failures are reported, not hidden.
import { BrowserWindow } from 'electron';
import { countryCode, sleep } from '../util';
import type { Candidate, Progress } from './types';

let win: BrowserWindow | null = null;
let stopFlag = false;
export const stopMaps = () => { stopFlag = true; };

function window() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'persist:quarrix-maps', offscreen: false, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  return win;
}

const js = <T>(code: string) => window().webContents.executeJavaScript(code, true) as Promise<T>;

async function load(url: string) {
  const w = window();
  await w.loadURL(url, { userAgent: w.webContents.getUserAgent().replace(/Electron\/\S+\s?/, '').replace(/quarrix\/\S+\s?/i, '') });
  // Cookie consent (shown in the EU/UK): choose "Reject all" when offered.
  if (/consent\.google\./.test(w.webContents.getURL())) {
    await js(`(() => { const b = [...document.querySelectorAll('button, input[type=submit]')]; const r = b.find(x => /reject all|alle ablehnen|tout refuser|rechazar todo/i.test(x.innerText || x.value)) || b.find(x => /accept all/i.test(x.innerText || x.value)); r && r.click(); })()`);
    await sleep(3000);
  }
}

async function waitFor(selector: string, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
    await sleep(300);
  }
  return false;
}

export async function searchMaps(category: string, place: string, limit: number, delayMs: number, progress: Progress, seen = new Set<string>()): Promise<Candidate[]> {
  if (limit <= 0) return [];
  await load(`https://www.google.com/maps/search/${encodeURIComponent(`${category} in ${place}`)}?hl=en`);
  if (await js<boolean>(`/unusual traffic|not a robot/i.test(document.body.innerText)`)) throw new Error('Google is asking for a captcha. Pause Google Maps searches for an hour, or use the Places API or OpenStreetMap.');

  // A single exact match opens the place page directly.
  if (!(await waitFor('div[role="feed"]', 10000))) {
    if (await waitFor('h1', 3000)) {
      const one = await readPlace(category);
      if (!one || seen.has(one.source_ref)) return [];
      seen.add(one.source_ref);
      return [one];
    }
    throw new Error('Google Maps showed no results list. The page layout may have changed.');
  }

  // Scroll the results list until enough places are loaded or the list ends.
  let links: string[] = [];
  for (let i = 0; i < 60 && links.length < limit && !stopFlag; i++) {
    links = (await js<string[]>(`[...new Set([...document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]')].map(a => a.href))]`)).filter((h) => !seen.has(placeKey(h)));
    progress(`Google Maps: ${links.length} places listed`, links.length);
    const end = await js<boolean>(`(() => { const f = document.querySelector('div[role="feed"]'); f.scrollBy(0, 2500); return /reached the end of the list/i.test(f.innerText); })()`);
    if (end) break;
    await sleep(900 + Math.random() * 700);
  }
  links = links.slice(0, limit);

  const out: Candidate[] = [];
  for (const [i, href] of links.entries()) {
    if (stopFlag) break;
    seen.add(placeKey(href));
    try {
      await load(href + (href.includes('?') ? '&' : '?') + 'hl=en');
      await waitFor('h1', 10000);
      await sleep(600);
      const c = await readPlace(category, href);
      if (c) out.push(c);
    } catch { /* skip this place */ }
    progress(`Google Maps: details ${i + 1} of ${links.length}`, out.length);
    await sleep(delayMs + Math.random() * delayMs * 0.6);
  }
  return out;
}

const placeKey = (href: string) => href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? href.split('/maps/place/')[1]?.split('/')[0] ?? href;
export const resetMaps = () => { stopFlag = false; };

async function readPlace(category: string, href = ''): Promise<Candidate | null> {
  const d = await js<Record<string, any>>(`(() => {
    const q = s => document.querySelector(s);
    const txt = el => (el && (el.getAttribute('aria-label') || el.innerText) || '').trim();
    const phoneEl = q('button[data-item-id^="phone:tel:"]');
    const ratingEl = q('div.F7nice span[aria-hidden="true"]') || q('span.ceNzKf');
    const reviewsEl = [...document.querySelectorAll('span[aria-label]')].find(s => /reviews?$/i.test(s.getAttribute('aria-label')));
    return {
      name: (q('h1') || {}).innerText || '',
      category: txt(q('button[jsaction*="category"]')),
      address: txt(q('button[data-item-id="address"]')).replace(/^Address:\\s*/i, ''),
      website: (q('a[data-item-id="authority"]') || {}).href || '',
      phone: phoneEl ? phoneEl.getAttribute('data-item-id').replace('phone:tel:', '') : '',
      rating: ratingEl ? parseFloat(ratingEl.innerText.replace(',', '.')) : null,
      reviews: reviewsEl ? parseInt(reviewsEl.getAttribute('aria-label').replace(/[^0-9]/g, ''), 10) : null,
      closed: /permanently closed/i.test(document.body.innerText.slice(0, 4000)),
      url: location.href,
    };
  })()`);
  if (!d.name || d.closed) return null;
  const url = href || d.url;
  const m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const id = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? url.split('/maps/place/')[1]?.split('/')[0] ?? d.name;
  let parts = String(d.address).split(',').map((s: string) => s.trim()).filter(Boolean);
  const country = parts.length > 1 ? countryCode(parts[parts.length - 1]) : '';
  if (country) parts = parts.slice(0, -1); // the remaining parts end with "City, Region Postcode"
  parts.push('');
  return {
    source: 'gmaps', source_ref: id, name: d.name, category: d.category || category, address: d.address,
    city: parts.length >= 3 ? parts[parts.length - 3] : '', region: (parts[parts.length - 2] ?? '').replace(/\s*\d.*$/, ''), country,
    postcode: (parts[parts.length - 2] ?? '').match(/\b[A-Z0-9]{2,4}\s?[A-Z0-9]{2,4}\b|\b\d{4,6}\b/)?.[0] ?? '',
    lat: m ? +m[1] : null, lon: m ? +m[2] : null, phone: d.phone, email: '', website: d.website, rating: d.rating, reviews: d.reviews,
  };
}

export function closeMaps() {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}
