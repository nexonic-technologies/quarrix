export const SCREENS = ['dashboard', 'pipeline', 'signals', 'find', 'leads', 'outreach', 'autopilot', 'jobs', 'jobradar', 'files', 'settings'] as const;
export type Screen = typeof SCREENS[number];
export type Workspace = 'both' | 'business' | 'career';
export const CAREER: Screen[] = ['jobs', 'jobradar'];
export function resolveScreen(hash: string, workspace: Workspace = 'both'): Screen {
  const screen = hash.replace(/^#/, '') as Screen;
  if (!SCREENS.includes(screen)) return 'dashboard';
  if (screen === 'dashboard' || screen === 'settings' || workspace === 'both') return screen;
  return workspace === 'career' ? CAREER.includes(screen) ? screen : 'jobs' : CAREER.includes(screen) ? 'dashboard' : screen;
}
