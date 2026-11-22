// CRM pieces used on the Leads screen and in Settings: lead deals/tasks/fields card, saved views (QF-051),
// duplicate review (QF-053), pipeline stages, custom fields (QF-050) and encrypted backups (QF-119).
import { Fragment, useEffect, useState } from 'react';
import { call, json, type Lead } from '../api';
import { toast } from '../App';
import { Plus, Trash2, X, Bookmark, Copy, Undo2, Download, Upload, Briefcase } from 'lucide-react';
import { CustomInput, DealEditor } from './Pipeline';

export function LeadCrmCard({ lead, onChange }: { lead: Lead; onChange: () => void }) {
  const [deals, setDeals] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [task, setTask] = useState({ title: '', due: '' });
  const load = async () => {
    setDeals((await call<any[]>('deals:forLead', lead.id)) ?? []);
    setTasks((await call<any[]>('tasks:list', { leadId: lead.id })) ?? []);
    setStages((await call<any[]>('crm:stages')) ?? []);
    setFields((await call<any[]>('fields:list', 'lead')) ?? []);
  };
  useEffect(() => { void load(); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = json<Record<string, unknown>>((lead as any).custom ?? '{}', {});
  return (
    <div className="panel panel-pad">
      <div className="panel-title"><h2><Briefcase size={15} /> Deals and tasks</h2><button className="btn small" onClick={() => setEdit({ lead_id: lead.id, title: `${lead.name}: `, value: 0, currency: 'USD', stage: stages[0]?.key ?? 'lead' })}><Plus size={13} /> Add a deal</button></div>
      {deals.map((d) => <div key={d.id} className="contact-row"><button className="link" onClick={() => setEdit(d)}>{d.title}</button><span className="muted small">{stages.find((s) => s.key === d.stage)?.label ?? d.stage} · {d.currency} {Math.round(d.value).toLocaleString()}</span><span /></div>)}
      <div className="contacts" style={{ marginTop: 6 }}>
        {tasks.map((t) => (
          <div key={t.id} className="contact-row">
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!t.done_at} onChange={async (e) => { await call('tasks:save', { id: t.id, done: e.target.checked }); void load(); }} /><span style={t.done_at ? { textDecoration: 'line-through' } : {}}>{t.title}</span></label>
            <span className="muted small">{t.due_at ? new Date(t.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
            <button className="btn small ghost" aria-label="Delete task" onClick={async () => { await call('tasks:delete', t.id); void load(); }}><Trash2 size={12} /></button>
          </div>
        ))}
        <div className="row contact-add">
          <input className="input" placeholder="Follow-up task" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
          <input className="input" type="datetime-local" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} aria-label="Due" />
          <button className="btn small" disabled={!task.title} onClick={async () => { await call('tasks:save', { lead_id: lead.id, title: task.title, due_at: task.due ? new Date(task.due).toISOString() : null }); setTask({ title: '', due: '' }); void load(); }} aria-label="Add task"><Plus size={13} /></button>
        </div>
      </div>
      <label className="switch" style={{ marginTop: 8 }}><input type="checkbox" checked={!!(lead as any).wa_consent} onChange={async (e) => { await call('leads:update', lead.id, { wa_consent: e.target.checked ? 1 : 0 }); onChange(); }} /> They agreed to WhatsApp messages (needed for WhatsApp Cloud API sends)</label>
      {fields.filter((f) => f.type !== "formula").length > 0 && <div className="grid2" style={{ marginTop: 8 }}>{fields.filter((f) => f.type !== "formula").map((f) => (
        <CustomInput key={f.id} field={f} value={custom[f.key]} onChange={async (v) => { try { await call('fields:set', 'lead', lead.id, f.key, v); onChange(); } catch (e: any) { toast.push(e.message, true); } }} />
      ))}</div>}
      {edit && <DealEditor deal={edit} stages={stages} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); onChange(); }} />}
    </div>
  );
}

