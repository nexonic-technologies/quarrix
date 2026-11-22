import * as db from './db';
import * as scope from './scope';
import { fetchText, BOT_UA } from './util';
import { validateOpportunity, parseTed,parseGrants, type Opportunity } from '../shared/public-opportunities';
import {cachedPublic} from './public-cache';
import {createHash} from 'node:crypto';
export function migratePublicOpportunities() { db.raw().exec("CREATE TABLE IF NOT EXISTS public_opportunities (id INTEGER PRIMARY KEY, client TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, updated_at TEXT NOT NULL)"); }
export function listPublicOpportunities(): Opportunity[] { const c=scope.current(); return (db.raw().prepare("SELECT id,data FROM public_opportunities WHERE (?='' OR client=?) ORDER BY updated_at DESC,id DESC").all(c,c) as {id:number;data:string}[]).map(r=>({...JSON.parse(r.data),id:r.id})); }
export function savePublicOpportunity(value: unknown): Opportunity {
  const p=validateOpportunity(value), c=scope.current(); const {id,...data}=p;
  if(id!==undefined){
    const row=db.raw().prepare("SELECT client FROM public_opportunities WHERE id=? AND (?='' OR client=?)").get(id,c,c) as {client:string}|undefined;
    if(!row) throw new Error('Opportunity not found in this workspace.');
    if(db.raw().prepare("SELECT 1 FROM public_opportunities WHERE client=? AND id<>? AND json_extract(data,'$.url')=?").get(row.client,id,data.url)) throw new Error('This opportunity is already saved.');
    db.raw().prepare('UPDATE public_opportunities SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(data),db.now(),id);return p;
  }
  if(db.raw().prepare("SELECT 1 FROM public_opportunities WHERE client=? AND json_extract(data,'$.url')=?").get(c,data.url)) throw new Error('This opportunity is already saved.');
  const r=db.raw().prepare('INSERT INTO public_opportunities (client,data,updated_at) VALUES (?,?,?)').run(c,JSON.stringify(data),db.now());return {...p,id:Number(r.lastInsertRowid)};
}
export function deletePublicOpportunity(id:number) {const c=scope.current();return db.raw().prepare("DELETE FROM public_opportunities WHERE id=? AND (?='' OR client=?)").run(id,c,c).changes;}
export async function searchTed(page:number) {
  const date=new Date(Date.now()-7*864e5).toISOString().slice(0,10).replace(/-/g,'');
  const r=await fetchText('https://api.ted.europa.eu/v3/notices/search',{method:'POST',ua:BOT_UA,timeout:20000,maxBytes:2000000,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:`publication-date >= ${date} AND notice-type = cn-standard`,fields:['publication-number','notice-title','buyer-name','publication-date','notice-type','deadline-receipt-tender-date-lot'],page,limit:25,scope:'ACTIVE',paginationMode:'PAGE_NUMBER'})});
  if(!r.ok) throw new Error(`Official notice service returned HTTP ${r.status}.`);
  return parseTed(JSON.parse(r.text));
}
export async function searchGrants(keyword:string){
 const q=String(keyword??'').trim().slice(0,100),key=createHash('sha256').update(q).digest('hex').slice(0,24);
 return cachedPublic('grants:'+key,async()=>{const r=await fetchText('https://api.grants.gov/v1/api/search2',{method:'POST',ua:BOT_UA,timeout:20000,maxBytes:2_000_000,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({rows:25,keyword:q,oppStatuses:'posted',startRecordNum:0})});if(!r.ok)throw new Error(`Grants service HTTP ${r.status}`);return parseGrants(JSON.parse(r.text));});
}
