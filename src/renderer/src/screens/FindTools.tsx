// Map area picker (QF-003), search preview (QF-013, QF-117), batch builder with templates (QF-002) and the clustered lead map (QF-015).
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { call, json } from '../api';
import { toast } from '../App';
import { X, Play, Save, Trash2 } from 'lucide-react';

/** Close a dialog with the Escape key. */
function useEscape(onClose: () => void) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
}

export type Geo = { lat: number; lon: number; km: number; poly?: [number, number][] };
const hav = (a: [number, number], b: [number, number]) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const dotIcon = (color = '#7c3aed') => L.divIcon({ className: '', html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`, iconSize: [12, 12] });

function useMap(ref: React.RefObject<HTMLDivElement | null>, center: [number, number], zoom: number) {
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!ref.current || map.current) return;
    map.current = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView(center, zoom);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return map;
}

/** Click the map to set the centre; the slider sets the radius. */
export function MapPicker({ value, onChange, onClose }: { value: Geo | null; onChange: (g: Geo | null) => void; onClose: () => void }) {
  useEscape(onClose);
  const box = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Geo | null>(value);
  const [mode, setMode] = useState<'circle' | 'area'>(value?.poly ? 'area' : 'circle');
  const [pts, setPts] = useState<[number, number][]>(value?.poly ?? []);
  const polyLayer = useRef<L.Polygon | null>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const map = useMap(box, value ? [value.lat, value.lon] : [30, 0], value ? 12 : 2);
  const circle = useRef<L.Circle | null>(null);
  const marker = useRef<L.Marker | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const click = (e: L.LeafletMouseEvent) => modeRef.current === 'area'
      ? setPts((p) => (p.length < 60 ? [...p, [+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]] : p))
      : setG((o) => ({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5), km: o?.km ?? 3 }));
    m.on('click', click);
    return () => { m.off('click', click); };
  }, [map]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    circle.current?.remove(); marker.current?.remove();
    if (!g) return;
    circle.current = L.circle([g.lat, g.lon], { radius: g.km * 1000, color: '#7c3aed', weight: 2, fillOpacity: 0.08 }).addTo(m);
    marker.current = L.marker([g.lat, g.lon], { icon: dotIcon(), keyboard: false }).addTo(m);
  }, [g, map]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    polyLayer.current?.remove();
    if (mode === 'area' && pts.length) polyLayer.current = L.polygon(pts, { color: '#7c3aed', weight: 2, fillOpacity: 0.08 }).addTo(m);
    if (mode === 'area') { circle.current?.remove(); marker.current?.remove(); }
  }, [pts, mode, map]);
  const areaGeo = (): Geo | null => {
    if (pts.length < 3) return null;
    const c: [number, number] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    return { lat: +c[0].toFixed(5), lon: +c[1].toFixed(5), km: Math.max(0.5, Math.min(100, +Math.max(...pts.map((p) => hav(c, p))).toFixed(1))), poly: pts };
  };
  const find = async (q: string) => {
    if (!q.trim()) return;
    try {
      const r = await call<{ lat: number; lon: number } | null>('geo:find', q);
      if (r) { map.current?.setView([r.lat, r.lon], 12); setG({ lat: +r.lat.toFixed(5), lon: +r.lon.toFixed(5), km: g?.km ?? 3 }); }
      else toast.push('Place not found.', true);
    } catch { toast.push('Could not search the map right now.', true); }
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal modal-wide" role="dialog" aria-label="Search an area on the map">
        <header><div className="grow"><b>Search an area on the map</b><span className="muted small">Click the map to set the centre, then choose how far around it to search. Google Maps is searched in a grid of small squares so nothing is missed.</span></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, display: 'grid', gap: 10, overflow: 'auto' }}>
          <input className="input" placeholder="Jump to a place, then press Enter" onKeyDown={(e) => e.key === 'Enter' && find((e.target as HTMLInputElement).value)} aria-label="Jump to a place" />
          <div ref={box} className="mapbox" />
          <div className="row" style={{ gap: 6 }}>
            <button className={`btn small ${mode === 'circle' ? 'primary' : 'ghost'}`} aria-pressed={mode === 'circle'} onClick={() => setMode('circle')}>Circle</button>
            <button className={`btn small ${mode === 'area' ? 'primary' : 'ghost'}`} aria-pressed={mode === 'area'} onClick={() => setMode('area')}>Draw an area</button>
            {mode === 'area' && <><span className="muted small">Click the map to add corners ({pts.length}).</span><button className="btn small ghost" disabled={!pts.length} onClick={() => setPts((p) => p.slice(0, -1))}>Undo</button><button className="btn small ghost" disabled={!pts.length} onClick={() => setPts([])}>Clear</button></>}
          </div>
          {mode === 'circle' && <label className="row" style={{ gap: 10 }}>
            <span className="small">Radius</span>
            <input type="range" min={0.5} max={50} step={0.5} value={g?.km ?? 3} disabled={!g} onChange={(e) => setG((o) => (o ? { ...o, km: +e.target.value } : o))} style={{ flex: 1 }} aria-label="Radius in kilometres" />
            <b style={{ width: 64, textAlign: 'right' }}>{g ? `${g.km} km` : '—'}</b>
          </label>}
        </div>
        <footer className="row" style={{ justifyContent: 'flex-end' }}>
          {value && <button className="btn ghost" onClick={() => { onChange(null); onClose(); }}>Clear area</button>}
          <button className="btn primary" disabled={mode === 'area' ? pts.length < 3 : !g} onClick={() => { onChange(mode === 'area' ? areaGeo() : g && { lat: g.lat, lon: g.lon, km: g.km }); onClose(); }}>Use this area</button>
        </footer>
      </div>
    </>
  );
}

type Preview = { where: string; sources: { source: string; name: string; sample: any[]; error: string; seconds: number; areas: number; estimate: string; budgetLeft: number | null }[] };

export function PreviewModal({ category, place, sources, geo, onRun, onClose }: { category: string; place: string; sources: string[]; geo: Geo | null; onRun: () => void; onClose: () => void }) {
  useEscape(onClose);
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { call<Preview>('search:preview', category, place, sources, geo).then(setP).catch((e) => setErr(e.message)); }, [category, place, sources, geo]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal modal-wide" role="dialog" aria-label="Search preview">
        <header><div className="grow"><b>Preview: {category} {geo ? `within ${geo.km} km` : 'in'} {p?.where ?? place}</b><span className="muted small">Up to 5 real results from each source, and what the full search will take. Nothing is saved.</span></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, overflow: 'auto' }} aria-live="polite">
          {err ? <div className="note warn">{err}</div> : !p ? <div className="doc-wait"><span className="spinner" />Asking each source for a few results…</div> : (
            <div className="preview-grid">
              {p.sources.map((s) => (
                <div key={s.source} className="preview-src">
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{s.name}</b><span className="muted small">{s.seconds}s{s.budgetLeft != null ? ` · ${s.budgetLeft} requests left today` : ''}</span></div>
                  {s.error ? <div className="err">{s.error}</div> : <>
                    <div className="small">{s.estimate}</div>
                    {s.sample.length ? <ul>{s.sample.map((c, i) => <li key={i}>{c.name}{c.address ? ` · ${c.address}` : ''}{c.phone ? ` · ${c.phone}` : ''}{c.website ? ` · ${c.website.replace(/^https?:\/\//, '')}` : ''}</li>)}</ul> : <div className="muted small">No results here. This source may not cover this kind of business or place.</div>}
                  </>}
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>Back</button><button className="btn primary" disabled={!p} onClick={() => { onClose(); onRun(); }}><Play size={14} /> Run the full search</button></footer>
      </div>
    </>
  );
}

type Template = { id: number; name: string; categories: string; places: string; sources: string };

export function BatchModal({ sources, onClose }: { sources: string[]; onClose: () => void }) {
  useEscape(onClose);
  const [cats, setCats] = useState('');
  const [places, setPlaces] = useState('');
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const reload = () => call<Template[]>('templates:list').then(setTemplates);
  useEffect(() => { void reload(); }, []);
  const lines = (t: string) => t.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const n = lines(cats).length * lines(places).length;
  const run = async () => {
    if (!n) { toast.push('Add at least one business type and one place.', true); return; }
    try { const ids = await call<number[]>('search:batch', lines(cats), lines(places), sources); toast.push(`${ids.length} searches queued. They run one after another.`); onClose(); }
    catch (e: any) { toast.push(e.message, true); }
  };
  const save = async () => {
    if (!name.trim() || !n) { toast.push('Name the template and fill both lists.', true); return; }
    await call('templates:save', { name: name.trim(), categories: lines(cats), places: lines(places), sources });
    setName(''); void reload(); toast.push('Template saved');
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal modal-wide batch" role="dialog" aria-label="Batch search">
        <header><div className="grow"><b>Batch search</b><span className="muted small">Every business type in every place, one line each. Uses the sources selected on the Find screen.</span></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, display: 'grid', gap: 10, overflow: 'auto' }}>
          {templates.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{templates.map((t) => (
            <span key={t.id} className="chip" role="button" tabIndex={0} onClick={() => { setCats(json<string[]>(t.categories, []).join('\n')); setPlaces(json<string[]>(t.places, []).join('\n')); }}>
              {t.name} <button className="btn small ghost" aria-label={`Delete ${t.name}`} onClick={async (e) => { e.stopPropagation(); await call('templates:delete', t.id); void reload(); }}><Trash2 size={12} /></button>
            </span>))}</div>}
          <div className="grid2">
            <label className="field"><span>Business types</span><textarea className="input" value={cats} onChange={(e) => setCats(e.target.value)} placeholder={'Dentists\nPhysiotherapists\nChiropractors'} /></label>
            <label className="field"><span>Places</span><textarea className="input" value={places} onChange={(e) => setPlaces(e.target.value)} placeholder={'Austin, Texas\nDallas, Texas\nManchester, UK'} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}><input className="input" placeholder="Save as template (name)" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={save}><Save size={14} /> Save</button></div>
        </div>
        <footer className="row" style={{ justifyContent: 'space-between' }}><span className="muted small">{n} search{n === 1 ? '' : 'es'}</span><button className="btn primary" onClick={run} disabled={!n}><Play size={14} /> Queue {n || ''} searches</button></footer>
      </div>
    </>
  );
}

