// Business directories: Yelp (many countries), Yellow Pages (US) and Yell (UK).
// They change their pages often; each one fails on its own without stopping the search.
import * as cheerio from 'cheerio';
import { pageHtml } from './gmaps';
import { sleep } from '../util';
import type { Candidate, Progress } from './types';

const base = (c: Partial<Candidate>): Candidate => ({ source: 'yelp', source_ref: '', name: '', category: '', address: '', city: '', region: '', country: '', postcode: '', lat: null, lon: null, phone: '', email: '', website: '', ...c });

async function yelp(category: string, place: string, limit: number, progress: Progress) {
  const out: Candidate[] = [];
  for (let start = 0; start < 240 && out.length < limit; start += 10) {
    const $ = cheerio.load(await pageHtml(`https://www.yelp.com/search?find_desc=${encodeURIComponent(category)}&find_loc=${encodeURIComponent(place)}&start=${start}`, 'main', 1500));
    const links = new Map<string, string>();
    $('a[href^="/biz/"]').each((_, a) => {
      const href = ($(a).attr('href') ?? '').split('?')[0];
      const name = $(a).text().trim();
      if (name && name.length > 1 && !/^\d+$/.test(name) && !links.has(href)) links.set(href, name);
    });
    if (!links.size) break;
    for (const [href, name] of links) {
      if (out.length >= limit) break;
      let phone = '', website = '', address = '';
      try {
        const b = cheerio.load(await pageHtml(`https://www.yelp.com${href}`, 'main', 800));
        const text = b('main').text();
        phone = text.match(/\(\d{3}\)\s?\d{3}-\d{4}|\+\d[\d\s-]{7,}/)?.[0] ?? '';
        const redir = b('a[href*="biz_redir"]').attr('href') ?? '';
        const u = redir.match(/url=([^&]+)/);
        website = u ? decodeURIComponent(u[1]) : '';
        address = b('address').first().text().trim().replace(/\s+/g, ' ');
      } catch { /* keep the name only */ }
      out.push(base({ source: 'yelp', source_ref: href, name, category, phone, website, address }));
      progress(`Yelp: ${out.length} businesses`, out.length);
      await sleep(1200 + Math.random() * 800);
    }
  }
  return out;
}

async function yellowPages(category: string, place: string, limit: number, progress: Progress) {
  const out: Candidate[] = [];
  for (let page = 1; page <= 30 && out.length < limit; page++) {
    const $ = cheerio.load(await pageHtml(`https://www.yellowpages.com/search?search_terms=${encodeURIComponent(category)}&geo_location_terms=${encodeURIComponent(place)}&page=${page}`, '.search-results, body'));
    const rows = $('.result .info, .srp-listing .info');
    if (!rows.length) break;
    rows.each((_, el) => {
      const r = $(el);
      const name = r.find('.business-name').text().trim();
      if (!name) return;
      out.push(base({
        source: 'yellowpages', source_ref: r.find('.business-name').attr('href') ?? name, name, category,
        phone: r.find('.phones').first().text().trim(), website: r.find('a.track-visit-website').attr('href') ?? '',
        address: [r.find('.street-address').text().trim(), r.find('.locality').text().trim()].filter(Boolean).join(', '), country: 'US',
      }));
    });
    progress(`Yellow Pages: ${out.length} businesses`, out.length);
    await sleep(1500);
  }
  return out;
}

