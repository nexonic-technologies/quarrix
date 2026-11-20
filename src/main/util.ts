import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export const BOT_UA = 'Quarrix/1.0 (+https://github.com/nexonic-technologies/quarrix)';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, opts: { timeout?: number; ua?: string; method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: opts.method ?? 'GET', body: opts.body, signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': opts.ua ?? UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...(opts.headers ?? {}) },
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, url: r.url, text, ms: Date.now() - start, type: r.headers.get('content-type') ?? '', link: r.headers.get('link') ?? '' };
  } finally {
    clearTimeout(t);
  }
}

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
