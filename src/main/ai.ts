// Any model the person chooses: cloud providers with their own key, or local models (Ollama, LM Studio) with no key.
// With no model set, built-in templates are used.
import type { Lead } from './db';
import type { Settings } from './settings';
import { reportFact } from './proof';
import { signalFact } from './signals';
import { fetchTrusted } from './util';

export const PROVIDERS: Record<string, { label: string; base: string; keyed: boolean; local?: boolean; suggest: string }> = {
  anthropic: { label: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', keyed: true, suggest: 'claude-haiku-5-5' },
  openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', keyed: true, suggest: 'gpt-5-mini' },
  gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', keyed: true, suggest: 'gemini-2.5-flash' },
  openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyed: true, suggest: '' },
  groq: { label: 'Groq', base: 'https://api.groq.com/openai/v1', keyed: true, suggest: '' },
  ollama: { label: 'Ollama (on this computer, free)', base: 'http://localhost:11434/v1', keyed: false, local: true, suggest: 'llama3.2' },
  lmstudio: { label: 'LM Studio (on this computer, free)', base: 'http://localhost:1234/v1', keyed: false, local: true, suggest: '' },
  custom: { label: 'Other (OpenAI-compatible)', base: '', keyed: true, suggest: '' },
};

type Ai = Settings['ai'];
const base = (ai: Ai) => (ai.baseUrl || PROVIDERS[ai.provider]?.base || '').replace(/\/+$/, '');

// Model choice and automatic switching (0.24).
// - OpenRouter with an empty Model: every free model, best first. A chosen model is tried first, then the free ones.
// - Other providers: the chosen (or suggested) model, then the provider's other models when its quota or rate limit is hit.
// - Then each backup key in Settings → Writing, in order. A model that ran out is rested for a while and skipped.
const FREE_PREFS = ['deepseek/deepseek-chat-v3', 'meta-llama/llama-3.3-70b-instruct', 'google/gemma-3-27b-it', 'qwen/qwen3', 'mistralai/mistral-small'];
/** Free models in preference order. Pure, exported for tests. */
export function rankFree(ids: string[]) {
  const free = ids.filter((m) => m.endsWith(':free'));
  const score = (m: string) => { const i = FREE_PREFS.findIndex((p) => m.startsWith(p)); return i < 0 ? 99 : i; };
  return free.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}
/** Errors that mean "this model or key is out of quota, rate-limited, unpaid or busy right now": try the next one. Pure. */
export function isQuotaError(e: unknown) {
  const st = Number((e as any)?.status) || 0;
  const m = String((e as any)?.message ?? e);
  return [402, 408, 409, 425, 429, 500, 502, 503, 504, 529].includes(st)
    || /quota|rate.?limit|too many requests|credit|billing|payment|insufficient|exceeded|exhausted|overloaded|capacity|unavailable|temporarily|no endpoints|not a valid model|model.*(not found|does not exist|disabled)|requires.*(paid|upgrade)|abort|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|empty answer/i.test(m);
}
const rested = new Map<string, number>();
const restKey = (ai: Ai, model: string) => `${ai.provider}|${ai.apiKey.slice(-6)}|${model}`;
/** Tests only. */
export const resetRest = () => rested.clear();
const listCache = new Map<string, string[]>();
async function cachedList(ai: Ai) {
  const k = `${ai.provider}|${ai.baseUrl}|${ai.apiKey}`;
  if (!listCache.has(k)) listCache.set(k, await listModels(ai).catch(() => []));
  return listCache.get(k)!;
}
/** Other models of the same provider worth trying when the chosen one runs out. Pure, exported for tests. */
export function alternates(provider: string, ids: string[], chosen: string) {
  if (provider === 'openrouter') return rankFree(ids).filter((m) => m !== chosen);
  if (provider === 'gemini') return ids.filter((m) => /flash|gemma/i.test(m) && !/image|tts|audio|live|embedding|vision/i.test(m) && m !== chosen).slice(0, 6);
  if (provider === 'groq') return ids.filter((m) => !/whisper|guard|tts|embed/i.test(m) && m !== chosen).slice(0, 6);
  return [];
}
async function modelsToTry(ai: Ai): Promise<string[]> {
  const chosen = ai.model || PROVIDERS[ai.provider]?.suggest || '';
  const keyless = PROVIDERS[ai.provider]?.local || ai.provider === 'custom';
  const more = !keyless && (ai.apiKey || !PROVIDERS[ai.provider]?.keyed) ? alternates(ai.provider, await cachedList(ai), chosen) : [];
  const all = [...(chosen ? [chosen] : []), ...more];
  const now = Date.now();
  const ready = all.filter((m) => (rested.get(restKey(ai, m)) ?? 0) <= now);
  return (ready.length ? ready : all).slice(0, 12);
}
/** The main model and then each backup key, as separate model settings. */
export function chain(ai: Ai, backups: Record<string, string> = {}): Ai[] {
  const out: Ai[] = ai.provider === 'none' ? [] : [ai];
  for (const [provider, apiKey] of Object.entries(backups)) {
    if (!apiKey || !PROVIDERS[provider]?.keyed || provider === 'custom' || (provider === ai.provider && apiKey === ai.apiKey)) continue;
    out.push({ provider: provider as Ai['provider'], apiKey, model: '', baseUrl: '' });
  }
  return out;
}
/** The model Quarrix will use first, for the settings screen. */
export async function effectiveModel(ai: Ai) { return (await modelsToTry(ai))[0] ?? ''; }

