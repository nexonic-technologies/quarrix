// Several sending mailboxes (QF-061) and SendGrid as a sending option (QF-075).
// "main" is the mailbox in Settings → Email; extra ones live in settings.mailboxes. Each has its own approval,
// daily limit and warm-up, and every lead's whole sequence goes out from one mailbox so replies stay in one thread.
import nodemailer from 'nodemailer';
import * as db from './db';
import { accessToken as mainToken, authorize, PROVIDERS, refresh } from './oauth';
import { load, save, type Mailbox, type Settings } from './settings';
import { fetchText } from './util';

export type Box = Mailbox & { main: boolean };

export function mainBox(s: Settings = load()): Box {
  const e = s.email;
  return {
    id: 'main', main: true, label: 'Main mailbox', kind: e.auth === 'password' ? 'smtp' : e.auth, on: true, fromName: e.fromName, fromEmail: e.fromEmail || e.oauthUser || e.smtpUser,
    smtpHost: e.smtpHost, smtpPort: e.smtpPort, smtpSecure: e.smtpSecure, smtpUser: e.auth === 'password' ? e.smtpUser : e.oauthUser || e.smtpUser, smtpPass: e.smtpPass,
    imapOn: e.imapOn, imapHost: e.imapHost, imapPort: e.imapPort, imapUser: e.auth === 'password' ? e.imapUser : e.oauthUser || e.imapUser, imapPass: e.imapPass,
    oauthRefresh: e.oauthRefresh, sendgridKey: '', dailyLimit: e.dailyLimit, authorizedAt: e.authorizedAt, authorizedFrom: e.authorizedFrom,
  };
}
export const boxes = (s: Settings = load()): Box[] => [mainBox(s), ...(s.mailboxes ?? []).filter((b) => b.on).map((b) => ({ ...b, main: false }))];
export const boxById = (id: string | null | undefined, s: Settings = load()) => boxes(s).find((b) => b.id === (id || 'main')) ?? mainBox(s);

export const connected = (b: Box) => b.kind === 'sendgrid' ? !!b.sendgridKey : b.kind === 'smtp' ? !!(b.smtpUser && b.smtpPass) : !!b.oauthRefresh;
export const fromOf = (b: Box) => (b.fromEmail || b.smtpUser).toLowerCase();
/** Each mailbox must be approved for its own sending address; changing the address turns it off again. */
export const approved = (b: Box, s: Settings = load()) => !!b.authorizedAt && b.authorizedFrom === fromOf(b) && !s.email.pausedReason;

