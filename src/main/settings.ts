// Settings stored as JSON in the app folder. Passwords and API keys are encrypted with the OS keychain (safeStorage).
import { DEFAULT_ICP, type Icp } from './intel';
import type { OpenFeed } from './sources/opendata';
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Provider = 'none' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'groq' | 'ollama' | 'lmstudio' | 'custom';

export type Mailbox = {
  id: string; label: string; kind: 'smtp' | 'google' | 'microsoft' | 'sendgrid'; on: boolean; fromName: string; fromEmail: string;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string;
  imapOn: boolean; imapHost: string; imapPort: number; imapUser: string; imapPass: string;
  oauthRefresh: string; sendgridKey: string; dailyLimit: number; authorizedAt: string; authorizedFrom: string;
};
/** Secret fields inside each extra mailbox (encrypted like the other secrets). */
export const BOX_SECRETS = ['smtpPass', 'imapPass', 'oauthRefresh', 'sendgridKey'] as const;

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  profile: { skills: string; company: string; name: string; title: string; website: string; phone: string; address: string; services: string; tone: string; language: string };
  ai: { provider: Provider; model: string; baseUrl: string; apiKey: string };
  sources: { googleMaps: boolean; osm: boolean; places: boolean; placesKey: string; pagespeedKey: string; mapsDelayMs: number; maxPerSearch: number; adzunaId: string; adzunaKey: string; joobleKey: string; tomtomKey: string; foursquareKey: string };
  enrich: { auto: boolean; audit: boolean; pages: number };
  email: {
    preset: 'gmail' | 'outlook' | 'custom'; fromName: string; fromEmail: string;
    smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string;
    imapOn: boolean; imapHost: string; imapPort: number; imapUser: string; imapPass: string;
    dailyLimit: number; warmStart: number; warmStep: number; gapMinutes: number;
    windowStart: number; windowEnd: number; weekdaysOnly: boolean; followups: number[]; unsubscribeLine: boolean; attachReport: boolean;
    auth: 'password' | 'google' | 'microsoft'; oauthClientId: string; oauthClientSecret: string; oauthRefresh: string; oauthUser: string;
    /** Set when the user confirms they may send from this identity (QF-066). Sending stays off until then. */
    authorizedAt: string; authorizedFrom: string;
    recontactDays: number; bouncePct: number; pausedReason: string; senderTimezone: string;
    abTest: boolean; abSubjectB: string;
  };
  whatsapp: { mode: 'assisted' | 'cloud'; cloudToken: string; phoneNumberId: string; defaultCountry: string; authorizedAt: string };
  signals: { on: boolean; everyDays: number; perRun: number };
  /** Daily request ceilings per source; 0 = no limit. */
  budgets: Record<string, number>;
  openFeeds: OpenFeed[];
  npiIndividuals: boolean;
  findWebsites: boolean;
  icp: Icp;
  /** Optional mailbox verification and email finding (QF-031, QF-039, QF-042). */
  verify: { provider: 'none' | 'hunter' | 'zerobounce'; hunterKey: string; zerobounceKey: string; auto: boolean; maxPerDay: number; findWithHunter: boolean };
  /** Re-check leads whose data is older than this many days (QF-030). */
  freshDays: number;
  jobs: { hideCompanies: string[]; preferCompanies: string[]; hideRecruiters: boolean };
  crm: { stages: { key: string; label: string; probability: number }[]; currency: string };
  automations: import('./automation').Rule[];
  webhooks: { url: string; events: string[]; secret: string; on: boolean }[];
  api: { on: boolean; port: number; token: string; captureToken: string };
  hubspot: { token: string };
  notion: { token: string; databaseId: string };
  sheets: { spreadsheetId: string; refresh: string; user: string };
  /** First-launch setup done (QF-114) and which side of the app to show (QF-116). */
  /** Extra sending mailboxes (QF-061); the main mailbox stays in "email". */
  mailboxes: Mailbox[];
  /** Email-finding order (QF-031). */
  waterfall: { order: ('website' | 'hunter')[]; stopOnFirst: boolean };
  /** Client workspaces (QF-056): new leads are filed under the current client. */
  language: string;
  clients: string[];
  exports: { postgres: { url: string; table: string; allowSelfSigned: boolean }; s3: { endpoint: string; region: string; bucket: string; prefix: string; accessKey: string; secretKey: string } };
  currentClient: string;
  onboarded: boolean;
  workspace: 'both' | 'business' | 'career';
};

