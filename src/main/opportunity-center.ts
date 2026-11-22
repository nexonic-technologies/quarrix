import * as db from './db';
import * as scope from './scope';
import * as crm from './crm';
import * as jobstore from './jobstore';
import {listPublicOpportunities} from './public-opportunities';
import {dueItems,upcomingItems,priorityQueue,type StudioNotes,type PriorityItem} from '../shared/application-studio';

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
 const end=new Date(now);end.setDate(end.getDate()+7);const through=localDay(end);end.setDate(end.getDate()+1);end.setHours(0,0,0,0);
 const active=jobs.filter(j=>!['Rejected','Withdrawn','Offer','Accepted'].includes(j.status??''));
 const queuedJobs=[...dates,...upcomingItems(active,day,through)].map(d=>({id:`job:${d.id}:${d.kind}`,title:d.title,day:d.day,kind:d.kind,job:d.id}));
 const queuedTasks=(crm.listTasks({open:true,to:end.toISOString()}) as {id:number;title:string;lead_id:number|null;due_at:string}[]).map(t=>({id:`task:${t.id}`,title:t.title,day:localDay(new Date(t.due_at)),kind:'task' as const,lead:t.lead_id??undefined}));
 const queuedNotices=listPublicOpportunities().filter(p=>p.deadline&&!['Submitted','Closed'].includes(p.status)).map(p=>({id:`notice:${p.id}`,title:p.title,day:p.deadline,kind:'notice' as const}));
 const priorities=priorityQueue([...queuedJobs,...queuedTasks,...queuedNotices] as PriorityItem[],day,through);
 const client=scope.current(),since=new Date(now.getTime()-7*864e5).toISOString();
 const signals=db.raw().prepare("SELECT s.id,s.title,s.at,s.level,s.lead_id lead FROM signals s JOIN leads l ON l.id=s.lead_id WHERE s.dismissed=0 AND s.seen=0 AND s.level IN ('hot','warm') AND s.at>=? AND s.at<=? AND l.status NOT IN ('do_not_contact','won','lost') AND (?='' OR l.client=?) ORDER BY CASE s.level WHEN 'hot' THEN 0 ELSE 1 END,s.at DESC LIMIT 5").all(since,now.toISOString(),client,client) as {id:number;title:string;at:string;level:string;lead:number}[];
 return {day,dates,tasks,notices,watches,alerts,digest:digestEnabled(),priorities,signals};
}
/** Local observation counts only. Job ids are deduplicated across alerts and counted on their first recorded day. */
export function opportunityTrends(now=new Date()){
 const end=now.toISOString().slice(0,10),start=new Date(Date.parse(end+'T00:00:00Z')-6*864e5).toISOString().slice(0,10),client=scope.current();
 const leads=db.raw().prepare("SELECT substr(created_at,1,10) day,COUNT(*) n FROM leads WHERE created_at>=? AND created_at<=? AND (?='' OR client=?) GROUP BY day").all(start,now.toISOString(),client,client) as {day:string;n:number}[];
 const hiring=db.raw().prepare("SELECT substr(first_seen,1,10) day,COUNT(*) n FROM (SELECT job_id,MIN(at) first_seen FROM job_alert_hits WHERE at<=? GROUP BY job_id) WHERE first_seen>=? GROUP BY day").all(now.toISOString(),start) as {day:string;n:number}[];
 const days=Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*864e5).toISOString().slice(0,10));
 return days.map(day=>({day,businesses:leads.find(x=>x.day===day)?.n??0,vacancies:hiring.find(x=>x.day===day)?.n??0}));
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
