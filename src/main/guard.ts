// Security guards for every hidden browser session and the main window (critical fixes, 0.20).
// Requests to this computer or the local network are cancelled even after redirects or in-page navigation,
// permission prompts are refused, and pop-ups are never opened.
import { session, type Session, type WebContents } from 'electron';
import { isBlockedHost, isSafeExternalUrl } from './safety';

export function lockSession(s: Session, allowLocalFiles = false) {
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    try {
      const u = new URL(d.url);
      if (['devtools:', 'chrome-extension:', 'data:', 'blob:'].includes(u.protocol)) return cb({});
      if (u.protocol === 'file:') return cb({ cancel: !allowLocalFiles });
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return cb({ cancel: true });
      // The app's own dev server is the only local address the main window may load.
      if (allowLocalFiles && u.hostname === 'localhost' && process.env.VITE_DEV) return cb({});
      return cb({ cancel: isBlockedHost(u.hostname) });
    } catch { return cb({ cancel: true }); }
  });
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
}

export function lockContents(wc: WebContents) {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
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
