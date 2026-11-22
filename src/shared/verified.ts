import { warningSignals, type TrustReport } from './job-trust';

type LeadEvidence = { provenance?: string; website?: string; email_status?: string; email_checked_at?: string | null; email?: string; details?: string; status?: string; relevance?: number | null; evidence?: number | null; grade?: string };
const object = (s?: string): Record<string, any> => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
export const recent = (iso: unknown, days: number, now = Date.now()) => typeof iso === 'string' && Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= now && now - Date.parse(iso) <= days * 864e5;
export function leadQuality(l: LeadEvidence, now = Date.now()) {
  const p = object(l.provenance), d = object(l.details);
  if (d.status === 'closed_permanently' || d.status === 'closed_temporarily' || l.status === 'do_not_contact' || ['invalid','bounced','bad-syntax','no-mx'].includes(l.email_status ?? '')) return 'review';
  if (Object.values(p.conflicts ?? {}).some(v => Array.isArray(v) && v.length > 1)) return 'review';
  if (!l.website || p.checked?.website !== l.website || !recent(p.checked?.at, 90, now)) return 'check';
  if (l.email && l.email_status === 'verified' && recent(l.email_checked_at, 30, now)) return 'mailbox';
  return 'recent';
}
export function jobQuality(j: { snippet?: string; ageDays?: number | null; repost?: boolean }, report?: TrustReport, now = Date.now()) {
  if (report && recent(report.checkedAt, 7, now) && report.state === 'closed') return 'closed';
  if (warningSignals(j.snippet ?? '').length || (report && recent(report.checkedAt, 7, now) && report.state === 'caution')) return 'review';
  if (j.repost || (j.ageDays != null && j.ageDays > 45)) return 'check';
  if (report && recent(report.checkedAt, 7, now) && report.state === 'corroborated') return 'corroborated';
  return 'unchecked';
}
export type RegistryMatch = { lei: string; name: string; country: string; city: string; status: string; registration: string; updated: string };
const normalize = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
export function parseRegistry(data: unknown, name: string, country: string): RegistryMatch[] {
  const rows = (data as any)?.data;
  if (!Array.isArray(rows)) throw new Error('Unexpected registry response.');
  return rows.flatMap((r: any) => {
    const a = r?.attributes, e = a?.entity, reg = a?.registration;
    if (typeof a?.lei !== 'string' || !/^[A-Z0-9]{20}$/.test(a.lei) || typeof e?.legalName?.name !== 'string' || normalize(e.legalName.name) !== normalize(name) || e?.legalAddress?.country !== country) return [];
    return [{ lei:a.lei, name:e.legalName.name, country, city:String(e.legalAddress.city ?? '').slice(0,120), status:String(e.status ?? ''), registration:String(reg?.status ?? ''), updated:String(reg?.lastUpdateDate ?? '') }];
  });
}
export function salarySamples(rows: { salaryYearly?: { min: number; max: number; currency: string; period: string } | null }[]) {
  const groups = new Map<string, { min: number; max: number }[]>();
  for (const row of rows) { const s = row.salaryYearly; if (!s || !/^[A-Z]{3}$/.test(s.currency) || !Number.isFinite(s.min) || !Number.isFinite(s.max) || s.min < 0 || s.max < s.min) continue; const g = groups.get(s.currency) ?? []; g.push(s); groups.set(s.currency,g); }
  const median = (a: number[]) => { a.sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; };
  return [...groups].map(([currency,g])=>({currency,count:g.length,min:median(g.map(x=>x.min)),max:median(g.map(x=>x.max))}));
}
export function recommendLeads<T extends LeadEvidence>(rows: T[], now=Date.now()) {
  return rows.filter(l => l.status === 'new' && (l.grade === 'A' || l.grade === 'B') && ['recent','mailbox'].includes(leadQuality(l,now)) && typeof l.relevance==='number' && typeof l.evidence==='number').sort((a,b)=>(b.relevance!+b.evidence!)-(a.relevance!+a.evidence!)).slice(0,3);
}
export function recommendJobs<T extends { status?:string; match?:number; snippet?:string; ageDays?:number|null; repost?:boolean }>(rows:T[]) {
  return rows.filter(j=>['Saved','Opened'].includes(j.status??'Saved')&&typeof j.match==='number'&&j.match>=70&&jobQuality(j)==='unchecked').sort((a,b)=>b.match!-a.match!).slice(0,3);
}
