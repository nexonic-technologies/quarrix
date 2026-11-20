// Pure geometry for radius and grid searches (QF-003, QF-004). No Electron or database imports, so it is testable.
export type Geo = { lat: number; lon: number; km: number; poly?: [number, number][] };
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
    const near = g.poly
      ? [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => inPolygon(g.poly!, { lat: c.lat + (a * latStep) / 2, lon: c.lon + (b * lonStep) / 2 }))
      : distanceKm(c, g) <= g.km + cellKm * 0.71;
    if (near) out.push({ ...c, key: `${i}:${j}` });
  }
  // Centre first, then outward, so a small budget still covers the middle.
  return out.sort((x, y) => distanceKm(x, g) - distanceKm(y, g));
}

/** Google Maps zoom that shows about cellKm across. */
export const zoomFor = (cellKm: number) => Math.max(11, Math.min(17, Math.round(Math.log2(40075 / cellKm) - 1)));

/** Keep a result only when it has no location or lies inside the circle (with a small margin). */
export const inside = (g: Geo, p: { lat: number | null; lon: number | null }): boolean => g.poly ? inPolygon(g.poly, p) : p.lat == null || p.lon == null || distanceKm(g, { lat: p.lat, lon: p.lon }) <= g.km * 1.1;

/** Inside a Nominatim box [south, north, west, east] with a margin; results without coordinates are kept. */
export function insideBox(b: number[], p: { lat: number | null; lon: number | null }, margin = 0.25) {
  if (p.lat == null || p.lon == null) return true;
  const [s, n, w, e] = b, dy = (n - s) * margin + 0.02, dx = (e - w) * margin + 0.02;
  return p.lat >= s - dy && p.lat <= n + dy && p.lon >= w - dx && p.lon <= e + dx;
}

/** Point in polygon (ray casting) for drawn search areas. Points are [lat, lon]. */
export function inPolygon(poly: [number, number][], p: { lat: number | null; lon: number | null }) {
  if (p.lat == null || p.lon == null) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** A circle around a polygon (centre and radius covering every corner), so polygon searches reuse the grid code. */
export function polygonCircle(poly: [number, number][]): Geo {
  const lat = poly.reduce((a, p) => a + p[0], 0) / poly.length, lon = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return { lat, lon, km: Math.max(0.5, ...poly.map((p) => distanceKm({ lat, lon }, { lat: p[0], lon: p[1] }))) };
}
