import { useEffect, useState } from 'react';
import { Plus, Play, Pause, Trash2, Rocket, ShieldCheck, Send, Search as SearchIcon, PenLine } from 'lucide-react';
import { call } from '../api';
import { toast, type Screen } from '../App';
import { EmptyArt } from '../Art';

type Campaign = { id?: number; name: string; category: string; places: string; sources: string; daily: number; auto_send: number; enabled: number; cursor?: number; last_run?: string | null; leads?: number; with_email?: number; sent?: number; replies?: number };
const SRC: [string, string][] = [['gmaps', 'Google Maps'], ['osm', 'OpenStreetMap'], ['web', 'Web search'], ['dir', 'Directories'], ['places', 'Places API']];
const blank: Campaign = { name: '', category: '', places: '[]', sources: '["gmaps","osm","web"]', daily: 20, auto_send: 1, enabled: 1 };

export function Autopilot({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [list, setList] = useState<Campaign[]>([]);
  const [edit, setEdit] = useState<Campaign | null>(null);
  const load = () => call<Campaign[]>('campaigns:list').then(setList);
  useEffect(() => { void load(); }, [tick]);

  const save = async () => {
    if (!edit) return;
    const places = JSON.parse(edit.places) as string[];
    if (!edit.category.trim() || !places.length) { toast.push('Add a kind of business and at least one place.', true); return; }
    await call('campaigns:save', { ...edit, name: edit.name || `${edit.category}, ${places[0]}` });
    setEdit(null); toast.push('Autopilot saved. It runs once a day.'); void load();
  };

  return (
    <div className="page">
      <div className="flow">
        {[[SearchIcon, 'Finds new businesses', 'One place from your list every day'], [ShieldCheck, 'Checks them', 'Website, owner name, working email'], [PenLine, 'Writes the emails', 'Personal first email and follow-ups'], [Send, 'Sends safely', 'Within your daily limit and their office hours']].map(([Icon, t, d], i) => {
          const I = Icon as typeof Send;
          return <div key={i} className="flow-step"><span><I size={15} /></span><b>{t as string}</b><small>{d as string}</small></div>;
        })}
      </div>
      <div className="page-head"><div className="grow"><p>Each campaign runs on its own, every day, while Quarrix is open.</p></div><button className="btn primary" onClick={() => setEdit({ ...blank })}><Plus size={15} /> New campaign</button></div>

      {edit && (
        <div className="panel panel-pad camp-form">
          <div className="grid2">
            <label className="field"><span>Kind of business</span><input className="input" value={edit.category} placeholder="Dentists" onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></label>
            <label className="field"><span>Campaign name</span><input className="input" value={edit.name} placeholder="Optional" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          </div>
          <label className="field"><span>Places, one per line</span>
            <textarea className="input" rows={4} placeholder={'Austin, Texas\nDallas, Texas\nLondon, United Kingdom'} value={(JSON.parse(edit.places) as string[]).join('\n')}
              onChange={(e) => setEdit({ ...edit, places: JSON.stringify(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)) })} />
            <small>One place is searched each day, then it moves to the next and starts again at the top.</small>
          </label>
          <div className="row">
            {SRC.map(([id, label]) => { const on = (JSON.parse(edit.sources) as string[]).includes(id); return (
              <span key={id} className="chip solid" role="button" tabIndex={0} aria-pressed={on} onClick={() => { const cur = JSON.parse(edit.sources) as string[]; setEdit({ ...edit, sources: JSON.stringify(on ? cur.filter((x) => x !== id) : [...cur, id]) }); }}>{label}</span>
            ); })}
          </div>
          <div className="grid2">
            <label className="field"><span>New emails per day</span><input className="input" type="number" min={1} max={200} value={edit.daily} onChange={(e) => setEdit({ ...edit, daily: Number(e.target.value) })} /><small>Your mailbox limit in Settings still applies and wins.</small></label>
            <div className="field"><span>Sending</span>
              <label className="switch"><input type="checkbox" checked={!!edit.auto_send} onChange={(e) => setEdit({ ...edit, auto_send: e.target.checked ? 1 : 0 })} /> Send automatically, no approval</label>
              <small>{edit.auto_send ? 'Only leads with a working email address are sent to. Follow-ups stop when they reply.' : 'Drafts wait in Outreach for you to approve.'}</small>
            </div>
          </div>
          <div className="row"><button className="btn primary" onClick={save}>Save campaign</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}

      {list.length === 0 && !edit ? (
        <div className="panel empty"><EmptyArt /><h3>No autopilot yet</h3>Create a campaign and Quarrix finds, checks and emails new businesses every day.</div>
      ) : (
        <div className="camps">
          {list.map((c) => {
            const places = JSON.parse(c.places) as string[];
            return (
              <div key={c.id} className="panel camp">
                <div className="camp-top">
                  <span className={`camp-icon ${c.enabled ? 'on' : ''}`}><Rocket size={16} /></span>
                  <div className="grow"><h3>{c.name}</h3><p className="muted small">{c.category} · {places.length} places · next: {places[(c.cursor ?? 0) % places.length]} · {c.auto_send ? 'sends automatically' : 'needs approval'}</p></div>
                  <span className={`status ${c.enabled ? 'replied' : 'lost'}`}>{c.enabled ? 'Running' : 'Paused'}</span>
                </div>
                <div className="camp-stats">
                  <div><b>{c.leads ?? 0}</b><span>leads</span></div><div><b>{c.with_email ?? 0}</b><span>with email</span></div>
                  <div><b>{c.sent ?? 0}</b><span>emails sent</span></div><div><b>{c.replies ?? 0}</b><span>replies</span></div>
                </div>
                <div className="row">
                  <button className="btn small" onClick={async () => { await call('campaigns:run', c.id); toast.push('Running now'); go('find'); }}><Play size={13} /> Run now</button>
                  <button className="btn small" onClick={async () => { await call('campaigns:save', { id: c.id, enabled: c.enabled ? 0 : 1 }); void load(); }}>{c.enabled ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>
                  <button className="btn small" onClick={() => setEdit({ ...c })}>Edit</button>
                  <button className="btn small ghost danger" onClick={async () => { if (!confirm('Delete this campaign? Its leads stay.')) return; await call('campaigns:delete', c.id); void load(); }}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
