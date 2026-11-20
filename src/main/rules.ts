// Outreach rules (phase 4): time zones, reply intent, circuit breaker, DNS record checks and the dry run.
// Pure functions, no Electron or database imports, so they are testable.
import tzLookup from '@photostructure/tz-lookup';

/** Countries with one time zone, for leads without coordinates. Others fall back to the sender's zone. */
const ONE_ZONE: Record<string, string> = {
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin', ES: 'Europe/Madrid', IT: 'Europe/Rome', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels',
  CH: 'Europe/Zurich', AT: 'Europe/Vienna', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', PL: 'Europe/Warsaw', PT: 'Europe/Lisbon',
  GR: 'Europe/Athens', IN: 'Asia/Kolkata', PK: 'Asia/Karachi', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', PH: 'Asia/Manila',
  JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', NZ: 'Pacific/Auckland', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', KE: 'Africa/Nairobi',
  EG: 'Africa/Cairo', IL: 'Asia/Jerusalem', TR: 'Europe/Istanbul', BD: 'Asia/Dhaka', LK: 'Asia/Colombo', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', QA: 'Asia/Qatar',
};

/** The recipient's IANA time zone: from coordinates, else a single-zone country, else '' (use the sender's zone). */
export function zoneFor(lat: number | null | undefined, lon: number | null | undefined, country = ''): string {
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) { try { return tzLookup(lat, lon); } catch { /* ocean */ } }
  return ONE_ZONE[country.toUpperCase()] ?? '';
}

