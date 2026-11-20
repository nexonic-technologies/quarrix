import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export const BOT_UA = 'Quarrix/1.0 (+https://github.com/nexonic-technologies/quarrix)';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isBlockedHost, isPrivateAddress } from './safety';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchOpts = { timeout?: number; ua?: string; method?: string; body?: string; headers?: Record<string, string>; allowLocal?: boolean; maxBytes?: number };

/** Throws when the URL points at this computer or the local network (protects against SSRF from scraped links). */
export async function assertPublicUrl(url: string) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`Blocked link type ${u.protocol}`);
  if (isBlockedHost(u.hostname)) throw new Error('Blocked a link to a private network address.');
  if (!isIP(u.hostname.replace(/^\[|\]$/g, ''))) {
    const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
    if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('Blocked a link that resolves to a private network address.');
  }
}

/**
 * Fetch a page as text. Redirects are followed by hand (up to 5) so every hop is checked, and the body is capped
 * (3 MB by default). Pass allowLocal only for endpoints the user typed themselves, such as a local AI server.
 */
export async function fetchText(url: string, opts: FetchOpts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  const start = Date.now();
  const max = opts.maxBytes ?? 3_000_000;
  try {
    let cur = url;
    let method = opts.method ?? 'GET';
    let body = opts.body;
    for (let hop = 0; ; hop++) {
      if (!opts.allowLocal) await assertPublicUrl(cur);
      const r = await fetch(cur, {
        method, body, signal: ctrl.signal, redirect: 'manual',
        headers: { 'User-Agent': opts.ua ?? UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...(opts.headers ?? {}) },
      });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        if (hop >= 5) throw new Error('Too many redirects.');
        cur = new URL(loc, cur).toString();
        if (r.status !== 307 && r.status !== 308) { method = 'GET'; body = undefined; }
        continue;
      }
      const text = await readCapped(r, max);
      return { ok: r.ok, status: r.status, url: cur, text, ms: Date.now() - start, type: r.headers.get('content-type') ?? '', link: r.headers.get('link') ?? '' };
    }
  } finally {
    clearTimeout(t);
  }
}

async function readCapped(r: Response, max: number) {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); break; }
    parts.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}

/** For endpoints the user configured on purpose (local AI servers such as Ollama or LM Studio). */
export const fetchTrusted = (url: string, opts: FetchOpts = {}) => fetchText(url, { ...opts, allowLocal: true });

export function domainOf(url: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
    return u.hostname.toLowerCase().replace(/^www\d?\./, '');
  } catch {
    return '';
  }
}

const PLATFORM_HOSTS = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'yelp.com', 'yell.com', 'google.com', 'goo.gl', 'linktr.ee', 'tripadvisor.com', 'booking.com', 'opentable.com', 'wa.me', 'youtube.com', 'tiktok.com', 'business.site', 'g.page'];
export const isPlatformHost = (d: string) => PLATFORM_HOSTS.some((h) => d === h || d.endsWith('.' + h));

export function normalizePhone(raw: string, country = '') {
  if (!raw) return '';
  const p = parsePhoneNumberFromString(raw.replace(/^tel:/i, ''), (country || undefined) as CountryCode | undefined);
  return p?.isValid() ? p.formatInternational() : raw.replace(/[^\d+()\-\s]/g, '').trim();
}

export function phoneDigits(raw: string) {
  return raw.replace(/[^\d]/g, '');
}

export const csvSafe = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // stop spreadsheet formula injection
};

/** "United States" → "US". Uses the built-in country names, plus a few common short forms. */
let countryMap: Map<string, string> | null = null;
export function countryCode(name: string) {
  const n = name.trim().toLowerCase().replace(/\.$/, '');
  if (!n) return '';
  if (!countryMap) {
    countryMap = new Map([['usa', 'US'], ['u.s.a', 'US'], ['uk', 'GB'], ['england', 'GB'], ['scotland', 'GB'], ['wales', 'GB'], ['uae', 'AE']]);
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try { const label = dn.of(code); if (label && label !== code) countryMap.set(label.toLowerCase(), code); } catch { /* not a region */ }
    }
  }
  return countryMap.get(n) ?? (/^[a-z]{2}$/.test(n) ? n.toUpperCase() : '');
}
