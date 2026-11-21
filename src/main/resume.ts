// The job seeker's CV: read it once (PDF, Word or text), understand it, and use it to find, rank and apply for jobs.
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import * as cheerio from 'cheerio';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { complete, parseJson, tier } from './ai';
import { pdfText } from './importexport';
import { load } from './settings';
import { fetchText, UA } from './util';
import type { Job } from './jobsearch';

export type CvProfile = { name: string; title: string; years: number; skills: string[]; roles: string[]; level: string; locations: string[]; summary: string };
export type Cv = { file: string; text: string; profile: CvProfile; analysedWith: string; at: string };

const file = () => join(app.getPath('userData'), 'cv.json');
export const getCv = (): Cv | null => { try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : null; } catch { return null; } };

const SKILLS = ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express', 'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'Kotlin', 'Swift', 'Flutter', 'React Native', 'C#', '.NET', 'PHP', 'Laravel', 'WordPress', 'Shopify', 'Ruby', 'Rails', 'Go', 'Rust', 'C++', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Linux', 'Git', 'HTML', 'CSS', 'Tailwind', 'Sass', 'Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'InDesign', 'After Effects', 'Premiere Pro', 'UI design', 'UX design', 'Graphic design', 'Branding', 'Motion design', 'SEO', 'Google Ads', 'Social media', 'Content writing', 'Copywriting', 'Excel', 'Power BI', 'Tableau', 'Data analysis', 'Machine learning', 'Deep learning', 'NLP', 'TensorFlow', 'PyTorch', 'Salesforce', 'HubSpot', 'Project management', 'Agile', 'Scrum', 'Jira', 'Customer service', 'Sales', 'Accounting', 'QuickBooks', 'Teaching', 'Nursing', 'Recruiting', 'QA', 'Selenium', 'Cypress', 'Cybersecurity', 'Networking', 'DevOps', 'Blockchain', 'Solidity', 'Unity', 'Unreal'];

async function readText(path: string) {
  const ext = extname(path).toLowerCase();
  if (ext === '.pdf') return pdfText(path);
  if (ext === '.docx') { const mammoth = await import('mammoth'); return (await mammoth.extractRawText({ path })).value; }
  if (['.txt', '.md', '.rtf'].includes(ext)) return readFileSync(path, 'utf8');
  throw new Error('Use a PDF, Word (.docx) or text file.');
}

function guessProfile(text: string): CvProfile {
  const lower = text.toLowerCase();
  const skills = SKILLS.filter((s) => new RegExp(`(^|[^a-z])${s.toLowerCase().replace(/[.+#/]/g, (c) => '\\' + c)}([^a-z]|$)`).test(lower)).slice(0, 25);
  const years = Math.max(0, ...[...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/gi)].map((m) => +m[1]).filter((n) => n < 45));
  const firstLines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
  const title = firstLines.find((l) => /developer|engineer|designer|manager|analyst|specialist|consultant|marketer|writer|officer|lead|architect|accountant|teacher|nurse/i.test(l) && l.length < 80) ?? '';
  return { name: firstLines[0]?.length < 40 ? firstLines[0] : '', title, years, skills, roles: title ? [title.replace(/[|,–-].*$/, '').trim()] : skills.slice(0, 2).map((s) => `${s} developer`), level: years >= 8 ? 'Senior' : years >= 3 ? 'Mid level' : 'Entry level', locations: [], summary: '' };
}