/** Leads with coordinates as clustered pins (QF-015). */
export function LeadMap({ leads, onOpen }: { leads: { id: number; name: string; lat: number | null; lon: number | null; category: string; city: string; status: string }[]; onOpen: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useMap(box, [30, 0], 2);
  const layer = useRef<any>(null);
  const pts = leads.filter((l) => l.lat != null && l.lon != null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current?.remove();
    const cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    for (const l of pts) {
      const mk = L.marker([l.lat!, l.lon!], { icon: dotIcon(l.status === 'won' ? '#16a34a' : l.status === 'new' ? '#7c3aed' : '#f59e0b'), title: l.name });
      const div = document.createElement('div');
      const b = document.createElement('b'); b.textContent = l.name;
      const sm = document.createElement('div'); sm.textContent = [l.category, l.city].filter(Boolean).join(' · ');
      const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Open'; btn.onclick = () => onOpen(l.id);
      div.append(b, sm, btn);
      mk.bindPopup(div);
      cluster.addLayer(mk);
    }
    cluster.addTo(m);
    layer.current = cluster;
    if (pts.length) m.fitBounds(cluster.getBounds(), { padding: [30, 30], maxZoom: 14 });
  }, [leads, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div ref={box} className="mapbox tall" />
      <span className="muted small">{pts.length.toLocaleString()} of {leads.length.toLocaleString()} leads on this page have a location.</span>
    </div>
  );
}
