// Public "hiring" posts from people who need a service right now (Reddit freelance communities).
import { BOT_UA, fetchText } from '../util';
import type { Candidate, Progress } from './types';

const SUBS = 'forhire+hiring+jobbit+freelance_forhire+slavelabour+DesignJobs+web_design+startups+smallbusiness+Entrepreneur';
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export async function searchPosts(keywords: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const q = `(${keywords}) (hiring OR "looking for" OR need OR budget)`;
  const out: Candidate[] = [];
  let after = '';
  for (let page = 0; page < 10 && out.length < limit; page++) {
    const r = await fetchText(`https://www.reddit.com/r/${SUBS}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=month&limit=100${after ? `&after=${after}` : ''}`, { ua: BOT_UA, timeout: 20000 });
    if (!r.ok) throw new Error(`Reddit did not answer (HTTP ${r.status}).`);
    const j = JSON.parse(r.text);
    for (const c of j.data?.children ?? []) {
      const p = c.data;
      const title = String(p.title ?? '');
      if (/\[for hire\]|\[offer\]|for hire/i.test(title)) continue; // those are sellers, not buyers
      if (!/hiring|looking for|need|seeking|wanted|task/i.test(title + ' ' + (p.selftext ?? '').slice(0, 300))) continue;
      const text = `${title}\n\n${String(p.selftext ?? '').slice(0, 1500)}`;
      out.push({
        source: 'reddit', source_ref: p.id, name: `u/${p.author}: ${title}`.slice(0, 140), category: 'Job post',
        address: '', city: '', region: '', country: '', postcode: '', lat: null, lon: null, phone: '',
        email: text.match(EMAIL)?.[0]?.toLowerCase() ?? '', website: '',
        socials: { reddit: `https://www.reddit.com${p.permalink}` }, summary: text, contact_name: `u/${p.author}`,
      });
    }
    progress(`Job posts: ${out.length} people looking for help`, out.length);
    after = j.data?.after ?? '';
    if (!after) break;
  }
  return out.slice(0, limit);
}
