// The lead drawer's evidence card: grade and reasons, where each fact came from, email status, contacts,
// other branches, conflicts, technology and change history (QF-018/019/024/025/027/029/032/040/041/045).
import { useEffect, useState } from 'react';
import { call, json, type Lead } from '../api';
import { toast } from '../App';
import { ExternalLink, ShieldCheck, Plus, Trash2, UserRound, MailCheck, Search as SearchIcon } from 'lucide-react';

export const EMAIL_TEXT: Record<string, string> = {
  '': 'Not checked', 'bad-syntax': 'Not a valid address', 'no-mx': 'Domain does not accept mail', 'mx-ok': 'Domain accepts mail (mailbox not checked)', ok: 'Domain accepts mail (mailbox not checked)',
  verified: 'Mailbox confirmed by a provider', invalid: 'Mailbox rejected by a provider', risky: 'Accept-all or risky', unknown: 'Provider could not tell', bounced: 'Bounced',
};
const ago = (iso?: string | null) => { if (!iso) return ''; const d = Math.round((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const open = (url: string) => void call('open:external', url).catch(() => undefined);

type Intel = { contacts: any[]; branches: any[]; snapshots: any[]; listing: string; emailCheck: { status: string; provider: string; detail: string; at: string } | null };

export function EvidenceCard({ lead: l, onChange }: { lead: Lead; onChange: () => void }) {
  const [d, setD] = useState<Intel | null>(null);
  const [add, setAdd] = useState({ name: '', role: '', email: '', phone: '' });
  const [busy, setBusy] = useState('');
  const [trend, setTrend] = useState<any>(null);
  const [calc, setCalc] = useState<Record<string, unknown>>({});
  const load = () => { call<Intel>('leads:intel', l.id).then(setD).catch(() => setD(null)); call('leads:trend', l.id).then(setTrend).catch(() => setTrend(null)); call<Record<string, unknown>>('fields:computed', 'lead', l.id).then((x) => setCalc(x ?? {})).catch(() => undefined); };
  useEffect(() => { void load(); }, [l.id, l.enriched_at, l.email_status]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = json<any>(l.reasons ?? '{}', {});
  const p = json<any>(l.provenance ?? '{}', {});
  const audit = json<any>(l.audit, {});
  const det = json<any>(l.details ?? '{}', {});
  const links = det.links ?? {};
  const site = det.site ?? {};
  const hours = det.hours ?? site.hours, amen: string[] = [...new Set([...(det.amenities ?? []), ...(site.amenities ?? [])])] as string[], pays: string[] = [...new Set([...(det.payments ?? []), ...(site.payments ?? [])])] as string[];
  const STATUS: Record<string, string> = { operational: 'Open for business', closed_temporarily: 'Temporarily closed', closed_permanently: 'Permanently closed' };
  const tech: { name: string; kind: string; marker: string }[] = audit.facts?.tech ?? [];
  const conflicts = Object.entries<any[]>(p.conflicts ?? {});
  const run = async (what: string, fn: () => Promise<unknown>) => { setBusy(what); try { await fn(); onChange(); await load(); } catch (e: any) { toast.push(e.message, true); } setBusy(''); };

  return (
    <div className="panel panel-pad evidence">
      {site.image && /^https:/.test(site.image) && <img className="biz-img" src={site.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
      <div className="panel-title"><h2><ShieldCheck size={16} /> Evidence</h2>{l.grade && <span className={`grade g${l.grade}`}>{l.grade}</span>}</div>
      {r.summary && <p className="small" style={{ margin: '0 0 6px' }}><b>{r.summary}.</b> Match {l.relevance ?? '?'}/100 · evidence {l.evidence ?? '?'}/100</p>}
      {(r.why?.length > 0 || r.against?.length > 0) && <ul className="reasons">{(r.why ?? []).map((w: string) => <li key={w} className="plus">{w}</li>)}{(r.against ?? []).map((w: string) => <li key={w} className="minus">{w}</li>)}</ul>}

      <dl className="src-info">
        <dt>Listing</dt><dd>{p.listing?.source ?? l.source}{p.listing?.at ? `, ${ago(p.listing.at)}` : ''}{d?.listing && <button className="link" onClick={() => open(d.listing)}> open <ExternalLink size={11} /></button>}</dd>
        {l.website && <><dt>Website</dt><dd>{p.website?.evidence ? `found by web search (${p.website.evidence})` : 'from the listing'}{p.checked?.at ? `, checked ${ago(p.checked.at)}` : ''}</dd></>}
        {l.email && <><dt>Email</dt><dd>
          <span className={`mail ${l.email_status}`}>{l.email}</span> · {EMAIL_TEXT[l.email_status ?? ''] ?? l.email_status}{d?.emailCheck ? ` (${d.emailCheck.provider}${d.emailCheck.detail ? `: ${d.emailCheck.detail}` : ''}, ${ago(d.emailCheck.at)})` : ''}
          {p.emails?.[l.email] && <div className="muted small">Seen on {/^https?:/.test(p.emails[l.email]) ? <button className="link" onClick={() => open(p.emails[l.email].split(' ')[0])}>{p.emails[l.email].replace(/^https?:\/\//, '').slice(0, 60)}</button> : p.emails[l.email]}</div>}
        </dd></>}
        {Object.keys(links).length > 0 && <><dt>Links</dt><dd>{Object.entries<string>(links).map(([k, v]) => <button key={k} className="link" onClick={() => open(v)}>{k} <ExternalLink size={11} /> </button>)}</dd></>}
        {det.status && <><dt>Status</dt><dd style={det.status !== 'operational' ? { color: '#b91c1c' } : {}}>{STATUS[det.status] ?? det.status} <span className="muted small">({det.source})</span></dd></>}
        {hours && <><dt>Hours</dt><dd className="small">{hours} <span className="muted">({det.hours ? det.source : site.source})</span></dd></>}
        {(det.price || site.price) && <><dt>Price</dt><dd>{det.price || site.price}</dd></>}
        {amen.length > 0 && <><dt>Amenities</dt><dd>{amen.map((a) => <span key={a} className="tag">{a}</span>)}</dd></>}
        {pays.length > 0 && <><dt>Payments</dt><dd className="small">{pays.join(', ')}</dd></>}
        {(site.founded || site.employees) && <><dt>Company</dt><dd className="small">{site.founded ? `Founded ${site.founded}` : ''}{site.founded && site.employees ? ' · ' : ''}{site.employees ? `${site.employees} employees` : ''} <span className="muted">(their website)</span></dd></>}
        {trend && <><dt>Reviews</dt><dd className="small">{trend.perMonth >= 0 ? '+' : ''}{trend.perMonth} reviews a month{trend.ratingChange != null && trend.ratingChange !== 0 ? `, rating ${trend.ratingChange > 0 ? '+' : ''}${trend.ratingChange}` : ''} <span className="muted">({trend.from} to {trend.to}, {trend.points} checks)</span></dd></>}
        {Object.keys(calc).length > 0 && <><dt>Computed</dt><dd className="small">{Object.entries(calc).map(([k, v]) => <div key={k}>{k}: <b>{String(v ?? '—')}</b></div>)}</dd></>}
        {tech.length > 0 && <><dt>Built with</dt><dd>{tech.map((t) => <span key={t.name} className="tag" title={`${t.kind}. Found: ${t.marker}`}>{t.name}</span>)}</dd></>}
      </dl>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        {l.email && <button className="btn small" disabled={!!busy} onClick={() => run('verify', () => call('email:verify', [l.id]))}><MailCheck size={13} /> {busy === 'verify' ? 'Checking…' : 'Check email'}</button>}
        {l.domain && <button className="btn small ghost" disabled={!!busy} onClick={() => run('find', async () => toast.push(`${await call<number>('email:find', l.id)} contacts from Hunter`))} title="Needs a Hunter key (Settings → Sources)"><SearchIcon size={13} /> Find more emails</button>}
      </div>

      {conflicts.length > 0 && <div className="note warn" style={{ marginTop: 8 }}><b>Sources disagree.</b> {conflicts.map(([k, v]) => <div key={k}>{k}: {v.map((x) => `${x.value} (${x.source})`).join(' vs ')}</div>)}</div>}

      <h3 className="sub-h"><UserRound size={14} /> Contacts</h3>
      <div className="contacts">
        {(d?.contacts ?? []).map((c) => (
          <div key={c.id} className="contact-row">
            <span><b>{c.name || c.email}</b>{c.role ? ` · ${c.role}` : ''}{c.name && c.email ? ` · ${c.email}` : ''}{c.phone ? ` · ${c.phone}` : ''}</span>
            <span className="muted small">{c.source}{c.source_url ? <button className="link" onClick={() => open(c.source_url)}> source</button> : ''}{c.confirmed_at ? `, ${ago(c.confirmed_at)}` : ''}</span>
            <button className="btn small ghost" aria-label={`Remove ${c.name || c.email}`} onClick={() => run('del', () => call('contacts:delete', c.id))}><Trash2 size={12} /></button>
          </div>
        ))}
        {!d?.contacts.length && <span className="muted small">No named contacts yet.</span>}
        <div className="row contact-add">
          {(['name', 'role', 'email', 'phone'] as const).map((k) => <input key={k} className="input" placeholder={k[0].toUpperCase() + k.slice(1)} value={add[k]} onChange={(e) => setAdd({ ...add, [k]: e.target.value })} />)}
          <button className="btn small" onClick={() => run('add', async () => { await call('contacts:add', { lead_id: l.id, ...add }); setAdd({ name: '', role: '', email: '', phone: '' }); })} disabled={!add.name && !add.email} aria-label="Add contact"><Plus size={13} /></button>
        </div>
      </div>

      {(d?.branches.length ?? 0) > 0 && <>
        <h3 className="sub-h">Other locations of this company</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{d!.branches.map((b) => <li key={b.id}>{b.name} · {[b.address, b.city].filter(Boolean).join(', ')}{b.phone ? ` · ${b.phone}` : ''}</li>)}</ul>
      </>}

      {(d?.snapshots.length ?? 0) > 1 && <>
        <h3 className="sub-h">History</h3>
        <div className="timeline small">{d!.snapshots.slice(0, 8).map((s) => { const x = json<any>(s.data, {}); return <div key={s.id}><span>{s.at.slice(0, 10)}</span><span>{x.rating != null ? `★ ${x.rating} (${x.reviews ?? 0})` : 'no rating'}{x.email ? ` · ${x.email}` : ''}</span></div>; })}</div>
      </>}
    </div>
  );
}
