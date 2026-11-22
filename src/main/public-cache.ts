import { app } from 'electron';
import { readFileSync,writeFileSync,renameSync,statSync } from 'node:fs';
import { join } from 'node:path';
export type PublicResult<T>={data:T;checkedAt:string;cached:boolean;stale:boolean};
type Entry={data:unknown;checkedAt:string};
const pending=new Map<string,Promise<PublicResult<unknown>>>();
const path=()=>join(app.getPath('userData'),'public-source-cache.json');
function read():Record<string,Entry>{try{if(statSync(path()).size>1_000_000)return {};const data=JSON.parse(readFileSync(path(),'utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
function persist(key:string,entry:Entry){try{const rows={...read(),[key]:entry};const capped=Object.fromEntries(Object.entries(rows).sort((a,b)=>String(b[1]?.checkedAt).localeCompare(String(a[1]?.checkedAt))).slice(0,50));writeFileSync(path()+'.tmp',JSON.stringify(capped));renameSync(path()+'.tmp',path());}catch{/* cache failure must not break a live result */}}
export async function cachedPublic<T>(key:string,fetcher:()=>Promise<T>,now=Date.now()):Promise<PublicResult<T>>{
 const previous=read()[key];const age=now-Date.parse(previous?.checkedAt??'');const result=(e:Entry,stale:boolean)=>({data:e.data as T,checkedAt:e.checkedAt,cached:true,stale});
 if(previous&&age>=0&&age<300000)return result(previous,false);
 const running=pending.get(key);if(running)return running as Promise<PublicResult<T>>;
 const job=(async()=>{try{const data=await fetcher();const entry={data,checkedAt:new Date(now).toISOString()};persist(key,entry);return {...entry,cached:false,stale:false};}catch(e){const msg=String((e as Error)?.message??e);if(previous&&age>=0&&age<7*864e5&&/fetch failed|timeout|timed out|ECONNRESET|HTTP 50[0234]/i.test(msg))return result(previous,true);throw e;}})();
 pending.set(key,job as Promise<PublicResult<unknown>>);try{return await job;}finally{pending.delete(key);}
}