export function SavedViews({ current, apply }: { current: Record<string, unknown>; apply: (f: Record<string, any>) => void }) {
  const [views, setViews] = useState<any[]>([]);
  const load = () => call<any[]>('views:list', 'leads').then((x) => setViews(x ?? []));
  useEffect(() => { void load(); }, []);
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      <Bookmark size={14} className="muted" />
      {views.map((v) => <span key={v.id} className="chip" role="button" tabIndex={0} onClick={() => apply(json(v.filters, {}))} onKeyDown={(e) => e.key === 'Enter' && apply(json(v.filters, {}))}>{v.name}<button className="btn small ghost" aria-label={`Delete view ${v.name}`} onClick={async (e) => { e.stopPropagation(); await call('views:delete', v.id); void load(); }}><X size={11} /></button></span>)}
      <button className="btn small ghost" onClick={async () => { const name = prompt('Name this view (it saves the current filters and sort)'); if (!name) return; await call('views:save', { screen: 'leads', name, filters: current }); void load(); }}>Save view</button>
    </div>
  );
}

export function Duplicates({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [keep, setKeep] = useState<Record<number, number>>({});
  const [merges, setMerges] = useState<any[]>([]);
  const load = async () => { setGroups((await call<any[]>('dupes:list')) ?? []); setMerges(((await call<any[]>('dupes:merges')) ?? []).filter((m) => m.kept_id)); };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal modal-wide" role="dialog" aria-label="Possible duplicates">
        <header><div className="grow"><b>Possible duplicates</b><span className="muted small">Pick the record to keep. Empty fields are filled from the others, and their emails, notes and history move over. You can undo a merge.</span></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 10 }}>
          {groups === null ? <div className="doc-wait"><span className="spinner" />Looking for duplicates…</div> : !groups.length ? <div className="muted">No likely duplicates found.</div> : groups.map((g, gi) => {
            const k = keep[gi] ?? g.leads[0].id;
            return (
              <div key={gi} className="preview-src">
                <div className="row" style={{ justifyContent: 'space-between' }}><b>{g.reason}</b><span className="row" style={{ gap: 6 }}>
                  <button className="btn small ghost" onClick={async () => { await call('dupes:apart', g.leads.map((l: any) => l.id)); void load(); }}>Not duplicates</button>
                  <button className="btn small primary" onClick={async () => { try { await call('dupes:merge', k, g.leads.map((l: any) => l.id)); toast.push('Merged. You can undo it below.'); void load(); } catch (e: any) { toast.push(e.message, true); } }}><Copy size={13} /> Merge into the selected one</button></span></div>
                {g.leads.map((l: any) => <label key={l.id} className="row small" style={{ gap: 8 }}><input type="radio" name={`g${gi}`} checked={k === l.id} onChange={() => setKeep({ ...keep, [gi]: l.id })} /><b>{l.name}</b><span className="muted">{[l.address, l.city, l.phone, l.email, l.source].filter(Boolean).join(' · ')}</span></label>)}
              </div>
            );
          })}
          {merges.length > 0 && <><h3 className="sub-h">Recent merges</h3><div className="timeline small">{merges.slice(0, 10).map((m) => <div key={m.id}><span>{m.at.slice(0, 16).replace('T', ' ')} · {json<any[]>(m.removed, []).map((r) => r.name).join(', ')}</span><span>{m.undone ? 'undone' : <button className="btn small ghost" onClick={async () => { await call('dupes:undo', m.id); toast.push('Merge undone'); void load(); }}><Undo2 size={12} /> Undo</button>}</span></div>)}</div></>}
        </div>
      </div>
    </>
  );
}

