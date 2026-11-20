// Settings → Privacy (QF-120) and the diagnostics file (QF-124).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { FileDown } from 'lucide-react';

export function Privacy() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { call<any[]>('privacy:summary').then((x) => setRows(x ?? [])); }, []);
  return (
    <section>
      <p className="muted" style={{ margin: 0 }}>Quarrix stores your data on this computer. This is everything that can leave it, and whether it is switched on now.</p>
      <div className="table-wrap"><table className="leads">
        <thead><tr><th>Feature</th><th>On</th><th>What is sent</th><th>To</th><th>Where it is kept</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.feature}><td><b>{r.feature}</b></td><td>{r.on ? 'Yes' : 'No'}</td><td className="small">{r.sends}</td><td className="small">{r.to}</td><td className="small">{r.kept}</td></tr>)}</tbody>
      </table></div>
      <h2 style={{ marginTop: 12 }}>Diagnostics</h2>
      <p className="muted small" style={{ margin: 0 }}>A file for support: app version, settings without keys or passwords, source health and recent errors. Emails and phone numbers are masked. Nothing is sent; you choose whether to share the file.</p>
      <div><button className="btn" onClick={async () => { const p = await call('diag:save'); if (p) toast.push('Diagnostics saved'); }}><FileDown size={14} /> Save a diagnostics file</button></div>
    </section>
  );
}
