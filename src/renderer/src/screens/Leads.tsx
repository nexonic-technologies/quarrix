import { LeadMap } from './FindTools';
import { EvidenceCard, EMAIL_TEXT } from './Evidence';
import { leadQuality,leadReviewReason } from '../../../shared/verified';
import { ClientPicker, Companies, Duplicates, LeadCrmCard, SavedViews } from './CrmParts';
import { ExportWizard } from './ExportWizard';
import { MarketIntelligence } from './MarketIntelligence';
import { ProposalStudio } from './ProposalStudio';
import { PublicOpportunities } from './PublicOpportunities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Star, X, Download, Search as SearchIcon, PenLine, MessageCircle, RefreshCw, Ban, MapPin, FileBarChart, Send, ExternalLink } from 'lucide-react';
import { Avatar, EmptyArt } from '../Art';
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
  const [sort, setSort] = useState('fit');
  const [page, setPage] = useState(0);
  const [facets, setFacets] = useState<{ countries: string[]; categories: string[] }>({ countries: [], categories: [] });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [view, setView] = useState<'list' | 'map' | 'companies'>('list');
  const [market, setMarket] = useState(false);
  const [publicOpen,setPublicOpen]=useState(false);
  const [marketTick, setMarketTick] = useState(0);
  const request = useRef(0);
  const [switching, setSwitching] = useState(false);
  const [grade, setGrade] = useState('');
  const [dupes, setDupes] = useState(false);
  const [dupeCount,setDupeCount]=useState<{count:number;limit:number}|null>(null);
  const [loadError,setLoadError]=useState(false);
  const [exporting, setExporting] = useState(false);
  const [role, setRole] = useState('');
  const [open, setOpen] = useState<number | null>(() => { const v = Number(sessionStorage.getItem('quarrix.openLead')) || null; sessionStorage.removeItem('quarrix.openLead'); return v; });
  const [searchId, setSearchId] = useState<number | undefined>(() => Number(sessionStorage.getItem('quarrix.search')) || undefined);

  const filter = { q, status, country, category, sort, searchId, hasEmail: has === 'email', hasPhone: has === 'phone', hasWebsite: has === 'website', shortlist: has === 'shortlist', stale: has === 'stale' ? 90 : undefined, emailStatus: has.startsWith('es:') ? has.slice(3) : undefined, grade: grade || undefined, role: role || undefined };
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoadError(false);try {
      const r = await call<{ total: number; rows: Lead[] }>('leads:query', { ...filter, limit: PAGE, offset: page * PAGE });
      if (sequence !== request.current) return;
      setRows(r.rows);
      setTotal(r.total);
      if (page > 0 && page * PAGE >= r.total) setPage(Math.max(0, Math.ceil(r.total / PAGE) - 1));
    } catch (e) { if (sequence === request.current) {setLoadError(true);toast.push(String(e), true);} }
  }, [q, status, country, category, has, sort, page, searchId, grade, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const timer=!switching?setTimeout(()=>void load(),160):undefined; return () => { clearTimeout(timer);request.current++; }; }, [load, tick, marketTick, switching]);
  useEffect(() => { let alive = true; if (!switching) call('facets').then(r => { if (alive) setFacets(r); }).catch(e => toast.push(String(e), true)); return () => { alive = false; }; }, [tick, marketTick, switching]);
  useEffect(() => { sessionStorage.removeItem('quarrix.search'); }, []);
  useEffect(()=>{let alive=true;setDupeCount(null);if(switching)return;const timer=setTimeout(()=>call<{count:number;limit:number}>('dupes:summary').then(r=>{if(alive)setDupeCount(r);}).catch(()=>{}),650);return()=>{alive=false;clearTimeout(timer);};},[tick,marketTick,switching,dupes]);

  const ids = [...sel];
  const bulk = async (what: string) => {
    if (what === 'draft') {
      toast.push(`Writing ${ids.length} drafts…`);
      const r = await call<{ made: number; errors: string[] }>('draft:create', ids);
      toast.push(`${r.made} drafts ready in Outreach${r.errors.length ? `. ${r.errors.length} skipped: ${r.errors[0]}` : ''}`, r.errors.length > 0 && !r.made);
      if (r.made) go('outreach');
    }
    if (what === 'proof') {
      toast.push(`Making ${ids.length} reports. This takes about 15 seconds each.`);
      let ok = 0;
      for (const id of ids) { try { await call('proof:make', id); ok++; } catch { /* skip */ } }
      toast.push(`${ok} proof reports ready`);
    }
    if (what === 'verify') {
      toast.push(`Checking ${ids.length} emails…`);
      const r = await call<{ checked: number; verified: number; invalid: number; errors: string[] }>('email:verify', ids);
      toast.push(`${r.checked} checked: ${r.verified} confirmed, ${r.invalid} not deliverable${r.errors.length ? `. ${r.errors[0]}` : ''}`, r.errors.length > 0 && !r.checked);
    }
    if (what.startsWith('sync:')) {
      try { const r = await call<{ sent: number; updated: number; skipped: number; errors: string[] }>(what, ids); toast.push(`${r.sent} sent${r.updated ? `, ${r.updated} updated` : ''}${r.skipped ? `, ${r.skipped} skipped (do not contact)` : ''}${r.errors.length ? `. ${r.errors[0]}` : ''}`, r.errors.length > 0 && !r.sent); }
      catch (e: any) { toast.push(e.message, true); }
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
        <div className="grow"><p><b className="big-n">{total.toLocaleString()}</b> businesses{searchId ? ' from one search' : ''}</p></div>
        {searchId && <button className="btn ghost" onClick={() => setSearchId(undefined)}><X size={15} /> Show all leads</button>}
        <button className="btn ghost" onClick={() => setDupes(true)}>Duplicates {dupeCount&&dupeCount.count>0&&<span className="score">{dupeCount.count}{dupeCount.count===dupeCount.limit?'+':''}</span>}</button>
        <button className={`btn ${market ? 'primary' : 'ghost'}`} aria-pressed={market} onClick={() => setMarket(!market)}>Market intelligence</button>
        <button className={`btn ${publicOpen?'primary':'ghost'}`} aria-pressed={publicOpen} onClick={()=>setPublicOpen(!publicOpen)}>Public opportunities</button>
        <button className="btn" onClick={() => setExporting(true)}><Download size={15} /> Export these</button>
      </div>
      {loadError&&<div className="note warn" role="alert"><span>Could not load leads.</span> <button className="btn small" onClick={()=>void load()}>Try again</button></div>}
      {rows.length>0&&<div className="quality-strip" data-quality-strip><span className="muted small">Current page quality</span>{(['review','check','recent','mailbox'] as const).map(k=>{const matches=rows.filter(l=>leadQuality(l)===k);return <button key={k} className={`quality-chip ${k}`} disabled={!matches.length} onClick={()=>setOpen(matches[0].id)}><b>{matches.length}</b> <span>{({review:'Review evidence',check:'Needs a fresh check',recent:'Recently checked',mailbox:'Mailbox recently confirmed'})[k]}</span></button>;})}</div>}
      <div className="toolbar">
        <label className="search-box"><SearchIcon size={16} /><input placeholder="Search name, city, email, phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }} aria-label="Category">
          <option value="">Any category</option>{facets.categories.map((c) => <option key={c} value={c} translate="no">{c}</option>)}
        </select>
        <select className="select" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }} aria-label="Country">
          <option value="">Any country</option>{facets.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={has} onChange={(e) => { setHas(e.target.value); setPage(0); }} aria-label="Contact details">
          <option value="">Any contact details</option><option value="shortlist">Shortlisted (good fit)</option><option value="email">Has email</option><option value="phone">Has phone</option><option value="stale">Not checked in 90 days</option><option value="es:verified">Email confirmed</option><option value="es:mx-ok">Email domain takes mail</option><option value="es:invalid">Email rejected</option><option value="website">Has website</option>
        </select>
        <select className="select" value={grade} onChange={(e) => { setGrade(e.target.value); setPage(0); }} aria-label="Grade">
          <option value="">Any grade</option><option value="A">A: strong match</option><option value="B">B: good match</option><option value="C">C: check first</option><option value="D">D: poor match</option>
        </select>
        <input className="select" style={{ width: 130 }} placeholder="Contact role" value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} aria-label="Contact role, for example owner" />
        <div className="seg" role="group" aria-label="View"><button className={`btn small ${view === 'list' ? 'primary' : 'ghost'}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button className={`btn small ${view === 'map' ? 'primary' : 'ghost'}`} aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button><button className={`btn small ${view === 'companies' ? 'primary' : 'ghost'}`} aria-pressed={view === 'companies'} onClick={() => setView('companies')}>Companies</button></div>
        <ClientPicker onStart={() => { request.current++; setSwitching(true); setSel(new Set()); setRows([]); setTotal(0); setOpen(null); setDupes(false); setExporting(false); setPublicOpen(false); setSearchId(undefined); setPage(0); }} onChange={() => { setMarketTick(n => n + 1); setSwitching(false); }} />
        <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Sort">
          <option value="fit">Best fit first</option><option value="newest">Newest first</option><option value="name">Name</option><option value="score">Website needs most help</option><option value="rating">Best rated</option>
        </select>
      </div>

      <SavedViews current={{ q, status, country, category, has, sort, grade, role }} apply={(f) => { setQ(f.q ?? ''); setStatus(f.status ?? ''); setCountry(f.country ?? ''); setCategory(f.category ?? ''); setHas(f.has ?? ''); setSort(f.sort ?? 'fit'); setGrade(f.grade ?? ''); setRole(f.role ?? ''); setPage(0); }} />
      {exporting && <ExportWizard filter={filter} total={total} onClose={() => setExporting(false)} />}
      {dupes && <Duplicates onClose={() => { setDupes(false); void load(); }} />}
      {market && <MarketIntelligence tick={tick + marketTick} countries={facets.countries} categories={facets.categories} />}
      {publicOpen && <PublicOpportunities key={marketTick} tick={marketTick} />}
      {rows.length === 0 ? (
        <div className="panel empty"><EmptyArt /><h3>No leads here yet</h3>Run a search on the Find screen, or import a spreadsheet.<div className="row" style={{ justifyContent: 'center', marginTop: 14 }}><button className="btn primary" onClick={() => go('find')}>Find businesses</button><button className="btn" onClick={() => go('files')}>Import a file</button></div></div>
      ) : view === 'companies' ? (
        <Companies onOpen={setOpen} />
      ) : view === 'map' ? (
        <LeadMap leads={rows} onOpen={setOpen} />
      ) : (
        <div className="panel table-wrap">
          <table className="leads">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSel(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th>Business</th><th>Contact person</th><th>Category</th><th>Location</th><th>Email</th><th>Website</th><th>Rating</th><th title="Match with your ideal customer (Settings → Ideal customer), backed by evidence">Grade</th><th title="How likely they need what you offer, out of 100">Fit</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className={sel.has(l.id) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${l.name}`} checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} /></td>
                  <td className="name" onClick={() => setOpen(l.id)}><button type="button" className="who result-name" onClick={e=>{e.stopPropagation();setOpen(l.id);}}><Avatar name={l.name} size={32} /><span><span className="t">{l.name}</span><span className="sub">{l.phone || 'no phone'}</span></span></button></td>
                  <td className="clip">{l.contact_name ? <><span className="t2">{l.contact_name}</span><span className="sub">{l.contact_role}</span></> : <span className="muted">{l.website && !l.enriched_at ? 'checking…' : 'not found'}</span>}</td>
                  <td className="clip">{l.category}</td>
                  <td className="clip" title={[l.city, l.region, l.country].filter(Boolean).join(', ')}>{[l.city || l.region, l.country].filter(Boolean).join(', ') || <span className="muted">unknown</span>}</td>
                  <td className="clip">{l.email ? <span className={`mail ${l.email_status}`} title={EMAIL_TEXT[l.email_status ?? ''] ?? ''}>{l.email}</span> : <span className="muted">{l.website && !l.enriched_at ? 'checking…' : 'none'}</span>}</td>
                  <td>{l.domain ? <span className="domain">{l.domain}</span> : <span className="muted">none</span>}</td>
                  <td>{l.rating ? <span className="rating"><Star size={12} fill="currentColor" />{l.rating}<span className="muted">({l.reviews ?? 0})</span></span> : <span className="muted">none</span>}</td>
                  <td>{l.grade ? <span className={`grade g${l.grade}`} title={`${json<any>(l.reasons, {}).summary ?? ''} · relevance ${l.relevance ?? '?'}, evidence ${l.evidence ?? '?'}`}>{l.grade}</span> : <span className="muted">–</span>}<span className="sub">{({closed:'Business closure reported',restricted:'Do not contact',mail:'Email needs review',conflict:'Sources disagree.',unchecked:'No current website check',stale:'Needs a fresh check',recent:'Recently checked',mailbox:'Mailbox recently confirmed'})[leadReviewReason(l)]}</span></td>
                  <td>{l.fit != null ? <span className={`fit ${l.fit >= 75 ? 'hi' : l.fit >= 55 ? 'mid' : ''}`} title={l.needs || ''}>{l.fit}{l.needs ? <em>{l.needs.split(',')[0]}</em> : null}</span> : <span className="muted">{l.enriched_at ? 'n/a' : 'checking'}</span>}</td>
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
          <button className="btn small" onClick={() => bulk('verify')} title="Syntax and mail server for free; mailbox check if you added a verifier key">Check emails</button>
          <button className="btn small" onClick={() => bulk('proof')}>Make reports</button>
          <button className="btn small" onClick={() => bulk('export:xlsx')}>Export</button>
          <select className="select" value="" onChange={(e) => e.target.value && bulk(e.target.value)} aria-label="Send to another tool"><option value="">Send to…</option><option value="sync:hubspot">HubSpot</option><option value="sync:notion">Notion</option><option value="sync:sheets">Google Sheets</option><option value="sync:postgres">PostgreSQL</option><option value="sync:s3">S3 storage</option></select>
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

