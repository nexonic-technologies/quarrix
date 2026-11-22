// Live provider checks (0.22). Runs the app's own source code against the real public services, keyless only, from CI
// (which has internet access) on every release. Results are a report, not a gate: a provider outage must not block a release,
// and nothing here is presented as passing unless the real service answered with real data.
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import * as jobstore from '../../src/main/jobstore';
import { geocode, searchOsm } from '../../src/main/sources/osm';
import { searchWikidata, searchNpi } from '../../src/main/sources/opendata';
import { companyFacts } from '../../src/main/sources/companyfacts';
import { searchOverture } from '../../src/main/sources/overture';
import { detectAts, employerJobs, hnHiring } from '../../src/main/ats';
import { searchJobs } from '../../src/main/jobsearch';
import { checkDomain } from '../../src/main/deliverability';
import { fetchText } from '../../src/main/util';
import { previewSearch } from '../../src/main/jobs';
import { checkSources } from '../../src/main/health';
import { searchTed } from '../../src/main/public-opportunities';
import { registryLookup } from '../../src/main/registry';
import { officialWages,secLookup } from '../../src/main/global-data';

type R = { check: string; qf: string; ok: boolean; detail: string; ms: number; kind?: 'outage' | 'failure' };
/** A provider that is busy, rate-limiting or unreachable is a temporary outage, not a defect in Quarrix. */
const OUTAGE = /busy|HTTP (408|425|429|5\d\d)|timed? ?out|aborted|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|no answer|socket hang up|temporarily/i;
const out: R[] = [];
const run = async (check: string, qf: string, fn: () => Promise<string>) => {
  const t = Date.now();
  try { out.push({ check, qf, ok: true, detail: (await fn()).slice(0, 200), ms: Date.now() - t }); } catch (e: any) { const d = String(e?.message ?? e).slice(0, 200); out.push({ check, qf, ok: false, detail: d, ms: Date.now() - t, kind: OUTAGE.test(d) ? 'outage' : 'failure' }); }
};
const need = (n: number, what: string) => { if (n <= 0) throw new Error(`no ${what} returned`); return `${n} ${what}`; };
const noop = () => undefined;

