// Bridge to the app's background process. In a plain browser (design preview) a small demo dataset is used.
export type Lead = {
  id: number; created_at: string; name: string; category: string; address: string; city: string; region: string; country: string; postcode: string;
  lat: number | null; lon: number | null; phone: string; email: string; emails: string; website: string; domain: string; socials: string;
  rating: number | null; reviews: number | null; source: string; status: string; score: number | null; audit: string; tags: string; notes: string; enriched_at: string | null;
  contact_name?: string; contact_role?: string; email_status?: string; summary?: string; fit?: number | null; needs?: string;
};
export type Search = { id: number; created_at: string; category: string; place: string; sources: string; status: string; found: number; added: number; error: string };
export type Message = { id: number; lead_id: number; channel: string; step: number; subject: string; body: string; status: string; due_at: string | null; sent_at: string | null; error: string; lead_name?: string; lead_email?: string; lead_city?: string; lead_country?: string };

type Bridge = { call: (ch: string, ...a: unknown[]) => Promise<{ ok: boolean; data?: any; error?: string }>; on: (fn: (e: string, d: unknown) => void) => () => void; platform: string };
const bridge = (window as unknown as { quarrix?: Bridge }).quarrix;

export async function call<T = any>(ch: string, ...args: unknown[]): Promise<T> {
  const r = bridge ? await bridge.call(ch, ...args) : await mock(ch, args);
  if (!r.ok) throw new Error(r.error);
  return r.data as T;
}
export const onEvent = (fn: (e: string, d: unknown) => void) => (bridge ? bridge.on(fn) : () => undefined);
export const platform = bridge?.platform ?? 'web';
export const json = <T = any>(s: string | null | undefined, fallback: T): T => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

/* ---------- Demo data for the design preview ---------- */
const demoLeads: Lead[] = [
  ['Lakeside Dental Studio', 'Dentists', 'Austin', 'TX', 'US', 'lakesidedental.com', 'hello@lakesidedental.com', '+1 512 555 0142', 4.8, 212, 62, 'new'],
  ['Hill Country Smiles', 'Dentists', 'Austin', 'TX', 'US', 'hillcountrysmiles.com', 'frontdesk@hillcountrysmiles.com', '+1 512 555 0177', 4.6, 98, 41, 'contacted'],
  ['Barton Creek Orthodontics', 'Dentists', 'Austin', 'TX', 'US', 'bartoncreekortho.com', '', '+1 512 555 0110', 4.9, 341, 18, 'new'],
  ['Northside Family Dentistry', 'Dentists', 'Austin', 'TX', 'US', '', '', '+1 512 555 0193', 4.2, 57, null, 'new'],
  ['Mueller Dental Care', 'Dentists', 'Austin', 'TX', 'US', 'muellerdentalcare.com', 'info@muellerdentalcare.com', '+1 512 555 0126', 4.7, 140, 55, 'replied'],
  ['Copper Leaf Roofing', 'Roofers', 'Leeds', '', 'GB', 'copperleafroofing.co.uk', 'office@copperleafroofing.co.uk', '+44 113 496 0821', 4.9, 63, 70, 'interested'],
  ['Aire Valley Plumbing', 'Plumbers', 'Leeds', '', 'GB', 'airevalleyplumbing.co.uk', 'jobs@airevalleyplumbing.co.uk', '+44 113 496 0455', 4.5, 29, 35, 'new'],
  ['Kensington Law Partners', 'Lawyers', 'Toronto', 'ON', 'CA', 'kensingtonlaw.ca', 'contact@kensingtonlaw.ca', '+1 416 555 0188', 4.4, 41, 22, 'new'],
  ['Harbourfront Physio', 'Physiotherapists', 'Toronto', 'ON', 'CA', 'harbourfrontphysio.ca', 'book@harbourfrontphysio.ca', '+1 416 555 0164', 4.8, 187, 48, 'won'],
  ['Southbank Accounting', 'Accountants', 'Brisbane', 'QLD', 'AU', 'southbankaccounting.com.au', 'hello@southbankaccounting.com.au', '+61 7 5550 1234', 4.6, 22, 30, 'new'],
].map(([name, category, city, region, country, domain, email, phone, rating, reviews, score, status], i) => ({
  id: i + 1, created_at: new Date(Date.now() - i * 3600e3).toISOString(), name, category, address: `${100 + i * 7} Main Street`, city, region, country, postcode: '',
  lat: null, lon: null, phone, email, emails: JSON.stringify(email ? [email] : []), website: domain ? `https://${domain}` : '', domain,
  socials: JSON.stringify(i % 2 ? { facebook: 'https://facebook.com/x', instagram: 'https://instagram.com/x' } : { facebook: 'https://facebook.com/x' }),
  rating, reviews, source: i % 3 ? 'gmaps' : 'osm', status, score,
  audit: JSON.stringify(score ? { findings: ['Google PageSpeed mobile score is 31/100.', 'Not set up for phones (no mobile viewport).', 'The footer still says © 2019.'], facts: { platform: 'WordPress', https: true } } : {}),
  tags: '', notes: '', enriched_at: domain ? new Date().toISOString() : null, fit: domain ? Math.min(95, 30 + (score as number ?? 0)) : 88, needs: domain ? 'Redesign, Online booking' : 'Website',
})) as Lead[];