export function LeadDrawer({ id, onClose, onChange, go }: { id: number; onClose: () => void; onChange: () => void; go: (s: Screen) => void }) {
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
          <div className="drawer-banner"><button className="btn ghost close" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
          <div className="drawer-id">
            <Avatar name={l.name} size={76} />
            <div className="drawer-quick">
              {l.phone && <button className="round" title="Open in WhatsApp" onClick={async () => { try { await call('wa:open', id, wa?.body ?? ''); } catch (e: any) { toast.push(e.message, true); } }}><MessageCircle size={17} /></button>}
              {l.email && <a className="round" title={`Email ${l.email}`} href={`mailto:${l.email}`}><Mail size={17} /></a>}
            </div>
          </div>
          <h2>{l.name}</h2>
          <div className="row">
            <span className="muted"><MapPin size={13} style={{ verticalAlign: -2 }} /> {l.category}{l.city ? ` in ${l.city}` : ''}</span>
            <select className="select" style={{ width: 'auto', marginLeft: 'auto' }} value={l.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </header>
        <div className="body">
          {(l.contact_name || l.summary || l.fit != null) && (
            <div className="insight">
              {l.contact_name && <div><span className="muted small">Decision maker</span><b>{l.contact_name}</b>{l.contact_role && <span className="muted"> · {l.contact_role}</span>}</div>}
              {l.summary && <p>{l.summary}</p>}
              {l.fit != null && <div className="needs"><span className={`fit ${l.fit >= 75 ? 'hi' : l.fit >= 55 ? 'mid' : ''}`}>{l.fit}% fit</span>{(l.needs || '').split(',').filter(Boolean).map((n) => <span key={n} className="need">needs {n.trim().toLowerCase()}</span>)}</div>}
            </div>
          )}
          <EvidenceCard lead={l} onChange={reload} />
          <LeadCrmCard lead={l} onChange={reload} />
          <ProposalStudio key={id} id={id} />
          <ProofCard id={id} hasEmail={!!l.email} onChange={reload} />
          <dl className="kv">
            <dt>Email</dt><dd>{l.email ? <><a href={`mailto:${l.email}`}>{l.email}</a>{l.email_status === 'ok' && <span className="ok-pill">accepts mail</span>}{l.email_status === 'no-mx' && <span className="bad-pill">no mail server</span>}</> : <span className="muted">{l.enriched_at ? 'none found' : 'not checked yet'}</span>}{emails.length > 1 && <div className="muted">Also: {emails.filter((e) => e !== l.email).join(', ')}</div>}</dd>
            <dt>Phone</dt><dd>{l.phone || <span className="muted">none</span>}</dd>
            <dt>Website</dt><dd>{l.website ? <a href={l.website} target="_blank" rel="noreferrer">{l.domain || l.website}</a> : <span className="muted">none</span>}</dd>
            <dt>Address</dt><dd>{(l.address && /\d/.test(l.address) && l.address.split(',').length >= 3 ? l.address : [l.address, l.city, l.region, l.postcode, l.country].filter(Boolean).join(', ')) || <span className="muted">unknown</span>}</dd>
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
            <button className="btn primary" disabled={!l.email} onClick={async () => { const r = await call('draft:create', [id]); toast.push(r.made ? 'Draft ready in Outreach' : r.errors[0], !r.made); if (r.made) go('outreach'); }}><PenLine size={15} /> Write an email</button>
            <button className="btn" disabled={!l.phone} onClick={async () => { try { await call('wa:open', id, wa?.body ?? ''); } catch (e: any) { toast.push(e.message, true); } }}><MessageCircle size={15} /> WhatsApp</button>
            <button className="btn" disabled={!l.website} onClick={async () => { await call('leads:enrich', [id]); toast.push('Checking the website'); setTimeout(reload, 4000); }}><RefreshCw size={15} /> Check website</button>
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
          <button className="btn danger" style={{ justifySelf: 'start' }} onClick={() => setStatus('do_not_contact')}><Ban size={15} /> Never contact this business</button>
        </div>
      </aside>
    </>
  );
}

