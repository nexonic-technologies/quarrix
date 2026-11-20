// Drafting and approving email sequences, shared by the Leads screen and the autopilot.
import * as db from './db';
import { complete, draftFor } from './ai';
import { altSubject } from './rules';
import { pick } from './mailboxes';
import { load } from './settings';

export async function createDrafts(ids: number[], onDraft: () => void = () => undefined) {
  const s = load();
  let made = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const lead = db.getLead(id);
    if (!lead) continue;
    const block = db.blockOf({ ...lead, email: lead.email || 'none', status: '' });
    if (block) { errors.push(`${lead.name}: ${block}`); continue; }
    try {
      const d = await draftFor(s, lead, s.email.followups.length);
      db.raw().prepare("DELETE FROM messages WHERE lead_id = ? AND status = 'draft'").run(id);
      // A/B test (QF-071): every second lead gets version B of the subject line.
      const variant = s.email.abTest ? (id % 2 ? 'B' : 'A') : '';
      let subject = d.subject;
      if (variant === 'B') subject = s.email.abSubjectB?.trim() ? s.email.abSubjectB.replace(/\{name\}/g, lead.name).replace(/\{domain\}/g, lead.domain || lead.name) : s.ai.provider !== 'none' ? (await complete(s.ai, 'Write one alternative cold-email subject line: under 7 words, plain, no clickbait, no emoji. Reply with the subject only.', `Business: ${lead.name}. Current subject: ${d.subject}`, 40).catch(() => '')).trim().replace(/^["']|["']$/g, '').slice(0, 90) || altSubject(d.subject, lead) : altSubject(d.subject, lead);
      const m0 = db.addMessage({ lead_id: id, step: 0, subject, body: d.body });
      d.followups.forEach((b, i) => db.addMessage({ lead_id: id, step: i + 1, subject, body: b }));
      if (variant) db.raw().prepare("UPDATE messages SET variant = ? WHERE lead_id = ? AND status = 'draft'").run(variant, id);
      void m0;
      if (d.whatsapp) db.addMessage({ lead_id: id, channel: 'whatsapp', step: 0, body: d.whatsapp });
      made++;
      onDraft();
    } catch (e: any) { errors.push(`${lead.name}: ${e.message ?? e}`); }
  }
  return { made, errors };
}

export function approve(leadId: number, by = 'you') {
  const lead = db.getLead(leadId);
  if (!lead) throw new Error('Lead not found.');
  const block = db.blockOf(lead);
  if (block) throw new Error(`Not approved: ${block}.`);
  // The whole sequence goes out from one mailbox: the approved one with the most room today (QF-061).
  // No approved mailbox means no approval: emails never wait for an account that was never approved.
  const box = pick();
  if (!box) throw new Error('Connect a mailbox and approve sending in Settings → Email first.');
  db.raw().prepare("UPDATE messages SET status = 'scheduled', mailbox = ?, due_at = CASE WHEN step = 0 THEN ? ELSE NULL END WHERE lead_id = ? AND status = 'draft' AND channel = 'email'").run(box.id, db.now(), leadId);
  db.logEvent(leadId, 'approved', by === 'you' ? 'Email sequence approved' : `Email sequence approved by ${by}`);
  return true;
}

export function approveAll() {
  const ids = (db.raw().prepare("SELECT DISTINCT m.lead_id id FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'draft' AND m.channel = 'email' AND l.email <> ''").all() as { id: number }[]).map((r) => r.id);
  let n = 0;
  for (const id of ids) { try { approve(id); n++; } catch { /* blocked lead stays a draft */ } }
  return n;
}
