// First-launch setup (QF-114): what Quarrix is for, who you are, who you sell to, and what leaves this computer.
// Every step can be skipped; nothing is sent anywhere until the user starts a search or connects a mailbox.
import { useEffect, useRef,useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { Briefcase, Building2, Layers, ShieldCheck, ArrowRight } from 'lucide-react';
import { CountryInput } from '../CityInput';

type Ws = 'both' | 'business' | 'career';
export function Onboarding({ onDone }: { onDone: (ws: Ws | null) => void }) {
  const [step, setStep] = useState(0);
  const [ws, setWs] = useState<Ws>('both');
  const [p, setP] = useState({ name: '', company: '', website: '', services: '' });
  const [preset, setPreset] = useState('web');
  const [country, setCountry] = useState('');
  const [presets, setPresets] = useState<Record<string, { label: string; icp: any }>>({});
  const [busy,setBusy]=useState(false);const modal=useRef<HTMLDivElement>(null);
  useEffect(() => { call<any>('icp:presets').then((x) => setPresets(x ?? {})).catch(()=>{});modal.current?.querySelector('button')?.focus(); }, []);
  const finish = async () => {
    setBusy(true);try {
      const s = await call<any>('settings:get');
      const icp = { ...(s.icp ?? {}), preset, ...(presets[preset]?.icp ?? {}), countries: country ? [country] : [] };
      await call('settings:save', { onboarded: true, workspace: ws, profile: { ...s.profile, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) }, ...(ws !== 'career' ? { icp } : {}) });
      onDone(ws);
    } catch (e: any) { toast.push(e.message, true); } finally {setBusy(false);}
  };
  const skip = async () => {setBusy(true);try{await call('settings:save', { onboarded: true });onDone(null);}catch(e){toast.push(String(e),true);}finally{setBusy(false);}};
  const steps = ws === 'career' ? 3 : 4;
  return (
    <>
      <div className="scrim" />
      <div ref={modal} className="modal onboard" role="dialog" aria-modal="true" aria-label="Set up Quarrix" onKeyDown={e=>{if(e.key!=='Tab')return;const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')].filter(x=>x.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}>
        <header><div className="grow"><b>Welcome to Quarrix</b><span className="muted small">Step {step + 1} of {steps}. You can change all of this later in Settings.</span><progress className="onboard-progress" value={step+1} max={steps} aria-label="Setup progress"/></div><button className="btn small ghost" disabled={busy} onClick={skip}>Skip setup</button></header>
        <div style={{ padding: 18, overflow: 'auto', display: 'grid', gap: 12 }}>
          {step === 0 && <>
            <h2 style={{ margin: 0 }}>What will you use Quarrix for?</h2>
            <p className="muted small" style={{ margin: 0 }}>Discover Opportunities. Build Your Career. Grow Your Business.</p>
            <div className="choice">
              {([['business', Building2, 'Finding clients', 'Find businesses, check their websites, and reach out.'], ['career', Briefcase, 'Finding a job', 'Search every board and employer, match jobs to your CV.'], ['both', Layers, 'Both', 'Everything, side by side.']] as const).map(([k, Icon, t, d]) => (
                <button key={k} aria-pressed={ws === k} onClick={() => setWs(k)}><Icon size={22} /><b>{t}</b><span className="muted small">{d}</span></button>
              ))}
            </div>
          </>}
          {step === 1 && <>
            <h2 style={{ margin: 0 }}>About you</h2>
            <p className="muted small" style={{ margin: 0 }}>Used to sign your emails and documents, so people know who is writing.</p>
            <div className="grid2">
              <label className="field"><span>Your name</span><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoFocus /></label>
              <label className="field"><span>Company (optional)</span><input className="input" value={p.company} onChange={(e) => setP({ ...p, company: e.target.value })} /></label>
              <label className="field"><span>Website (optional)</span><input className="input" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} /></label>
              {ws !== 'career' && <label className="field"><span>What you offer, in one line</span><input className="input" value={p.services} onChange={(e) => setP({ ...p, services: e.target.value })} placeholder="Fast websites and SEO for local businesses" /></label>}
            </div>
          </>}
          {step === 2 && ws !== 'career' && <>
            <h2 style={{ margin: 0 }}>Who do you sell to?</h2>
            <p className="muted small" style={{ margin: 0 }}>Quarrix grades every lead A to D against this, with the reasons.</p>
            <div className="choice">{Object.entries(presets).map(([k, v]) => <button key={k} aria-pressed={preset === k} onClick={() => setPreset(k)}><b>{v.label}</b></button>)}</div>
            <label className="field"><span>Main country (optional)</span><CountryInput value={country} onChange={setCountry} /></label>
          </>}
          {step === steps - 1 && <>
            <h2 style={{ margin: 0 }}><ShieldCheck size={18} /> What stays on this computer</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              <li>Your leads, deals, emails, CV and settings are stored only on this computer. Passwords and keys are encrypted with your system keychain.</li>
              <li>When you search, your search words go to the sources you pick. Website checks visit each business's own site.</li>
              <li>AI writing is off until you add a model. If you choose a cloud model, the lead facts you write about are sent to it.</li>
              <li>Nothing is emailed until you connect a mailbox and approve sending in Settings → Email.</li>
            </ul>
            <p className="muted small" style={{ margin: 0 }}>The full list is in Settings → Privacy.</p>
          </>}
        </div>
        <footer className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" disabled={step === 0||busy} onClick={() => setStep(step - 1)}>Back</button>
          {step < steps - 1 ? <button className="btn primary" disabled={busy} onClick={() => setStep(step+1)}>Next <ArrowRight size={14} /></button>
            : <button className="btn primary" disabled={busy} onClick={finish}>Start using Quarrix</button>}
        </footer>
      </div>
    </>
  );
}
