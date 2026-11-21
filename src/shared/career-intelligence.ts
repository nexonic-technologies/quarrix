import catalog from './occupations.json';

export type Occupation = { id: string; title: string; skills: string[]; tools: string[] };
export type CareerProfile = { titles: string[]; skills: string[] };
export type CareerMatch = { id: string; title: string; score: number; titleMatches: string[]; skills: string[]; tools: string[]; explore: string[] };
export const OCCUPATION_COUNT = catalog.length;
const normal = (s: string) => s.toLowerCase().normalize('NFKC').trim().replace(/\s+/g, ' ');
const stop = new Set(['and', 'or', 'the', 'of', 'for', 'senior', 'junior', 'lead', 'entry', 'level', 'a', 'an']);
const token = (s: string) => normal(s).split(/[^\p{L}\p{N}+#]+/u).filter(x => x.length > 1 && !stop.has(x));
const stem = (x: string) => x.length > 4 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x;
const terms = (s: string) => new Set(token(s).map(stem));
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termPattern = (needle: string) => new RegExp(`(^|[^a-z0-9+#.])${escaped(needle)}($|[^a-z0-9+#.])`, 'i');

/** A deterministic career exploration ranking. Neither a hiring probability nor a qualification verdict. */
export function exploreCareers(profile: CareerProfile, limit = 8, occupations: Occupation[] = catalog): CareerMatch[] {
  const titles = profile.titles.map(terms).filter(x => x.size);
  const known = [...new Set(profile.skills.map(normal).filter(x => x.length >= 2 && x.length <= 120))].slice(0, 100);
  const patterns = known.map(s => ({ s, pattern: termPattern(s) }));
  if (!titles.length && !known.length) return [];
  const matches: CareerMatch[] = [];
  for (const o of occupations) {
    const target = terms(o.title);
    let titleMatches: string[] = [], titleScore = 0;
    for (const t of titles) {
      const overlap = [...target].filter(x => t.has(x));
      const similarity = overlap.length / Math.max(t.size, target.size, 1);
      if (similarity > titleScore) { titleScore = similarity; titleMatches = overlap; }
    }
    const skills = o.skills.filter(s => known.includes(normal(s)));
    const matchedTools = patterns.filter(({ pattern }) => o.tools.some(t => pattern.test(t))).map(x => x.s);
    // Generic transferable skills alone are not enough to claim a strong occupation match.
    if (!titleMatches.length && !skills.length && !matchedTools.length) continue;
    const score = Math.min(100, Math.round(titleScore * 60 + Math.min(matchedTools.length, 5) * 7 + Math.min(skills.length, 5) * 3));
    if (!score) continue;
    matches.push({ id: o.id, title: o.title, score, titleMatches, skills, tools: matchedTools, explore: o.skills.filter(s => !known.includes(normal(s))) });
  }
  return matches.sort((a, b) => b.score - a.score || b.titleMatches.length - a.titleMatches.length || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, Math.max(0, Math.min(limit, 50)));
}
