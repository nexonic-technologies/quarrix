import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../../../shared/categories';
import { call, json, type Search } from '../api';
import { toast, type Screen } from '../App';
import { Orbs, Sparkline, Bars, CountUp, EmptyArt } from '../Art';
import { Building2, Mail, Phone, MessageCircleReply, MapPin, Map, Database, KeyRound, Sparkles, ArrowRight } from 'lucide-react';

const SOURCES: [string, string, string, typeof Map][] = [
  ['gmaps', 'Google Maps', 'free, slower', Map],
  ['osm', 'OpenStreetMap', 'free, open data', Database],
  ['places', 'Google Places API', 'your key', KeyRound],
];
const STAGES: [string, string][] = [['new', 'New'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['interested', 'Interested'], ['won', 'Won']];

export function Find({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [sources, setSources] = useState<string[]>(['gmaps', 'osm']);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [searches, setSearches] = useState<Search[]>([]);
  const [progress, setProgress] = useState<Record<number, string>>({});
  const [stats, setStats] = useState<any>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    call<Search[]>('search:list').then(setSearches);
    call('stats').then(setStats);
  }, [tick]);
  useEffect(() => {
    const off = (window as any).quarrix?.on((e: string, d: any) => { if (e === 'progress') setProgress((p) => ({ ...p, [d.id]: d.msg })); });
    return off;
  }, []);

  const matches = useMemo(() => {
    const q = category.trim().toLowerCase();
    return (q ? CATEGORIES.filter((c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : CATEGORIES).slice(0, 40);
  }, [category]);

  const start = async () => {
    if (!category.trim()) { catRef.current?.focus(); setOpen(true); toast.push('First, type or pick a kind of business.', true); return; }
    if (!place.trim()) { placeRef.current?.focus(); toast.push('Now type a city or area, for example Austin, Texas.', true); return; }
    if (!sources.length) { toast.push('Choose at least one source.', true); return; }
    await call('search:start', category, place, sources);
    toast.push(`Searching for ${category.toLowerCase()} in ${place}`);
    setSearches(await call('search:list'));
  };


  return (
    <div className="page">
      <div className="finder">
        <div className="finder-art"><Orbs size={150} /></div>
        <div className="finder-text">
          <span className="eyebrow"><Sparkles size={13} /> New search</span>
          <h2>Who are you looking for?</h2>
          <p>Pick a kind of business and a place. Big cities are searched neighbourhood by neighbourhood.</p>
        </div>
        <div className="finder-form">
          <label className="fbox">
            <Building2 size={16} />
            <input
              ref={catRef} aria-label="Type of business" placeholder="Type of business, e.g. Dentists" value={category}
              onChange={(e) => { setCategory(e.target.value); setOpen(true); setHi(0); }}
              onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                if (e.key === 'Enter' && open && matches[hi]) { e.preventDefault(); setCategory(matches[hi].name); setOpen(false); placeRef.current?.focus(); }
              }}
            />
            {open && matches.length > 0 && (
              <div className="suggest" role="listbox">
                {matches.map((c, i) => (
                  <button key={c.name} className={i === hi ? 'on' : ''} onMouseDown={() => { setCategory(c.name); setOpen(false); setTimeout(() => placeRef.current?.focus(), 0); }}>
                    {c.name} <em>{c.group}</em>
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="fbox">
            <MapPin size={16} />
            <input ref={placeRef} aria-label="City or area" placeholder="City or area, e.g. Austin, Texas" value={place} onChange={(e) => setPlace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
          </label>
          <button className="btn primary go" onClick={start}>Search <ArrowRight size={15} /></button>
        </div>
        <div className="finder-foot">
          <span className="muted small">Sources</span>
          {SOURCES.map(([id, label, hint, Icon]) => (
            <span key={id} className="chip" role="button" tabIndex={0} aria-pressed={sources.includes(id)} title={hint}
              onClick={() => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              onKeyDown={(e) => e.key === ' ' && setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}>
              <Icon size={13} /> {label}
            </span>
          ))}
          {!category && !place && <button className="btn link" onClick={() => { setCategory('Dentists'); setPlace('Austin, Texas'); }}>Try an example</button>}
        </div>
      </div>

      {stats && (() => {
        const per: { d: string; leads: number; sent: number }[] = stats.perDay ?? [];
        const replied = (stats.byStatus.replied ?? 0) + (stats.byStatus.interested ?? 0);
        const cards: [string, number, string, typeof Mail, string, number[]][] = [
          ['b1', stats.total, 'businesses saved', Building2, 'var(--violet)', per.map((x) => x.leads)],
          ['b2', stats.withEmail, 'with an email address', Mail, '#06b6d4', []],
          ['b3', stats.withPhone, 'with a phone number', Phone, '#ec4899', []],
          ['b4', replied, 'replied to you', MessageCircleReply, '#f59e0b', per.map((x) => x.sent)],
        ];
        const stageMax = Math.max(1, ...STAGES.map(([k]) => stats.byStatus[k] ?? 0));
        return (
          <>
            <div className="stats">
              {cards.map(([k, n, label, Icon, color, line], i) => (
                <div key={k} className="panel stat" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="stat-icon" style={{ ['--c' as string]: color }}><Icon size={18} /></span>
                  <b><CountUp to={n} /></b><span>{label}</span>
                  {k === 'b2' || k === 'b3' ? <div className="mini-meter" style={{ ['--c' as string]: color }}><i style={{ width: `${stats.total ? (n / stats.total) * 100 : 0}%` }} /><em>{stats.total ? Math.round((n / stats.total) * 100) : 0}%</em></div>
                    : line.some(Boolean) ? <Sparkline data={line} color={color} w={110} h={34} /> : null}
                </div>
              ))}
            </div>
            <div className="bento">
              <div className="panel panel-pad">
                <div className="panel-title"><h2>Leads added</h2><span className="pill">Last 14 days</span></div>
                <Bars data={per.map((x) => x.leads)} labels={per.map((x, i) => (x.d ? new Date(x.d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric' }) : String(i + 1)))} />
              </div>
              <div className="panel panel-pad">
                <div className="panel-title"><h2>Pipeline</h2><button className="btn small ghost" onClick={() => go('leads')}>Open <ArrowRight size={14} /></button></div>
                <div className="pipeline">
                  {STAGES.map(([k, v]) => (
                    <div key={k} className={`stage ${k}`}>
                      <span>{v}</span>
                      <div className="stage-bar"><i style={{ width: `${((stats.byStatus[k] ?? 0) / stageMax) * 100}%` }} /></div>
                      <b>{(stats.byStatus[k] ?? 0).toLocaleString()}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      <div className="section-head"><h2>Recent searches</h2></div>
      {searches.length === 0 ? (
        <div className="panel empty"><EmptyArt /><h3>No searches yet</h3>Type a kind of business and a place above, for example plumbers in Manchester.</div>
      ) : (
        <div className="searches">
          {searches.map((s) => {
            const run = s.status === 'running' || s.status === 'queued';
            const src = json<string[]>(s.sources, []).map((x) => SOURCES.find((y) => y[0] === x)?.[1] ?? x).join(', ');
            return (
              <div key={s.id} className="panel search">
                <span className={`search-icon ${run ? 'run' : ''}`}><MapPin size={18} /></span>
                <div>
                  <h3>{s.category} in {s.place}</h3>
                  <p>{run ? progress[s.id] ?? (s.status === 'queued' ? 'Waiting to start' : 'Starting') : s.error ? s.error : `${src}, ${new Date(s.created_at).toLocaleDateString()}`}</p>
                </div>
                <div className={`bar ${run ? 'run' : ''}`}><i style={{ width: run ? '100%' : s.found ? '100%' : '0%' }} /></div>
                <div className="muted">{s.added} new{s.found > s.added ? `, ${s.found - s.added} already saved` : ''}</div>
                <div className="row">
                  {run ? <button className="btn small" onClick={() => call('search:stop', s.id)}>Stop</button>
                    : <button className="btn small" onClick={() => { sessionStorage.setItem('quarrix.search', String(s.id)); go('leads'); }}>View leads</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
