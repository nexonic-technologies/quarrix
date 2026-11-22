import { Component, lazy, Suspense,useCallback, useEffect, useState, type ReactNode } from 'react';
import { Compass, Rows3, Send, ArrowDownUp, Settings as Cog, Rocket, Briefcase, LayoutDashboard, Radar, KanbanSquare, BellRing, CheckCircle2, AlertCircle } from 'lucide-react';
import { Logo, Ring, Avatar, RiseText } from './Art';
import { call, onEvent, platform } from './api';
import { Find } from './screens/Find';
import { Outreach } from './screens/Outreach';
import { ImportExport } from './screens/ImportExport';
import { SettingsScreen } from './screens/Settings';
import { Autopilot } from './screens/Autopilot';
import { Dashboard } from './screens/Dashboard';
import { CareerSignals } from './screens/CareerSignals';
import { Pipeline } from './screens/Pipeline';
import { Onboarding } from './screens/Onboarding';
import { OpportunityHome } from './screens/Verified';
import { setLang, t } from './i18n';
import { CAREER, resolveScreen, type Screen } from '../../shared/navigation';
const Leads=lazy(()=>import('./screens/Leads').then(m=>({default:m.Leads})));
const Jobs=lazy(()=>import('./screens/Jobs').then(m=>({default:m.Jobs})));
const Signals=lazy(()=>import('./screens/Signals').then(m=>({default:m.Signals})));

export type { Screen } from '../../shared/navigation';
type Toast = { id: number; text: string; err?: boolean };

let toastId = 0;
export const toast = { push: (_t: string, _err?: boolean) => undefined as void };

