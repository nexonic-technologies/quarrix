import * as cheerio from 'cheerio';
import { fetchText, BOT_UA } from './util';
import { detectAts, postingState } from './ats';
import { NOT_A_JOB_PAGE } from './resume';
import { assessTrust, mentions, postingKey, webUrl,manualJobBoard, type TrustJob, type TrustReport } from '../shared/job-trust';

/** User-initiated, two bounded public page reads, with the existing network guard on every redirect. */
export async function checkJobTrust(job: TrustJob, employerUrl = ''): Promise<TrustReport> {
  const initial = webUrl(job.url);
  const evidence: Omit<TrustReport, 'score' | 'state' | 'warnings'> = { checkedAt: new Date().toISOString(), secure: initial?.protocol === 'https:', listing: 'unknown', titleMatch: false, companyMatch: false, employer: employerUrl ? 'unknown' : 'not-checked', employerNameMatch: false, listingHost: initial?.hostname ?? '', employerHost: '' };
  let text = '', final = job.url;
  if (initial?.protocol === 'https:'&&!manualJobBoard(initial.href)) try {
    const r = await fetchText(initial.href, { ua: BOT_UA, timeout: 15000, maxBytes: 1_500_000,allowUrl:u=>!manualJobBoard(u) });
    final = r.url;
    const u = webUrl(final); evidence.secure = u?.protocol === 'https:'; evidence.listingHost = u?.hostname ?? '';
    if (r.status === 404 || r.status === 410) evidence.listing = 'closed';
    else if (r.ok && /html|text\/plain/i.test(r.type) && !NOT_A_JOB_PAGE.test(r.text.slice(0, 20000))) {
      const $ = cheerio.load(r.text); $('script,style,template,noscript,nav,header,footer').remove();
      text = ($('main').text() || $('body').text()).replace(/\s+/g, ' ').trim().slice(0, 20000);
      evidence.titleMatch = mentions(text, job.title);
      evidence.companyMatch = mentions(text, job.company);
      if (postingState(r.status, text).state === 'closed') evidence.listing = 'closed';
      else if (text.length >= 100 && evidence.titleMatch) evidence.listing = 'readable';
    }
  } catch { /* inaccessible is unknown, never a verdict */ }
  const employer = webUrl(employerUrl);
  if (employer?.protocol === 'https:' && !manualJobBoard(employer.href) && postingKey(employer.href) !== postingKey(job.url) && postingKey(employer.href) !== postingKey(final) && !detectAts(employer.href)) try {
    const r = await fetchText(employer.href, { ua: BOT_UA, timeout: 15000, maxBytes: 1_500_000,allowUrl:u=>!manualJobBoard(u) });
    const u = webUrl(r.url); evidence.employerHost = u?.hostname ?? '';
    if (r.ok && u?.protocol === 'https:' && /html/i.test(r.type) && !NOT_A_JOB_PAGE.test(r.text.slice(0, 20000)) && !detectAts(r.url) && postingKey(r.url) !== postingKey(final) && postingKey(r.url) !== postingKey(job.url)) {
      const $ = cheerio.load(r.text);
      const targets = new Set([postingKey(job.url), postingKey(final)].filter(Boolean));
      const linked = $('a[href]').toArray().slice(0, 3000).some(a => { try { return targets.has(postingKey(new URL($(a).attr('href')!, r.url).href)); } catch { return false; } });
      $('script,style,template,noscript').remove();
      evidence.employerNameMatch = mentions(`${$('title').text()} ${$('body').text()}`, job.company);
      evidence.employer = linked ? (evidence.employerNameMatch ? 'linked' : 'unknown') : 'not-linked';
    }
  } catch { /* denied, unavailable, or malformed: no corroboration */ }
  return assessTrust(job, evidence, text);
}
