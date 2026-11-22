import { fetchText, BOT_UA } from './util';
import { BLS_SERIES, parseBls, secCompany } from '../shared/global-data';
export async function secLookup(id:string){
 if(!/^\d{1,10}$/.test(id)||Number(id)===0)throw new Error('Enter a valid CIK.');
 const cik=id.padStart(10,'0');const r=await fetchText(`https://data.sec.gov/submissions/CIK${cik}.json`,{ua:'Quarrix Nexonic Technologies info@nexonictechnologies.com',timeout:15000,maxBytes:5_000_000,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`SEC returned HTTP ${r.status}.`);return secCompany(JSON.parse(r.text),cik);
}
export async function officialWages(){
  const r=await fetchText(`https://api.bls.gov/publicAPI/v2/timeseries/data/${BLS_SERIES}`,{ua:BOT_UA,timeout:15000,maxBytes:300000,headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`Wage service returned HTTP ${r.status}.`);
  const rows=parseBls(JSON.parse(r.text));if(!rows.length)throw new Error('Wage data unavailable.');return rows;
}