export async function loadCv(path: string): Promise<Cv> {
  const text = (await readText(path)).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 200) throw new Error('Could not read enough text from this file. If it is a scanned image, export it as a text PDF or Word file first.');
  const s = load();
  let profile = guessProfile(text);
  let analysedWith = 'built-in reader';
  if (tier(s.ai) !== 'none') {
    const system = 'You read a CV and return facts from it only. Never invent anything. Return one JSON object: '
      + '{"name":"","title":"current or target job title","years":total years of work experience as a number,"skills":["up to 25 concrete skills and tools"],'
      + '"roles":["3-5 job titles this person should search for, most suitable first"],"level":"Internship|Entry level|Mid level|Senior|Director","locations":["cities or countries mentioned as where they live or want to work"],'
      + '"summary":"3 sentences: who they are, their strongest skills, and what roles they fit"}';
    const j = parseJson(await complete(s.ai, system, text.slice(0, tier(s.ai) === 'paid' ? 14000 : 6000), 1200).catch(() => '')) ?? null;
    if (j?.title || j?.skills?.length) {
      profile = { name: String(j.name ?? profile.name), title: String(j.title ?? profile.title), years: Number(j.years) || profile.years, skills: (j.skills ?? profile.skills).map(String).slice(0, 25),
        roles: (j.roles ?? profile.roles).map(String).slice(0, 5), level: String(j.level ?? profile.level), locations: (j.locations ?? []).map(String).slice(0, 5), summary: String(j.summary ?? '') };
      analysedWith = s.ai.model || s.ai.provider;
    }
  }
  const cv: Cv = { file: basename(path), text, profile, analysedWith, at: new Date().toISOString() };
  writeFileSync(file(), JSON.stringify(cv));
  return cv;
}

export function saveProfile(profile: CvProfile) {
  const cv = getCv();
  if (!cv) throw new Error('Upload your CV first.');
  cv.profile = profile;
  writeFileSync(file(), JSON.stringify(cv));
  return cv;
}

/** Without a model: how many of the CV skills and target words appear in the job. */
export function keywordMatch(cv: Cv, jobs: Job[]) {
  const words = [...cv.profile.skills, ...cv.profile.roles.flatMap((r) => r.split(/\s+/))].map((w) => w.toLowerCase()).filter((w) => w.length > 2);
  const out: Record<string, { match: number; why: string }> = {};
  for (const j of jobs) {
    const hay = `${j.title} ${j.tags.join(' ')} ${j.snippet}`.toLowerCase();
    const hits = [...new Set(words.filter((w) => hay.includes(w)))];
    const titleHit = cv.profile.roles.some((r) => r.toLowerCase().split(/\s+/).filter((w) => w.length > 2).every((w) => j.title.toLowerCase().includes(w)));
    const levelOk = !cv.profile.level || j.level === cv.profile.level || !j.level;
    const match = Math.min(98, Math.round(hits.length * 9 + (titleHit ? 35 : 0) + (levelOk ? 8 : -10)));
    out[j.id] = { match: Math.max(0, match), why: hits.length ? `Matches ${hits.slice(0, 4).join(', ')}` : 'Few of your skills mentioned' };
  }
  return out;
}

/** The full job post text, for writing a letter or tailoring a CV. */
/** Pages that are a bot check, a consent wall or a "turn on JavaScript" redirect, not the job post. Pure, exported for tests. */
export const NOT_A_JOB_PAGE = /enablejs|httpservice\/retry|unusual traffic|are not a robot|captcha|just a moment|enable javascript|having trouble accessing google|before you continue to google|cf-browser-verification|access denied/i;

