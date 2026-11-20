// Bridge to the app's background process. In a plain browser (design preview) a small demo dataset is used.
export type Lead = {
  id: number; created_at: string; name: string; category: string; address: string; city: string; region: string; country: string; postcode: string;
  lat: number | null; lon: number | null; phone: string; email: string; emails: string; website: string; domain: string; socials: string;
  rating: number | null; reviews: number | null; source: string; status: string; score: number | null; audit: string; tags: string; notes: string; enriched_at: string | null;
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
  tags: '', notes: '', enriched_at: domain ? new Date().toISOString() : null,
})) as Lead[];

async function mock(ch: string, args: unknown[]): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const data: Record<string, () => unknown> = {
    'app:info': () => ({ version: '0.1.0', platform: 'web', categories: [], providers: { none: {}, anthropic: { label: 'Anthropic Claude', keyed: true }, openai: { label: 'OpenAI', keyed: true }, ollama: { label: 'Ollama (on this computer, free)', keyed: false, local: true } } }),
    'settings:get': () => ({ theme: 'system', profile: { company: 'Nexonic Technologies', name: 'Shahrukh Khalid', title: 'Founder', website: 'nexonictechnologies.com', phone: '', address: '', services: 'Fast websites, SEO and Google Business Profile work for local businesses.', tone: 'friendly and professional', language: 'English' }, ai: { provider: 'none', model: '', baseUrl: '', apiKey: '' }, sources: { googleMaps: true, osm: true, places: false, placesKey: '', pagespeedKey: '', mapsDelayMs: 1600, maxPerSearch: 60 }, enrich: { auto: true, audit: false, pages: 3 }, email: { preset: 'gmail', fromName: '', fromEmail: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', imapOn: false, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: '', dailyLimit: 40, warmStart: 10, warmStep: 3, gapMinutes: 4, windowStart: 9, windowEnd: 17, weekdaysOnly: true, followups: [3, 7], unsubscribeLine: true }, whatsapp: { mode: 'assisted', cloudToken: '', phoneNumberId: '', defaultCountry: 'US' } }),
    stats: () => ({ total: 1284, withEmail: 702, withPhone: 1190, withWebsite: 941, sentToday: 12, drafts: 8, scheduled: 23, byStatus: { new: 1102, contacted: 140, replied: 21, interested: 9, won: 4 }, countries: [], categories: [] }),
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
  };
  return { ok: true, data: (data[ch] ?? (() => null))() };
}
