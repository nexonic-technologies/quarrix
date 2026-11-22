import { useEffect, useState } from 'react';
import { ShieldCheck, Building2, Briefcase, ArrowRight } from 'lucide-react';
import { call } from '../api';
import type { RegistryMatch } from '../../../shared/verified';
import type { Workspace } from '../../../shared/navigation';
import { RegionalSources } from './GlobalData';
import { OpportunityCenter } from './OpportunityCenter';
import {spotlight,spotlightReset} from '../Art';

type Overview={sample:number;total:number;review:number;stale:number;leads:{id:number;name:string;city:string;grade:string}[];jobs:{id:string;title:string;company:string;match:number}[]};
export function OpportunityHome({ onChoose,workspace,tick,onLead,onJob }: { onChoose: (mode: Workspace) => void;workspace:Workspace;tick:number;onLead:(id:number)=>void;onJob:(id:string)=>void }) {
  const [overview,setOverview]=useState<Overview|null>(null);
  useEffect(()=>{let alive=true;call<Overview>('opportunities:overview').then(r=>{if(alive)setOverview(r);}).catch(()=>{if(alive)setOverview(null);});return()=>{alive=false;};},[workspace,tick]);
  return <section className="opportunity-home" data-opportunity-home onMouseMove={spotlight} onMouseLeave={spotlightReset}>
    <div className="opportunity-heading"><ShieldCheck size={19}/><h2>Discover opportunities</h2></div>
    <div className="opportunity-options">
      <button className="opportunity-option" onClick={()=>onChoose('business')}><Building2 size={25}/><span><b>Find customers</b><small>Find businesses and review their evidence.</small></span><ArrowRight size={18}/></button>
      <button className="opportunity-option" onClick={()=>onChoose('career')}><Briefcase size={25}/><span><b>Find a job</b><small>Explore vacancies and check listing evidence.</small></span><ArrowRight size={18}/></button>
    </div>
    {overview&&<details className="registry-check"><summary>Recommended opportunities</summary>
      {workspace!=='career'&&<><p className="muted small">Lead quality sample: {overview.sample}/{overview.total} · {overview.review} <span>Review evidence</span> · {overview.stale} <span>Needs a fresh check</span></p>{overview.leads.map(l=><button key={l.id} className="btn small" onClick={()=>onLead(l.id)} translate="no">{l.name} · {l.city} · {l.grade}</button>)}</>}
      {workspace!=='business'&&<>{overview.jobs.map(j=><button key={j.id} className="btn small" onClick={()=>onJob(j.id)} translate="no">{j.title} · {j.company} · {j.match}%</button>)}<p className="muted small">Recommendations use recorded match scores, not confirmed eligibility or availability.</p></>}
    </details>}
    <OpportunityCenter workspace={workspace} tick={tick} onLead={onLead} onJob={onJob}/>
  </section>;
}

export function RegistryCheck({ name, country }: { name: string; country?: string }) {
  const [legal,setLegal]=useState(name), [code,setCode]=useState(/^[A-Z]{2}$/.test(country ?? '')?country!:'');
  const [result,setResult]=useState<{matches:RegistryMatch[];checkedAt:string}|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  return <details className="registry-check"><summary>Company registry lookup</summary>
    <p className="muted small">Search the public GLEIF legal entity register. Not every business has an LEI. A matching name does not confirm a website, contact or vacancy.</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setFailed(false);setResult(null);try{setResult(await call('entity:registry',legal,code));}catch{setFailed(true);}finally{setBusy(false);}}}>
      <label className="field"><span>Legal company name</span><input className="input" value={legal} maxLength={200} disabled={busy} onChange={e=>{setLegal(e.target.value);setResult(null);setFailed(false);}}/></label>
      <label className="field"><span>Country code</span><input className="input" placeholder="US" value={code} maxLength={2} disabled={busy} onChange={e=>{setCode(e.target.value.toUpperCase());setResult(null);setFailed(false);}}/></label>
      <button className="btn small" disabled={busy||!legal.trim()||!/^[A-Z]{2}$/.test(code)}>{busy?'Checking…':'Check registry'}</button>
    </form>
    {failed&&<p role="alert">Registry unavailable.</p>}
    {result&&<div aria-live="polite"><p className="muted small">{result.matches.length? 'Name and country matches':'No exact match returned'}. <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString()}</time></p>{result.matches.map(m=><div className="panel panel-pad" key={m.lei} translate="no"><b>{m.name}</b><p>{m.city}, {m.country} · {m.status} · {m.registration}</p><p>{m.updated.slice(0,10)}</p><button className="btn small" onClick={()=>void call('open:external',`https://search.gleif.org/#/record/${m.lei}`)}>{m.lei}</button></div>)}</div>}
    <RegionalSources kind="registry"/>
  </details>;
}
