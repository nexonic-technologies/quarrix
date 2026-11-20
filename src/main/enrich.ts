// Visit a business's own website (home + contact/about pages) for its published emails, phones, social links and site facts.
import { actionLinks, detectTech, schemaDetails } from './intel';
import * as cheerio from 'cheerio';
import { promises as dns } from 'node:dns';
import { domainOf, fetchText, isPlatformHost, normalizePhone } from './util';

const BAD_LOCAL = new Set(['noreply', 'no-reply', 'donotreply', 'privacy', 'abuse', 'postmaster', 'hostmaster', 'webmaster', 'mailer-daemon', 'security', 'legal', 'gdpr', 'dpo', 'careers', 'jobs', 'hr', 'recruiting', 'billing', 'invoices', 'example', 'test', 'your', 'name', 'email', 'user', 'unsubscribe']);
const GOOD_LOCAL = ['info', 'hello', 'contact', 'office', 'enquiries', 'enquiry', 'inquiries', 'admin', 'team', 'reception', 'mail', 'general', 'sales', 'bookings', 'appointments'];
export const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com']);
const SOCIAL: Record<string, RegExp> = {
  facebook: /facebook\.com\/(?!sharer|share|plugins|dialog|tr\b)[^"'?#\s]+/i,
  instagram: /instagram\.com\/(?!p\/|explore)[^"'?#\s]+/i,
  linkedin: /linkedin\.com\/(company|in|school)\/[^"'?#\s]+/i,
  x: /(?:twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]{2,}/i,
  youtube: /youtube\.com\/(channel|c|user|@)[^"'?#\s]*/i,
  tiktok: /tiktok\.com\/@[^"'?#\s]+/i,
  whatsapp: /(?:wa\.me|api\.whatsapp\.com\/send)\/?\??[^"'#\s]*/i,
};

export function extractEmails(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/data-cfemail="([a-f0-9]+)"/gi)) {
    const hex = m[1];
    const key = parseInt(hex.slice(0, 2), 16);
    let s = '';
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    out.push(s);
  }
  let text = html.replace(/&#64;|&#x40;|%40/gi, '@').replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, '@').replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, '.');
  text = text.replace(/&amp;/g, '&');
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) out.push(decodeURIComponent(m[1]));
  for (const m of text.matchAll(/[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,24}/gi)) out.push(m[0]);
  return [...new Set(out.map((e) => e.toLowerCase().replace(/^[.,;:'"<>]+|[.,;:'"<>]+$/g, '')).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpe?g|gif|webp|svg)$/.test(e)))];
}

export function rankEmails(emails: string[], domain: string): string[] {
  const score = (e: string) => {
    const [local, host] = e.split('@');
    if (BAD_LOCAL.has(local) || /^[a-f0-9]{16,}$/.test(local) || /(sentry|wixpress|godaddy|example|domain|yourdomain)\./.test(host)) return -1;
    let s = GOOD_LOCAL.indexOf(local);
    s = s < 0 ? 20 : s;
    if (!(host === domain || host.endsWith('.' + domain) || domain.endsWith('.' + host))) s += 40;
    if (FREEMAIL.has(host)) s += 10;
    return s;
  };
  return emails.map((e) => [e, score(e)] as const).filter(([, s]) => s >= 0).sort((a, b) => a[1] - b[1]).map(([e]) => e);
}

export async function receivesMail(domain: string) {
  try { return (await dns.resolveMx(domain)).length > 0; } catch { return false; }
}

export type SiteFacts = {
  url: string; https: boolean; ms: number; kb: number; title: string; description: boolean; viewport: boolean; h1: boolean;
  platform: string; copyrightYear: number; booking: boolean; form: boolean; analytics: boolean; schema: boolean; noSolicit: boolean;
};

export type EnrichResult = { ok: true; emailSources: Record<string, string>; tech: ReturnType<typeof detectTech>; links: Record<string, string>; people: { name: string; role: string }[]; extra: Record<string, unknown>; website: string; domain: string; emails: string[]; email: string; phones: string[]; socials: Record<string, string>; facts: SiteFacts; schema: Record<string, string>; contact: { name: string; role: string }; text: string } | { ok: false; error: string };

export async function enrichWebsite(website: string, country: string, pages = 3): Promise<EnrichResult> {
  let start = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  let home = await fetchText(start).catch(() => null);
  if ((!home || !home.ok) && start.startsWith('https://')) {
    start = 'http://' + start.slice(8);
    home = await fetchText(start).catch(() => null);
  }
  if (!home || !home.ok) return { ok: false, error: `Website did not load${home ? ` (HTTP ${home.status})` : ''}` };
  const domain = domainOf(home.url);
  if (isPlatformHost(domain)) return { ok: false, error: 'Website is only a social or directory page' };

  const htmls = [home.text];
  const urls = [home.url];
  const $ = cheerio.load(home.text);
  const links = new Map<string, number>();
  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') ?? '');
    const label = ($(a).text() + ' ' + href).toLowerCase();
    if (!/contact|about|team|our-story|get-in-touch|impressum|kontakt|reach-us|locations?|leadership|founder|people|meet/.test(label) || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const abs = new URL(href, home!.url).toString().split('#')[0];
      if (domainOf(abs) === domain) links.set(abs, /contact|kontakt|impressum/.test(label) ? 0 : 1);
    } catch { /* bad href */ }
  });
  for (const url of [...links.entries()].sort((a, b) => a[1] - b[1]).map(([u]) => u).slice(0, Math.max(0, pages - 1))) {
    const p = await fetchText(url, { timeout: 12000 }).catch(() => null);
    if (p?.ok) { htmls.push(p.text); urls.push(p.url); }
  }
  const all = htmls.join('\n');
  // Where each email was seen, so every address can be checked at its source (QF-040).
  const emailSources: Record<string, string> = {};
  htmls.forEach((h, i) => { for (const e of extractEmails(h)) if (!emailSources[e.toLowerCase()]) emailSources[e.toLowerCase()] = urls[i]; });
  const anchors = $('a[href]').map((_, a) => { try { return { href: new URL(String($(a).attr('href')), home!.url).toString(), text: $(a).text().trim().slice(0, 80) }; } catch { return null; } }).get().filter(Boolean) as { href: string; text: string }[];
  const emails = rankEmails(extractEmails(all), domain);

  const phones = new Set<string>();
  for (const m of all.matchAll(/href=["']tel:([^"']+)["']/gi)) phones.add(normalizePhone(decodeURIComponent(m[1]), country));
  const socials: Record<string, string> = {};
  for (const [k, re] of Object.entries(SOCIAL)) {
    const m = all.match(re);
    if (m) socials[k] = 'https://' + m[0].replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\\/]+$/, '');
  }

  const schema: Record<string, string> = {};
  const nodes: any[] = [];
  const people: { name: string; role: string }[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).text());
      for (const node of [j, ...(Array.isArray(j) ? j : []), ...(j['@graph'] ?? [])]) {
        if (!node || typeof node !== 'object') continue;
        nodes.push(node);
        if (node.telephone && !schema.phone) schema.phone = String(node.telephone);
        if (node.email && !schema.email) schema.email = String(node.email).replace(/^mailto:/, '');
        for (const f of [node.founder, node.employee, node.author].flat().filter(Boolean)) {
          if (f && typeof f === 'object' && f.name) people.push({ name: String(f.name), role: String(f.jobTitle ?? (f === node.founder ? 'Founder' : '')) });
        }
        const a = node.address;
        if (a && typeof a === 'object' && !schema.city) {
          schema.street = a.streetAddress ?? ''; schema.city = a.addressLocality ?? ''; schema.region = a.addressRegion ?? '';
          schema.postcode = a.postalCode ?? ''; schema.country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name ?? '';
        }
      }
    } catch { /* bad JSON-LD */ }
  });
  if (people[0]) { schema.contactName = people[0].name; schema.contactRole = people[0].role; }
  if (schema.phone) phones.add(normalizePhone(schema.phone, country));
  if (schema.email) { emails.unshift(schema.email.toLowerCase()); emailSources[schema.email.toLowerCase()] ??= `${home.url} (structured data)`; }

  const lower = all.toLowerCase();
  const years = [...home.text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]);
  const facts: SiteFacts = {
    url: home.url, https: home.url.startsWith('https://'), ms: home.ms, kb: Math.round(home.text.length / 1024),
    title: $('title').first().text().trim().slice(0, 140),
    description: !!$('meta[name="description"]').attr('content'), viewport: !!$('meta[name="viewport"]').length, h1: !!$('h1').length,
    platform: detectPlatform(home.text), copyrightYear: years.length ? Math.max(...years) : 0,
    booking: /book (an |your )?(appointment|online|now)|schedule (an )?appointment|calendly|acuity|setmore|opentable|resy/i.test(home.text),
    form: /<form\b/i.test(home.text), analytics: /googletagmanager|gtag\(|google-analytics|plausible|fbq\(/i.test(home.text),
    schema: /application\/ld\+json/i.test(home.text),
    noSolicit: /no solicitation|do not solicit|unsolicited (commercial )?e-?mails?|no marketing emails/.test(lower),
  };
  const contact = findContact(htmls, schema);
  // Prefer a personal email that matches the decision maker's name, then the ranked list.
  let uniqueEmails = [...new Set(emails)];
  if (contact.name) {
    const first = contact.name.split(' ')[0].toLowerCase();
    const mine = uniqueEmails.find((e) => e.split('@')[0].includes(first));
    if (mine) uniqueEmails = [mine, ...uniqueEmails.filter((e) => e !== mine)];
  }
  const text = htmls.map((h) => cheerio.load(h)('body').text()).join('\n').replace(/\s+/g, ' ').slice(0, 6000);
  return { ok: true, website: home.url, domain, emails: uniqueEmails, email: uniqueEmails[0] ?? '', phones: [...phones].filter(Boolean), socials, facts, schema, contact, text, emailSources, tech: detectTech(all), links: actionLinks(anchors), people, extra: schemaDetails(nodes, home.text) };
}

const ROLES = 'Founder|Co-Founder|Cofounder|CEO|Chief Executive Officer|Owner|Co-Owner|Managing Director|Managing Partner|Director|Principal|President|Proprietor|Head Doctor|Lead Dentist|Practice Owner|Partner';
const NAME = "(?:Dr\\.?\\s)?[A-Z][a-z'’-]+(?:\\s[A-Z][a-z'’-]+){1,2}";

/** The owner or a decision maker named on the site, from structured data or "Name, Founder" patterns. */
export function findContact(htmls: string[], schema: Record<string, string>) {
  if (schema.contactName) return { name: schema.contactName, role: schema.contactRole || 'Founder' };
  const text = htmls.map((h) => cheerio.load(h)('body').text()).join(' ').replace(/\s+/g, ' ');
  const a = text.match(new RegExp(`(${NAME})\\s*[,–—|-]\\s*(${ROLES})\\b`));
  const tidy = (n: string) => n.replace(/^(Meet|Our|The|By|With|Contact|About|Dear|Call|Email|Ask|Hi|Hello)\s+/i, '').trim();
  if (a && tidy(a[1]).includes(' ')) return { name: tidy(a[1]), role: a[2] };
  const b = text.match(new RegExp(`\\b(${ROLES})\\s*[:,–—|-]?\\s*(${NAME})`));
  if (b && tidy(b[2]).includes(' ')) return { name: tidy(b[2]), role: b[1] };
  return { name: '', role: '' };
}

function detectPlatform(html: string) {
  const checks: [string, RegExp][] = [['WordPress', /wp-content|wp-includes/i], ['Wix', /wix\.com|wixstatic/i], ['Squarespace', /squarespace/i], ['Shopify', /cdn\.shopify|shopify\.com/i], ['GoDaddy', /godaddy|wsimg\.com/i], ['Webflow', /webflow/i], ['Weebly', /weebly/i], ['Joomla', /joomla/i], ['Drupal', /drupal/i], ['Duda', /dudaone|multiscreensite/i]];
  return checks.find(([, re]) => re.test(html))?.[0] ?? '';
}

/** 0-100: how much the website needs help, with the findings in plain words. */
export function siteScore(f: SiteFacts, psi?: { performance?: number | null; lcp?: number | null; seo?: number | null }) {
  let s = 0;
  const why: string[] = [];
  const add = (n: number, w: string) => { s += n; why.push(w); };
  if (psi?.performance != null && psi.performance < 50) add(psi.performance < 35 ? 35 : 25, `Google PageSpeed mobile score is ${psi.performance}/100.`);
  else if (psi?.performance != null && psi.performance < 70) add(12, `Google PageSpeed mobile score is ${psi.performance}/100.`);
  if (psi?.lcp != null && psi.lcp >= 4) add(10, `The main content takes about ${psi.lcp} s to appear on a phone.`);
  if (psi?.seo != null && psi.seo < 80) add(6, `Google's SEO check scores it ${psi.seo}/100.`);
  if (!f.https) add(25, 'No HTTPS: browsers mark the site "Not secure".');
  if (!f.viewport) add(25, 'Not set up for phones (no mobile viewport).');
  if (f.copyrightYear && f.copyrightYear <= new Date().getFullYear() - 3) add(8, `The footer still says © ${f.copyrightYear}.`);
  if (!f.description) add(5, 'No meta description for Google.');
  if (!f.booking && !f.form) add(6, 'No contact form or online booking.');
  if (f.ms > 3000) add(6, `The home page took ${(f.ms / 1000).toFixed(1)} s to respond.`);
  return { score: Math.min(100, s), findings: why };
}

export async function pagespeed(url: string, key: string) {
  const q = new URLSearchParams({ url, strategy: 'mobile' });
  const r = await fetchText(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}&category=performance&category=seo${key ? `&key=${encodeURIComponent(key)}` : ''}`, { timeout: 70000 });
  if (!r.ok) throw new Error(`PageSpeed: HTTP ${r.status}`);
  const lh = JSON.parse(r.text).lighthouseResult ?? {};
  const cat = lh.categories ?? {};
  const lcp = lh.audits?.['largest-contentful-paint']?.numericValue;
  return {
    performance: cat.performance?.score != null ? Math.round(cat.performance.score * 100) : null,
    seo: cat.seo?.score != null ? Math.round(cat.seo.score * 100) : null,
    lcp: lcp != null ? Math.round(lcp / 100) / 10 : null,
  };
}
