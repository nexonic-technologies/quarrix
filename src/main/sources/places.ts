// Google Places API (New): reliable, uses the person's own key and Google's free monthly allowance.
import { fetchText, sleep } from '../util';
import type { Candidate, Progress } from './types';

const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.location',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.primaryTypeDisplayName', 'places.businessStatus', 'nextPageToken',
].join(',');

export async function searchPlaces(key: string, category: string, place: string, limit: number, progress: Progress): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let pageToken = '';
  for (let page = 0; page < 3 && out.length < limit; page++) {
    const r = await fetchText('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery: `${category} in ${place}`, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    const j = JSON.parse(r.text || '{}');
    if (!r.ok) throw new Error(`Google Places: ${j.error?.message ?? 'HTTP ' + r.status}`);
    for (const p of j.places ?? []) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      const comp = (type: string, short = false) => {
        const c = (p.addressComponents ?? []).find((x: any) => x.types?.includes(type));
        return c ? (short ? c.shortText : c.longText) : '';
      };
      out.push({
        source: 'places', source_ref: p.id, name: p.displayName?.text ?? '', category: p.primaryTypeDisplayName?.text ?? category,
        address: p.formattedAddress ?? '', city: comp('locality') || comp('postal_town'), region: comp('administrative_area_level_1', true),
        country: comp('country', true), postcode: comp('postal_code'), lat: p.location?.latitude ?? null, lon: p.location?.longitude ?? null,
        phone: p.internationalPhoneNumber ?? '', email: '', website: p.websiteUri ?? '', rating: p.rating ?? null, reviews: p.userRatingCount ?? null,
      });
    }
    progress(`Google Places: ${out.length} found`, out.length);
    pageToken = j.nextPageToken ?? '';
    if (!pageToken) break;
    await sleep(1500);
  }
  return out.slice(0, limit);
}