let backupKeys: () => Record<string, string> = () => ({});
/** Set by the main process so complete() can reach the backup keys without importing settings here. */
export const useBackups = (f: () => Record<string, string>) => { backupKeys = f; };

export async function complete(ai: Ai, system: string, prompt: string, maxTokens = 1500): Promise<string> {
  if (ai.provider === 'none') throw new Error('No writing model is set. Choose one in Settings → Writing.');
  let last: unknown = null, tried = 0;
  for (const one of chain(ai, backupKeys())) {
    const models = await modelsToTry(one);
    for (const model of models) {
      tried++;
      try { return await completeWith(one, model, system, prompt, maxTokens); } catch (e) {
        last = e;
        if (!isQuotaError(e)) { if (one === ai) throw e; break; }
        // Rest a model that ran out: an hour for quota and billing, five minutes for a busy model.
        rested.set(restKey(one, model), Date.now() + (/quota|credit|billing|payment|insufficient|exhausted/i.test(String((e as any)?.message)) || (e as any)?.status === 402 ? 36e5 : 3e5));
      }
    }
  }
  if (!tried) throw new Error('Choose a model in Settings → Writing.');
  const msg = String((last as any)?.message ?? last);
  throw new Error(tried > 1 ? `Every model and key Quarrix tried is out of quota or busy (${tried} tried). Last answer: ${msg}` : msg);
}

const parseBody = (t: string): any => { try { return JSON.parse(t || '{}'); } catch { return { error: { message: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) } }; } };
const fail = (r: { status: number }, j: any) => Object.assign(new Error(j?.error?.message ?? (typeof j?.error === 'string' ? j.error : `HTTP ${r.status}`)), { status: r.status });

