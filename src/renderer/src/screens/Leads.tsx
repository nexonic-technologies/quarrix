import { useCallback, useEffect, useState } from 'react';
import { Mail, Phone, Globe, Star, X } from 'lucide-react';
import { call, json, type Lead, type Message } from '../api';
import { toast, type Screen } from '../App';

export const STATUS_LABEL: Record<string, string> = { new: 'New', contacted: 'Contacted', replied: 'Replied', interested: 'Interested', won: 'Won', lost: 'Lost', do_not_contact: 'Do not contact' };
const PAGE = 100;

export function Leads({ tick, go }: { tick: number; go: (s: Screen) => void }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [has, setHas] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const [facets, setFacets] = useState<{ countries: string[]; categories: string[] }>({ countries: [], categories: [] });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [searchId, setSearchId] = useState<number | undefined>(() => Number(sessionStorage.getItem('quarrix.search')) || undefined);

  const filter = { q, status, country, category, sort, searchId, hasEmail: has === 'email', hasPhone: has === 'phone', hasWebsite: has === 'website' };
  const load = useCallback(async () => {
    const r = await call<{ total: number; rows: Lead[] }>('leads:query', { ...filter, limit: PAGE, offset: page * PAGE });
    setRows(r.rows);
    setTotal(r.total);
  }, [q, status, country, category, has, sort, page, searchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { call('facets').then(setFacets); }, [tick]);
  useEffect(() => { sessionStorage.removeItem('quarrix.search'); }, []);

  const ids = [...sel];
  const bulk = async (what: string) => {
    if (what === 'draft') {
      toast.push(`Writing ${ids.length} drafts…`);
      const r = await call<{ made: number; errors: string[] }>('draft:create', ids);
      toast.push(`${r.made} drafts ready in Outreach${r.errors.length ? `. ${r.errors.length} skipped: ${r.errors[0]}` : ''}`, r.errors.length > 0 && !r.made);
      if (r.made) go('outreach');
    }
    if (what === 'enrich') { await call('leads:enrich', ids); toast.push('Checking websites for emails and social links'); }
    if (what === 'delete') { if (!confirm(`Delete ${ids.length} leads? This cannot be undone.`)) return; await call('leads:delete', ids); toast.push('Deleted'); }
    if (what.startsWith('status:')) { for (const id of ids) await call('leads:update', id, { status: what.slice(7) }); toast.push('Status changed'); }
    if (what.startsWith('export:')) { const n = await call('file:export', { ids }, what.slice(7)); if (n) toast.push(`Exported ${n} leads`); }
    setSel(new Set());
    void load();
  };

  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>Leads</h1><p>{total.toLocaleString()} businesses{searchId ? ' from one search' : ''}</p></div>
        {searchId && <button className="btn ghost" onClick={() => setSearchId(undefined)}><X size={15} /> Show all leads</button>}
        <button className="btn" onClick={async () => { const n = await call('file:export', filter, 'xlsx'); if (n) toast.push(`Exported ${n} leads`); }}>Export these</button>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search name, city, email, phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }} aria-label="Category">
          <option value="">Any category</option>{facets.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }} aria-label="Country">
          <option value="">Any country</option>{facets.countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={has} onChange={(e) => { setHas(e.target.value); setPage(0); }} aria-label="Contact details">
          <option value="">Any contact details</option><option value="email">Has email</option><option value="phone">Has phone</option><option value="website">Has website</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option><option value="name">Name</option><option value="score">Website needs most help</option><option value="rating">Best rated</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="panel empty"><h3>No leads here yet</h3>Run a search on the Find screen, or import a spreadsheet.<div className="row" style={{ justifyContent: 'center', marginTop: 14 }}><button className="btn primary" onClick={() => go('find')}>Find businesses</button><button className="btn" onClick={() => go('files')}>Import a file</button></div></div>
      ) : (
        <div className="panel table-wrap">
          <table className="leads">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSel(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th>Business</th><th>Location</th><th>Contact</th><th>Rating</th><th title="How much their website needs help, out of 100">Site score</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className={sel.has(l.id) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${l.name}`} checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} /></td>
                  <td className="name" onClick={() => setOpen(l.id)}>{l.name}<span className="sub">{l.category}{l.domain ? `, ${l.domain}` : ''}</span></td>
                  <td>{[l.city, l.region].filter(Boolean).join(', ')}<span className="sub">{l.country}</span></td>
                  <td><div className="contact-icons">
                    <Mail size={15} className={l.email ? 'has' : ''} aria-label={l.email ? 'Has email' : 'No email'} />
                    <Phone size={15} className={l.phone ? 'has' : ''} aria-label={l.phone ? 'Has phone' : 'No phone'} />
                    <Globe size={15} className={l.website ? 'has' : ''} aria-label={l.website ? 'Has website' : 'No website'} />
                  </div></td>
                  <td>{l.rating ? <span className="row" style={{ gap: 4 }}><Star size={13} fill="currentColor" color="var(--brass)" />{l.rating}<span className="muted">({l.reviews ?? 0})</span></span> : <span className="muted">none</span>}</td>
                  <td>{l.score != null ? <span className={`score ${l.score >= 40 ? 'hot' : ''}`}>{l.score}</span> : <span className="muted">{l.website ? (l.enriched_at ? 'n/a' : 'checking') : 'no site'}</span>}</td>
                  <td><span className={`status ${l.status}`}>{STATUS_LABEL[l.status] ?? l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button className="btn small" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      {sel.size > 0 && (
        <div className="bulk" role="toolbar" aria-label="Selected leads">
          <span>{sel.size} selected</span>
          <button className="btn small" onClick={() => bulk('draft')}>Write emails</button>
          <button className="btn small" onClick={() => bulk('enrich')}>Check websites</button>
          <button className="btn small" onClick={() => bulk('export:xlsx')}>Export</button>
          <select className="btn small" value="" onChange={(e) => e.target.value && bulk('status:' + e.target.value)} aria-label="Set status">
            <option value="">Set status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn small" onClick={() => bulk('delete')}>Delete</button>
        </div>
      )}
      {open && <LeadDrawer id={open} onClose={() => setOpen(null)} onChange={load} go={go} />}
    </div>
  );
}

function LeadDrawer({ id, onClose, onChange, go }: { id: number; onClose: () => void; onChange: () => void; go: (s: Screen) => void }) {
  const [d, setD] = useState<{ lead: Lead; messages: Message[]; events: any[] } | null>(null);
  const [notes, setNotes] = useState('');
  const reload = () => call('leads:get', id).then((x) => { setD(x); setNotes(x.lead.notes); });
  useEffect(() => { void reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  if (!d) return null;
  const l = d.lead;
  const audit = json<any>(l.audit, {});
  const socials = json<Record<string, string>>(l.socials, {});
  const emails = json<string[]>(l.emails, []);
  const wa = d.messages.find((m) => m.channel === 'whatsapp');
  const setStatus = async (status: string) => { await call('leads:update', id, { status }); await reload(); onChange(); };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={l.name}>
        <header>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{l.name}</h2><button className="btn ghost" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="row">
            <span className="muted">{l.category}</span>
            <select className="select" style={{ width: 'auto', marginLeft: 'auto' }} value={l.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </header>
        <div className="body">
          <dl className="kv">
            <dt>Email</dt><dd>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : <span className="muted">{l.enriched_at ? 'none found' : 'not checked yet'}</span>}{emails.length > 1 && <div className="muted">Also: {emails.filter((e) => e !== l.email).join(', ')}</div>}</dd>
            <dt>Phone</dt><dd>{l.phone || <span className="muted">none</span>}</dd>
            <dt>Website</dt><dd>{l.website ? <a href={l.website} target="_blank" rel="noreferrer">{l.domain || l.website}</a> : <span className="muted">none</span>}</dd>
            <dt>Address</dt><dd>{[l.address, l.city, l.region, l.postcode, l.country].filter(Boolean).join(', ') || <span className="muted">unknown</span>}</dd>
            {l.rating ? <><dt>Rating</dt><dd>{l.rating} from {l.reviews ?? 0} reviews</dd></> : null}
            <dt>Found with</dt><dd>{{ gmaps: 'Google Maps', osm: 'OpenStreetMap', places: 'Google Places API', import: 'Import', manual: 'Added by you' }[l.source] ?? l.source}</dd>
          </dl>
          {Object.keys(socials).length > 0 && <div className="socials">{Object.entries(socials).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noreferrer">{k[0].toUpperCase() + k.slice(1)}</a>)}</div>}
          {(audit.findings?.length > 0 || audit.error) && (
            <div className="panel panel-pad">
              <h2>Website check{l.score != null ? `: ${l.score} out of 100 needs help` : ''}</h2>
              {audit.error ? <p className="muted">{audit.error}</p> : <ul className="findings">{audit.findings.map((f: string) => <li key={f}>{f}</li>)}</ul>}
            </div>
          )}
          <div className="row">
            <button className="btn primary" disabled={!l.email} onClick={async () => { const r = await call('draft:create', [id]); toast.push(r.made ? 'Draft ready in Outreach' : r.errors[0], !r.made); if (r.made) go('outreach'); }}>Write an email</button>
            <button className="btn" disabled={!l.phone} onClick={async () => { try { await call('wa:open', id, wa?.body ?? ''); } catch (e: any) { toast.push(e.message, true); } }}>Open in WhatsApp</button>
            <button className="btn" disabled={!l.website} onClick={async () => { await call('leads:enrich', [id]); toast.push('Checking the website'); setTimeout(reload, 4000); }}>Check website again</button>
          </div>
          <label className="field"><span>Notes</span><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== l.notes && call('leads:update', id, { notes })} /></label>
          {d.messages.filter((m) => m.channel === 'email').length > 0 && (
            <div><h2 style={{ font: '600 16px var(--display)', margin: '0 0 8px' }}>Emails</h2>
              <div className="timeline">{d.messages.filter((m) => m.channel === 'email').map((m) => <div key={m.id}><span>{m.step === 0 ? 'First email' : `Follow-up ${m.step}`}</span><span>{m.status}{m.sent_at ? `, ${new Date(m.sent_at).toLocaleString()}` : ''}{m.error ? `: ${m.error}` : ''}</span></div>)}</div>
            </div>
          )}
          {d.events.length > 0 && (
            <div><h2 style={{ font: '600 16px var(--display)', margin: '0 0 8px' }}>History</h2>
              <div className="timeline">{d.events.map((e) => <div key={e.id}><span>{new Date(e.at).toLocaleDateString()}</span><span>{e.detail || e.type}</span></div>)}</div>
            </div>
          )}
          <button className="btn danger" style={{ justifySelf: 'start' }} onClick={() => setStatus('do_not_contact')}>Never contact this business</button>
        </div>
      </aside>
    </>
  );
}