export function DataSettings({ s, set }: { s: any; set: (p: string, v: unknown) => void }) {
  const [fields, setFields] = useState<any[]>([]);
  const [nf, setNf] = useState({ entity: 'lead', label: '', type: 'text', options: '' });
  const [pass, setPass] = useState('');
  const [defaults, setDefaults] = useState<any[]>([]);
  const load = () => call<any[]>('fields:list').then((x) => setFields(x ?? []));
  useEffect(() => { void load(); call<any[]>('crm:stages').then((x) => setDefaults(x ?? [])); }, []);
  const stages: any[] = s.crm?.stages?.length ? s.crm.stages : defaults;
  const setStages = (v: any[]) => set('crm', { ...(s.crm ?? {}), stages: v });
  return (
    <section>
      <h2>Pipeline stages</h2>
      <p className="muted small" style={{ margin: 0 }}>Keep "won" and "lost" as the last two; deals there close and update the lead's status.</p>
      {stages.map((st, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <input className="input" value={st.label} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Stage name" />
          <input className="input" style={{ width: 90 }} type="number" min={0} max={100} value={st.probability} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, probability: Number(e.target.value) } : x)))} aria-label="Chance to win %" />
          <span className="muted small" style={{ width: 70 }}>{st.key}</span>
          {!['won', 'lost', 'lead'].includes(st.key) && <button className="btn small ghost" aria-label="Remove stage" onClick={() => setStages(stages.filter((_, j) => j !== i))}><Trash2 size={12} /></button>}
        </div>
      ))}
      <button className="btn small" onClick={() => { const label = prompt('Stage name'); if (!label) return; const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20); const at = Math.max(1, stages.length - 2); setStages([...stages.slice(0, at), { key, label, probability: 50 }, ...stages.slice(at)]); }}><Plus size={13} /> Add a stage</button>

      <h2 style={{ marginTop: 14 }}>Custom fields</h2>
      <p className="muted small" style={{ margin: 0 }}>Formula fields calculate from other fields: numbers, text in quotes, + - * /, comparisons, and if(), round(), min(), max(), concat(), contains(), len(), days_since(). Example: <code>round(reviews / days_since(created_at) * 30, 1)</code></p>
      {fields.map((f) => <div key={f.id} className="contact-row"><span><b>{f.label}</b> · {f.type}{f.type === 'select' ? ` (${json<string[]>(f.options, []).join(', ')})` : ''}</span><span className="muted small">on {f.entity}s</span><button className="btn small ghost" aria-label={`Delete ${f.label}`} onClick={async () => { if (!confirm(`Delete the field "${f.label}"? Saved values stay in the data but are hidden.`)) return; await call('fields:delete', f.id); void load(); }}><Trash2 size={12} /></button></div>)}
      <div className="row" style={{ gap: 6 }}>
        <select className="input" value={nf.entity} onChange={(e) => setNf({ ...nf, entity: e.target.value })} aria-label="Field on"><option value="lead">Leads</option><option value="deal">Deals</option></select>
        <input className="input" placeholder="Field name" value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} />
        <select className="input" value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value })} aria-label="Type">{['text', 'number', 'date', 'select', 'url', 'formula'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
        {nf.type === 'select' && <input className="input" placeholder="Choices, comma separated" value={nf.options} onChange={(e) => setNf({ ...nf, options: e.target.value })} />}
        {nf.type === 'formula' && <input className="input" placeholder='e.g. if(rating < 4, "Needs reviews", "OK")' value={nf.options} onChange={(e) => setNf({ ...nf, options: e.target.value })} />}
        <button className="btn small" disabled={!nf.label} onClick={async () => { try { await call('fields:save', { ...nf, options: nf.type === 'formula' ? [nf.options] : nf.options.split(',') }); setNf({ ...nf, label: '', options: '' }); void load(); } catch (e: any) { toast.push(e.message, true); } }}><Plus size={13} /> Add</button>
      </div>

      <h2 style={{ marginTop: 14 }}>Backups</h2>
      <p className="muted small" style={{ margin: 0 }}>A backup holds all your leads, deals, messages and settings, encrypted with a passphrase you choose. Keep the passphrase safe: without it the backup cannot be opened. Keys and passwords inside stay tied to this computer's keychain, so re-enter them after restoring on another computer.</p>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" type="password" placeholder="Passphrase (8+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} style={{ maxWidth: 260 }} />
        <button className="btn" disabled={pass.length < 8} onClick={async () => { try { const r = await call<any>('backup:make', pass); if (r) toast.push(`Backup saved (${Math.round(r.bytes / 1024).toLocaleString()} KB of data)`); } catch (e: any) { toast.push(e.message, true); } }}><Download size={14} /> Make a backup</button>
        <button className="btn ghost" disabled={pass.length < 8} onClick={async () => {
          try {
            const r = await call<any>('backup:restore', pass);
            if (r && confirm(`The backup is sound and holds ${r.leads.toLocaleString()} leads. Restart Quarrix now to restore it? Your current data is kept as a safety copy.`)) await call('app:restart');
          } catch (e: any) { toast.push(e.message, true); }
        }}><Upload size={14} /> Restore…</button>
      </div>
    </section>
  );
}

