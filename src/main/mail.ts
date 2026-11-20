// Sending through the person's own mailbox (Gmail, Outlook or any SMTP server), with a gentle daily limit,
// working-hours windows and automatic follow-ups that stop on a reply.
import { outreachBlock } from './safety';
import { ImapFlow } from 'imapflow';
import { randomBytes } from 'node:crypto';
import * as db from './db';
import { signature } from './ai';
import { hasReport, reportPath } from './proof';
import { load, save, type Settings } from './settings';
import * as mb from './mailboxes';
import { fetchText } from './util';
import { breaker, classifyReply, inWindowAt, zoneFor } from './rules';

export const PRESETS = {
  gmail: { smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, imapHost: 'imap.gmail.com', imapPort: 993 },
  outlook: { smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false, imapHost: 'outlook.office365.com', imapPort: 993 },
};

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
  const used = (db.raw().prepare("SELECT mailbox FROM messages WHERE lead_id = ? AND status = 'sent' ORDER BY id LIMIT 1").get(leadId) as { mailbox: string } | undefined)?.mailbox;
  const box = used ? mb.boxById(used, s) : mb.pick(s);
  if (!mb.ready(box, s)) throw new Error(s.email.pausedReason ? `Sending is paused: ${s.email.pausedReason}` : used ? 'The mailbox that emailed this lead is no longer connected or approved.' : 'Approve sending in Settings → Email first.');
  if (mb.sentToday(box.id) >= mb.capOf(box, s)) throw new Error(`${box.label} has reached today's limit. The report can go tomorrow.`);
  const block = outreachBlock(lead, db.isSuppressed(lead.email, lead.domain));
  if (block) throw new Error(`Not sent: ${block}.`);
  const first = db.raw().prepare("SELECT subject, message_id FROM messages WHERE lead_id = ? AND step = 0 AND status = 'sent'").get(leadId) as { subject: string; message_id: string } | undefined;
  const firstName = lead.contact_name && !lead.contact_name.startsWith('u/') ? lead.contact_name.split(' ')[0] : '';
  const body = `Hi ${firstName || `${lead.name} team`},\n\nAs promised, here is the one-page review of ${lead.domain || lead.name}. The first two fixes on it are the quickest wins.\n\nHappy to talk it through if useful.\n\nBest,`;
  const id = await sendRaw(lead.email, first ? `Re: ${first.subject}` : `Website review for ${lead.name}`, `${body}\n\n${footer(s)}`, first?.message_id ?? '', [{ filename: reportName(lead.name, s.profile.company), path: reportPath(leadId) }], box.id);
  // Counted like every other email, so daily limits include it.
  db.addMessage({ lead_id: leadId, step: 99, subject: first ? `Re: ${first.subject}` : `Website review for ${lead.name}`, body: '(proof report)', status: 'sent', mailbox: box.id } as any);
  db.raw().prepare("UPDATE messages SET sent_at = ?, message_id = ? WHERE id = (SELECT MAX(id) FROM messages WHERE lead_id = ? AND step = 99)").run(db.now(), id, leadId);
  db.logEvent(leadId, 'sent', 'Proof report sent');
  return id;
}

export function footer(s: Settings) {
  const lines = [signature(s)];
  if (s.email.unsubscribeLine) lines.push('', `${s.profile.address ? s.profile.address + '\n' : ''}If you'd rather not hear from me, reply "unsubscribe" and I won't email again.`);
  return lines.join('\n');
}

