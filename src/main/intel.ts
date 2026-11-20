// Lead intelligence rules (phase 3). Pure functions, no Electron or database imports, so they are testable.

/** Who the user sells to (QF-033). Empty lists mean "any". */
export type Icp = {
  preset: string; categories: string[]; countries: string[]; cities: string[];
  minRating: number; maxRating: number; minReviews: number; maxReviews: number;
  needWebsite: 'any' | 'with' | 'without'; needEmail: boolean; excludeChains: boolean;
  needs: string[]; offer: string;
};

export const DEFAULT_ICP: Icp = { preset: 'web', categories: [], countries: [], cities: [], minRating: 0, maxRating: 5, minReviews: 0, maxReviews: 0, needWebsite: 'any', needEmail: false, excludeChains: true, needs: [], offer: '' };

/** Editable starting points for common offers (QF-034). */
export const PRESETS: Record<string, { label: string; icp: Partial<Icp> }> = {
  web: { label: 'Websites and web design', icp: { needs: ['no website', 'not mobile', 'slow', 'no https', 'outdated', 'no booking'], excludeChains: true, maxReviews: 400 } },
  seo: { label: 'SEO and Google visibility', icp: { needs: ['seo', 'no description', 'google', 'reviews', 'slow'], needWebsite: 'with', excludeChains: true } },
  reputation: { label: 'Reviews and reputation', icp: { needs: ['rating', 'reviews'], maxRating: 4.2, minReviews: 5 } },
  healthcare: { label: 'Healthcare suppliers', icp: { categories: ['Dentists', 'Doctors', 'Clinics', 'Physiotherapists', 'Pharmacies', 'Veterinarians'], needWebsite: 'any', excludeChains: false } },
  recruitment: { label: 'Recruitment and staffing', icp: { needs: ['hiring'], excludeChains: false, minReviews: 0 } },
  trades: { label: 'Contractors and home services', icp: { categories: ['Plumbers', 'Electricians', 'Roofers', 'Builders', 'HVAC', 'Cleaners', 'Landscapers'], needs: ['no website', 'no booking', 'not mobile'], excludeChains: true } },
  bookkeeping: { label: 'Accounting and bookkeeping', icp: { categories: ['Restaurants', 'Retail', 'Salons', 'Contractors'], excludeChains: true, maxReviews: 300 } },
};

type LeadLike = {
  category?: string; country?: string; city?: string; rating?: number | null; reviews?: number | null; website?: string; email?: string;
  email_status?: string; phone?: string; tags?: string; needs?: string; fit?: number | null; audit?: string; provenance?: string; contact_name?: string;
};

const has = (list: string[], v = '') => !list.length || list.some((x) => x.toLowerCase() === v.toLowerCase());

/**
 * Two separate numbers (QF-033): relevance = how well the lead matches the user's ideal customer;
 * evidence = how much of what we know is backed by a checkable source. Grade A/B/C/D with plain reasons (QF-035).
 */
