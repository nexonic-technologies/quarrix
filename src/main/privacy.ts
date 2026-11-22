// What leaves this computer, feature by feature, with the current on/off state (QF-120).
import { load } from './settings';

export function privacySummary() {
  const s = load();
  const row = (feature: string, on: boolean, sends: string, to: string, kept: string) => ({ feature, on, sends, to, kept });
  return [
    row('Business searches', true, 'The business type and place you search for', 'The sources you tick (Google Maps, OpenStreetMap, web search, directories, keyed APIs, open data)', 'Results are saved only in Quarrix\'s database on this computer'),
    row('Website checks', s.enrich.auto, 'Requests to each lead\'s own website (and Google PageSpeed if on)', 'The business\'s website; Google for PageSpeed', 'Findings saved with the lead'),
    row('Writing with AI', s.ai.provider !== 'none', 'Lead facts and your profile, to write emails, research fit and match jobs', s.ai.provider === 'none' ? 'Off' : `${s.ai.provider}${/ollama|lmstudio/i.test(s.ai.provider) ? ' (runs on this computer)' : ''}`, 'Depends on that provider\'s policy; Quarrix keeps the drafts locally'),
    row('Email sending and replies', !!(s.email.smtpUser || s.email.oauthUser), 'Your emails; reading your inbox for replies to them', s.email.auth === 'password' ? `${s.email.smtpHost} / ${s.email.imapHost}` : `${s.email.auth} (OAuth)`, 'Copies of sent emails and replies stay in Quarrix and your mailbox'),
    row('Email verification', s.verify.provider !== 'none', 'The email addresses you check', s.verify.provider, '30-day local cache; the provider\'s own policy applies'),
    row('Job search', true, 'Your keywords and location', 'The job boards and employer hiring systems you choose', 'Seen jobs and alerts saved locally'),
    row('Career exploration', false, 'No data leaves your device', 'None: bundled occupation data', 'Profile inputs are processed locally and not saved by the explorer'),
    row('Job trust checks', false, 'Only requested public job and employer-page URLs', 'The selected public websites', 'Evidence is displayed locally; no CV, credentials or identity documents are sent'),
    row('Company registry lookup', false, 'Legal company name and country code only, on request', 'GLEIF public LEI register', 'Displayed in the current session; no contact details or CV sent'),
    row('Application studio', false, 'No data leaves your device', 'None', 'Application dates, notes, interview practice and drafts stay in the local saved job; application exports include dates and notes but not drafts or practice'),
    row('Market intelligence', false, 'No data leaves your device', 'None', 'Aggregated business records in the selected workspace; CSV export omits individual contact fields'),
    row('Proposal studio', false, 'No data leaves your device', 'None', 'Draft quotations and status saved locally; PDF and Word exports require user action'),
    row('Public opportunities', false, 'Only the fixed recent-notice query when requested', 'Official EU procurement search API', 'Watchlist dates and notes stay in the selected local workspace; official portal links open in your browser'),
    row('CV matching and documents', s.ai.provider !== 'none', 'Your CV text and the job post', s.ai.provider, 'Your CV is stored only on this computer'),
    row('HubSpot, Notion, Google Sheets', !!(s.hubspot?.token || s.notion?.token || s.sheets?.refresh), 'Only the leads you choose to send', 'The tool you send to', 'In that tool, under your account'),
    row('Webhooks', (s.webhooks ?? []).some((w) => w.on), 'Event details, including the lead', (s.webhooks ?? []).filter((w) => w.on).map((w) => { try { return new URL(w.url).host; } catch { return w.url; } }).join(', ') || 'None', 'At the receiving service'),
    row('Local API', !!s.api?.on, 'Nothing leaves the computer', 'Programs on this computer that have the token', '—'),
    row('Updates', true, 'Your app version', 'GitHub (release checks)', '—'),
  ];
}