export async function sendRaw(to: string, subject: string, text: string, inReplyTo = '', attachments: { filename: string; path: string }[] = [], boxId = 'main') {
  const s = load();
  const box = mb.boxById(boxId, s);
  if (!box) throw new Error('That mailbox was removed or switched off.');
  if (!mb.connected(box)) throw new Error(box.main ? 'Connect your mailbox first: Settings → Email.' : `Mailbox "${box.label}" is not connected.`);
  const from = mb.fromOf(box);
  const host = from.split('@')[1] || 'localhost';
  const messageId = `<${randomBytes(9).toString('hex')}@${host}>`;
  await mb.deliver(box, {
    from: { name: box.fromName || s.email.fromName || s.profile.name || from, address: from }, to, subject, text, messageId, attachments,
    headers: { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`, ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}) },
  });
  return messageId;
}

export async function testMailbox(boxId = 'main') {
  const b = mb.boxById(boxId);
  if (!b) throw new Error('That mailbox was removed or switched off.');
  if (b.kind === 'sendgrid') { const r = await fetchText('https://api.sendgrid.com/v3/scopes', { headers: { Authorization: `Bearer ${b.sendgridKey}` } }); if (!r.ok) throw new Error(`SendGrid refused the key (HTTP ${r.status}).`); return `SendGrid key works. Quarrix can send from ${mb.fromOf(b)} once the sender is verified in SendGrid.`; }
  await (await mb.transport(b)).verify();
  return 'Connected. Quarrix can send from ' + mb.fromOf(b);
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

const lastSend = new Map<string, number>();
let busy = false;

/** Called every minute: sends at most one due email. */
export async function tick(notify: (m: string) => void) {
  if (busy) return;
  busy = true;
  try {
    const s = load();
    if (!mb.boxes(s).some((b) => mb.connected(b) && mb.approved(b, s))) return;
    const trip = breaker(recentHealth(), { minSent: 20, bouncePct: s.email.bouncePct || 5, complaintPct: 0.5 });
    if (trip) { save({ email: { pausedReason: trip } }); notify(`Sending paused: ${trip}`); return; }
    // Each mailbox has its own gap, daily limit and approval.
    const gapOk = (id: string) => Date.now() - (lastSend.get(id) ?? 0) >= s.email.gapMinutes * 60000 * (0.8 + Math.random() * 0.6);
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
      const box = mb.boxById(m.mailbox, s);
      // Never switch accounts mid-sequence: if its mailbox is gone, the sequence stops with a clear reason.
      if (!box) { db.cancelPending(lead.id, `Stopped: mailbox "${m.mailbox}" was removed or switched off`); continue; }
      if (!mb.ready(box, s) || mb.sentToday(box.id) >= mb.capOf(box, s) || !gapOk(box.id)) continue;
      const first = m.step > 0 ? (db.raw().prepare("SELECT subject, message_id FROM messages WHERE lead_id = ? AND step = 0 AND status = 'sent'").get(lead.id) as { subject: string; message_id: string } | undefined) : undefined;
      try {
        const subject = m.step > 0 && first ? `Re: ${first.subject}` : m.subject;
        const attach = m.step === 0 && s.email.attachReport && hasReport(lead.id) ? [{ filename: reportName(lead.name, s.profile.company), path: reportPath(lead.id) }] : [];
        const id = await sendRaw(lead.email, subject, `${m.body}\n\n${footer(s)}`, first?.message_id ?? '', attach, box.id);
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
      lastSend.set(box.id, Date.now());
      break;
    }
  } finally {
    busy = false;
  }
}

/** Read new messages in the inbox (without marking them read) to catch replies, opt-outs and bounces. */
/** Unified inbox (QF-062): every mailbox with inbox reading on is checked, and replies are tagged with their mailbox. */
export async function checkInbox(): Promise<{ replies: number; bounces: number }> {
  let replies = 0, bounces = 0;
  for (const b of mb.boxes()) {
    if (!b.imapOn || b.kind === 'sendgrid' || !mb.connected(b)) continue;
    try { const r = await checkBox(b); replies += r.replies; bounces += r.bounces; } catch (e: any) { db.logEvent(null, 'error', `Inbox ${b.label}: ${e.message ?? e}`); }
  }
  return { replies, bounces };
}

async function checkBox(box: mb.Box): Promise<{ replies: number; bounces: number }> {
  const client = new ImapFlow({ host: box.imapHost, port: box.imapPort, secure: true, auth: await mb.imapAuth(box), logger: false });
  await client.connect();
  let replies = 0, bounces = 0;
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - 14 * 86400000);
    const state = db.raw().prepare('SELECT last_uid FROM imap_state WHERE box = ?').get(box.id) as { last_uid: number } | undefined;
    const lastUid = state?.last_uid ?? (box.main ? ((load() as any)._imapLastUid ?? 0) : 0);
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
      db.addReply({ lead_id: lead.id, from_addr: from, subject, body, intent: c.intent, reason: c.reason, review: c.review, mailbox: box.id });
      if (c.intent === 'out_of_office') { db.logEvent(lead.id, 'auto_reply', subject); continue; }
      const optOut = c.intent === 'opt_out';
      if (optOut && /\b(spam|report(ed|ing)? (you|this))\b/i.test(body)) db.logEvent(lead.id, 'complaint', subject);
      db.cancelPending(lead.id, optOut ? 'Asked to stop' : 'Replied');
      db.updateLead(lead.id, { status: optOut ? 'do_not_contact' : c.intent === 'interested' || c.intent === 'meeting' ? 'interested' : 'replied' });
      if (optOut) db.suppress(lead.email, 'asked to stop');
      db.logEvent(lead.id, 'reply', subject);
      replies++;
    }
    db.raw().prepare('INSERT INTO imap_state (box, last_uid) VALUES (?, ?) ON CONFLICT(box) DO UPDATE SET last_uid = excluded.last_uid').run(box.id, maxUid);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  return { replies, bounces };
}
