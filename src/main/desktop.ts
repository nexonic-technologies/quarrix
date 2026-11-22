import * as db from './db';
import * as scope from './scope';
export function desktopSearch(value:unknown){
 const q=typeof value==='string'?value.trim().slice(0,120):'';
 if(q.length<2)return {leads:[],jobs:[]};
 const client=scope.current();
 const leads=db.raw().prepare("SELECT id,name title,COALESCE(NULLIF(city,''),category) detail FROM leads WHERE (?='' OR client=?) AND (instr(lower(name),lower(?))>0 OR instr(lower(category),lower(?))>0 OR instr(lower(city),lower(?))>0) ORDER BY id DESC LIMIT 8").all(client,client,q,q,q) as {id:number;title:string;detail:string}[];
 const jobs=db.raw().prepare("SELECT id,json_extract(data,'$.title') title,json_extract(data,'$.company') detail FROM saved_jobs WHERE json_valid(data) AND (instr(lower(json_extract(data,'$.title')),lower(?))>0 OR instr(lower(json_extract(data,'$.company')),lower(?))>0) ORDER BY at DESC LIMIT 8").all(q,q) as {id:string;title:string;detail:string}[];
 return {leads,jobs};
}
