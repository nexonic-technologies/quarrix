import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import type { MarketGroup, MarketReport } from '../../../main/market';

export function MarketIntelligence({ tick, countries, categories }: { tick: number; countries: string[]; categories: string[] }) {
  const [group, setGroup] = useState<MarketGroup>('category');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState(false);
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
      <label>Group by<select className="select" value={group} onChange={e => setGroup(e.target.value as MarketGroup)}><option value="category">Category</option><option value="country">Country</option><option value="city">City</option><option value="source">Source</option><option value="company">Companies</option></select></label>
      <label>Country<select className="select" value={country} onChange={e => setCountry(e.target.value)}><option value="">Any country</option>{countries.map(c => <option key={c} translate="no">{c}</option>)}</select></label>
      <label>Category<select className="select" value={category} onChange={e => setCategory(e.target.value)}><option value="">Any category</option>{categories.map(c => <option key={c} translate="no">{c}</option>)}</select></label>
      <button className="btn" disabled={!report} onClick={async () => { try { const n = await call<number | null>('market:export', group, country, category); if (n !== null) toast.push('Market report exported'); } catch (e: any) { toast.push(e.message, true); } }}>Export market report</button>
    </div>
    {error ? <p role="alert">Market report unavailable.</p> : !total ? <p aria-live="polite">Loading market report…</p> : <>
      <div className="kpis" style={{ margin: '12px 0' }}><div className="panel panel-pad"><span className="muted small">Business records</span><h2>{n(total.records)}</h2></div><div className="panel panel-pad"><span className="muted small">Linked companies</span><h2>{n(total.companies)}</h2></div><div className="panel panel-pad"><span className="muted small">Unlinked records</span><h2>{n(total.unlinked)}</h2></div><div className="panel panel-pad"><span className="muted small">Checked in last 90 days</span><h2>{n(total.recentlyChecked)}</h2></div></div>
      <p className="muted small">Records with a website: {n(total.website)} · <span>Rated records:</span> {n(total.rated)} · <span>Scored records:</span> {n(total.scored)} · <span>Won records:</span> {n(total.won)}</p>
      <p className="muted small">Mean recorded fit uses scored records only. Unknown data is not assumed to be zero. Company counts may overlap across groups.</p>
      <div className="table-wrap"><table className="leads"><thead><tr><th>Group</th><th>Records</th><th>Linked companies</th><th>Websites</th><th>Rated records</th><th>Recent checks</th><th>Scored records</th><th>Mean fit</th><th>Won</th></tr></thead><tbody>{report.groups.map(r => <tr key={r.key}><td translate="no">{r.label}</td><td>{n(r.records)}</td><td>{n(r.companies)}</td><td>{n(r.website)}</td><td>{n(r.rated)}</td><td>{n(r.recentlyChecked)}</td><td>{n(r.scored)}</td><td>{r.averageFit == null ? '—' : n(r.averageFit)}</td><td>{n(r.won)}</td></tr>)}</tbody></table></div>
      {!report.groups.length && <p>No records match these filters.</p>}{report.groupCount > report.groups.length && <p className="muted small">Showing the 100 largest groups. Totals include every matching record.</p>}
    </>}
  </section>;
}
