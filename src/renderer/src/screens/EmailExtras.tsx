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
      <p className="muted small">Uses your own OAuth apps, so your mail never passes through anyone else. Google and Microsoft are set up separately.</p>
      <p className="muted small"><b>Google:</b> Google Cloud Console → APIs → Credentials → Create OAuth client ID → Desktop app (enable the Gmail API; Sheets uses the same client).</p>
      <div className="grid2">
        <label className="field"><span>Google client ID</span><input className="input" value={e.googleClientId ?? ''} onChange={(x) => set('email.googleClientId', x.target.value.trim())} /></label>
        <label className="field"><span>Google client secret</span><input className="input" type="password" value={e.googleClientSecret ?? ''} onChange={(x) => set('email.googleClientSecret', x.target.value.trim())} /></label>
      </div>
      <p className="muted small"><b>Microsoft:</b> Azure portal → App registrations → New → "Mobile and desktop" redirect http://localhost, allow public client flows, then add the SMTP.Send and IMAP.AccessAsUser.All permissions.</p>
      <div className="grid2">
        <label className="field"><span>Microsoft application (client) ID</span><input className="input" value={e.msClientId ?? ''} onChange={(x) => set('email.msClientId', x.target.value.trim())} /></label>
        <label className="field"><span>Tenant (common, organizations or your tenant ID)</span><input className="input" value={e.msTenant ?? 'common'} onChange={(x) => set('email.msTenant', x.target.value.trim())} /></label>
      </div>
      <div className="row"><button className="btn" disabled={busy || !e.googleClientId} onClick={() => go('google')}>Sign in with Google</button><button className="btn" disabled={busy || !e.msClientId} onClick={() => go('microsoft')}>Sign in with Microsoft</button></div>
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