/** Companies and their locations (QF-018, QF-052). */
export function Companies({ onOpen }: { onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [locs, setLocs] = useState<any[]>([]);
  useEffect(() => { const t = setTimeout(() => call<any[]>('companies:list', q).then((x) => setRows(x ?? [])), 200); return () => clearTimeout(t); }, [q]);
  return (
    <div className="panel panel-pad">
      <div className="row" style={{ gap: 6, marginBottom: 8 }}><input className="input" placeholder="Find a company" value={q} onChange={(e) => setQ(e.target.value)} /><span className="muted small">Locations that share one website are grouped under one company.</span></div>
      <table className="leads"><thead><tr><th>Company</th><th>Locations</th><th>Cities</th><th>Rating</th><th>Contacts</th><th>Open deals</th></tr></thead><tbody>
        {rows.map((c) => (
          <Fragment key={c.id}>
            <tr className="clickable" onClick={async () => { if (open === c.id) { setOpen(null); return; } setOpen(c.id); setLocs((await call<any[]>('companies:locations', c.id)) ?? []); }}>
              <td><b>{c.name}</b><span className="sub">{c.domain}</span></td><td>{c.locations}</td><td className="clip small">{c.cities}</td>
              <td>{c.rating ?? '—'}{c.reviews ? <span className="muted"> ({c.reviews})</span> : null}</td><td>{c.contacts}</td><td>{c.pipeline ? Math.round(c.pipeline).toLocaleString() : '—'}</td>
            </tr>
            {open === c.id && <tr><td colSpan={6}><div className="contacts">{locs.map((l) => <div key={l.id} className="contact-row"><button className="link" onClick={() => onOpen(l.id)}>{l.name}</button><span className="muted small">{[l.address, l.city].filter(Boolean).join(', ')}{l.phone ? ` · ${l.phone}` : ''}</span><span className="small">{l.grade || ''}</span></div>)}</div></td></tr>}
          </Fragment>
        ))}
        {!rows.length && <tr><td colSpan={6} className="muted">No companies yet. They appear once leads have a website.</td></tr>}
      </tbody></table>
    </div>
  );
}

/** Client workspaces (QF-056): new leads go to the chosen client; Leads, exports and the API show that client's leads. */
export function ClientPicker({ onStart, onChange }: { onStart: () => void; onChange: () => void }) {
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('settings:get').then(setS).catch(e => toast.push(String(e), true)); }, []);
  if (!s) return null;
  const list: string[] = s.clients ?? [];
  const pick = async (v: string) => {
    const name = v === '__new' ? prompt('Client name')?.trim() : undefined;
    if (v === '__new' && !name) return;
    setBusy(true); onStart();
    try { if (name) await call('clients:set', name, [...list, name]); else await call('clients:set', v); setS(await call('settings:get')); }
    catch (e) { toast.push(String(e), true); }
    finally { setBusy(false); onChange(); }
  };
  return (
    <select className="select" disabled={busy} value={s.currentClient ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Client workspace" title="New leads from searches are filed under this client">
      <option value="">All clients</option>{list.map((c) => <option key={c} value={c}>Client: {c}</option>)}<option value="__new">+ New client…</option>
    </select>
  );
}
