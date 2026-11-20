// Settings → Ideal customer (QF-033, QF-034) and email checking options (QF-030, QF-031, QF-042).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';

const list = (v: string[] | undefined) => (v ?? []).join(', ');
const parse = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);

export function IcpPanel({ s, set }: { s: any; set: (path: string, v: unknown) => void }) {
  const [presets, setPresets] = useState<Record<string, { label: string; icp: any }>>({});
  useEffect(() => { call<any>('icp:presets').then((x) => setPresets(x ?? {})); }, []);
  const icp = s.icp ?? {};
  const put = (k: string, v: unknown) => set('icp', { ...icp, [k]: v });
  const applyPreset = (k: string) => {
    const base = { preset: k, categories: [], countries: [], cities: [], minRating: 0, maxRating: 5, minReviews: 0, maxReviews: 0, needWebsite: 'any', needEmail: false, excludeChains: true, needs: [], offer: icp.offer ?? '' };
    set('icp', { ...base, ...(presets[k]?.icp ?? {}) });
  };
  const rescore = async () => { await call('settings:save', s); const n = await call<number>('icp:rescore'); toast.push(`Saved and re-graded ${n?.toLocaleString?.() ?? n} leads`); };
  const num = (k: string, label: string, step = 1) => <label className="field"><span>{label}</span><input className="input" type="number" step={step} value={icp[k] ?? 0} onChange={(e) => put(k, Number(e.target.value))} /></label>;
  const txt = (k: string, label: string, help: string) => <label className="field"><span>{label}</span><input className="input" value={list(icp[k])} onChange={(e) => put(k, parse(e.target.value))} /><small>{help}</small></label>;
  return (
    <section>
      <p className="muted" style={{ margin: 0 }}>Describe who you sell to. Every lead gets a grade from A to D with the reasons, and a separate evidence score showing how much of it is backed by a source.</p>
      <label className="field"><span>Start from</span>
        <select className="input" value={icp.preset ?? ''} onChange={(e) => applyPreset(e.target.value)}>
          {Object.entries(presets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select><small>Choosing a preset fills the rules below; you can change any of them.</small></label>
      <div className="grid2">
        {txt('categories', 'Business types', 'Empty means any. Example: Dentists, Clinics')}
        {txt('countries', 'Countries (2-letter codes)', 'Empty means any. Example: US, GB, CA')}
        {txt('cities', 'Cities', 'Empty means any.')}
        {txt('needs', 'Signs they need you', 'Words from the website check, for example: no website, slow, not mobile, no booking, rating')}
        {num('minRating', 'Lowest rating', 0.1)}{num('maxRating', 'Highest rating (5 = any)', 0.1)}
        {num('minReviews', 'Fewest reviews')}{num('maxReviews', 'Most reviews (0 = any)')}
        <label className="field"><span>Website</span><select className="input" value={icp.needWebsite ?? 'any'} onChange={(e) => put('needWebsite', e.target.value)}><option value="any">Either</option><option value="with">Must have one</option><option value="without">Must not have one</option></select></label>
        <label className="field"><span>Your offer in one line</span><input className="input" value={icp.offer ?? ''} onChange={(e) => put('offer', e.target.value)} placeholder="Fast mobile websites with online booking" /></label>
      </div>
      <label className="switch"><input type="checkbox" checked={!!icp.needEmail} onChange={(e) => put('needEmail', e.target.checked)} /> Must have an email address</label>
      <label className="switch"><input type="checkbox" checked={!!icp.excludeChains} onChange={(e) => put('excludeChains', e.target.checked)} /> Leave out chains and franchises</label>
      <div><button className="btn primary" onClick={rescore}>Save and re-grade all leads</button></div>

      <h2 style={{ marginTop: 14 }}>Email checks</h2>
      <p className="muted small" style={{ margin: 0 }}>Every address gets a free syntax and mail-server check. A mail server only shows the domain accepts mail, not that the mailbox exists. To confirm mailboxes, add a verifier key. Each check counts against its daily limit in Sources.</p>
      <div className="grid2">
        <label className="field"><span>Mailbox verifier</span><select className="input" value={s.verify?.provider ?? 'none'} onChange={(e) => set('verify.provider', e.target.value)}><option value="none">None (free checks only)</option><option value="hunter">Hunter</option><option value="zerobounce">ZeroBounce</option></select></label>
        <label className="field"><span>Re-check leads after (days)</span><input className="input" type="number" min={0} value={s.freshDays ?? 90} onChange={(e) => set('freshDays', Number(e.target.value))} /><small>0 turns re-checks off.</small></label>
        <label className="field"><span>Hunter key</span><input className="input" type="password" value={s.verify?.hunterKey ?? ''} onChange={(e) => set('verify.hunterKey', e.target.value)} /><small>hunter.io → API. Free: 25 searches, 50 checks a month.</small></label>
        <label className="field"><span>ZeroBounce key</span><input className="input" type="password" value={s.verify?.zerobounceKey ?? ''} onChange={(e) => set('verify.zerobounceKey', e.target.value)} /></label>
      </div>
      <label className="switch"><input type="checkbox" checked={!!s.verify?.auto} onChange={(e) => set('verify.auto', e.target.checked)} /> Verify new emails automatically with the verifier (uses credits)</label>
      <label className="switch"><input type="checkbox" checked={!!s.verify?.findWithHunter} onChange={(e) => set('verify.findWithHunter', e.target.checked)} /> When a website shows no email, ask Hunter (uses credits)</label>
    </section>
  );
}