export const SECRET_PATHS = ['ai.apiKey', 'sources.placesKey', 'sources.pagespeedKey', 'email.smtpPass', 'email.imapPass', 'whatsapp.cloudToken', 'sources.adzunaKey', 'sources.joobleKey', 'sources.tomtomKey', 'sources.foursquareKey', 'verify.hunterKey', 'verify.zerobounceKey', 'email.oauthRefresh', 'email.oauthClientSecret', 'api.token', 'api.captureToken', 'hubspot.token', 'notion.token', 'sheets.refresh', 'exports.postgres.url', 'exports.s3.secretKey'] as const;

export const defaults: Settings = {
  theme: 'light',
  profile: { skills: '', company: '', name: '', title: '', website: '', phone: '', address: '', services: '', tone: 'friendly and professional', language: 'English' },
  ai: { provider: 'none', model: '', baseUrl: '', apiKey: '' },
  sources: { googleMaps: true, osm: true, places: false, placesKey: '', pagespeedKey: '', mapsDelayMs: 1400, maxPerSearch: 0, adzunaId: '', adzunaKey: '', joobleKey: '', tomtomKey: '', foursquareKey: '' },
  enrich: { auto: true, audit: false, pages: 3 },
  email: {
    preset: 'gmail', fromName: '', fromEmail: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '',
    imapOn: false, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: '',
    dailyLimit: 40, warmStart: 10, warmStep: 3, gapMinutes: 4, windowStart: 9, windowEnd: 17, weekdaysOnly: true, followups: [3, 7], unsubscribeLine: true, attachReport: false,
    auth: 'password', oauthClientId: '', oauthClientSecret: '', oauthRefresh: '', oauthUser: '', authorizedAt: '', authorizedFrom: '', recontactDays: 90, bouncePct: 5, pausedReason: '', senderTimezone: '', abTest: false, abSubjectB: '',
  },
  whatsapp: { mode: 'assisted', cloudToken: '', phoneNumberId: '', defaultCountry: 'US', authorizedAt: '' },
  signals: { on: true, everyDays: 7, perRun: 30 },
  budgets: { places: 200, tomtom: 2000, foursquare: 500, gmaps: 0, osm: 0, web: 0, dir: 0, npi: 0, wikidata: 0, opendata: 0, posts: 0, hunter: 25, zerobounce: 50 },
  openFeeds: [],
  npiIndividuals: false,
  findWebsites: true,
  icp: DEFAULT_ICP,
  verify: { provider: 'none', hunterKey: '', zerobounceKey: '', auto: false, maxPerDay: 50, findWithHunter: false },
  freshDays: 90,
  jobs: { hideCompanies: [], preferCompanies: [], hideRecruiters: false },
  crm: { stages: [], currency: 'USD' },
  automations: [],
  webhooks: [],
  api: { on: false, port: 47811, token: '', captureToken: '' },
  hubspot: { token: '' },
  notion: { token: '', databaseId: '' },
  sheets: { spreadsheetId: '', refresh: '', user: '' },
  mailboxes: [],
  waterfall: { order: ['website', 'hunter'], stopOnFirst: true },
  language: 'en',
  clients: [],
  exports: { postgres: { url: '', table: 'quarrix_leads', allowSelfSigned: false }, s3: { endpoint: '', region: 'us-east-1', bucket: '', prefix: 'quarrix/', accessKey: '', secretKey: '' } },
  currentClient: '',
  onboarded: false,
  workspace: 'both',
};

