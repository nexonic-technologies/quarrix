export const REGIONAL_SOURCES = [
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
