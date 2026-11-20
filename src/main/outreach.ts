// Drafting and approving email sequences, shared by the Leads screen and the autopilot.
import * as db from './db';
import { draftFor } from './ai';
import { load } from './settings';

export async function createDrafts(ids: number[], onDraft: () => void = () => undefined) {
  const s = load();
  let made = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const lead = db.getLead(id);
    if (!lead) continue;
    if (lead.email && db.isSuppressed(lead.email, lead.domain)) { errors.push(`${lead.name}: on the do-not-contact list`); continue; }
    try {
      const d = await draftFor(s, lead, s.email.followups.length);
      db.raw().prepare("DELETE FROM messages WHERE lead_id = ? AND status = 'draft'").run(id);
      db.addMessage({ lead_id: id, step: 0, subject: d.subject, body: d.body });
      d.followups.forEach((b, i) => db.addMessage({ lead_id: id, step: i + 1, subject: d.subject, body: b }));
      if (d.whatsapp) db.addMessage({ lead_id: id, channel: 'whatsapp', step: 0, body: d.whatsapp });
      made++;
      onDraft();
    } catch (e: any) { errors.push(`${lead.name}: ${e.message ?? e}`); }
  }
  return { made, errors };
}

export function approve(leadId: number, by = 'you') {
  const lead = db.getLead(leadId);
  if (!lead?.email) throw new Error('This lead has no email address.');
  db.raw().prepare("UPDATE messages SET status = 'scheduled', due_at = CASE WHEN step = 0 THEN ? ELSE NULL END WHERE lead_id = ? AND status = 'draft' AND channel = 'email'").run(db.now(), leadId);
  db.logEvent(leadId, 'approved', by === 'you' ? 'Email sequence approved' : `Email sequence approved by ${by}`);
  return true;
}

export function approveAll() {
  const ids = (db.raw().prepare("SELECT DISTINCT m.lead_id id FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.status = 'draft' AND m.channel = 'email' AND l.email <> ''").all() as { id: number }[]).map((r) => r.id);
  for (const id of ids) approve(id);
  return ids.length;
}
