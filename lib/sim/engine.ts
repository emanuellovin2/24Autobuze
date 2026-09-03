import type { Arrival, DayType, DirId, Direction, Line, Network, Stop, Vehicle } from '../types';
import { cumulative, pointAt, slice } from '../geo';

/* ------------------------------------------------------------------ *
 * Motorul de simulație
 *
 * Nu inventează poziții aleatorii: pornește de la orarul real publicat de
 * Transport Public Bacău. Pentru fiecare cursă știm ora de plecare din capăt
 * și durata; distribuim durata pe traseu proporțional cu distanța, plus
 * timpul de staționare în stații. De aici rezultă, pentru orice moment:
 *   - unde se află autobuzul pe traseu (poziția desenată pe hartă)
 *   - în cât timp ajunge în fiecare stație (ETA-ul afișat)
 * Ambele ies din aceeași formulă, deci nu pot să se contrazică.
 * ------------------------------------------------------------------ */

const HOUR = 3600;
const DAY = 24 * HOUR;

export interface PreparedDir {
  line: Line;
  dir: Direction;
  cum: number[];
  total: number;
  stopKeys: string[];
}

/** unde oprește o linie într-o anumită stație */
export interface Service {
  key: string;
  line: Line;
  dir: Direction;
  idx: number;
}

interface Profile {
  /** secunde de la plecarea din capăt până la sosirea în stația i */
  arr: number[];
  /** secunde până la plecarea din stația i */
  dep: number[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** ora locală a Bacăului, indiferent de fusul calculatorului care rulează demo-ul */
const tzFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hour12: false,
});

let tzCacheKey = -1;
let tzCache = { secOfDay: 0, dayType: 'LV' as DayType, weekday: 'Mon' };

export function localTime(ms: number): { secOfDay: number; dayType: DayType; weekday: string } {
  const minute = Math.floor(ms / 60000);
  if (minute !== tzCacheKey) {
    const parts = tzFormat.formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
    const weekday = get('weekday');
    tzCache = {
      secOfDay: +get('hour') * 3600 + +get('minute') * 60,
      dayType: weekday === 'Sat' || weekday === 'Sun' ? 'SD' : 'LV',
      weekday,
    };
    tzCacheKey = minute;
  }
  // secundele le luăm din ceasul real ca mișcarea să fie continuă, nu în trepte de un minut
  return { ...tzCache, secOfDay: tzCache.secOfDay + (ms % 60000) / 1000 };
}

export class Simulation {
  readonly net: Network;
  readonly stops: Map<string, Stop>;
  /** `${linie}|${sens}` -> traseu pregătit */
  readonly dirs: Map<string, PreparedDir> = new Map();
  /** stație -> liniile care opresc acolo */
  readonly services: Map<string, Service[]> = new Map();
  private profiles: Map<string, Profile> = new Map();

  constructor(net: Network) {
    this.net = net;
    this.stops = new Map(net.stops.map((s) => [s.key, s]));

    for (const line of net.lines) {
      for (const dir of line.directions) {
        const cum = cumulative(dir.shape);
        const key = `${line.ref}|${dir.id}`;
        this.dirs.set(key, { line, dir, cum, total: cum[cum.length - 1], stopKeys: dir.stops.map((s) => s.key) });
        dir.stops.forEach((s, idx) => {
          if (!this.services.has(s.key)) this.services.set(s.key, []);
          this.services.get(s.key)!.push({ key: s.key, line, dir, idx });
        });
      }
    }
  }

  /** repartizează durata publicată a cursei pe stațiile traseului */
  /** public pentru planificator: folosește exact aceleași calcule ca poziția de pe hartă */
  profile(pd: PreparedDir, durMin: number): Profile {
    const cacheKey = `${pd.line.ref}|${pd.dir.id}|${durMin}`;
    const hit = this.profiles.get(cacheKey);
    if (hit) return hit;

    const stops = pd.dir.stops;
    const n = stops.length;
    const dwell = this.net.dwellSeconds;
    const total = durMin * 60;
    const interior = Math.max(0, n - 2);
    // staționările nu pot mânca mai mult de 30% din cursă
    const dwellTotal = Math.min(dwell * interior, total * 0.3);
    const perDwell = interior > 0 ? dwellTotal / interior : 0;
    const moving = total - dwellTotal;

    const arr = new Array<number>(n);
    const dep = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const frac = pd.total > 0 ? stops[i].d / pd.total : i / (n - 1);
      arr[i] = frac * moving + perDwell * Math.max(0, i - 1);
      dep[i] = i === 0 || i === n - 1 ? arr[i] : arr[i] + perDwell;
    }
    arr[n - 1] = total;
    dep[n - 1] = total;

