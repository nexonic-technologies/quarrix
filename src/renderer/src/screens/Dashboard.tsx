import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Send, MessageCircleReply, Briefcase, Radio, Rocket, Clock, FileBarChart, MailCheck, Sparkles, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { call } from '../api';
import { type Screen } from '../App';
import { CountUp, Sparkline } from '../Art';

type Dash = {
  days: string[]; series: { leads: number[]; sent: number[]; replies: number[]; applied: number[] };
  totals: Record<string, number>; jobStatus: Record<string, number>;
  sources: { source: string; n: number }[]; categories: { category: string; n: number }[]; countries: { country: string; n: number }[];
  running: { id: number; category: string; place: string; status: string; found: number; added: number }[];
  nextSend: { due_at: string; name: string } | null;
  activity: { id: number; at: string; type: string; detail: string; name: string | null }[];
};
const SERIES = [
  { key: 'leads', label: 'Leads found', color: '#7c3aed' },
  { key: 'sent', label: 'Emails sent', color: '#06b6d4' },
  { key: 'replies', label: 'Replies', color: '#16a34a' },
  { key: 'applied', label: 'Job applications', color: '#f59e0b' },
] as const;
const SRC: Record<string, string> = { gmaps: 'Google Maps', osm: 'OpenStreetMap', places: 'Places API', web: 'Web search', yelp: 'Yelp', yellowpages: 'Yellow Pages', yell: 'Yell', hotfrog: 'Hotfrog', tomtom: 'TomTom', foursquare: 'Foursquare', reddit: 'Job posts', import: 'Imported', manual: 'Added by you' };
const ago = (iso: string) => { const s = (Date.now() - +new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!now && !prev) return <span className="delta flat">no change</span>;
  const up = now >= prev;
  const pct = prev ? Math.round(((now - prev) / prev) * 100) : 100;
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(pct)}% vs last week</span>;
}

/** Smooth multi-series area chart with a hover crosshair. Paths animate when the data changes. */
function PerfChart({ days, series, on }: { days: string[]; series: Dash['series']; on: Set<string> }) {
  const W = 760, H = 230, P = { l: 34, r: 12, t: 14, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const active = SERIES.filter((s) => on.has(s.key));
  const max = Math.max(4, ...active.flatMap((s) => series[s.key]));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => P.l + (i / Math.max(1, days.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - (v / top) * (H - P.t - P.b);
  const path = (vals: number[]) => vals.map((v, i) => {
    if (!i) return `M${x(0)},${y(v)}`;
    const cx = (x(i - 1) + x(i)) / 2;
    return `C${cx},${y(vals[i - 1])} ${cx},${y(v)} ${x(i)},${y(v)}`;
  }).join(' ');
  const label = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <div className="perf">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (days.length - 1))))); }}>
        <defs>{SERIES.map((s) => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        {[0, 1, 2, 3, 4].map((k) => <g key={k}><line x1={P.l} x2={W - P.r} y1={y(k * step)} y2={y(k * step)} className="grid" /><text x={P.l - 8} y={y(k * step) + 4} className="axis" textAnchor="end">{k * step}</text></g>)}
        {days.map((d, i) => (i % Math.ceil(days.length / 7) === 0 || i === days.length - 1) && <text key={d} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{label(d)}</text>)}
        {active.map((s) => (
          <g key={s.key}>
            <path className="area" d={`${path(series[s.key])} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#g-${s.key})`} />
            <path className="line" d={path(series[s.key])} stroke={s.color} />
          </g>
        ))}
        {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} className="cross" />{active.map((s) => <circle key={s.key} cx={x(hover)} cy={y(series[s.key][hover])} r="4.5" fill="#fff" stroke={s.color} strokeWidth="2.5" />)}</g>}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{label(days[hover])}</b>
          {active.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}<em>{series[s.key][hover]}</em></span>)}
        </div>
      )}
    </div>
  );
}

function Donut({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--track)" strokeWidth="16" />
        {total > 0 && parts.map((p) => { const len = (p.n / total) * C; const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" className="seg" />; acc += len; return el; })}
        <text x="70" y="66" textAnchor="middle" className="donut-n">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="donut-l">jobs tracked</text>
      </svg>
      <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.n}</b></span>)}</div>
    </div>
  );
}

