// Buying signals radar: watches your leads and the market for moments when a business is most likely to
// need help, and tells you right away. Every signal comes from a real check, never a guess.
import { Notification } from 'electron';
import * as tls from 'node:tls';
import * as cheerio from 'cheerio';
import * as db from './db';
import * as jobs from './jobs';
import { load } from './settings';
import { fetchText, sleep, UA } from './util';

type Notify = (event: string, data?: unknown) => void;
let busy = false;
const DAY = 864e5;
const days = (iso: string) => Math.round((+new Date(iso) - Date.now()) / DAY);

/** The TLS certificate the site really serves: expiry date, or an error if it is invalid. */
function certificate(host: string): Promise<{ validTo: string; issuer: string } | { error: string }> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 12000 }, () => {
      const c = sock.getPeerCertificate();
      const ok = sock.authorized;
      sock.end();
      if (!c || !c.valid_to) return resolve({ error: 'no certificate' });
      resolve(ok ? { validTo: new Date(c.valid_to).toISOString(), issuer: String((c.issuer as Record<string, string>)?.O ?? '') } : { error: String(sock.authorizationError ?? 'invalid certificate') });
    });
    sock.on('error', (e) => resolve({ error: e.message }));
    sock.on('timeout', () => { sock.destroy(); resolve({ error: 'timeout' }); });
  });
}

const SLD = /\.(co|com|org|net|ac|gov|edu|ltd|plc|me)\.[a-z]{2}$/i;
const registrable = (host: string) => { const p = host.replace(/^www\./, '').split('.'); return p.slice(SLD.test(host) ? -3 : -2).join('.'); };

/** Domain expiry from public RDAP records. */
async function domainExpiry(host: string): Promise<string | null> {
  try {
    const r = await fetchText(`https://rdap.org/domain/${registrable(host)}`, { timeout: 15000, headers: { Accept: 'application/rdap+json' } });
    if (!r.ok) return null;
    const ev = (JSON.parse(r.text).events ?? []).find((e: any) => /expiration/i.test(e.eventAction));
    return ev?.eventDate ? new Date(ev.eventDate).toISOString() : null;
  } catch { return null; }
}

const ROLES = /\b(marketing|seo|social media|web ?(developer|designer)|wordpress|graphic designer|content (writer|creator)|digital marketing|brand(ing)? (manager|designer)|ui\/ux|front[- ]?end)\b/i;

