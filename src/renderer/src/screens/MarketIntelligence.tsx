import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import type { MarketGroup, MarketReport,marketInsights } from '../../../main/market';

export function MarketIntelligence({ tick, countries, categories }: { tick: number; countries: string[]; categories: string[] }) {
  const [group, setGroup] = useState<MarketGroup>('category');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState(false);
  const [insights,setInsights]=useState<ReturnType<typeof marketInsights>|null>(null);
  useEffect(()=>{let alive=true;setInsights(null);call<ReturnType<typeof marketInsights>>('market:insights',country,category).then(r=>{if(alive)setInsights(r);}).catch(()=>{});return()=>{alive=false;};},[country,category,tick]);
  const [sales,setSales]=useState<{currency:string;deals:number;won:number;lost:number;wonValue:number;openValue:number}[]>([]);
  useEffect(()=>{let alive=true;setSales([]);call<typeof sales>('market:sales').then(x=>{if(alive&&Array.isArray(x))setSales(x);}).catch(()=>{});return()=>{alive=false;};},[tick]);
  useEffect(() => {
    let alive = true; setReport(null); setError(false);
    call<MarketReport>('market:report', group, country, category).then(r => { if (alive) { if (r?.total && Array.isArray(r.groups)) setReport(r); else setError(true); } }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [group, country, category, tick]);
  const total = report?.total;
  const n = (v: number) => v.toLocaleString();
  return <section className="panel panel-pad" data-market-intelligence style={{ marginBottom: 12 }}>
    <h2>Market intelligence</h2>
    <p className="muted small">Compare the records already stored in this workspace. These samples do not establish market size, market share or revenue potential.</p>
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <label>Group by<select className="select" value={group} onChange={e => setGroup(e.target.value as MarketGroup)}><option value="category">Category</option><option value="country">Country</option><option value="city">City</option><option value="source">Source</option><option value="company">Companies</option><option value="grade">Grade</option><option value="status">Status</option></select></label>
      <label>Country<select className="select" value={country} onChange={e => setCountry(e.target.value)}><option value="">Any country</option>{countries.map(c => <option key={c} translate="no">{c}</option>)}</select></label>
      <label>Category<select className="select" value={category} onChange={e => setCategory(e.target.value)}><option value="">Any category</option>{categories.map(c => <option key={c} translate="no">{c}</option>)}</select></label>
      <button className="btn" disabled={!report} onClick={async () => { try { const n = await call<number | null>('market:export', group, country, category); if (n !== null) toast.push('Market report exported'); } catch (e: any) { toast.push(e.message, true); } }}>Export market report</button>
      {(['pdf','docx'] as const).map(f=><button key={f} className="btn" disabled={!report} onClick={async()=>{try{if(await call('market:document',group,country,category,f))toast.push('Saved');}catch(e:any){toast.push(e.message,true);}}}>{f==='pdf'?'Export PDF':'Save as Word'}</button>)}
    </div>
    {sales.length>0&&<details><summary>Sales by currency</summary><p className="muted small">Recorded deal values only; currencies are never combined.</p>{sales.map(s=><p key={s.currency} translate="no">{s.currency} · {s.deals} deals · {s.won} won · {s.lost} lost · {s.wonValue.toLocaleString()} won / {s.openValue.toLocaleString()} open</p>)}</details>}
    {insights&&<details><summary>Customer repeat wins and market comparison</summary><p className="muted small">Adjacent 90-day periods from stored records. Repeat wins are not subscription retention or churn.</p><div className="grid2"><div className="panel panel-pad"><b>Recent records</b><h2>{insights.observations.recent}</h2><p><span>Previous period:</span> {insights.observations.prior}</p></div><div className="panel panel-pad"><b>Repeat customers</b><h2>{insights.repeatCustomers}/{insights.priorCustomers}</h2><p>{insights.repeatRate==null?'Unknown':insights.repeatRate+'%'}</p></div></div></details>}
    {error ? <p role="alert">Market report unavailable.</p> : !total ? <p aria-live="polite">Loading market report…</p> : <>
      <div className="kpis" style={{ margin: '12px 0' }}><div className="panel panel-pad"><span className="muted small">Business records</span><h2>{n(total.records)}</h2></div><div className="panel panel-pad"><span className="muted small">Linked companies</span><h2>{n(total.companies)}</h2></div><div className="panel panel-pad"><span className="muted small">Unlinked records</span><h2>{n(total.unlinked)}</h2></div><div className="panel panel-pad"><span className="muted small">Checked in last 90 days</span><h2>{n(total.recentlyChecked)}</h2></div></div>
      <p className="muted small">Records with a website: {n(total.website)} · <span>Rated records:</span> {n(total.rated)} · <span>Scored records:</span> {n(total.scored)} · <span>Won records:</span> {n(total.won)}</p>
      <p className="muted small">Mean recorded fit uses scored records only. Unknown data is not assumed to be zero. Company counts may overlap across groups.</p>
      <div className="table-wrap"><table className="leads"><thead><tr><th>Group</th><th>Records</th><th>Linked companies</th><th>Websites</th><th>Rated records</th><th>Recent checks</th><th>Scored records</th><th>Mean fit</th><th>Won</th></tr></thead><tbody>{report.groups.map(r => <tr key={r.key}><td translate="no">{r.label}</td><td>{n(r.records)}</td><td>{n(r.companies)}</td><td>{n(r.website)}</td><td>{n(r.rated)}</td><td>{n(r.recentlyChecked)}</td><td>{n(r.scored)}</td><td>{r.averageFit == null ? '—' : n(r.averageFit)}</td><td>{n(r.won)}</td></tr>)}</tbody></table></div>
      {!report.groups.length && <p>No records match these filters.</p>}{report.groupCount > report.groups.length && <p className="muted small">Showing the 100 largest groups. Totals include every matching record.</p>}
      <details><summary>Competitor comparison</summary><p className="muted small">Compare observed ratings and website coverage in this stored sample, not market share.</p>{report.groups.slice(0,20).map(g=><p key={g.key} translate="no">{g.label}: {g.averageRating??'—'}/5 ({g.rated}/{g.records}) · {g.website}/{g.records} websites</p>)}</details>
    </>}
  </section>;
}
