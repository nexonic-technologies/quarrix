import * as db from './db';
import Papa from 'papaparse';
import { csvSafe } from './util';

export type MarketGroup = 'category' | 'country' | 'city' | 'source' | 'company' | 'grade' | 'status';
export type MarketMetrics = { records: number; companies: number; unlinked: number; website: number; rated: number; recentlyChecked: number; scored: number; averageFit: number | null; won: number; averageRating:number|null };
export type MarketRow = MarketMetrics & { key: string; label: string };
export type MarketReport = { total: MarketMetrics; groups: MarketRow[]; groupCount: number; generatedAt: string };

// Fixed expressions, no user-controlled SQL. The report never selects contact details or individual lead IDs.
const groupColumns: Record<MarketGroup, [string, string]> = {
  category: ["COALESCE(NULLIF(TRIM(l.category), ''), 'Unknown')", "COALESCE(NULLIF(TRIM(l.category), ''), 'Unknown')"],
  country: ["COALESCE(NULLIF(TRIM(l.country), ''), 'Unknown')", "COALESCE(NULLIF(TRIM(l.country), ''), 'Unknown')"],
  city: ["COALESCE(NULLIF(TRIM(l.city), ''), 'Unknown') || ' · ' || COALESCE(NULLIF(TRIM(l.country), ''), 'Unknown')", "COALESCE(NULLIF(TRIM(l.city), ''), 'Unknown') || ' · ' || COALESCE(NULLIF(TRIM(l.country), ''), 'Unknown')"],
  source: ["COALESCE(NULLIF(TRIM(l.source), ''), 'Unknown')", "COALESCE(NULLIF(TRIM(l.source), ''), 'Unknown')"],
  company: ["COALESCE(CAST(c.id AS TEXT), 'unlinked')", "COALESCE(c.name || ' · ' || c.domain, 'Unlinked')"],
  grade:["COALESCE(NULLIF(l.grade,''),'Unknown')","COALESCE(NULLIF(l.grade,''),'Unknown')"],
  status:["COALESCE(NULLIF(l.status,''),'Unknown')","COALESCE(NULLIF(l.status,''),'Unknown')"],
};
const metrics = `COUNT(*) records, COUNT(DISTINCT c.id) companies,
  COUNT(CASE WHEN c.id IS NULL THEN 1 END) unlinked,
  COUNT(CASE WHEN TRIM(l.website) <> '' THEN 1 END) website,
  COUNT(CASE WHEN l.rating BETWEEN 0 AND 5 THEN 1 END) rated,
  ROUND(AVG(CASE WHEN l.rating BETWEEN 0 AND 5 THEN l.rating END),2) averageRating,
  COUNT(CASE WHEN l.checked_at >= ? AND l.checked_at <= ? THEN 1 END) recentlyChecked,
  COUNT(CASE WHEN l.fit BETWEEN 0 AND 100 THEN 1 END) scored,
  ROUND(AVG(CASE WHEN l.fit BETWEEN 0 AND 100 THEN l.fit END), 1) averageFit,
  COUNT(CASE WHEN l.status = 'won' THEN 1 END) won`;

export function marketReport(group: MarketGroup, country: string, category: string, client: string, now = new Date()): MarketReport {
  const columns = Object.prototype.hasOwnProperty.call(groupColumns, group) ? groupColumns[group] : groupColumns.category;
  const [key, label] = columns;
  const from = `FROM leads l LEFT JOIN companies c ON c.id = l.company_id AND c.client = l.client WHERE (? = '' OR l.client = ?) AND (? = '' OR l.country = ?) AND (? = '' OR l.category = ?)`;
  const args = [client, client, country, country, category, category];
  const dates = [new Date(now.getTime() - 90 * 864e5).toISOString(), now.toISOString()];
  const total = db.raw().prepare(`SELECT ${metrics} ${from}`).get(...dates, ...args) as MarketMetrics;
  const groupCount = (db.raw().prepare(`SELECT COUNT(*) n FROM (SELECT ${key} ${from} GROUP BY ${key})`).get(...args) as { n: number }).n;
  const groups = db.raw().prepare(`SELECT ${key} key, ${label} label, ${metrics} ${from} GROUP BY ${key}, ${label} ORDER BY records DESC, label COLLATE NOCASE, key LIMIT 100`).all(...dates, ...args) as MarketRow[];
  return { total, groups, groupCount, generatedAt: now.toISOString() };
}

export function marketCsv(report: MarketReport, grouping: MarketGroup, country: string, category: string): string {
  const row = (label: string, m: MarketMetrics, kind: string) => ({ Kind: kind, Grouping: grouping, Group: csvSafe(label), CountryFilter: csvSafe(country), CategoryFilter: csvSafe(category), Records: m.records, LinkedCompanies: m.companies, UnlinkedRecords: m.unlinked, Websites: m.website, Rated: m.rated, MeanRating:m.averageRating??'',RecentChecks: m.recentlyChecked, Scored: m.scored, MeanFit: m.averageFit ?? '', Won: m.won, GeneratedAt: report.generatedAt, TotalGroups: report.groupCount });
  return '\uFEFF' + Papa.unparse([row('Total', report.total, 'total'), ...report.groups.map(g => row(g.label, g, 'group'))]);
}
export function salesByCurrency(client:string){
 return db.raw().prepare(`SELECT currency,COUNT(*) deals,COUNT(CASE WHEN d.stage='won' THEN 1 END) won,COUNT(CASE WHEN d.stage='lost' THEN 1 END) lost,COALESCE(SUM(CASE WHEN d.stage='won' THEN d.value END),0) wonValue,COALESCE(SUM(CASE WHEN d.stage NOT IN ('won','lost') THEN d.value END),0) openValue FROM deals d LEFT JOIN leads l ON l.id=d.lead_id WHERE (?='' OR l.client=?) GROUP BY currency ORDER BY currency`).all(client,client) as {currency:string;deals:number;won:number;lost:number;wonValue:number;openValue:number}[];
}