export function App() {
  const [screen, setScreen] = useState<Screen>(() => resolveScreen(location.hash));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counts, setCounts] = useState({ drafts: 0, sentToday: 0, cap: 0, signals: 0, jobs: 0 });
  const [tick, setTick] = useState(0);
  const [me, setMe] = useState({ name: '', company: '' });
  const [ws, setWs] = useState<'both' | 'business' | 'career'>('both');
  const [onboard, setOnboard] = useState(false);
  const [, setLangTick] = useState(0);

  toast.push = (text, err) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 7000 : 3500);
  };

  const refreshCounts = useCallback(async () => {
    const [s, cap, sig, jobs] = await Promise.all([call('stats'), call<number>('mail:cap'), call<{ unseen: number }[]>('signals:counts').catch(() => []), call<number>('career:unseen').catch(() => 0)]);
    setCounts({ drafts: s.drafts, sentToday: s.sentToday, cap, signals: sig.reduce((n, x) => n + (x.unseen || 0), 0), jobs });
  }, []);

  useEffect(() => {
    void refreshCounts().catch(() => undefined);
    call('settings:get').then((s) => { setLang(s.language ?? 'en'); setLangTick((n) => n + 1); setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' }); setWs(s.workspace ?? 'both'); if (s.onboarded === false && !s.profile?.name) setOnboard(true); }).catch(() => undefined);
    return onEvent((e, d) => {
      if (e === 'toast') toast.push(String(d));
      if (e === 'drafts' || e === 'leads' || e === 'signals' || e === 'alerts') void refreshCounts().catch(() => undefined);
      setTick((n) => n + 1);
    });
  }, [refreshCounts]);

  const TITLES: Record<Screen, [string, string]> = {
    dashboard: ['Dashboard', 'Leads, outreach and your job hunt, live.'],
    pipeline: ['Pipeline', 'Deals, tasks and what the next months look like.'],
    signals: ['Signals', 'The right moment to reach out: new businesses, broken sites, expiring domains, low ratings and hiring.'],
    find: ['Find businesses', 'Maps, web search, directories and job posts, checked and enriched for you.'],
    leads: ['Leads', 'Everyone you have found or imported, in one place.'],
    autopilot: ['Autopilot', 'Find, check and email new businesses every day, on its own.'],
    jobradar: ['Job signals', 'New jobs that fit your CV, your alerts and the employers you follow, as soon as they appear.'],
    jobs: ['Job search', 'LinkedIn, Indeed, Google Jobs, Rozee and remote boards, matched to your CV.'],
    outreach: ['Outreach', 'Read, tweak and approve. Follow-ups stop when someone replies.'],
    files: ['Import and export', 'Bring in the lists you have, or take your leads anywhere.'],
    settings: ['Settings', 'Your details, mailbox, writing model and sources.'],
  };
  useEffect(() => { call('settings:get').then((s) => setMe({ name: s.profile?.name ?? '', company: s.profile?.company ?? '' })).catch(() => undefined); }, [screen]);
  const go = (s: Screen) => { const next = resolveScreen(s, ws); setScreen(next); history.replaceState(null, '', '#' + next); };
  useEffect(() => { const next = resolveScreen(screen, ws); if (next !== screen) setScreen(next); history.replaceState(null, '', '#' + next); }, [screen, ws]);
  const nav: [Screen, string, typeof Compass, number?][] = [
    ['dashboard', 'Dashboard', LayoutDashboard], ['find', 'Find', Compass], ['leads', 'Leads', Rows3], ['pipeline', 'Pipeline', KanbanSquare], ['signals', 'Signals', Radar, counts.signals], ['jobs', 'Job search', Briefcase], ['jobradar', 'Job signals', BellRing, counts.jobs], ['outreach', 'Outreach', Send, counts.drafts], ['autopilot', 'Autopilot', Rocket],
    ['files', 'Import and export', ArrowDownUp], ['settings', 'Settings', Cog],
  ];
  // Workspaces (QF-116): sales and job-hunting screens can be shown apart.
  const shown = nav.filter(([id]) => ws === 'both' || ['dashboard', 'settings'].includes(id) || (ws === 'career' ? CAREER.includes(id) : !CAREER.includes(id)));
  const switchWs = async (v: typeof ws) => { try { await call('settings:save', { workspace: v }); setWs(v); } catch (e) { toast.push(String(e), true); } };
  const choose = async (v: typeof ws) => { try { await call('settings:save', { workspace:v }); setWs(v); setScreen(v==='career'?'jobs':'find'); } catch(e) { toast.push(String(e),true); } };

  return (
    <div className={`shell ${platform === 'darwin' ? 'mac' : ''}`}>
      <a className="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      {onboard && <Onboarding onDone={(v) => { setOnboard(false); if (v) { setWs(v); if (v === 'career') go('jobs'); else go('find'); } }} />}
      <div className="backdrop" aria-hidden><i /><i /><i /></div>
      <aside className="side">
        <div className="brand"><Logo size={30} /> <span>Quarrix</span></div>
        <div className="ws-switch" role="group" aria-label="Workspace">
          {([['business', 'Business'], ['career', 'Career'], ['both', 'Both']] as const).map(([k, v]) => <button key={k} aria-pressed={ws === k} onClick={() => switchWs(k)}>{t(v)}</button>)}
        </div>
        <nav className="nav" aria-label="Main">
          {(['dashboard', 'business', 'career', 'settings'] as const).map(group => {
            const items = shown.filter(([id]) => group === 'dashboard' ? id === 'dashboard' : group === 'settings' ? ['files', 'settings'].includes(id) : group === 'career' ? CAREER.includes(id) : !['dashboard', 'files', 'settings'].includes(id) && !CAREER.includes(id));
            return items.length ? <div className="nav-group" key={group}>{(group === 'business' || group === 'career') && <div className="side-label">{t(group === 'business' ? 'Business' : 'Career')}</div>}{items.map(([id, label, Icon, n]) => (
            <button key={id} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={16} strokeWidth={1.8} /> {t(label)}
              {n ? <span className="count">{n}</span> : null}
            </button>
          ))}</div> : null;
          })}
        </nav>
        {ws !== 'career' && <div className="side-card">
          <Ring value={counts.sentToday} max={counts.cap} size={48} label={`${counts.sentToday} of ${counts.cap} emails sent today`} />
          <div>
            <b>{counts.sentToday} of {counts.cap}</b>
            <span>emails today</span>
            <small>The limit grows a little each day to protect your mailbox.</small>
          </div>
        </div>}
        <button className="me" onClick={() => go('settings')}>
          <Avatar name={me.name || me.company || 'You'} size={34} />
          <span><b>{me.name || 'Your name'}</b><small>{me.company || 'Add your company'}</small></span>
        </button>
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        <header className="topbar">
          <div className="grow">
            <RiseText as="h1" text={t(TITLES[screen][0])} />
            <p className="fade-in" key={screen}>{TITLES[screen][1]}</p>
          </div>
        </header>
        <div className="screen" key={screen}>
          <ScreenGuard><Suspense fallback={<div className="page" role="status">Loading…</div>}>
          {screen === 'dashboard' && <><div className="page opportunity-entry"><OpportunityHome onChoose={choose} workspace={ws} tick={tick} onLead={id=>{sessionStorage.setItem('quarrix.openLead',String(id));go('leads');}} onJob={id=>{sessionStorage.setItem('quarrix.openJob',id);go('jobs');}}/></div><Dashboard key={ws} workspace={ws} tick={tick} go={go} /></>}
          {screen === 'pipeline' && <Pipeline tick={tick} openLead={(id) => { sessionStorage.setItem('quarrix.openLead', String(id)); go('leads'); }} />}
          {screen === 'signals' && <Signals tick={tick} go={go} />}
          {screen === 'find' && <Find tick={tick} go={go} />}
          {screen === 'leads' && <Leads tick={tick} go={go} />}
          {screen === 'outreach' && <Outreach tick={tick} go={go} />}
          {screen === 'autopilot' && <Autopilot tick={tick} go={go} />}
          {screen === 'jobs' && <Jobs />}
          {screen === 'jobradar' && <CareerSignals tick={tick} go={go} onSeen={refreshCounts} />}
          {screen === 'files' && <ImportExport go={go} />}
          {screen === 'settings' && <SettingsScreen onTheme={() => undefined} />}
          </Suspense></ScreenGuard>
        </div>
      </main>
      <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.err ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{t.text}</span></div>)}</div>
    </div>
  );
}

/** A screen that fails to draw shows what went wrong instead of blanking the whole app; other screens keep working. */
class ScreenGuard extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="panel panel-pad" role="alert" data-screen-error><b>This screen could not be shown.</b><p className="muted small">{this.state.err}</p><button className="btn small" onClick={() => this.setState({ err: '' })}>Try again</button></div>;
  }
}

export function applyTheme(theme: string) {
  void theme; // Quarrix uses one light theme.
  document.documentElement.dataset.theme = 'light';
  return false;
}
