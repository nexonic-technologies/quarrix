import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, MapPin, Flag, ChevronDown, Bookmark, BookmarkCheck, ExternalLink, Sparkles, Briefcase, Check, FileUp, FileText, PenLine, X, Copy, Download, Wand2 } from 'lucide-react';
import { call } from '../api';
import { toast } from '../App';
import { Avatar, EmptyArt } from '../Art';
import { COUNTRIES } from '../countries';

type Cv = { file: string; analysedWith: string; profile: { name: string; title: string; years: number; skills: string[]; roles: string[]; level: string; locations: string[]; summary: string } };
type Job = { status?: string; id: string; source: string; title: string; company: string; location: string; workplace: string; type: string; level: string; salary: string; url: string; posted: string; tags: string[]; snippet: string; match?: number; why?: string };

const OPT = {
  posted: [['', 'Any time'], ['1', 'Past 24 hours'], ['7', 'Past week'], ['30', 'Past month']],
  workplace: [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']],
  level: [['Internship', 'Internship'], ['Entry level', 'Entry level'], ['Mid level', 'Mid level'], ['Senior', 'Senior'], ['Director', 'Director']],
  type: [['Full-time', 'Full-time'], ['Part-time', 'Part-time'], ['Contract', 'Contract'], ['Internship', 'Internship']],
  sources: [['linkedin', 'LinkedIn'], ['indeed', 'Indeed'], ['google', 'Google Jobs'], ['rozee', 'Rozee.pk'], ['remotive', 'Remotive'], ['remoteok', 'RemoteOK'], ['weworkremotely', 'We Work Remotely'], ['workingnomads', 'Working Nomads'], ['jobicy', 'Jobicy'], ['himalayas', 'Himalayas'], ['arbeitnow', 'Arbeitnow'], ['reddit', 'Reddit'], ['adzuna', 'Adzuna (free key)'], ['jooble', 'Jooble (free key)']],
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
  const [cv, setCv] = useState<Cv | null>(null);
  const [ai, setAi] = useState('none');
  const [ranking, setRanking] = useState(false);
  const [doc, setDoc] = useState<{ job: Job; kind: 'letter' | 'cv'; text: string; busy: boolean } | null>(null);

  useEffect(() => {
    call<Job[]>('jobs:saved').then(setSaved);
    call<Cv | null>('cv:get').then(setCv);
    call('settings:get').then((s) => setAi(s.ai?.provider === 'none' ? 'none' : s.ai?.model || s.ai?.provider));
  }, []);
  useEffect(() => {
    setCity(''); setCities([]);
    if (country) call<string[]>('geo:cities', country).then(setCities).catch(() => setCities([]));
  }, [country]);

  const query = (keywords: string) => ({ keywords, country, countryName: COUNTRIES.find((c) => c[0] === country)?.[1] ?? '', city, posted: posted[0] ?? '', workplace, level, type, sources });
  const rank = async (list: Job[], quiet = false) => {
    if (!cv) { if (!quiet) toast.push('Upload your CV first, so jobs can be matched to you.', true); return list; }
    setRanking(true);
    try {
      const m = await call<Record<string, { match: number; why: string }>>('jobs:match', list);
      const ranked = list.map((j) => (m[j.id] ? { ...j, ...m[j.id] } : j)).sort((a, b) => (b.match ?? -1) - (a.match ?? -1));
      setJobs(ranked);
      return ranked;
    } catch (e: any) { toast.push(e.message, true); return list; } finally { setRanking(false); }
  };
  const run = async (override?: string[]) => {
    const words = override ?? [kw.trim()];
    if (!words[0]) { toast.push('Type a job title or skill, for example web developer.', true); return; }
    setBusy(true); setTab('results');
    try {
      const all: Job[] = []; const errs: string[] = [];
      for (const w of words) {
        const r = await call<{ jobs: Job[]; errors: string[] }>('jobs:search', query(w));
        for (const j of r.jobs) if (!all.some((x) => x.id === j.id)) all.push(j);
        errs.push(...r.errors);
      }
      setJobs(all); setErrors([...new Set(errs)]);
      if (cv && all.length) void rank(all, true);
    } catch (e: any) { toast.push(e.message, true); } finally { setBusy(false); }
  };
  const upload = async () => {
    try {
      toast.push('Reading your CV…');
      const c = await call<Cv | null>('cv:upload');
      if (c) { setCv(c); toast.push(`CV read with ${c.analysedWith}. ${c.profile.roles.length} job titles suggested.`); }
    } catch (e: any) { toast.push(e.message, true); }
  };
  const makeDoc = async (job: Job, kind: 'letter' | 'cv') => {
    if (!cv) { toast.push('Upload your CV first.', true); return; }
    setDoc({ job, kind, text: '', busy: true });
    try { setDoc({ job, kind, text: await call<string>(kind === 'letter' ? 'jobs:letter' : 'jobs:tailor', job), busy: false }); }
    catch (e: any) { setDoc(null); toast.push(e.message, true); }
  };
  const apply = async (j: Job) => {
    window.open(j.url, '_blank');
    await call('jobs:save', { ...j, status: 'Applied' });
    setSaved(await call('jobs:saved'));
    toast.push('Opened the job. It is in My applications as Applied.');
  };
  const isSaved = (id: string) => saved.some((x) => x.id === id);
  const setStatus = async (j: Job, status: string) => { await call('jobs:save', { ...j, status }); setSaved(await call('jobs:saved')); };
  const toggleSave = async (j: Job) => {
    if (isSaved(j.id)) await call('jobs:unsave', j.id); else await call('jobs:save', { ...j, status: 'Saved' });
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
          <button className="btn primary go" onClick={() => run()} disabled={busy}>{busy ? 'Searching…' : 'Search jobs'}</button>
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
          <button aria-selected={tab === 'saved'} onClick={() => setTab('saved')}>My applications {saved.length ? `(${saved.length})` : ''}</button>
        </div>
      </div>

      {cv ? (
        <div className="panel cv-card">
          <span className="cv-icon"><FileText size={18} /></span>
          <div className="grow">
            <div className="cv-top"><b>{cv.profile.title || 'Your CV'}</b><span className="muted small">{cv.profile.level}{cv.profile.years ? ` · ${cv.profile.years} years` : ''} · {cv.file} · read with {cv.analysedWith}</span></div>
            <div className="cv-skills">{cv.profile.skills.slice(0, 14).map((k) => <span key={k} className="tag">{k}</span>)}</div>
            <div className="cv-roles"><span className="muted small">Search for:</span>{cv.profile.roles.map((r) => <button key={r} className="chip solid" onClick={() => { setKw(r); void run([r]); }}>{r}</button>)}</div>
          </div>
          <div className="cv-actions">
            <button className="btn primary" disabled={busy} onClick={() => run(cv.profile.roles.slice(0, 3))}><Wand2 size={15} /> Find jobs for my CV</button>
            <button className="btn small ghost" onClick={upload}>Replace CV</button>
          </div>
        </div>
      ) : (
        <button className="panel cv-card upload" onClick={upload}>
          <span className="cv-icon"><FileUp size={18} /></span>
          <div className="grow"><b>Upload your CV for matched jobs</b><span className="muted small">PDF, Word or text. Quarrix reads it, suggests the job titles to search, and ranks every job by how well it fits you. {ai === 'none' ? 'Add a writing model in Settings for smarter matching, cover letters and tailored CVs.' : `Using ${ai}.`}</span></div>
          <span className="btn primary">Upload CV</span>
        </button>
      )}
      {tab === 'results' && (ranking || (cv && jobs.some((j) => j.match != null))) && <p className="muted small rank-note"><Sparkles size={12} /> {ranking ? 'Ranking jobs against your CV…' : `Ranked against your CV ${ai === 'none' ? 'by matching skills (add a model for smarter ranking)' : `with ${ai}`}.`}</p>}
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
                {tab === 'saved' && (
                  <select className="select status-select" value={j.status ?? 'Saved'} onChange={(e) => setStatus(j, e.target.value)}>
                    {['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                )}
                <button className="btn small" title="Write a cover letter for this job" onClick={() => makeDoc(j, 'letter')}><PenLine size={13} /> Letter</button>
                <button className="btn small" title="Tailor your CV to this job" onClick={() => makeDoc(j, 'cv')}><FileText size={13} /> Tailor CV</button>
                <button className="btn primary small" onClick={() => apply(j)}>Apply <ExternalLink size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {doc && (
        <>
          <div className="scrim" onClick={() => !doc.busy && setDoc(null)} />
          <div className="modal" role="dialog" aria-label="Document">
            <header><div className="grow"><b>{doc.kind === 'letter' ? 'Cover letter' : 'CV tailored'} for {doc.job.title}</b><span className="muted small">{doc.job.company} · written from your CV only, check it before sending</span></div><button className="btn ghost" onClick={() => setDoc(null)} aria-label="Close"><X size={16} /></button></header>
            {doc.busy ? <div className="doc-wait"><span className="spinner" />Reading the job post and your CV…</div>
              : <textarea className="input doc-text" value={doc.text} onChange={(e) => setDoc({ ...doc, text: e.target.value })} />}
            <footer className="row">
              <button className="btn" disabled={doc.busy} onClick={() => { void navigator.clipboard.writeText(doc.text); toast.push('Copied'); }}><Copy size={14} /> Copy</button>
              <button className="btn" disabled={doc.busy} onClick={async () => { const p = await call('jobs:saveDoc', doc.text, `${doc.kind === 'letter' ? 'Cover letter' : 'CV'} - ${doc.job.company || doc.job.title}`); if (p) toast.push('Saved'); }}><Download size={14} /> Save as Word</button>
              <span className="grow" />
              <button className="btn primary" onClick={() => apply(doc.job)}>Apply now <ExternalLink size={13} /></button>
            </footer>
          </div>
        </>
      )}
    </div>
  );
}
