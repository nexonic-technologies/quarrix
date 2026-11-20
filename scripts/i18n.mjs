// Interface text catalogue tool (QF-123). `node scripts/i18n.mjs` lists interface strings that a language does not translate yet.
// The extractor is also used by test/i18n.test.ts to keep every catalogue complete as screens change.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ATTR = new Set(['placeholder', 'title', 'aria-label', 'label', 'alt']);
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const ok = (s) => { s = clean(s); return s.length >= 2 && /[A-Za-z]{2}/.test(s) && !/^[a-z0-9_.:/-]+$/.test(s) && !/^https?:/.test(s) ? s : ''; };
/** Every piece of English interface text in the renderer: JSX text, labelled attributes and sentence-like string literals. */
export function extract(root = 'src/renderer/src') {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/i18n\.ts$/.test(f) && files.push(p); } };
  walk(root);
  const out = new Set();
  for (const f of files) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n) => {
      if (ts.isJsxText(n)) { const s = ok(n.text); if (s) out.add(s); }
      if (ts.isJsxAttribute(n) && ATTR.has(n.name.getText()) && n.initializer) {
        const i = n.initializer;
        const lit = ts.isStringLiteral(i) ? i : ts.isJsxExpression(i) && i.expression && (ts.isStringLiteral(i.expression) || ts.isNoSubstitutionTemplateLiteral(i.expression)) ? i.expression : null;
        if (lit) { const s = ok(lit.text); if (s) out.add(s); }
      }
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isImportDeclaration(n.parent) && !ts.isJsxAttribute(n.parent)) {
        const v = clean(n.text);
        if (/^[A-Z][a-z]/.test(v) && /[a-z]{2}/.test(v) && !/[{}<>=;]|\.(tsx?|json|png|svg)$|^[A-Z][a-zA-Z]+[A-Z]/.test(v) && v.length < 400) out.add(v);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return [...out].sort();
}
/** Brand, product and place names that stay as they are in every language. */
export const KEEP = /^(Quarrix|Nexonic.*|Scruvix|HubSpot|Notion|Hunter|ZeroBounce|WhatsApp|Google( Maps| Places API| Sheets)?|Microsoft|Facebook|Instagram|Indeed|Reddit|Remotive|Jobicy|Himalayas|Arbeitnow|Rozee\.pk|Wikidata|Socrata|ArcGIS|Hotfrog|Yelp|Yell|Foursquare|PostgreSQL|Overture Maps|Places API|SendGrid API|Webhooks|Markdown|JSON|CSV|Excel|URL|Tab|We Work Remotely|Working Nomads|Hacker News.*|Anthropic Claude|Next\.js|Node\.js|React|Tailwind|Figma|[A-Z][a-z]+(, [A-Z][a-z]+)*|.*\.pdf|X-Quarrix-Signature|postgres:.*|test-abc123@.*|&nbsp;|Acme Health|Google:|Microsoft:|Shahrukh Khalid|Hotfrog, Yelp, Yellow Pages, Yell|quarrix .*|round\(.*|Austin, Texas.*|London, United Kingdom|.* (Studio|Labs|Physio|Roofing|Plumbing|Dentistry|Smiles|Orthodontics|Partners|Accounting|Care|& Co)( .*)?)$/;

if (import.meta.url === `file://${process.argv[1]}`) {
  const en = extract();
  for (const l of ['ur', 'ar', 'es', 'fr', 'de']) {
    const d = JSON.parse(readFileSync(`src/renderer/src/locales/${l}.json`, 'utf8'));
    const miss = en.filter((s) => !d[s]);
    console.log(`${l}: ${en.length - miss.length}/${en.length} translated`);
    if (process.argv.includes('--missing')) for (const m of miss) console.log(`  ${m}`);
  }
}
