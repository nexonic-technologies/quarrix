// Sending through the person's own mailbox (Gmail, Outlook or any SMTP server), with a gentle daily limit,
// working-hours windows and automatic follow-ups that stop on a reply.
import { outreachBlock } from './safety';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { randomBytes } from 'node:crypto';
import * as db from './db';
import { signature } from './ai';
import { hasReport, reportPath } from './proof';
import { load, save, type Settings } from './settings';
import { accessToken } from './oauth';
import { breaker, classifyReply, inWindowAt, zoneFor } from './rules';

export const PRESETS = {
  gmail: { smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, imapHost: 'imap.gmail.com', imapPort: 993 },
  outlook: { smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, imapHost: 'outlook.office365.com', imapPort: 993 },
};

async function transport(e: Settings['email']) {
  if (e.auth !== 'password') return nodemailer.createTransport({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpSecure, auth: { type: 'OAuth2', user: e.oauthUser || e.smtpUser, accessToken: await accessToken() }, connectionTimeout: 20000 });
  return nodemailer.createTransport({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpSecure, auth: { user: e.smtpUser, pass: e.smtpPass }, connectionTimeout: 20000 });
}
const connected = (e: Settings['email']) => (e.auth !== 'password' ? !!e.oauthRefresh : !!(e.smtpUser && e.smtpPass));
async function imapAuth(e: Settings['email']) {
  return e.auth !== 'password' ? { user: e.oauthUser || e.imapUser, accessToken: await accessToken() } : { user: e.imapUser, pass: e.imapPass };
}
/** The sender identity the user approved; sending stays off until it matches the current one (QF-066). */
export const senderId = (e: Settings['email']) => `${e.fromEmail || e.oauthUser || e.smtpUser}`.toLowerCase();
export const sendingAllowed = (e: Settings['email']) => !!e.authorizedAt && e.authorizedFrom === senderId(e) && !e.pausedReason;

export const reportName = (lead: string, company: string) => `${lead.replace(/[^\w &-]+/g, '').slice(0, 50)} - website review${company ? ` by ${company.replace(/[^\w &-]+/g, '')}` : ''}.pdf`;

/** Send the proof report to a lead, in the same thread as the first email when there is one. */
export async function sendReport(leadId: number) {
  const s = load();
  const lead = db.getLead(leadId);
  if (!lead?.email) throw new Error('This lead has no email address.');
  if (!hasReport(leadId)) throw new Error('Make the report first.');
  if (!sendingAllowed(s.email)) throw new Error(s.email.pausedReason ? `Sending is paused: ${s.email.pausedReason}` : 'Approve sending in Settings → Email first.');
  const block = outreachBlock(lead, db.isSuppressed(lead.email, lead.domain));
  if (block) throw new Error(`Not sent: ${block}.`);
  const first = db.raw().prepare("SELECT subject, message_id FROM messages WHERE lead_id = ? AND step = 0 AND status = 'sent'").get(leadId) as { subject: string; message_id: string } | undefined;
  const firstName = lead.contact_name && !lead.contact_name.startsWith('u/') ? lead.contact_name.split(' ')[0] : '';
  const body = `Hi ${firstName || `${lead.name} team`},\n\nAs promised, here is the one-page review of ${lead.domain || lead.name}. The first two fixes on it are the quickest wins.\n\nHappy to talk it through if useful.\n\nBest,`;
  const id = await sendRaw(lead.email, first ? `Re: ${first.subject}` : `Website review for ${lead.name}`, `${body}\n\n${footer(s)}`, first?.message_id ?? '', [{ filename: reportName(lead.name, s.profile.company), path: reportPath(leadId) }]);
  db.logEvent(leadId, 'sent', 'Proof report sent');
  return id;
}

export function footer(s: Settings) {
  const lines = [signature(s)];
  if (s.email.unsubscribeLine) lines.push('', `${s.profile.address ? s.profile.address + '\n' : ''}If you'd rather not hear from me, reply "unsubscribe" and I won't email again.`);
  return lines.join('\n');
}

