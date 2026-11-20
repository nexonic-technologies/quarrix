// Find a missing company website (QF-016). A candidate is accepted only with checkable evidence:
// the listing's phone number appears on the page, or both the business name and its city do.
import { domainOf, fetchText, isPlatformHost, UA } from '../util';
import { bing, ddg, SKIP } from './web';

const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'of', 'ltd', 'llc', 'inc', 'co', 'company', 'limited', 'pvt', 'gmbh', 'sa', 'srl']);

/** Pure check, exported for tests: does this page text support that it belongs to the business? */
export function websiteEvidence(page: string, lead: { name: string; city: string; phone: string }): string {
  const text = norm(page.replace(/<[^>]+>/g, ' '));
  const digits = page.replace(/\D/g, '');
  const tail = lead.phone.replace(/\D/g, '').slice(-8);
  if (tail.length >= 7 && digits.includes(tail)) return 'phone number on the page';
  const words = norm(lead.name).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const city = norm(lead.city);
  if (words.length && words.every((w) => text.includes(w)) && city && text.includes(city)) return 'name and city on the page';
  return '';
}

export async function findWebsite(lead: { name: string; city: string; phone: string }) {
  const query = `"${lead.name}" ${lead.city}`;
  const results = [...(await bing(query, 0).catch(() => [])), ...(await ddg(query, 0).catch(() => []))];
  const seen = new Set<string>();
  for (const r of results) {
    if (!/^https?:/.test(r.url)) continue;
    const d = domainOf(r.url);
    if (!d || seen.has(d) || SKIP.test(d) || isPlatformHost(d)) continue;
    seen.add(d);
    if (seen.size > 5) break;
    const page = await fetchText(`https://${d}`, { ua: UA, timeout: 12000, maxBytes: 1_500_000 }).catch(() => null);
    if (!page?.ok) continue;
    const why = websiteEvidence(page.text, lead);
    if (why) return { url: `https://${d}`, evidence: why, query };
  }
  return null;
}