const newBox = () => ({ id: Math.random().toString(36).slice(2, 9), label: 'Mailbox', kind: 'smtp', on: true, fromName: '', fromEmail: '', smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', imapOn: false, imapHost: '', imapPort: 993, imapUser: '', imapPass: '', oauthRefresh: '', sendgridKey: '', dailyLimit: 30, authorizedAt: '', authorizedFrom: '' });

/** More sending mailboxes (QF-061, QF-075), the A/B subject test (QF-071) and the inbox placement test (QF-070). */
export function MoreMailboxes({ s, set, save }: { s: any; set: (p: string, v: unknown) => void; save: () => Promise<void> }) {
  const list: any[] = s.mailboxes ?? [];
  const [stats, setStats] = useState<any[]>([]);
  const [tester, setTester] = useState('');
  const reload = () => call<any[]>('mailboxes:stats').then((x) => setStats(x ?? []));
  useEffect(() => { void reload(); }, []);
  const put = (i: number, k: string, v: unknown) => set('mailboxes', list.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const st = (id: string) => stats.find((x) => x.id === id);
  return (
    <>
      <h2 style={{ marginTop: 10 }}>More mailboxes</h2>
      <p className="muted small" style={{ margin: 0 }}>Spread sending across several addresses. Each approved mailbox gets its own warm-up and daily limit; each lead's whole sequence goes out from one mailbox, and replies from every mailbox land in Outreach → Replies.</p>
      {list.map((b, i) => (
        <div key={b.id} className="panel panel-pad feed">
          <div className="row" style={{ gap: 6 }}>
            <input className="input" value={b.label} onChange={(e) => put(i, 'label', e.target.value)} aria-label="Name" />
            <select className="input" value={b.kind} onChange={(e) => put(i, 'kind', e.target.value)} aria-label="Type"><option value="smtp">Email server (app password)</option><option value="google">Google (sign in)</option><option value="microsoft">Microsoft (sign in)</option><option value="sendgrid">SendGrid API</option></select>
            <label className="switch"><input type="checkbox" checked={b.on} onChange={(e) => put(i, 'on', e.target.checked)} /> On</label>
            <button className="btn small ghost" aria-label="Remove mailbox" onClick={() => set('mailboxes', list.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
          </div>
          <div className="grid3">
            <label className="field"><span>Sender name</span><input className="input" value={b.fromName} onChange={(e) => put(i, 'fromName', e.target.value)} /></label>
            <label className="field"><span>Send from</span><input className="input" value={b.fromEmail} onChange={(e) => put(i, 'fromEmail', e.target.value.trim())} /></label>
            <label className="field"><span>Most per day</span><input className="input" type="number" min={1} max={500} value={b.dailyLimit} onChange={(e) => put(i, 'dailyLimit', Number(e.target.value))} /></label>
          </div>
          {b.kind === 'smtp' && <div className="grid3">
            {([['smtpHost', 'SMTP server'], ['smtpPort', 'Port'], ['smtpUser', 'Login'], ['smtpPass', 'App password'], ['imapHost', 'IMAP server (replies)'], ['imapPass', 'IMAP password']] as const).map(([k, l]) => (
              <label key={k} className="field"><span>{l}</span><input className="input" type={/Pass/.test(k) ? 'password' : k === 'smtpPort' ? 'number' : 'text'} value={b[k] ?? ''} onChange={(e) => put(i, k, k === 'smtpPort' ? Number(e.target.value) : e.target.value)} /></label>))}
          </div>}
          {b.kind === 'sendgrid' && <label className="field"><span>SendGrid API key</span><input className="input" type="password" value={b.sendgridKey} onChange={(e) => put(i, 'sendgridKey', e.target.value.trim())} /><small>SendGrid → Settings → API Keys (Mail Send). Verify the sending address in SendGrid first. Replies go to your normal inbox.</small></label>}
          {(b.kind === 'google' || b.kind === 'microsoft') && <div className="row" style={{ gap: 6 }}><button className="btn small" onClick={async () => { await save(); try { toast.push(`Connected as ${await call('mailboxes:connect', b.id, b.kind)}`); } catch (e: any) { toast.push(e.message, true); } }}>{b.smtpUser ? `Reconnect (${b.smtpUser})` : `Sign in with ${b.kind === 'google' ? 'Google' : 'Microsoft'}`}</button><span className="muted small">Uses the OAuth client set above.</span></div>}
          {b.kind !== 'sendgrid' && <label className="switch"><input type="checkbox" checked={b.imapOn} onChange={(e) => put(i, 'imapOn', e.target.checked)} /> Read this inbox for replies and bounces</label>}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small ghost" onClick={async () => { await save(); try { toast.push(await call('mail:test', b.id)); } catch (e: any) { toast.push(e.message, true); } }}>Test</button>
            {st(b.id)?.approved ? <button className="btn small ghost" onClick={async () => { await call('mailboxes:authorize', b.id, false); void reload(); }}>Turn off sending</button>
              : <button className="btn small primary" onClick={async () => { await save(); await call('mailboxes:authorize', b.id, true); void reload(); toast.push('Sending approved for this mailbox'); }}>Approve sending from {b.fromEmail || 'this address'}</button>}
            {st(b.id) && <span className="muted small">{st(b.id).sentToday} of {st(b.id).cap} today · {st(b.id).sent} sent · {st(b.id).replies} replied</span>}
          </div>
        </div>
      ))}
      <button className="btn small" onClick={() => set('mailboxes', [...list, newBox()])}><Plus size={13} /> Add a mailbox</button>

      <h2 style={{ marginTop: 14 }}>Subject line test</h2>
      <label className="switch"><input type="checkbox" checked={!!s.email.abTest} onChange={(e) => set('email.abTest', e.target.checked)} /> Test two subject lines (every second lead gets version B)</label>
      {s.email.abTest && <label className="field"><span>Version B subject (optional)</span><input className="input" value={s.email.abSubjectB ?? ''} onChange={(e) => set('email.abSubjectB', e.target.value)} placeholder="Leave empty to let Quarrix write one. {name} and {domain} are filled in." /><small>Outreach shows which version gets more replies once both have 30 sends.</small></label>}

      <h2 style={{ marginTop: 14 }}>Inbox placement test</h2>
      <p className="muted small" style={{ margin: 0 }}>Open mail-tester.com, copy the address it shows, paste it here and send. Quarrix sends your latest draft to it and opens the score page.</p>
      <div className="row" style={{ gap: 6 }}><input className="input" placeholder="test-abc123@srv1.mail-tester.com" value={tester} onChange={(e) => setTester(e.target.value)} />
        <button className="btn small" onClick={() => void call('open:external', 'https://www.mail-tester.com')}>Open mail-tester.com</button>
        <button className="btn small primary" disabled={!tester} onClick={async () => { await save(); try { const url = await call<string>('mail:placement', tester, 'main'); toast.push('Sent. Opening your score in 10 seconds…'); setTimeout(() => void call('open:external', url), 10000); } catch (e: any) { toast.push(e.message, true); } }}>Send the test</button></div>
    </>
  );
}
