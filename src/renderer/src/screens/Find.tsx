import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../../../shared/categories';
import { call, json, type Search } from '../api';
import { toast, type Screen } from '../App';

const SOURCES: [string, string, string][] = [
  ['gmaps', 'Google Maps', 'free, slower'],
  ['osm', 'OpenStreetMap', 'free, open data'],
  ['places', 'Google Places API', 'your key'],
];

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

  const width = (v: string, min: number) => `${Math.max(min, v.length + 1)}ch`;

  return (
    <div className="page">
      <div className="finder">
        <div className="sentence">
          <span className="word">Find</span>
          <span className="slot">
            <input
              ref={catRef} aria-label="Type of business" placeholder="type of business" value={category} style={{ width: width(category, 15) }}
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
          </span>
          <span className="word">in</span>
          <span className="slot">
            <input ref={placeRef} aria-label="City or area" placeholder="city or area" value={place} style={{ width: width(place, 11) }} onChange={(e) => setPlace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
          </span>
        </div>
        <div className="finder-foot">
          {SOURCES.map(([id, label, hint]) => (
            <span key={id} className="chip" role="button" tabIndex={0} aria-pressed={sources.includes(id)}
              onClick={() => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              onKeyDown={(e) => e.key === ' ' && setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}>
              {label} <small>{hint}</small>
            </span>
          ))}
          {!category && !place && <button className="btn link-light" onClick={() => { setCategory('Dentists'); setPlace('Austin, Texas'); }}>Try an example</button>}
          <button className="btn go" onClick={start}>Start search</button>
        </div>
      </div>

      {stats && (
        <div className="stats">
          <div className="panel stat"><b>{stats.total.toLocaleString()}</b><span>businesses saved</span></div>
          <div className="panel stat"><b>{stats.withEmail.toLocaleString()}</b><span>with an email address</span></div>
          <div className="panel stat"><b>{stats.withPhone.toLocaleString()}</b><span>with a phone number</span></div>
          <div className="panel stat"><b>{(stats.byStatus.replied ?? 0) + (stats.byStatus.interested ?? 0)}</b><span>replied to you</span></div>
        </div>
      )}

      <div className="page-head"><div className="grow"><h1 style={{ fontSize: 20 }}>Searches</h1></div></div>
      {searches.length === 0 ? (
        <div className="panel empty"><h3>No searches yet</h3>Type a kind of business and a place above, for example plumbers in Manchester.</div>
      ) : (
        <div className="searches">
          {searches.map((s) => {
            const run = s.status === 'running' || s.status === 'queued';
            const src = json<string[]>(s.sources, []).map((x) => SOURCES.find((y) => y[0] === x)?.[1] ?? x).join(', ');
            return (
              <div key={s.id} className="panel search">
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
