// Settings → Sources extras: health check (QF-011), catalog with terms (QF-010, QF-017), daily limits (QF-012)
// and open data feeds (QF-006, QF-007).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { Activity, Plus, Trash2 } from 'lucide-react';

type Info = { id: string; name: string; fields: string; coverage: string; license: string; auth: string; cost: string; freshness: string; restrictions: string; export: boolean; contact: boolean; attribution: string };
type Health = { id: string; name: string; status: 'ok' | 'warn' | 'fail' | 'off'; message: string; fix: string; ms: number; usedToday: number; limit: number;checkedAt:string };
const CHECKABLE=new Set(['osm','gmaps','web','dir','posts','npi','wikidata','tomtom','foursquare','places','opendata']);
const DOT: Record<string, string> = { ok: '#16a34a', warn: '#f59e0b', fail: '#dc2626', off: '#94a3b8' };
const blankFeed = { kind: 'socrata', name: '', url: '', on: true, nameField: '', categoryField: '', addressField: '', cityField: '', phoneField: '', websiteField: '', extraWhere: '' };

export function SourcesPanel({ s, set }: { s: any; set: (path: string, v: unknown) => void }) {
  const [catalog, setCatalog] = useState<Info[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<Health[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [issues,setIssues]=useState(false);
  const [open, setOpen] = useState('');
  useEffect(() => { call<Info[]>('sources:catalog').then((x) => setCatalog(x ?? [])).catch(()=>{}); call<Record<string, number>>('sources:usage').then((x) => setUsage(x ?? {})).catch(()=>{});call<Health[]>('sources:healthSnapshot').then(x=>{if(Array.isArray(x))setHealth(x);}).catch(()=>{}); }, []);

  const check = async (id?:string) => {
    setChecking(true);
    try { const next=await call<Health[]>('sources:health',id);setHealth(old=>id?[...(old??[]).filter(x=>x.id!==id),...next]:next); setUsage((await call('sources:usage')) ?? {}); } catch (e: any) { toast.push(e.message, true); }
    setChecking(false);
  };
  const feeds: any[] = s.openFeeds ?? [];
  const [sdk, setSdk] = useState<{ dir: string; sources: any[]; errors: string[] } | null>(null);
  useEffect(() => { call<any>('sdk:list').then(setSdk); }, []);
  const setFeed = (i: number, k: string, v: unknown) => set('openFeeds', feeds.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  return (
    <>
      <h2 style={{ marginTop: 10 }}>Extra sources</h2>
      <label className="switch"><input type="checkbox" checked={!!s.findWebsites} onChange={(e) => set('findWebsites', e.target.checked)} /> Look up missing websites (accepted only when the page shows the same phone, or the name and city)</label>
      <label className="switch"><input type="checkbox" checked={!!s.npiIndividuals} onChange={(e) => set('npiIndividuals', e.target.checked)} /> NPI registry: list individual practitioners instead of organisations</label>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <h2 style={{ margin: 0 }}>Source health</h2>
        <button className="btn small" onClick={()=>check()} disabled={checking}><Activity size={14} /> {checking ? 'Checking…' : 'Check all sources'}</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Reachability is not proof of valid search results. Checks are on demand and reused for one minute.</p>
      <div className="row" role="status" aria-live="polite">{health&&<><span className="tag">{health.filter(h=>h.status==='ok').length} <span>Reachable</span></span><span className="tag warn">{health.filter(h=>h.status==='fail'||h.status==='warn').length} <span>Needs attention</span></span></>}<label className="switch"><input type="checkbox" checked={issues} onChange={e=>setIssues(e.target.checked)}/> Show issues only</label></div>
      <div className="src-table" role="table">
        {catalog.filter(c=>!issues||health?.some(h=>h.id===c.id&&['fail','warn'].includes(h.status))).map((c) => {
          const h = health?.find((x) => x.id === c.id);
          const limit = s.budgets?.[c.id] ?? 0;
          return (
            <div key={c.id} className="src-row" role="row">
              <button className="src-main" onClick={() => setOpen(open === c.id ? '' : c.id)} aria-expanded={open === c.id}>
                <i className="dot" style={{ background: h ? DOT[h.status] : '#cbd5e1' }} aria-label={h?.status ?? 'not checked'} />
                <b>{c.name}</b>
                <span className="muted small">{h ? `${h.message}${h.ms ? ` · ${h.ms} ms` : ''}` : c.cost}</span>
              </button>
              <label className="src-limit" title={c.auth.includes('key')?'Most requests a day; 0 pauses this optional service':'Most requests a day; 0 means no limit'}>
                <span className="muted small">{usage[c.id] ?? 0} today, limit</span>
                <input className="input" type="number" min={0} value={limit} aria-label={`${c.name} daily request limit`}
                  onChange={(e) => set('budgets', { ...(s.budgets ?? {}), [c.id]: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              {h?.fix && <div className="src-fix">{h.fix}</div>}
              {CHECKABLE.has(c.id)&&<div className="row src-fix"><button className="btn small ghost" disabled={checking} onClick={()=>check(c.id)}>Check source</button>{h?.checkedAt&&<small className="muted"><span>Last checked:</span> <time dateTime={h.checkedAt}>{new Date(h.checkedAt).toLocaleString()}</time></small>}</div>}
              {open === c.id && (
                <dl className="src-info">
                  <dt>Gives</dt><dd>{c.fields}</dd>
                  <dt>Coverage</dt><dd>{c.coverage}</dd>
                  <dt>Licence</dt><dd>{c.license}</dd>
                  <dt>Access</dt><dd>{c.auth} · {c.cost}</dd>
                  <dt>Freshness</dt><dd>{c.freshness}</dd>
                  <dt>Rules</dt><dd>{c.restrictions}</dd>
                  <dt>Allowed</dt><dd>{c.export ? 'Export' : 'No export'} · {c.contact ? 'Contact' : 'No email contact'} · Credit: {c.attribution}</dd>
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Your own sources</h2>
        <span className="row" style={{ gap: 6 }}><button className="btn small ghost" onClick={() => void call('sdk:openDir')}>Open the sources folder</button><button className="btn small ghost" onClick={() => call<any>('sdk:list').then(setSdk)}>Reload</button></span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Add any business API with a JSON file in the sources folder: the link, where the list is, and which field is which. No code runs. See docs/SOURCE_SDK.md in the Quarrix repository.</p>
      {sdk?.errors.map((e) => <div key={e} className="note warn small">{e}</div>)}
      {sdk?.sources.map((x) => (
        <div key={x.id} className="contact-row"><span><b>{x.name}</b> <span className="muted small">{x.license} · credit: {x.attribution}</span></span>
          {x.needsKey ? <input className="input" type="password" placeholder="API key" value={s.sdkKeys?.[x.id] ?? ''} onChange={(e) => set('sdkKeys', { ...(s.sdkKeys ?? {}), [x.id]: e.target.value.trim() })} aria-label={`${x.name} key`} /> : <span />}<span /></div>
      ))}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Open data feeds</h2>
        <button className="btn small" onClick={() => set('openFeeds', [...feeds, { ...blankFeed }])}><Plus size={14} /> Add a feed</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        City and government business lists, for example licence registers. Socrata link: https://data.city.gov/resource/abcd-1234.json. ArcGIS link: …/FeatureServer/0.
        Type the column names exactly as the dataset shows them. Check each dataset's licence on its portal.
      </p>
      {feeds.map((f, i) => (
        <div key={i} className="panel panel-pad feed">
          <div className="grid2">
            <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setFeed(i, 'name', e.target.value)} placeholder="Chicago business licences" /></label>
            <label className="field"><span>Type</span><select className="input" value={f.kind} onChange={(e) => setFeed(i, 'kind', e.target.value)}><option value="socrata">Socrata</option><option value="arcgis">ArcGIS</option></select></label>
          </div>
          <label className="field"><span>Link</span><input className="input" value={f.url} onChange={(e) => setFeed(i, 'url', e.target.value)} /></label>
          <div className="grid3">
            {([['nameField', 'Name column'], ['categoryField', 'Type/category column'], ['cityField', 'City column'], ['addressField', 'Address column'], ['phoneField', 'Phone column'], ['websiteField', 'Website column']] as const).map(([k, l]) => (
              <label key={k} className="field"><span>{l}</span><input className="input" value={f[k]} onChange={(e) => setFeed(i, k, e.target.value.replace(/[^\w.]/g, ''))} /></label>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="switch"><input type="checkbox" checked={f.on} onChange={(e) => setFeed(i, 'on', e.target.checked)} /> Use in searches</label>
            <button className="btn small ghost" onClick={() => set('openFeeds', feeds.filter((_, j) => j !== i))}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      ))}
    </>
  );
}
