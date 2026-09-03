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

export interface Journey {
  id: string;
  legs: Leg[];
  transferKey?: string;
  transferName?: string;
  departAt: number;
  arriveAt: number;
  waitSec: number;
  totalSec: number;
}

const TRANSFER_MIN = 90; // secunde minime pentru schimbarea autobuzului

/**
 * Caută drumuri de la o stație la alta: întâi linii directe, apoi cu o schimbare.
 * Rețeaua are 14 linii și 82 de stații, deci căutarea exhaustivă e instantanee.
 */
export function planJourney(sim: Simulation, fromKey: string, toKey: string, ms: number, readyInSec = 0): Journey[] {
  if (fromKey === toKey) return [];
  const { secOfDay, dayType } = localTime(ms);
  const earliest = secOfDay + readyInSec;

  const results: Journey[] = [];

  /** prima cursă a acestui serviciu care pleacă din stația idx după `after` */
  const board = (lineRef: string, dirId: DirId, idx: number, after: number) => {
    const pd = sim.dirs.get(`${lineRef}|${dirId}`);
    if (!pd) return null;
    const trips = pd.line.trips[dayType as DayType]?.[dirId] ?? [];
    let best: { at: number; tripId: string; tripIdx: number } | null = null;
    for (let t = 0; t < trips.length; t++) {
      const prof = profileOf(sim, lineRef, dirId, trips[t].dur);
      if (!prof) continue;
      const at = trips[t].dep * 60 + prof.dep[idx];
      if (at < after) continue;
      if (!best || at < best.at) best = { at, tripId: `${lineRef}|${dirId}|${dayType}|${t}`, tripIdx: t };
    }
    return best;
  };

  const arriveAt = (lineRef: string, dirId: DirId, tripIdx: number, idx: number) => {
    const pd = sim.dirs.get(`${lineRef}|${dirId}`)!;
    const trip = pd.line.trips[dayType as DayType][dirId][tripIdx];
    const prof = profileOf(sim, lineRef, dirId, trip.dur)!;
    return trip.dep * 60 + prof.arr[idx];
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
      alightAt: arriveAt(lineRef, dirId, b.tripIdx, j),
      vehicleId: b.tripId,
      stops: j - i,
    };
  };

  /* ---- linii directe ---- */
  for (const svc of sim.services.get(fromKey) ?? []) {
    const pd = sim.dirs.get(`${svc.line.ref}|${svc.dir.id}`)!;
    const j = pd.stopKeys.indexOf(toKey, svc.idx + 1);
    if (j < 0) continue;
    const leg = makeLeg(svc.line.ref, svc.dir.id, svc.idx, j, earliest);
    if (!leg) continue;
    results.push({
      id: `d-${leg.vehicleId}`,
      legs: [leg],
      departAt: leg.boardAt,
      arriveAt: leg.alightAt,
      waitSec: leg.boardAt - earliest,
      totalSec: leg.alightAt - earliest,
    });
  }

  /* ---- cu o schimbare ---- */
  const bestDirect = results.length ? Math.min(...results.map((r) => r.arriveAt)) : Infinity;
  for (const a of sim.services.get(fromKey) ?? []) {
    const pdA = sim.dirs.get(`${a.line.ref}|${a.dir.id}`)!;
    if (pdA.stopKeys.includes(toKey, a.idx + 1)) continue; // deja acoperit de rutele directe
    for (let k = a.idx + 1; k < pdA.stopKeys.length; k++) {
      const via = pdA.stopKeys[k];
      if (via === fromKey || via === toKey) continue;
      const onward = (sim.services.get(via) ?? []).filter(
        (b) => !(b.line.ref === a.line.ref && b.dir.id === a.dir.id) && sim.dirs.get(`${b.line.ref}|${b.dir.id}`)!.stopKeys.includes(toKey, b.idx + 1)
      );
      if (!onward.length) continue;

      const legA = makeLeg(a.line.ref, a.dir.id, a.idx, k, earliest);
      if (!legA) continue;

      for (const b of onward) {
        const pdB = sim.dirs.get(`${b.line.ref}|${b.dir.id}`)!;
        const j = pdB.stopKeys.indexOf(toKey, b.idx + 1);
        const legB = makeLeg(b.line.ref, b.dir.id, b.idx, j, legA.alightAt + TRANSFER_MIN);
        if (!legB) continue;
        if (legB.alightAt >= bestDirect) continue; // nu propunem un schimb mai lent decât direct
        results.push({
          id: `t-${legA.vehicleId}-${legB.vehicleId}`,
          legs: [legA, legB],
          transferKey: via,
          transferName: sim.stops.get(via)?.name ?? via,
          departAt: legA.boardAt,
          arriveAt: legB.alightAt,
          waitSec: legA.boardAt - earliest,
          totalSec: legB.alightAt - earliest,
        });
      }
    }
  }

  const seen = new Set<string>();
  return results
    .sort((x, y) => x.arriveAt - y.arriveAt || x.legs.length - y.legs.length)
    .filter((r) => {
      const sig = r.legs.map((l) => `${l.line}@${Math.round(l.boardAt / 60)}`).join('>');
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, 4);
}

/** profilul cursei — aceleași calcule ca pentru poziția desenată pe hartă */
function profileOf(sim: Simulation, lineRef: string, dirId: DirId, dur: number) {
  const pd = sim.dirs.get(`${lineRef}|${dirId}`);
  return pd ? sim.profile(pd, dur) : null;
}