async function completeWith(ai: Ai, model: string, system: string, prompt: string, maxTokens: number): Promise<string> {
  if (ai.provider === 'anthropic') {
    const r = await fetchTrusted(`${base(ai)}/messages`, {
      method: 'POST', timeout: 90000,
      headers: { 'content-type': 'application/json', 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = parseBody(r.text);
    if (!r.ok) throw fail(r, j);
    return (j.content ?? []).map((c: any) => c.text ?? '').join('');
  }
  if (ai.provider === 'gemini') {
    const r = await fetchTrusted(`${base(ai)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
      method: 'POST', timeout: 90000, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
    });
    const j = parseBody(r.text);
    if (!r.ok) throw fail(r, j);
    return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  }
  const r = await fetchTrusted(`${base(ai)}/chat/completions`, {
    method: 'POST', timeout: 120000,
    headers: { 'content-type': 'application/json', ...(ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {}) },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  }).catch((e) => {
    if (PROVIDERS[ai.provider]?.local) throw new Error(`${PROVIDERS[ai.provider].label.split(' (')[0]} is not running on this computer. Start it and try again.`);
    throw e;
  });
  const j = parseBody(r.text);
  if (!r.ok || j.error) throw fail(r, j);
  const text = j.choices?.[0]?.message?.content ?? '';
  if (!String(text).trim()) throw Object.assign(new Error('The model sent an empty answer.'), { status: 503 });
  return text;
}

export async function listModels(ai: Ai): Promise<string[]> {
  if (ai.provider === 'anthropic') {
    const r = await fetchTrusted(`${base(ai)}/models?limit=100`, { headers: { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01' } });
    return (JSON.parse(r.text).data ?? []).map((m: any) => m.id);
  }
  if (ai.provider === 'gemini') {
    const r = await fetchTrusted(`${base(ai)}/models?key=${encodeURIComponent(ai.apiKey)}`);
    return (JSON.parse(r.text).models ?? []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent')).map((m: any) => m.name.replace('models/', ''));
  }
  const r = await fetchTrusted(`${base(ai)}/models`, { headers: ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {} });
  return (JSON.parse(r.text).data ?? []).map((m: any) => m.id).sort();
}

export function parseJson(text: string): any {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

export type Draft = { subject: string; body: string; followups: string[]; whatsapp: string };

const BANNED = /\b(AI|A\.I\.|artificial intelligence|chatbot|bot|automated|ChatGPT|Claude|GPT|language model)\b|I hope this (email|message) finds you|I came across|guarantee|100%|act now|limited time|click here|dear sir|to whom it may concern/i;

function leadFacts(l: Lead) {
  const audit = safe(l.audit);
  const socials = Object.keys(safe(l.socials));
  return [
    `Business: ${l.name}`, `Type: ${l.category}`, `Location: ${[l.city, l.region, l.country].filter(Boolean).join(', ')}`,
    l.website ? `Website: ${l.domain || l.website}` : 'Website: none found',
    l.contact_name && !l.contact_name.startsWith('u/') ? `Owner or decision maker: ${l.contact_name}${l.contact_role ? ` (${l.contact_role})` : ''}` : '',
    l.summary ? `About them: ${l.summary.slice(0, 600)}` : '',
    reportFact(l.id),
    signalFact(l.id),
    l.rating ? `Google rating: ${l.rating} (${l.reviews ?? 0} reviews)` : '',
    socials.length ? `Social profiles: ${socials.join(', ')}` : 'Social profiles: none found',
    ...(audit.findings ?? []).map((f: string) => `Finding: ${f}`),
  ].filter(Boolean).join('\n');
}

export const safe = (s: string) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

export async function draftFor(settings: Settings, lead: Lead, steps: number): Promise<Draft> {
  const p = settings.profile;
  if (settings.ai.provider === 'none') return templateDraft(settings, lead, steps);
  const system = `You write short, personal outreach emails for ${p.name || 'the sender'}${p.title ? `, ${p.title}` : ''} at ${p.company || 'their company'}.\n`
    + `What they offer:\n${p.services || '(not described)'}\n\n`
    + `Voice: ${p.tone || 'friendly and professional'}. Language: ${p.language || 'English'}. Plain text, short sentences, no bullet lists, no links, no exclamation marks, no emojis, no prices.\n`
    + 'Rules:\n1. Use only the facts given. Never invent numbers, names, reviews or results.\n'
    + '2. Never mention AI, bots, automation, scraping, lists or databases.\n'
    + '3. Open with something specific to this business, then one clear benefit of the offer that fits their type of business, then one low-effort question (a reply or a 15-minute call).\n'
    + '4. Greeting: a first name only if the facts name the owner; otherwise "Hi [Business] team".\n'
    + `5. Subject: 2-6 words, specific, no "free", no "!", no all caps.\n6. Email: 60-120 words. Each follow-up: 25-60 words, a new angle, same thread.\n7. Do not add a signature; it is added automatically. End with a short sign-off word on its own line.\n`
    + `Return one JSON object only: {"subject":"...","body":"...","followups":[${Array.from({ length: steps }, () => '"..."').join(',')}],"whatsapp":"a 1-2 sentence WhatsApp version"}`;
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(settings.ai, system, `${leadFacts(lead)}${last ? `\n\nYour last draft broke a rule (${last}). Rewrite it.` : ''}`, 1600);
    const j = parseJson(text);
    if (!j?.subject || !j?.body) { last = 'it was not valid JSON'; continue; }
    const d: Draft = { subject: String(j.subject).trim(), body: String(j.body).trim(), followups: (j.followups ?? []).map(String).slice(0, steps), whatsapp: String(j.whatsapp ?? '').trim() };
    const all = [d.subject, d.body, ...d.followups, d.whatsapp].join('\n');
    const bad = all.match(BANNED);
    if (bad) { last = `it used "${bad[0]}"`; continue; }
    return d;
  }
  throw new Error(`The model's draft did not pass the checks (${last}).`);
}

/** Works with no model at all: fills a clean template with the lead's facts. */
export function templateDraft(settings: Settings, lead: Lead, steps: number): Draft {
  const p = settings.profile;
  const finding = (safe(lead.audit).findings ?? [])[0] as string | undefined;
  const offer = (p.services || 'help businesses like yours get more customers').split(/[.\n]/)[0].trim();
  const first = lead.contact_name && !lead.contact_name.startsWith('u/') ? lead.contact_name.replace(/^Dr\.?\s/, '').split(' ')[0] : '';
  const greet = first ? `Hi ${first},` : `Hi ${lead.name} team,`;
  const opener = finding
    ? `I had a look at ${lead.domain || 'your website'} and noticed one thing worth fixing: ${finding.charAt(0).toLowerCase() + finding.slice(1)}`
    : `I came across ${lead.name} while looking at ${lead.category.toLowerCase() || 'businesses'} in ${lead.city || 'your area'}.`;
  const body = `${greet}\n\n${opener.replace('I came across', 'I found')}\n\nAt ${p.company || 'our studio'} we ${offer.charAt(0).toLowerCase() + offer.slice(1)}. If it would help, I can send a few specific ideas for ${lead.name}. Would that be useful?\n\nThanks,`;
  const followups = [
    `${greet}\n\nJust bringing this back to the top of your inbox. Happy to send the ideas for ${lead.name} if useful.\n\nBest,`,
    `${greet}\n\nI won't keep writing. If it ever becomes a priority, reply to this email and I'll pick it up.\n\nBest,`,
  ].slice(0, steps);
  return { subject: `quick idea for ${lead.name}`.slice(0, 60), body, followups, whatsapp: `Hi, this is ${p.name || p.company}. ${opener.replace('I came across', 'I found')} Could I send you a couple of ideas?` };
}

export function signature(s: Settings) {
  const p = s.profile;
  return [p.name, [p.title, p.company].filter(Boolean).join(', '), p.website?.replace(/^https?:\/\//, ''), p.phone].filter(Boolean).join('\n');
}

export const NEEDS = ['Website', 'Redesign', 'SEO', 'Graphic design', 'Branding', 'Social media', 'Online booking', 'Mobile app', 'Google reviews'];

/** With a model set up: read the website text, find the decision maker, and judge how much this business needs what you offer. */
export async function research(settings: Settings, lead: Lead, siteText: string): Promise<{ contact_name: string; contact_role: string; summary: string; fit: number; needs: string[] }> {
  const offer = settings.profile.services || 'websites, graphic design and online marketing for small businesses';
  const system = 'You assess small businesses as potential clients. Use only the facts given; if a fact is missing, leave it empty. Never guess names.\n'
    + `The sender offers: ${offer}\n`
    + `Return one JSON object: {"contact_name":"owner, founder or most senior named person, full name","contact_role":"their role as written","summary":"2 sentences: what they do and the most visible gap","needs":[up to 3 from ${JSON.stringify(NEEDS)}],"fit":0-100}\n`
    + 'fit = how likely they need and would pay for what the sender offers: 80+ clear visible need (no website, broken or dated site, no booking for an appointment business), 50-79 some need, under 50 well served already or a big chain.';
  const j = parseJson(await complete(settings.ai, system, `${leadFacts(lead)}\nWebsite text:\n${siteText.slice(0, 5000) || '(no website)'}`, 600)) ?? {};
  return {
    contact_name: String(j.contact_name ?? '').slice(0, 80), contact_role: String(j.contact_role ?? '').slice(0, 60), summary: String(j.summary ?? '').slice(0, 600),
    fit: Math.max(0, Math.min(100, Math.round(Number(j.fit) || 0))), needs: (Array.isArray(j.needs) ? j.needs : []).map(String).filter((x: string) => NEEDS.includes(x)).slice(0, 3),
  };
}

/** Without a model: a simple estimate from what the website check found. */
export function guessFit(lead: Lead, facts?: Record<string, any>, score?: number | null): { fit: number; needs: string[] } {
  if (!lead.website) return { fit: 85, needs: ['Website'] };
  const needs: string[] = [];
  if ((score ?? 0) >= 40) needs.push('Redesign');
  if (facts && !facts.description) needs.push('SEO');
  if (facts && !facts.booking && /dent|clinic|salon|spa|physio|doctor|vet|barber|beauty|massage|fitness|gym|restaurant/i.test(lead.category)) needs.push('Online booking');
  if (Object.keys(safe(lead.socials)).length === 0) needs.push('Social media');
  if (!lead.rating || (lead.reviews ?? 0) < 10) needs.push('Google reviews');
  const fit = Math.min(95, 25 + (score ?? 0) * 0.7 + needs.length * 8);
  return { fit: Math.round(fit), needs: needs.slice(0, 3) };
}

/** "free" for local or free-tier models (smaller batches, shorter prompts), "paid" for paid keys. */
export function tier(ai: Ai): 'none' | 'free' | 'paid' {
  if (ai.provider === 'none') return 'none';
  if (['ollama', 'lmstudio', 'groq'].includes(ai.provider) || /:free\b|free/i.test(ai.model) || (ai.provider === 'openrouter' && !ai.model)) return 'free';
  return 'paid';
}
