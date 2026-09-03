import type { Landmark, Network, Stop } from './types';
import type { Target } from './sim/planner';
import { fold } from './format';

export interface SearchHit {
  kind: 'stop' | 'landmark';
  /** stația de urcat/coborât */
  stopKey: string;
  title: string;
  subtitle: string;
  lon: number;
  lat: number;
  walk?: number;
  /** toate stațiile din care se poate ajunge pe jos aici — planificatorul o alege pe cea mai bună */
  targets: Target[];
  score: number;
}

/** un reper cunoscut, gata de folosit ca destinație */
export function landmarkHit(l: Landmark, net: Network): SearchHit {
  const near = l.stops[0];
  return {
    kind: 'landmark',
    stopKey: near.key,
    title: l.name,
    subtitle: `${l.cat} · stația ${stopName(net, near.key)}`,
    lon: l.lon,
    lat: l.lat,
    walk: near.walk,
    targets: l.stops.slice(0, 3).map((s) => ({ key: s.key, walk: s.walk })),
    score: 0,
  };
}

/** o stație, ca destinație */
export function stopHit(s: Stop): SearchHit {
  return {
    kind: 'stop',
    stopKey: s.key,
    title: s.name,
    subtitle: `stație · liniile ${s.lines.join(', ')}`,
    lon: s.lon,
    lat: s.lat,
    targets: [{ key: s.key, walk: 0 }],
    score: 0,
  };
}

/** reperele pe care le caută cei mai mulți oameni — se arată înainte de a scrie ceva */
const POPULAR = [
  'gara bacau',
  'arena mall',
  'piata centrala',
  'spitalul judetean de urgenta',
  'supernova bacau fost cora',
  'autogara bacau',
  'auchan',
  'universitatea vasile alecsandri',
  'stadionul municipal',
  'complex luceafarul',
  'insula de agrement',
  'cartier serbanesti',
];

export function popularDestinations(net: Network, limit = 12): SearchHit[] {
  const byName = new Map(net.landmarks.map((l) => [fold(l.name), l]));
  const out: SearchHit[] = [];
  for (const name of POPULAR) {
    const l = byName.get(name);
    if (l && l.stops.length) out.push(landmarkHit(l, net));
  }
  // dacă datele se schimbă și un reper dispare, completăm cu ce e în rețea
  for (const l of net.landmarks) {
    if (out.length >= limit) break;
    if (l.stops.length && !out.some((h) => h.title === l.name)) out.push(landmarkHit(l, net));
  }
  return out.slice(0, limit);
}

/**
 * Căutare pe nume de stații ȘI pe repere cunoscute din oraș.
 * Cetățeanul scrie „mall”, „gara”, „luceafarul” — nu numele oficial al stației.
 */
export function buildSearchIndex(net: Network) {
  const stops = net.stops.map((s: Stop) => ({ s, hay: fold(s.name) }));
  const marks = net.landmarks.map((l: Landmark) => ({
    l,
    hay: [fold(l.name), ...l.alias.map(fold)].join(' | '),
  }));

  return function search(query: string, limit = 8): SearchHit[] {
    const q = fold(query);
    if (!q) return [];
    const hits: SearchHit[] = [];

    for (const { l, hay } of marks) {
      const score = match(hay, q);
      if (score <= 0 || !l.stops.length) continue;
      hits.push({ ...landmarkHit(l, net), score: score + 0.35 }); // reperele cunoscute bat numele oficiale de stații
    }

    for (const { s, hay } of stops) {
      const score = match(hay, q);
      if (score <= 0) continue;
      hits.push({ ...stopHit(s), score });
    }

    const seen = new Set<string>();
    return hits
      .sort((a, b) => b.score - a.score)
      .filter((h) => {
        const k = h.kind + h.title;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, limit);
  };
}

function match(hay: string, q: string): number {
  if (hay === q) return 3;
  const words = hay.split(/[ |]+/);
  if (words.includes(q)) return 2.5;
  if (words.some((w) => w.startsWith(q))) return 2;
  if (hay.includes(q)) return 1.2;
  // toleranță la o literă lipsă/greșită pentru interogări scurte
  if (q.length >= 4 && words.some((w) => close(w, q))) return 0.8;
  return 0;
}

function close(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++diff > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

function stopName(net: Network, key: string) {
  return net.stops.find((s) => s.key === key)?.name ?? key;
}

/** cea mai apropiată stație de un punct de pe hartă — pentru selecția prin atingere */
export function nearestStop(net: Network, lon: number, lat: number): { stop: Stop; distance: number } {
  let best: { stop: Stop; distance: number } | null = null;
  for (const s of net.stops) {
    const dx = (s.lon - lon) * Math.cos((lat * Math.PI) / 180) * 111320;
    const dy = (s.lat - lat) * 110540;
    const d = Math.hypot(dx, dy);
    if (!best || d < best.distance) best = { stop: s, distance: d };
  }
  return best!;
}
