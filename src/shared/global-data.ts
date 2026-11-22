export const REGIONAL_SOURCES = [
  {region:'AU',kind:'registry',name:'Australian Business Register (ABN Lookup)',url:'https://abr.business.gov.au/'},
  {region:'NZ',kind:'registry',name:'New Zealand Companies Register',url:'https://companies-register.companiesoffice.govt.nz/'},
  {region:'AU',kind:'job',name:'Workforce Australia',url:'https://www.workforceaustralia.gov.au/individuals/jobs/'},
  {region:'AU',kind:'salary',name:'ABS employee earnings',url:'https://www.abs.gov.au/statistics/labour/earnings-and-working-conditions/employee-earnings'},
  {region:'US',kind:'registry',name:'FDIC BankFind Suite',url:'https://banks.data.fdic.gov/bankfind-suite/bankfind/'},
  {region:'NO',kind:'registry',name:'Brønnøysund Register Centre',url:'https://www.brreg.no/en/'},
  {region:'FR',kind:'registry',name:'Annuaire des Entreprises',url:'https://annuaire-entreprises.data.gouv.fr/'},
  {region:'US',kind:'job',name:'Jobs NYC',url:'https://cityjobs.nyc.gov/'},
  {region:'PK',kind:'registry',name:'SECP company name search',url:'https://eservices.secp.gov.pk/eServices/NameSearch.jsp'},
  {region:'GB',kind:'registry',name:'Companies House',url:'https://find-and-update.company-information.service.gov.uk/'},
  {region:'US',kind:'registry',name:'SEC EDGAR filings',url:'https://www.sec.gov/edgar/search/'},
  {region:'CA',kind:'registry',name:'Corporations Canada',url:'https://www.ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html?locale=en_CA'},
  {region:'CA',kind:'registry',name:"Canada’s Business Registries",url:'https://ised-isde.canada.ca/cbr-rec/en/search/'},
  {region:'EU',kind:'registry',name:'EU business registers',url:'https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu/general-information-find-company_en'},
  {region:'AE',kind:'job',name:'UAE government job search guidance',url:'https://u.ae/en/information-and-services/jobs/searching-for-a-job'},
  {region:'PK',kind:'job',name:'Pakistan National Jobs Portal',url:'https://njp.gov.pk/jobs/'},
  {region:'GB',kind:'job',name:'Find a job (UK)',url:'https://www.gov.uk/find-a-job'},
  {region:'US',kind:'job',name:'USAJOBS',url:'https://www.usajobs.gov/'},
  {region:'CA',kind:'job',name:'Canada Job Bank',url:'https://www.jobbank.gc.ca/'},
  {region:'EU',kind:'job',name:'EURES',url:'https://eures.europa.eu/'},
  {region:'US',kind:'salary',name:'BLS Occupational Outlook Handbook',url:'https://www.bls.gov/ooh/'},
  {region:'CA',kind:'salary',name:'Canada Job Bank wage reports',url:'https://www.jobbank.gc.ca/trend-analysis/search-wages'},
  {region:'GB',kind:'salary',name:'ONS earnings statistics',url:'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours'},
  {region:'PK',kind:'salary',name:'Pakistan Bureau of Statistics labour force statistics',url:'https://www.pbs.gov.pk/'},
  {region:'EU',kind:'salary',name:'Eurostat earnings statistics',url:'https://ec.europa.eu/eurostat/web/labour-market/earnings'},
] as const;
export type RegistryRecord={id:string;name:string;country:'NO'|'FR';status:string;source:string};
export type PublicVacancy={id:string;title:string;agency:string;posted:string};
export type BankRecord={cert:string;name:string;city:string;state:string;active:boolean|null};
export function parseBankRecord(value:unknown,cert:string):BankRecord{
 const rows=(value as any)?.data;if(!Array.isArray(rows))throw new Error('Unexpected FDIC response.');
 const r=rows.map((x:any)=>x?.data).find((x:any)=>String(x?.CERT)===cert&&typeof x?.NAME==='string'&&x.NAME.trim());
 if(!r)throw new Error('No matching FDIC registration returned.');
 return {cert,name:r.NAME.slice(0,250),city:typeof r.CITY==='string'?r.CITY.slice(0,120):'',state:typeof r.STALP==='string'?r.STALP.slice(0,20):'',active:[1,'1',true].includes(r.ACTIVE)?true:[0,'0',false].includes(r.ACTIVE)?false:null};
}
export type RecentRegistration={id:string;name:string;registered:string};
export function parseRecentRegistrations(data:unknown,from:string,to:string):RecentRegistration[]{
 const rows=(data as any)?._embedded?.enheter;
 if(!Array.isArray(rows)){if((data as any)?.page?.totalElements===0)return [];throw new Error('Unexpected public registration response.');}
 const result=new Map<string,RecentRegistration>();
 for(const r of rows){const id=typeof r?.organisasjonsnummer==='string'?r.organisasjonsnummer:'',name=typeof r?.navn==='string'?r.navn.trim().slice(0,250):'',registered=r?.registreringsdatoEnhetsregisteret;
 if(!/^\d{9}$/.test(id)||!name||r?.organisasjonsform?.kode!=='AS'||r.konkurs===true||r.underAvvikling===true||r.slettedato||typeof registered!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(registered)||registered<from||registered>to)continue;
 result.set(id,{id,name,registered});}
 return [...result.values()].sort((a,b)=>b.registered.localeCompare(a.registered)||a.id.localeCompare(b.id)).slice(0,50);
}
const field=(v:unknown,max=250)=>typeof v==='string'?v.trim().slice(0,max):'';
export function parseNationalRegistry(country:'NO'|'FR',id:string,data:unknown):RegistryRecord {
 const d=data as any;
 if(country==='NO'&&d?.organisasjonsnummer===id&&field(d.navn)&&!d?.slettedato)return {id,name:field(d.navn),country,status:d.konkurs===true?'Bankruptcy reported':d.underAvvikling===true?'Dissolution reported':'Registration found',source:'Brønnøysund Register Centre'};
 if(country==='FR'&&Array.isArray(d?.results)){const row=d.results.find((x:any)=>x?.siren===id);if(row&&field(row.nom_complet))return {id,name:field(row.nom_complet),country,status:row.etat_administratif==='A'?'Active registration':row.etat_administratif==='C'?'Closed registration':'Registration found',source:'Annuaire des Entreprises'};}
 throw new Error('No matching public registration returned.');
}
export function parseNycJobs(data:unknown):PublicVacancy[]{
 if(!Array.isArray(data))throw new Error('Unexpected public jobs response.');
 const rows=new Map<string,PublicVacancy>();
 for(const r of data){const id=field(r?.job_id,30),title=field(r?.business_title),agency=field(r?.agency);if(r?.posting_type!=='External'||!/^\d+$/.test(id)||!title||!agency)continue;rows.set(id,{id,title,agency,posted:field(r.posting_date,30)});}
 return [...rows.values()].slice(0,100);
}
export const BLS_SERIES='CES0500000003';
export function secCompany(value:unknown,cik:string){
 const d=value as any;
 if(!d||String(d.cik).padStart(10,'0')!==cik||d.entityType!=='operating'||typeof d.name!=='string'||!d.name.trim())throw new Error('No matching operating company returned.');
 return {cik,name:d.name.slice(0,300),tickers:Array.isArray(d.tickers)?d.tickers.filter((x:unknown)=>typeof x==='string').slice(0,20):[],sicDescription:typeof d.sicDescription==='string'?d.sicDescription.slice(0,300):''};
}
export type WageObservation={period:string;value:number;currency:'USD';series:string};
export function parseBls(value:unknown): WageObservation[] {
  const d=value as any;
  if(d?.status!=='REQUEST_SUCCEEDED'||!Array.isArray(d?.Results?.series))throw new Error('Wage data unavailable.');
  const rows=d.Results.series.find((s:any)=>s.seriesID===BLS_SERIES)?.data;
  if(!Array.isArray(rows))throw new Error('Wage data unavailable.');
  return rows.flatMap((r:any)=>{if(!/^\d{4}$/.test(r?.year)||!/^M(0[1-9]|1[0-2])$/.test(r?.period)||typeof r.value!=='string'||!/^\d+(\.\d+)?$/.test(r.value))return [];const number=Number(r.value);return Number.isFinite(number)&&number>0?[{period:`${r.year}-${r.period.slice(1)}`,value:number,currency:'USD' as const,series:BLS_SERIES}]:[];}).sort((a:WageObservation,b:WageObservation)=>b.period.localeCompare(a.period)).slice(0,12);
}
