import { useEffect, useState } from 'react';
import { call } from '../api';
import { toast } from '../App';

const SECTIONS = [['profile', 'You and your offer'], ['writing', 'Writing'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['sources', 'Sources'], ['dnc', 'Do not contact'], ['app', 'Appearance']] as const;

export function SettingsScreen({ onTheme }: { onTheme: (t: string) => void }) {
  const [s, setS] = useState<any>(null);
  const [sec, setSec] = useState<(typeof SECTIONS)[number][0]>('profile');
  const [info, setInfo] = useState<any>(null);
  const [models, setModels] = useState<string[]>([]);
  const [dnc, setDnc] = useState<any[]>([]);
  const [dncNew, setDncNew] = useState('');
  const [testTo, setTestTo] = useState('');
  useEffect(() => { call('settings:get').then(setS); call('app:info').then(setInfo); call('dnc:list').then(setDnc); }, []);
  if (!s) return null;

  const set = (path: string, v: unknown) => setS((o: any) => { const n = structuredClone(o); const ks = path.split('.'); const last = ks.pop()!; ks.reduce((a, k) => a[k], n)[last] = v; return n; });
  const save = async () => { const r = await call('settings:save', s); setS(r); onTheme(r.theme); toast.push('Settings saved'); };
  const T = (path: string, label: string, help = '', type = 'text') => {
    const v = path.split('.').reduce((a: any, k) => a[k], s);
    return <label className="field"><span>{label}</span><input className="input" type={type} value={v ?? ''} onChange={(e) => set(path, type === 'number' ? Number(e.target.value) : e.target.value)} />{help && <small>{help}</small>}</label>;
  };
  const S = (path: string, label: string) => {
    const v = path.split('.').reduce((a: any, k) => a[k], s);
    return <label className="switch"><input type="checkbox" checked={!!v} onChange={(e) => set(path, e.target.checked)} /> {label}</label>;
  };
  const providers = info?.providers ?? {};
  const prov = providers[s.ai.provider];

  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Settings</h1><p>Everything is stored on this computer. Passwords and keys are encrypted with your system keychain.</p></div><button className="btn primary" onClick={save}>Save settings</button></div>
      <div className="settings">
        <nav>{SECTIONS.map(([k, v]) => <button key={k} aria-current={sec === k} onClick={() => setSec(k)}>{v}</button>)}</nav>
        <div className="panel panel-pad">
          {sec === 'profile' && <section>
            <div className="grid2">{T('profile.name', 'Your name')}{T('profile.title', 'Your title')}{T('profile.company', 'Company')}{T('profile.website', 'Website')}{T('profile.phone', 'Phone or WhatsApp')}{T('profile.language', 'Email language')}</div>
            {T('profile.address', 'Postal address', 'Shown under every email. US and Canadian law require a real postal address in sales emails.')}
            <label className="field"><span>What you offer</span><textarea className="input" rows={5} value={s.profile.services} onChange={(e) => set('profile.services', e.target.value)} /><small>A few sentences in your own words. Emails only use what you write here, so keep it true and specific.</small></label>
            {T('profile.tone', 'Tone of voice', 'For example: friendly and professional, short and direct.')}
          </section>}

          {sec === 'writing' && <section>
            <label className="field"><span>Writing model</span>
              <select className="select" value={s.ai.provider} onChange={(e) => { set('ai.provider', e.target.value); set('ai.model', ''); setModels([]); }}>
                <option value="none">None: use built-in templates</option>
                {Object.entries(providers).filter(([k]) => k !== 'none').map(([k, p]: any) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <small>{s.ai.provider === 'none' ? 'Emails are filled in from a template with each business\'s details. Add a model for fully personal emails.' : prov?.local ? 'Runs on this computer for free. Install it, download a model, and keep it open while you write emails.' : 'Uses your own key. You pay the provider directly, usually a fraction of a cent per email.'}</small>
            </label>
            {s.ai.provider !== 'none' && <>
              {prov?.keyed && T('ai.apiKey', 'API key', '', 'password')}
              {(s.ai.provider === 'custom' || prov?.local) && T('ai.baseUrl', 'Server address', prov?.local ? 'Leave empty to use the standard address.' : 'For example https://api.example.com/v1')}
              <label className="field"><span>Model</span>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" list="models" value={s.ai.model} placeholder={prov?.suggest || 'model name'} onChange={(e) => set('ai.model', e.target.value)} />
                  <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
                  <button className="btn" onClick={async () => { await save(); try { const m = await call<string[]>('ai:models'); setModels(m); toast.push(`${m.length} models available`); } catch (e: any) { toast.push(e.message, true); } }}>Load models</button>
                </div>
              </label>
            </>}
          </section>}

          {sec === 'email' && <section>
            <label className="field"><span>Mailbox</span>
              <select className="select" value={s.email.preset} onChange={(e) => {
                const p = e.target.value; set('email.preset', p);
                if (p === 'gmail') { set('email.smtpHost', 'smtp.gmail.com'); set('email.imapHost', 'imap.gmail.com'); }
                if (p === 'outlook') { set('email.smtpHost', 'smtp.office365.com'); set('email.imapHost', 'outlook.office365.com'); }
                set('email.smtpPort', 587); set('email.smtpSecure', false); set('email.imapPort', 993);
              }}><option value="gmail">Gmail or Google Workspace</option><option value="outlook">Outlook or Microsoft 365</option><option value="custom">Other email server</option></select>
            </label>
            {s.email.preset !== 'custom' && <div className="note">Use an app password, not your normal password. {s.email.preset === 'gmail' ? 'Google Account → Security → 2-Step Verification → App passwords.' : 'Microsoft account → Security → Advanced security options → App passwords.'}</div>}
            <div className="grid2">
              {T('email.smtpUser', 'Login (your email address)')}{T('email.smtpPass', 'App password', '', 'password')}
              {T('email.fromName', 'Sender name', 'Shown to the people you email.')}{T('email.fromEmail', 'Send from', 'Leave empty to send from the login address.')}
            </div>
            {s.email.preset === 'custom' && <div className="grid3">{T('email.smtpHost', 'SMTP server')}{T('email.smtpPort', 'Port', '', 'number')}<div style={{ alignSelf: 'end', paddingBottom: 8 }}>{S('email.smtpSecure', 'SSL on connect')}</div></div>}
            <div className="row">
              <button className="btn" onClick={async () => { await save(); try { toast.push(await call('mail:test')); } catch (e: any) { toast.push(e.message, true); } }}>Test the connection</button>
              <input className="input" style={{ maxWidth: 240 }} placeholder="Send a test to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button className="btn" disabled={!testTo} onClick={async () => { await save(); try { await call('mail:testSend', testTo); toast.push('Test email sent'); } catch (e: any) { toast.push(e.message, true); } }}>Send test</button>
            </div>
            <h2 style={{ marginTop: 10 }}>Pace</h2>
            <div className="grid3">{T('email.warmStart', 'Start with (per day)', '', 'number')}{T('email.warmStep', 'Add each day', '', 'number')}{T('email.dailyLimit', 'Maximum per day', 'Up to 40 is safe for one mailbox.', 'number')}
              {T('email.gapMinutes', 'Minutes between emails', '', 'number')}{T('email.windowStart', 'Send from (hour)', 'In the recipient\'s time.', 'number')}{T('email.windowEnd', 'Until (hour)', '', 'number')}</div>
            <label className="field"><span>Follow-ups after (days, comma separated)</span><input className="input" value={s.email.followups.join(', ')} onChange={(e) => set('email.followups', e.target.value.split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0).slice(0, 4))} /><small>Two follow-ups after 3 and 7 days works well. Leave empty for no follow-ups.</small></label>
            <div className="row">{S('email.weekdaysOnly', 'Monday to Friday only')}{S('email.unsubscribeLine', 'Add an opt-out line under every email')}</div>
            <h2 style={{ marginTop: 10 }}>Replies</h2>
            {S('email.imapOn', 'Watch my inbox for replies and bounces (stops follow-ups automatically)')}
            {s.email.imapOn && <div className="grid2">{T('email.imapUser', 'Login')}{T('email.imapPass', 'App password', '', 'password')}{s.email.preset === 'custom' && <>{T('email.imapHost', 'IMAP server')}{T('email.imapPort', 'Port', '', 'number')}</>}</div>}
          </section>}

          {sec === 'whatsapp' && <section>
            <label className="field"><span>How to send</span>
              <select className="select" value={s.whatsapp.mode} onChange={(e) => set('whatsapp.mode', e.target.value)}>
                <option value="assisted">Open WhatsApp with the message ready (you press Send)</option>
                <option value="cloud">WhatsApp Business Cloud API (official, for contacts who opted in)</option>
              </select>
            </label>
            <div className="note">Quarrix never controls your personal WhatsApp account. WhatsApp bans numbers that send automated messages to people who did not ask for them. The first option is safe for any number; the Cloud API is Meta's official route.</div>
            {T('whatsapp.defaultCountry', 'Default country code', 'Used when a phone number has no country code, for example US, GB, CA.')}
            {s.whatsapp.mode === 'cloud' && <div className="grid2">{T('whatsapp.cloudToken', 'Access token', '', 'password')}{T('whatsapp.phoneNumberId', 'Phone number ID')}</div>}
          </section>}

          {sec === 'sources' && <section>
            {S('sources.googleMaps', 'Google Maps (free, runs in a hidden window at a human pace)')}
            {S('sources.osm', 'OpenStreetMap (free, open data)')}
            {T('sources.placesKey', 'Google Places API key', 'Optional. Google Cloud → enable "Places API (New)" → create a key.', 'password')}
            <div className="grid2">{T('sources.maxPerSearch', 'Most businesses per search', '', 'number')}{T('sources.mapsDelayMs', 'Pause between Google Maps places (ms)', 'Higher is gentler. Google may ask for a captcha if this is too low.', 'number')}</div>
            <h2 style={{ marginTop: 10 }}>Website check</h2>
            {S('enrich.auto', 'Visit each new business\'s website for emails, phones and social links')}
            {S('enrich.audit', 'Also run Google PageSpeed (slower; adds a speed score)')}
            {T('sources.pagespeedKey', 'PageSpeed API key', 'Optional but recommended for more than a few checks a day.', 'password')}
            <div className="note">Use what you collect responsibly: email businesses about their business, honour every opt-out, and follow the rules in the countries you contact.</div>
          </section>}

          {sec === 'dnc' && <section>
            <p className="muted" style={{ margin: 0 }}>Emails or whole domains that Quarrix will never contact. Opt-outs and bounces are added automatically.</p>
            <div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" placeholder="name@company.com or company.com" value={dncNew} onChange={(e) => setDncNew(e.target.value)} /><button className="btn" onClick={async () => { await call('dnc:add', dncNew); setDncNew(''); setDnc(await call('dnc:list')); }}>Add</button></div>
            <div className="timeline">{dnc.length ? dnc.map((d) => <div key={d.value}><span>{d.value}</span><span>{d.reason} <button className="btn small ghost" onClick={async () => { await call('dnc:remove', d.value); setDnc(await call('dnc:list')); }}>Remove</button></span></div>) : <span className="muted">Empty</span>}</div>
          </section>}

          {sec === 'app' && <section>
            <label className="field"><span>Theme</span><select className="select" value={s.theme} onChange={(e) => set('theme', e.target.value)}><option value="system">Match my computer</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <p className="muted">Quarrix {info?.version}. Your data is in {info?.dataPath}.</p>
          </section>}
        </div>
      </div>
    </div>
  );
}