    const p = { arr, dep };
    this.profiles.set(cacheKey, p);
    return p;
  }

  /** întârziere reproductibilă: aceeași cursă arată la fel pentru toți utilizatorii */
  private delay(tripId: string, secOfDay: number): number {
    const seed = hash(tripId);
    const amp = 25 + seed * 130;
    const slow = Math.sin(secOfDay / 430 + seed * 40);
    const fast = Math.sin(secOfDay / 145 + seed * 130);
    const rush = isRush(secOfDay) ? 0.55 : 0;
    return (slow * 0.7 + fast * 0.3 + rush) * amp;
  }

  private occupancy(tripId: string, secOfDay: number): number {
    const seed = hash(tripId + 'o');
    const base = isRush(secOfDay) ? 0.72 : secOfDay < 7 * HOUR || secOfDay > 20 * HOUR ? 0.18 : 0.42;
    return Math.max(0.03, Math.min(1, base + (seed - 0.5) * 0.45));
  }

  /** toate cursele aflate pe traseu la momentul dat */
  vehiclesAt(ms: number): Vehicle[] {
    const { secOfDay, dayType } = localTime(ms);
    const out: Vehicle[] = [];
    for (const pd of this.dirs.values()) {
      const trips = pd.line.trips[dayType]?.[pd.dir.id] ?? [];
      for (let t = 0; t < trips.length; t++) {
        const trip = trips[t];
        const tripId = `${pd.line.ref}|${pd.dir.id}|${dayType}|${t}`;
        // o cursă pornită aseară poate fi încă pe traseu după miezul nopții
        for (const offset of [0, DAY]) {
          const start = trip.dep * 60 - offset;
          const elapsed = secOfDay - start;
          if (elapsed < 0 || elapsed > trip.dur * 60 + 240) continue;
          const v = this.buildVehicle(pd, trip, tripId, elapsed, secOfDay);
          if (v) out.push(v);
        }
      }
    }
    return out;
  }

  private buildVehicle(pd: PreparedDir, trip: { dep: number; dur: number }, tripId: string, elapsed: number, secOfDay: number): Vehicle | null {
    const prof = this.profile(pd, trip.dur);
    const delay = this.delay(tripId, secOfDay);
    const eff = Math.max(0, Math.min(trip.dur * 60, elapsed - delay));

    const stops = pd.dir.stops;
    let i = 0;
    while (i < stops.length - 1 && prof.arr[i + 1] <= eff) i++;

    let d: number;
    if (eff <= prof.dep[i]) {
      d = stops[i].d; // staționează în stație
    } else {
      const span = prof.arr[i + 1] - prof.dep[i];
      const f = span > 0 ? (eff - prof.dep[i]) / span : 1;
      d = stops[i].d + (stops[i + 1].d - stops[i].d) * f;
    }

    const p = pointAt(pd.dir.shape, pd.cum, d);
    const nextIdx = Math.min(i + (eff > prof.dep[i] ? 1 : 0), stops.length - 1);
    return {
      id: tripId,
      line: pd.line.ref,
      color: pd.line.color,
      dir: pd.dir.id,
      headsign: pd.dir.headsign,
      lon: p.lon,
      lat: p.lat,
      bearing: p.bearing,
      delay,
      nextStopIdx: nextIdx,
      nextStopKey: stops[nextIdx].key,
      nextStopEta: Math.max(0, prof.arr[nextIdx] - eff),
      occupancy: this.occupancy(tripId, secOfDay),
      progress: pd.total > 0 ? d / pd.total : 0,
    };
  }

  /** panoul de sosiri dintr-o stație, exact ca afișajul din stație */
  arrivalsAt(stopKey: string, ms: number, limit = 8, horizonMin = 75): Arrival[] {
    const { secOfDay, dayType } = localTime(ms);
    const out: Arrival[] = [];
    for (const svc of this.services.get(stopKey) ?? []) {
      const pd = this.dirs.get(`${svc.line.ref}|${svc.dir.id}`)!;
      const trips = svc.line.trips[dayType]?.[svc.dir.id] ?? [];
      for (let t = 0; t < trips.length; t++) {
        const trip = trips[t];
        const tripId = `${svc.line.ref}|${svc.dir.id}|${dayType}|${t}`;
        const prof = this.profile(pd, trip.dur);
        for (const offset of [0, DAY, -DAY]) {
          const scheduled = trip.dep * 60 + prof.arr[svc.idx] + offset;
          const eta = scheduled - secOfDay;
          if (eta < -45 || eta > horizonMin * 60) continue;
          // autobuzul e „live” doar dacă a plecat deja din capăt
          const live = secOfDay >= trip.dep * 60 + offset;
          const delay = live ? this.delay(tripId, secOfDay) : 0;
          out.push({
            vehicleId: tripId,
            line: svc.line.ref,
            color: svc.line.color,
            dir: svc.dir.id,
            headsign: svc.dir.headsign,
            eta: eta + delay,
            delay,
            scheduled: Math.round(((trip.dep * 60 + prof.arr[svc.idx]) % DAY) / 60),
            occupancy: this.occupancy(tripId, secOfDay),
            live,
          });
        }
      }
    }
    return out.sort((a, b) => a.eta - b.eta).slice(0, limit);
  }

  /** un singur vehicul, după id — pentru urmărirea unui autobuz selectat */
  vehicleById(id: string, ms: number): Vehicle | null {
    const [ref, dirId, dayType, idxStr] = id.split('|');
    const pd = this.dirs.get(`${ref}|${dirId}`);
    if (!pd) return null;
    const trip = pd.line.trips[dayType as DayType]?.[dirId as DirId]?.[+idxStr];
    if (!trip) return null;
    const { secOfDay } = localTime(ms);
    for (const offset of [0, DAY]) {
      const elapsed = secOfDay - (trip.dep * 60 - offset);
      if (elapsed < 0 || elapsed > trip.dur * 60 + 240) continue;
      return this.buildVehicle(pd, trip, id, elapsed, secOfDay);
    }
    return null;
  }

  /** traseul rămas de parcurs de un autobuz până la o stație — se desenează pe hartă */
  pathTo(vehicle: Vehicle, stopKey: string): [number, number][] {
    const pd = this.dirs.get(`${vehicle.line}|${vehicle.dir}`);
    if (!pd) return [];
    const idx = pd.stopKeys.indexOf(stopKey);
    if (idx < 0) return [];
    const from = vehicle.progress * pd.total;
    const to = pd.dir.stops[idx].d;
    return slice(pd.dir.shape, pd.cum, from, to);
  }

  /** în cât timp ajunge acest autobuz în stația dată (secunde), sau null dacă a trecut deja */
  etaOf(vehicle: Vehicle, stopKey: string, ms: number): number | null {
    const pd = this.dirs.get(`${vehicle.line}|${vehicle.dir}`);
    if (!pd) return null;
    const idx = pd.stopKeys.indexOf(stopKey);
    if (idx < 0 || idx < vehicle.nextStopIdx) return null;
    const [, , dayType, idxStr] = vehicle.id.split('|');
    const trip = pd.line.trips[dayType as DayType]?.[vehicle.dir]?.[+idxStr];
    if (!trip) return null;
    const prof = this.profile(pd, trip.dur);
    const { secOfDay } = localTime(ms);
    let eta = trip.dep * 60 + prof.arr[idx] + vehicle.delay - secOfDay;
    if (eta < -600) eta += DAY;
    return eta;
  }
}

export function isRush(secOfDay: number): boolean {
  const h = secOfDay / HOUR;
  return (h >= 7 && h < 9) || (h >= 16 && h < 18.5);
}
