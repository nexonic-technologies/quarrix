export type StudioNotes = { deadline: string; interview: string; followUp: string; nextAction: string; notes: string; practice: string; resumeDraft: string; letterDraft: string };
export const EMPTY_STUDIO: StudioNotes = { deadline: '', interview: '', followUp: '', nextAction: '', notes: '', practice: '', resumeDraft: '', letterDraft: '' };
export type ResumeReview = { words: number; sections: string[]; missing: string[]; emailPresent: boolean; phonePresent: boolean; matchedSkills: string[]; unmentionedSkills: string[] };
const headings = [ ['Summary', /^(?:profile|summary|professional summary|objective|about me)\s*:?$/i], ['Experience', /^(?:experience|work experience|professional experience|employment history)\s*:?$/i], ['Education', /^(?:education|qualifications|academic background)\s*:?$/i], ['Skills', /^(?:skills|technical skills|core skills|competencies)\s*:?$/i] ] as const;
const term = (text: string, skill: string) => new RegExp(`(^|[^a-z0-9+#.])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9+#.])`, 'i').test(text);
/** Text-based review only; an unrecognised heading or skill is not proof of absence or ATS failure. */
export function reviewResume(text: string, skills: string[], posting: string): ResumeReview {
  const lines = text.split(/\r?\n/).map(x => x.trim());
  const sections = headings.filter(([, re]) => lines.some(line => re.test(line))).map(([name]) => name);
  const known = [...new Set(skills.map(x => x.trim()).filter(x => x.length >= 2 && x.length <= 120))].slice(0, 100);
  return { words: text.trim().split(/\s+/).filter(Boolean).length, sections, missing: headings.map(([name]) => name).filter(x => !sections.includes(x)), emailPresent: /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/i.test(text), phonePresent: /(?:^|\s)(?:\+?\d[\d ().-]{7,}\d)(?:\s|$)/m.test(text), matchedSkills: known.filter(x => posting && term(posting, x) && term(text, x)), unmentionedSkills: known.filter(x => posting && !term(posting, x)) };
}
export function interviewTopics(skills: string[], posting: string): string[] {
  return [...new Set(skills.map(x => x.trim()).filter(x => x.length >= 2 && x.length <= 120 && term(posting, x)))].slice(0, 6);
}
export function validDay(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}
export function dueItems(items: { id: string; title: string; studio?: StudioNotes }[], today: string) {
  return items.flatMap(j => (['deadline', 'interview', 'followUp'] as const).filter(k => j.studio?.[k] && j.studio[k] <= today).map(k => ({ id: j.id, title: j.title, kind: k, day: j.studio![k] }))).sort((a, b) => a.day.localeCompare(b.day));
}
