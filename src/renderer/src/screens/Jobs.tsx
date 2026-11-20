import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, MapPin, Flag, ChevronDown, Bookmark, BookmarkCheck, ExternalLink, Sparkles, Briefcase, Check } from 'lucide-react';
import { call } from '../api';
import { toast } from '../App';
import { Avatar, EmptyArt } from '../Art';
import { COUNTRIES } from '../countries';

type Job = { id: string; source: string; title: string; company: string; location: string; workplace: string; type: string; level: string; salary: string; url: string; posted: string; tags: string[]; snippet: string; match?: number; why?: string };

const OPT = {
  posted: [['', 'Any time'], ['1', 'Past 24 hours'], ['7', 'Past week'], ['30', 'Past month']],
  workplace: [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']],
  level: [['Internship', 'Internship'], ['Entry level', 'Entry level'], ['Mid level', 'Mid level'], ['Senior', 'Senior'], ['Director', 'Director']],
  type: [['Full-time', 'Full-time'], ['Part-time', 'Part-time'], ['Contract', 'Contract'], ['Internship', 'Internship']],
  sources: [['linkedin', 'LinkedIn'], ['remotive', 'Remotive'], ['remoteok', 'RemoteOK'], ['jobicy', 'Jobicy'], ['himalayas', 'Himalayas'], ['arbeitnow', 'Arbeitnow'], ['reddit', 'Reddit']],
} as const;

function Pill({ label, options, value, multi, onChange }: { label: string; options: readonly (readonly [string, string])[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, []);
  const active = value.filter(Boolean).length > 0;
  const shown = active ? (multi ? `${label} · ${value.length}` : options.find((o) => o[0] === value[0])?.[1]) : label;
  return (
    <div className="pill-dd" ref={ref}>
      <button className={`pill-btn ${active ? 'on' : ''}`} onClick={() => setOpen(!open)}>{shown} <ChevronDown size={14} /></button>
      {open && (
        <div className="pill-menu">
          {options.map(([k, v]) => {
            const on = value.includes(k);
            return <button key={k} className={on ? 'on' : ''} onClick={() => { if (multi) onChange(on ? value.filter((x) => x !== k) : [...value, k]); else { onChange([k]); setOpen(false); } }}><span className="box">{on && <Check size={12} />}</span>{v}</button>;
          })}
          {multi && active && <button className="clear" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

const ago = (iso: string) => {
  if (!iso) return '';
  const d = (Date.now() - +new Date(iso)) / 86400000;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? `${Math.floor(d)} days ago` : `${Math.floor(d / 30)} mo ago`;
};

export function Jobs() {
  const [kw, setKw] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [posted, setPosted] = useState<string[]>(['']);
  const [workplace, setWorkplace] = useState<string[]>([]);
  const [level, setLevel] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'results' | 'saved'>('results');
  const [saved, setSaved] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [profile, setProfile] = useState('');
  const [ranking, setRanking] = useState(false);

  useEffect(() => { call<Job[]>('jobs:saved').then(setSaved); call('settings:get').then((s) => setProfile(s.profile?.skills ?? '')); }, []);
  useEffect(() => {
    setCity(''); setCities([]);
    if (country) call<string[]>('geo:cities', country).then(setCities).catch(() => setCities([]));
  }, [country]);

  const run = async () => {
    if (!kw.trim()) { toast.push('Type a job title or skill, for example web developer.', true); return; }
    setBusy(true); setTab('results');
    try {
      const r = await call<{ jobs: Job[]; errors: string[] }>('jobs:search', { keywords: kw.trim(), country, countryName: COUNTRIES.find((c) => c[0] === country)?.[1] ?? '', city, posted: posted[0] ?? '', workplace, level, type, sources });
      setJobs(r.jobs); setErrors(r.errors);
    } catch (e: any) { toast.push(e.message, true); } finally { setBusy(false); }
  };
  const rank = async () => {
    if (!profile.trim()) { toast.push('Describe your skills and experience first, so jobs can be matched to you.', true); return; }
    setRanking(true);
    try {
      const s = await call('settings:get'); await call('settings:save', { ...s, profile: { ...s.profile, skills: profile } });
      const m = await call<Record<string, { match: number; why: string }>>('jobs:match', jobs, profile);
      setJobs((list) => list.map((j) => (m[j.id] ? { ...j, ...m[j.id] } : j)).sort((a, b) => (b.match ?? -1) - (a.match ?? -1)));
      toast.push('Jobs ranked by how well they fit you');
    } catch (e: any) { toast.push(e.message, true); } finally { setRanking(false); }
  };
  const isSaved = (id: string) => saved.some((x) => x.id === id);
  const toggleSave = async (j: Job) => {
    if (isSaved(j.id)) await call('jobs:unsave', j.id); else await call('jobs:save', j);
    setSaved(await call('jobs:saved'));
  };
  const list = tab === 'saved' ? saved : jobs;
  const remoteCount = useMemo(() => jobs.filter((j) => j.workplace === 'remote').length, [jobs]);

  return (
    <div className="page">
      <div className="finder jobs-hero">
        <div className="finder-text">
          <span className="eyebrow"><Briefcase size={13} /> Job search</span>
          <h2>Find your next job, from every board at once</h2>
          <p>LinkedIn, remote job boards and hiring posts, searched together and filtered your way.</p>
        </div>
        <div className="finder-form" style={{ maxWidth: '100%' }}>
          <label className="fbox"><SearchIcon size={16} /><input placeholder="Job title or skill, e.g. Web developer" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} /></label>
          <label className="fbox country"><Flag size={16} />
            <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country"><option value="">Any country</option>{COUNTRIES.map(([c, n, f]) => <option key={c} value={c}>{f} {n}</option>)}</select>
          </label>
          <label className="fbox country"><MapPin size={16} />
            {cities.length ? (
              <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">Any city</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
            ) : <input placeholder={country ? 'Loading cities… or type one' : 'City (optional)'} value={city} onChange={(e) => setCity(e.target.value)} />}
          </label>
          <button className="btn primary go" onClick={run} disabled={busy}>{busy ? 'Searching…' : 'Search jobs'}</button>
        </div>
      </div>

      <div className="pills">
        <Pill label="Date posted" options={OPT.posted} value={posted} onChange={setPosted} />
        <Pill label="Workplace type" options={OPT.workplace} value={workplace} multi onChange={setWorkplace} />
        <Pill label="Experience level" options={OPT.level} value={level} multi onChange={setLevel} />
        <Pill label="Employment type" options={OPT.type} value={type} multi onChange={setType} />
        <Pill label="Job boards" options={OPT.sources} value={sources} multi onChange={setSources} />
        <button className={`pill-btn ${workplace.length === 1 && workplace[0] === 'remote' ? 'on' : ''}`} onClick={() => setWorkplace(workplace[0] === 'remote' && workplace.length === 1 ? [] : ['remote'])}>Remote only</button>
        <span className="grow" />
        <div className="tabs seg" style={{ margin: 0 }}>
          <button aria-selected={tab === 'results'} onClick={() => setTab('results')}>Results {jobs.length ? `(${jobs.length})` : ''}</button>
          <button aria-selected={tab === 'saved'} onClick={() => setTab('saved')}>Saved {saved.length ? `(${saved.length})` : ''}</button>
        </div>
      </div>

      {tab === 'results' && jobs.length > 0 && (
        <div className="panel panel-pad match-box">
          <div className="grow">
            <b><Sparkles size={14} style={{ verticalAlign: -2 }} /> Match jobs to you</b>
            <textarea className="input" rows={2} placeholder="Your skills and experience, e.g. 5 years React and Node, WordPress, UI design, looking for remote full-time" value={profile} onChange={(e) => setProfile(e.target.value)} />
          </div>
          <button className="btn primary" onClick={rank} disabled={ranking}>{ranking ? 'Ranking…' : 'Rank by fit'}</button>
        </div>
      )}
      {tab === 'results' && jobs.length > 0 && <p className="muted small" style={{ margin: '0 0 8px' }}>{jobs.length} jobs, {remoteCount} remote{errors.length ? ` · not available right now: ${errors.map((e) => e.split(':')[0]).join(', ')}` : ''}</p>}

      {list.length === 0 ? (
        <div className="panel empty"><EmptyArt /><h3>{tab === 'saved' ? 'No saved jobs yet' : busy ? 'Searching every board…' : 'Search for a job'}</h3>{tab === 'saved' ? 'Save jobs with the bookmark to keep them here.' : 'Try "web developer" with Remote only, or pick a country and a city.'}</div>
      ) : (
        <div className="joblist">
          {list.map((j) => (
            <div key={j.id} className={`panel job ${open === j.id ? 'open' : ''}`} onClick={() => setOpen(open === j.id ? null : j.id)}>
              <Avatar name={j.company || j.title} size={40} />
              <div className="grow">
                <div className="job-title">{j.title}{j.match != null && <span className={`match ${j.match >= 70 ? 'hi' : j.match >= 45 ? 'mid' : ''}`}>{j.match}% match</span>}</div>
                <div className="muted small">{j.company} · {j.location || 'Location not given'}</div>
                <div className="row job-tags">
                  {j.workplace && <span className="tag">{j.workplace === 'onsite' ? 'On-site' : j.workplace[0].toUpperCase() + j.workplace.slice(1)}</span>}
                  {j.type && <span className="tag">{j.type}</span>}
                  {j.level && <span className="tag">{j.level}</span>}
                  {j.salary && <span className="tag ok">{j.salary}</span>}
                  <span className="muted small">{j.source}{j.posted ? ` · ${ago(j.posted)}` : ''}</span>
                </div>
                {j.why && <div className="why">{j.why}</div>}
                {open === j.id && j.snippet && <p className="snippet">{j.snippet}…</p>}
              </div>
              <div className="job-actions" onClick={(e) => e.stopPropagation()}>
                <button className="round" title={isSaved(j.id) ? 'Remove from saved' : 'Save'} onClick={() => toggleSave(j)}>{isSaved(j.id) ? <BookmarkCheck size={16} color="var(--violet)" /> : <Bookmark size={16} />}</button>
                <a className="btn primary small" href={j.url} target="_blank" rel="noreferrer">Apply <ExternalLink size={12} /></a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
