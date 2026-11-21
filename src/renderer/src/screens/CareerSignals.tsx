// Job signals (0.24): the career workspace's radar. New postings that fit the CV, the person's own alerts and
// followed employers, scored against the CV. The profile search runs every 6 hours while Quarrix is open.
import { useEffect, useState } from 'react';
import { BellRing, Sparkles, Bell, Building2, RefreshCw, ExternalLink, Bookmark, X, RotateCcw } from 'lucide-react';
import { call } from '../api';
import { toast, type Screen } from '../App';
import { Avatar, CountUp, EmptyArt } from '../Art';
import { Combo } from '../Combo';
import { CountryInput, CityInput } from '../CityInput';
import { COUNTRIES } from '../countries';
import { JOB_TITLES } from '../../../shared/jobtitles';

type Sig = { id: string; at: string; isNew: boolean; type: 'match' | 'alert' | 'employer'; level: 'hot' | 'warm' | 'info'; match: number | null; why: string; alert: string; job: any };
type Radar = { id: number | null; keywords: string; country: string; countryName: string; city: string; edited: boolean; lastRun: string | null; nextRun: string | null; error: string; hasCv: boolean };
const TYPES: Record<Sig['type'], [string, typeof Bell, string]> = {
  match: ['Fits your profile', Sparkles, 'From the search built from your CV.'],
  alert: ['Your alerts', Bell, 'From the job alerts you saved in Job search.'],
  employer: ['Followed employers', Building2, 'A company you follow posted a new job.'],
};
const TITLES = JOB_TITLES.map((t) => ({ value: t.name, label: t.name, hint: t.group }));
const ago = (iso: string | null) => { if (!iso) return 'never'; const s = (Date.now() - +new Date(iso)) / 1000; return s < 0 ? 'soon' : s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

export function CareerSignals({ tick, go, onSeen }: { tick: number; go: (s: Screen) => void; onSeen: () => void }) {
  const [list, setList] = useState<Sig[]>([]);
  const [type, setType] = useState<'' | Sig['type']>('');
  const [radar, setRadar] = useState<Radar | null>(null);
  const [form, setForm] = useState({ keywords: '', country: '', city: '' });
  const [scanning, setScanning] = useState(false);
  const load = () => { call<Sig[]>('career:signals').then(setList); call<Radar>('career:radar').then((r) => { setRadar(r); setForm({ keywords: r.keywords, country: r.country, city: r.city }); }); };
  useEffect(() => { load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void call('career:seen').then(onSeen); }, 2500); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = type ? list.filter((x) => x.type === type) : list;
  const hot = list.filter((x) => x.level === 'hot').length;
  const scan = async () => {
    setScanning(true); toast.push('Searching the job boards. New matches appear here.');
    try { const hits = await call<[string, number][]>('career:scan'); const n = hits.reduce((a, [, k]) => a + k, 0); toast.push(n ? `${n} new job${n > 1 ? 's' : ''} found` : 'Search finished. The first run sets the starting point; later runs show only new postings as New.'); } catch (e: any) { toast.push(e.message, true); }
    setScanning(false); load();
  };
  const saveRadar = async () => {
    const r = await call<Radar>('career:saveRadar', { ...form, countryName: COUNTRIES.find((c) => c[0] === form.country)?.[1] ?? '' });
    setRadar(r); toast.push('Saved. Press Scan now to search with it.');
  };

  return (
    <div className="page">
      <div className="sig-hero panel">
        <div className="sig-radar" aria-hidden><i /><i /><i /><b /><span className="dot d1" /><span className="dot d2" /><span className="dot d3" /></div>
        <div className="grow">
          <span className="eyebrow"><BellRing size={13} /> Job signals</span>
          <h2><CountUp to={list.length} /> jobs · <span className="hot-n"><CountUp to={hot} /> strong matches</span></h2>
          <p className="muted">Quarrix searches the job boards for {radar?.keywords ? <b>{radar.keywords}</b> : 'all jobs'}{radar?.countryName ? <> in <b>{radar.countryName}</b></> : ''} every 6 hours, checks your alerts and followed employers, and scores each posting against your CV.</p>
        </div>
        <button className="btn primary" disabled={scanning} onClick={scan}>{scanning ? <><span className="spinner sm" /> Searching…</> : <><RefreshCw size={14} /> Scan now</>}</button>
      </div>

      <div className="sig-types">
        <button className={!type ? 'on' : ''} onClick={() => setType('')}><BellRing size={15} /><span>All</span><b>{list.length}</b></button>
        {(Object.keys(TYPES) as Sig['type'][]).map((k) => { const [label, Icon] = TYPES[k]; return <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(type === k ? '' : k)}><Icon size={15} /><span>{label}</span><b>{list.filter((x) => x.type === k).length}</b></button>; })}
      </div>

      <div className="sig-layout">
        <div className="sig-list">
          {shown.length === 0 && <div className="panel empty"><EmptyArt /><h3>No job signals yet</h3>Press Scan now. {radar?.hasCv ? '' : 'Upload your CV in Job search so matches are scored and the search uses your target role.'}</div>}
          {shown.map((sg, i) => { const [label, Icon, why] = TYPES[sg.type]; const j = sg.job; return (
            <div key={sg.id} className={`panel sig ${sg.level} ${sg.isNew ? 'new' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <span className="sig-icon"><Icon size={17} /></span>
              <div className="grow">
                <div className="sig-top"><span className={`lvl ${sg.level}`}>{sg.match != null ? `${sg.match}% match` : sg.level}</span><span className="muted small">{label} · {ago(sg.at)}</span></div>
                <b className="sig-title">{j.title}</b>
                <div className="sig-lead"><Avatar name={j.company || '?'} size={22} /><span>{j.company || 'Company not listed'}</span><em>{[j.location, j.workplace === 'remote' ? 'Remote' : '', j.salary].filter(Boolean).join(' · ')}</em></div>
                <p className="why">{sg.why || why}{sg.type === 'alert' ? ` (${sg.alert})` : ''}</p>
              </div>
              <div className="sig-actions">
                {j.url && <button className="btn primary small" onClick={() => window.open(j.url, '_blank')}><ExternalLink size={13} /> Open posting</button>}
                <button className="btn small" onClick={async () => { await call('jobs:save', { ...j, status: 'Saved' }); toast.push('Saved. It is in Job search → Saved.'); }}><Bookmark size={13} /> Save</button>
                <button className="btn ghost small" title="Dismiss" aria-label="Dismiss job signal" onClick={async () => { await call('career:dismiss', sg.id); load(); }}><X size={14} /></button>
              </div>
            </div>
          ); })}
        </div>

        <div className="panel panel-pad watches">
          <div className="panel-title"><h2><Sparkles size={16} /> Your profile search</h2></div>
          <p className="muted small">{radar?.edited ? 'Using the role you set here.' : radar?.hasCv ? 'Built from your CV. Change it here if you want a different role.' : 'No CV yet, so it watches all jobs. Upload your CV in Job search, or pick a role here.'}</p>
          <div className="watch-form">
            <Combo free typed options={TITLES} value={form.keywords} onChange={(keywords) => setForm({ ...form, keywords })} icon={<Sparkles size={15} />} placeholder="Job title (empty = all jobs)" />
            <CountryInput value={form.country} onChange={(country) => setForm({ ...form, country, city: '' })} />
            <CityInput country={form.country} value={form.city} onChange={(city) => setForm({ ...form, city })} placeholder="City (optional)" />
            <div className="row">
              <button className="btn primary small" onClick={saveRadar}>Save</button>
              {radar?.edited && radar.hasCv && <button className="btn ghost small" onClick={async () => { setRadar(await call<Radar>('career:resetRadar')); load(); }}><RotateCcw size={13} /> Use my CV</button>}
              <button className="btn ghost small" onClick={() => go('jobs')}>Alerts and employers</button>
            </div>
          </div>
          <p className="muted small">Last search {ago(radar?.lastRun ?? null)}.{radar?.error ? ` ${radar.error}` : ''}</p>
          <div className="sig-legend">
            {Object.entries(TYPES).map(([k, [label, Icon, why]]) => <div key={k}><Icon size={13} /><span><b>{label}</b> {why}</span></div>)}
            <div><Sparkles size={13} /><span><b>Match</b> 70% or more is a strong match, 45% a fair one, from the skills and roles in your CV.</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
