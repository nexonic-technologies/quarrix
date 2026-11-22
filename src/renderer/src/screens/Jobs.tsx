import { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, ChevronDown, Bookmark, BookmarkCheck, ExternalLink, Sparkles, Briefcase, Check, FileUp, FileText, PenLine, X, Copy, Download, Wand2, Square } from 'lucide-react';
import { call } from '../api';
import { toast } from '../App';
import { Avatar, EmptyArt, HeroBg, spotlight, spotlightReset, useSceneMode, RiseText, RotatingWord } from '../Art';
import { RadarToy } from '../Toy';
import { CityInput, CountryInput } from '../CityInput';
import { COUNTRIES } from '../countries';
import { AlertsPanel, CheckLink, EmployersPanel } from './JobsParts';
import { Combo } from '../Combo';
import { JOB_TITLES } from '../../../shared/jobtitles';
import { CareerExplorer } from './CareerExplorer';
import { JobTrust } from './JobTrust';
import { ApplicationOverview, ApplicationStudio } from './ApplicationStudio';
import { PublicOpportunities } from './PublicOpportunities';
import type { StudioNotes } from '../../../shared/application-studio';
const TITLE_OPTIONS = JOB_TITLES.map((t) => ({ value: t.name, label: t.name, hint: t.group }));

type Cv = { file: string; text?: string; analysedWith: string; profile: { name: string; title: string; years: number; skills: string[]; roles: string[]; level: string; locations: string[]; summary: string } };
type Job = { firstSeen?: string; isNew?: boolean; repost?: boolean; ageDays?: number | null; recruiter?: boolean; salaryYearly?: { min: number; max: number; currency: string; period: string } | null; status?: string; id: string; source: string; title: string; company: string; location: string; workplace: string; type: string; level: string; salary: string; url: string; posted: string; tags: string[]; snippet: string; match?: number; why?: string };

