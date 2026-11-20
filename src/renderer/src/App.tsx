import { useCallback, useEffect, useState } from 'react';
import { Compass, Rows3, Send, ArrowDownUp, Settings as Cog } from 'lucide-react';
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
    call('settings:get').then((s) => applyTheme(s.theme)).catch(() => undefined);
    return onEvent((e, d) => {
      if (e === 'toast') toast.push(String(d));
      if (e === 'drafts' || e === 'leads') void refreshCounts();
      setTick((n) => n + 1);
    });
  }, [refreshCounts]);

  const go = (s: Screen) => { setScreen(s); history.replaceState(null, '', '#' + s); };
  const nav: [Screen, string, typeof Compass, number?][] = [
    ['find', 'Find', Compass], ['leads', 'Leads', Rows3], ['outreach', 'Outreach', Send, counts.drafts],
    ['files', 'Import and export', ArrowDownUp], ['settings', 'Settings', Cog],
  ];

  return (
    <div className={`shell ${platform === 'darwin' ? 'mac' : ''}`}>
      <aside className="side">
        <div className="brand">quarrix<i /></div>
        <nav className="nav" aria-label="Main">
          {nav.map(([id, label, Icon, n]) => (
            <button key={id} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={17} strokeWidth={1.8} /> {label}
              {n ? <span className="count">{n}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          Emails today: {counts.sentToday} of {counts.cap}
          <div className="meter"><i style={{ width: `${Math.min(100, (counts.sentToday / Math.max(1, counts.cap)) * 100)}%` }} /></div>
          The limit grows a little each day to protect your mailbox.
        </div>
      </aside>
      <main className="main">
        {screen === 'find' && <Find tick={tick} go={go} />}
        {screen === 'leads' && <Leads tick={tick} go={go} />}
        {screen === 'outreach' && <Outreach tick={tick} go={go} />}
        {screen === 'files' && <ImportExport go={go} />}
        {screen === 'settings' && <SettingsScreen onTheme={applyTheme} />}
      </main>
      <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.text}</div>)}</div>
    </div>
  );
}

export function applyTheme(theme: string) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
