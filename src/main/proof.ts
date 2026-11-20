// Proof-first pitch: before writing, Quarrix looks at the business the way a customer would and makes
// a one-page report: phone and desktop screenshots, a scorecard, how they compare with nearby competitors,
// and a short plan. All facts come from the real site and from leads you collected.
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db';
import { load } from './settings';
import { complete, parseJson, safe, tier } from './ai';
import { sleep } from './util';

const dir = () => { const d = join(app.getPath('userData'), 'proof'); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; };
export const reportPath = (id: number) => join(dir(), `${id}.pdf`);
export const hasReport = (id: number) => existsSync(reportPath(id));

async function shot(url: string, mobile: boolean): Promise<string> {
  const w = new BrowserWindow({ show: false, width: mobile ? 390 : 1366, height: mobile ? 844 : 820, paintWhenInitiallyHidden: true,
    webPreferences: { partition: 'quarrix-proof', javascript: true, backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  try {
    const ua = mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : w.webContents.getUserAgent().replace(/Electron\/\S+\s?/, '').replace(/quarrix\/\S+\s?/i, '');
    await Promise.race([w.loadURL(url, { userAgent: ua }), sleep(25000)]);
    await sleep(2500);
    // Close common cookie banners so the screenshot shows the site itself.
    await w.webContents.executeJavaScript(`(() => { const b=[...document.querySelectorAll('button,a')].find(x=>/^(accept|accept all|agree|got it|ok|allow all)$/i.test((x.innerText||'').trim())); b && b.click(); })()`, true).catch(() => undefined);
    await sleep(700);
    const img = await w.webContents.capturePage();
    return 'data:image/jpeg;base64,' + img.resize({ width: mobile ? 300 : 900 }).toJPEG(72).toString('base64');
  } finally {
    w.destroy();
  }
}

type Card = { label: string; score: number; note: string };
function scorecard(lead: db.Lead): { cards: Card[]; overall: number } {
  const a = safe(lead.audit);
  const f = a.facts ?? {};
  const psi = a.psi ?? {};
  if (!lead.website) return { cards: [{ label: 'Website', score: 0, note: 'No website found' }], overall: 0 };
  const speed = psi.performance ?? (f.ms ? (f.ms < 1000 ? 90 : f.ms < 2000 ? 75 : f.ms < 3500 ? 55 : 35) : 50);
  const mobile = f.viewport ? (psi.performance != null ? Math.max(55, psi.performance) : 85) : 20;
  const security = f.https ? 95 : 15;
  const seo = psi.seo ?? [f.description, f.h1, f.schema, (f.title ?? '').length > 10].filter(Boolean).length * 25;
  const conv = [f.form, f.booking, f.analytics].filter(Boolean).length * 30 + 10;
  const cards: Card[] = [
    { label: 'Speed', score: Math.round(speed), note: psi.performance != null ? `PageSpeed ${psi.performance}/100` : f.ms ? `Loaded in ${(f.ms / 1000).toFixed(1)}s` : '' },
    { label: 'Mobile', score: Math.round(mobile), note: f.viewport ? 'Set up for phones' : 'Not set up for phones' },
    { label: 'Security', score: security, note: f.https ? 'HTTPS' : 'Marked "Not secure"' },
    { label: 'Google visibility', score: Math.round(seo), note: f.description ? 'Has a search description' : 'No search description' },
    { label: 'Conversion', score: Math.min(100, conv), note: f.booking ? 'Online booking' : f.form ? 'Contact form' : 'No form or booking' },
  ];
  return { cards, overall: Math.round(cards.reduce((n, c) => n + c.score, 0) / cards.length) };
}

/** Where this business stands among the same kind of business in the same city, from your own collected leads. */
export function competitors(lead: db.Lead) {
  const rows = db.raw().prepare("SELECT id, name, rating, reviews, website FROM leads WHERE category = ? AND city = ? AND rating IS NOT NULL").all(lead.category, lead.city) as { id: number; name: string; rating: number; reviews: number | null; website: string }[];
  const strength = (r: { rating: number; reviews: number | null }) => r.rating * Math.log10(10 + (r.reviews ?? 0));
  const sorted = rows.sort((x, y) => strength(y) - strength(x));
  const rank = sorted.findIndex((r) => r.id === lead.id) + 1;
  const avgRating = rows.length ? rows.reduce((n, r) => n + r.rating, 0) / rows.length : 0;
  const avgReviews = rows.length ? rows.reduce((n, r) => n + (r.reviews ?? 0), 0) / rows.length : 0;
  return { rank, total: rows.length, top: sorted.slice(0, 3), avgRating, avgReviews };
}

async function plan(lead: db.Lead, cards: Card[], comp: ReturnType<typeof competitors>): Promise<string[]> {
  const s = load();
  const findings = (safe(lead.audit).findings ?? []) as string[];
  if (tier(s.ai) !== 'none') {
    const j = parseJson(await complete(s.ai, `You write 3-5 short, specific improvement steps for a small business, as the sender (${s.profile.company || 'a web studio'}) offering: ${s.profile.services || 'websites and online marketing'}. Each step: max 16 words, starts with a verb, uses only the facts given, no prices, no AI mentions. Return JSON {"steps":["..."]}.`,
      `Business: ${lead.name} (${lead.category}, ${lead.city})\nWebsite: ${lead.website || 'none'}\nScores: ${cards.map((c) => `${c.label} ${c.score}/100 (${c.note})`).join('; ')}\nFindings: ${findings.join(' | ') || 'none'}\nLocal rank: ${comp.total ? `#${comp.rank} of ${comp.total}` : 'unknown'}; rating ${lead.rating ?? 'n/a'} vs local average ${comp.avgRating.toFixed(1)}`, 500).catch(() => '')) ?? {};
    if (Array.isArray(j.steps) && j.steps.length) return j.steps.map(String).slice(0, 5);
  }
  const steps: string[] = [];
  if (!lead.website) steps.push('Launch a fast, mobile-friendly website with clear services, prices and contact details.');
  for (const c of cards) {
    if (c.score >= 70) continue;
    if (c.label === 'Speed') steps.push('Speed up the site: compress images, trim scripts and use fast hosting.');
    if (c.label === 'Mobile') steps.push('Rebuild the layout so it works properly on phones, where most visitors are.');
    if (c.label === 'Security') steps.push('Turn on HTTPS so browsers stop showing "Not secure".');
    if (c.label === 'Google visibility') steps.push('Add titles, descriptions and business details so Google understands each page.');
    if (c.label === 'Conversion') steps.push('Add online booking or a short enquiry form on every page.');
  }
  if (comp.total && lead.rating != null && (lead.reviews ?? 0) < comp.avgReviews) steps.push('Ask happy customers for Google reviews to catch up with nearby competitors.');
  return steps.slice(0, 5);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const color = (n: number) => (n >= 75 ? '#16a34a' : n >= 50 ? '#d97706' : '#dc2626');

export async function makeReport(id: number) {
  const lead = db.getLead(id);
  if (!lead) throw new Error('Lead not found.');
  const s = load();
  const p = s.profile;
  const [desk, mob] = lead.website ? await Promise.all([shot(lead.website, false).catch(() => ''), shot(lead.website, true).catch(() => '')]) : ['', ''];
  const { cards, overall } = scorecard(lead);
  const comp = competitors(lead);
  const steps = await plan(lead, cards, comp);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box } body { margin: 0; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181f; font-size: 11px; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 14mm 10mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #7c3aed; }
  .head h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em } .head p { margin: 2px 0 0; color: #5d5d6b }
  .brand { text-align: right; font-size: 10px; color: #5d5d6b } .brand b { display: block; color: #6d28d9; font-size: 13px }
  .row { display: flex; gap: 12px; margin-top: 12px }
  .overall { width: 130px; flex: none; border-radius: 12px; background: linear-gradient(135deg, #ede9fe, #fce7f3); padding: 14px; text-align: center }
  .overall b { font-size: 40px; display: block; color: ${color(overall)} } .overall span { color: #5d5d6b }
  .cards { flex: 1; display: grid; grid-template-columns: repeat(${cards.length > 1 ? 5 : 1}, 1fr); gap: 8px }
  .card { border: 1px solid #ececf1; border-radius: 10px; padding: 9px } .card b { font-size: 20px } .card small { display: block; color: #9a9aa8; margin-top: 2px }
  .bar { height: 5px; background: #f0eff5; border-radius: 9px; margin: 6px 0 2px } .bar i { display: block; height: 100%; border-radius: 9px }
  h2 { font-size: 13px; margin: 16px 0 6px }
  .shots { display: flex; gap: 12px; align-items: flex-start } .shots img { border: 1px solid #ececf1; border-radius: 8px; display: block }
  .desk { width: 128mm } .mob { width: 46mm }
  .comp { border: 1px solid #ececf1; border-radius: 10px; padding: 10px; flex: 1 }
  .comp table { width: 100%; border-collapse: collapse } .comp td { padding: 4px 2px; border-bottom: 1px solid #f3f3f7 } .comp tr.me td { font-weight: 700; color: #6d28d9 }
  ol { margin: 0; padding-left: 16px } ol li { margin: 4px 0 }
  .foot { margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: #18181f; color: #fff; display: flex; justify-content: space-between; align-items: center }
  .foot b { font-size: 13px } .foot span { color: #c4b5fd }
  .muted { color: #9a9aa8 }
  </style></head><body><div class="page">
  <div class="head"><div><h1>${esc(lead.name)}</h1><p>Website and local presence review · ${esc([lead.category, lead.city].filter(Boolean).join(' · '))} · ${date}</p></div>
  <div class="brand"><b>${esc(p.company || p.name)}</b>${esc(p.website)}</div></div>
  <div class="row"><div class="overall"><b>${lead.website ? overall : '—'}</b><span>${lead.website ? 'overall score out of 100' : 'no website found'}</span></div>
  <div class="cards">${cards.map((c) => `<div class="card"><div class="muted">${esc(c.label)}</div><b style="color:${color(c.score)}">${c.score}</b><div class="bar"><i style="width:${c.score}%;background:${color(c.score)}"></i></div><small>${esc(c.note)}</small></div>`).join('')}</div></div>
  ${desk || mob ? `<h2>How the site looks today</h2><div class="shots">${desk ? `<img class="desk" src="${desk}">` : ''}${mob ? `<img class="mob" src="${mob}">` : ''}</div>` : ''}
  <div class="row">
  ${comp.total > 1 ? `<div class="comp"><h2 style="margin-top:0">Against ${comp.total} nearby ${esc(lead.category.toLowerCase())}</h2>
  <p>${esc(lead.name)} is <b>#${comp.rank} of ${comp.total}</b> by Google rating and number of reviews. Local average: ${comp.avgRating.toFixed(1)}★ from ${Math.round(comp.avgReviews)} reviews; ${esc(lead.name)}: ${lead.rating ?? '—'}★ from ${lead.reviews ?? 0}.</p>
  <table>${comp.top.map((r, i) => `<tr class="${r.id === lead.id ? 'me' : ''}"><td>#${i + 1}</td><td>${esc(r.name)}</td><td>${r.rating}★</td><td>${r.reviews ?? 0} reviews</td></tr>`).join('')}${comp.rank > 3 ? `<tr class="me"><td>#${comp.rank}</td><td>${esc(lead.name)}</td><td>${lead.rating ?? '—'}★</td><td>${lead.reviews ?? 0} reviews</td></tr>` : ''}</table></div>` : ''}
  <div class="comp"><h2 style="margin-top:0">What we would improve first</h2><ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div></div>
  <div class="foot"><div><b>Want a hand with this?</b><br><span>${esc(p.name ? `${p.name}, ` : '')}${esc(p.company)}</span></div><div style="text-align:right">${esc(p.phone)}<br>${esc(s.email.fromEmail || '')}<br>${esc(p.website)}</div></div>
  <p class="muted" style="margin-top:8px">Checked on ${date} from public information: the website itself and public business listings. Scores are estimates to show where the quick wins are.</p>
  </div></body></html>`;
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    writeFileSync(reportPath(id), pdf);
  } finally { w.destroy(); }
  writeFileSync(join(dir(), `${id}.json`), JSON.stringify({ overall, cards, rank: comp.rank, total: comp.total, steps, desk, mob, at: new Date().toISOString() }));
  db.logEvent(id, 'report', `Proof report made: ${lead.website ? `${overall}/100` : 'no website'}${comp.total > 1 ? `, #${comp.rank} of ${comp.total} locally` : ''}`);
  return reportInfo(id);
}

export function reportInfo(id: number) {
  const f = join(dir(), `${id}.json`);
  if (!existsSync(f)) return null;
  return { ...JSON.parse(readFileSync(f, 'utf8')), pdf: reportPath(id) };
}

/** One line for the email writer, so the email can mention the review naturally. */
export function reportFact(id: number) {
  const r = reportInfo(id);
  if (!r) return '';
  return `A one-page review of their website is ready to share: overall ${r.overall}/100${r.total > 1 ? `, #${r.rank} of ${r.total} similar businesses nearby by Google reviews` : ''}; first fixes: ${(r.steps ?? []).slice(0, 2).join(' ')}`;
}
