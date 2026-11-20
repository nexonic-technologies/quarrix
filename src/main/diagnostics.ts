// Diagnostics file for support (QF-124): versions, settings without secrets, source health and recent errors, all redacted.
import { app } from 'electron';
import { writeFileSync } from 'node:fs';
import * as db from './db';
import { checkSources } from './health';
import { redact } from './safety';
import { publicSettings } from './settings';

export async function writeDiagnostics(path: string) {
  const r = db.raw();
  const report = {
    app: { name: 'Quarrix', version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, platform: `${process.platform} ${process.arch}`, locale: app.getLocale() },
    created: new Date().toISOString(),
    counts: Object.fromEntries(['leads', 'messages', 'deals', 'tasks', 'replies', 'signals', 'searches', 'job_seen'].map((t) => { try { return [t, (r.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n]; } catch { return [t, null]; } })),
    settings: publicSettings(),
    sources: await checkSources().catch((e) => String(e)),
    usageToday: db.usageToday(),
    searches: r.prepare("SELECT id, created_at, category, place, sources, status, found, added, error FROM searches ORDER BY id DESC LIMIT 30").all(),
    failedEmails: r.prepare("SELECT id, step, error, created_at FROM messages WHERE status = 'failed' ORDER BY id DESC LIMIT 30").all(),
    errors: r.prepare("SELECT at, type, detail FROM events WHERE type IN ('error','automation_error','bounce','complaint') ORDER BY id DESC LIMIT 50").all(),
    webhooks: (() => { try { return r.prepare('SELECT at, event, status, error FROM webhook_log ORDER BY id DESC LIMIT 30').all(); } catch { return []; } })(),
    schema: r.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all(),
  };
  const text = redact(JSON.stringify(report, null, 2));
  writeFileSync(path, text);
  return text.length;
}
