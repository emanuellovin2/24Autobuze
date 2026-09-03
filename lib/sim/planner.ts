import type { DayType, DirId } from '../types';
import { Simulation, localTime } from './engine';

export interface Leg {
  line: string;
  color: string;
  dir: DirId;
  headsign: string;
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  /** secunde de la miezul nopții */
  boardAt: number;
  alightAt: number;
  vehicleId: string;
  stops: number;
}

/** o destinație posibilă: stația de coborâre și cât se merge pe jos de acolo */
export interface Target {
  key: string;
  walk: number;
}

export interface Journey {
  id: string;
  legs: Leg[];
  transferKey?: string;
  transferName?: string;
  /** stația unde se coboară la final */
  destKey: string;
  /** metri de mers pe jos după coborâre */
  walk: number;
  departAt: number;
  arriveAt: number;
  waitSec: number;
  /** timpul total până la destinație, inclusiv mersul pe jos de la ultima stație */
  totalSec: number;
}

const TRANSFER_MIN = 90; // secunde minime pentru schimbarea autobuzului
const WALK_SPEED = 1.25; // m/s

export function walkSeconds(metres: number): number {
  return metres > 0 ? metres / WALK_SPEED : 0;
}

/* Plecările unei linii dintr-o anumită stație se recalculează des (lista se
 * împrospătează cât timp utilizatorul alege autobuzul), așa că le ținem minte. */
const boardCache = new WeakMap<Simulation, Map<string, { at: number; t: number }[]>>();

function departures(sim: Simulation, lineRef: string, dirId: DirId, idx: number, dayType: DayType) {
  let perSim = boardCache.get(sim);
  if (!perSim) boardCache.set(sim, (perSim = new Map()));
  const key = `${lineRef}|${dirId}|${dayType}|${idx}`;
  const hit = perSim.get(key);
  if (hit) return hit;

  const pd = sim.dirs.get(`${lineRef}|${dirId}`);
  const trips = pd?.line.trips[dayType]?.[dirId] ?? [];
  const list = trips
    .map((trip, t) => ({ at: trip.dep * 60 + sim.profile(pd!, trip.dur).dep[idx], t }))
    .sort((a, b) => a.at - b.at);
  perSim.set(key, list);
  return list;
}

/**
 * Caută drumuri de la o stație către oricare dintre stațiile din care se poate
 * ajunge pe jos la destinație: întâi linii directe, apoi cu o schimbare.
 * Rețeaua are 14 linii și 82 de stații, deci căutarea exhaustivă e instantanee.
 */
