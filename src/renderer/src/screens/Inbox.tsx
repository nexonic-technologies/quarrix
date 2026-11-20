// Outreach → Replies (QF-062, QF-063), Needs attention (QF-073), Send plan (QF-065) and the metrics strip (QF-072).
import { Fragment, useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { EmptyArt } from '../Art';
import { Check } from 'lucide-react';

export const INTENTS: Record<string, string> = { interested: 'Interested', meeting: 'Wants a call', question: 'Has a question', not_now: 'Not now', objection: 'Not interested', opt_out: 'Opted out', out_of_office: 'Out of office', wrong_person: 'Wrong person', unclear: 'Needs review' };

export function Metrics({ tick }: { tick: number }) {
  const [m, setM] = useState<any>(null);
  useEffect(() => { call('outreach:metrics').then(setM); }, [tick]);
  if (!m) return null;
  const pct = (n: number) => (m.sent ? `${Math.round((n / m.sent) * 1000) / 10}%` : '–');
  return (
    <>
    <div className="metrics-strip">
      {[['Sent', m.sent, ''], ['Bounced', m.bounced, pct(m.bounced)], ['Replied', m.replies, pct(m.replies)], ['Positive', m.positive, pct(m.positive)], ['Opted out', m.optouts, pct(m.optouts)]].map(([k, n, p]) => (
        <div key={k as string}><b>{(n as number)?.toLocaleString?.() ?? n}</b><span>{k}{p ? ` · ${p}` : ''}</span></div>
      ))}
    </div>
    {(m.mailboxes?.length > 1 || m.ab?.p !== undefined && (m.variants?.A?.sent || m.variants?.B?.sent)) && (
      <div className="row small" style={{ gap: 12, flexWrap: 'wrap', margin: '-4px 0 10px' }}>
        {m.mailboxes?.length > 1 && m.mailboxes.map((b: any) => <span key={b.id} className="tag" title={b.from}>{b.label}: {b.sentToday}/{b.cap} today, {b.replies} replied{b.approved ? '' : ' (not approved)'}</span>)}
        {(m.variants?.A?.sent > 0 || m.variants?.B?.sent > 0) && <span className="tag" title={`A: ${m.variants.A.subject}\nB: ${m.variants.B.subject}`}>Subject test: A {Math.round(m.ab.ra * 100)}% vs B {Math.round(m.ab.rb * 100)}% replies · {m.ab.note}</span>}
      </div>
    )}
    </>
  );
}

export function Replies({ tick, openLead }: { tick: number; openLead: (id: number) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const load = () => call<any[]>('replies:list', all).then((x) => setRows(x ?? []));
  useEffect(() => { void load(); }, [tick, all]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <div className="panel empty"><EmptyArt /><h3>No replies to handle</h3>Turn on "Watch my inbox" in Settings → Email. Replies are sorted by what they ask for.<div><label className="switch"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show handled replies</label></div></div>;
  return (
    <div className="panel table-wrap">
      <div className="row" style={{ padding: '8px 12px' }}><label className="switch"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show handled replies</label></div>
      <table className="leads"><thead><tr><th>From</th><th>Mailbox</th><th>Subject</th><th>What they want</th><th>Received</th><th /></tr></thead><tbody>
        {rows.map((r) => (
          <Fragment key={r.id}>
            <tr className={r.review ? 'sel' : ''}>
              <td className="name" onClick={() => r.lead_id && openLead(r.lead_id)}><span className="t">{r.lead_name ?? r.from_addr}</span><span className="sub">{r.from_addr}</span></td>
              <td className="small muted">{r.mailbox ?? 'main'}</td>
              <td className="clip"><button className="link" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>{r.subject || '(no subject)'}</button></td>
              <td>
                <select className="select" value={r.intent} aria-label="What they want" onChange={async (e) => { await call('replies:update', r.id, { intent: e.target.value }); void load(); }}>
                  {Object.entries(INTENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className="muted small" title="Why Quarrix chose this"> {r.reason}</span>
              </td>
              <td className="muted small">{new Date(r.at).toLocaleString()}</td>
              <td>{!r.handled && <button className="btn small" onClick={async () => { await call('replies:update', r.id, { handled: true }); toast.push('Marked as handled'); void load(); }}><Check size={13} /> Done</button>}</td>
            </tr>
            {open === r.id && <tr><td colSpan={6}><pre className="reply-body">{r.body}</pre></td></tr>}
          </Fragment>
        ))}
      </tbody></table>
    </div>
  );
}

export function Attention({ tick, openLead }: { tick: number; openLead: (id: number) => void }) {
  const [a, setA] = useState<any>(null);
  useEffect(() => { call('outreach:attention').then(setA); }, [tick]);
  if (!a) return null;
  const total = a.failed.length + a.blocked.length + a.review.length + a.optouts.length;
  if (!total) return <div className="panel empty"><EmptyArt /><h3>All clear</h3>Failed sends, blocked emails, replies to review and new opt-outs show up here.</div>;
  const Block = ({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => React.ReactNode }) => rows.length ? (
    <div className="panel panel-pad"><div className="panel-title"><h2>{title}</h2><span className="pill">{rows.length}</span></div><div className="timeline small">{rows.map(render)}</div></div>
  ) : null;
  return (
    <div className="attention">
      <Block title="Replies to review" rows={a.review} render={(r) => <div key={`r${r.id}`}><button className="link" onClick={() => r.lead_id && openLead(r.lead_id)}>{r.name}</button><span>{INTENTS[r.intent] ?? r.intent} · {r.reason}</span></div>} />
      <Block title="Failed to send" rows={a.failed} render={(r) => <div key={`f${r.id}`}><button className="link" onClick={() => openLead(r.lead_id)}>{r.name}</button><span>{r.step ? `Follow-up ${r.step}` : 'Email'}: {r.error}</span></div>} />
      <Block title="Stopped by a safety rule (last 14 days)" rows={a.blocked} render={(r) => <div key={`b${r.id}`}><button className="link" onClick={() => openLead(r.lead_id)}>{r.name}</button><span>{r.error}</span></div>} />
      <Block title="New opt-outs and bounces (last 14 days)" rows={a.optouts} render={(r) => <div key={r.value}><span>{r.value}</span><span>{r.reason}</span></div>} />
    </div>
  );
}

export function SendPlan({ tick }: { tick: number }) {
  const [p, setP] = useState<any>(null);
  const [days, setDays] = useState(3);
  useEffect(() => { call('mail:dryrun', days).then(setP); }, [tick, days]);
  if (!p) return null;
  return (
    <div className="panel panel-pad">
      <div className="panel-title"><h2>What will send</h2>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days ahead">{[1, 3, 7, 14].map((d) => <option key={d} value={d}>Next {d} day{d > 1 ? 's' : ''}</option>)}</select></div>
      <p className="muted small" style={{ marginTop: 0 }}>A dry run: nothing is sent or changed. Times are in your clock; each email goes in the recipient's working hours. Daily limit {p.cap}, {p.sentToday} sent today.{p.waiting ? ` ${p.waiting} follow-ups wait for the email before them.` : ''}</p>
      {!p.authorized && <div className="note warn">Sending is not approved yet (Settings → Email), so none of these will go out.</div>}
      {p.paused && <div className="note warn">Sending is paused: {p.paused}</div>}
      {p.plan.length === 0 ? <div className="muted">Nothing scheduled.</div> : (
        <table className="leads"><thead><tr><th>When</th><th>To</th><th>Step</th><th>Note</th></tr></thead><tbody>
          {p.plan.map((x: any) => <tr key={x.id}><td>{x.at ? new Date(x.at).toLocaleString() : <span className="muted">—</span>}</td><td><span className="t">{x.lead}</span><span className="sub">{x.email}</span></td><td>{x.step ? `Follow-up ${x.step}` : 'First email'}</td><td className="muted small">{x.note}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
}
