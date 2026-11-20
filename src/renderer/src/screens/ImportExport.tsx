import { FileUp, FileDown } from 'lucide-react';
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
      <div className="page-head"><div className="grow"><h1>Import and export</h1><p>Bring in the lists you already have, or take your leads anywhere.</p></div></div>
      <div className="grid2">
        <div className="panel panel-pad">
          <h2><FileUp size={18} style={{ verticalAlign: -3 }} /> Import</h2>
          <p className="muted">CSV, Excel (.xlsx), JSON or PDF. Columns such as Name, Email, Phone, Website, City and Country are matched automatically, and duplicates are merged instead of added twice. From a PDF, Quarrix picks out emails, phones and websites; with a writing model set up it reads whole business entries.</p>
          <button className="btn primary" onClick={doImport}>Choose a file</button>
        </div>
        <div className="panel panel-pad">
          <h2><FileDown size={18} style={{ verticalAlign: -3 }} /> Export everything</h2>
          <p className="muted">All your leads with every detail, including social profiles. To export part of the list, filter or select leads on the Leads screen first.</p>
          <div className="row">
            <button className="btn" onClick={() => doExport('xlsx')}>Excel</button>
            <button className="btn" onClick={() => doExport('csv')}>CSV</button>
            <button className="btn" onClick={() => doExport('json')}>JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}
