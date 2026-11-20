// Settings → Email extras: OAuth sign-in (QF-059/060), send approval (QF-066), safety pause (QF-068),
// sequence editor (QF-064), re-contact rule (QF-074) and the domain check (QF-069).
import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { ShieldCheck, Plus, Trash2, LogIn, LogOut, Globe } from 'lucide-react';

export function SignIn({ s, set, reload }: { s: any; set: (p: string, v: unknown) => void; reload: () => void }) {
  const e = s.email;
  const [busy, setBusy] = useState(false);
  const go = async (p: 'google' | 'microsoft') => {
    setBusy(true);
    try { await call('settings:save', s); toast.push('Approve Quarrix in your browser…'); const who = await call<string>('mail:oauth', p); toast.push(`Connected as ${who}`); reload(); }
    catch (err: any) { toast.push(err.message, true); }
    setBusy(false);
  };
  if (e.auth && e.auth !== 'password') return (
    <div className="note"><b>Signed in with {e.auth === 'google' ? 'Google' : 'Microsoft'}</b> as {e.oauthUser}. No password is stored.
      <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={async () => { await call('mail:oauthOff'); reload(); }}><LogOut size={13} /> Sign out</button></div>
  );
  return (
    <details className="oauth">
      <summary><LogIn size={14} /> Sign in with Google or Microsoft instead of an app password</summary>
      <p className="muted small">Uses your own OAuth app, so your mail never passes through anyone else. Google: Google Cloud Console → APIs → Credentials → Create OAuth client ID → Desktop app (enable the Gmail API). Microsoft: Azure portal → App registrations → New → "Mobile and desktop" redirect http://localhost, then add the SMTP.Send and IMAP.AccessAsUser.All permissions.</p>
      <div className="grid2">
        <label className="field"><span>OAuth client ID</span><input className="input" value={e.oauthClientId ?? ''} onChange={(x) => set('email.oauthClientId', x.target.value.trim())} /></label>
        <label className="field"><span>Client secret (Google only)</span><input className="input" type="password" value={e.oauthClientSecret ?? ''} onChange={(x) => set('email.oauthClientSecret', x.target.value.trim())} /></label>
      </div>
      <div className="row"><button className="btn" disabled={busy || !e.oauthClientId} onClick={() => go('google')}>Sign in with Google</button><button className="btn" disabled={busy || !e.oauthClientId} onClick={() => go('microsoft')}>Sign in with Microsoft</button></div>
    </details>
  );
}

export function SendingSafety({ s, set }: { s: any; set: (p: string, v: unknown) => void }) {
  const [h, setH] = useState<any>(null);
  const [dns, setDns] = useState<any>(null);
  const [agree, setAgree] = useState(false);
  const load = () => call('mail:health').then(setH);
  useEffect(() => { void load(); }, []);
  const steps: number[] = s.email.followups ?? [];
  const setSteps = (v: number[]) => set('email.followups', v);
  return (
    <>
      <h2 style={{ marginTop: 10 }}><ShieldCheck size={16} /> Sending approval</h2>
      {h?.paused && <div className="note warn"><b>Sending is paused.</b> {h.paused} <button className="btn small" onClick={async () => { await call('mail:resume'); void load(); }}>Resume sending</button></div>}
      {h?.authorized ? (
        <div className="note">Sending is approved from <b>{h.from}</b> since {new Date(h.authorized).toLocaleDateString()}. Changing the sending address turns it off until you approve again.
          <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={async () => { await call('mail:authorize', false); void load(); }}>Turn off sending</button></div>
      ) : (
        <div className="note warn">
          <b>Nothing is sent until you approve it.</b> Approved emails wait in Outreach → Waiting to send.
          <label className="switch" style={{ marginTop: 6 }}><input type="checkbox" checked={agree} onChange={(x) => setAgree(x.target.checked)} /> I may send from this address, the emails show my real name and company, and I will honour every opt-out.</label>
          <button className="btn small primary" disabled={!agree} onClick={async () => { await call('settings:save', s); try { toast.push(`Sending approved from ${await call('mail:authorize', true)}`); void load(); } catch (x: any) { toast.push(x.message, true); } }}>Approve sending</button>
        </div>
      )}
      {h && <p className="muted small" style={{ margin: 0 }}>Last {h.sent} emails: {h.bounced} bounced, {h.complaints} complaints. Sending pauses by itself if bounces go above the limit below.</p>}

      <h2 style={{ marginTop: 10 }}>Sequence</h2>
      <p className="muted small" style={{ margin: 0 }}>The first email, then each follow-up after the number of days shown. Every step stops when they reply, opt out or bounce, and a step never goes before the one above it.</p>
      <ol className="seq">
        <li><b>First email</b> <span className="muted small">when approved, in their working hours</span></li>
        {steps.map((d, i) => (
          <li key={i}><b>Follow-up {i + 1}</b> <input className="input" type="number" min={1} max={60} value={d} aria-label={`Days before follow-up ${i + 1}`} onChange={(x) => setSteps(steps.map((v, j) => (j === i ? Math.max(1, Number(x.target.value) || 1) : v)))} /> days after the previous one
            <button className="btn small ghost" aria-label={`Remove follow-up ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 size={12} /></button></li>
        ))}
      </ol>
      {steps.length < 5 && <button className="btn small" onClick={() => setSteps([...steps, (steps[steps.length - 1] ?? 3) + 4])}><Plus size={13} /> Add a follow-up</button>}
      <div className="grid3">
        <label className="field"><span>Don't email the same company again within (days)</span><input className="input" type="number" min={0} value={s.email.recontactDays ?? 90} onChange={(x) => set('email.recontactDays', Number(x.target.value))} /><small>Across all campaigns. 0 turns it off.</small></label>
        <label className="field"><span>Pause if bounces go above (%)</span><input className="input" type="number" min={1} max={50} value={s.email.bouncePct ?? 5} onChange={(x) => set('email.bouncePct', Number(x.target.value))} /></label>
        <label className="field"><span>Your time zone (optional)</span><input className="input" placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone} value={s.email.senderTimezone ?? ''} onChange={(x) => set('email.senderTimezone', x.target.value.trim())} /><small>Used when a lead's time zone is unknown.</small></label>
      </div>

      <h2 style={{ marginTop: 10 }}><Globe size={16} /> Your sending domain</h2>
      <button className="btn small" onClick={async () => { try { setDns(await call('mail:dns')); } catch (x: any) { toast.push(x.message, true); } }}>Check SPF, DKIM and DMARC</button>
      {dns && <div className="src-table" style={{ marginTop: 6 }}>{dns.checks.map((c: any) => (
        <div key={c.check} className="src-row"><span className="src-main"><i className="dot" style={{ background: c.ok ? '#16a34a' : '#dc2626' }} /><b>{c.check}</b><span className="muted small">{c.detail}</span></span>{c.fix && <div className="src-fix">{c.fix}</div>}</div>
      ))}<span className="muted small">These records help your email reach inboxes. They cannot guarantee it.</span></div>}
    </>
  );
}
