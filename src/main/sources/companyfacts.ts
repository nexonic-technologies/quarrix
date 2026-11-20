// Company size and growth from Wikidata (CC0), matched by the company's official website (P856).
// Only published facts are used: employees (P1128) with their dates give growth; founding date (P571); revenue (P2139).
import { BOT_UA, fetchText } from '../util';

const getJson = async (url: string) => { const r = await fetchText(url, { ua: BOT_UA, timeout: 20000, headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return JSON.parse(r.text); };
const time = (v: any) => String(v?.time ?? '').replace(/^\+/, '').slice(0, 10);

/** Turn Wikidata claims into size and growth facts. Pure, exported for tests. */
export function factsFromClaims(id: string, claims: Record<string, any[]>) {
  const emp = (claims.P1128 ?? []).filter((c) => c.rank !== 'deprecated').map((c) => ({ n: Number(c.mainsnak?.datavalue?.value?.amount), at: time(c.qualifiers?.P585?.[0]?.datavalue?.value) })).filter((x) => Number.isFinite(x.n) && x.n > 0).sort((a, b) => a.at.localeCompare(b.at));
  const latest = emp[emp.length - 1];
  const earlier = emp.length > 1 ? emp[0] : null;
  const years = earlier && latest.at && earlier.at ? (Date.parse(latest.at) - Date.parse(earlier.at)) / (365.25 * 864e5) : 0;
  const growth = earlier && years >= 1 ? Math.round(((latest.n / earlier.n) ** (1 / years) - 1) * 1000) / 10 : null;
  const rev = (claims.P2139 ?? []).map((c) => ({ amount: Number(c.mainsnak?.datavalue?.value?.amount), unit: String(c.mainsnak?.datavalue?.value?.unit ?? '').split('/').pop(), at: time(c.qualifiers?.P585?.[0]?.datavalue?.value) })).filter((x) => Number.isFinite(x.amount)).sort((a, b) => a.at.localeCompare(b.at)).pop();
  const founded = time(claims.P571?.[0]?.mainsnak?.datavalue?.value).slice(0, 4);
  return {
    wikidata: id, source: 'Wikidata (CC0)',
    ...(latest ? { employees: latest.n, employeesAt: latest.at || null } : {}),
    ...(growth != null ? { employeeGrowthPerYear: growth, growthSince: earlier!.at } : {}),
    ...(founded ? { founded } : {}),
    ...(rev ? { revenue: rev.amount, revenueCurrency: rev.unit, revenueAt: rev.at || null } : {}),
  };
}

/** Find the Wikidata item whose official website is this domain, then read its facts. Returns null when there is none. */
export async function companyFacts(domain: string) {
  const d = domain.replace(/^www\./, '').toLowerCase();
  for (const url of [`https://${d}/`, `https://www.${d}/`, `https://${d}`, `https://www.${d}`, `http://${d}/`, `http://www.${d}/`]) {
    const s = await getJson(`https://www.wikidata.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(`haswbstatement:P856=${url}`)}`);
    const id = s.query?.search?.[0]?.title;
    if (!id) continue;
    const e = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${encodeURIComponent(id)}`);
    return factsFromClaims(id, e.entities?.[id]?.claims ?? {});
  }
  return null;
}
