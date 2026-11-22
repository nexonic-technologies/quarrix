import {useEffect,useRef,useState} from 'react';
import {call} from '../api';
import type {Screen} from '../../../shared/navigation';
type Results={leads:{id:number;title:string;detail:string}[];jobs:{id:string;title:string;detail:string}[]};
export function DesktopSearch({nav,workspace,onClose,onGo,onLead,onJob}:{nav:[Screen,string][];workspace:string;onClose:()=>void;onGo:(s:Screen)=>void;onLead:(id:number)=>void;onJob:(id:string)=>void}){
 const [q,setQ]=useState(''),[results,setResults]=useState<Results>({leads:[],jobs:[]});const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{input.current?.focus();},[]);
 useEffect(()=>{let alive=true;setResults({leads:[],jobs:[]});if(q.trim().length<2)return;const timer=setTimeout(()=>call<Results>('desktop:search',q).then(x=>{if(alive)setResults(x??{leads:[],jobs:[]});}).catch(()=>{}),180);return()=>{alive=false;clearTimeout(timer);};},[q]);
 return <div className="scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div role="dialog" aria-modal="true" aria-label="Universal search" className="modal panel-pad desktop-search" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('input,button:not([disabled])')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}}}>
 <div className="row"><label className="field grow"><span>Universal search</span><input ref={input} className="input" value={q} maxLength={120} onChange={e=>setQ(e.target.value)}/></label><button className="btn" onClick={onClose}>Close</button></div>
 <div className="search-results">{nav.filter(([,label])=>label.toLowerCase().includes(q.toLowerCase())).map(([id,label])=><button className="btn ghost" key={id} onClick={()=>onGo(id)}>{label}</button>)}{workspace!=='career'&&results.leads.map(r=><button className="btn ghost" key={'lead'+r.id} onClick={()=>onLead(r.id)} translate="no">{r.title} · {r.detail}</button>)}{workspace!=='business'&&results.jobs.map(r=><button className="btn ghost" key={'job'+r.id} onClick={()=>onJob(r.id)} translate="no">{r.title} · {r.detail}</button>)}</div>
 </div></div>;
}
