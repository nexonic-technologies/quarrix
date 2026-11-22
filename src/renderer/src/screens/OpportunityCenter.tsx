import {useEffect,useState} from 'react';
import {call} from '../api';
import {toast} from '../App';
import type {Workspace} from '../../../shared/navigation';
import type {centerOverview} from '../../../main/opportunity-center';
type Overview=ReturnType<typeof centerOverview>;
export function OpportunityCenter({workspace,tick,onJob,onLead}:{workspace:Workspace;tick:number;onJob:(id:string)=>void;onLead:(id:number)=>void}){
 const [data,setData]=useState<Overview|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{setData(null);},[workspace]);
 useEffect(()=>{let alive=true;call<Overview>('opportunities:center').then(r=>{if(alive)setData(r);}).catch(()=>{if(alive)setData(null);});return()=>{alive=false;};},[tick,workspace,revision]);
 useEffect(()=>{const id=setInterval(()=>setRevision(x=>x+1),60000);return()=>clearInterval(id);},[]);
 const change=async(ch:string,...args:unknown[])=>{setBusy(true);try{await call(ch,...args);setRevision(x=>x+1);}catch(e){toast.push(String(e),true);}finally{setBusy(false);}};
 if(!data)return null;
 return <details className="registry-check" data-opportunity-center><summary>Daily opportunity center</summary><p className="muted small">Due items and saved searches from your current workspace.</p>
 <label className="row"><input type="checkbox" checked={data.digest} disabled={busy} onChange={e=>void change('opportunities:digest',e.target.checked)}/> Daily desktop reminder</label>
 {workspace!=='career'&&data.tasks.map(t=><div key={t.id} className="row"><span translate="no">{t.date.slice(0,10)} · {t.title}</span>{t.lead&&<button className="btn small" onClick={()=>onLead(t.lead!)}>Open</button>}</div>)}
 {workspace!=='business'&&data.dates.map((d)=><button className="btn small" key={`${d.id}:${d.kind}`} onClick={()=>onJob(d.id)} translate="no">{d.day} · {d.title} · {d.kind}</button>)}
 {data.notices.map(n=><div key={n.id} translate="no">{n.date} · {n.title} · {n.portal}</div>)}
 <h3>Saved searches</h3>{workspace!=='career'&&data.watches.map(w=><label key={w.id} className="row"><input type="checkbox" checked={w.enabled} disabled={busy} onChange={e=>void change('opportunities:toggle','watch',w.id,e.target.checked)}/><span translate="no">{w.title} · {w.interval}d</span></label>)}
 {workspace!=='business'&&data.alerts.map(a=><label key={a.id} className="row"><input type="checkbox" checked={a.enabled} disabled={busy} onChange={e=>void change('opportunities:toggle','alert',a.id,e.target.checked)}/><span translate="no">{a.title} · {a.interval}h · {a.unseen}</span></label>)}
 </details>;
}
