// Place APIs with the person's own free key: accurate, official data with phone numbers and websites.
import { fetchText, sleep } from '../util';
import type { Candidate, Progress } from './types';

const blank = (c: Partial<Candidate>): Candidate => ({ source: 'tomtom', source_ref: '', name: '', category: '', address: '', city: '', region: '', country: '', postcode: '', lat: null, lon: null, phone: '', email: '', website: '', ...c });

/** TomTom Search API: free tier of 2,500 requests a day. */
export async function searchTomTom(key: string, category: string, place: string, near: { lat: number; lon: number } | null, country: string, limit: number, progress: Progress) {
  const out: Candidate[] = [];
  for (let ofs = 0; ofs < 1900 && out.length < limit; ofs += 100) {
    const geo = near ? `&lat=${near.lat}&lon=${near.lon}&radius=40000` : '';
    const r = await fetchText(`https://api.tomtom.com/search/2/search/${encodeURIComponent(near ? category : `${category} ${place}`)}.json?key=${key}&limit=100&ofs=${ofs}&idxSet=POI${geo}${country ? `&countrySet=${country}` : ''}&language=en-GB`, { timeout: 25000 });
    if (!r.ok) throw new Error(`TomTom: HTTP ${r.status}${r.status === 403 ? ' (check the key)' : ''}`);
    const j = JSON.parse(r.text);
    for (const x of j.results ?? []) {
      const a = x.address ?? {};
      out.push(blank({ source: 'tomtom', source_ref: x.id, name: x.poi?.name ?? '', category: (x.poi?.categories ?? [])[0] ?? category, address: a.freeformAddress ?? '',
        city: a.municipality ?? '', region: a.countrySubdivision ?? '', country: a.countryCode ?? country, postcode: a.postalCode ?? '', lat: x.position?.lat ?? null, lon: x.position?.lon ?? null,
        phone: x.poi?.phone ?? '', website: x.poi?.url ? (/^https?:/.test(x.poi.url) ? x.poi.url : `https://${x.poi.url}`) : '' }));
    }
    progress(`TomTom: ${out.length} businesses`, out.length);
    if ((j.results ?? []).length < 100) break;
    await sleep(300);
  }
  return out.slice(0, limit);
}

/** Foursquare Places API: free monthly allowance with a service key. */
export async function searchFoursquare(key: string, category: string, place: string, near: { lat: number; lon: number } | null, limit: number, progress: Progress) {
  const out: Candidate[] = [];
  let next = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(category)}&${near ? `ll=${near.lat},${near.lon}&radius=40000` : `near=${encodeURIComponent(place)}`}&limit=50&fields=fsq_place_id,name,location,tel,website,email,categories,latitude,longitude,social_media,rating`;
  for (let page = 0; page < 20 && next && out.length < limit; page++) {
    const r = await fetchText(next, { timeout: 25000, headers: { Authorization: `Bearer ${key}`, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Foursquare: HTTP ${r.status}${r.status === 401 ? ' (check the key)' : ''}`);
    const j = JSON.parse(r.text);
    for (const x of j.results ?? []) {
      const l = x.location ?? {};
      out.push(blank({ source: 'foursquare', source_ref: x.fsq_place_id, name: x.name, category: x.categories?.[0]?.name ?? category, address: l.formatted_address ?? l.address ?? '',
        city: l.locality ?? '', region: l.region ?? '', country: l.country ?? '', postcode: l.postcode ?? '', lat: x.latitude ?? null, lon: x.longitude ?? null,
        phone: x.tel ?? '', email: x.email ?? '', website: x.website ?? '', rating: x.rating ? Math.round(x.rating) / 2 : null,
        socials: Object.fromEntries(Object.entries({ facebook: x.social_media?.facebook_id && `https://facebook.com/${x.social_media.facebook_id}`, instagram: x.social_media?.instagram && `https://instagram.com/${x.social_media.instagram}`, twitter: x.social_media?.twitter && `https://x.com/${x.social_media.twitter}` }).filter(([, v]) => v)) as Record<string, string> }));
    }
    progress(`Foursquare: ${out.length} businesses`, out.length);
    const link = r.link ?? '';
    next = (String(link).match(/<([^>]+)>;\s*rel="next"/) ?? [])[1] ?? '';
  }
  return out.slice(0, limit);
}
