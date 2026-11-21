import { useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { call } from '../api';
import { warningSignals, webUrl, type TrustJob, type TrustReport } from '../../../shared/job-trust';

export function JobTrust({ job }: { job: TrustJob }) {
  const [site, setSite] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<TrustReport | null>(null);
  const [failed, setFailed] = useState(false);
  const warnings = report?.warnings ?? warningSignals(job.snippet);
  const valid = !site.trim() || webUrl(site.trim())?.protocol === 'https:';
  return <section className="panel panel-pad" data-job-trust style={{ marginBottom: 12 }}>
    <div className="row" style={{ alignItems: 'center' }}><ShieldCheck size={18} /><b>Job Trust Score</b></div>
    <p className="muted small">Evidence, not a guarantee of legitimacy. An unavailable page is not proof of a scam.</p>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setFailed(false); setReport(null); try { const r = await call<TrustReport>('jobs:trust', { url: job.url, title: job.title, company: job.company, snippet: job.snippet }, site.trim()); if (!r || typeof r.score !== 'number') throw new Error(); setReport(r); } catch { setFailed(true); } finally { setBusy(false); } }}>
      <label>Employer careers page (optional)<input className="input" value={site} maxLength={2000} disabled={busy} placeholder="https://example.com/careers" onChange={e => { setSite(e.target.value); setReport(null); setFailed(false); }} /></label>
      <p className="muted small">Enter a careers page you independently know belongs to the employer. We check for a link to this exact vacancy.</p>
      <button className="btn primary" type="submit" disabled={busy || !valid}>{busy ? 'Checking…' : 'Check job and employer'}</button>
      {!valid && <p className="small" role="alert">Enter a valid HTTPS careers-page URL.</p>}
    </form>
    {failed && <p role="alert" className="small">Trust check unavailable. Try again later.</p>}
    {report && <div aria-live="polite" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: 'center' }}><b>{report.score}/100</b><span className="tag">{report.state === 'corroborated' ? 'Corroborated listing' : report.state === 'caution' ? 'Review before applying' : report.state === 'closed' ? 'Listing appears closed' : 'Limited evidence'}</span></div>
      <dl className="kv">
        <dt>Listing domain</dt><dd translate="no">{report.listingHost || '—'}</dd>
        <dt>Secure link</dt><dd>{report.secure ? 'Yes' : 'No'}</dd>
        <dt>Listing check</dt><dd>{report.listing === 'readable' ? 'Readable matching page' : report.listing === 'closed' ? 'Listing appears closed' : 'Could not verify'}</dd>
        <dt>Job title found</dt><dd>{report.titleMatch ? 'Yes' : 'Not confirmed'}</dd>
        <dt>Company name found</dt><dd>{report.companyMatch ? 'Yes' : 'Not confirmed'}</dd>
        <dt>Employer page</dt><dd>{report.employer === 'linked' ? 'Exact job link found' : report.employer === 'not-linked' ? 'Exact link not found' : report.employer === 'unknown' ? 'Could not verify' : 'Not checked'}</dd>
        {report.employer !== 'not-checked' && <><dt>Company name on employer page</dt><dd>{report.employerNameMatch ? 'Yes' : 'Not confirmed'}</dd></>}
        {!!report.employerHost && <><dt>Employer domain</dt><dd translate="no">{report.employerHost}</dd></>}
      </dl>
      <p className="muted small">A matching link supports the listing, but does not verify the employer's legal identity. An absent link may reflect a dynamic or incomplete careers page.</p>
      <p className="muted small"><span>Last checked:</span> <time dateTime={report.checkedAt}>{new Date(report.checkedAt).toLocaleString()}</time></p>
    </div>}
    {warnings.length > 0 && <div style={{ marginTop: 10 }} role="status"><div className="row"><AlertTriangle size={16} /><b>Potential warning signs</b></div>{warnings.map(w => <div key={w.kind} style={{ marginTop: 6 }}><b className="small">{w.kind === 'fee' ? 'Possible recruitment fee request' : w.kind === 'payment' ? 'Possible unusual payment request' : 'Possible sensitive information request'}</b><p className="muted small" translate="no">{w.excerpt}</p></div>)}</div>}
    <p className="muted small" style={{ marginBottom: 0 }}>Do not pay upfront recruitment fees or share banking credentials. Confirm the role using an independently trusted employer channel.</p>
  </section>;
}
