// Email checks with honest statuses (QF-041 to QF-043, QF-045) and optional email finding through Hunter (QF-039, QF-031).
// Syntax and MX are free and local; mailbox checks only happen with a provider key the user adds, within a daily limit.
import * as db from './db';
import { receivesMail } from './enrich';
import { validSyntax } from './intel';
import { load } from './settings';
import { fetchText } from './util';

const CACHE_DAYS = 30;

async function provider(email: string): Promise<{ status: string; detail: string; provider: string } | null> {
  const v = load().verify;
  if (v.provider === 'hunter' && v.hunterKey) {
    const r = await fetchText(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(v.hunterKey)}`, { timeout: 30000 });
    const j = JSON.parse(r.text || '{}');
    if (!r.ok) throw new Error(j.errors?.[0]?.details ?? `Hunter HTTP ${r.status}`);
    const st = j.data?.status as string;
    return { provider: 'hunter', detail: `${st}${j.data?.score != null ? `, score ${j.data.score}` : ''}`, status: st === 'valid' ? 'verified' : st === 'invalid' ? 'invalid' : st === 'accept_all' || st === 'webmail' || st === 'disposable' ? 'risky' : 'unknown' };
  }
  if (v.provider === 'zerobounce' && v.zerobounceKey) {
    const r = await fetchText(`https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(v.zerobounceKey)}&email=${encodeURIComponent(email)}`, { timeout: 30000 });
    const j = JSON.parse(r.text || '{}');
    if (!r.ok || j.error) throw new Error(j.error ?? `ZeroBounce HTTP ${r.status}`);
    const st = String(j.status ?? '');
    return { provider: 'zerobounce', detail: [st, j.sub_status].filter(Boolean).join(', '), status: st === 'valid' ? 'verified' : st === 'invalid' ? 'invalid' : st === 'catch-all' || st === 'spamtrap' || st === 'abuse' || st === 'do_not_mail' ? 'risky' : 'unknown' };
  }
  return null;
}

/** Check one address: syntax, then MX, then the optional provider. Results are cached for 30 days. */
export async function checkEmail(email: string, useProvider = true, force = false) {
  const e = email.trim().toLowerCase();
  const cached = db.emailCheck(e);
  if (!force && cached && Date.now() - Date.parse(cached.at) < CACHE_DAYS * 864e5 && (cached.provider !== 'mx' || !useProvider || load().verify.provider === 'none')) return cached;
  if (!validSyntax(e)) { db.saveEmailCheck(e, 'bad-syntax', 'syntax'); return db.emailCheck(e)!; }
  const mx = await receivesMail(e.split('@')[1]).catch(() => false);
  if (!mx) { db.saveEmailCheck(e, 'no-mx', 'mx'); return db.emailCheck(e)!; }
  const p = useProvider ? await provider(e) : null;
  if (p) db.saveEmailCheck(e, p.status, p.provider, p.detail);
  else db.saveEmailCheck(e, 'mx-ok', 'mx');
  return db.emailCheck(e)!;
}

/** Re-check leads' main emails in batches; stops at the provider's daily limit (QF-043). */
export async function verifyLeads(ids: number[], progress: (done: number, total: number) => void = () => undefined) {
  const out = { checked: 0, verified: 0, invalid: 0, skipped: 0, errors: [] as string[] };
  for (const [i, id] of ids.entries()) {
    const lead = db.getLead(id);
    if (!lead?.email) { out.skipped++; continue; }
    try {
      const r = await checkEmail(lead.email, true, true);
      db.updateLead(id, { email_status: r.status, email_checked_at: r.at });
      out.checked++;
      if (r.status === 'verified') out.verified++;
      if (r.status === 'invalid' || r.status === 'bad-syntax' || r.status === 'no-mx') out.invalid++;
    } catch (e: any) {
      out.errors.push(`${lead.name}: ${e.message ?? e}`);
      if (/limit/i.test(String(e.message))) break;
    }
    progress(i + 1, ids.length);
  }
  return out;
}

/** Hunter domain search: public business emails found by Hunter for a domain, with their sources (QF-039). */
export async function hunterDomain(domain: string) {
  const v = load().verify;
  if (!v.hunterKey) throw new Error('Add a Hunter key in Settings → Sources.');
  const r = await fetchText(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${encodeURIComponent(v.hunterKey)}`, { timeout: 30000 });
  const j = JSON.parse(r.text || '{}');
  if (!r.ok) throw new Error(j.errors?.[0]?.details ?? `Hunter HTTP ${r.status}`);
  return ((j.data?.emails ?? []) as any[]).map((e) => ({
    email: String(e.value).toLowerCase(), name: [e.first_name, e.last_name].filter(Boolean).join(' '), role: e.position ?? e.department ?? '',
    confidence: e.confidence ?? null, source_url: e.sources?.[0]?.uri ?? '', type: e.type,
  }));
}