export function scoreLead(l: LeadLike, icp: Icp) {
  const reasons: string[] = [];
  const misses: string[] = [];
  let rel = 50;
  const hit = (n: number, why: string) => { rel += n; reasons.push(why); };
  const miss = (n: number, why: string) => { rel -= n; misses.push(why); };

  if (icp.categories.length) has(icp.categories, l.category) ? hit(15, `${l.category} is a type you sell to`) : miss(30, `${l.category || 'Unknown type'} is outside your types`);
  if (icp.countries.length) has(icp.countries, l.country) ? hit(5, `In ${l.country}`) : miss(40, `Outside your countries (${l.country || 'unknown'})`);
  if (icp.cities.length) has(icp.cities, l.city) ? hit(5, `In ${l.city}`) : miss(20, `Outside your cities`);
  if (l.rating != null) {
    if (l.rating < icp.minRating) miss(15, `Rating ${l.rating} is below ${icp.minRating}`);
    if (icp.maxRating < 5 && l.rating <= icp.maxRating) hit(10, `Rating ${l.rating} leaves room to improve`);
    if (icp.maxRating < 5 && l.rating > icp.maxRating) miss(10, `Rating ${l.rating} is already high`);
  }
  if (l.reviews != null) {
    if (l.reviews < icp.minReviews) miss(10, `Only ${l.reviews} reviews`);
    if (icp.maxReviews > 0 && l.reviews > icp.maxReviews) miss(15, `${l.reviews} reviews: likely too big for your offer`);
  }
  if (icp.needWebsite === 'with') l.website ? hit(5, 'Has a website') : miss(25, 'No website');
  if (icp.needWebsite === 'without') l.website ? miss(25, 'Already has a website') : hit(20, 'Has no website');
  if (icp.needEmail) l.email ? hit(5, 'Has an email address') : miss(20, 'No email address');
  if (icp.excludeChains && /\bchain\b/.test(l.tags ?? '')) miss(35, 'Part of a chain');
  const needs = (l.needs ?? '').toLowerCase();
  const matched = icp.needs.filter((n) => needs.includes(n.toLowerCase()) || (n === 'no website' && !l.website));
  if (icp.needs.length) matched.length ? hit(Math.min(30, matched.length * 10), `Needs what you offer: ${matched.join(', ')}`) : miss(10, 'No sign they need your offer yet');
  if (l.fit != null) rel = Math.round(rel * 0.7 + l.fit * 0.3);
  const relevance = Math.max(0, Math.min(100, Math.round(rel)));

  // Evidence: each fact counts only when we know where it came from.
  let ev = 0;
  const backing: string[] = [];
  let prov: any = {};
  try { prov = JSON.parse(l.provenance || '{}'); } catch { /* bad JSON */ }
  let audit: any = {};
  try { audit = JSON.parse(l.audit || '{}'); } catch { /* bad JSON */ }
  if (prov.listing?.source) { ev += 25; backing.push(`listing from ${prov.listing.source}`); }
  if (l.website && (prov.listing?.source || prov.website?.evidence)) { ev += 15; backing.push(prov.website?.evidence ? `website matched by ${prov.website.evidence}` : 'website from the listing'); }
  if (audit.facts) { ev += 20; backing.push('website checked'); }
  if (l.email && prov.emails?.[l.email]) { ev += 15; backing.push('email found on their site'); }
  if (l.email_status === 'verified') { ev += 15; backing.push('mailbox verified by a provider'); }
  else if (l.email_status === 'mx-ok') { ev += 5; backing.push('domain accepts mail'); }
  if (l.phone) { ev += 5; backing.push('phone listed'); }
  if (l.contact_name) { ev += 5; backing.push('named contact'); }
  const evidence = Math.min(100, ev);

  const grade = relevance >= 70 && evidence >= 50 ? 'A' : relevance >= 55 && evidence >= 30 ? 'B' : relevance >= 40 ? 'C' : 'D';
  const summary = grade === 'A' ? 'Strong match, well backed' : grade === 'B' ? 'Good match' : grade === 'C' ? 'Possible match, check first' : 'Poor match';
  return { relevance, evidence, grade, reasons: { summary, why: reasons, against: misses, backing } };
}

/** Email checks as separate statuses (QF-041). MX alone never means a mailbox exists. */
export const EMAIL_STATUS: Record<string, string> = {
  '': 'Not checked', 'bad-syntax': 'Not a valid address', 'no-mx': 'Domain does not accept mail', 'mx-ok': 'Domain accepts mail (mailbox not checked)',
  verified: 'Mailbox confirmed by a provider', invalid: 'Mailbox rejected by a provider', risky: 'Accept-all or risky (provider)', unknown: 'Provider could not tell', bounced: 'Bounced',
};
export const validSyntax = (e: string) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(e) && e.length <= 254 && !e.includes('..');

