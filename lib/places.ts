import type { Network, Stop } from './types';
import type { Target } from './sim/planner';
import { fold, sortLines } from './format';

/* ------------------------------------------------------------------ *
 * Străzile Bacăului
 *
 * Fișierul public/places.json (generat de scripts/4-build-places.mjs din
 * OpenStreetMap) ține fiecare stradă cu numele, geometria ei simplificată și
 * stațiile din care se ajunge pe jos acolo. Se încarcă separat de rețea, ca
 * harta să pornească fără să aștepte 130 KB de străzi.
 * ------------------------------------------------------------------ */

/** forma compactă din fișier: n = nume, loc = localitate, c = centru, l = lungime, g = geometrie, s = stații */
interface RawStreet {
  n: string;
  loc: string;
  c: [number, number];
  l: number;
  g: [number, number][][];
  s: [string, number][];
}

export interface Street {
  name: string;
  locality: string;
  /** un punct de pe stradă, pentru hartă și pentru eticheta destinației */
  lon: number;
  lat: number;
  length: number;
  /** segmentele străzii, simplificate — se desenează pe hartă la selectare */
  parts: [number, number][][];
  /** stațiile de pe jos, cea mai apropiată prima */
  stops: Target[];
}

export interface Places {
  city: string;
  generated: string;
  streets: Street[];
}

export async function loadPlaces(): Promise<Places> {
  const res = await fetch('/places.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as { city: string; generated: string; streets: RawStreet[] };
  return {
    city: raw.city,
    generated: raw.generated,
    streets: raw.streets.map((s) => ({
      name: s.n,
      locality: s.loc,
      lon: s.c[0],
      lat: s.c[1],
      length: s.l,
      parts: s.g,
      stops: s.s.map(([key, walk]) => ({ key, walk })),
    })),
  };
}

/** „Strada Mioriței” -> „mioritei”: omul scrie doar numele, nu și cuvântul „strada” */
const PREFIX = /^(strada|str\.?|bulevardul|bulevard|bd\.?|b-dul|calea|aleea|intrarea|int\.?|soseaua|sos\.?|drumul|piata|splaiul|prelungirea|fundacul|centura)\s+/;

export function shortName(name: string): string {
  const bare = fold(name).replace(PREFIX, '');
  return bare || fold(name);
}

/** eticheta de sub numele străzii: lungimea și stația cea mai apropiată */
export function streetSubtitle(street: Street, net: Network): string {
  const stop = net.stops.find((s) => s.key === street.stops[0]?.key);
  const where = street.locality === 'Bacău' ? 'stradă' : `stradă · ${street.locality}`;
  return stop ? `${where} · stația ${stop.name}` : where;
}

/** liniile care opresc în stațiile de lângă stradă */
export function linesNear(street: Street, net: Network, limit = 4): string[] {
  const byKey = new Map(net.stops.map((s) => [s.key, s]));
  const out: string[] = [];
  for (const t of street.stops) {
    if (t.walk > 800 && out.length) break;
    for (const line of byKey.get(t.key)?.lines ?? []) if (!out.includes(line)) out.push(line);
  }
  return sortLines(out).slice(0, limit);
}

/** stațiile din care se poate ajunge pe jos la un punct oarecare de pe hartă */
export function nearestStops(net: Network, lon: number, lat: number, limit = 4): { stop: Stop; walk: number }[] {
  const kx = Math.cos((lat * Math.PI) / 180) * 111320;
  const near = net.stops
    .map((s) => ({ stop: s, walk: Math.round(Math.hypot((s.lon - lon) * kx, (s.lat - lat) * 110540)) }))
    .sort((a, b) => a.walk - b.walk);
  return near.filter((s, i) => i === 0 || (s.walk < 900 && i < limit));
}

/** strada cea mai apropiată de un punct — dă nume unui loc atins pe hartă */
export function streetAt(places: Places | null, lon: number, lat: number): { street: Street; distance: number } | null {
  if (!places) return null;
  const kx = Math.cos((lat * Math.PI) / 180) * 111320;
  let best: { street: Street; distance: number } | null = null;
  for (const street of places.streets) {
    for (const part of street.parts) {
      for (const p of part) {
        const d = Math.hypot((p[0] - lon) * kx, (p[1] - lat) * 110540);
        if (!best || d < best.distance) best = { street, distance: d };
      }
    }
  }
  return best;
}