export function Dashboard({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [range, setRange] = useState(14);
  const [on, setOn] = useState(new Set<string>(['leads', 'sent', 'replies', 'applied']));
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => call<Dash>('dash:get', range).then((x) => { if (alive) { setD(x); setPulse((n) => n + 1); } }).catch(() => undefined);
    void load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [range, tick]);
  const t = d?.totals ?? {};
  const funnel = useMemo(() => d ? [
    ['Found', t.leads], ['With email', t.withEmail], ['Good fit', t.shortlisted], ['Contacted', t.contactedLeads], ['Replied', t.interested], ['Won', t.won],
  ] as [string, number][] : [], [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="page"><div className="dash-loading"><span className="spinner" />Loading your numbers…</div></div>;
  const kpis = [
    { label: 'Leads found', icon: Building2, color: '#7c3aed', n: t.leads, sub: `${t.leadsToday} today`, now: t.leadsWeek, prev: t.leadsPrevWeek, line: d.series.leads, to: 'leads' as Screen },
    { label: 'Emails sent', icon: Send, color: '#06b6d4', n: t.sent, sub: `${t.sentToday} today · ${t.scheduled} queued`, now: t.sentWeek, prev: t.sentPrevWeek, line: d.series.sent, to: 'outreach' as Screen },
    { label: 'Replies', icon: MessageCircleReply, color: '#16a34a', n: t.replies, sub: `${t.sent ? Math.round((t.replies / t.sent) * 100) : 0}% reply rate`, now: t.repliesWeek, prev: t.repliesPrevWeek, line: d.series.replies, to: 'outreach' as Screen },
    { label: 'Job applications', icon: Briefcase, color: '#f59e0b', n: t.applied, sub: `${d.jobStatus.Interview} interviews · ${d.jobStatus.Offer} offers`, now: t.appliedWeek, prev: t.appliedPrevWeek, line: d.series.applied, to: 'jobs' as Screen },
  ];
  const fmax = Math.max(1, ...funnel.map((f) => f[1]));
  const smax = Math.max(1, ...d.sources.map((s) => s.n));
  return (
    <div className="page dash">
      <div className="kpis">
        {kpis.map((k, i) => (
          <button key={k.label} className="panel kpi" style={{ ['--c' as string]: k.color, animationDelay: `${i * 70}ms` }} onClick={() => go(k.to)}>
            <div className="kpi-top"><span className="stat-icon"><k.icon size={16} /></span><span className="muted small">{k.label}</span></div>
            <b><CountUp to={k.n} /></b>
            <Delta now={k.now} prev={k.prev} />
            <span className="muted small kpi-sub">{k.sub}</span>
            <div className="kpi-line"><Sparkline data={k.line.slice(-14)} color={k.color} w={130} h={40} /></div>
          </button>
        ))}
      </div>

      <div className="dash-row">
        <div className="panel panel-pad perf-card">
          <div className="panel-title">
            <h2><Activity size={16} /> Performance</h2>
            <div className="tabs seg" role="tablist" aria-label="Range" style={{ margin: 0 }}>{[7, 14, 30].map((r) => <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}>{r} days</button>)}</div>
          </div>
          <div className="series-toggles">
            {SERIES.map((s) => <button key={s.key} className={on.has(s.key) ? 'on' : ''} style={{ ['--c' as string]: s.color }} onClick={() => setOn((o) => { const n = new Set(o); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n.size ? n : o; })}><i />{s.label}<b>{d.series[s.key].reduce((a, b) => a + b, 0)}</b></button>)}
          </div>
          <PerfChart days={d.days} series={d.series} on={on} />
        </div>
        <div className="panel panel-pad funnel-card">
          <div className="panel-title"><h2>Outreach funnel</h2><span className="pill">all time</span></div>
          <div className="funnel">
            {funnel.map(([label, n], i) => (
              <div key={label} className="fstep" style={{ ['--w' as string]: `${Math.max(6, (n / fmax) * 100)}%`, animationDelay: `${i * 80}ms` }}>
                <span>{label}</span><div className="fbar"><i /></div><b><CountUp to={n} /></b>
                {i > 0 && funnel[i - 1][1] > 0 && <em>{Math.round((n / funnel[i - 1][1]) * 100)}%</em>}
              </div>
            ))}
          </div>
          <div className="mini-stats">
            <span><FileBarChart size={13} /> {t.reports} proof reports</span>
            <span title="Confirmed by a verifier; the second number also counts addresses whose domain accepts mail"><MailCheck size={13} /> {t.verified} confirmed emails · {t.mailDomainOk ?? 0} deliverable domains</span>
            <span><Sparkles size={13} /> {t.drafts} drafts to approve</span>
          </div>
        </div>
      </div>

      <div className="dash-row three">
        <div className="panel panel-pad">
          <div className="panel-title"><h2>Job hunt</h2><button className="btn small ghost" onClick={() => go('jobs')}>Open <ArrowUpRight size={13} /></button></div>
          <Donut parts={[
            { label: 'Saved', n: d.jobStatus.Saved, color: '#c4b5fd' }, { label: 'Applied', n: d.jobStatus.Applied, color: '#7c3aed' },
            { label: 'Interview', n: d.jobStatus.Interview, color: '#06b6d4' }, { label: 'Offer', n: d.jobStatus.Offer, color: '#16a34a' }, { label: 'Rejected', n: d.jobStatus.Rejected, color: '#f43f5e' },
          ]} />
        </div>
        <div className="panel panel-pad live">
          <div className="panel-title"><h2><span className={`live-dot ${d.running.length ? 'on' : ''}`}><Radio size={13} /></span> Live now</h2></div>
          {d.running.length === 0 && <p className="muted small">No searches running. Start one on Find.</p>}
          {d.running.map((r) => (
            <div key={r.id} className="live-item" onClick={() => go('find')}>
              <b>{r.category} in {r.place}</b>
              <div className="bar run"><i style={{ width: '100%' }} /></div>
              <span className="muted small">{r.status === 'queued' ? 'Waiting to start' : `${r.added} new so far`}</span>
            </div>
          ))}
          <div className="live-meta">
            <span className="clickable-row" onClick={() => go('signals')}><Radio size={13} /> {t.signals ?? 0} buying signals, {t.signalsHot ?? 0} hot</span>
            <span><Rocket size={13} /> {t.campaigns} autopilot campaign{t.campaigns === 1 ? '' : 's'} on</span>
            <span><Clock size={13} /> {d.nextSend ? `Next email to ${d.nextSend.name} ${new Date(d.nextSend.due_at) > new Date() ? new Date(d.nextSend.due_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'soon'}` : 'No emails queued'}</span>
          </div>
        </div>
        <div className="panel panel-pad">
          <div className="panel-title"><h2>Activity</h2><span className="pill live-pill"><i key={pulse} />live</span></div>
          <div className="feed" tabIndex={0} role="log" aria-label="Recent activity">
            {d.activity.length === 0 && <p className="muted small">Your activity shows up here as it happens.</p>}
            {d.activity.map((a) => (
              <div key={a.id} className={`feed-item ${a.type}`}>
                <i />
                <div className="grow"><span>{a.name ? <b>{a.name}</b> : null}{a.name ? ' · ' : ''}{a.detail || a.type}</span><em>{ago(a.at)}</em></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-row three">
        <div className="panel panel-pad">
          <div className="panel-title"><h2>Where leads come from</h2></div>
          <div className="hbars">{d.sources.map((s, i) => <div key={s.source} style={{ ['--w' as string]: `${(s.n / smax) * 100}%`, animationDelay: `${i * 60}ms` }}><span>{SRC[s.source] ?? s.source}</span><div><i /></div><b>{s.n}</b></div>)}</div>
        </div>
        <div className="panel panel-pad">
          <div className="panel-title"><h2>Top business types</h2></div>
          <div className="chips-list">{d.categories.map((c) => <span key={c.category}>{c.category}<b>{c.n}</b></span>)}</div>
        </div>
        <div className="panel panel-pad">
          <div className="panel-title"><h2>Top countries</h2></div>
          <div className="chips-list">{d.countries.map((c) => <span key={c.country}>{c.country}<b>{c.n}</b></span>)}</div>
        </div>
      </div>
    </div>
  );
}
