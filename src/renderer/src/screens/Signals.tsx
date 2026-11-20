import { useEffect, useState } from 'react';
import { Radar, Store, ServerCrash, ShieldAlert, Globe2, Star, Briefcase, Gauge, PenLine, X, Plus, Trash2, RefreshCw, Eye, Play } from 'lucide-react';
import { call } from '../api';
import { toast, type Screen } from '../App';
import { Avatar, CountUp, EmptyArt } from '../Art';
import { CategoryInputLite } from './SignalsParts';

type Sig = { id: number; lead_id: number; at: string; type: string; level: 'hot' | 'warm' | 'info'; title: string; detail: string; seen: number; name: string; category: string; city: string; country: string; email: string; website: string; domain: string };
type Watch = { id: number; category: string; place: string; every_days: number; last_run: string | null; runs: number; enabled: number; found: number };
const TYPES: Record<string, [string, typeof Store, string]> = {
  new_listing: ['New businesses', Store, 'Just appeared on the map. They need a website, brand and listings set up.'],
  site_down: ['Website down', ServerCrash, 'Customers see an error right now.'],
  ssl: ['Security certificate', ShieldAlert, 'Expiring or broken: browsers will warn visitors.'],
  domain: ['Domain expiring', Globe2, 'Website and email stop if not renewed.'],
  reputation: ['Low rating', Star, 'Under 4 stars on Google: they are losing customers.'],
  hiring: ['Hiring', Briefcase, 'They need a skill you can offer as a service.'],
  slow_site: ['Slow site', Gauge, 'Slow pages lose visitors and rank lower.'],
};
const ago = (iso: string) => { const s = (Date.now() - +new Date(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

export function Signals({ tick, go, openLead }: { tick: number; go: (s: Screen) => void; openLead: (id: number) => void }) {
  const [list, setList] = useState<Sig[]>([]);
  const [type, setType] = useState('');
  const [watches, setWatches] = useState<Watch[]>([]);
  const [adding, setAdding] = useState(false);
  const [w, setW] = useState({ category: '', place: '', every_days: 7 });
  const [scanning, setScanning] = useState(false);
  const load = () => { call<Sig[]>('signals:list', { type }).then(setList); call<Watch[]>('watches:list').then(setWatches); };
  useEffect(() => { load(); }, [type, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => call('signals:seenAll'), 2500); return () => clearTimeout(t); }, []);
  const counts = Object.keys(TYPES).map((k) => [k, list.filter((x) => x.type === k).length] as const);
  const hot = list.filter((x) => x.level === 'hot').length;
  const write = async (sg: Sig) => {
    if (!sg.email) { toast.push('No email for this business yet. Open it to check the website or use WhatsApp.', true); return; }
    const r = await call<{ made: number; errors: string[] }>('draft:create', [sg.lead_id]);
    toast.push(r.made ? 'Email drafted around this signal. It is in Outreach.' : r.errors[0], !r.made);
    if (r.made) go('outreach');
  };
  return (
    <div className="page">
      <div className="sig-hero panel">
        <div className="sig-radar" aria-hidden><i /><i /><i /><b /><span className="dot d1" /><span className="dot d2" /><span className="dot d3" /></div>
        <div className="grow">
          <span className="eyebrow"><Radar size={13} /> Buying signals radar</span>
          <h2><CountUp to={list.length} /> signals · <span className="hot-n"><CountUp to={hot} /> hot</span></h2>
          <p className="muted">Quarrix checks your leads' websites, certificates, domains, ratings and hiring pages, and watches for new businesses, so you reach out at the right moment.</p>
        </div>
        <button className="btn primary" disabled={scanning} onClick={async () => { setScanning(true); toast.push('Scanning your leads. Signals appear as they are found.'); await call('signals:run'); setScanning(false); load(); }}>{scanning ? <><span className="spinner sm" /> Scanning…</> : <><RefreshCw size={14} /> Scan now</>}</button>
      </div>

      <div className="sig-types">
        <button className={!type ? 'on' : ''} onClick={() => setType('')}><Radar size={15} /><span>All</span><b>{list.length}</b></button>
        {counts.map(([k, n]) => { const [label, Icon] = TYPES[k]; return <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(type === k ? '' : k)}><Icon size={15} /><span>{label}</span><b>{n}</b></button>; })}
      </div>

      <div className="sig-layout">
        <div className="sig-list">
          {list.length === 0 && <div className="panel empty"><EmptyArt /><h3>No signals yet</h3>Press Scan now, or add a watch on the right to spot new businesses as they open.</div>}
          {list.map((sg, i) => { const [label, Icon, why] = TYPES[sg.type] ?? [sg.type, Radar, '']; return (
            <div key={sg.id} className={`panel sig ${sg.level} ${sg.seen ? '' : 'new'}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <span className="sig-icon"><Icon size={17} /></span>
              <div className="grow">
                <div className="sig-top"><span className={`lvl ${sg.level}`}>{sg.level}</span><span className="muted small">{label} · {ago(sg.at)}</span></div>
                <b className="sig-title">{sg.title}</b>
                <p>{sg.detail}</p>
                <div className="sig-lead" onClick={() => openLead(sg.lead_id)}><Avatar name={sg.name ?? '?'} size={22} /><span>{sg.name}</span><em>{[sg.category, sg.city, sg.country].filter(Boolean).join(' · ')}</em></div>
                <p className="why">{why}</p>
              </div>
              <div className="sig-actions">
                <button className="btn primary small" onClick={() => write(sg)}><PenLine size={13} /> Write email</button>
                <button className="btn small" onClick={() => openLead(sg.lead_id)}><Eye size={13} /> Open</button>
                <button className="btn ghost small" title="Dismiss" onClick={async () => { await call('signals:update', sg.id, { dismissed: 1 }); load(); }}><X size={14} /></button>
              </div>
            </div>
          ); })}
        </div>

        <div className="panel panel-pad watches">
          <div className="panel-title"><h2><Store size={16} /> New business watch</h2><button className="btn small" onClick={() => setAdding(!adding)}><Plus size={13} /> Add</button></div>
          <p className="muted small">Quarrix searches these again on a schedule. Anything new on the map after the first run becomes a signal.</p>
          {adding && (
            <div className="watch-form">
              <CategoryInputLite value={w.category} onChange={(category) => setW({ ...w, category })} />
              <input className="input" placeholder="City or area, e.g. Islamabad" value={w.place} onChange={(e) => setW({ ...w, place: e.target.value })} />
              <select className="select" value={w.every_days} onChange={(e) => setW({ ...w, every_days: Number(e.target.value) })}><option value={1}>Every day</option><option value={3}>Every 3 days</option><option value={7}>Every week</option><option value={14}>Every 2 weeks</option></select>
              <button className="btn primary small" onClick={async () => { if (!w.category || !w.place) { toast.push('Add a business type and a place.', true); return; } await call('watches:save', { ...w, sources: '["gmaps","osm"]' }); setAdding(false); setW({ category: '', place: '', every_days: 7 }); toast.push('Watching. The first run sets the starting point.'); load(); }}>Start watching</button>
            </div>
          )}
          {watches.length === 0 && !adding && <p className="muted small">No watches yet.</p>}
          {watches.map((x) => (
            <div key={x.id} className="watch">
              <div className="grow"><b>{x.category} in {x.place}</b><span className="muted small">every {x.every_days === 1 ? 'day' : `${x.every_days} days`} · {x.runs ? `${x.runs} runs, ${x.found} new found` : 'first run sets the baseline'}</span></div>
              <button className="btn ghost small" title="Run now" onClick={async () => { await call('watches:save', { id: x.id, last_run: '2000-01-01T00:00:00Z' }); await call('signals:run'); toast.push('Searching now'); load(); }}><Play size={13} /></button>
              <button className="btn ghost small" title="Remove" onClick={async () => { await call('watches:delete', x.id); load(); }}><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="sig-legend">
            {Object.entries(TYPES).map(([k, [label, Icon, why]]) => <div key={k}><Icon size={13} /><span><b>{label}</b> {why}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
