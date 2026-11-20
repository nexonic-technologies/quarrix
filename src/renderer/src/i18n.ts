// Interface language (QF-123). Every screen is translated into Urdu, Arabic, Spanish, French and German (machine translation,
// awaiting native review); dates and numbers follow the chosen language; Arabic and Urdu switch the layout to right-to-left.
export const LANGS: Record<string, { label: string; rtl?: boolean }> = { en: { label: 'English' }, ur: { label: 'اردو', rtl: true }, ar: { label: 'العربية', rtl: true }, es: { label: 'Español' }, fr: { label: 'Français' }, de: { label: 'Deutsch' } };
type Dict = Record<string, string>;
const T: Record<string, Dict> = {
  ur: { Dashboard: 'ڈیش بورڈ', Find: 'تلاش', Leads: 'لیڈز', Pipeline: 'پائپ لائن', Signals: 'اشارے', 'Job search': 'نوکری کی تلاش', Outreach: 'رابطہ', Autopilot: 'آٹو پائلٹ', 'Import and export': 'درآمد اور برآمد', Settings: 'ترتیبات', Business: 'کاروبار', Career: 'کیریئر', Both: 'دونوں', 'Find businesses': 'کاروبار تلاش کریں' },
  ar: { Dashboard: 'لوحة التحكم', Find: 'بحث', Leads: 'العملاء المحتملون', Pipeline: 'خط المبيعات', Signals: 'إشارات', 'Job search': 'البحث عن وظيفة', Outreach: 'التواصل', Autopilot: 'الطيار الآلي', 'Import and export': 'استيراد وتصدير', Settings: 'الإعدادات', Business: 'الأعمال', Career: 'المهنة', Both: 'كلاهما', 'Find businesses': 'ابحث عن شركات' },
  es: { Dashboard: 'Panel', Find: 'Buscar', Leads: 'Clientes potenciales', Pipeline: 'Embudo', Signals: 'Señales', 'Job search': 'Buscar empleo', Outreach: 'Contacto', Autopilot: 'Piloto automático', 'Import and export': 'Importar y exportar', Settings: 'Ajustes', Business: 'Negocio', Career: 'Carrera', Both: 'Ambos', 'Find businesses': 'Buscar empresas' },
  fr: { Dashboard: 'Tableau de bord', Find: 'Rechercher', Leads: 'Prospects', Pipeline: 'Pipeline', Signals: 'Signaux', 'Job search': "Recherche d'emploi", Outreach: 'Prospection', Autopilot: 'Pilote automatique', 'Import and export': 'Importer et exporter', Settings: 'Réglages', Business: 'Entreprise', Career: 'Carrière', Both: 'Les deux', 'Find businesses': 'Trouver des entreprises' },
  de: { Dashboard: 'Übersicht', Find: 'Suchen', Leads: 'Leads', Pipeline: 'Pipeline', Signals: 'Signale', 'Job search': 'Jobsuche', Outreach: 'Ansprache', Autopilot: 'Autopilot', 'Import and export': 'Import und Export', Settings: 'Einstellungen', Business: 'Geschäft', Career: 'Karriere', Both: 'Beides', 'Find businesses': 'Unternehmen finden' },
};
let lang = 'en';
let dict: Dict = {};
// Full catalogues (0.22), loaded on demand so English starts instantly. Built from the interface text by scripts/i18n.mjs.
const CATALOGUES: Record<string, () => Promise<{ default: Dict }>> = {
  es: () => import('./locales/es.json'), fr: () => import('./locales/fr.json'), de: () => import('./locales/de.json'),
  ar: () => import('./locales/ar.json'), ur: () => import('./locales/ur.json'),
};
export const setLang = (l: string) => {
  lang = LANGS[l] ? l : 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].rtl ? 'rtl' : 'ltr';
  dict = { ...(T[lang] ?? {}) };
  const load = CATALOGUES[lang];
  if (load) void load().then((m) => { if (currentLang() === lang) { dict = { ...m.default, ...(T[lang] ?? {}) }; translateTree(document.body); } }).catch(() => undefined);
  if (document.body) translateTree(document.body);
};
export const t = (s: string) => dict[s] ?? T[lang]?.[s] ?? s;
export const currentLang = () => lang;

// ── Whole-interface translation ──
// Screens are written in English; this layer swaps every piece of interface text (and placeholders, titles, labels)
// for the chosen language as React draws it, and keeps the English original so React's own updates still work.
// Text inside inputs, code, and anything marked translate="no" is left alone, so the user's own data is never changed.
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'script,style,code,pre,textarea,[translate="no"],[contenteditable="true"]';
const applied = new WeakMap<Node, string>();
const source = new WeakMap<Node, string>();
const appliedAttr = new WeakMap<Element, Record<string, string>>();
const sourceAttr = new WeakMap<Element, Record<string, string>>();
/** Translate one piece of text, keeping its surrounding spaces. Pure apart from the loaded catalogue. */
export function translateText(raw: string): string | null {
  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return null;
  const key = m[2].replace(/\s+/g, ' ');
  let v = dict[key];
  // Sentences with numbers ("12 today · 3 queued") use patterns where # stands for each number, in order.
  if (!v && /\d/.test(key)) {
    const nums = key.match(/\d[\d.,]*/g) ?? [];
    const p = dict[key.replace(/\d[\d.,]*/g, '#')];
    if (p) { let i = 0; v = p.replace(/#/g, () => nums[i++] ?? '#'); }
  }
  return v ? m[1] + v + m[3] : null;
}
function doText(n: Text) {
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  const cur = n.nodeValue ?? '';
  if (applied.get(n) !== cur) source.set(n, cur); // set by React (or first time): this is the English source
  const src = source.get(n) ?? cur;
  const out = lang === 'en' ? src : translateText(src) ?? src;
  if (out !== cur) n.nodeValue = out;
  applied.set(n, out);
}
function doAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  const ap = appliedAttr.get(el) ?? {}, sp = sourceAttr.get(el) ?? {};
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    if (ap[a] !== cur) sp[a] = cur;
    const out = lang === 'en' ? sp[a] : translateText(sp[a]) ?? sp[a];
    if (out !== cur) el.setAttribute(a, out);
    ap[a] = out;
  }
  appliedAttr.set(el, ap); sourceAttr.set(el, sp);
}
function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  doAttrs(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === Node.TEXT_NODE ? doText(n as Text) : doAttrs(n as Element);
}
let observer: MutationObserver | null = null;
/** Start translating the interface as it changes. Called once at start. */
export function startTranslation() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((list) => {
    if (lang === 'en' && !Object.keys(dict).length) return;
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => translateTree(n));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  translateTree(document.body);
}
