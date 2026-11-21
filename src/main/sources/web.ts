// Web search engines (Bing and DuckDuckGo): finds businesses that are missing from the maps, with their websites.
import * as cheerio from 'cheerio';
import { domainOf, fetchText, isPlatformHost, sleep, UA } from '../util';
import type { Candidate, Progress } from './types';

// Results from these sites are lists, news or social pages, not the business itself.
export const SKIP = /(^|\.)(google|bing|duckduckgo|yahoo|wikipedia|wikimedia|youtube|facebook|instagram|linkedin|twitter|x|tiktok|pinterest|reddit|quora|medium|yelp|yellowpages|yell|tripadvisor|clutch|goodfirms|glassdoor|indeed|crunchbase|mapquest|foursquare|bbb|trustpilot|angi|houzz|thumbtack|upwork|fiverr|amazon|apple|microsoft|github|gov|edu|forbes|nytimes|bloomberg|businesswire|prnewswire|zoominfo|dnb|manta|chamberofcommerce|expertise|designrush|sortlist|themanifest|topdevelopers)\.[a-z.]+$/i;

// Page titles that name the page, not the business ("Contact us | Moorfields Dubai").
export const GENERIC_TITLE = /^(contact( us)?|about( us)?|home( ?page)?|welcome|services?|our services|book( an)? appointment|appointments?|locations?|find us|get in touch|team|our team|doctors?|faq|blog|news|careers?|jobs|gallery|pricing|products?|shop|index|untitled|page not found|404|login|sign in|privacy policy)$/i;
/** A readable name from a domain: moorfields-dubai.ae → "Moorfields Dubai". Pure. */
export const nameFromDomain = (d: string) => d.replace(/^www\./, '').split('.')[0].split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
/** The business name from a search result title, skipping generic parts; falls back to the domain. Pure, exported for tests. */
export function clean(title: string, domain = '') {
  const parts = title.split(/\s[|–—-]\s|\s·\s|:\s/).map((p) => p.replace(/\b(home|homepage|official site|welcome to)\b/gi, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const good = parts.find((p) => !GENERIC_TITLE.test(p) && p.length > 1);
  return (good ?? (domain ? nameFromDomain(domain) : '')).slice(0, 120);
}

export async function bing(q: string, page: number) {
  const r = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${page * 10 + 1}&setlang=en`, { ua: UA, timeout: 20000 });
  const $ = cheerio.load(r.text);
  return $('li.b_algo').map((_, li) => ({ title: $(li).find('h2').text().trim(), url: $(li).find('h2 a').attr('href') ?? '' })).get();
}

export async function ddg(q: string, page: number) {
  const r = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}${page ? `&s=${page * 30}` : ''}`, { ua: UA, timeout: 20000 });
  const $ = cheerio.load(r.text);
  return $('a.result__a').map((_, a) => {
    let url = $(a).attr('href') ?? '';
    const m = url.match(/uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]);
    return { title: $(a).text().trim(), url };
  }).get();
}

export async function searchWeb(category: string, place: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const queries = [`${category} in ${place}`, `best ${category} ${place}`, `${category} ${place} contact us`, `top rated ${category} near ${place}`, `${category} company ${place} about us`];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const q of queries) {
    for (let page = 0; page < 5 && out.length < limit; page++) {
      const batch = [...(await bing(q, page).catch(() => [])), ...(page < 2 ? await ddg(q, page).catch(() => []) : [])];
      let fresh = 0;
      for (const r of batch) {
        if (!/^https?:/.test(r.url)) continue;
        const d = domainOf(r.url);
        if (!d || seen.has(d) || SKIP.test(d) || isPlatformHost(d)) continue;
        seen.add(d);
        fresh++;
        out.push({ source: 'web', source_ref: d, name: clean(r.title, d) || d, category, address: '', city: '', region: '', country: '', postcode: '', lat: null, lon: null, phone: '', email: '', website: `https://${d}` });
      }
      progress(`Web search: ${out.length} business websites found`, out.length);
      if (!fresh) break;
      await sleep(1500 + Math.random() * 1500);
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
