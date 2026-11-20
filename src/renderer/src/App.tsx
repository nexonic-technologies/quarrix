import { useCallback, useEffect, useState } from 'react';
import { Compass, Rows3, Send, ArrowDownUp, Settings as Cog, Rocket, Briefcase, CheckCircle2, AlertCircle } from 'lucide-react';
import { Logo, Ring, Avatar } from './Art';
import { call, onEvent, platform } from './api';
import { Find } from './screens/Find';
import { Leads } from './screens/Leads';
import { Outreach } from './screens/Outreach';
import { ImportExport } from './screens/ImportExport';
import { SettingsScreen } from './screens/Settings';
import { Autopilot } from './screens/Autopilot';
import { Jobs } from './screens/Jobs';

export type Screen = 'find' | 'leads' | 'outreach' | 'autopilot' | 'jobs' | 'files' | 'settings';
type Toast = { id: number; text: string; err?: boolean };

let toastId = 0;
export const toast = { push: (_t: string, _err?: boolean) => undefined as void };

export function App() {
  const [screen, setScreen] = useState<Screen>((location.hash.slice(1) as Screen) || 'find');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counts, setCounts] = useState({ drafts: 0, sentToday: 0, cap: 0 });
  const [tick, setTick] = useState(0);
  const [me, setMe] = useState({ name: '', company: '' });

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
    call('settings:get').then((s) => { setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' }); }).catch(() => undefined);
    return onEvent((e, d) => {
      if (e === 'toast') toast.push(String(d));
      if (e === 'drafts' || e === 'leads') void refreshCounts();
      setTick((n) => n + 1);
    });
  }, [refreshCounts]);

  const TITLES: Record<Screen, [string, string]> = {
    find: ['Find businesses', 'Maps, web search, directories and job posts, checked and enriched for you.'],
    leads: ['Leads', 'Everyone you have found or imported, in one place.'],
    autopilot: ['Autopilot', 'Find, check and email new businesses every day, on its own.'],
    jobs: ['Job search', 'LinkedIn, Indeed, Google Jobs, Rozee and remote boards, matched to your CV.'],
    outreach: ['Outreach', 'Read, tweak and approve. Follow-ups stop when someone replies.'],
    files: ['Import and export', 'Bring in the lists you have, or take your leads anywhere.'],
    settings: ['Settings', 'Your details, mailbox, writing model and sources.'],
  };
  useEffect(() => { call('settings:get').then((s) => setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' })).catch(() => undefined); }, [screen]);
  const go = (s: Screen) => { setScreen(s); history.replaceState(null, '', '#' + s); };
  const nav: [Screen, string, typeof Compass, number?][] = [
    ['find', 'Find', Compass], ['leads', 'Leads', Rows3], ['jobs', 'Job search', Briefcase], ['outreach', 'Outreach', Send, counts.drafts], ['autopilot', 'Autopilot', Rocket],
    ['files', 'Import and export', ArrowDownUp], ['settings', 'Settings', Cog],
  ];

  return (
    <div className={`shell ${platform === 'darwin' ? 'mac' : ''}`}>
      <div className="backdrop" aria-hidden><i /><i /><i /></div>
      <aside className="side">
        <div className="brand"><Logo size={30} /> <span>Quarrix</span></div>
        <div className="side-label">Main</div>
        <nav className="nav" aria-label="Main">
          {nav.map(([id, label, Icon, n]) => (
            <button key={id} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={16} strokeWidth={1.8} /> {label}
              {n ? <span className="count">{n}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-card">
          <Ring value={counts.sentToday} max={counts.cap} size={48} label={`${counts.sentToday} of ${counts.cap} emails sent today`} />
          <div>
            <b>{counts.sentToday} of {counts.cap}</b>
            <span>emails today</span>
            <small>The limit grows a little each day to protect your mailbox.</small>
          </div>
        </div>
        <button className="me" onClick={() => go('settings')}>
          <Avatar name={me.name || me.company || 'You'} size={34} />
          <span><b>{me.name || 'Your name'}</b><small>{me.company || 'Add your company'}</small></span>
        </button>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="grow">
            <h1>{TITLES[screen][0]}</h1>
            <p>{TITLES[screen][1]}</p>
          </div>
        </header>
        <div className="screen" key={screen}>
          {screen === 'find' && <Find tick={tick} go={go} />}
          {screen === 'leads' && <Leads tick={tick} go={go} />}
          {screen === 'outreach' && <Outreach tick={tick} go={go} />}
          {screen === 'autopilot' && <Autopilot tick={tick} go={go} />}
          {screen === 'jobs' && <Jobs />}
          {screen === 'files' && <ImportExport go={go} />}
          {screen === 'settings' && <SettingsScreen onTheme={() => undefined} />}
        </div>
      </main>
      <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.err ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{t.text}</span></div>)}</div>
    </div>
  );
}

export function applyTheme(theme: string) {
  void theme; // Quarrix uses one light theme.
  document.documentElement.dataset.theme = 'light';
  return false;
}
