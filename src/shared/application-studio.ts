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
/** Evidence from the posting, not an ATS score or a claim about ability. */
export function resumeGap(text:string,posting:string,candidates:string[]) {
  const terms=[...new Map(candidates.map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=120).map(s=>[s.toLowerCase(),s])).values()].slice(0,200);
  const requested=terms.filter(s=>term(posting,s));
  return {requested,documented:requested.filter(s=>term(text,s)),notDocumented:requested.filter(s=>!term(text,s))};
}
export function upcomingItems(items:{id:string;title:string;studio?:StudioNotes}[],today:string,through:string){
 return items.flatMap(j=>(['deadline','interview','followUp'] as const).filter(k=>{const day=j.studio?.[k];return !!day&&validDay(day)&&day>today&&day<=through;}).map(k=>({id:j.id,title:j.title,kind:k,day:j.studio![k]}))).sort((a,b)=>a.day.localeCompare(b.day));
}
export type PriorityItem={id:string;title:string;day:string;kind:'deadline'|'interview'|'followUp'|'task'|'notice';lead?:number;job?:string};
/** Due dates are evidence of urgency, not a prediction of success. Invalid dates are ignored. */
export function priorityQueue(items:PriorityItem[],today:string,through:string){
 const rank={deadline:0,interview:1,followUp:2,task:3,notice:0};
 return items.filter(x=>x.day&&validDay(x.day)&&x.day<=through).sort((a,b)=>a.day.localeCompare(b.day)||rank[a.kind]-rank[b.kind]||a.id.localeCompare(b.id)).map(x=>({...x,due:x.day<today?'overdue':x.day===today?'today':'upcoming'} as const));
}
