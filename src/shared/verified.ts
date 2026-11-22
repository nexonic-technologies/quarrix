import { warningSignals, type TrustReport } from './job-trust';

type LeadEvidence = { provenance?: string; website?: string; phone?:string;city?:string; email_status?: string; email_checked_at?: string | null; email?: string; details?: string; status?: string; relevance?: number | null; evidence?: number | null; grade?: string };
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
export function leadReviewReason(l:LeadEvidence,now=Date.now()):'closed'|'restricted'|'mail'|'conflict'|'unchecked'|'stale'|'recent'|'mailbox'{
 const p=object(l.provenance),d=object(l.details);
 if(d.status==='closed_permanently'||d.status==='closed_temporarily')return 'closed';
 if(l.status==='do_not_contact')return 'restricted';
 if(['invalid','bounced','bad-syntax','no-mx'].includes(l.email_status??''))return 'mail';
 if(Object.values(p.conflicts??{}).some(v=>Array.isArray(v)&&v.length>1))return 'conflict';
 if(!l.website||p.checked?.website!==l.website||!p.checked?.at)return 'unchecked';
 if(!recent(p.checked.at,90,now))return 'stale';
 return leadQuality(l,now)==='mailbox'?'mailbox':'recent';
}
/** Evidence coverage, not probability that a business exists or is a good customer. */
export function leadConfidence(l:LeadEvidence,now=Date.now()){
 const p=object(l.provenance),reason=leadReviewReason(l,now);
 const listing=typeof p.listing?.source==='string'&&!!p.listing?.ref&&recent(p.listing?.at,90,now);
 const website=!!l.website&&p.checked?.website===l.website&&recent(p.checked?.at,90,now);
 const independent=listing&&website&&!['website','web','manual','import'].includes(p.listing.source)&&Array.isArray(p.agreements)&&p.agreements.some((a:any)=>a?.website===l.website&&recent(a.at,90,now)&&((a.field==='phone'&&a.value===l.phone)||(a.field==='city'&&a.value===l.city)));
 const mailbox=reason==='mailbox';
 const score=(listing?25:0)+(website?35:0)+(independent?20:0)+(mailbox?20:0);
 return {score:['closed','restricted','mail','conflict'].includes(reason)?Math.min(score,25):score,listing,website,independent,mailbox,reason};
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
export function salaryByLevel(rows:{level?:string;salaryYearly?:{min:number;max:number;currency:string;period:string}|null}[]){
 const groups=new Map<string,typeof rows>();for(const r of rows){const level=['Internship','Entry level','Mid level','Senior','Director'].includes(r.level??'')?r.level!:'Unknown';const list=groups.get(level)??[];list.push(r);groups.set(level,list);}
 return [...groups].flatMap(([level,rs])=>salarySamples(rs).map(s=>({...s,level,total:rs.length}))).sort((a,b)=>a.currency.localeCompare(b.currency)||a.level.localeCompare(b.level));
}
export function recommendLeads<T extends LeadEvidence>(rows: T[], now=Date.now()) {
  return rows.filter(l => l.status === 'new' && (l.grade === 'A' || l.grade === 'B') && ['recent','mailbox'].includes(leadQuality(l,now)) && Number.isFinite(l.relevance) && Number.isFinite(l.evidence)).sort((a,b)=>(b.relevance!+b.evidence!+leadConfidence(b,now).score)-(a.relevance!+a.evidence!+leadConfidence(a,now).score)).slice(0,3);
}
export function recommendJobs<T extends { status?:string; match?:number; snippet?:string; ageDays?:number|null; repost?:boolean }>(rows:T[]) {
  return rows.filter(j=>['Saved','Opened'].includes(j.status??'Saved')&&typeof j.match==='number'&&j.match>=70&&jobQuality(j)==='unchecked').sort((a,b)=>b.match!-a.match!).slice(0,3);
}
