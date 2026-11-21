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
    const g = expand6(ip);
    if (!g) return true;
    if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true; // :: and ::1
    const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    // IPv4 hidden inside IPv6: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d), NAT64 (64:ff9b::/96), 6to4 (2002::/16).
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isPrivateAddress(v4(g[6], g[7]));
    if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateAddress(v4(g[6], g[7]));
    if (g[0] === 0x2002) return isPrivateAddress(v4(g[1], g[2]));
    if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo and documentation ranges
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
  }
  return true;
}

/** Eight 16-bit groups of an IPv6 address (handles :: and a trailing dotted IPv4), or null. */
function expand6(ip: string): number[] | null {
  let x = ip.toLowerCase().split('%')[0];
  const m = x.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const [a, b, c, d] = m.slice(1).map(Number); x = x.slice(0, -m[0].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`; }
  const [head, tail] = x.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const fill = x.includes('::') ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t].map((p) => parseInt(p || '0', 16));
  return parts.length === 8 && parts.every((n) => n >= 0 && n <= 0xffff) ? parts : null;
}

/** Hostnames that must never be fetched for lead or job pages. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa') || h.endsWith('.lan') || h === 'metadata.google.internal') return true;
  // Numeric shorthands such as 2130706433 or 0x7f.1 are refused outright; browsers and some resolvers read them as IPv4.
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}$/i.test(h) && !isIP(h)) return true;
  return isIP(h) ? isPrivateAddress(h) : false;
}

/** Only web and mail links may be opened outside the app. */
export function isSafeExternalUrl(url: string): boolean {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol); } catch { return false; }
}

const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s = '') => s.replace(/\D/g, '').slice(-9);

type Biz = { name?: string; domain?: string; phone?: string; city?: string; address?: string; lat?: number | null; lon?: number | null };
const km = (a: Biz, b: Biz) => {
  const r = Math.PI / 180, dLat = (b.lat! - a.lat!) * r, dLon = (b.lon! - a.lon!) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** Two records that clearly sit in different places: other city, other street address, or more than 300 m apart. Pure. */
export function differentPlace(a: Biz, b: Biz) {
  const cityA = norm(a.city), cityB = norm(b.city);
  if (cityA && cityB && cityA !== cityB) return true;
  if (a.address && b.address && norm(a.address) !== norm(b.address)) return true;
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null && km(a, b) > 0.3) return true;
  return false;
}
/**
 * Same business? A shared domain or phone alone is NOT enough: chains and franchises share one website and often one
 * central phone number across many branches (0.25). A match needs the same place as well: same city and address,
 * or coordinates within 300 m, and for a domain match also the same phone or name.
 */
export function sameBusiness(a: Biz, b: Biz): boolean {
  if (differentPlace(a, b)) return false;
  if (a.phone && b.phone && digits(a.phone) && digits(a.phone) === digits(b.phone)) return true;
  if (!a.domain || a.domain !== b.domain) return false;
  if (a.address && b.address) return true; // same address (differentPlace checked)
  if (a.phone && b.phone) return false;
  return norm(a.name) === norm(b.name) || !norm(a.city) || !norm(b.city);
}

/** Why outreach to this lead must not happen, or '' when it may. */
export function outreachBlock(lead: { email?: string; status?: string; audit?: string }, suppressed: boolean, sourceAllowsContact = true): string {
  if (!lead.email) return 'no email address';
  if (suppressed) return 'on the do-not-contact list';
  if (!sourceAllowsContact) return 'the terms of the source it came from do not allow contacting';
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
