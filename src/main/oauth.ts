// Sign in to Gmail or Microsoft 365 with OAuth instead of a password (QF-059, QF-060).
// Desktop flow: a one-time local loopback page receives the code (PKCE), tokens are stored encrypted.
// The user creates their own OAuth client (Google Cloud "Desktop app" or Azure "Mobile and desktop") and pastes its ID.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import { load, save } from './settings';
import { fetchText } from './util';

export const PROVIDERS = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    scope: 'https://mail.google.com/ openid email', smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, imap: { host: 'imap.gmail.com', port: 993 },
  },
  microsoft: {
    auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'https://outlook.office.com/SMTP.Send https://outlook.office.com/IMAP.AccessAsUser.All offline_access openid email', smtp: { host: 'smtp.office365.com', port: 587, secure: false }, imap: { host: 'outlook.office365.com', port: 993 },
  },
} as const;
export type OAuthProvider = keyof typeof PROVIDERS;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let access: { token: string; until: number } | null = null;

function emailFromIdToken(idToken?: string) {
  try { return JSON.parse(Buffer.from((idToken ?? '').split('.')[1], 'base64').toString()).email ?? ''; } catch { return ''; }
}

async function tokenRequest(p: OAuthProvider, body: Record<string, string>) {
  const r = await fetchText(PROVIDERS[p].token, { method: 'POST', body: new URLSearchParams(body).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, timeout: 30000 });
  const j = JSON.parse(r.text || '{}');
  if (!r.ok || j.error) throw new Error(j.error_description || j.error || `Sign-in failed (HTTP ${r.status})`);
  return j as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

/** Browser sign-in with PKCE through a one-time local page; returns the tokens. */
export async function authorize(p: OAuthProvider, scope: string, clientId: string, clientSecret = '') {
  const e = { oauthClientId: clientId, oauthClientSecret: clientSecret };
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const { code, redirect } = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">${ok ? 'Quarrix is connected. You can close this tab.' : 'Sign-in was cancelled or failed. You can close this tab.'}</body>`);
      clearTimeout(timer);
      server.close();
      ok ? resolve({ code: u.searchParams.get('code')!, redirect: `http://127.0.0.1:${(server.address() as any).port}/callback` }) : reject(new Error(u.searchParams.get('error_description') || u.searchParams.get('error') || 'Sign-in was cancelled.'));
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('Sign-in timed out after 5 minutes.')); }, 5 * 60000);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const q = new URLSearchParams({ client_id: e.oauthClientId, redirect_uri: `http://127.0.0.1:${port}/callback`, response_type: 'code', scope, state, code_challenge: challenge, code_challenge_method: 'S256', ...(p === 'google' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }) });
      void shell.openExternal(`${PROVIDERS[p].auth}?${q}`);
    });
  });
  return tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: e.oauthClientId, code_verifier: verifier, ...(e.oauthClientSecret ? { client_secret: e.oauthClientSecret } : {}) });
}

/** Refresh any stored token (used by Google Sheets). */
export const refresh = (p: OAuthProvider, refreshToken: string, scope: string, clientId: string, clientSecret = '') =>
  tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, scope, ...(clientSecret ? { client_secret: clientSecret } : {}) });

/** Opens the browser, waits for the user to approve, saves the refresh token. Returns the signed-in address. */
export async function connect(p: OAuthProvider): Promise<string> {
  const e = load().email;
  if (!e.oauthClientId) throw new Error('Paste your OAuth client ID first (see the steps under the button).');
  const t = await authorize(p, PROVIDERS[p].scope, e.oauthClientId, e.oauthClientSecret);
  if (!t.refresh_token) throw new Error('The provider did not return a long-lived token. Remove Quarrix from your account\'s connected apps and try again.');
  const user = emailFromIdToken(t.id_token) || e.fromEmail;
  access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  const pr = PROVIDERS[p];
  save({ email: { auth: p, oauthRefresh: t.refresh_token, oauthUser: user, smtpHost: pr.smtp.host, smtpPort: pr.smtp.port, smtpSecure: pr.smtp.secure, imapHost: pr.imap.host, imapPort: pr.imap.port, smtpUser: user, imapUser: user, fromEmail: e.fromEmail || user } });
  return user;
}

export function disconnect() {
  access = null;
  save({ email: { auth: 'password', oauthRefresh: '', oauthUser: '' } });
}

/** A fresh access token, refreshed when it expires. */
export async function accessToken(): Promise<string> {
  const e = load().email;
  if (e.auth === 'password') throw new Error('Not using OAuth.');
  if (access && access.until > Date.now()) return access.token;
  if (!e.oauthRefresh) throw new Error('Reconnect your mailbox in Settings → Email.');
  const t = await tokenRequest(e.auth as OAuthProvider, { grant_type: 'refresh_token', refresh_token: e.oauthRefresh, client_id: e.oauthClientId, scope: PROVIDERS[e.auth as OAuthProvider].scope, ...(e.oauthClientSecret ? { client_secret: e.oauthClientSecret } : {}) });
  access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  if (t.refresh_token && t.refresh_token !== e.oauthRefresh) save({ email: { oauthRefresh: t.refresh_token } });
  return access.token;
}
