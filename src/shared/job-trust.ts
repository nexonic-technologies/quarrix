export type TrustJob = { url: string; title: string; company: string; snippet: string };
export type TrustWarning = { kind: 'fee' | 'payment' | 'sensitive'; excerpt: string };
export type TrustReport = {
  score: number; state: 'limited' | 'corroborated' | 'caution' | 'closed'; checkedAt: string;
  secure: boolean; listing: 'readable' | 'closed' | 'unknown'; titleMatch: boolean; companyMatch: boolean;
  employer: 'not-checked' | 'linked' | 'not-linked' | 'unknown'; employerNameMatch: boolean; listingHost: string; employerHost: string; warnings: TrustWarning[];
};

/** Only absolute HTTP(S) URLs with no embedded credentials. Network checks are separate. */
export function webUrl(value: string): URL | undefined {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u : undefined; } catch { return undefined; }
}

/** Preserve job identifiers and every non-tracking parameter; do not equate different vacancies on one board. */
export function postingKey(value: string): string {
  const u = webUrl(value); if (!u) return '';
  // A fragment may identify an individual vacancy in a client-rendered careers system.
  const keys = [...u.searchParams.keys()];
  for (const k of keys) if (/^utm_/i.test(k) || /^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, '') || '/';
  return u.toString();
}

const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();
export function mentions(text: string, phrase: string): boolean {
  const target = normalize(phrase); return target.length >= 3 && ` ${normalize(text)} `.includes(` ${target} `);
}

/** Contextual warning phrases only—not a scam verdict. Negative safety disclaimers are excluded. */
export function warningSignals(text: string): TrustWarning[] {
  const rules: [TrustWarning['kind'], RegExp][] = [
    ['fee', /\b(?:pay|send|transfer|deposit)\b.{0,65}\b(?:application|registration|training|processing|recruitment|security)\s+(?:fee|deposit|payment)\b/i],
    ['payment', /\b(?:pay|send|transfer|purchase|buy|deposit)\b.{0,75}\b(?:gift cards?|bitcoin|crypto(?:currency)?|equipment check|check we send)\b/i],
    ['sensitive', /\b(?:send|provide|submit|share)\b.{0,65}\b(?:bank account (?:details|number)|online banking password|credit card (?:details|number)|social security number|passport scan)\b/i],
  ];
  const out: TrustWarning[] = [];
  for (const sentence of text.slice(0, 30000).split(/[.!?\n]+/)) {
    if (/\b(?:never|do not|don't|will not|won't|not required|no need to)\b/i.test(sentence)) continue;
    for (const [kind, re] of rules) if (!out.some(w => w.kind === kind) && re.test(sentence)) out.push({ kind, excerpt: sentence.trim().slice(0, 240) });
  }
  return out;
}

export function assessTrust(job: TrustJob, evidence: Omit<TrustReport, 'score' | 'state' | 'warnings'>, listingText = ''): TrustReport {
  const warnings = warningSignals(`${job.snippet}\n${listingText}`);
  const score = Math.max(0, (evidence.secure ? 10 : 0) + (evidence.listing === 'readable' ? 20 : 0) + (evidence.titleMatch ? 10 : 0) + (evidence.companyMatch ? 10 : 0) + (evidence.employer === 'linked' ? 50 : 0) - warnings.length * 20);
  const state = evidence.listing === 'closed' ? 'closed' : warnings.length || !evidence.secure ? 'caution' : evidence.employer === 'linked' && evidence.listing === 'readable' ? 'corroborated' : 'limited';
  return { ...evidence, score, state, warnings };
}
