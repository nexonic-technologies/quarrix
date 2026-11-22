import {useEffect,useState} from 'react';
import {call} from '../api';
import {toast} from '../App';
import type {Workspace} from '../../../shared/navigation';
import type {centerOverview,opportunityTrends} from '../../../main/opportunity-center';
type Overview=ReturnType<typeof centerOverview>;
export function OpportunityCenter({workspace,tick,onJob,onLead}:{workspace:Workspace;tick:number;onJob:(id:string)=>void;onLead:(id:number)=>void}){
 const [data,setData]=useState<Overview|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const [trends,setTrends]=useState<ReturnType<typeof opportunityTrends>>([]),[expanded,setExpanded]=useState(false);
 useEffect(()=>{setData(null);},[workspace]);
 useEffect(()=>{let alive=true;call<Overview>('opportunities:center').then(r=>{if(alive)setData(r);}).catch(()=>{if(alive)setData(null);});return()=>{alive=false;};},[tick,workspace,revision]);
 useEffect(()=>{if(!expanded)return;let alive=true;call<ReturnType<typeof opportunityTrends>>('opportunities:trends').then(r=>{if(alive)setTrends(r);}).catch(()=>{if(alive)setTrends([]);});return()=>{alive=false;};},[expanded,tick,workspace,revision]);
 useEffect(()=>{const id=setInterval(()=>setRevision(x=>x+1),60000);return()=>clearInterval(id);},[]);
 const change=async(ch:string,...args:unknown[])=>{setBusy(true);try{await call(ch,...args);setRevision(x=>x+1);}catch(e){toast.push(String(e),true);}finally{setBusy(false);}};
 if(!data)return null;
 const queue=(data.priorities??[]).filter(p=>p.kind==='notice'||(p.kind==='task'?workspace!=='career':workspace!=='business'));
 const max=Math.max(1,...trends.flatMap(x=>[workspace==='career'?0:x.businesses,workspace==='business'?0:x.vacancies]));
 return <details className="registry-check" data-opportunity-center onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Daily opportunity center</summary><p className="muted small">Due items and saved searches from your current workspace.</p>
 <label className="row"><input type="checkbox" checked={data.digest} disabled={busy} onChange={e=>void change('opportunities:digest',e.target.checked)}/> Daily desktop reminder</label>
 <h3>Priority queue</h3><p className="muted small">Overdue, today and the next seven days. {queue.length} <span>items</span></p>
 {!queue.length?<p className="muted small">No upcoming actions.</p>:<div className="priority-list">{queue.slice(0,20).map(p=><div className="priority-item" key={p.id}><span className={`tag ${p.due==='overdue'?'warn':''}`}>{p.due==='overdue'?'Overdue':p.due==='today'?'Today':'Upcoming'}</span><span translate="no">{p.day} · {p.title}</span>{p.job?<button className="btn small" onClick={()=>onJob(p.job!)}>Open</button>:p.lead?<button className="btn small" onClick={()=>onLead(p.lead!)}>Open</button>:null}</div>)}</div>}
 {workspace!=='career'&&(data.signals??[]).length>0&&<><h3>Recent business signals</h3>{data.signals.map(s=><div key={s.id} className="priority-item"><span translate="no">{s.at.slice(0,10)} · {s.title}</span><button className="btn small" onClick={()=>onLead(s.lead)}>Open</button></div>)}</>}
 {trends.length>0&&<><h3>Local observation trends</h3><p className="muted small">Seven UTC days from your saved records and job alerts, not market-wide hiring or business growth.</p><div className="trend-grid">{trends.map(x=><div key={x.day}><span translate="no">{x.day.slice(5)}</span>{workspace!=='career'&&<div className="trend-row"><progress max={max} value={x.businesses} aria-label="Businesses observed"/><b>{x.businesses}</b></div>}{workspace!=='business'&&<div className="trend-row"><progress max={max} value={x.vacancies} aria-label="Vacancies observed"/><b>{x.vacancies}</b></div>}</div>)}</div><p className="muted small">{workspace!=='career'&&<span>Businesses observed</span>}{workspace==='both'?' · ':''}{workspace!=='business'&&<span>Vacancies observed</span>}</p></>}
 <h3>Saved searches</h3>{workspace!=='career'&&data.watches.map(w=><label key={w.id} className="row"><input type="checkbox" checked={w.enabled} disabled={busy} onChange={e=>void change('opportunities:toggle','watch',w.id,e.target.checked)}/><span translate="no">{w.title} · {w.interval}d</span></label>)}
 {workspace!=='business'&&data.alerts.map(a=><label key={a.id} className="row"><input type="checkbox" checked={a.enabled} disabled={busy} onChange={e=>void change('opportunities:toggle','alert',a.id,e.target.checked)}/><span translate="no">{a.title} · {a.interval}h · {a.unseen}</span></label>)}
 </details>;
}