export async function sendRaw(to: string, subject: string, text: string, inReplyTo = '', attachments: { filename: string; path: string }[] = []) {
  const s = load();
  const e = s.email;
  if (!connected(e)) throw new Error('Connect your mailbox first: Settings → Email.');
  const from = e.fromEmail || e.smtpUser;
  const host = from.split('@')[1] || 'localhost';
  const messageId = `<${randomBytes(9).toString('hex')}@${host}>`;
  await (await transport(e)).sendMail({
    from: { name: e.fromName || s.profile.name || from, address: from }, to, subject, text, messageId, attachments,
    headers: { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`, ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}) },
  });
  return messageId;
}

export async function testMailbox() {
  const s = load();
  await (await transport(s.email)).verify();
  return 'Connected. Quarrix can send from ' + (s.email.fromEmail || s.email.smtpUser);
}

/** Today's limit: starts low and grows each day after the first send, up to the daily limit. */
export function dailyCap(s = load()) {
  const first = (db.raw().prepare("SELECT MIN(sent_at) t FROM messages WHERE status = 'sent'").get() as { t: string | null }).t;
  const days = first ? Math.floor((Date.now() - Date.parse(first)) / 86400000) : 0;
  return Math.max(1, Math.min(s.email.dailyLimit, s.email.warmStart + days * s.email.warmStep));
}

/** Is it working hours for the recipient? Uses the business's longitude when known, else this computer's clock. */
export function inWindow(lead: db.Lead, s = load()) {
  return inWindowAt(new Date(), recipientZone(lead, s), s.email);
}
/** The recipient's IANA zone (QF-067), or the sender's zone when it cannot be known. */
export const recipientZone = (lead: db.Lead, s = load()) => zoneFor(lead.lat, lead.lon, lead.country) || s.email.senderTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Bounces and complaints among the last 50 sent emails. */
export function recentHealth() {
  const sent = db.raw().prepare("SELECT lead_id, sent_at FROM messages WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 50").all() as { lead_id: number; sent_at: string }[];
  if (!sent.length) return { sent: 0, bounced: 0, complaints: 0 };
  const since = sent[sent.length - 1].sent_at;
  const ids = [...new Set(sent.map((x) => x.lead_id))];
  const q = (type: string) => (db.raw().prepare(`SELECT COUNT(DISTINCT lead_id) n FROM events WHERE type = ? AND at >= ? AND lead_id IN (${ids.map(() => '?').join(',')})`).get(type, since, ...ids) as { n: number }).n;
  return { sent: sent.length, bounced: q('bounce'), complaints: q('complaint') };
}

/** A campaign's own daily limit applies across all its sends, not only when drafting. */
export function campaignFull(lead: db.Lead) {
  const c = db.raw().prepare('SELECT c.id, c.daily FROM campaigns c JOIN searches s ON s.campaign_id = c.id WHERE s.id = ?').get(lead.search_id ?? -1) as { id: number; daily: number } | undefined;
  if (!c || !c.daily) return false;
  const sent = (db.raw().prepare(`SELECT COUNT(*) n FROM messages m JOIN leads l ON l.id = m.lead_id JOIN searches s ON s.id = l.search_id
    WHERE s.campaign_id = ? AND m.status = 'sent' AND m.sent_at >= ?`).get(c.id, new Date().toISOString().slice(0, 10)) as { n: number }).n;
  return sent >= c.daily;
}

/** Same person or company contacted recently by any campaign (QF-074). */
export function contactedRecently(lead: db.Lead, days: number) {
  if (days <= 0) return false;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return !!db.raw().prepare(`SELECT 1 FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'sent' AND m.sent_at >= ? AND m.lead_id <> ?
    AND (l.email = ? OR (l.domain <> '' AND l.domain = ?)) LIMIT 1`).get(since, lead.id, lead.email, lead.domain);
}

let lastSend = 0;
let busy = false;

/** Called every minute: sends at most one due email. */
export async function tick(notify: (m: string) => void) {
  if (busy) return;
  busy = true;
  try {
    const s = load();
    if (!connected(s.email) || !sendingAllowed(s.email)) return;
    const trip = breaker(recentHealth(), { minSent: 20, bouncePct: s.email.bouncePct || 5, complaintPct: 0.5 });
    if (trip) { save({ email: { pausedReason: trip } }); notify(`Sending paused: ${trip}`); return; }
    const sentToday = (db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?").get(new Date().toISOString().slice(0, 10)) as { n: number }).n;
    if (sentToday >= dailyCap(s)) return;
    if (Date.now() - lastSend < s.email.gapMinutes * 60000 * (0.8 + Math.random() * 0.6)) return;
    for (const m of db.dueMessages()) {
      const lead = db.getLead(m.lead_id);
      const block = lead ? outreachBlock(lead, !!lead.email && db.isSuppressed(lead.email, lead.domain)) : 'lead deleted';
      if (!lead || block) {
        db.updateMessage(m.id, { status: 'cancelled', error: `Stopped: ${block}` });
        if (lead) db.cancelPending(lead.id, `Stopped: ${block}`);
        continue;
      }
      if (campaignFull(lead)) continue;
      if (m.step === 0 && contactedRecently(lead, s.email.recontactDays)) {
        db.cancelPending(lead.id, `Someone at ${lead.domain || lead.email} was emailed in the last ${s.email.recontactDays} days`);
        continue;
      }
      if (!inWindow(lead, s)) continue;
      const first = m.step > 0 ? (db.raw().prepare("SELECT subject, message_id FROM messages WHERE lead_id = ? AND step = 0 AND status = 'sent'").get(lead.id) as { subject: string; message_id: string } | undefined) : undefined;
      try {
        const subject = m.step > 0 && first ? `Re: ${first.subject}` : m.subject;
        const attach = m.step === 0 && s.email.attachReport && hasReport(lead.id) ? [{ filename: reportName(lead.name, s.profile.company), path: reportPath(lead.id) }] : [];
        const id = await sendRaw(lead.email, subject, `${m.body}\n\n${footer(s)}`, first?.message_id ?? '', attach);
        db.updateMessage(m.id, { status: 'sent', sent_at: db.now(), message_id: id, subject });
        if (lead.status === 'new') db.updateLead(lead.id, { status: 'contacted' });
        db.logEvent(lead.id, 'sent', `${m.step === 0 ? 'Email' : `Follow-up ${m.step}`}: ${subject}`);
        const next = db.raw().prepare("SELECT id FROM messages WHERE lead_id = ? AND step = ? AND status = 'scheduled'").get(lead.id, m.step + 1) as { id: number } | undefined;
        if (next) db.updateMessage(next.id, { due_at: new Date(Date.now() + (s.email.followups[m.step] ?? 4) * 86400000).toISOString() });
        notify(`Sent to ${lead.name}`);
      } catch (e: any) {
        db.updateMessage(m.id, { status: 'failed', error: String(e.message ?? e).slice(0, 300) });
        db.logEvent(lead.id, 'error', `Send failed: ${e.message ?? e}`);
        notify(`Could not send to ${lead.name}: ${e.message ?? e}`);
      }
      lastSend = Date.now();
      break;
    }
  } finally {
    busy = false;
  }
}

/** Read new messages in the inbox (without marking them read) to catch replies, opt-outs and bounces. */
export async function checkInbox(): Promise<{ replies: number; bounces: number }> {
  const s = load();
  const e = s.email;
  if (!e.imapOn || (e.auth === 'password' && (!e.imapUser || !e.imapPass)) || (e.auth !== 'password' && !e.oauthRefresh)) return { replies: 0, bounces: 0 };
  const client = new ImapFlow({ host: e.imapHost, port: e.imapPort, secure: true, auth: await imapAuth(e), logger: false });
  await client.connect();
  let replies = 0, bounces = 0;
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - 14 * 86400000);
    const lastUid = (s as any)._imapLastUid ?? 0;
    let maxUid = lastUid;
    for await (const msg of client.fetch({ since }, { uid: true, envelope: true, source: { maxLength: 8000 } as any, headers: ['auto-submitted'] })) {
      if (msg.uid <= lastUid) continue;
      maxUid = Math.max(maxUid, msg.uid);
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
      const subject = msg.envelope?.subject ?? '';
      const text = msg.source?.toString('utf8') ?? '';
      if (/^(mailer-daemon|postmaster)@/.test(from) || /undeliverable|delivery status notification|mail delivery failed/i.test(subject)) {
        for (const addr of new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((x) => x.toLowerCase()))) {
          const lead = db.raw().prepare('SELECT * FROM leads WHERE email = ? LIMIT 1').get(addr) as db.Lead | undefined;
          if (lead) { db.suppress(addr, 'bounced'); db.cancelPending(lead.id, 'Bounced'); db.logEvent(lead.id, 'bounce', subject); bounces++; break; }
        }
        continue;
      }
      const lead = db.raw().prepare('SELECT * FROM leads WHERE email = ? LIMIT 1').get(from) as db.Lead | undefined;
      if (!lead) continue;
      const body = text.split(/\r?\n\r?\n/).slice(1).join('\n').slice(0, 4000);
      const auto = /auto-submitted:\s*auto/i.test(msg.headers?.toString() ?? '');
      const c = auto ? { intent: 'out_of_office' as const, reason: 'Auto-Submitted header', review: false } : classifyReply(subject, body.slice(0, 1500));
      db.addReply({ lead_id: lead.id, from_addr: from, subject, body, intent: c.intent, reason: c.reason, review: c.review });
      if (c.intent === 'out_of_office') { db.logEvent(lead.id, 'auto_reply', subject); continue; }
      const optOut = c.intent === 'opt_out';
      if (optOut && /\b(spam|report(ed|ing)? (you|this))\b/i.test(body)) db.logEvent(lead.id, 'complaint', subject);
      db.cancelPending(lead.id, optOut ? 'Asked to stop' : 'Replied');
      db.updateLead(lead.id, { status: optOut ? 'do_not_contact' : c.intent === 'interested' || c.intent === 'meeting' ? 'interested' : 'replied' });
      if (optOut) db.suppress(lead.email, 'asked to stop');
      db.logEvent(lead.id, 'reply', subject);
      replies++;
    }
    save({ _imapLastUid: maxUid } as any);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  return { replies, bounces };
}