const tokens = new Map<string, { token: string; until: number }>();
async function token(b: Box) {
  if (b.main) return mainToken();
  const c = tokens.get(b.id);
  if (c && c.until > Date.now()) return c.token;
  const e = load().email;
  const p = b.kind as 'google' | 'microsoft';
  const t = await refresh(p, b.oauthRefresh, PROVIDERS[p].scope, e.oauthClientId, e.oauthClientSecret);
  tokens.set(b.id, { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

export async function transport(b: Box) {
  if (b.kind === 'smtp') return nodemailer.createTransport({ host: b.smtpHost, port: b.smtpPort, secure: b.smtpSecure, auth: { user: b.smtpUser, pass: b.smtpPass }, connectionTimeout: 20000 });
  return nodemailer.createTransport({ host: b.smtpHost, port: b.smtpPort, secure: b.smtpSecure, auth: { type: 'OAuth2', user: b.smtpUser, accessToken: await token(b) }, connectionTimeout: 20000 });
}
export async function imapAuth(b: Box) {
  return b.kind === 'smtp' ? { user: b.imapUser, pass: b.imapPass } : { user: b.imapUser || b.smtpUser, accessToken: await token(b) };
}

/** Send one message through a mailbox. SendGrid uses its v3 API; everything else uses SMTP. */
export async function deliver(b: Box, msg: { from: { name: string; address: string }; to: string; subject: string; text: string; messageId: string; headers: Record<string, string>; attachments: { filename: string; path: string }[] }) {
  if (b.kind === 'sendgrid') {
    const { readFileSync } = await import('node:fs');
    const body = {
      personalizations: [{ to: [{ email: msg.to }] }], from: { email: msg.from.address, name: msg.from.name }, subject: msg.subject,
      content: [{ type: 'text/plain', value: msg.text }], headers: { ...msg.headers, 'Message-ID': msg.messageId },
      attachments: msg.attachments.map((a) => ({ filename: a.filename, content: readFileSync(a.path).toString('base64'), type: 'application/pdf', disposition: 'attachment' })),
    };
    const r = await fetchText('https://api.sendgrid.com/v3/mail/send', { method: 'POST', timeout: 30000, body: JSON.stringify(body), headers: { Authorization: `Bearer ${b.sendgridKey}`, 'Content-Type': 'application/json' } });
    if (r.status >= 300) throw new Error(`SendGrid: ${(() => { try { return JSON.parse(r.text).errors?.[0]?.message; } catch { return ''; } })() || `HTTP ${r.status}`}`);
    return;
  }
  await (await transport(b)).sendMail(msg);
}

export function sentToday(id: string) {
  return (db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND COALESCE(mailbox, 'main') = ? AND sent_at >= ?").get(id, new Date().toISOString().slice(0, 10)) as { n: number }).n;
}
/** Warm-up per mailbox: starts low and grows each day after that mailbox's first send. */
export function capOf(b: Box, s: Settings = load()) {
  const first = (db.raw().prepare("SELECT MIN(sent_at) t FROM messages WHERE status = 'sent' AND COALESCE(mailbox, 'main') = ?").get(b.id) as { t: string | null }).t;
  const days = first ? Math.floor((Date.now() - Date.parse(first)) / 864e5) : 0;
  return Math.max(1, Math.min(b.dailyLimit || s.email.dailyLimit, s.email.warmStart + days * s.email.warmStep));
}
/** The approved mailbox with the most room left today (round robin by load). */
export function pick(s: Settings = load()): Box | null {
  const ready = boxes(s).filter((b) => connected(b) && approved(b, s));
  if (!ready.length) return null;
  return ready.map((b) => ({ b, room: capOf(b, s) - sentToday(b.id) })).sort((x, y) => y.room - x.room)[0].b;
}

export function authorize_(id: string, on: boolean) {
  const s = load();
  if (id === 'main') return null;
  const list = s.mailboxes.map((b) => (b.id === id ? { ...b, authorizedAt: on ? db.now() : '', authorizedFrom: on ? (b.fromEmail || b.smtpUser).toLowerCase() : '' } : b));
  save({ mailboxes: list });
  return on;
}

/** Sign an extra mailbox in with Google or Microsoft, using the OAuth client from Settings → Email. */
export async function connectBox(id: string, p: 'google' | 'microsoft') {
  const s = load();
  if (!s.email.oauthClientId) throw new Error('Add your OAuth client ID in Settings → Email first.');
  const t = await authorize(p, PROVIDERS[p].scope, s.email.oauthClientId, s.email.oauthClientSecret);
  if (!t.refresh_token) throw new Error('The provider did not return a long-lived token. Try again.');
  let user = '';
  try { user = JSON.parse(Buffer.from((t.id_token ?? '').split('.')[1], 'base64').toString()).email ?? ''; } catch { /* none */ }
  const pr = PROVIDERS[p];
  save({ mailboxes: s.mailboxes.map((b) => (b.id === id ? { ...b, kind: p, oauthRefresh: t.refresh_token!, smtpUser: user, imapUser: user, fromEmail: b.fromEmail || user, smtpHost: pr.smtp.host, smtpPort: pr.smtp.port, smtpSecure: pr.smtp.secure, imapHost: pr.imap.host, imapPort: pr.imap.port } : b)) });
  return user;
}

export function stats() {
  return boxes().map((b) => ({ id: b.id, label: b.label, from: fromOf(b), kind: b.kind, connected: connected(b), approved: approved(b), sentToday: sentToday(b.id), cap: capOf(b),
    sent: (db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND COALESCE(mailbox, 'main') = ?").get(b.id) as { n: number }).n,
    replies: (db.raw().prepare("SELECT COUNT(DISTINCT r.lead_id) n FROM replies r JOIN messages m ON m.lead_id = r.lead_id AND m.status = 'sent' WHERE COALESCE(m.mailbox, 'main') = ?").get(b.id) as { n: number }).n }));
}
