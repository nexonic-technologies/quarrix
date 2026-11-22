import { fetchText, BOT_UA } from './util';
import { BLS_SERIES, parseBls, secCompany,parseNationalRegistry,parseNycJobs,parseRecentRegistrations,parseBankRecord } from '../shared/global-data';
import { cachedPublic } from './public-cache';
async function publicJson(url:string){const r=await fetchText(url,{ua:BOT_UA,timeout:15000,maxBytes:2_000_000,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Public source HTTP ${r.status}`);return JSON.parse(r.text);}
export async function fdicLookup(cert:string){if(!/^[1-9]\d{0,8}$/.test(cert))throw new Error('Enter a valid FDIC certificate number.');const q=new URLSearchParams({filters:`CERT:${cert}`,fields:'CERT,NAME,CITY,STALP,ACTIVE',limit:'1'});return cachedPublic(`fdic:${cert}`,async()=>parseBankRecord(await publicJson(`https://api.fdic.gov/banks/institutions?${q}`),cert));}
export async function nationalRegistry(country:string,id:string){
 if((country!=='NO'&&country!=='FR')||!/^\d{9}$/.test(id))throw new Error('Enter a nine-digit public registration number.');
 return cachedPublic(`registry:${country}:${id}`,async()=>parseNationalRegistry(country,id,await publicJson(country==='NO'?`https://data.brreg.no/enhetsregisteret/api/enheter/${id}`:`https://recherche-entreprises.api.gouv.fr/search?q=${id}&per_page=1`)));
}
export async function nycVacancies(){return cachedPublic('nyc:external',async()=>parseNycJobs(await publicJson('https://data.cityofnewyork.us/resource/kpav-sd4t.json?$select=job_id,business_title,agency,posting_type,posting_date&$where=posting_type%3D%27External%27&$order=posting_date%20DESC&$limit=100')));}
export async function recentRegistrations(now=new Date()){
 const to=now.toISOString().slice(0,10),from=new Date(now.getTime()-29*864e5).toISOString().slice(0,10);
 const q=new URLSearchParams({organisasjonsform:'AS',fraRegistreringsdatoEnhetsregisteret:from,tilRegistreringsdatoEnhetsregisteret:to,size:'50',sort:'registreringsdatoEnhetsregisteret,DESC'});
 return cachedPublic(`no:registrations:${to}`,async()=>parseRecentRegistrations(await publicJson(`https://data.brreg.no/enhetsregisteret/api/enheter?${q}`),from,to));
}
export async function secLookup(id:string){
 if(!/^\d{1,10}$/.test(id)||Number(id)===0)throw new Error('Enter a valid CIK.');
 const cik=id.padStart(10,'0');const r=await fetchText(`https://data.sec.gov/submissions/CIK${cik}.json`,{ua:'Quarrix Nexonic Technologies info@nexonictechnologies.com',timeout:15000,maxBytes:5_000_000,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`SEC returned HTTP ${r.status}.`);return secCompany(JSON.parse(r.text),cik);
}
export async function officialWages(){
  const r=await fetchText(`https://api.bls.gov/publicAPI/v2/timeseries/data/${BLS_SERIES}`,{ua:BOT_UA,timeout:15000,maxBytes:300000,headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`Wage service returned HTTP ${r.status}.`);
  const rows=parseBls(JSON.parse(r.text));if(!rows.length)throw new Error('Wage data unavailable.');return rows;
}