type Proof = { overall: number; cards: { label: string; score: number; note: string }[]; rank: number; total: number; steps: string[]; desk: string; mob: string; at: string } | null;
function ProofCard({ id, hasEmail, onChange }: { id: number; hasEmail: boolean; onChange: () => void }) {
  const [p, setP] = useState<Proof>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call<Proof>('proof:info', id).then(setP).catch(() => setP(null)); }, [id]);
  const make = async () => {
    setBusy(true);
    try { setP(await call<Proof>('proof:make', id)); onChange(); toast.push('Proof report ready'); } catch (e: any) { toast.push(e.message, true); } finally { setBusy(false); }
  };
  const tone = (n: number) => (n >= 75 ? 'hi' : n >= 50 ? 'mid' : 'lo');
  if (!p) return (
    <div className="proof empty-proof">
      <span className="proof-icon"><FileBarChart size={18} /></span>
      <div className="grow"><b>Proof-first pitch</b><span className="muted small">Screenshots of their site, a scorecard, where they rank against nearby competitors, and a short plan, as a 1-page PDF you can send.</span></div>
      <button className="btn primary small" disabled={busy} onClick={make}>{busy ? <><span className="spinner sm" /> Checking their site…</> : 'Make report'}</button>
    </div>
  );
  return (
    <div className="proof">
      <div className="proof-top">
        <div className={`proof-score ${tone(p.overall)}`}><b>{p.overall || '—'}</b><span>/100</span></div>
        <div className="grow">
          <b>Proof report</b>
          <span className="muted small">{p.total > 1 ? `#${p.rank} of ${p.total} nearby by Google reviews · ` : ''}made {new Date(p.at).toLocaleDateString()}</span>
        </div>
        <button className="btn ghost small" onClick={make} disabled={busy} title="Check the site again">{busy ? <span className="spinner sm" /> : <RefreshCw size={13} />}</button>
      </div>
      {(p.desk || p.mob) && <div className="proof-shots">{p.desk && <img src={p.desk} alt="Desktop screenshot" />}{p.mob && <img className="mob" src={p.mob} alt="Phone screenshot" />}</div>}
      <div className="proof-cards">{p.cards.map((c) => <div key={c.label} className={tone(c.score)} title={c.note}><span>{c.label}</span><b>{c.score}</b><i style={{ width: `${c.score}%` }} /></div>)}</div>
      {p.steps.length > 0 && <ol className="proof-steps">{p.steps.map((x) => <li key={x}>{x}</li>)}</ol>}
      <div className="row">
        <button className="btn small" onClick={() => call('proof:open', id)}><ExternalLink size={13} /> Open PDF</button>
        <button className="btn small" onClick={async () => { const f = await call('proof:save', id); if (f) toast.push('Saved'); }}><Download size={13} /> Save</button>
        <button className="btn primary small" disabled={!hasEmail} onClick={async () => { try { await call('proof:send', id); toast.push('Report sent'); onChange(); } catch (e: any) { toast.push(e.message, true); } }}><Send size={13} /> Email it to them</button>
      </div>
    </div>
  );
}
