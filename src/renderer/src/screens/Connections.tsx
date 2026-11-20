// Settings → Connections (local API, CLI, MCP, bookmarklet, webhooks, HubSpot, Notion, Google Sheets)
// and Settings → Automations (QF-076 to QF-078, QF-081 to QF-090).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { Plus, Trash2, Copy, RefreshCw, Send, Zap } from 'lucide-react';

const EVENTS = ['lead_created', 'lead_enriched', 'reply', 'signal', 'deal', 'sent', 'bounce', 'search_done'];
const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.push('Copied'); };
const rid = () => Math.random().toString(36).slice(2, 10);

export function Connections({ s, set, save }: { s: any; set: (p: string, v: unknown) => void; save: () => Promise<void> }) {
  const [api, setApi] = useState<{ token: string; port: number } | null>(null);
  const [capture, setCapture] = useState('');
  const [cliInfo, setCliInfo] = useState<any>(null);
  useEffect(() => { call('cli:info').then(setCliInfo); }, []);
  useEffect(() => { if (s.api?.on) call<string>('api:captureToken').then(setCapture); }, [s.api?.on]);
  const hooks: any[] = s.webhooks ?? [];
  const setHook = (i: number, k: string, v: unknown) => set('webhooks', hooks.map((h, j) => (j === i ? { ...h, [k]: v } : h)));
  useEffect(() => { if (s.api?.on) call<any>('api:token').then(setApi); }, [s.api?.on]);
  const bookmarklet = api ? `javascript:(()=>{fetch('http://127.0.0.1:${api.port}/v1/capture',{method:'POST',headers:{'Authorization':'Bearer ${capture}','Content-Type':'application/json'},body:JSON.stringify({url:location.href,title:document.title})}).then(r=>r.json()).then(j=>alert(j.error||(j.created?'Saved to Quarrix':'Already in Quarrix'))).catch(()=>alert('Quarrix is not open'))})()` : '';
  return (
    <section>
      <h2>Local API, command line and assistants</h2>
      <p className="muted small" style={{ margin: 0 }}>Lets scripts, the <code>quarrix</code> command and AI assistants (through MCP) read your leads and start searches. It only listens on this computer and needs a secret token.</p>
      <label className="switch"><input type="checkbox" checked={!!s.api?.on} onChange={(e) => set('api', { ...s.api, on: e.target.checked })} /> Turn on the local API</label>
      <div className="row" style={{ gap: 6 }}>
        <label className="field" style={{ maxWidth: 160 }}><span>Port</span><input className="input" type="number" min={1024} max={65535} value={s.api?.port ?? 47811} onChange={(e) => set('api', { ...s.api, port: Number(e.target.value) })} /></label>
        <button className="btn small" style={{ alignSelf: 'end' }} onClick={async () => { await save(); const p = await call('api:apply'); toast.push(p ? `Local API on at 127.0.0.1:${p}` : 'Local API off'); if (p) setApi(await call('api:token')); }}>Apply</button>
      </div>
      {s.api?.on && api && <div className="note">
        <div className="row" style={{ gap: 6 }}><b>Token</b><code className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{api.token.slice(0, 6)}••••••••</code>
          <button className="btn small ghost" onClick={() => copy(api.token)}><Copy size={12} /> Copy</button>
          <button className="btn small ghost" onClick={async () => { if (!confirm('Make a new token? Anything using the old one stops working.')) return; setApi({ ...api, token: await call('api:newToken') }); }}><RefreshCw size={12} /> New token</button></div>
        <div className="small" style={{ marginTop: 6 }}>Command line: <button className="btn small ghost" onClick={async () => { try { const r = await call<any>('cli:install'); toast.push(`Installed ${r.file}. ${r.hint}`); } catch (e: any) { toast.push(e.message, true); } }}>Install the quarrix command</button> then run <code>quarrix leads --grade A</code>. No Node.js needed.</div>
        {cliInfo && <div className="small" style={{ marginTop: 6 }}>AI assistants (MCP): <button className="btn small ghost" onClick={() => copy(JSON.stringify({ mcpServers: { quarrix: cliInfo.mcpConfig } }, null, 2))}><Copy size={12} /> Copy MCP settings</button> and paste them into your assistant's MCP configuration. Full list in docs/INTEGRATIONS.md.</div>}
        <div className="small" style={{ marginTop: 6 }}>Save a business website from your browser: copy this bookmarklet into a new bookmark's address. It uses a capture-only token that can save websites and nothing else. <button className="btn small ghost" onClick={() => copy(bookmarklet)}><Copy size={12} /> Copy bookmarklet</button></div>
      </div>}

      <h2 style={{ marginTop: 14 }}>Webhooks</h2>
      <p className="muted small" style={{ margin: 0 }}>Post events to Zapier, Make, n8n or your own server. Each request is signed: check the <code>X-Quarrix-Signature</code> header (HMAC-SHA256 of the body with your secret). Failed deliveries retry three times.</p>
      {hooks.map((h, i) => (
        <div key={i} className="panel panel-pad feed">
          <label className="field"><span>URL</span><input className="input" value={h.url} onChange={(e) => setHook(i, 'url', e.target.value.trim())} placeholder="https://hooks.zapier.com/…" /></label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{EVENTS.map((ev) => <label key={ev} className="chip"><input type="checkbox" checked={h.events.includes(ev)} onChange={(e) => setHook(i, 'events', e.target.checked ? [...h.events, ev] : h.events.filter((x: string) => x !== ev))} /> {ev}</label>)}</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="row" style={{ gap: 6 }}><label className="switch"><input type="checkbox" checked={h.on} onChange={(e) => setHook(i, 'on', e.target.checked)} /> On</label><button className="btn small ghost" onClick={() => copy(h.secret)}><Copy size={12} /> Copy secret</button>
              <button className="btn small ghost" onClick={async () => { await save(); await call('hooks:test', h.url); toast.push('Test sent. Check the recent deliveries in Automations.'); }}><Send size={12} /> Send a test</button></span>
            <button className="btn small ghost" onClick={() => set('webhooks', hooks.filter((_, j) => j !== i))}><Trash2 size={12} /> Remove</button>
          </div>
        </div>
      ))}
      <button className="btn small" onClick={() => set('webhooks', [...hooks, { url: '', events: ['reply'], secret: rid() + rid() + rid(), on: true }])}><Plus size={13} /> Add a webhook</button>

      <h2 style={{ marginTop: 14 }}>HubSpot</h2>
      <label className="field"><span>Private app token</span><input className="input" type="password" value={s.hubspot?.token ?? ''} onChange={(e) => set('hubspot', { token: e.target.value.trim() })} /><small>HubSpot → Settings → Integrations → Private apps → create one with CRM companies and contacts read/write. Then select leads and choose "Send to HubSpot".</small></label>
      <h2 style={{ marginTop: 14 }}>Notion</h2>
      <div className="grid2">
        <label className="field"><span>Integration token</span><input className="input" type="password" value={s.notion?.token ?? ''} onChange={(e) => set('notion', { ...s.notion, token: e.target.value.trim() })} /><small>notion.so/my-integrations → New integration. Then share your database with it.</small></label>
        <label className="field"><span>Database ID or link</span><input className="input" value={s.notion?.databaseId ?? ''} onChange={(e) => set('notion', { ...s.notion, databaseId: (e.target.value.match(/[0-9a-f]{32}/i)?.[0] ?? e.target.value).trim() })} /><small>Columns named Email, Phone, Website, City, Category, Status, Grade or Contact are filled when they exist.</small></label>
      </div>
      <h2 style={{ marginTop: 14 }}>Google Sheets</h2>
      <label className="field"><span>Sheet link or ID</span><input className="input" value={s.sheets?.spreadsheetId ?? ''} onChange={(e) => set('sheets', { ...s.sheets, spreadsheetId: e.target.value.trim() })} /><small>Uses the Google OAuth client from Settings → Email. Rows are added to the first tab.</small></label>
      <div className="row" style={{ gap: 6 }}><button className="btn small" onClick={async () => { await save(); try { toast.push(`Connected as ${await call('sheets:connect')}`); } catch (e: any) { toast.push(e.message, true); } }}>{s.sheets?.user ? `Reconnect (${s.sheets.user})` : 'Connect Google Sheets'}</button></div>
    </section>
  );
}

const OPS: [string, string][] = [['eq', 'is'], ['neq', 'is not'], ['in', 'is one of'], ['contains', 'contains'], ['gte', 'at least'], ['lte', 'at most'], ['empty', 'is empty'], ['notempty', 'is not empty']];
const ACTS: [string, string][] = [['tag', 'Add tag'], ['status', 'Set status'], ['task', 'Create task'], ['deal', 'Open a deal'], ['draft', 'Write an email draft (needs your approval)'], ['webhook', 'Send to webhook']];

export function Automations({ s, set }: { s: any; set: (p: string, v: unknown) => void }) {
  const [meta, setMeta] = useState<any>(null);
  const [runs, setRuns] = useState<any>(null);
  useEffect(() => { call('auto:templates').then(setMeta); call('auto:runs').then(setRuns); }, []);
  const rules: any[] = s.automations ?? [];
  const put = (i: number, r: any) => set('automations', rules.map((x, j) => (j === i ? r : x)));
  if (!meta) return null;
  return (
    <section>
      <p className="muted" style={{ margin: 0 }}>When something happens, Quarrix checks your conditions and does the actions. Emails are only ever drafted here; sending still needs your approval.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}><span className="small muted">Start from:</span>{meta.templates.map((t: any) => <button key={t.id} className="chip" onClick={() => set('automations', [...rules, { ...structuredClone(t), id: rid() }])}><Zap size={12} /> {t.name}</button>)}
        <button className="chip" onClick={() => set('automations', [...rules, { id: rid(), name: 'New automation', on: false, trigger: 'lead_enriched', conditions: [], actions: [] }])}><Plus size={12} /> Blank</button></div>
      {rules.map((r, i) => (
        <div key={r.id} className="panel panel-pad feed">
          <div className="row" style={{ gap: 6 }}><input className="input" value={r.name} onChange={(e) => put(i, { ...r, name: e.target.value })} aria-label="Name" /><label className="switch"><input type="checkbox" checked={r.on} onChange={(e) => put(i, { ...r, on: e.target.checked })} /> On</label><button className="btn small ghost" aria-label="Delete automation" onClick={() => set('automations', rules.filter((_, j) => j !== i))}><Trash2 size={12} /></button></div>
          <label className="field"><span>When</span><select className="input" value={r.trigger} onChange={(e) => put(i, { ...r, trigger: e.target.value })}>{Object.entries(meta.triggers).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select></label>
          <b className="small">If all of these are true</b>
          {r.conditions.map((c: any, ci: number) => (
            <div key={ci} className="row" style={{ gap: 6 }}>
              <select className="input" value={c.field} onChange={(e) => put(i, { ...r, conditions: r.conditions.map((x: any, k: number) => (k === ci ? { ...x, field: e.target.value } : x)) })}>{meta.fields.map((f: string) => <option key={f}>{f}</option>)}</select>
              <select className="input" value={c.op} onChange={(e) => put(i, { ...r, conditions: r.conditions.map((x: any, k: number) => (k === ci ? { ...x, op: e.target.value } : x)) })}>{OPS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!['empty', 'notempty'].includes(c.op) && <input className="input" value={c.value ?? ''} onChange={(e) => put(i, { ...r, conditions: r.conditions.map((x: any, k: number) => (k === ci ? { ...x, value: e.target.value } : x)) })} />}
              <button className="btn small ghost" aria-label="Remove condition" onClick={() => put(i, { ...r, conditions: r.conditions.filter((_: any, k: number) => k !== ci) })}><Trash2 size={12} /></button>
            </div>
          ))}
          <button className="btn small ghost" onClick={() => put(i, { ...r, conditions: [...r.conditions, { field: 'grade', op: 'eq', value: 'A' }] })}><Plus size={12} /> Condition</button>
          <b className="small">Then</b>
          {r.actions.map((a: any, ai: number) => (
            <div key={ai} className="row" style={{ gap: 6 }}>
              <select className="input" value={a.type} onChange={(e) => put(i, { ...r, actions: r.actions.map((x: any, k: number) => (k === ai ? { ...x, type: e.target.value } : x)) })}>{ACTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {['tag', 'status', 'task', 'deal'].includes(a.type) && <input className="input" placeholder={a.type === 'status' ? 'contacted, interested…' : a.type === 'task' ? 'Task title' : a.type === 'deal' ? 'Deal title' : 'Tag'} value={a.value ?? ''} onChange={(e) => put(i, { ...r, actions: r.actions.map((x: any, k: number) => (k === ai ? { ...x, value: e.target.value } : x)) })} />}
              {a.type === 'task' && <input className="input" style={{ width: 80 }} type="number" min={0} value={a.days ?? 1} aria-label="Due in days" onChange={(e) => put(i, { ...r, actions: r.actions.map((x: any, k: number) => (k === ai ? { ...x, days: Number(e.target.value) } : x)) })} />}
              <button className="btn small ghost" aria-label="Remove action" onClick={() => put(i, { ...r, actions: r.actions.filter((_: any, k: number) => k !== ai) })}><Trash2 size={12} /></button>
            </div>
          ))}
          <button className="btn small ghost" onClick={() => put(i, { ...r, actions: [...r.actions, { type: 'tag', value: '' }] })}><Plus size={12} /> Action</button>
        </div>
      ))}
      {runs && (runs.rules.length > 0 || runs.hooks.length > 0) && <>
        <h2 style={{ marginTop: 10 }}>Recent runs</h2>
        <div className="timeline small">{[...runs.rules.map((r: any) => ({ at: r.at, t: `${r.rule} (${r.event})` })), ...runs.hooks.map((h: any) => ({ at: h.at, t: `Webhook ${h.event} → ${h.url.slice(0, 40)}: ${h.status || h.error}` }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map((x, k) => <div key={k}><span>{x.at.slice(0, 16).replace('T', ' ')}</span><span>{x.t}</span></div>)}</div>
      </>}
    </section>
  );
}