async function yell(category: string, place: string, limit: number, progress: Progress) {
  const out: Candidate[] = [];
  for (let page = 1; page <= 20 && out.length < limit; page++) {
    const $ = cheerio.load(await pageHtml(`https://www.yell.com/ucs/UcsSearchAction.do?keywords=${encodeURIComponent(category)}&location=${encodeURIComponent(place)}&pageNum=${page}`, 'body'));
    const rows = $('.businessCapsule, [data-tracking="businessCapsule"]');
    if (!rows.length) break;
    rows.each((_, el) => {
      const r = $(el);
      const name = r.find('.businessCapsule--name, h2').first().text().trim();
      if (!name) return;
      out.push(base({
        source: 'yell', source_ref: r.find('a[href*="/biz/"]').attr('href') ?? name, name, category,
        phone: r.find('.business--telephoneNumber, [itemprop="telephone"]').first().text().trim(),
        website: r.find('a[href^="http"]').filter((_, a) => !/yell\.com/.test($(a).attr('href') ?? '')).first().attr('href') ?? '',
        address: r.find('[itemprop="address"], .businessCapsule--address').first().text().trim().replace(/\s+/g, ' '), country: 'GB',
      }));
    });
    progress(`Yell: ${out.length} businesses`, out.length);
    await sleep(1500);
  }
  return out;
}

// Hotfrog: business directory with country sites. Listing pages give name, address and category.
const HOTFROG: Record<string, string> = { US: 'www.hotfrog.com', GB: 'www.hotfrog.co.uk', AU: 'www.hotfrog.com.au', CA: 'www.hotfrog.ca', IN: 'www.hotfrog.in', ZA: 'www.hotfrog.co.za', IE: 'www.hotfrog.ie', NZ: 'www.hotfrog.co.nz', SG: 'www.hotfrog.sg', MY: 'www.hotfrog.com.my', PH: 'www.hotfrog.ph', DE: 'www.hotfrog.de', FR: 'www.hotfrog.fr', NL: 'www.hotfrog.nl', ES: 'www.hotfrog.es', IT: 'www.hotfrog.it', BR: 'www.hotfrog.com.br', MX: 'www.hotfrog.com.mx' };
async function hotfrog(category: string, place: string, country: string, limit: number, progress: Progress) {
  const host = HOTFROG[country];
  if (!host) return [];
  const slug = (x: string) => x.toLowerCase().replace(/,.*$/, '').trim().replace(/[^a-z0-9]+/g, '-');
  const out: Candidate[] = [];
  for (let page = 1; page <= 15 && out.length < limit; page++) {
    const $ = cheerio.load(await pageHtml(`https://${host}/search/${slug(place)}/${slug(category)}${page > 1 ? `/${page}` : ''}`, '.entity-data, body', 900));
    const cards = $('.entity-data');
    if (!cards.length) break;
    let fresh = 0;
    cards.each((_, el) => {
      const c = $(el);
      const a = c.find('.entity-title a').first();
      const name = a.text().trim();
      const href = a.attr('href') ?? '';
      if (!name || out.some((x) => x.source_ref === href)) return;
      fresh++;
      out.push(base({ source: 'hotfrog', source_ref: href, name, category: c.find('.entity-categories span').first().text().trim() || category,
        address: c.find('.entity-address').text().trim().replace(/\s+/g, ' '), country }));
    });
    progress(`Hotfrog: ${out.length} businesses`, out.length);
    if (!fresh) break;
    await sleep(1200);
  }
  return out;
}

/** Runs the directories that cover this country. Errors are collected, not thrown, unless every directory failed. */
export async function searchDirectories(category: string, place: string, country: string, limit: number, progress: Progress) {
  const runs: [string, () => Promise<Candidate[]>][] = [['Hotfrog', () => hotfrog(category, place, country, limit, progress)], ['Yelp', () => yelp(category, place, limit, progress)]];
  if (country === 'US' || !country) runs.push(['Yellow Pages', () => yellowPages(category, place, limit, progress)]);
  if (country === 'GB') runs.push(['Yell', () => yell(category, place, limit, progress)]);
  const out: Candidate[] = [];
  const errors: string[] = [];
  for (const [label, run] of runs) {
    try { out.push(...(await run())); } catch (e: any) { errors.push(`${label}: ${e.message ?? e}`); }
  }
  if (!out.length && errors.length) throw new Error(errors.join(' · '));
  return out;
}
