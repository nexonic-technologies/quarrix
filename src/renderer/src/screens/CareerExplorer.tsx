import { useMemo,useState } from 'react';
import { Compass, Search } from 'lucide-react';
import { exploreCareers, OCCUPATION_COUNT, learningPlan,relatedOccupations,type CareerMatch } from '../../../shared/career-intelligence';

type Profile = { title: string; roles: string[]; skills: string[] };

export function CareerExplorer({ profile, onSearch, busy }: { profile?: Profile; onSearch: (title: string) => void; busy: boolean }) {
  const [title, setTitle] = useState('');
  const [skills, setSkills] = useState('');
  const [matches, setMatches] = useState<CareerMatch[] | null>(null);
  const [usedCv, setUsedCv] = useState(false);
  const [selected,setSelected]=useState('');
  const transitions=useMemo(()=>selected?relatedOccupations(selected,skills.split(/[,;\n]/)):[],[selected,skills]);
  const reset = () => { setMatches(null); setUsedCv(false);setSelected(''); };
  return <details data-career-explorer className="panel panel-pad" style={{ marginBottom: 12 }}>
    <summary style={{ cursor: 'pointer' }}><b><Compass size={16} style={{ verticalAlign: 'middle' }} /> Explore your career paths</b></summary>
    <p className="muted small">Explore {OCCUPATION_COUNT.toLocaleString()} occupations using your real skills and interests, even without a CV. Analysis stays on this computer.</p>
    <form onSubmit={e => { e.preventDefault(); setMatches(exploreCareers({ titles: [title, ...(usedCv ? profile?.roles ?? [] : [])], skills: skills.split(/[,;\n]/).map(s => s.trim()) })); }}>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'end', gap: 10 }}>
        <label className="grow">Current or target role<input className="input" value={title} maxLength={150} placeholder="e.g. Accountant" onChange={e => { setTitle(e.target.value); reset(); }} /></label>
        <label className="grow">Skills (comma-separated)<input className="input" value={skills} maxLength={2000} placeholder="e.g. Excel, accounting" onChange={e => { setSkills(e.target.value); reset(); }} /></label>
        {profile && <button type="button" className="btn ghost" onClick={() => { setTitle(profile.title || profile.roles[0] || ''); setSkills(profile.skills.join(', ')); setUsedCv(true); setMatches(null); }}>Use my CV</button>}
        <button className="btn primary" disabled={!title.trim() && !skills.trim()} type="submit">Explore careers</button>
      </div>
    </form>
    {matches !== null && <div aria-live="polite" style={{ marginTop: 12 }}>
      <p className="muted small">Ranked by title and recorded skill matches, not hiring probability or proven eligibility. Skills to explore are not claimed deficiencies.</p>
      {!matches.length && <p>No supported career matches. Try a more specific role or add relevant skills.</p>}
      <div style={{ display: 'grid', gap: 8 }}>{matches.map(m => <div key={m.id} className="panel panel-pad">
        <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}><div className="grow"><b translate="no">{m.title}</b><div className="muted small">Occupation {m.id} · {m.score}/100 exploration score</div></div><button className="btn small" disabled={busy} onClick={() => onSearch(m.title)}><Search size={14} /> Find jobs</button></div>
        <div className="small" style={{ marginTop: 6 }}><b>Matching evidence: </b><span translate="no">{[...m.titleMatches, ...m.skills, ...m.tools].join(', ') || 'No direct skill evidence'}</span></div>
        {!!m.explore.length && <div className="small muted"><b>Skills to explore: </b><span translate="no">{m.explore.join(', ')}</span></div>}
        {!!m.explore.length&&<details className="registry-check"><summary>Three-week learning plan</summary><p className="muted small">Suggested study topics from the occupation catalog. Confirm prerequisites and local qualifications yourself.</p>{learningPlan(m).map(p=><div key={p.skill} className="row"><span>Week</span> {p.week} · <b translate="no">{p.skill}</b></div>)}<p className="muted small">Practise a real task, record an example and prepare to explain what you learned.</p></details>}
        <button className="btn small" aria-expanded={selected===m.id} onClick={()=>setSelected(selected===m.id?'':m.id)}>Explore related roles</button>
        {selected===m.id&&<div className="career-map"><p className="muted small">Related roles share catalog tools. These are exploration options, not guaranteed promotions.</p>{transitions.length===0?<p>No supported career matches.</p>:transitions.map(r=><article className="panel panel-pad" key={r.id}><b translate="no">{r.title}</b><p className="small"><span>Shared tools:</span> <span translate="no">{r.shared.join(', ')}</span></p>{r.roadmap.map(p=><p key={p.skill} className="small"><span>Week</span> {p.week} · <span translate="no">{p.skill}</span></p>)}<button className="btn small" disabled={busy} onClick={()=>onSearch(r.title)}>Find jobs</button></article>)}</div>}
      </div>)}</div>
    </div>}
    <p className="muted small" style={{ marginBottom: 0 }}>Occupation data: <a href="https://www.onetcenter.org/database.html" target="_blank" rel="noreferrer">O*NET® 31.0 Database</a>, U.S. Department of Labor, Employment and Training Administration, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>, adapted by Nexonic Technologies. US occupational definitions; not a local licensing guide. USDOL/ETA has not endorsed these modifications.</p>
  </details>;
}