(async () => {
  const dir = process.env.QUARRIX_TEST_DIR!;
  db.openDb(join(dir, 'quarrix.db')); db.migrateData(); crm.migrate(); jobstore.migrate();
  await run('EU official contract notices (TED)', 'Public opportunities', async()=>need((await searchTed(1)).notices.length,'standard contract notices'));
  await run('GLEIF legal entity register','Verified opportunities',async()=>need((await registryLookup('Apple Inc.','US')).matches.length,'exact legal name and country candidates'));
  await run('BLS hourly earnings','Global data',async()=>need((await officialWages()).length,'monthly observations'));
  await run('SEC operating entity','Global data',async()=>{const r=await secLookup('320193');return `${r.name} ${r.cik}`;});
  await run('OpenStreetMap geocoding (Nominatim)', 'QF-015', async () => { const p = await geocode('Austin, Texas'); if (!p) throw new Error('not found'); return `${p.label} ${p.lat.toFixed(2)},${p.lon.toFixed(2)}`; });
  await run('OpenStreetMap businesses (Overpass)', 'QF-002', async () => need((await searchOsm('dentist', 'Austin, Texas', 10)).length, 'dentists'));
  await run('Wikidata business source', 'QF-009', async () => need((await searchWikidata('hospital', 'London', 10, noop)).length, 'hospitals'));
  await run('Company size and growth (Wikidata)', 'QF-028', async () => { const f: any = await companyFacts('stripe.com'); if (!f) throw new Error('no facts'); return JSON.stringify(f).slice(0, 150); });
  await run('NPI registry (US healthcare)', 'QF-002', async () => need((await searchNpi('dentist', 'Austin', 'TX', 10, noop)).length, 'providers'));
  await run('Overture Maps release files', 'QF-005', async () => need((await searchOverture('dentist', { s: 30.25, n: 30.30, w: -97.76, e: -97.72 }, 10, noop, 6)).length, 'places from Overture'));
  await run('Email domain checks (SPF/DKIM/DMARC)', 'QF-067', async () => { const r: any = await checkDomain('google.com'); const okN = (r.checks ?? []).filter((c: any) => c.ok).length; if (!okN) throw new Error('no DNS records could be read'); return `${okN} of ${r.checks.length} records found for google.com`; });
  await run('Hacker News hiring posts', 'QF-097', async () => need((await hnHiring('react')).length, 'posts'));
  for (const [qf, link] of [['QF-093', 'https://jobs.ashbyhq.com/ramp'], ['QF-095', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite'], ['QF-091', 'https://boards.greenhouse.io/stripe'], ['QF-092', 'https://jobs.lever.co/palantir']] as const) {
    await run(`Employer jobs: ${link}`, qf, async () => { const e = detectAts(link); if (!e) throw new Error('link not recognised'); return need((await employerJobs(e)).length, `${e.ats} jobs`); });
  }
  // Personio and Pinpoint (QF-096): real public feeds (Personio's and Pinpoint's own careers boards).
  await run('Employer jobs: https://personio.jobs.personio.de', 'QF-096', async () => need((await employerJobs(detectAts('https://personio.jobs.personio.de')!)).length, 'personio jobs'));
  await run('Employer jobs: https://workwithus.pinpointhq.com', 'QF-096', async () => need((await employerJobs(detectAts('https://workwithus.pinpointhq.com')!)).length, 'pinpoint jobs'));
  await run('Employer jobs: SmartRecruiters (first of several known employers)', 'QF-094', async () => {
    for (const slug of ['SmartRecruiters', 'Visa', 'BoschGroup', 'Ubisoft2', 'IKEA']) { const n = (await employerJobs({ ats: 'smartrecruiters', slug, name: slug })).length; if (n) return `${n} jobs at ${slug}`; }
    throw new Error('none of the test employers has public SmartRecruiters postings');
  });
  await run('Job boards without keys', 'QF-099', async () => {
    const r = await searchJobs({ keywords: 'software engineer', country: 'US', countryName: 'United States', city: '' } as any);
    if (!r.jobs.length) throw new Error(`no jobs; failed: ${r.errors.join('; ').slice(0, 150)}`);
    return `${r.jobs.length} jobs; failed: ${r.errors.map((e) => e.split(':')[0]).join(', ') || 'none'}`;
  });
  await run('Scheduled job alert: baseline then re-run', 'QF-107', async () => {
    jobstore.saveAlert({ name: 'live', query: { keywords: 'software engineer', country: 'US', sources: ['remotive', 'arbeitnow', 'jobicy', 'himalayas'] } });
    await jobstore.runAlerts(true);
    const a: any = db.raw().prepare("SELECT * FROM job_alerts WHERE name = 'live'").get();
    if (a.fails) throw new Error(`run failed: ${a.last_error}`);
    const n = (db.raw().prepare('SELECT COUNT(*) n FROM job_alert_hits WHERE alert_id = ? AND seen = 1').get(a.id) as any).n;
    await jobstore.runAlerts(true);
    const fresh = (db.raw().prepare('SELECT COUNT(*) n FROM job_alert_hits WHERE alert_id = ? AND seen = 0').get(a.id) as any).n;
    return `baseline ${n} postings from ${JSON.parse(a.base_sources).length} boards; ${fresh} reported as new on the immediate re-run`;
  });
  await run('Oversized responses are rejected', 'P1', async () => {
    try { await fetchText('https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/', { maxBytes: 2000 }); } catch (e: any) { if (/larger than/.test(e.message)) return 'rejected'; throw e; }
    throw new Error('a large response was accepted');
  });
  await run('Search preview with a real source (OpenStreetMap)', 'QF-013', async () => { const p: any = await previewSearch('dentist', 'Austin, Texas', ['osm'], null); const n = JSON.stringify(p).match(/"name"/g)?.length ?? 0; if (!n) throw new Error(`no preview results: ${JSON.stringify(p).slice(0, 120)}`); return `${n} sample results`; });
  await run('Provider connectivity diagnostics', 'QF-011', async () => { const h = await checkSources(); const ok = h.filter((x) => x.status === 'ok').length; if (!ok) throw new Error('no source answered'); return `${ok} of ${h.length} sources ok: ${h.filter((x) => x.status !== 'ok' && x.status !== 'off').map((x) => x.id).join(', ') || 'none failing'}`; });
  writeFileSync(process.env.LIVE_OUT || 'live-providers.json', JSON.stringify({ at: new Date().toISOString(), passed: out.filter((r) => r.ok).length, outages: out.filter((r) => r.kind === 'outage').length, failures: out.filter((r) => r.kind === 'failure').length, total: out.length, results: out }, null, 2));
  for (const r of out) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.qf} ${r.check}: ${r.detail}`);
  process.exit(0);
})();
