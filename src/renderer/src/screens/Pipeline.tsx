// Pipeline (phase 5): Kanban board of deals (QF-047, QF-048), forecast (QF-055), tasks and a week calendar (QF-049, QF-054).
import { useEffect, useMemo, useState } from 'react';
import { call, json } from '../api';
import { toast } from '../App';
import { EmptyArt } from '../Art';
import { Plus, ChevronLeft, ChevronRight, Trash2, X, Check, CalendarDays, ListTodo, KanbanSquare } from 'lucide-react';

type Stage = { key: string; label: string; probability: number };
type Deal = { id: number; lead_id: number | null; title: string; value: number; currency: string; probability: number | null; stage: string; expected_close: string | null; products: string; notes: string; lost_reason: string; custom: string; lead_name?: string; next_task?: string | null };
const money = (v: number, c = 'USD') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v); } catch { return `${c} ${Math.round(v)}`; } };

export function Pipeline({ tick, openLead }: { tick: number; openLead: (id: number) => void }) {
  const [tab, setTab] = useState<'board' | 'tasks' | 'forecast'>('board');
  return (
    <div className="page">
      <div className="tabs seg" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}><KanbanSquare size={14} /> Deals</button>
        <button role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}><ListTodo size={14} /> Tasks</button>
        <button role="tab" aria-selected={tab === 'forecast'} onClick={() => setTab('forecast')}><CalendarDays size={14} /> Forecast</button>
      </div>
      {tab === 'board' && <Board tick={tick} openLead={openLead} />}
      {tab === 'tasks' && <Tasks tick={tick} openLead={openLead} />}
      {tab === 'forecast' && <Forecast tick={tick} />}
    </div>
  );
}

