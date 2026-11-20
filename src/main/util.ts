import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export const BOT_UA = 'Quarrix/1.0 (+https://github.com/nexonic-technologies/quarrix)';

import { lookup } from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { isIP } from 'node:net';
import { isBlockedHost, isPrivateAddress } from './safety';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchOpts = { timeout?: number; ua?: string; method?: string; body?: string | Uint8Array; headers?: Record<string, string>; allowLocal?: boolean; maxBytes?: number; partial?: boolean };

/** Thrown when a response is bigger than the caller allows. Quarrix never works on silently cut-off data. */
export class TooLargeError extends Error {
  constructor(public limit: number, url: string) { super(`The response from ${(() => { try { return new URL(url).hostname; } catch { return 'the server'; } })()} is larger than ${Math.round(limit / 1000)} kB and was rejected.`); this.name = 'TooLargeError'; }
}

/** Headers that carry credentials. They are sent only to the origin they were written for. Pure, exported for tests. */
export const isSensitiveHeader = (name: string) => /^(authorization|proxy-authorization|cookie)$/i.test(name) || /(api[-_]?key|token|secret|password|auth|session|signature|credential)/i.test(name);
/** Headers for the next hop of a redirect: credentials are dropped when the origin changes. Pure. */
export function redirectHeaders(headers: Record<string, string>, from: string, to: string) {
  if (new URL(from).origin === new URL(to).origin) return headers;
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !isSensitiveHeader(k)));
}
/** Credential-like query parameters are not carried to another origin either (servers sometimes echo them into Location). Pure. */
export function redirectUrl(next: string, from: string) {
  const u = new URL(next);
  if (u.origin === new URL(from).origin) return u.toString();
  for (const k of [...u.searchParams.keys()]) if (/^(key|api[-_]?key|apikey|token|access[-_]?token|secret|sig|signature|password|auth)$/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/**
 * DNS-rebinding-safe connections: the address is checked at connect time, on the exact IP the socket uses,
 * so a name that resolves to a public address for the check and a private one for the request is still refused.
 */
const safeLookup = (host: string, opts: any, cb: (err: Error | null, address?: any, family?: number) => void) => {
  dnsLookup(host, { ...opts, all: true }, (err, addrs: any) => {
    if (err) return cb(err);
    const list = (Array.isArray(addrs) ? addrs : [{ address: addrs, family: opts?.family ?? 4 }]) as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad) return cb(Object.assign(new Error('Blocked a link that resolves to a private network address.'), { code: 'EBLOCKED' }));
    if (opts?.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
};
export { safeLookup };
const nativeFetch = globalThis.fetch;
// At most 6 connections per origin and bounded timeouts, so one slow or hostile host cannot tie up the app.
const publicAgent = new Agent({ connect: { lookup: safeLookup as any, timeout: 15000 }, headersTimeout: 30000, bodyTimeout: 60000, connections: 6, maxRedirections: 0 } as any);

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

let requestHook: (host: string) => void = () => undefined;
/** Called before every request (budgets and usage counts). The hook may throw to stop a request. */
export const onRequest = (fn: (host: string) => void) => { requestHook = fn; };

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
    let headers = { 'User-Agent': opts.ua ?? UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...(opts.headers ?? {}) } as Record<string, string>;
    for (let hop = 0; ; hop++) {
      if (!opts.allowLocal) await assertPublicUrl(cur);
      requestHook(new URL(cur).hostname);
      // Tests replace globalThis.fetch with recorded responses; the app always uses the checked connection.
      const r = await (opts.allowLocal || globalThis.fetch !== nativeFetch ? globalThis.fetch : (undiciFetch as unknown as typeof fetch))(cur, {
        ...(opts.allowLocal ? {} : { dispatcher: publicAgent }),
        method, body: body as BodyInit | undefined, signal: ctrl.signal, redirect: 'manual', headers,
      } as RequestInit);
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        if (hop >= 5) throw new Error('Too many redirects.');
        const next = redirectUrl(new URL(loc, cur).toString(), cur);
        // Never follow a secure page to a plain-text one while carrying a body or credentials.
        if (cur.startsWith('https:') && next.startsWith('http:') && (body || Object.keys(headers).some(isSensitiveHeader))) throw new Error('Refused a redirect from https to http.');
        headers = redirectHeaders(headers, cur, next);
        if (r.status !== 307 && r.status !== 308) { method = 'GET'; body = undefined; delete headers['Content-Type']; delete headers['content-type']; }
        // A 307/308 resends the body; a body can hold secrets (OAuth client secrets, form data), so never to another origin.
        else if (body && new URL(next).origin !== new URL(cur).origin) throw new Error('Refused to resend a request body to another site after a redirect.');
        cur = next;
        void r.body?.cancel().catch(() => undefined);
        continue;
      }
      const declared = Number(r.headers.get('content-length') ?? 0);
      if (declared > max && !opts.partial) { void r.body?.cancel().catch(() => undefined); throw new TooLargeError(max, cur); }
      const { text, cut } = await readCapped(r, max);
      if (cut && !opts.partial) throw new TooLargeError(max, cur);
      return { ok: r.ok, status: r.status, url: cur, text, ms: Date.now() - start, type: r.headers.get('content-type') ?? '', link: r.headers.get('link') ?? '', truncated: cut };
    }
  } finally {
    clearTimeout(t);
  }
}

async function readCapped(r: Response, max: number): Promise<{ text: string; cut: boolean }> {
  if (!r.body) return { text: '', cut: false };
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel(); return { text: new TextDecoder().decode(Buffer.concat(parts)), cut: true }; }
    parts.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(parts)), cut: false };
}

/** Binary fetch for range reads (Overture): public hosts only, counted against budgets, no redirects. */
export async function safeFetch(url: string | URL | Request, init: RequestInit = {}) {
  const u = String(url instanceof Request ? url.url : url);
  await assertPublicUrl(u);
  requestHook(new URL(u).hostname);
  const f = globalThis.fetch !== nativeFetch ? globalThis.fetch : (undiciFetch as unknown as typeof fetch);
  return f(u, { ...init, redirect: 'error', ...(f === globalThis.fetch ? {} : { dispatcher: publicAgent }) } as RequestInit);
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
