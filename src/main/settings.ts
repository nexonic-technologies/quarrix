// Settings stored as JSON in the app folder. Passwords and API keys are encrypted with the OS keychain (safeStorage).
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Provider = 'none' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'groq' | 'ollama' | 'lmstudio' | 'custom';

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  profile: { skills: string; company: string; name: string; title: string; website: string; phone: string; address: string; services: string; tone: string; language: string };
  ai: { provider: Provider; model: string; baseUrl: string; apiKey: string };
  sources: { googleMaps: boolean; osm: boolean; places: boolean; placesKey: string; pagespeedKey: string; mapsDelayMs: number; maxPerSearch: number; adzunaId: string; adzunaKey: string; joobleKey: string };
  enrich: { auto: boolean; audit: boolean; pages: number };
  email: {
    preset: 'gmail' | 'outlook' | 'custom'; fromName: string; fromEmail: string;
    smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPass: string;
    imapOn: boolean; imapHost: string; imapPort: number; imapUser: string; imapPass: string;
    dailyLimit: number; warmStart: number; warmStep: number; gapMinutes: number;
    windowStart: number; windowEnd: number; weekdaysOnly: boolean; followups: number[]; unsubscribeLine: boolean;
  };
  whatsapp: { mode: 'assisted' | 'cloud'; cloudToken: string; phoneNumberId: string; defaultCountry: string };
};

export const SECRET_PATHS = ['ai.apiKey', 'sources.placesKey', 'sources.pagespeedKey', 'email.smtpPass', 'email.imapPass', 'whatsapp.cloudToken', 'sources.adzunaKey', 'sources.joobleKey'] as const;

export const defaults: Settings = {
  theme: 'light',
  profile: { skills: '', company: '', name: '', title: '', website: '', phone: '', address: '', services: '', tone: 'friendly and professional', language: 'English' },
  ai: { provider: 'none', model: '', baseUrl: '', apiKey: '' },
  sources: { googleMaps: true, osm: true, places: false, placesKey: '', pagespeedKey: '', mapsDelayMs: 1400, maxPerSearch: 0, adzunaId: '', adzunaKey: '', joobleKey: '' },
  enrich: { auto: true, audit: false, pages: 3 },
  email: {
    preset: 'gmail', fromName: '', fromEmail: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '',
    imapOn: false, imapHost: 'imap.gmail.com', imapPort: 993, imapUser: '', imapPass: '',
    dailyLimit: 40, warmStart: 10, warmStep: 3, gapMinutes: 4, windowStart: 9, windowEnd: 17, weekdaysOnly: true, followups: [3, 7], unsubscribeLine: true,
  },
  whatsapp: { mode: 'assisted', cloudToken: '', phoneNumberId: '', defaultCountry: 'US' },
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

const enc = (s: string) => (s && safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : s);
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
  cache = s;
  return s;
}

export function save(patch: unknown): Settings {
  const s = deepMerge(load(), patch);
  cache = s;
  const out = structuredClone(s) as Record<string, any>;
  for (const p of SECRET_PATHS) set(out, p, enc(get(out, p)));
  writeFileSync(file(), JSON.stringify(out, null, 2));
  return s;
}

/** Settings for the interface: secrets are replaced by a flag saying whether they are set. */
export function publicSettings() {
  const s = structuredClone(load()) as Record<string, any>;
  for (const p of SECRET_PATHS) set(s, p, get(s, p) ? '••••••••' : '');
  return s as Settings;
}

/** Save from the interface: a masked secret means "keep the stored one". */
export function saveFromUi(patch: Record<string, any>) {
  const p = structuredClone(patch);
  for (const path of SECRET_PATHS) {
    const v = get(p, path);
    if (v === '••••••••') set(p, path, get(load() as Record<string, any>, path));
  }
  save(p);
  return publicSettings();
}