export async function checkLead(lead: db.Lead) {
  const found: number[] = [];
  const add = (sg: Parameters<typeof db.addSignal>[0]) => { if (db.addSignal({ evidence: lead.website ? `Checked ${lead.website} on ${db.now().slice(0, 10)}` : '', ...sg })) found.push(1); };
  const month = new Date().toISOString().slice(0, 7);
  // Reputation, from the listing data already collected.
  if (lead.rating != null && (lead.reviews ?? 0) >= 5 && lead.rating < 4)
    add({ lead_id: lead.id, type: 'reputation', level: lead.rating < 3.5 ? 'hot' : 'warm', title: `${lead.name} is rated ${lead.rating}★`, detail: `${lead.reviews} Google reviews. A rating under 4 loses customers; review management and a better site can turn it around.`, key: `rep:${lead.id}:${lead.rating}` });
  if (lead.website) {
    const host = lead.domain || new URL(/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`).hostname;
    // Is the site up?
    let page = await fetchText(lead.website, { ua: UA, timeout: 20000 }).catch(() => null);
    if (!page?.ok) { await sleep(5000); page = await fetchText(lead.website, { ua: UA, timeout: 25000 }).catch(() => null); }
    if (!page || page.status >= 500 || page.status === 0)
      add({ lead_id: lead.id, type: 'site_down', level: 'hot', title: `${lead.name}'s website is down`, detail: `${host} did not load${page ? ` (HTTP ${page.status})` : ''} on two tries. Every visitor right now sees an error.`, key: `down:${lead.id}:${new Date().toISOString().slice(0, 10)}` });
    else if (page.ms > 5000)
      add({ lead_id: lead.id, type: 'slow_site', level: 'info', title: `${lead.name}'s site is slow`, detail: `The home page took ${(page.ms / 1000).toFixed(1)} s to respond.`, key: `slow:${lead.id}:${month}` });
    // Hiring for roles you could do for them.
    if (page?.ok) {
      const $ = cheerio.load(page.text);
      const careers = $('a[href]').filter((_, a) => /career|jobs|join[- ]?(our|the)[- ]?team|we.?re hiring|vacanc/i.test(`${$(a).text()} ${$(a).attr('href')}`)).first();
      const text = $('body').text();
      const role = text.match(ROLES)?.[0];
      if (careers.length || /we.?re hiring|now hiring|join our team/i.test(text))
        add({ lead_id: lead.id, type: 'hiring', level: role ? 'hot' : 'info', title: role ? `${lead.name} is hiring for ${role.toLowerCase()}` : `${lead.name} is hiring`, detail: role ? 'They need this skill now. Offer to do it as a service, faster and cheaper than a hire.' : 'A growing business, often ready to invest in marketing and its website.', key: `hire:${lead.id}:${role ?? 'any'}:${month}` });
    }
    // Certificate.
    const cert = await certificate(host);
    if ('error' in cert) {
      if (!/ENOTFOUND|ECONNREFUSED|timeout/.test(cert.error))
        add({ lead_id: lead.id, type: 'ssl', level: 'hot', title: `${lead.name}'s security certificate is broken`, detail: `Browsers warn visitors before opening ${host} (${cert.error}).`, key: `sslbad:${lead.id}:${month}` });
    } else {
      const left = days(cert.validTo);
      if (left <= 30) add({ lead_id: lead.id, type: 'ssl', level: left <= 14 ? 'hot' : 'warm', title: left < 0 ? `${lead.name}'s certificate has expired` : `${lead.name}'s certificate expires in ${left} days`, detail: `On ${new Date(cert.validTo).toDateString()} browsers will start showing "Not secure" on ${host}.`, key: `ssl:${lead.id}:${cert.validTo.slice(0, 10)}` });
    }
    // Domain renewal.
    const exp = await domainExpiry(host);
    if (exp) {
      const left = days(exp);
      if (left <= 60) add({ lead_id: lead.id, type: 'domain', level: left <= 30 ? 'hot' : 'warm', title: `${registrable(host)} expires in ${left} days`, detail: `If it is not renewed by ${new Date(exp).toDateString()}, the website and email stop working.`, key: `dom:${lead.id}:${exp.slice(0, 10)}` });
    }
  }
  db.updateLead(lead.id, { checked_at: db.now() });
  return found.length;
}

export function start(notify: Notify) {
  setInterval(() => { void run(notify); }, 20 * 60000);
  setTimeout(() => { void run(notify); }, 60000);
}

export async function run(notify: Notify, force = false) {
  const cfg = load().signals ?? { on: true, everyDays: 7, perRun: 30 };
  if (busy || (!cfg.on && !force)) return;
  busy = true;
  try {
    // 1. Watches: search again for new businesses on their schedule.
    for (const w of db.listWatches() as any[]) {
      if (!w.enabled || (w.last_run && Date.now() - +new Date(w.last_run) < w.every_days * DAY)) continue;
      jobs.queueSearch(w.category, w.place, JSON.parse(w.sources), null, w.id);
      db.saveWatch({ id: w.id, last_run: db.now() });
    }
    // Stale data (QF-030): send old leads back through the website check, a few each run; the snapshot diff raises "changed" signals.
    const fresh = load().freshDays ?? 90;
    if (fresh > 0) db.raw().prepare(`UPDATE leads SET enriched_at = NULL WHERE id IN (SELECT id FROM leads WHERE enriched_at IS NOT NULL AND enriched_at < ? AND status NOT IN ('lost','do_not_contact') ORDER BY enriched_at LIMIT ?)`).run(new Date(Date.now() - fresh * DAY).toISOString(), Math.max(5, Math.round(cfg.perRun / 3)));
    // 2. Health checks on leads you have not contacted to death yet, oldest check first.
    const due = db.raw().prepare(`SELECT * FROM leads WHERE status NOT IN ('won','lost','do_not_contact') AND source <> 'reddit'
      AND (checked_at IS NULL OR checked_at < ?) ORDER BY (checked_at IS NOT NULL), checked_at LIMIT ?`).all(new Date(Date.now() - cfg.everyDays * DAY).toISOString(), cfg.perRun) as db.Lead[];
    const before = (db.raw().prepare("SELECT COUNT(*) n FROM signals WHERE level = 'hot'").get() as { n: number }).n;
    for (const lead of due) { await checkLead(lead).catch(() => undefined); notify('signals'); }
    const hot = (db.raw().prepare("SELECT COUNT(*) n FROM signals WHERE level = 'hot'").get() as { n: number }).n - before;
    if (hot > 0 && Notification.isSupported()) new Notification({ title: `Quarrix: ${hot} hot signal${hot > 1 ? 's' : ''}`, body: 'Businesses that need help right now. Open Signals to reach out.' }).show();
  } finally {
    busy = false;
  }
}

/** One line for the email writer: the most timely reason to get in touch. */
export function signalFact(leadId: number) {
  const sg = db.leadSignals(leadId)[0];
  return sg ? `Timely reason to reach out (mention it naturally, do not sound like monitoring): ${sg.title}. ${sg.detail}` : '';
}