/** Local hour (with minutes) and weekday (0 = Sunday) at an instant in a zone, daylight saving included. */
export function localClock(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone || undefined, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { hour: Number(get('hour')) + Number(get('minute')) / 60, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
}

export function inWindowAt(at: Date, zone: string, w: { windowStart: number; windowEnd: number; weekdaysOnly: boolean }) {
  const c = localClock(at, zone);
  if (w.weekdaysOnly && (c.weekday === 0 || c.weekday === 6)) return false;
  return c.hour >= w.windowStart && c.hour < w.windowEnd;
}

/** Next instant (to the quarter hour) when the window opens, within 8 days. */
export function nextWindow(from: Date, zone: string, w: { windowStart: number; windowEnd: number; weekdaysOnly: boolean }) {
  const t = new Date(Math.ceil(from.getTime() / 900000) * 900000);
  for (let i = 0; i < 8 * 96; i++, t.setTime(t.getTime() + 900000)) if (inWindowAt(t, zone, w)) return new Date(t);
  return null;
}

export type Intent = 'interested' | 'meeting' | 'question' | 'not_now' | 'objection' | 'opt_out' | 'out_of_office' | 'wrong_person' | 'unclear';
export const INTENT_LABEL: Record<Intent, string> = { interested: 'Interested', meeting: 'Wants a call', question: 'Has a question', not_now: 'Not now', objection: 'Not interested', opt_out: 'Opted out', out_of_office: 'Out of office', wrong_person: 'Wrong person', unclear: 'Needs review' };

/** Rule-based reply intent with the matching phrase as the reason (QF-063). Ambiguous replies are "unclear" so a person reviews them. */
export function classifyReply(subject: string, body: string): { intent: Intent; reason: string; review: boolean } {
  const text = `${subject}\n${body}`.toLowerCase().replace(/\s+/g, ' ').slice(0, 2000);
  const rules: [Intent, RegExp][] = [
    ['opt_out', /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact) (me|us)|opt[ -]?out)\b/],
    ['out_of_office', /\b(out of (the )?office|on (annual )?leave|on vacation|away until|automatic reply|auto-?reply)\b/],
    ['wrong_person', /\b(wrong person|no longer (work|with)|not the right (person|contact)|left the company)\b/],
    ['meeting', /\b(book a (call|time|meeting)|schedule a (call|meeting)|calendly|free (on|at|this)|(call|meet|chat) (on|at|next|this|tomorrow)|what time|when are you (free|available)|send (me )?(an? )?invite)\b/],
    ['not_now', /\b(not (right )?now|maybe later|next (month|quarter|year)|circle back|reach out (again )?(in|later)|busy (at the moment|right now)|not at this time)\b/],
    ['objection', /\b(not interested|no thanks|no thank you|we('re| are) (all )?(set|good|happy)|already have (a|an|someone)|don'?t need|please don'?t)\b/],
    ['interested', /\b((?<!not |no longer |n't )interested|sounds (good|great)|tell me more|send (me )?(more|details|info|a quote|pricing)|how much|what (would|does) it cost|let'?s (talk|do it)|yes,? please|go ahead)\b/],
    ['question', /\?|\b(how|what|why|who|which|can you|could you|do you)\b/],
  ];
  const hits = rules.filter(([, re]) => re.test(text));
  if (!hits.length) return { intent: 'unclear', reason: 'No clear wording', review: true };
  const [intent, re] = hits[0];
  const reason = (text.match(re)?.[0] ?? '').trim();
  // Two strong but opposite signals (for example "not interested" and "send pricing") need a person.
  const strong = hits.filter(([i]) => i !== 'question').map(([i]) => i);
  const conflict = strong.includes('objection') && (strong.includes('interested') || strong.includes('meeting'));
  return { intent: conflict ? 'unclear' : intent, reason: conflict ? 'Mixed signals' : `“${reason}”`, review: conflict || intent === 'unclear' || intent === 'question' };
}

/** Pause sending when bounces or complaints pass the limits over recent sends (QF-068). */
export function breaker(stats: { sent: number; bounced: number; complaints: number }, limits = { minSent: 20, bouncePct: 5, complaintPct: 0.5 }) {
  if (stats.sent < limits.minSent) return '';
  const b = (stats.bounced / stats.sent) * 100, c = (stats.complaints / stats.sent) * 100;
  if (b > limits.bouncePct) return `Bounce rate ${b.toFixed(1)}% over the last ${stats.sent} emails is above ${limits.bouncePct}%. Check your list before sending more.`;
  if (c > limits.complaintPct) return `Complaint rate ${c.toFixed(1)}% over the last ${stats.sent} emails is above ${limits.complaintPct}%.`;
  return '';
}

/** Explain SPF, DKIM and DMARC records in plain words (QF-069). Inputs are TXT strings. */
export function explainDns(domain: string, spf: string[], dmarc: string[], dkim: Record<string, boolean>, sendingHost = '') {
  const out: { check: string; ok: boolean; detail: string; fix: string }[] = [];
  const s = spf.filter((x) => /^v=spf1/i.test(x));
  out.push(s.length === 1
    ? { check: 'SPF', ok: !sendingHost || s[0].toLowerCase().includes(sendingHost.toLowerCase()) || /include:/.test(s[0]), detail: s[0], fix: sendingHost && !s[0].toLowerCase().includes(sendingHost.toLowerCase()) ? `Make sure your SPF includes your email provider (for Google Workspace: include:_spf.google.com; Microsoft 365: include:spf.protection.outlook.com).` : '' }
    : { check: 'SPF', ok: false, detail: s.length ? `${s.length} SPF records (only one is allowed)` : 'No SPF record', fix: s.length ? 'Merge them into one TXT record starting with v=spf1.' : `Add a TXT record on ${domain} like: v=spf1 include:_spf.google.com ~all (use your provider's include).` });
  const d = dmarc.find((x) => /^v=dmarc1/i.test(x));
  const policy = d?.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase();
  out.push(d ? { check: 'DMARC', ok: true, detail: `${d}${policy === 'none' ? ' (monitoring only)' : ''}`, fix: policy === 'none' ? 'Fine to start. Move to p=quarantine once reports look clean.' : '' }
    : { check: 'DMARC', ok: false, detail: 'No DMARC record', fix: `Add a TXT record at _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:dmarc@${domain}` });
  const found = Object.entries(dkim).filter(([, v]) => v).map(([k]) => k);
  out.push(found.length ? { check: 'DKIM', ok: true, detail: `Found selector${found.length > 1 ? 's' : ''}: ${found.join(', ')}`, fix: '' }
    : { check: 'DKIM', ok: false, detail: 'No DKIM key found on common selectors (google, selector1, selector2, default, k1, s1, mail)', fix: 'Turn on DKIM signing in your email provider and publish the key it gives you. If you use a custom selector, this check cannot see it.' });
  return out;
}

/** Simulate the next sends without changing anything (QF-065). */
export function dryRun(
  due: { id: number; lead: string; email: string; zone: string; step: number; dueAt: string; block: string }[],
  opts: { now: Date; cap: number; sentToday: number; gapMinutes: number; window: { windowStart: number; windowEnd: number; weekdaysOnly: boolean }; days: number },
) {
  const plan: { id: number; lead: string; email: string; step: number; at: string | null; note: string }[] = [];
  let clock = new Date(opts.now);
  let dayKey = clock.toISOString().slice(0, 10);
  let today = opts.sentToday;
  const end = opts.now.getTime() + opts.days * 864e5;
  for (const m of [...due].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.step - b.step)) {
    if (m.block) { plan.push({ id: m.id, lead: m.lead, email: m.email, step: m.step, at: null, note: `Will not send: ${m.block}` }); continue; }
    let t = new Date(Math.max(clock.getTime(), Date.parse(m.dueAt)));
    for (let guard = 0; guard < 40; guard++) {
      const w = nextWindow(t, m.zone, opts.window);
      if (!w) { t = new Date(end + 1); break; }
      if (w.toISOString().slice(0, 10) !== dayKey) { dayKey = w.toISOString().slice(0, 10); today = 0; }
      if (today >= opts.cap) { t = new Date(Date.parse(dayKey) + 864e5); continue; }
      t = w; break;
    }
    if (t.getTime() > end) { plan.push({ id: m.id, lead: m.lead, email: m.email, step: m.step, at: null, note: `Later than ${opts.days} days` }); continue; }
    plan.push({ id: m.id, lead: m.lead, email: m.email, step: m.step, at: t.toISOString(), note: m.zone ? `${m.zone}` : 'your time zone' });
    today++;
    clock = new Date(t.getTime() + opts.gapMinutes * 60000);
  }
  return plan;
}
