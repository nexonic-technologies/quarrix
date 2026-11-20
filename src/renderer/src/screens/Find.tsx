import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../../../shared/categories';
import { call, json, type Search } from '../api';
import { toast, type Screen } from '../App';
import { HeroBg, spotlight, spotlightReset, useSceneMode, RiseText, RotatingWord, Sparkline, Bars, CountUp, EmptyArt } from '../Art';
import { RadarToy } from '../Toy';
import { CityInput, CountryInput } from '../CityInput';
import { Building2, Mail, Phone, MessageCircleReply, MapPin, Map, Database, KeyRound, Sparkles, ArrowRight, Globe2, BookOpen, Megaphone, ChevronRight, Stethoscope, Library, Landmark, Crosshair, Eye, Layers, Pause, Play } from 'lucide-react';
import { COUNTRIES } from '../countries';
import { LiveSearch } from './LiveSearch';
import { BatchModal, MapPicker, PreviewModal, type Geo } from './FindTools';

const SOURCES: [string, string, string, typeof Map][] = [
  ['gmaps', 'Google Maps', 'free, slower', Map],
  ['osm', 'OpenStreetMap', 'free, open data', Database],
  ['web', 'Web search', 'Bing and DuckDuckGo', Globe2],
  ['dir', 'Directories', 'Hotfrog, Yelp, Yellow Pages, Yell', BookOpen],
  ['tomtom', 'TomTom', 'free key, phones and websites', KeyRound],
  ['foursquare', 'Foursquare', 'free key, phones, websites, socials', KeyRound],
  ['posts', 'Job posts', 'people asking for help now', Megaphone],
  ['places', 'Google Places API', 'your key', KeyRound],
  ['npi', 'NPI registry', 'US healthcare, official', Stethoscope],
  ['wikidata', 'Wikidata', 'notable organisations, open data', Library],
  ['opendata', 'Open data feeds', 'city licence registers you add', Landmark],
];
const STAGES: [string, string][] = [['new', 'New'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['interested', 'Interested'], ['won', 'Won']];

export function Find({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [sources, setSources] = useState<string[]>(['gmaps', 'osm', 'web', 'dir']);
  const [country, setCountry] = useState('');
  const [live, setLive] = useState<Search | null>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [searches, setSearches] = useState<Search[]>([]);
  const [progress, setProgress] = useState<Record<number, string>>({});
  const [stats, setStats] = useState<any>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [tool, setTool] = useState<'' | 'map' | 'preview' | 'batch'>('');
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

  const mode = useSceneMode(searches.some((x) => x.status === 'running' || x.status === 'queued'), focused);
  const matches = useMemo(() => {
    const q = category.trim().toLowerCase();
    return (q ? CATEGORIES.filter((c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : CATEGORIES).slice(0, 40);
  }, [category]);

  const whereText = () => [place.trim(), COUNTRIES.find((c) => c[0] === country)?.[1] ?? ''].filter(Boolean).join(', ');
  const ready = () => {
    if (!category.trim()) { catRef.current?.focus(); setOpen(true); toast.push('First, type or pick a kind of business.', true); return false; }
    if (!geo && !whereText()) { placeRef.current?.focus(); toast.push('Type a city, pick a country, or choose an area on the map.', true); return false; }
    if (!sources.length) { toast.push('Choose at least one source.', true); return false; }
    return true;
  };
  const start = async () => {
    if (!ready()) return;
    const where = whereText();
    const id = geo
      ? await call<number>('search:geo', category, geo.poly ? `drawn area near ${where || `${geo.lat}, ${geo.lon}`}` : `within ${geo.km} km of ${where || `${geo.lat}, ${geo.lon}`}`, geo, sources)
      : await call<number>('search:start', category, where, sources);
    const list = await call<Search[]>('search:list');
    setSearches(list);
    setLive(list.find((x) => x.id === id) ?? null);
  };


  return (
    <div className="page">
      <div className="finder" data-mode={mode} data-kind="leads" onMouseMove={spotlight} onMouseLeave={spotlightReset} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <HeroBg kind="leads" mode={mode} />
        <RadarToy kind="leads" />
        <div className="finder-text">
          <span className="eyebrow" key={mode}><Sparkles size={13} /> {mode === 'busy' ? 'Finding businesses…' : mode === 'done' ? 'Search finished' : 'New search'}</span>
          <h2 className="hero-title"><RiseText text="Find" /> <RotatingWord words={['dentists', 'restaurants', 'law firms', 'clinics', 'salons', 'real estate agents', 'startups']} /> <RiseText text="that need you." /></h2>
          <RiseText as="p" text="Pick a kind of business and a place. Big cities are searched neighbourhood by neighbourhood." />
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
          <CountryInput value={country} onChange={setCountry} />
          <CityInput country={country} value={place} onChange={setPlace} onEnter={start} placeholder={country ? 'City or area (empty = whole country)' : 'City or area, e.g. Austin, Texas'} />
          <button className="btn primary go" onClick={start}>Search <ArrowRight size={15} /></button>
        </div>
        <div className="finder-foot">
          <span className="chip" role="button" tabIndex={0} aria-pressed={!!geo} onClick={() => setTool('map')} onKeyDown={(e) => e.key === 'Enter' && setTool('map')} title="Search a radius on the map"><Crosshair size={13} /> {geo ? (geo.poly ? 'Drawn area' : `${geo.km} km area`) : 'Map area'}</span>
          <span className="chip" role="button" tabIndex={0} onClick={() => ready() && setTool('preview')} onKeyDown={(e) => e.key === 'Enter' && ready() && setTool('preview')} title="See a few real results and an estimate first"><Eye size={13} /> Preview</span>
          <span className="chip" role="button" tabIndex={0} onClick={() => setTool('batch')} onKeyDown={(e) => e.key === 'Enter' && setTool('batch')} title="Many business types in many places"><Layers size={13} /> Batch</span>
          <span className="muted small" style={{ marginLeft: 6 }}>Sources</span>
          {SOURCES.map(([id, label, hint, Icon]) => (
            <span key={id} className="chip" role="button" tabIndex={0} aria-pressed={sources.includes(id)} title={hint}
              onClick={() => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              onKeyDown={(e) => e.key === ' ' && setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}>
              <Icon size={13} /> {label}
            </span>
          ))}
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
              <div key={s.id} className="panel search clickable" onClick={() => setLive(s)} title="Open to watch the search">
                <span className={`search-icon ${run ? 'run' : ''}`}><MapPin size={18} /></span>
                <div>
                  <h3><button className="link" style={{ font: 'inherit', color: 'inherit' }} onClick={(e) => { e.stopPropagation(); setLive(s); }}>{s.category} in {s.place}</button></h3>
                  <p>{run ? progress[s.id] ?? (s.status === 'queued' ? 'Waiting to start' : 'Starting') : s.status === 'paused' ? 'Paused. Resume to continue where it stopped.' : s.error ? s.error : `${src}, ${new Date(s.created_at).toLocaleDateString()}`}</p>
                </div>
                <div className={`bar ${run ? 'run' : ''}`}><i style={{ width: run ? '100%' : s.found ? '100%' : '0%' }} /></div>
                <div className="muted">{s.added} new{s.found > s.added ? `, ${s.found - s.added} already saved` : ''}</div>
                <div className="row">
                  {run ? <><button className="btn small" title="Pause and keep progress" onClick={(e) => { e.stopPropagation(); void call('search:pause', s.id); }}><Pause size={13} /> Pause</button><button className="btn small ghost" onClick={(e) => { e.stopPropagation(); void call('search:stop', s.id); }}>Stop</button></>
                    : s.status === 'paused' ? <button className="btn small" onClick={(e) => { e.stopPropagation(); void call('search:resume', s.id); }}><Play size={13} /> Resume</button>
                    : <button className="btn small" onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('quarrix.search', String(s.id)); go('leads'); }}>View leads</button>}
                  <ChevronRight size={16} className="muted" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tool === 'map' && <MapPicker value={geo} onChange={setGeo} onClose={() => setTool('')} />}
      {tool === 'preview' && <PreviewModal category={category} place={whereText() || `${geo?.lat}, ${geo?.lon}`} sources={sources} geo={geo} onRun={start} onClose={() => setTool('')} />}
      {tool === 'batch' && <BatchModal sources={sources} onClose={() => setTool('')} />}
      {live && <LiveSearch search={searches.find((x) => x.id === live.id) ?? live} tick={tick} onClose={() => setLive(null)} go={go} />}
    </div>
  );
}
