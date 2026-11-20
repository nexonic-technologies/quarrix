// Job search extras: followed employers (QF-091 to QF-096, QF-104), alerts (QF-107) and link checks (QF-105).
import { useEffect, useState } from 'react';
import { call, json } from '../api';
import { toast } from '../App';
import { Plus, Trash2, Bell, Play, ShieldCheck } from 'lucide-react';

export function EmployersPanel() {
  const [list, setList] = useState<any[]>([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => call<any[]>('employers:list').then((x) => setList(x ?? []));
  useEffect(() => { void load(); }, []);
  const add = async () => {
    setBusy(true);
    try { const r = await call<any>('employers:add', link); toast.push(`${r.name}: ${r.jobs} open roles found on ${r.ats}`); setLink(''); void load(); } catch (e: any) { toast.push(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="panel panel-pad" style={{ marginBottom: 10 }}>
      <div className="panel-title"><h2>Employers you follow</h2><span className="pill">Jobs straight from their own hiring page</span></div>
      <p className="muted small" style={{ marginTop: 0 }}>Paste a company's careers or job link. Quarrix recognises Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, Pinpoint and Workday, and reads their public job feed. Choose "Followed employers" in Job boards to include them in searches.</p>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" placeholder="https://boards.greenhouse.io/company or https://jobs.lever.co/company" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && link && add()} />
        <button className="btn primary" disabled={!link || busy} onClick={add}><Plus size={14} /> {busy ? 'Checking…' : 'Follow'}</button>
      </div>
      <div className="contacts" style={{ marginTop: 8 }}>{list.map((e) => (
        <div key={e.id} className="contact-row">
          <span><b>{e.name}</b> · {e.ats}</span>
          <span className={`small ${e.error ? '' : 'muted'}`} style={e.error ? { color: '#b91c1c' } : {}}>{e.error || (e.last_count != null ? `${e.last_count} open roles` : '')}{e.last_run ? ` · checked ${new Date(e.last_run).toLocaleDateString()}` : ''}</span>
          <button className="btn small ghost" aria-label={`Stop following ${e.name}`} onClick={async () => { await call('employers:remove', e.id); void load(); }}><Trash2 size={12} /></button>
        </div>))}{!list.length && <span className="muted small">No employers yet.</span>}</div>
    </div>
  );
}

export function AlertsPanel({ current, onOpen }: { current: Record<string, any>; onOpen: (jobs: unknown[]) => void }) {
  const [list, setList] = useState<any[]>([]);
  const [hours, setHours] = useState(12);
  const load = () => call<any[]>('alerts:list').then((x) => setList(x ?? []));
  useEffect(() => { void load(); }, []);
  return (
    <div className="panel panel-pad" style={{ marginBottom: 10 }}>
      <div className="panel-title"><h2><Bell size={15} /> Job alerts</h2><button className="btn small ghost" onClick={async () => { const r = await call<[string, number][]>('alerts:run'); toast.push(r?.length ? r.map(([n, c]) => `${n}: ${c} new`).join(', ') : 'No new jobs right now'); void load(); }}><Play size={13} /> Check now</button></div>
      <p className="muted small" style={{ marginTop: 0 }}>Saves the search above with all its filters. While Quarrix is open it re-runs on schedule and notifies you about postings that are new since the alert was made.</p>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
        <span className="small">Every</span><select className="select" style={{ width: 130, flex: "none" }} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="How often">{[3, 6, 12, 24, 72].map((h) => <option key={h} value={h}>{h < 24 ? `${h} hours` : `${h / 24} day${h > 24 ? 's' : ''}`}</option>)}</select>
        <button className="btn small primary" disabled={!current.keywords} onClick={async () => { await call('alerts:save', { name: current.name || current.keywords, query: current, every_hours: hours }); toast.push('Alert saved. The first check records what exists today.'); void load(); }}><Plus size={13} /> Save this search as an alert</button>
      </div>
      <div className="contacts" style={{ marginTop: 8 }}>{list.map((a) => {
        const q = json<any>(a.query, {});
        return (
          <div key={a.id} className="contact-row">
            <button className="link" onClick={async () => onOpen(await call<any[]>('alerts:hits', a.id))}><b>{a.name}</b>{a.unseen ? <span className="badge">{a.unseen} new</span> : null}</button>
            <span className="muted small">{[q.city, q.countryName].filter(Boolean).join(', ') || 'anywhere'} · every {a.every_hours}h{a.last_run ? ` · last ${new Date(a.last_run).toLocaleString()}` : ''}</span>
            <button className="btn small ghost" aria-label={`Delete alert ${a.name}`} onClick={async () => { await call('alerts:delete', a.id); void load(); }}><Trash2 size={12} /></button>
          </div>);
      })}{!list.length && <span className="muted small">No alerts yet.</span>}</div>
    </div>
  );
}

export function CheckLink({ url }: { url: string }) {
  const [r, setR] = useState<{ state: string; why: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { setR(await call('jobs:check', url)); } catch (e: any) { toast.push(e.message, true); } setBusy(false); }} title="Checks the link loads and the posting is still open"><ShieldCheck size={13} /> {busy ? 'Checking…' : 'Is it still open?'}</button>
      {r && <span className={`small ${r.state === 'closed' ? '' : 'muted'}`} style={r.state === 'closed' ? { color: '#b91c1c' } : {}}>{r.state === 'open' ? 'Looks open' : r.state === 'closed' ? 'Looks closed' : 'Could not tell'} ({r.why})</span>}
    </>
  );
}
