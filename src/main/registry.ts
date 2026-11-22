import { fetchText, BOT_UA } from './util';
import { parseRegistry } from '../shared/verified';

// Only public legal-entity names and country codes are transmitted, on explicit request.
export async function registryLookup(name: string, country: string) {
  if (!name.trim() || name.length > 200 || !/^[A-Z]{2}$/.test(country)) throw new Error('Enter a legal company name and country code.');
  const url = new URL('https://api.gleif.org/api/v1/lei-records');
  url.searchParams.set('filter[entity.legalName]', name.trim());
  url.searchParams.set('filter[entity.legalAddress.country]', country);
  url.searchParams.set('page[size]', '20');
  const response = await fetchText(url.href, {ua:BOT_UA,timeout:15000,maxBytes:1_000_000,headers:{Accept:'application/vnd.api+json'}});
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}.`);
  return {matches:parseRegistry(JSON.parse(response.text),name,country),checkedAt:new Date().toISOString()};
}
