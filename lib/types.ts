export type DirId = 'tur' | 'retur';
export type DayType = 'LV' | 'SD';

export interface Stop {
  key: string;
  name: string;
  lon: number;
  lat: number;
  lines: string[];
}

export interface Landmark {
  name: string;
  alias: string[];
  cat: string;
  lon: number;
  lat: number;
  stops: { key: string; walk: number }[];
}

export interface Direction {
  id: DirId;
  headsign: string;
  length: number;
  shape: [number, number][];
  stops: { key: string; d: number }[];
}

export interface Trip {
  /** plecarea din capăt, minute de la miezul nopții */
  dep: number;
  /** durata cursei, în minute (din orarul publicat) */
  dur: number;
}

export interface Line {
  ref: string;
  name: string;
  color: string;
  directions: Direction[];
  trips: Record<DayType, Record<DirId, Trip[]>>;
}

/** cursele speciale spre aeroport: doar ore de plecare, publicate pe zile */
export interface AirportService {
  ref: string;
  name: string;
  note: string;
  source: string;
  days: { day: string; runs: { from: string; at: string }[] }[];
}

export interface Network {
  city: string;
  operator: string;
  generated: string;
  dwellSeconds: number;
  stops: Stop[];
  landmarks: Landmark[];
  lines: Line[];
  airport?: AirportService | null;
}

/** un autobuz aflat în circulație la un moment dat */
export interface Vehicle {
  id: string;
  line: string;
  color: string;
  dir: DirId;
  headsign: string;
  lon: number;
  lat: number;
  bearing: number;
  /** întârziere față de orar, în secunde */
  delay: number;
  /** indicele următoarei stații de pe traseu */
  nextStopIdx: number;
  nextStopKey: string;
  nextStopEta: number;
  occupancy: number;
  progress: number;
}

export interface Arrival {
  vehicleId: string;
  line: string;
  color: string;
  dir: DirId;
  headsign: string;
  /** secunde până la sosire */
  eta: number;
  delay: number;
  /** ora programată, minute de la miezul nopții */
  scheduled: number;
  occupancy: number;
  live: boolean;
}
