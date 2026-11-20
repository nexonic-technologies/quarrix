import { FileUp, FileDown, FileSpreadsheet, FileText, Braces, FileType2 } from 'lucide-react';
import { call } from '../api';
import { toast, type Screen } from '../App';

export function ImportExport({ go }: { go: (s: Screen) => void }) {
  const doImport = async () => {
    try {
      const r = await call<{ added: number; merged: number; total: number } | null>('file:import');
      if (r) { toast.push(`Imported ${r.added} new leads${r.merged ? `, updated ${r.merged} you already had` : ''}`); go('leads'); }
    } catch (e: any) { toast.push(e.message, true); }
  };
  const doExport = async (f: string) => {
    const n = await call('file:export', {}, f);
    if (n) toast.push(`Exported ${n} leads`);
  };
  return (
    <div className="page">
      <div className="grid2 io">
        <button className="panel io-card drop" onClick={doImport}>
          <span className="io-art"><span className="tile t1"><FileSpreadsheet size={22} /></span><span className="tile t2"><FileText size={22} /></span><span className="tile t3"><Braces size={22} /></span><span className="tile main"><FileUp size={30} /></span></span>
          <h2>Import a list</h2>
          <p className="muted">CSV, Excel, JSON or PDF. Columns like Name, Email, Phone, Website, City and Country are matched for you, and duplicates are merged instead of added twice.</p>
          <span className="btn primary">Choose a file</span>
        </button>
        <div className="panel io-card">
          <span className="io-art"><span className="tile t1 c"><FileType2 size={22} /></span><span className="tile t2 c"><FileSpreadsheet size={22} /></span><span className="tile t3 c"><Braces size={22} /></span><span className="tile main c"><FileDown size={30} /></span></span>
          <h2>Export everything</h2>
          <p className="muted">All your leads with every detail, social profiles included. To export part of the list, filter or select on the Leads screen first.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={() => doExport('xlsx')}>Excel</button>
            <button className="btn" onClick={() => doExport('csv')}>CSV</button>
            <button className="btn" onClick={() => doExport('json')}>JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}
