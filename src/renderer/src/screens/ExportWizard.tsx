// Export wizard (QF-118): columns, format, do-not-contact handling and one-row-per-email, before the file is written.
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { X, Download } from 'lucide-react';

export function ExportWizard({ filter, total, onClose }: { filter: Record<string, unknown>; total: number; onClose: () => void }) {
  const [all, setAll] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');
  const [includeDnc, setIncludeDnc] = useState(false);
  const [dedupeEmail, setDedupe] = useState(false);
  useEffect(() => { call<string[]>('export:fields').then((f) => { setAll(f ?? []); setFields(f ?? []); }); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const run = async () => { const n = await call('file:export', filter, format, { fields, includeDnc, dedupeEmail }); if (n != null) { toast.push(`Exported ${n} leads`); onClose(); } };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" style={{ height: "auto", maxHeight: "86vh" }} role="dialog" aria-label="Export leads">
        <header><div className="grow"><b>Export {total.toLocaleString()} leads</b><span className="muted small">Sources whose terms do not allow exporting are always left out. A "Data credit" column names the source to credit.</span></div><button className="btn small ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 10 }}>
          <div className="row" style={{ gap: 6 }}>{(['xlsx', 'csv', 'json'] as const).map((f) => <button key={f} className={`btn small ${format === f ? 'primary' : 'ghost'}`} aria-pressed={format === f} onClick={() => setFormat(f)}>{f === 'xlsx' ? 'Excel' : f.toUpperCase()}</button>)}</div>
          <label className="switch"><input type="checkbox" checked={includeDnc} onChange={(e) => setIncludeDnc(e.target.checked)} /> Include leads marked do not contact (for your records only)</label>
          <label className="switch"><input type="checkbox" checked={dedupeEmail} onChange={(e) => setDedupe(e.target.checked)} /> One row per email address</label>
          <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Columns</b><span className="row" style={{ gap: 4 }}><button className="btn small ghost" onClick={() => setFields(all)}>All</button><button className="btn small ghost" onClick={() => setFields(['Name', 'Email', 'Phone', 'Website', 'City', 'Country'])}>Contact basics</button></span></div>
          <div className="cols">{all.map((f) => <label key={f} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} />{f}</label>)}</div>
        </div>
        <footer className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!fields.length} onClick={run}><Download size={14} /> Export</button></footer>
      </div>
    </>
  );
}