/** The full job post as plain text, or the listing's own summary when the page can't be read honestly. */
export async function jobText(job: Job) {
  // Google Jobs links are search pages, not job posts: they only ever return Google's own pages.
  if (/^https?:\/\/(www\.)?google\.[a-z.]+\//i.test(job.url)) return job.snippet;
  try {
    const li = job.url.match(/linkedin\.com\/jobs\/view\/[^/]*?-?(\d{6,})/);
    const url = li ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${li[1]}` : job.url;
    const r = await fetchText(url, { ua: UA, timeout: 20000 });
    if (!r.ok || NOT_A_JOB_PAGE.test(r.text.slice(0, 20000))) return job.snippet;
    const $ = cheerio.load(r.text);
    $('script, style, noscript, template, iframe, svg, nav, header, footer, meta, link').remove();
    const t = ($('.show-more-less-html__markup').text() || $('main').text() || $('body').text()).replace(/\s+/g, ' ').trim();
    // Never show markup as a description.
    if (t.length <= 200 || /<\/?[a-z][^>]*>|\{display:none\}/i.test(t) || NOT_A_JOB_PAGE.test(t)) return job.snippet;
    return t.slice(0, 7000);
  } catch { return job.snippet; }
}

const HONEST = 'Use only experience, skills, employers, dates and results that are in the CV. Never invent or exaggerate anything. Do not mention AI.';

export async function coverLetter(job: Job) {
  const s = load(); const cv = getCv();
  if (!cv) throw new Error('Upload your CV first.');
  if (tier(s.ai) === 'none') throw new Error('Add a writing model in Settings → Writing to write cover letters.');
  const paid = tier(s.ai) === 'paid';
  const post = await jobText(job);
  const system = `You write job application cover letters. ${HONEST}\nMatch the tone to the job: formal for corporate, warm and direct for startups and small teams. `
    + `${paid ? '220-320' : '150-220'} words, 3-4 short paragraphs, plain text, no placeholders like [Company]. Open with the role and one specific reason this company or role fits; connect 2-3 real CV achievements to the job's main requirements; close with a simple call to talk. Sign with the candidate's name.`;
  return complete(s.ai, system, `Job: ${job.title} at ${job.company} (${job.location})\nJob post:\n${post.slice(0, paid ? 7000 : 3500)}\n\nCV:\n${cv.text.slice(0, paid ? 12000 : 5000)}`, 1200);
}

export async function tailorCv(job: Job) {
  const s = load(); const cv = getCv();
  if (!cv) throw new Error('Upload your CV first.');
  if (tier(s.ai) === 'none') throw new Error('Add a writing model in Settings → Writing to tailor your CV.');
  const paid = tier(s.ai) === 'paid';
  const post = await jobText(job);
  const system = `You tailor a CV to one job. ${HONEST}\nReorder and reword so the most relevant experience and skills come first, use the job's own words where they truthfully apply, `
    + 'and write a new 3-line profile summary for this role. Keep all real jobs and dates. Output plain text with section headings in CAPITALS on their own lines '
    + '(PROFILE, SKILLS, EXPERIENCE, EDUCATION, plus any others in the CV). Bullet lines start with "- ". After the CV, add a line "---" and then "Notes:" with 2-4 honest gaps between the CV and the job.';
  return complete(s.ai, system, `Job: ${job.title} at ${job.company}\nJob post:\n${post.slice(0, paid ? 7000 : 3500)}\n\nCV:\n${cv.text.slice(0, paid ? 14000 : 6000)}`, paid ? 3500 : 2200);
}

/** Save a letter or CV as a Word document. */
export async function saveDocx(path: string, text: string) {
  const paras = text.split('\n').map((line) => {
    const t = line.trim();
    if (/^[A-Z][A-Z &/]{2,}$/.test(t)) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t })] });
    if (t.startsWith('- ')) return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(t.slice(2))] });
    return new Paragraph({ children: [new TextRun(t)] });
  });
  const doc = new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children: paras }] });
  writeFileSync(path, await Packer.toBuffer(doc));
}

/** Everything the job page says, for the job detail panel. */
export async function jobDetail(job: Job) {
  const text = await jobText(job);
  const pick = (re: RegExp) => (text.match(re) ?? [])[1]?.trim() ?? '';
  return {
    text,
    seniority: pick(/Seniority level\s*([A-Za-z -]{3,30}?)(?=\s{1,}Employment type|$)/i),
    employment: pick(/Employment type\s*([A-Za-z -]{3,30}?)(?=\s{1,}Job function|$)/i),
    func: pick(/Job function\s*([A-Za-z ,&-]{3,60}?)(?=\s{1,}Industries|$)/i),
    industries: pick(/Industries\s*([A-Za-z ,&-]{3,80})/i),
  };
}
