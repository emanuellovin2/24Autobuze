'use client';
import { create } from 'zustand';
import type { Network } from './types';
import { Simulation, localTime } from './sim/engine';
import { buildSearchIndex, type SearchHit } from './search';
import type { Journey, Leg, Target } from './sim/planner';

/* ------------------------------------------------------------------ *
 * Firul principal al aplicației este călătoria:
 *
 *   idle  ──„unde vrei să ajungi?”──▶ search ──alegi destinația──▶ options
 *   options ──alegi autobuzul──▶ riding ──cobori──▶ transfer sau arrived
 *   transfer ──„vrei să continui ruta?” da──▶ options (din stația de schimb)
 *                                     nu──▶ idle
 *
 * La fiecare schimb se reia exact aceeași secvență, pornind din stația unde
 * s-a coborât — deci merge la fel pentru rute cu oricâte schimbări.
 * ------------------------------------------------------------------ */

export type TripStage = 'idle' | 'search' | 'options' | 'riding' | 'transfer' | 'arrived';
export type ExplorePanel = 'statia' | 'linii' | null;
export type PickMode = 'none' | 'origin' | 'dest';

export interface Destination {
  kind: 'stop' | 'landmark';
  title: string;
  subtitle: string;
  lon: number;
  lat: number;
  /** stațiile din care se poate ajunge pe jos acolo */
  targets: Target[];
}

export interface Ride {
  leg: Leg;
  /** momente absolute pe ceasul simulării, ca să nu depindem de trecerea zilei */
  boardMs: number;
  alightMs: number;
  /** planul întreg din care face parte cursa — pentru cardul cu ruta completă */
  plan: Journey;
  /** după acest autobuz utilizatorul e la destinație */
  final: boolean;
}

const DAY = 86400;

/** un moment din orar (secunde de la miezul nopții) -> moment absolut pe ceasul simulării */
export function atClock(nowMs: number, secOfDay: number, target: number): number {
  let d = target - secOfDay;
  if (d < -12 * 3600) d += DAY;
  return nowMs + d * 1000;
}

interface State {
  net: Network | null;
  sim: Simulation | null;
  search: ((q: string, limit?: number) => SearchHit[]) | null;
  loadError: string | null;

  /* ---- călătoria ---- */
  stage: TripStage;
  destination: Destination | null;
  /** stația din care se caută acum: la început punctul de plecare, apoi stația de schimb */
  fromKey: string | null;
  /** stația de unde a început toată călătoria */
  startKey: string | null;
  ride: Ride | null;
  /** etapele deja parcurse, ca ruta să se vadă întreagă și după schimb */
  done: Leg[];

  /* ---- restul interfeței ---- */
  explore: ExplorePanel;
  selectedLine: string | null;
  selectedVehicle: string | null;
  pickMode: PickMode;
  aboutOpen: boolean;
  routeOpen: boolean;
  theme: 'light' | 'dark';

  load: () => Promise<void>;

  startTrip: () => void;
  setDestination: (hit: SearchHit) => void;
  setOrigin: (key: string) => void;
  chooseJourney: (j: Journey, nowMs: number) => void;
  backToOptions: () => void;
  advance: (nowMs: number) => void;
  continueTrip: () => void;
  resetTrip: () => void;

  setExplore: (p: ExplorePanel) => void;
  selectLine: (ref: string | null) => void;
  selectVehicle: (id: string | null) => void;
  setPickMode: (m: PickMode) => void;
  setAbout: (v: boolean) => void;
  setRouteOpen: (v: boolean) => void;
  toggleTheme: () => void;
}

const CLEAN = {
  stage: 'idle' as TripStage,
  destination: null,
  fromKey: null,
  startKey: null,
  ride: null,
  done: [],
  selectedVehicle: null,
  selectedLine: null,
  pickMode: 'none' as PickMode,
};

export const useStore = create<State>((set, get) => ({
  net: null,
  sim: null,
  search: null,
  loadError: null,

  ...CLEAN,

  explore: null,
  aboutOpen: false,
  routeOpen: true,
  theme: 'light',

  async load() {
    if (get().net) return;
    try {
      const res = await fetch('/network.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const net: Network = await res.json();
      set({ net, sim: new Simulation(net), search: buildSearchIndex(net), loadError: null });
    } catch (e) {
      set({ loadError: e instanceof Error ? e.message : 'eroare necunoscută' });
    }
  },

  startTrip: () => set({ stage: 'search', explore: null, aboutOpen: false }),

  setDestination: (hit) =>
    set((s) => ({
      destination: {
        kind: hit.kind,
        title: hit.title,
        subtitle: hit.subtitle,
        lon: hit.lon,
        lat: hit.lat,
        targets: hit.targets,
      },
      // fără punct de plecare rămânem în ecranul de căutare, ca omul să spună unde e
      stage: s.fromKey ? 'options' : 'search',
      pickMode: 'none',
    })),

  setOrigin: (key) =>
    set((s) => ({
      fromKey: key,
      startKey: s.startKey ?? key,
      stage: s.stage === 'search' && s.destination ? 'options' : s.stage,
      pickMode: 'none',
      explore: null,
    })),

  chooseJourney: (plan, nowMs) => {
    const { secOfDay } = localTime(nowMs);
    const leg = plan.legs[0];
    set({
      stage: 'riding',
      ride: {
        leg,
        plan,
        boardMs: atClock(nowMs, secOfDay, leg.boardAt),
        alightMs: atClock(nowMs, secOfDay, leg.alightAt),
        final: plan.legs.length === 1,
      },
      selectedVehicle: leg.vehicleId,
      selectedLine: leg.line,
      routeOpen: true,
    });
  },

  backToOptions: () => set({ stage: 'options', ride: null, selectedVehicle: null, selectedLine: null }),

  /** verifică dacă autobuzul urmărit a ajuns în stația de coborâre */
  advance: (nowMs) => {
    const s = get();
    if (s.stage !== 'riding' || !s.ride) return;
    if (nowMs < s.ride.alightMs) return;
    set({
      stage: s.ride.final ? 'arrived' : 'transfer',
      done: [...s.done, s.ride.leg],
      selectedVehicle: null,
      selectedLine: null,
    });
  },

  /** „vrei să continui ruta?” → da: căutăm din stația unde tocmai a coborât */
  continueTrip: () =>
    set((s) => ({
      stage: 'options',
      fromKey: s.ride?.leg.toKey ?? s.fromKey,
      ride: null,
      selectedVehicle: null,
      selectedLine: null,
    })),

  resetTrip: () => set({ ...CLEAN, routeOpen: true }),

  setExplore: (explore) => set({ explore }),
  selectLine: (selectedLine) => set({ selectedLine }),
  selectVehicle: (selectedVehicle) => set({ selectedVehicle }),
  setPickMode: (pickMode) => set({ pickMode }),
  setAbout: (aboutOpen) => set({ aboutOpen }),
  setRouteOpen: (routeOpen) => set({ routeOpen }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
