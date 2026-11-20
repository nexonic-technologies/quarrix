import { useCallback, useEffect, useState } from 'react';
import { Compass, Rows3, Send, ArrowDownUp, Settings as Cog, Sun, Moon, CheckCircle2, AlertCircle } from 'lucide-react';
import { Logo, Ring, Avatar } from './Art';
import { call, onEvent, platform } from './api';
import { Find } from './screens/Find';
import { Leads } from './screens/Leads';
import { Outreach } from './screens/Outreach';
import { ImportExport } from './screens/ImportExport';
import { SettingsScreen } from './screens/Settings';

export type Screen = 'find' | 'leads' | 'outreach' | 'files' | 'settings';
type Toast = { id: number; text: string; err?: boolean };

let toastId = 0;
export const toast = { push: (_t: string, _err?: boolean) => undefined as void };

export function App() {
  const [screen, setScreen] = useState<Screen>((location.hash.slice(1) as Screen) || 'find');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counts, setCounts] = useState({ drafts: 0, sentToday: 0, cap: 0 });
  const [tick, setTick] = useState(0);
  const [me, setMe] = useState({ name: '', company: '' });
  const [dark, setDark] = useState(false);

  toast.push = (text, err) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 7000 : 3500);
  };

  const refreshCounts = useCallback(async () => {
    const [s, cap] = await Promise.all([call('stats'), call<number>('mail:cap')]);
    setCounts({ drafts: s.drafts, sentToday: s.sentToday, cap });
  }, []);

  useEffect(() => {
    void refreshCounts();
    call('settings:get').then((s) => { setDark(applyTheme(s.theme)); setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' }); }).catch(() => undefined);
    return onEvent((e, d) => {
      if (e === 'toast') toast.push(String(d));
      if (e === 'drafts' || e === 'leads') void refreshCounts();
      setTick((n) => n + 1);
    });
  }, [refreshCounts]);

  const flipTheme = async () => {
    const next = dark ? 'light' : 'dark';
    setDark(applyTheme(next));
    try { const s = await call('settings:get'); await call('settings:save', { ...s, theme: next }); } catch { /* preview */ }
  };
  const TITLES: Record<Screen, [string, string]> = {
    find: ['Find businesses', 'Search maps and open data, then let Quarrix fill in the details.'],
    leads: ['Leads', 'Everyone you have found or imported, in one place.'],
    outreach: ['Outreach', 'Read, tweak and approve. Follow-ups stop when someone replies.'],
    files: ['Import and export', 'Bring in the lists you have, or take your leads anywhere.'],
    settings: ['Settings', 'Your details, mailbox, writing model and sources.'],
  };
  useEffect(() => { call('settings:get').then((s) => setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' })).catch(() => undefined); }, [screen]);
  const go = (s: Screen) => { setScreen(s); history.replaceState(null, '', '#' + s); };
  const nav: [Screen, string, typeof Compass, number?][] = [
    ['find', 'Find', Compass], ['leads', 'Leads', Rows3], ['outreach', 'Outreach', Send, counts.drafts],
    ['files', 'Import and export', ArrowDownUp], ['settings', 'Settings', Cog],
  ];

  return (
    <div className={`shell ${platform === 'darwin' ? 'mac' : ''}`}>
      <div className="backdrop" aria-hidden><i /><i /><i /></div>
      <aside className="side">
        <div className="brand"><Logo /> <span>Quarrix</span></div>
        <div className="side-label">Workspace</div>
        <nav className="nav" aria-label="Main">
          {nav.map(([id, label, Icon, n]) => (
            <button key={id} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={18} strokeWidth={1.8} /> {label}
              {n ? <span className="count">{n}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-card">
          <Ring value={counts.sentToday} max={counts.cap} size={58} label={`${counts.sentToday} of ${counts.cap} emails sent today`} />
          <div>
            <b>{counts.sentToday} of {counts.cap}</b>
            <span>emails today</span>
            <small>The limit grows a little each day to protect your mailbox.</small>
          </div>
        </div>
        <button className="me" onClick={() => go('settings')}>
          <Avatar name={me.name || me.company || 'You'} size={38} />
          <span><b>{me.name || 'Your name'}</b><small>{me.company || 'Add your company'}</small></span>
        </button>
      </aside>
      <main className="main">
        <header className="top">
          <div className="grow">
            <h1>{TITLES[screen][0]}</h1>
            <p>{TITLES[screen][1]}</p>
          </div>
          <button className="theme-flip" onClick={flipTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
            <span className={dark ? 'on' : ''}><Sun size={15} /><Moon size={15} /></span>
          </button>
        </header>
        <div className="screen" key={screen}>
          {screen === 'find' && <Find tick={tick} go={go} />}
          {screen === 'leads' && <Leads tick={tick} go={go} />}
          {screen === 'outreach' && <Outreach tick={tick} go={go} />}
          {screen === 'files' && <ImportExport go={go} />}
          {screen === 'settings' && <SettingsScreen onTheme={(t) => setDark(applyTheme(t))} />}
        </div>
      </main>
      <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.err ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{t.text}</span></div>)}</div>
    </div>
  );
}

export function applyTheme(theme: string) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  return dark;
}
