// Autopilot: each campaign runs once a day. It searches the next place on its list, waits for the
// website checks, writes emails for the best new leads and, when allowed, schedules them to send.
// Sending still goes through the mailbox limits in mail.ts (warm-up cap, gaps, working hours).
import * as db from './db';
import * as jobs from './jobs';
import { approve, createDrafts } from './outreach';
import { load } from './settings';
import { makeReport } from './proof';

type Notify = (event: string, data?: unknown) => void;
let busy = false;

export function start(notify: Notify) {
  setInterval(() => { void run(notify); }, 5 * 60000);
  setTimeout(() => { void run(notify); }, 20000);
}

const today = () => new Date().toISOString().slice(0, 10);

export async function run(notify: Notify, force?: number) {
  if (busy) return;
  busy = true;
  try {
    for (const c of db.raw().prepare('SELECT * FROM campaigns WHERE enabled = 1 OR id = ?').all(force ?? 0) as db.Campaign[]) {
      const places = JSON.parse(c.places || '[]') as string[];
      if (!places.length || !c.category) continue;
      // 1. One new search a day (or now, when started by hand).
      if (force === c.id || (c.last_run ?? '').slice(0, 10) !== today()) {
        const place = places[c.cursor % places.length];
        jobs.queueSearch(c.category, place, JSON.parse(c.sources || '["gmaps","osm"]'), c.id);
        db.saveCampaign({ id: c.id, cursor: c.cursor + 1, last_run: db.now() });
        notify('toast', `Autopilot "${c.name}": searching ${c.category} in ${place}`);
      }
      // 2. Draft today's batch from checked leads with a working email address.
      const doneToday = (db.raw().prepare("SELECT COUNT(*) n FROM events WHERE type = 'autopilot' AND detail = ? AND at >= ?").get(`campaign ${c.id}`, today()) as { n: number }).n;
      const room = Math.max(0, c.daily - doneToday);
      if (!room) continue;
      const ids = (db.raw().prepare(`SELECT l.id FROM leads l JOIN searches s ON s.id = l.search_id
        WHERE s.campaign_id = ? AND l.status = 'new' AND l.email <> '' AND l.enriched_at IS NOT NULL AND l.email_status <> 'no-mx'
        AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = l.id)
        AND (l.fit IS NULL OR l.fit >= ?)
        ORDER BY l.fit DESC, (l.contact_name <> '') DESC, l.score DESC, l.id LIMIT ?`).all(c.id, load().ai.provider !== 'none' ? 55 : 0, room) as { id: number }[]).map((r) => r.id);
      if (!ids.length) continue;
      if (c.proof) for (const id of ids) await makeReport(id).catch(() => undefined);
      await createDrafts(ids, () => notify('drafts'));
      for (const id of ids) {
        const has = db.raw().prepare("SELECT 1 FROM messages WHERE lead_id = ? AND status = 'draft' AND channel = 'email'").get(id);
        if (!has) continue;
        db.logEvent(id, 'autopilot', `campaign ${c.id}`);
        if (c.auto_send) approve(id, `autopilot "${c.name}"`);
      }
      notify('drafts');
    }
  } finally {
    busy = false;
  }
}