async function mock(ch: string, args: unknown[]): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const data: Record<string, () => unknown> = {
    'app:info': () => ({ version: '0.1.0', platform: 'web', categories: [], providers: { none: {}, anthropic: { label: 'Anthropic Claude', keyed: true }, openai: { label: 'OpenAI', keyed: true }, ollama: { label: 'Ollama (on this computer, free)', keyed: false, local: true } } }),
    'settings:get': () => ({ theme: 'system', profile: { company: 'Nexonic Technologies', name: 'Shahrukh Khalid', title: 'Founder', website: 'nexonictechnologies.com', phone: '', address: '', services: 'Fast websites, SEO and Google Business Profile work for local businesses.', tone: 'friendly and professional', language: 'English' }, ai: { provider: 'none', model: '', baseUrl: '', apiKey: '' }, sources: { googleMaps: true, osm: true, places: false, placesKey: '', pagespeedKey: '', mapsDelayMs: 1600, maxPerSearch: 60 }, enrich: { auto: true, audit: false, pages: 3 }, email: { preset: 'gmail', fromName: '', fromEmail: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', imapOn: false, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: '', dailyLimit: 40, warmStart: 10, warmStep: 3, gapMinutes: 4, windowStart: 9, windowEnd: 17, weekdaysOnly: true, followups: [3, 7], unsubscribeLine: true }, whatsapp: { mode: 'assisted', cloudToken: '', phoneNumberId: '', defaultCountry: 'US' } }),
    stats: () => ({ total: 1284, withEmail: 702, withPhone: 1190, withWebsite: 941, sentToday: 12, drafts: 8, scheduled: 23, byStatus: { new: 1102, contacted: 140, replied: 21, interested: 9, won: 4 }, countries: [], categories: [], perDay: [12, 30, 22, 48, 40, 61, 35, 70, 88, 64, 92, 110, 84, 126].map((n, i) => ({ d: '', leads: n, sent: Math.round(n / 6 + (i % 3) * 2) })) }),
    facets: () => ({ countries: ['AU', 'CA', 'GB', 'US'], categories: ['Accountants', 'Dentists', 'Lawyers', 'Physiotherapists', 'Plumbers', 'Roofers'] }),
    'search:list': () => [
      { id: 3, created_at: new Date().toISOString(), category: 'Dentists', place: 'Austin, Texas', sources: '["gmaps","osm"]', status: 'running', found: 38, added: 31, error: '' },
      { id: 2, created_at: new Date(Date.now() - 864e5).toISOString(), category: 'Roofers', place: 'Leeds', sources: '["gmaps"]', status: 'done', found: 54, added: 54, error: '' },
      { id: 1, created_at: new Date(Date.now() - 1728e5).toISOString(), category: 'Lawyers', place: 'Toronto', sources: '["osm"]', status: 'done', found: 47, added: 45, error: '' },
    ],
    'leads:query': () => ({ total: demoLeads.length, rows: demoLeads }),
    'leads:get': () => ({ lead: demoLeads.find((l) => l.id === args[0]) ?? demoLeads[0], messages: [], events: [] }),
    'messages:list': () => (args[0] === 'draft' ? demoLeads.slice(0, 3).map((l, i) => ({ id: i + 1, lead_id: l.id, channel: 'email', step: 0, subject: `${l.domain} on a phone`, body: `Hi ${l.name} team,\n\nI had a look at ${l.domain} on my phone this week…`, status: 'draft', due_at: null, sent_at: null, error: '', lead_name: l.name, lead_email: l.email, lead_city: l.city, lead_country: l.country })) : []),
    'dnc:list': () => [],
    'mail:cap': () => 16,
    'search:log': () => [{ at: new Date().toISOString(), msg: 'Google Maps: 118 places listed' }, { at: new Date().toISOString(), msg: '+ Lakeside Dental Studio' }, { at: new Date().toISOString(), msg: '+ Hill Country Smiles' }, { at: new Date().toISOString(), msg: 'Google Maps: area 3 of 42, Hyde Park' }],
    'campaigns:list': () => [{ id: 1, name: 'Dentists, USA', category: 'Dentists', places: JSON.stringify(['Austin, Texas', 'Dallas, Texas', 'Houston, Texas']), sources: '["gmaps","osm","web"]', daily: 20, auto_send: 1, enabled: 1, cursor: 2, last_run: new Date().toISOString(), leads: 412, with_email: 233, sent: 61, replies: 4 }],
    'messages:approveAll': () => 3,
    'jobs:saved': () => [],
    'signals:counts': () => [{ type: 'ssl', level: 'hot', n: 2, unseen: 2 }, { type: 'new_listing', level: 'hot', n: 3, unseen: 1 }],
    'watches:list': () => [{ id: 1, category: 'Dentists', place: 'Austin, Texas', every_days: 7, last_run: new Date().toISOString(), runs: 3, enabled: 1, found: 4 }],
    'signals:list': () => [
      ['new_listing', 'hot', 'Bright Smile Studio looks newly opened', 'Dentists in Austin, 2 reviews. New businesses need a website, branding and listings set up.', 'Bright Smile Studio', 7],
      ['site_down', 'hot', "Hill Country Smiles's website is down", 'hillcountrysmiles.com did not load (HTTP 503) on two tries. Every visitor right now sees an error.', 'Hill Country Smiles', 2],
      ['ssl', 'hot', "Mueller Dental Care's certificate expires in 9 days", 'On Sat Nov 29 2026 browsers will start showing "Not secure" on muellerdentalcare.com.', 'Mueller Dental Care', 5],
      ['hiring', 'hot', 'Copper Leaf Roofing is hiring for social media', 'They need this skill now. Offer to do it as a service, faster and cheaper than a hire.', 'Copper Leaf Roofing', 6],
      ['domain', 'warm', 'kensingtonlaw.ca expires in 41 days', 'If it is not renewed by Wed Dec 31 2026, the website and email stop working.', 'Kensington Law Partners', 8],
      ['reputation', 'warm', 'Northside Family Dentistry is rated 3.7★', '57 Google reviews. A rating under 4 loses customers; review management and a better site can turn it around.', 'Northside Family Dentistry', 4],
    ].map(([type, level, title, detail, name, lead_id], i) => ({ id: i + 1, lead_id, at: new Date(Date.now() - i * 4e6).toISOString(), type, level, title, detail, seen: i > 1 ? 1 : 0, name, category: 'Dentists', city: 'Austin', country: 'US', email: 'hello@example.com', website: 'https://example.com', domain: 'example.com' })),
    'dash:get': () => { const n = Number(args[0]) || 14; const days = Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10)); const w = (b: number, k: number) => days.map((_, i) => Math.max(0, Math.round(b + Math.sin(i / 2 + k) * b * 0.6 + i * b * 0.05))); return { days, series: { leads: w(40, 0), sent: w(12, 1), replies: w(2, 2), applied: w(3, 3) }, totals: { leads: 1284, leadsToday: 46, leadsWeek: 310, leadsPrevWeek: 240, withEmail: 702, verified: 610, shortlisted: 388, reports: 57, drafts: 8, scheduled: 23, sent: 214, sentToday: 12, sentWeek: 84, sentPrevWeek: 71, failed: 2, replies: 19, repliesWeek: 7, repliesPrevWeek: 5, contactedLeads: 160, won: 4, interested: 19, applied: 23, appliedWeek: 9, appliedPrevWeek: 6, campaigns: 2 }, jobStatus: { Saved: 14, Applied: 15, Interview: 5, Offer: 1, Rejected: 2 }, sources: [{ source: 'gmaps', n: 640 }, { source: 'osm', n: 280 }, { source: 'web', n: 190 }, { source: 'hotfrog', n: 110 }, { source: 'import', n: 64 }], categories: [{ category: 'Dentists', n: 320 }, { category: 'Clinics', n: 210 }, { category: 'Software company', n: 178 }, { category: 'Roofers', n: 90 }], countries: [{ country: 'US', n: 640 }, { country: 'GB', n: 300 }, { country: 'PK', n: 220 }, { country: 'CA', n: 124 }], running: [{ id: 1, category: 'Dentists', place: 'Austin, Texas', status: 'running', found: 38, added: 31 }], nextSend: { due_at: new Date(Date.now() + 36e5).toISOString(), name: 'Hill Country Smiles' }, activity: [{ id: 5, at: new Date(Date.now() - 6e4).toISOString(), type: 'reply', detail: 'Replied: Sounds good, can we talk Thursday?', name: 'Mueller Dental Care' }, { id: 4, at: new Date(Date.now() - 5e5).toISOString(), type: 'sent', detail: 'Email: quick idea for Lakeside Dental Studio', name: 'Lakeside Dental Studio' }, { id: 3, at: new Date(Date.now() - 9e5).toISOString(), type: 'report', detail: 'Proof report made: 58/100, #9 of 14 locally', name: 'Lakeside Dental Studio' }, { id: 2, at: new Date(Date.now() - 3e6).toISOString(), type: 'job_status', detail: 'Applied: Senior Frontend Developer at Northwind Labs', name: null }] }; },
    'proof:info': () => (args[0] === 1 ? { overall: 58, rank: 9, total: 14, at: new Date().toISOString(), desk: '', mob: '', steps: ['Rebuild the booking flow so patients can book in two taps on a phone.', 'Compress the hero images; the home page takes 4.2 s to load.', 'Ask recent patients for Google reviews to close the gap with the top three.'], cards: [{ label: 'Speed', score: 41, note: 'Loaded in 4.2s' }, { label: 'Mobile', score: 85, note: 'Set up for phones' }, { label: 'Security', score: 95, note: 'HTTPS' }, { label: 'Google visibility', score: 50, note: 'No search description' }, { label: 'Conversion', score: 40, note: 'Contact form' }] } : null),
    'jobs:detail': () => ({ text: 'Northwind Labs is a small product studio building tools for clinics. You will own our React front end and work closely with design. We use TypeScript, React, Node.js and PostgreSQL. You have 5+ years building web apps. You care about accessibility and performance. Remote within the UK, with a team day in London once a month.', seniority: 'Mid-Senior level', employment: 'Full-time', func: 'Engineering', industries: 'Software Development' }),
    'cv:get': () => ({ file: 'Shahrukh-Khalid-CV.pdf', analysedWith: 'claude-haiku-5-5', profile: { name: 'Shahrukh Khalid', title: 'Full-stack Web Developer', years: 7, level: 'Senior', skills: ['React', 'TypeScript', 'Node.js', 'WordPress', 'Next.js', 'Figma', 'SEO', 'AWS', 'Tailwind', 'PostgreSQL'], roles: ['Full-stack developer', 'React developer', 'WordPress developer'], locations: ['Islamabad'], summary: '' } }),
    'jobs:match': () => ({ j0: { match: 91, why: 'React, TypeScript and senior level match' }, j1: { match: 84, why: 'Strong WordPress experience' }, j2: { match: 76, why: 'Matches web stack' }, j3: { match: 38, why: 'Junior role, design focus' }, j4: { match: 62, why: 'Shopify not on CV' } }),
    'geo:cities': () => ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow'],
    'jobs:search': () => ({ errors: [], jobs: [
      ['Senior Frontend Developer (React)', 'Northwind Labs', 'Remote, UK', 'remote', 'Full-time', 'Senior', 'GBP 70k–90k', 'LinkedIn', 1],
      ['WordPress Developer', 'Bright Pixel Studio', 'London, United Kingdom', 'hybrid', 'Contract', 'Mid level', '', 'LinkedIn', 2],
      ['Web Developer', 'Acme Health', 'Worldwide', 'remote', 'Full-time', 'Mid level', 'USD 60k–80k', 'Remotive', 3],
      ['Junior Web Designer', 'Kite & Co', 'London', 'onsite', 'Full-time', 'Entry level', '', 'Arbeitnow', 5],
      ['Need a Shopify developer for a store redesign', 'u/sarah_builds', 'Remote', 'remote', 'Contract', 'Mid level', '$1,500', 'Reddit', 1],
    ].map(([title, company, location, workplace, type, level, salary, source, d], i) => ({ id: 'j' + i, title, company, location, workplace, type, level, salary, source, url: 'https://example.com', posted: new Date(Date.now() - (d as number) * 864e5).toISOString(), tags: [], snippet: 'We are looking for a developer to join our small product team and help build fast, accessible websites.' })) }),
  };
  return { ok: true, data: (data[ch] ?? (() => null))() };
}
