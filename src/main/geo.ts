// Pure geometry for radius and grid searches (QF-003, QF-004). No Electron or database imports, so it is testable.
export type Geo = { lat: number; lon: number; km: number };
export type BBox = { s: number; w: number; n: number; e: number };

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bboxOf(g: Geo): BBox {
  const dLat = g.km / 111.32;
  const dLon = g.km / (111.32 * Math.max(0.05, Math.cos(rad(g.lat))));
  return { s: g.lat - dLat, n: g.lat + dLat, w: g.lon - dLon, e: g.lon + dLon };
}

/**
 * Split a circle into square cells about cellKm wide, keeping only cells that touch the circle.
 * Cells overlap by 10% so places on a border are not missed; duplicates are merged when saving.
 */
export function gridCells(g: Geo, cellKm: number): { lat: number; lon: number; key: string }[] {
  const step = cellKm * 0.9;
  const n = Math.max(1, Math.ceil((2 * g.km) / step));
  const out: { lat: number; lon: number; key: string }[] = [];
  const b = bboxOf(g);
  const latStep = (b.n - b.s) / n, lonStep = (b.e - b.w) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const c = { lat: b.s + latStep * (i + 0.5), lon: b.w + lonStep * (j + 0.5) };
    if (distanceKm(c, g) <= g.km + cellKm * 0.71) out.push({ ...c, key: `${i}:${j}` });
  }
  // Centre first, then outward, so a small budget still covers the middle.
  return out.sort((x, y) => distanceKm(x, g) - distanceKm(y, g));
}

/** Google Maps zoom that shows about cellKm across. */
export const zoomFor = (cellKm: number) => Math.max(11, Math.min(17, Math.round(Math.log2(40075 / cellKm) - 1)));

/** Keep a result only when it has no location or lies inside the circle (with a small margin). */
export const inside = (g: Geo, p: { lat: number | null; lon: number | null }) => p.lat == null || p.lon == null || distanceKm(g, { lat: p.lat, lon: p.lon }) <= g.km * 1.1;
