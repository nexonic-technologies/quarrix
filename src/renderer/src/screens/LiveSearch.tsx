import { useEffect, useState } from 'react';
import { X, Square, ArrowRight, Radio } from 'lucide-react';
import { call, json, type Lead, type Search } from '../api';
import { type Screen } from '../App';
import { Avatar, CountUp } from '../Art';

const SRC: Record<string, string> = { gmaps: 'Google Maps', osm: 'OpenStreetMap', web: 'Web search', dir: 'Directories', posts: 'Job posts', places: 'Google Places API' };

/** Watch a search while it runs: what it is doing now, and each business as it is added. */
export function LiveSearch({ search, tick, onClose, go }: { search: Search; tick: number; onClose: () => void; go: (s: Screen) => void }) {
  const [log, setLog] = useState<{ at: string; msg: string }[]>([]);
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const run = search.status === 'running' || search.status === 'queued';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [l, r] = await Promise.all([call('search:log', search.id), call<{ total: number; rows: Lead[] }>('leads:query', { searchId: search.id, limit: 60 })]);
      if (!alive) return;
      setLog(l); setRows(r.rows); setTotal(r.total);
    };
    void load();
    const t = run ? setInterval(load, 1500) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [search.id, run, tick]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);

  const steps = log.filter((l) => !l.msg.startsWith('+ '));
  const now = steps[steps.length - 1]?.msg ?? (run ? 'Starting…' : search.error || 'Finished');
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer live" role="dialog" aria-label="Search progress">
        <header>
          <div className="drawer-banner"><button className="btn ghost close" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
          <div className="live-head">
            <span className={`live-dot ${run ? 'on' : ''}`}><Radio size={14} /></span>
            <div className="grow">
              <h2>{search.category} in {search.place}</h2>
              <p className="muted small">{json<string[]>(search.sources, []).map((x) => SRC[x] ?? x).join(' · ')}</p>
            </div>
            {run && <button className="btn small" onClick={() => call('search:stop', search.id)}><Square size={12} /> Stop</button>}
          </div>
          <div className="live-stats">
            <div><b><CountUp to={total} /></b><span>businesses</span></div>
            <div><b>{search.found}</b><span>found in total</span></div>
            <div><b>{withEmail}</b><span>emails so far*</span></div>
            <div><b>{withPhone}</b><span>phones so far*</span></div>
          </div>
          <div className={`live-now ${run ? 'run' : ''}`}><span>{run ? 'Now' : search.status === 'failed' ? 'Stopped with a problem' : 'Done'}</span>{now}</div>
        </header>
        <div className="body">
          <div className="live-feed">
            {rows.length === 0 && <p className="muted">Businesses appear here as soon as they are found.</p>}
            {rows.map((l) => (
              <div key={l.id} className="live-row">
                <Avatar name={l.name} size={30} />
                <div className="grow">
                  <b>{l.name}</b>
                  <span className="muted small">{[l.category, l.city, l.country].filter(Boolean).join(' · ')}</span>
                </div>
                <span className={`tag ${l.email ? 'ok' : ''}`}>{l.email ? 'email' : l.website && !l.enriched_at ? 'checking' : 'no email'}</span>
                {l.phone && <span className="tag ok">phone</span>}
              </div>
            ))}
          </div>
          <p className="muted small">* of the newest 60. Website checks keep running after the search ends.</p>
          <button className="btn primary" onClick={() => { sessionStorage.setItem('quarrix.search', String(search.id)); go('leads'); }}>Open all {total} leads <ArrowRight size={14} /></button>
        </div>
      </aside>
    </>
  );
}
