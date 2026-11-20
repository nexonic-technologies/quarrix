// Security guards for every hidden browser session and the main window (critical fixes, 0.20).
// Requests to this computer or the local network are cancelled even after redirects or in-page navigation,
// permission prompts are refused, and pop-ups are never opened.
import { session, type Session, type WebContents } from 'electron';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isBlockedHost, isPrivateAddress, isSafeExternalUrl } from './safety';
export { devOrigin };

const dnsCache = new Map<string, { bad: boolean; until: number }>();
/** Resolve a host name and refuse it when any address is private (checked again every minute, so a rebinding name is caught). */
async function resolvesPrivate(host: string) {
  if (isIP(host)) return isPrivateAddress(host);
  const c = dnsCache.get(host);
  if (c && c.until > Date.now()) return c.bad;
  const addrs = await lookup(host, { all: true }).catch(() => []);
  const bad = addrs.some((a) => isPrivateAddress(a.address));
  dnsCache.set(host, { bad, until: Date.now() + 60_000 });
  return bad;
}
/** The development server's origin, when running from source (QUARRIX_DEV_URL); the main window may load it and nothing else local. */
const devOrigin = () => { try { return process.env.QUARRIX_DEV_URL ? new URL(process.env.QUARRIX_DEV_URL).origin : ''; } catch { return ''; } };

export function lockSession(s: Session, allowLocalFiles = false) {
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    let u: URL;
    try { u = new URL(d.url); } catch { return cb({ cancel: true }); }
    if (['devtools:', 'chrome-extension:', 'data:', 'blob:'].includes(u.protocol)) return cb({});
    if (u.protocol === 'file:') return cb({ cancel: !allowLocalFiles });
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return cb({ cancel: true });
    if (allowLocalFiles && devOrigin() && (u.origin === devOrigin() || u.origin === devOrigin().replace(/^http/, 'ws'))) return cb({});
    if (isBlockedHost(u.hostname)) return cb({ cancel: true });
    void resolvesPrivate(u.hostname.replace(/^\[|\]$/g, '')).then((bad) => cb({ cancel: bad }), () => cb({ cancel: true }));
  });
  s.on('will-download', (e) => e.preventDefault());
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
}

export function lockContents(wc: WebContents) {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
  // Hidden pages may follow links only to public web pages.
  wc.on('will-navigate', (e, url) => { try { const u = new URL(url); if (!['http:', 'https:', 'file:'].includes(u.protocol) || (u.protocol !== 'file:' && isBlockedHost(u.hostname) && u.origin !== devOrigin())) e.preventDefault(); } catch { e.preventDefault(); } });
}

let done = false;
/** Called once at start: guard every session Quarrix uses for scraping, reports and the interface. */
export function lockAll() {
  if (done) return;
  done = true;
  for (const p of ['persist:quarrix-maps', 'persist:quarrix-pages', 'quarrix-proof']) lockSession(session.fromPartition(p));
  lockSession(session.defaultSession, true);
}
export { isSafeExternalUrl };
