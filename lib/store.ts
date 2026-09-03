'use client';
import { create } from 'zustand';
import type { Network } from './types';
import { Simulation } from './sim/engine';
import { buildSearchIndex, type SearchHit } from './search';

export type Tab = 'linii' | 'statia' | 'calatorie';
export type PickMode = 'none' | 'origin' | 'dest';

interface State {
  net: Network | null;
  sim: Simulation | null;
  search: ((q: string, limit?: number) => SearchHit[]) | null;
  loadError: string | null;

  tab: Tab;
  selectedLine: string | null;
  myStop: string | null;
  destStop: string | null;
  selectedVehicle: string | null;
  pickMode: PickMode;
  sheet: 'peek' | 'full';
  aboutOpen: boolean;
  theme: 'light' | 'dark';

  load: () => Promise<void>;
  setTab: (t: Tab) => void;
  selectLine: (ref: string | null) => void;
  setMyStop: (key: string | null) => void;
  setDestStop: (key: string | null) => void;
  selectVehicle: (id: string | null) => void;
  setPickMode: (m: PickMode) => void;
  setSheet: (v: 'peek' | 'full') => void;
  setAbout: (v: boolean) => void;
  toggleTheme: () => void;
  swapStops: () => void;
}

export const useStore = create<State>((set, get) => ({
  net: null,
  sim: null,
  search: null,
  loadError: null,

  tab: 'statia',
  selectedLine: null,
  myStop: null,
  destStop: null,
  selectedVehicle: null,
  pickMode: 'none',
  sheet: 'peek',
  aboutOpen: false,
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

  setTab: (tab) => set({ tab, sheet: 'full' }),
  selectLine: (selectedLine) => set({ selectedLine, selectedVehicle: null }),
  setMyStop: (myStop) => set({ myStop, pickMode: 'none', sheet: 'full' }),
  setDestStop: (destStop) => set({ destStop, pickMode: 'none', sheet: 'full' }),
  selectVehicle: (selectedVehicle) => set({ selectedVehicle }),
  // când începe alegerea pe hartă, coborâm panoul ca utilizatorul să vadă orașul
  setPickMode: (pickMode) => set({ pickMode, sheet: pickMode === 'none' ? 'full' : 'peek' }),
  setSheet: (sheet) => set({ sheet }),
  setAbout: (aboutOpen) => set({ aboutOpen }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  swapStops: () => set((s) => ({ myStop: s.destStop, destStop: s.myStop })),
}));