const file = () => join(app.getPath('userData'), 'settings.json');
let cache: Settings | null = null;

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, v) : v;
  }
  return out as T;
}

const get = (o: Record<string, any>, p: string): any => p.split('.').reduce<any>((a, k) => (a ? a[k] : undefined), o);
const set = (o: Record<string, any>, p: string, v: unknown) => {
  const ks = p.split('.');
  const last = ks.pop()!;
  ks.reduce((a, k) => a[k], o)[last] = v;
};

/** True when the OS keychain can protect secrets. Without it, secrets stay in memory for this session only and are never written in plain text. */
export const secureStore = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
const enc = (s: string) => (s && secureStore() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : '');
const dec = (s: string) => {
  if (!s?.startsWith('enc:')) return s || '';
  try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); } catch { return ''; }
};

export function load(): Settings {
  if (cache) return cache;
  let stored: unknown = {};
  if (existsSync(file())) {
    try { stored = JSON.parse(readFileSync(file(), 'utf8')); } catch { stored = {}; }
  }
  const s = deepMerge(structuredClone(defaults), stored);
  if (s.sources.maxPerSearch === 60 || s.sources.maxPerSearch === 500) s.sources.maxPerSearch = 0; // old defaults; 0 means no limit
  s.theme = 'light';
  for (const p of SECRET_PATHS) set(s, p, dec(get(s, p)));
  s.mailboxes = (s.mailboxes ?? []).map((b) => ({ ...b, ...Object.fromEntries(BOX_SECRETS.map((k) => [k, dec(b[k])])) }));
  cache = s;
  return s;
}

export function save(patch: unknown): Settings {
  const s = deepMerge(load(), patch);
  cache = s;
  const out = structuredClone(s) as Record<string, any>;
  for (const p of SECRET_PATHS) set(out, p, enc(get(out, p)));
  out.mailboxes = (out.mailboxes ?? []).map((b: Mailbox) => ({ ...b, ...Object.fromEntries(BOX_SECRETS.map((k) => [k, enc(b[k])])) }));
  writeFileSync(file(), JSON.stringify(out, null, 2));
  return s;
}

/** Settings for the interface: secrets are replaced by a flag saying whether they are set. */
export function publicSettings() {
  const s = structuredClone(load()) as Record<string, any>;
  for (const p of SECRET_PATHS) set(s, p, get(s, p) ? '••••••••' : '');
  s.mailboxes = (s.mailboxes ?? []).map((b: Mailbox) => ({ ...b, ...Object.fromEntries(BOX_SECRETS.map((k) => [k, b[k] ? '••••••••' : ''])) }));
  s.secretsSessionOnly = !secureStore();
  return s as Settings;
}

/** Save from the interface: a masked secret means "keep the stored one". */
export function saveFromUi(patch: Record<string, any>) {
  const p = structuredClone(patch);
  for (const path of SECRET_PATHS) {
    const v = get(p, path);
    if (v === '••••••••') set(p, path, get(load() as Record<string, any>, path));
  }
  // Fields only the main process may change: sending approval, the safety pause and the OAuth session.
  if (p.email) for (const k of ['authorizedAt', 'authorizedFrom', 'pausedReason', 'oauthRefresh', 'oauthUser', 'auth']) delete p.email[k];
  if (p.whatsapp) delete p.whatsapp.authorizedAt;
  if (Array.isArray(p.mailboxes)) {
    const old = load().mailboxes;
    p.mailboxes = p.mailboxes.map((b: Mailbox) => {
      const prev = old.find((x) => x.id === b.id);
      const keep = Object.fromEntries(BOX_SECRETS.map((k) => [k, b[k] === '••••••••' ? prev?.[k] ?? '' : b[k]]));
      // Approval and OAuth tokens are set only by the main process.
      return { ...b, ...keep, oauthRefresh: prev?.oauthRefresh ?? '', authorizedAt: prev?.authorizedAt ?? '', authorizedFrom: prev?.authorizedFrom ?? '' };
    });
  }
  save(p);
  return publicSettings();
}
