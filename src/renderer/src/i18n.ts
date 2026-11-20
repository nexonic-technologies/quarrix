// Interface language (QF-123). Navigation, page titles and the workspace switch are translated; dates and numbers
// follow the chosen language everywhere; Arabic and Urdu switch the layout to right-to-left.
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
export const setLang = (l: string) => {
  lang = LANGS[l] ? l : 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].rtl ? 'rtl' : 'ltr';
};
export const t = (s: string) => T[lang]?.[s] ?? s;
export const currentLang = () => lang;
