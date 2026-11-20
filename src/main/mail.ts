// Sending through the person's own mailbox (Gmail, Outlook or any SMTP server), with a gentle daily limit,
// working-hours windows and automatic follow-ups that stop on a reply.
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { randomBytes } from 'node:crypto';
import * as db from './db';
import { signature } from './ai';
import { load, save, type Settings } from './settings';

export const PRESETS = {
  gmail: { smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, imapHost: 'imap.gmail.com', imapPort: 993 },
  outlook: { smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, imapHost: 'outlook.office365.com', imapPort: 993 },
};

function transport(e: Settings['email']) {
  return nodemailer.createTransport({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpSecure, auth: { user: e.smtpUser, pass: e.smtpPass }, connectionTimeout: 20000 });
}

export function footer(s: Settings) {
  const lines = [signature(s)];
  if (s.email.unsubscribeLine) lines.push('', `${s.profile.address ? s.profile.address + '\n' : ''}If you'd rather not hear from me, reply "unsubscribe" and I won't email again.`);
  return lines.join('\n');
}

export async function sendRaw(to: string, subject: string, text: string, inReplyTo = '') {
  const s = load();
  const e = s.email;
  if (!e.smtpUser || !e.smtpPass) throw new Error('Connect your mailbox first: Settings → Email.');
  const from = e.fromEmail || e.smtpUser;
  const host = from.split('@')[1] || 'localhost';
  const messageId = `<${randomBytes(9).toString('hex')}@${host}>`;
  await transport(e).sendMail({
    from: { name: e.fromName || s.profile.name || from, address: from }, to, subject, text, messageId,
    headers: { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`, ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}) },
  });
  return messageId;
}

export async function testMailbox() {
  const s = load();
  await transport(s.email).verify();
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
  const d = new Date();
  const offsetH = lead.lon != null ? Math.round(lead.lon / 15) : -d.getTimezoneOffset() / 60;
  const local = new Date(d.getTime() + offsetH * 3600000);
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  const dow = local.getUTCDay();
  if (s.email.weekdaysOnly && (dow === 0 || dow === 6)) return false;
  return h >= s.email.windowStart && h < s.email.windowEnd;
}

let lastSend = 0;
let busy = false;

/** Called every minute: sends at most one due email. */
export async function tick(notify: (m: string) => void) {
  if (busy) return;
  busy = true;
  try {
    const s = load();
    if (!s.email.smtpUser) return;
    const sentToday = (db.raw().prepare("SELECT COUNT(*) n FROM messages WHERE status = 'sent' AND sent_at >= ?").get(new Date().toISOString().slice(0, 10)) as { n: number }).n;
    if (sentToday >= dailyCap(s)) return;
    if (Date.now() - lastSend < s.email.gapMinutes * 60000 * (0.8 + Math.random() * 0.6)) return;
    for (const m of db.dueMessages()) {
      const lead = db.getLead(m.lead_id);
      if (!lead || !lead.email || ['replied', 'interested', 'won', 'lost', 'do_not_contact'].includes(lead.status) || db.isSuppressed(lead.email, lead.domain)) {
        db.updateMessage(m.id, { status: 'cancelled', error: 'Stopped: the lead replied, opted out or has no email' });
        continue;
      }
      if (!inWindow(lead, s)) continue;
      const first = m.step > 0 ? (db.raw().prepare("SELECT subject, message_id FROM messages WHERE lead_id = ? AND step = 0 AND status = 'sent'").get(lead.id) as { subject: string; message_id: string } | undefined) : undefined;
      try {
        const subject = m.step > 0 && first ? `Re: ${first.subject}` : m.subject;
        const id = await sendRaw(lead.email, subject, `${m.body}\n\n${footer(s)}`, first?.message_id ?? '');
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
  if (!e.imapOn || !e.imapUser || !e.imapPass) return { replies: 0, bounces: 0 };
  const client = new ImapFlow({ host: e.imapHost, port: e.imapPort, secure: true, auth: { user: e.imapUser, pass: e.imapPass }, logger: false });
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
      const auto = /auto-submitted:\s*auto/i.test(msg.headers?.toString() ?? '') || /automatic reply|out of (the )?office/i.test(subject);
      if (auto) { db.logEvent(lead.id, 'auto_reply', subject); continue; }
      const optOut = /\b(unsubscribe|remove me|stop (emailing|contacting)|do not (email|contact))\b/i.test(text.split(/\r?\n\r?\n/).slice(1).join('\n').slice(0, 1500));
      db.cancelPending(lead.id, optOut ? 'Asked to stop' : 'Replied');
      db.updateLead(lead.id, { status: optOut ? 'do_not_contact' : 'replied' });
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