export function planJourney(
  sim: Simulation,
  fromKey: string,
  targets: Target[],
  ms: number,
  opts: { readyInSec?: number; limit?: number } = {}
): Journey[] {
  const { readyInSec = 0, limit = 8 } = opts;
  const { secOfDay, dayType } = localTime(ms);
  const earliest = secOfDay + readyInSec;
  const targetWalk = new Map(targets.map((t) => [t.key, t.walk]));
  if (targetWalk.has(fromKey)) return [];

  const results: Journey[] = [];

  /** prima cursă a acestui serviciu care pleacă din stația idx după `after` */
  const board = (lineRef: string, dirId: DirId, idx: number, after: number) => {
    const list = departures(sim, lineRef, dirId, idx, dayType);
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].at < after) lo = mid + 1;
      else hi = mid;
    }
    return lo < list.length ? list[lo] : null;
  };

  const arrivalAt = (lineRef: string, dirId: DirId, tripIdx: number, idx: number) => {
    const pd = sim.dirs.get(`${lineRef}|${dirId}`)!;
    const trip = pd.line.trips[dayType][dirId][tripIdx];
    return trip.dep * 60 + sim.profile(pd, trip.dur).arr[idx];
  };

  const makeLeg = (lineRef: string, dirId: DirId, i: number, j: number, after: number): Leg | null => {
    const pd = sim.dirs.get(`${lineRef}|${dirId}`);
    if (!pd) return null;
    const b = board(lineRef, dirId, i, after);
    if (!b) return null;
    return {
      line: lineRef,
      color: pd.line.color,
      dir: dirId,
      headsign: pd.dir.headsign,
      fromKey: pd.stopKeys[i],
      fromName: sim.stops.get(pd.stopKeys[i])?.name ?? pd.stopKeys[i],
      toKey: pd.stopKeys[j],
      toName: sim.stops.get(pd.stopKeys[j])?.name ?? pd.stopKeys[j],
      boardAt: b.at,
      alightAt: arrivalAt(lineRef, dirId, b.t, j),
      vehicleId: `${lineRef}|${dirId}|${dayType}|${b.t}`,
      stops: j - i,
    };
  };

  /** stația de coborâre care aduce utilizatorul cel mai repede la destinație */
  const bestExit = (stopKeys: string[], after: number) => {
    let best: { idx: number; walk: number } | null = null;
    for (let j = after + 1; j < stopKeys.length; j++) {
      const walk = targetWalk.get(stopKeys[j]);
      if (walk == null) continue;
      if (!best || walk < best.walk) best = { idx: j, walk };
    }
    return best;
  };

  const finish = (legs: Leg[], walk: number, via?: string): Journey => {
    const last = legs[legs.length - 1];
    return {
      id: legs.map((l) => l.vehicleId).join('>'),
      legs,
      transferKey: via,
      transferName: via ? sim.stops.get(via)?.name ?? via : undefined,
      destKey: last.toKey,
      walk,
      departAt: legs[0].boardAt,
      arriveAt: last.alightAt,
      waitSec: legs[0].boardAt - earliest,
      totalSec: last.alightAt + walkSeconds(walk) - earliest,
    };
  };

  /* ---- linii directe ---- */
  for (const svc of sim.services.get(fromKey) ?? []) {
    const pd = sim.dirs.get(`${svc.line.ref}|${svc.dir.id}`)!;
    const exit = bestExit(pd.stopKeys, svc.idx);
    if (!exit) continue;
    const leg = makeLeg(svc.line.ref, svc.dir.id, svc.idx, exit.idx, earliest);
    if (leg) results.push(finish([leg], exit.walk));
  }

  /* ---- cu o schimbare ---- */
  const bestDirect = results.length ? Math.min(...results.map((r) => r.totalSec)) : Infinity;
  for (const a of sim.services.get(fromKey) ?? []) {
    const pdA = sim.dirs.get(`${a.line.ref}|${a.dir.id}`)!;
    if (bestExit(pdA.stopKeys, a.idx)) continue; // deja acoperit de rutele directe
    for (let k = a.idx + 1; k < pdA.stopKeys.length; k++) {
      const via = pdA.stopKeys[k];
      if (via === fromKey || targetWalk.has(via)) continue;
      const onward = (sim.services.get(via) ?? []).filter(
        (b) => !(b.line.ref === a.line.ref && b.dir.id === a.dir.id) && bestExit(sim.dirs.get(`${b.line.ref}|${b.dir.id}`)!.stopKeys, b.idx)
      );
      if (!onward.length) continue;

      const legA = makeLeg(a.line.ref, a.dir.id, a.idx, k, earliest);
      if (!legA) continue;

      for (const b of onward) {
        const pdB = sim.dirs.get(`${b.line.ref}|${b.dir.id}`)!;
        const exit = bestExit(pdB.stopKeys, b.idx)!;
        const legB = makeLeg(b.line.ref, b.dir.id, b.idx, exit.idx, legA.alightAt + TRANSFER_MIN);
        if (!legB) continue;
        const j = finish([legA, legB], exit.walk, via);
        if (j.totalSec >= bestDirect) continue; // nu propunem un schimb mai lent decât direct
        results.push(j);
      }
    }
  }

  const seen = new Set<string>();
  return results
    .sort((x, y) => x.totalSec - y.totalSec || x.legs.length - y.legs.length)
    .filter((r) => {
      // o singură variantă pe combinația de linii: următoarea cursă a aceleiași
      // linii nu e o opțiune nouă pentru cineva care pleacă acum
      const sig = r.legs.map((l) => `${l.line}|${l.dir}`).join('>');
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, limit);
}
