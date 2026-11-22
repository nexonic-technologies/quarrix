export const PORTALS = [
  {id:'pk-scholarships',country:'PK',kind:'scholarship',title:'HEC Scholarships',url:'https://www.hec.gov.pk/english/scholarshipsgrants/Pages/default.aspx',hosts:['www.hec.gov.pk','hec.gov.pk']},
  {id:'eu-scholarships',country:'EU',kind:'scholarship',title:'Erasmus Mundus Joint Masters',url:'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters',hosts:['erasmus-plus.ec.europa.eu']},
  {id:'eu-internships',country:'EU',kind:'internship',title:'European Commission Blue Book Traineeships',url:'https://traineeships.ec.europa.eu/',hosts:['traineeships.ec.europa.eu']},
  {id:'us-apprenticeships',country:'US',kind:'apprenticeship',title:'Apprenticeship.gov',url:'https://www.apprenticeship.gov/apprenticeship-job-finder',hosts:['www.apprenticeship.gov','apprenticeship.gov']},
  {id:'uk-apprenticeships',country:'GB',kind:'apprenticeship',title:'Find an apprenticeship',url:'https://www.gov.uk/apply-apprenticeship',hosts:['www.gov.uk','www.findapprenticeship.service.gov.uk']},
  {id:'us-grants',country:'US',kind:'grant',title:'Grants.gov',url:'https://www.grants.gov/',hosts:['www.grants.gov','grants.gov']},
  { id:'pk-jobs', country:'PK', kind:'job', title:'Pakistan National Jobs Portal', url:'https://njp.gov.pk/jobs/', hosts:['njp.gov.pk','www.njp.gov.pk'] },
  { id:'pk-tenders', country:'PK', kind:'tender', title:'Pakistan Public Procurement Regulatory Authority', url:'https://ppra.gov.pk/', hosts:['ppra.gov.pk','www.ppra.gov.pk','epms.ppra.gov.pk'] },
  { id:'us-jobs', country:'US', kind:'job', title:'USAJOBS', url:'https://www.usajobs.gov/', hosts:['usajobs.gov','www.usajobs.gov'] },
  { id:'us-tenders', country:'US', kind:'tender', title:'SAM.gov', url:'https://sam.gov/opportunities', hosts:['sam.gov','www.sam.gov'] },
  { id:'uk-jobs', country:'GB', kind:'job', title:'UK Civil Service Jobs', url:'https://www.civilservicejobs.service.gov.uk/', hosts:['www.civilservicejobs.service.gov.uk','civilservicejobs.service.gov.uk'] },
  { id:'uk-find-jobs', country:'GB', kind:'job', title:'UK Find a job', url:'https://www.gov.uk/find-a-job', hosts:['findajob.dwp.gov.uk'] },
  { id:'ca-jobs', country:'CA', kind:'job', title:'Canada Job Bank', url:'https://www.jobbank.gc.ca/', hosts:['www.jobbank.gc.ca','jobbank.gc.ca'] },
  { id:'eu-jobs', country:'EU', kind:'job', title:'EURES', url:'https://eures.europa.eu/', hosts:['eures.europa.eu'] },
  { id:'uk-tenders', country:'GB', kind:'tender', title:'UK Find a Tender', url:'https://www.find-tender.service.gov.uk/', hosts:['www.find-tender.service.gov.uk','find-tender.service.gov.uk'] },
  { id:'eu-tenders', country:'EU', kind:'tender', title:'EU Tenders Electronic Daily', url:'https://ted.europa.eu/', hosts:['ted.europa.eu'] },
] as const;
export type Opportunity = { id?: number; portal: string; title: string; url: string; deadline: string; eligibility: string; checklist: string; status: 'Watching' | 'Preparing' | 'Submitted' | 'Closed' };
export const EMPTY_OPPORTUNITY: Opportunity = { portal:'pk-jobs', title:'', url:'', deadline:'', eligibility:'', checklist:'', status:'Watching' };
export function validateOpportunity(value: unknown): Opportunity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid opportunity.');
  const v = value as Record<string, unknown>; const p = PORTALS.find(x => x.id === v.portal);
  if (!p) throw new Error('Choose an official portal.');
  const str = (x: unknown, max: number) => { if (typeof x !== 'string' || x.length > max) throw new Error('Invalid opportunity text.'); return x; };
  const title = str(v.title, 500).trim(), url = str(v.url, 2000), deadline = str(v.deadline, 10);
  let u: URL; try { u = new URL(url); } catch { throw new Error('Invalid official listing URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !(p.hosts as readonly string[]).includes(u.hostname)) throw new Error('Use a listing on the selected official portal.');
  if (!title) throw new Error('Opportunity title is required.');
  if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(Date.parse(`${deadline}T00:00:00Z`)) || new Date(`${deadline}T00:00:00Z`).toISOString().slice(0,10) !== deadline)) throw new Error('Invalid deadline.');
  if (!['Watching','Preparing','Submitted','Closed'].includes(String(v.status))) throw new Error('Invalid opportunity status.');
  const id = v.id == null ? undefined : Number(v.id); if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid opportunity ID.');
  return { id, portal:p.id, title, url:u.href, deadline, eligibility:str(v.eligibility,10000), checklist:str(v.checklist,10000), status:v.status as Opportunity['status'] };
}
export type TedNotice = { id: string; title: string; buyer: string; publication: string; deadlines: string[]; url: string };
export type GrantNotice={id:string;title:string;number:string;agency:string;deadline:string;url:string};
export function parseGrants(value:unknown):{notices:GrantNotice[];total:number;partial:boolean}{
 const v=value as any;const d=v?.data;if(v?.errorcode!==0||!Array.isArray(d?.oppHits)||!Number.isSafeInteger(d.hitCount)||d.hitCount<0)throw new Error('Unexpected grants response.');
 const text=(x:unknown,max:number)=>typeof x==='string'?x.trim().slice(0,max):'';
 const notices=d.oppHits.flatMap((r:any)=>{const id=String(r?.id??''),title=text(r?.title,500);if(!/^\d{1,15}$/.test(id)||!title||r.oppStatus!=='posted')return [];
 const m=String(r.closeDate??'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);let deadline=m?`${m[3]}-${m[1]}-${m[2]}`:'';
 if(deadline&&(!Number.isFinite(Date.parse(deadline+'T00:00:00Z'))||new Date(deadline+'T00:00:00Z').toISOString().slice(0,10)!==deadline))deadline='';
 return [{id,title,number:text(r.number,120),agency:text(r.agencyName,200),deadline,url:`https://www.grants.gov/search-results-detail/${id}`}];});
 return {notices:notices.slice(0,25),total:d.hitCount,partial:notices.length!==d.oppHits.length||d.hitCount>notices.length};
}
function localized(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter(x=>typeof x==='string').join('; ');
  if (v && typeof v === 'object') { const o=v as Record<string,unknown>; return localized(o.eng ?? Object.values(o)[0]); }
  return '';
}
export function parseTed(data: unknown): { notices: TedNotice[]; total: number; partial: boolean } {
  const d=data as { notices?: unknown[]; totalNoticeCount?: number; timedOut?: boolean };
  if (!d || !Array.isArray(d.notices) || !Number.isFinite(d.totalNoticeCount)) throw new Error('Unexpected notice response.');
  const notices = d.notices.flatMap((n: any) => {
    const id=String(n?.['publication-number']??''); const title=localized(n?.['notice-title']).trim();
    if (!/^\d{1,10}-\d{4}$/.test(id) || !title || n?.['notice-type'] !== 'cn-standard') return [];
    const deadlines=(Array.isArray(n['deadline-receipt-tender-date-lot'])?n['deadline-receipt-tender-date-lot']:[]).filter((v:unknown)=> typeof v==='string' && /^\d{4}-\d{2}-\d{2}/.test(v)).map((v:string)=>v.slice(0,10));
    return [{id,title:title.slice(0,500),buyer:localized(n['buyer-name']).slice(0,500),publication:localized(n['publication-date']).slice(0,10),deadlines:[...new Set<string>(deadlines)],url:`https://ted.europa.eu/en/notice/${id}/html`}];
  });
  return {notices,total:Number(d.totalNoticeCount),partial:!!d.timedOut || notices.length!==d.notices.length};
}
