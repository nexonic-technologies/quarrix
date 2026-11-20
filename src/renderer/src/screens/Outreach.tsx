import { useEffect, useState } from 'react';
import { call, type Message } from '../api';
import { toast, type Screen } from '../App';
import { Avatar, EmptyArt } from '../Art';
import { Check, RefreshCw, Trash2, Save, MessageCircle } from 'lucide-react';

type Group = { lead_id: number; name: string; email: string; place: string; email0?: Message; followups: Message[]; wa?: Message };

export function Outreach({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [tab, setTab] = useState<'draft' | 'scheduled' | 'sent' | 'failed'>('draft');
  const [msgs, setMsgs] = useState<Message[]>([]);
  useEffect(() => { call<Message[]>('messages:list', tab).then(setMsgs); }, [tab, tick]);

  const groups: Group[] = [];
  for (const m of msgs) {
    let g = groups.find((x) => x.lead_id === m.lead_id);
    if (!g) groups.push((g = { lead_id: m.lead_id, name: m.lead_name ?? '', email: m.lead_email ?? '', place: [m.lead_city, m.lead_country].filter(Boolean).join(', '), followups: [] }));
    if (m.channel === 'whatsapp') g.wa = m;
    else if (m.step === 0) g.email0 = m;
    else g.followups.push(m);
  }

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
      <div className="tabs seg" role="tablist" style={{ margin: 0 }}>
        {([['draft', 'To approve'], ['scheduled', 'Waiting to send'], ['sent', 'Sent'], ['failed', 'Failed']] as const).map(([k, v]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>
      {tab === 'draft' && groups.length > 1 && <button className="btn primary" onClick={async () => { const n = await call('messages:approveAll'); toast.push(`Approved ${n}. They send within your daily limit.`); setMsgs(await call('messages:list', 'draft')); }}><Check size={15} /> Approve all {groups.length}</button>}
      </div>
      {tab !== 'draft' ? (
        msgs.length === 0 ? <div className="panel empty"><EmptyArt /><h3>Nothing here</h3>{tab === 'scheduled' ? 'Approved emails wait here until the recipient\'s working hours.' : 'Sent emails will be listed here.'}</div> : (
          <div className="panel table-wrap"><table className="leads"><thead><tr><th>Business</th><th>Email</th><th>Subject</th><th>{tab === 'sent' ? 'Sent' : tab === 'failed' ? 'Problem' : 'Due'}</th><th /></tr></thead>
            <tbody>{msgs.filter((m) => m.channel === 'email').map((m) => (
              <tr key={m.id}><td className="name"><span className="who"><Avatar name={m.lead_name ?? ''} size={32} /><span>{m.lead_name}<span className="sub">{m.step === 0 ? 'First email' : `Follow-up ${m.step}`}</span></span></span></td><td>{m.lead_email}</td><td>{m.subject}</td>
                <td>{tab === 'sent' ? new Date(m.sent_at!).toLocaleString() : tab === 'failed' ? m.error : m.due_at ? new Date(m.due_at).toLocaleString() : 'after the email before it'}</td>
                <td>{tab === 'scheduled' && <button className="btn small" onClick={async () => { await call('messages:cancel', m.lead_id); toast.push('Stopped'); setMsgs(await call('messages:list', tab)); }}>Stop</button>}</td></tr>
            ))}</tbody></table></div>
        )
      ) : groups.length === 0 ? (
        <div className="panel empty"><EmptyArt /><h3>No drafts to approve</h3>Select leads on the Leads screen and choose Write emails.<div className="row" style={{ justifyContent: 'center', marginTop: 14 }}><button className="btn primary" onClick={() => go('leads')}>Go to leads</button></div></div>
      ) : groups.map((g) => <DraftCard key={g.lead_id} g={g} onDone={async () => setMsgs(await call('messages:list', 'draft'))} />)}
    </div>
  );
}

function DraftCard({ g, onDone }: { g: Group; onDone: () => void }) {
  const [subject, setSubject] = useState(g.email0?.subject ?? '');
  const [body, setBody] = useState(g.email0?.body ?? '');
  const [fu, setFu] = useState(g.followups.map((m) => m.body));
  const save = async () => {
    if (g.email0) await call('messages:update', g.email0.id, { subject, body });
    for (const [i, m] of g.followups.entries()) await call('messages:update', m.id, { body: fu[i], subject });
  };
  return (
    <div className="panel draft">
      <div className="draft-who">
        <div className="draft-banner" />
        <Avatar name={g.name} size={56} />
        <h3>{g.name}</h3>
        <div className="muted">{g.email || 'no email'}</div>
        <div className="muted">{g.place}</div>
        {g.wa && <div className="wa-bubble"><b><MessageCircle size={13} /> WhatsApp version</b>{g.wa.body}</div>}
      </div>
      <div className="msg">
        <label className="field"><span>Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="field"><span>Email</span><textarea className="input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        {fu.map((b, i) => (
          <label key={i} className="field"><span>Follow-up {i + 1}</span><textarea className="input" rows={4} value={b} onChange={(e) => setFu((f) => f.map((x, j) => (j === i ? e.target.value : x)))} /></label>
        ))}
        <div className="row">
          <button className="btn primary" disabled={!g.email} onClick={async () => { await save(); await call('messages:approve', g.lead_id); toast.push(`Approved. It sends in ${g.name}'s working hours.`); onDone(); }}><Check size={16} /> Approve and send</button>
          <button className="btn" onClick={async () => { await save(); toast.push('Saved'); }}><Save size={15} /> Save changes</button>
          <button className="btn" onClick={async () => { const r = await call('draft:create', [g.lead_id]); toast.push(r.made ? 'Rewritten' : r.errors[0], !r.made); onDone(); }}><RefreshCw size={15} /> New version</button>
          <button className="btn ghost danger" onClick={async () => { for (const m of [g.email0, ...g.followups, g.wa]) if (m) await call('messages:delete', m.id); onDone(); }}><Trash2 size={15} /> Discard</button>
        </div>
      </div>
    </div>
  );
}
