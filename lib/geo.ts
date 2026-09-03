const R = 6371000;
const rad = (x: number) => (x * Math.PI) / 180;

export function haversine(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** distanțe cumulate de-a lungul unei polilinii */
export function cumulative(shape: [number, number][]): number[] {
  const cum = new Array<number>(shape.length);
  cum[0] = 0;
  for (let i = 1; i < shape.length; i++) cum[i] = cum[i - 1] + haversine(shape[i - 1], shape[i]);
  return cum;
}

/** punctul de pe polilinie aflat la distanța `d` de la început, plus orientarea */
export function pointAt(shape: [number, number][], cum: number[], d: number): { lon: number; lat: number; bearing: number } {
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const a = shape[lo];
  const b = shape[Math.min(lo + 1, shape.length - 1)];
  const span = cum[lo + 1] - cum[lo];
  const t = span > 0 ? (target - cum[lo]) / span : 0;
  return {
    lon: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    bearing: bearingOf(a, b),
  };
}

export function bearingOf(a: [number, number], b: [number, number]): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** porțiunea de polilinie între două distanțe — pentru desenul „drumul rămas până la mine” */
export function slice(shape: [number, number][], cum: number[], from: number, to: number): [number, number][] {
  if (to <= from) return [];
  const out: [number, number][] = [];
  const start = pointAt(shape, cum, from);
  out.push([start.lon, start.lat]);
  for (let i = 0; i < shape.length; i++) {
    if (cum[i] > from && cum[i] < to) out.push(shape[i]);
  }
  const end = pointAt(shape, cum, to);
  out.push([end.lon, end.lat]);
  return out;
}