const OPT = {
  extra: [['loose', 'Show loosely matching titles too'], ['onlyNew', 'Only new since last search'], ['hideReposts', 'Hide reposted jobs'], ['hideRecruiters', 'Hide recruiters and agencies'], ['fresh', 'Posted in the last 30 days']],
  radius: [['', 'Any distance'], ['10', 'Within 10 km'], ['25', 'Within 25 km'], ['50', 'Within 50 km'], ['100', 'Within 100 km']],
  salary: [['', 'Any salary'], ['30000', '30,000+ a year'], ['50000', '50,000+ a year'], ['75000', '75,000+ a year'], ['100000', '100,000+ a year'], ['150000', '150,000+ a year']],
  posted: [['', 'Any time'], ['1', 'Past 24 hours'], ['7', 'Past week'], ['30', 'Past month']],
  workplace: [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']],
  level: [['Internship', 'Internship'], ['Entry level', 'Entry level'], ['Mid level', 'Mid level'], ['Senior', 'Senior'], ['Director', 'Director']],
  type: [['Full-time', 'Full-time'], ['Part-time', 'Part-time'], ['Contract', 'Contract'], ['Internship', 'Internship']],
  sources: [['employers', 'Followed employers (direct)'], ['hn', 'Hacker News: Who is hiring'], ['linkedin', 'LinkedIn'], ['indeed', 'Indeed'], ['google', 'Google Jobs'], ['rozee', 'Rozee.pk'], ['remotive', 'Remotive'], ['remoteok', 'RemoteOK'], ['weworkremotely', 'We Work Remotely'], ['workingnomads', 'Working Nomads'], ['jobicy', 'Jobicy'], ['himalayas', 'Himalayas'], ['arbeitnow', 'Arbeitnow'], ['reddit', 'Reddit'], ['adzuna', 'Adzuna (free key)'], ['jooble', 'Jooble (free key)']],
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
  const [posted, setPosted] = useState<string[]>(['']);
  const [workplace, setWorkplace] = useState<string[]>([]);
  const [level, setLevel] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [boards, setBoards] = useState<{ source: string; count: number; error: string; ms: number }[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const runSeq = useRef(0);
  const stopRef = useRef(false);
  // Each board's jobs appear as soon as that board answers; the final list replaces them with the ranked, merged one.
  useEffect(() => {
    const off = (window as any).quarrix?.on((e: string, d: any) => {
      if (e !== 'jobs-batch' || d.runId !== runSeq.current) return;
      setBoards((b) => [...b.filter((x) => x.source !== d.source), { source: d.source, count: d.jobs.length, error: d.error, ms: d.ms }]);
      if (d.jobs.length) setJobs((list) => [...list, ...d.jobs.filter((j: Job) => !list.some((x) => x.id === j.id))]);
    });
    return off;
  }, []);
  const [salary, setSalary] = useState<string[]>(['']);
  const [radius, setRadius] = useState<string[]>(['']);
  const [panel, setPanel] = useState<'' | 'employers' | 'alerts'>('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; if (!busy) call<any[]>('jobs:recent').then((x) => { if (alive) setRecent(x ?? []); }).catch(e => toast.push(String(e), true)); return () => { alive = false; }; }, [busy]);
  const [tab, setTab] = useState<'results' | 'saved'>('results');
  const [saved, setSaved] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [cv, setCv] = useState<Cv | null>(null);
  const [publicOpen,setPublicOpen]=useState(false);
  const [ai, setAi] = useState('none');
  const [ranking, setRanking] = useState(false);
  const [focused, setFocused] = useState(false);
  const mode = useSceneMode(busy || ranking, focused);
  const [doc, setDoc] = useState<{ job: Job; kind: 'letter' | 'cv'; text: string; busy: boolean } | null>(null);

  useEffect(() => {
    call<Job[]>('jobs:saved').then(setSaved).catch(e => toast.push(String(e), true));
    call<Cv | null>('cv:get').then(setCv).catch(e => toast.push(String(e), true));
    call('settings:get').then((s) => setAi(s.ai?.provider === 'none' ? 'none' : s.ai?.model || s.ai?.provider)).catch(e => toast.push(String(e), true));
  }, []);
  useEffect(() => { setCity(''); }, [country]);

  const query = (keywords: string) => ({ keywords, country, countryName: COUNTRIES.find((c) => c[0] === country)?.[1] ?? '', city, posted: posted[0] ?? '', workplace, level, type, sources, strict: !extra.includes('loose'), onlyNew: extra.includes('onlyNew'), hideReposts: extra.includes('hideReposts'), hideRecruiters: extra.includes('hideRecruiters') || undefined, maxAgeDays: extra.includes('fresh') ? 30 : undefined, salaryMin: Number(salary[0]) || undefined, radiusKm: city ? Number(radius[0]) || undefined : undefined });
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
      setJobs([]); setBoards([]); stopRef.current = false;
      for (const w of words) {
        if (stopRef.current) break;
        const runId = ++runSeq.current;
        const r = await call<{ jobs: Job[]; errors: string[] }>('jobs:search', query(w), runId);
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
    await call('jobs:save', { ...j, status: saved.find(x => x.id === j.id)?.status || 'Opened' });
    setSaved(await call('jobs:saved'));
    toast.push('Opened the job page. Once you have sent the application, set it to Applied in My applications.');
  };
  const isSaved = (id: string) => saved.some((x) => x.id === id);
  const setStatus = async (j: Job, status: string) => { await call('jobs:save', { ...j, status }); setSaved(await call('jobs:saved')); };
  const toggleSave = async (j: Job) => {
    if (isSaved(j.id)) { if (!window.confirm('Remove this application and its studio notes?')) return; await call('jobs:unsave', j.id); } else await call('jobs:save', { ...j, status: 'Saved' });
    setSaved(await call('jobs:saved'));
  };
  const list = tab === 'saved' ? saved : jobs;
  const remoteCount = useMemo(() => jobs.filter((j) => j.workplace === 'remote').length, [jobs]);

  return (
    <div className="page">
      <div className="finder jobs-hero" data-mode={mode} data-kind="jobs" onMouseMove={spotlight} onMouseLeave={spotlightReset} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <HeroBg kind="jobs" mode={mode} />
        <RadarToy kind="jobs" />
        <div className="finder-text">
          <span className="eyebrow" key={mode}><Briefcase size={13} /> {busy ? 'Searching every board…' : ranking ? 'Matching jobs to your CV…' : mode === 'done' ? 'Jobs found' : 'Job search'}</span>
          <h2 className="hero-title"><RiseText text="Your next" /> <RotatingWord words={['developer', 'designer', 'marketing', 'remote', 'data', 'teaching', 'sales']} /> <RiseText text="job, from every board." /></h2>
          <RiseText as="p" text="LinkedIn, Indeed, Google Jobs, Rozee and remote boards, searched together and matched to your CV." />
        </div>
        <div className="finder-form">
          <Combo free typed options={TITLE_OPTIONS} value={kw} onChange={setKw} onEnter={() => run()} icon={<SearchIcon size={16} />} placeholder="Job title or skill: pick or type your own" />
          <CountryInput value={country} onChange={setCountry} />
          <CityInput country={country} value={city} onChange={setCity} onEnter={() => run()} placeholder="City (optional)" />
          {busy
            ? <button className="btn go" onClick={() => { stopRef.current = true; void call('jobs:stop', runSeq.current); }}><Square size={13} /> Stop</button>
            : <button className="btn primary go" onClick={() => run()}>Search jobs</button>}
        </div>
      </div>

      <div className="pills">
        <Pill label="Date posted" options={OPT.posted} value={posted} onChange={setPosted} />
        <Pill label="Workplace type" options={OPT.workplace} value={workplace} multi onChange={setWorkplace} />
        <Pill label="Experience level" options={OPT.level} value={level} multi onChange={setLevel} />
        <Pill label="Employment type" options={OPT.type} value={type} multi onChange={setType} />
        <Pill label="Job boards" options={OPT.sources} value={sources} multi onChange={setSources} />
        <Pill label="Salary" options={OPT.salary} value={salary} onChange={setSalary} />
        {city && <Pill label="Distance" options={OPT.radius} value={radius} onChange={setRadius} />}
        <Pill label="More filters" options={OPT.extra} value={extra} multi onChange={setExtra} />
        <button className="pill-btn" onClick={() => setPanel(panel === 'employers' ? '' : 'employers')}>Employers</button>
        <button className="pill-btn" onClick={() => setPanel(panel === 'alerts' ? '' : 'alerts')}>Alerts</button>
        <button className="pill-btn" aria-pressed={publicOpen} onClick={()=>setPublicOpen(!publicOpen)}>Public opportunities</button>
        <button className={`pill-btn ${workplace.length === 1 && workplace[0] === 'remote' ? 'on' : ''}`} onClick={() => setWorkplace(workplace[0] === 'remote' && workplace.length === 1 ? [] : ['remote'])}>Remote only</button>
        <span className="grow" />
        <div className="tabs seg" role="tablist" aria-label="Results" style={{ margin: 0 }}>
          <button role="tab" aria-selected={tab === 'results'} onClick={() => setTab('results')}>Results {jobs.length ? `(${jobs.length})` : ''}</button>
          <button role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')}>My applications {saved.length ? `(${saved.length})` : ''}</button>
        </div>
      </div>

      {panel === 'employers' && <EmployersPanel />}
      {publicOpen && <PublicOpportunities />}
      {panel === 'alerts' && <AlertsPanel current={{ ...query(kw.trim()), name: kw.trim() }} onOpen={(list) => { setJobs(list as Job[]); setTab('results'); }} />}
      {tab === 'saved' && saved.length > 0 && <div className="row" style={{ gap: 6, marginBottom: 8 }}><span className="muted small">Export my applications:</span>{(['csv', 'json', 'md'] as const).map((f) => <button key={f} className="btn small ghost" onClick={async () => { const n = await call('jobs:export', f); if (n) toast.push(`Exported ${n} jobs`); }}>{f === 'md' ? 'Markdown' : f.toUpperCase()}</button>)}</div>}
      {tab === 'saved' && <ApplicationOverview jobs={saved as (Job & { studio?: StudioNotes })[]} onOpen={setOpen} />}
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
      {tab === 'results' && <CareerExplorer profile={cv?.profile} busy={busy} onSearch={title => { setKw(title); void run([title]); }} />}
      {tab === 'results' && (ranking || (cv && jobs.some((j) => j.match != null))) && <p className="muted small rank-note"><Sparkles size={12} /> {ranking ? 'Ranking jobs against your CV…' : `Ranked against your CV ${ai === 'none' ? 'by matching skills (add a model for smarter ranking)' : `with ${ai}`}.`}</p>}
      {tab === 'results' && jobs.length > 0 && <p className="muted small" style={{ margin: '0 0 8px' }}>{jobs.length} jobs, {remoteCount} remote{errors.length ? ` · not available right now: ${errors.map((e) => e.split(':')[0]).join(', ')}` : ''}</p>}

      {tab === 'results' && boards.length > 0 && (
        <div className="boards" aria-live="polite">
          {boards.sort((a, b) => a.source.localeCompare(b.source)).map((b) => <span key={b.source} className={`board ${b.error ? 'err' : 'ok'}`} title={b.error ? `${b.source}: ${b.error}` : `${b.count} matching jobs in ${(b.ms / 1000).toFixed(1)} s`}>{b.source} {b.error ? '✕' : b.count}</span>)}
          {busy && <span className="muted small">waiting for the slower boards…</span>}
          {boards.some((b) => b.error) && <details className="small"><summary>Why some boards did not answer</summary>{boards.filter((b) => b.error).map((b) => <div key={b.source}><b>{b.source}</b>: {b.error}</div>)}</details>}
        </div>
      )}
      {tab === 'results' && !busy && jobs.length === 0 && recent.length > 0 && (
        <div className="panel panel-pad" style={{ marginBottom: 10 }}>
          <div className="panel-title"><h2>Recent job searches</h2><button className="btn small ghost" onClick={async () => { await call('jobs:clearRecent'); setRecent([]); }}>Clear</button></div>
          <div className="contacts">{recent.map((r) => (
            <div key={r.id} className="contact-row">
              <button className="link" onClick={() => { setKw(r.query.keywords ?? ''); setCountry(r.query.country ?? ''); setTimeout(() => setCity(r.query.city ?? ''), 50); void run([r.query.keywords]); }}><b>{r.query.keywords}</b> {[r.query.city, r.query.countryName].filter(Boolean).join(', ') || 'anywhere'}</button>
              <span className="muted small">{r.results} jobs · {(r.ms / 1000).toFixed(0)} s · {new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span />
            </div>))}</div>
        </div>
      )}
      {list.length === 0 ? (
        <div className="panel empty"><EmptyArt /><h3>{tab === 'saved' ? 'No saved jobs yet' : busy ? 'Searching every board…' : 'Search for a job'}</h3>{tab === 'saved' ? 'Save jobs with the bookmark to keep them here.' : 'Try "web developer" with Remote only, or pick a country and a city.'}</div>
      ) : (
        <div className="joblist">
          {list.map((j) => (
            <div key={j.id} className="panel job" onClick={() => setOpen(j.id)}>
              <Avatar name={j.company || j.title} size={40} />
              <div className="grow">
                <div className="job-title">{j.title}{j.match != null && <span className={`match ${j.match >= 70 ? 'hi' : j.match >= 45 ? 'mid' : ''}`}>{j.match}% match</span>}</div>
                <div className="muted small">{j.company} · {j.location || 'Location not given'}</div>
                <div className="row job-tags">
                  {j.workplace && <span className="tag">{j.workplace === 'onsite' ? 'On-site' : j.workplace[0].toUpperCase() + j.workplace.slice(1)}</span>}
                  {j.type && <span className="tag">{j.type}</span>}
                  {j.level && <span className="tag">{j.level}</span>}
                  {j.salary && <span className="tag ok" title={j.salaryYearly ? `About ${j.salaryYearly.currency} ${j.salaryYearly.min.toLocaleString()}–${j.salaryYearly.max.toLocaleString()} a year (shown ${j.salaryYearly.period === 'year' ? 'yearly' : `per ${j.salaryYearly.period}`})` : ''}>{j.salary}</span>}
                  {j.tags?.includes('direct') && <span className="tag direct" title="From the employer's own hiring system">Direct</span>}
                  {j.isNew && j.firstSeen && <span className="tag new">New</span>}
                  {j.repost && <span className="tag warn" title="The same title at the same company was seen before under a different posting">Reposted</span>}
                  {j.recruiter && <span className="tag" title="Looks like a recruiter or agency">Agency</span>}
                  {j.ageDays != null && j.ageDays > 45 && <span className="tag warn" title="Old postings are often filled already">{j.ageDays} days old</span>}
                  <span className="muted small">{j.source}{j.posted ? ` · ${ago(j.posted)}` : ''}</span>
                </div>
                {j.why && <div className="why">{j.why}</div>}
                {j.snippet && <p className="snippet">{j.snippet.slice(0, 170)}…</p>}
              </div>
              <div className="job-actions" onClick={(e) => e.stopPropagation()}>
                <button className="round" title={isSaved(j.id) ? 'Remove from saved' : 'Save'} onClick={() => toggleSave(j)}>{isSaved(j.id) ? <BookmarkCheck size={16} color="var(--violet)" /> : <Bookmark size={16} />}</button>
                {tab === 'saved' && (
                  <select className="select status-select" value={j.status ?? 'Saved'} onChange={(e) => setStatus(j, e.target.value)}>
                    {['Saved', 'Opened', 'Applied', 'Interview', 'Offer', 'Rejected'].map((x) => <option key={x} value={x}>{x}</option>)}
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
      {open && (() => { const j = saved.find((x) => x.id === open) ?? list.find((x) => x.id === open); return j ? <JobDetail job={j} cv={cv} onStudioUpdated={async () => setSaved(await call('jobs:saved'))} onClose={() => setOpen(null)} onApply={() => apply(j)} onLetter={() => makeDoc(j, 'letter')} onTailor={() => makeDoc(j, 'cv')} saved={isSaved(j.id)} onSave={() => toggleSave(j)} /> : null; })()}
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

function JobDetail({ job, cv, onStudioUpdated, onClose, onApply, onLetter, onTailor, saved, onSave }: { job: Job & { studio?: StudioNotes }; cv: Cv | null; onStudioUpdated: () => Promise<void>; onClose: () => void; onApply: () => void; onLetter: () => void; onTailor: () => void; saved: boolean; onSave: () => void }) {
  const [d, setD] = useState<{ text: string; seniority: string; employment: string; func: string; industries: string } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let alive = true; setD(null); setErr(false); call('jobs:detail', job).then(x => { if (alive) setD(x); }).catch(() => { if (alive) setErr(true); }); return () => { alive = false; }; }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const parts = job.location.split(',').map((x) => x.trim()).filter((x) => x && !/^(remote|hybrid|on-?site)$/i.test(x));
  const facts: [string, string][] = [
    ['Company', job.company], ['City', parts.length > 1 ? parts[0] : /remote|worldwide|anywhere/i.test(job.location) ? '' : parts[0] ?? ''], ['Country / region', parts.length > 1 ? parts.slice(1).join(', ') : /remote|worldwide|anywhere/i.test(job.location) ? job.location : ''],
    ['Workplace', job.workplace === 'onsite' ? 'On-site' : job.workplace ? job.workplace[0].toUpperCase() + job.workplace.slice(1) : ''], ['Employment type', d?.employment || job.type], ['Experience level', d?.seniority || job.level],
    ['Salary', job.salary], ['Job function', d?.func ?? ''], ['Industry', d?.industries ?? ''], ['Posted', job.posted ? new Date(job.posted).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''], ['Found on', job.source],
  ];
  const q = encodeURIComponent(job.company);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer jobdetail" role="dialog" aria-label={job.title}>
        <header>
          <div className="drawer-banner"><button className="btn ghost close" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
          <div className="drawer-id"><Avatar name={job.company || job.title} size={64} />
            <div className="drawer-quick"><button className="round" title={saved ? 'Saved' : 'Save'} onClick={onSave}>{saved ? <BookmarkCheck size={16} color="var(--violet)" /> : <Bookmark size={16} />}</button></div>
          </div>
          <h2>{job.title}</h2>
          <div className="muted">{job.company}{job.location ? ` · ${job.location}` : ''}</div>
          {job.match != null && <div className="why" style={{ marginTop: 6 }}><span className={`match ${job.match >= 70 ? 'hi' : job.match >= 45 ? 'mid' : ''}`}>{job.match}% match</span> {job.why}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onApply}>Apply <ExternalLink size={13} /></button>
            <CheckLink url={job.url} />
            <button className="btn" onClick={onLetter}><PenLine size={14} /> Cover letter</button>
            <button className="btn" onClick={onTailor}><FileText size={14} /> Tailor CV</button>
          </div>
        </header>
        <div className="body">
          <JobTrust key={job.id} job={job} />
          <ApplicationStudio key={`${job.id}:${saved}`} job={job} cv={cv} posting={d?.text || job.snippet} saved={saved} onSave={onSave} onUpdated={onStudioUpdated} />
          <dl className="kv">{facts.filter(([, v]) => v).flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}</dl>
          <div className="row">
            <a className="btn small" href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer">Company on Google</a>
            <a className="btn small" href={`https://www.linkedin.com/company/${q}`} target="_blank" rel="noreferrer">Company on LinkedIn</a>
            <a className="btn small" href={`https://www.glassdoor.com/Search/results.htm?keyword=${q}`} target="_blank" rel="noreferrer">Reviews on Glassdoor</a>
          </div>
          <div>
            <h3 className="sec">Job description</h3>
            {!d && !err && <div className="doc-wait inline"><span className="spinner" />Loading the full job post…</div>}
            {(d || err) && <div className="jd">{(d?.text || job.snippet || 'The full description is on the job page. Press Apply to open it.').split(/(?<=[.!?])\s+(?=[A-Z])/).reduce<string[][]>((acc, sentence, i) => { if (i % 3 === 0) acc.push([]); acc[acc.length - 1].push(sentence); return acc; }, []).map((p, i) => <p key={i}>{p.join(' ')}</p>)}</div>}
            {job.tags.length > 0 && <div className="cv-skills">{job.tags.slice(0, 12).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
          </div>
        </div>
      </aside>
    </>
  );
}
