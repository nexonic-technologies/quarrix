// Build the offline career catalog from the official O*NET 31.0 CSV files.
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';

const [occupations, essential, transferable, software] = process.argv.slice(2);
if (!software) throw new Error('Usage: node scripts/import-occupations.mjs occupation_data.csv essential_skills.csv transferable_skills.csv software_skills.csv');
const read = (file) => {
  const { data, errors } = Papa.parse(readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true });
  if (errors.length) throw new Error(`Invalid CSV: ${file}: ${errors[0].message}`);
  return data;
};
const rows = read(occupations), essentialRows = read(essential), transferableRows = read(transferable), softwareRows = read(software);
if (rows.length !== 1016 || essentialRows.length !== 18200 || transferableRows.length !== 45500 || softwareRows.length !== 31821) throw new Error('Incomplete or unexpected O*NET 31.0 distribution');
const skills = new Map(), tools = new Map();
for (const row of [...essentialRows, ...transferableRows]) {
  if (row['Scale ID'] !== 'IM' || row['Recommend Suppress'] === 'Y' || row['Not Relevant'] === 'Y') continue;
  const id = row['O*NET-SOC Code'], value = Number(row['Data Value']);
  if (!Number.isFinite(value) || !row['Element Name']) continue;
  const list = skills.get(id) ?? [];
  list.push([row['Element Name'], value]); skills.set(id, list);
}
for (const row of softwareRows) {
  const id = row['O*NET-SOC Code'], name = row['Workplace Example'];
  if (!name) continue;
  const list = tools.get(id) ?? [];
  list.push(name); tools.set(id, list);
}
const catalog = rows.map(r => {
  const id = r['O*NET-SOC Code'];
  return { id, title: r.Title, skills: (skills.get(id) ?? []).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(x => x[0]), tools: [...new Set(tools.get(id) ?? [])].sort() };
});
writeFileSync(new URL('../src/shared/occupations.json', import.meta.url), JSON.stringify(catalog));
console.log(`${catalog.length} occupations; ${catalog.filter(x => x.skills.length).length} with rated skills`);