function Board({ tick, openLead }: { tick: number; openLead: (id: number) => void }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [edit, setEdit] = useState<Partial<Deal> | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const load = async () => { setStages((await call<Stage[]>('crm:stages')) ?? []); setDeals((await call<Deal[]>('deals:list')) ?? []); };
  useEffect(() => { void load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = async (id: number, stage: string, beforeId: number | null = null) => { try { await call('deals:move', id, stage, beforeId); await load(); } catch (e: any) { toast.push(e.message, true); } };
  const step = (d: Deal, dir: -1 | 1) => { const i = stages.findIndex((s) => s.key === d.stage); const t = stages[i + dir]; if (t) void move(d.id, t.key); };
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="muted small">Drag a card to another column, or use the arrow buttons. Every change is kept in the deal's history.</span>
        <button className="btn primary" onClick={() => setEdit({ title: '', value: 0, currency: 'USD', stage: stages[0]?.key ?? 'lead' })}><Plus size={14} /> New deal</button>
      </div>
      {!deals.length && <div className="panel empty"><EmptyArt /><h3>No deals yet</h3>Create one here, or from a lead's panel with "Add a deal".</div>}
      <div className="kanban" role="list">
        {stages.map((s) => {
          const col = deals.filter((d) => d.stage === s.key);
          const total = col.reduce((a, d) => a + d.value, 0);
          return (
            <section key={s.key} className={`kcol ${drag ? 'droppable' : ''}`} role="listitem" aria-label={s.label}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag) void move(drag, s.key); setDrag(null); }}>
              <header><b>{s.label}</b><span className="muted small">{col.length} · {money(total, col[0]?.currency)}</span></header>
              {col.map((d) => (
                <article key={d.id} className="kcard" draggable onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag(null)}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag !== d.id) void move(drag, s.key, d.id); setDrag(null); }}>
                  <button className="kt" onClick={() => setEdit(d)}>{d.title}</button>
                  <div className="small">{money(d.value, d.currency)}{d.probability != null ? ` · ${d.probability}%` : ''}{d.expected_close ? ` · ${d.expected_close}` : ''}</div>
                  {d.lead_name && <button className="link small" onClick={() => d.lead_id && openLead(d.lead_id)}>{d.lead_name}</button>}
                  {d.next_task && <div className="muted small">Next task {new Date(d.next_task).toLocaleDateString()}</div>}
                  <div className="kmove"><button className="btn small ghost" aria-label={`Move ${d.title} left`} disabled={stages[0]?.key === d.stage} onClick={() => step(d, -1)}><ChevronLeft size={13} /></button><button className="btn small ghost" aria-label={`Move ${d.title} right`} disabled={stages[stages.length - 1]?.key === d.stage} onClick={() => step(d, 1)}><ChevronRight size={13} /></button></div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {edit && <DealEditor deal={edit} stages={stages} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
    </>
  );
}

export function DealEditor({ deal, stages, onClose, onSaved }: { deal: Partial<Deal>; stages: Stage[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Partial<Deal>>(deal);
  const [hist, setHist] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  useEffect(() => { if (deal.id) call<any[]>('deals:history', deal.id).then((x) => setHist(x ?? [])); call<any[]>('fields:list', 'deal').then((x) => setFields(x ?? [])); }, [deal.id]);
  const custom = json<Record<string, unknown>>(d.custom ?? '{}', {});
  const put = (k: keyof Deal, v: unknown) => setD((o) => ({ ...o, [k]: v }));
  const save = async () => { try { await call('deals:save', { ...d, custom }); toast.push('Deal saved'); onSaved(); } catch (e: any) { toast.push(e.message, true); } };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Deal">
        <header><div className="grow"><b>{d.id ? 'Edit deal' : 'New deal'}</b></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, display: 'grid', gap: 8, overflow: 'auto' }}>
          <label className="field"><span>Title</span><input className="input" value={d.title ?? ''} onChange={(e) => put('title', e.target.value)} placeholder="Website redesign" autoFocus /></label>
          <div className="grid3">
            <label className="field"><span>Value</span><input className="input" type="number" min={0} value={d.value ?? 0} onChange={(e) => put('value', Number(e.target.value))} /></label>
            <label className="field"><span>Currency</span><input className="input" value={d.currency ?? 'USD'} maxLength={3} onChange={(e) => put('currency', e.target.value.toUpperCase())} /></label>
            <label className="field"><span>Chance to win (%)</span><input className="input" type="number" min={0} max={100} value={d.probability ?? ''} placeholder={String(stages.find((s) => s.key === d.stage)?.probability ?? '')} onChange={(e) => put('probability', e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <label className="field"><span>Stage</span><select className="input" value={d.stage} onChange={(e) => put('stage', e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            <label className="field"><span>Expected close</span><input className="input" type="date" value={d.expected_close ?? ''} onChange={(e) => put('expected_close', e.target.value)} /></label>
            <label className="field"><span>Products or services</span><input className="input" value={d.products ?? ''} onChange={(e) => put('products', e.target.value)} /></label>
          </div>
          {d.stage === 'lost' && <label className="field"><span>Why it was lost</span><input className="input" value={d.lost_reason ?? ''} onChange={(e) => put('lost_reason', e.target.value)} placeholder="Price, timing, went with someone else…" /></label>}
          <label className="field"><span>Notes</span><textarea className="input" rows={3} value={d.notes ?? ''} onChange={(e) => put('notes', e.target.value)} /></label>
          {fields.filter((f) => f.type !== 'formula').length > 0 && <div className="grid2">{fields.filter((f) => f.type !== 'formula').map((f) => <CustomInput key={f.id} field={f} value={custom[f.key]} onChange={(v) => setD((o) => ({ ...o, custom: JSON.stringify({ ...custom, [f.key]: v }) }))} />)}</div>}
          {hist.length > 0 && <><h3 className="sub-h">History</h3><div className="timeline small">{hist.map((h) => <div key={h.id}><span>{h.at.slice(0, 16).replace('T', ' ')}</span><span>{h.field}: {h.before ?? '—'} → {h.after ?? '—'}</span></div>)}</div></>}
        </div>
        <footer className="row" style={{ justifyContent: 'space-between' }}>
          {d.id ? <button className="btn ghost" onClick={async () => { if (!confirm('Delete this deal?')) return; await call('deals:delete', d.id); onSaved(); }}><Trash2 size={14} /> Delete</button> : <span />}
          <button className="btn primary" onClick={save}>Save deal</button>
        </footer>
      </div>
    </>
  );
}

export function CustomInput({ field: f, value, onChange }: { field: any; value: unknown; onChange: (v: unknown) => void }) {
  const opts: string[] = json(f.options, []);
  return (
    <label className="field"><span>{f.label}</span>
      {f.type === 'select' ? <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
        : <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function Tasks({ tick, openLead }: { tick: number; openLead: (id: number) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'week'>('list');
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; });
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const load = () => call<any[]>('tasks:list', {}).then((x) => setRows(x ?? []));
  useEffect(() => { void load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => { try { await call('tasks:save', { title, due_at: due ? new Date(due).toISOString() : null }); setTitle(''); setDue(''); void load(); } catch (e: any) { toast.push(e.message, true); } };
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; }), [start]);
  const overdue = (t: any) => !t.done_at && t.due_at && Date.parse(t.due_at) < Date.now();
  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input className="input" placeholder="New task, for example: Call back about the quote" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title && add()} />
        <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" style={{ maxWidth: 220 }} />
        <button className="btn primary" disabled={!title} onClick={add}><Plus size={14} /> Add</button>
        <div className="seg" role="group" aria-label="View"><button className={`btn small ${view === 'list' ? 'primary' : 'ghost'}`} onClick={() => setView('list')}>List</button><button className={`btn small ${view === 'week' ? 'primary' : 'ghost'}`} onClick={() => setView('week')}>Week</button></div>
      </div>
      {view === 'list' ? (
        rows.length ? <div className="panel tasks">{rows.map((t) => (
          <div key={t.id} className={`task ${t.done_at ? 'done' : ''} ${overdue(t) ? 'late' : ''}`}>
            <input type="checkbox" checked={!!t.done_at} aria-label={`Done: ${t.title}`} onChange={async (e) => { await call('tasks:save', { id: t.id, done: e.target.checked }); void load(); }} />
            <span className="grow">{t.title}{t.lead_name && <> · <button className="link" onClick={() => openLead(t.lead_id)}>{t.lead_name}</button></>}{t.deal_title ? ` · ${t.deal_title}` : ''}</span>
            <span className="muted small">{t.due_at ? new Date(t.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'no date'}</span>
            <button className="btn small ghost" aria-label="Delete task" onClick={async () => { await call('tasks:delete', t.id); void load(); }}><Trash2 size={12} /></button>
          </div>))}</div> : <div className="panel empty"><EmptyArt /><h3>No tasks</h3>Add one above. You get a reminder when it is due.</div>
      ) : (
        <div className="panel panel-pad">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn small ghost" onClick={() => setStart((d) => new Date(d.getTime() - 7 * 864e5))} aria-label="Previous week"><ChevronLeft size={14} /></button>
            <b>{days[0].toLocaleDateString()} – {days[6].toLocaleDateString()}</b>
            <button className="btn small ghost" onClick={() => setStart((d) => new Date(d.getTime() + 7 * 864e5))} aria-label="Next week"><ChevronRight size={14} /></button>
          </div>
          <div className="week">{days.map((d) => {
            const list = rows.filter((t) => t.due_at && new Date(t.due_at).toDateString() === d.toDateString());
            return <div key={d.toISOString()} className={`wday ${d.toDateString() === new Date().toDateString() ? 'today' : ''}`}><b>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</b>
              {list.map((t) => <div key={t.id} className={`wtask ${t.done_at ? 'done' : ''}`}>{t.done_at ? <Check size={11} /> : null}{new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {t.title}</div>)}</div>;
          })}</div>
        </div>
      )}
    </>
  );
}

function Forecast({ tick }: { tick: number }) {
  const [f, setF] = useState<any>(null);
  useEffect(() => { call('deals:forecast').then(setF); }, [tick]);
  if (!f) return null;
  const cur = f.currencies?.[0] ?? 'USD';
  const max = Math.max(1, ...f.byMonth.map((m: any) => Math.max(m.won, m.expected)));
  return (
    <div className="bento">
      <div className="panel panel-pad">
        <div className="panel-title"><h2>Pipeline</h2>{f.currencies.length > 1 && <span className="pill">Mixed currencies: totals are not converted</span>}</div>
        <div className="metrics-strip">
          <div><b>{f.open}</b><span>Open deals</span></div><div><b>{money(f.pipeline, cur)}</b><span>Open value</span></div>
          <div><b>{money(f.weighted, cur)}</b><span>Weighted by chance</span></div><div><b>{money(f.won, cur)}</b><span>Won</span></div>
          <div><b>{f.winRate == null ? '–' : `${f.winRate}%`}</b><span>Win rate</span></div>
        </div>
        <div className="pipeline">{f.byStage.map((s: any) => <div key={s.stage} className="stage"><span>{s.label}</span><div className="stage-bar"><i style={{ width: `${f.pipeline ? Math.min(100, (s.value / Math.max(f.pipeline, f.won, 1)) * 100) : 0}%` }} /></div><b>{s.count} · {money(s.value, cur)}</b></div>)}</div>
      </div>
      <div className="panel panel-pad">
        <div className="panel-title"><h2>By month</h2><span className="pill">Won and expected (weighted)</span></div>
        <div className="months">{f.byMonth.map((m: any) => (
          <div key={m.month} className="mcol" title={`${m.month}: won ${money(m.won, cur)}, expected ${money(m.expected, cur)}`}>
            <div className="mbars"><i className="won" style={{ height: `${(m.won / max) * 100}%` }} /><i className="exp" style={{ height: `${(m.expected / max) * 100}%` }} /></div>
            <span>{new Date(m.month + '-15').toLocaleDateString(undefined, { month: 'short' })}</span>
          </div>))}</div>
        {f.lostReasons.length > 0 && <><h3 className="sub-h">Why deals were lost</h3><div className="timeline small">{f.lostReasons.map((r: any) => <div key={r.reason}><span>{r.reason}</span><span>{r.n}</span></div>)}</div></>}
      </div>
    </div>
  );
}