/** Original listing link for rechecks (QF-024). */
export function listingUrl(source: string, ref: string): string {
  if (!ref) return '';
  if (/^https?:\/\//.test(ref)) return ref;
  if (source === 'osm') { const [t, id] = ref.split('/'); return t && id ? `https://www.openstreetmap.org/${t}/${id}` : ''; }
  if (source === 'npi') return `https://npiregistry.cms.hhs.gov/provider-view/${ref.replace(/^npi:/, '')}`;
  if (source === 'wikidata') return `https://www.wikidata.org/wiki/${ref.replace(/^wd:/, '')}`;
  if (source === 'web') return `https://${ref}`;
  if (source === 'socrata' || source === 'arcgis') return ref.split('#')[0];
  return '';
}

/** Website technologies with the marker that proves each one (QF-027). */
const TECH: [string, string, RegExp][] = [
  ['WordPress', 'CMS', /wp-content|wp-includes/i], ['Wix', 'CMS', /static\.wixstatic\.com|wix\.com/i], ['Squarespace', 'CMS', /squarespace\.com|static1\.squarespace/i],
  ['Webflow', 'CMS', /webflow\.(com|io)|data-wf-page/i], ['Joomla', 'CMS', /\/media\/jui\/|joomla/i], ['Drupal', 'CMS', /drupal-settings-json|\/sites\/default\/files/i],
  ['GoDaddy Builder', 'CMS', /img1\.wsimg\.com|godaddy/i], ['Duda', 'CMS', /dudaone|multiscreensite/i], ['Weebly', 'CMS', /weebly\.com/i],
  ['Shopify', 'Shop', /cdn\.shopify\.com/i], ['WooCommerce', 'Shop', /woocommerce/i], ['BigCommerce', 'Shop', /bigcommerce\.com/i], ['Square Online', 'Shop', /square\.site|squareup\.com/i],
  ['Google Analytics 4', 'Analytics', /gtag\(['"]config['"],\s*['"]G-/i], ['Google Tag Manager', 'Analytics', /googletagmanager\.com\/gtm\.js/i], ['Universal Analytics (retired)', 'Analytics', /UA-\d{4,}-\d+/],
  ['Meta Pixel', 'Ads', /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(/i], ['Google Ads', 'Ads', /googleadservices|AW-\d{6,}/i], ['Hotjar', 'Analytics', /static\.hotjar\.com/i], ['Plausible', 'Analytics', /plausible\.io\/js/i],
  ['Calendly', 'Booking', /calendly\.com/i], ['Acuity', 'Booking', /acuityscheduling\.com/i], ['OpenTable', 'Booking', /opentable\.com/i], ['Booksy', 'Booking', /booksy\.com/i], ['Fresha', 'Booking', /fresha\.com/i],
  ['HubSpot', 'CRM', /js\.hs-scripts\.com|hubspot/i], ['Mailchimp', 'Email', /chimpstatic\.com|list-manage\.com/i], ['Intercom', 'Chat', /widget\.intercom\.io/i], ['Tawk.to', 'Chat', /embed\.tawk\.to/i], ['WhatsApp chat', 'Chat', /wa\.me\/|api\.whatsapp\.com\/send/i],
  ['Stripe', 'Payments', /js\.stripe\.com/i], ['PayPal', 'Payments', /paypal\.com\/sdk|paypalobjects/i], ['reCAPTCHA', 'Security', /google\.com\/recaptcha/i], ['Cloudflare', 'Hosting', /cdn-cgi\/|cloudflare/i], ['jQuery', 'Library', /jquery[.-]\d|jquery\.min\.js/i],
];
export function detectTech(html: string) {
  return TECH.filter(([, , re]) => re.test(html)).map(([name, kind, re]) => ({ name, kind, marker: (html.match(re)?.[0] ?? '').slice(0, 60) }));
}

/** Booking, menu and ordering links on a site (QF-023). */
export function actionLinks(links: { href: string; text: string }[]) {
  const out: Record<string, string> = {};
  for (const { href, text } of links) {
    const t = `${text} ${href}`.toLowerCase();
    if (!out.booking && /book (now|online|an? appointment)|appointment|reserv|calendly|acuity|opentable|booksy|fresha|setmore/.test(t)) out.booking = href;
    if (!out.menu && /\bmenu\b/.test(t)) out.menu = href;
    if (!out.order && /order (online|now|food)|doordash|ubereats|deliveroo|grubhub|just-?eat|toasttab/.test(t)) out.order = href;
  }
  return out;
}

/** What changed between two snapshots of a lead (QF-037, QF-025). */
export function diffSnapshot(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const k of ['rating', 'reviews', 'phone', 'email', 'website', 'address', 'status_open']) {
    const x = a[k] ?? null, y = b[k] ?? null;
    if (String(x ?? '') !== String(y ?? '') && !(x == null && y === '') && !(y == null && x === '')) out.push({ field: k, before: x, after: y });
  }
  return out;
}

/** Signals are signs, not proof (QF-038): a confidence label from how direct the evidence is. */
export function signalConfidence(type: string, detail = '') {
  if (['ssl', 'domain', 'site_down'].includes(type)) return 'high';
  if (type === 'hiring') return /careers|jobs page|vacanc/i.test(detail) ? 'medium' : 'low';
  if (type === 'new_listing') return 'medium';
  return 'medium';
}
