// Pure safety rules shared by the main process and the tests: private-network checks, duplicate matching,
// follow-up ordering and outreach blocks. Keep this file free of Electron and database imports.
import { isIP } from 'node:net';

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

/** Hostnames that must never be fetched for lead or job pages. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return isIP(h) ? isPrivateAddress(h) : false;
}

/** Only web and mail links may be opened outside the app. */
export function isSafeExternalUrl(url: string): boolean {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol); } catch { return false; }
}

const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s = '') => s.replace(/\D/g, '').slice(-9);

type Biz = { name?: string; domain?: string; phone?: string; city?: string; address?: string };
/**
 * Same business? A shared domain alone is NOT enough, because chains and franchises share one website
 * across many branches. A match needs the domain plus the same phone, or the same city and address/name.
 */
export function sameBusiness(a: Biz, b: Biz): boolean {
  if (a.phone && b.phone && digits(a.phone) && digits(a.phone) === digits(b.phone)) return true;
  if (!a.domain || a.domain !== b.domain) return false;
  const cityA = norm(a.city), cityB = norm(b.city);
  if (cityA && cityB && cityA !== cityB) return false;
  if (a.address && b.address) return norm(a.address) === norm(b.address);
  if (a.phone && b.phone) return false;
  return norm(a.name) === norm(b.name) || !cityA || !cityB;
}

/** Why outreach to this lead must not happen, or '' when it may. */
export function outreachBlock(lead: { email?: string; status?: string; audit?: string }, suppressed: boolean): string {
  if (!lead.email) return 'no email address';
  if (suppressed) return 'on the do-not-contact list';
  if (['replied', 'interested', 'won', 'lost', 'do_not_contact'].includes(lead.status ?? '')) return `lead is ${lead.status}`;
  try { if (JSON.parse(lead.audit || '{}')?.facts?.noSolicit) return 'their website says no solicitation'; } catch { /* bad JSON */ }
  return '';
}

/** A follow-up step may go out only when every earlier step was sent and its own due time has come. */
export function stepReady(step: number, dueAt: string | null, sentSteps: number[], now: string): boolean {
  if (!dueAt || dueAt > now) return false;
  for (let i = 0; i < step; i++) if (!sentSteps.includes(i)) return false;
  return true;
}

/** Due emails, oldest first. A follow-up is never due while an earlier step of the same lead is unsent, and NULL due dates never send. */
export const DUE_SQL = `SELECT m.* FROM messages m WHERE m.status = 'scheduled' AND m.channel = 'email' AND m.due_at IS NOT NULL AND m.due_at <= ?
  AND NOT EXISTS (SELECT 1 FROM messages p WHERE p.lead_id = m.lead_id AND p.channel = 'email' AND p.step < m.step AND p.status <> 'sent')
  ORDER BY m.due_at, m.step LIMIT 20`;

/** Remove secrets and personal details from text before it leaves the app in a diagnostics file (QF-124). */
export function redact(text: string): string {
  return text
    .replace(/(["']?(?:api[_-]?key|token|secret|password|pass|refresh|authorization|cloudToken|smtpPass|imapPass)["']?\s*[:=]\s*)(["'])?[^"',\s}]+\2?/gi, '$1"[removed]"')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [removed]')
    .replace(/\b(sk|pk|rk|xox[abp]|ghp|gho|pat|AIza)[A-Za-z0-9_-]{10,}\b/g, '[key removed]')
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s"']+/gi, '$1[removed]')
    .replace(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi, '[email]@$1')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}
