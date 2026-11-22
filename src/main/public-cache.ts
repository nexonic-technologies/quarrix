import { app } from 'electron';
import { readFileSync,writeFileSync,renameSync,statSync } from 'node:fs';
import { join } from 'node:path';
export type PublicResult<T>={data:T;checkedAt:string;cached:boolean;stale:boolean};
type Entry={data:unknown;checkedAt:string};
const pending=new Map<string,Promise<PublicResult<unknown>>>();
const path=()=>join(app.getPath('userData'),'public-source-cache.json');
function read():Record<string,Entry>{try{if(statSync(path()).size>1_000_000)return {};const data=JSON.parse(readFileSync(path(),'utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
const write=(rows:Record<string,Entry>)=>{writeFileSync(path()+'.tmp',JSON.stringify(rows));renameSync(path()+'.tmp',path());};
export function cacheAge(checkedAt:unknown,now=Date.now()){const age=now-Date.parse(String(checkedAt??''));return !Number.isFinite(age)||age<0||age>=7*864e5?'expired':age<300000?'fresh':'dated';}
function persist(key:string,entry:Entry){try{const rows={...read(),[key]:entry};const sorted=Object.entries(rows).sort((a,b)=>String(b[1]?.checkedAt).localeCompare(String(a[1]?.checkedAt))).slice(0,50);while(sorted.length&&Buffer.byteLength(JSON.stringify(Object.fromEntries(sorted)))>1_000_000)sorted.pop();write(Object.fromEntries(sorted));}catch{/* cache failure must not break a live result */}}
export function publicCacheSummary(now=Date.now()){
 const groups=new Map<string,{source:string;fresh:number;dated:number;expired:number;latest:string}>();
 for(const [key,e] of Object.entries(read())){const source=key.split(':')[0],row=groups.get(source)??{source,fresh:0,dated:0,expired:0,latest:''};row[cacheAge(e?.checkedAt,now)]++;if(typeof e?.checkedAt==='string'&&cacheAge(e.checkedAt,now)!=='expired'&&e.checkedAt>row.latest)row.latest=e.checkedAt;groups.set(source,row);}
 return [...groups.values()].sort((a,b)=>a.source.localeCompare(b.source));
}
/** Only explicitly expired public snapshots are removed, never saved CRM or career records. */
export function purgeExpiredPublicCache(now=Date.now()){
 const rows=read(),next=Object.fromEntries(Object.entries(rows).filter(([,e])=>cacheAge(e?.checkedAt,now)!=='expired'));const removed=Object.keys(rows).length-Object.keys(next).length;if(removed)write(next);return removed;
}
export async function cachedPublic<T>(key:string,fetcher:()=>Promise<T>,now=Date.now()):Promise<PublicResult<T>>{
 const previous=read()[key];const age=now-Date.parse(previous?.checkedAt??'');const result=(e:Entry,stale:boolean)=>({data:e.data as T,checkedAt:e.checkedAt,cached:true,stale});
 if(previous&&age>=0&&age<300000)return result(previous,false);
 const running=pending.get(key);if(running)return running as Promise<PublicResult<T>>;
 const job=(async()=>{try{const data=await fetcher();const entry={data,checkedAt:new Date(now).toISOString()};persist(key,entry);return {...entry,cached:false,stale:false};}catch(e){const msg=String((e as Error)?.message??e);if(previous&&age>=0&&age<7*864e5&&/fetch failed|timeout|timed out|ECONNRESET|HTTP 50[0234]/i.test(msg))return result(previous,true);throw e;}})();
 pending.set(key,job as Promise<PublicResult<unknown>>);try{return await job;}finally{pending.delete(key);}
}
