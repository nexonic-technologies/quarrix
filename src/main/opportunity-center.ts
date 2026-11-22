import * as db from './db';
import * as scope from './scope';
import * as crm from './crm';
import * as jobstore from './jobstore';
import {listPublicOpportunities} from './public-opportunities';
import {dueItems,type StudioNotes} from '../shared/application-studio';

export const localDay=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function migrateDigest(){db.raw().exec("CREATE TABLE IF NOT EXISTS daily_digest (client TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL DEFAULT '')");}
export function digestEnabled(){return !!(db.raw().prepare('SELECT enabled FROM daily_digest WHERE client=?').get(scope.current()) as {enabled:number}|undefined)?.enabled;}
export function setDigest(enabled:boolean){db.raw().prepare('INSERT INTO daily_digest(client,enabled) VALUES(?,?) ON CONFLICT(client) DO UPDATE SET enabled=excluded.enabled').run(scope.current(),enabled?1:0);}
export function centerOverview(now=new Date()){
 const day=localDay(now), jobs=db.savedJobs() as {id:string;title:string;status?:string;studio?:StudioNotes}[];
 const dates=dueItems(jobs.filter(j=>!['Rejected','Withdrawn','Offer','Accepted'].includes(j.status??'')),day);
 const tasks=(crm.listTasks({open:true,to:new Date(now.getTime()+1).toISOString()}) as {id:number;title:string;lead_id:number|null;due_at:string}[]).map(t=>({id:t.id,title:t.title,lead:t.lead_id,date:t.due_at}));
 const notices=listPublicOpportunities().filter(p=>p.deadline&&p.deadline<=day&&!['Submitted','Closed'].includes(p.status)).map(p=>({id:p.id,title:p.title,date:p.deadline,portal:p.portal}));
 const watches=(scope.byClient(db.listWatches()) as {id:number;category:string;place:string;enabled:number;every_days:number}[]).map(w=>({id:w.id,title:`${w.category} · ${w.place}`,enabled:!!w.enabled,interval:w.every_days}));
 const alerts=(jobstore.listAlerts() as {id:number;name:string;enabled:number;every_hours:number;unseen:number}[]).map(a=>({id:a.id,title:a.name,enabled:!!a.enabled,interval:a.every_hours,unseen:a.unseen}));
 return {day,dates,tasks,notices,watches,alerts,digest:digestEnabled()};
}
export function toggleSavedSearch(kind:'watch'|'alert',id:number,enabled:boolean){
 if(kind==='watch'){scope.ownRecord('watches',{id});db.raw().prepare('UPDATE watches SET enabled=? WHERE id=?').run(enabled?1:0,id);}
 else db.raw().prepare('UPDATE job_alerts SET enabled=? WHERE id=?').run(enabled?1:0,id);
}
/** Claim at most one optional notification per local day and client. No identifying details are sent to the OS. */
export function claimDigest(workspace:string,now=new Date()){
 if(!digestEnabled())return 0;
 const r=centerOverview(now);const n=(workspace!=='business'?r.dates.length+r.alerts.reduce((a,b)=>a+b.unseen,0):0)+(workspace!=='career'?r.tasks.length:0)+r.notices.length;
 if(!n)return 0;
 return db.raw().prepare('UPDATE daily_digest SET last_day=? WHERE client=? AND enabled=1 AND last_day<>?').run(r.day,scope.current(),r.day).changes?n:0;
}
