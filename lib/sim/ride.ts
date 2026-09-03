import type { Vehicle } from '../types';
import type { Ride } from '../store';
import { Simulation } from './engine';
import { walkSeconds } from './planner';

export type RidePhase = 'waiting' | 'onboard' | 'done';

export interface RideStatus {
  vehicle: Vehicle | null;
  phase: RidePhase;
  /** secunde până când autobuzul ajunge în stația de urcare */
  etaBoard: number | null;
  /** secunde până la coborâre */
  etaAlight: number | null;
  /** secunde până la destinația finală, inclusiv restul rutei și mersul pe jos */
  etaDestination: number | null;
}

/**
 * Unde se află călătoria acum: aștept autobuzul, sunt în el, sau am coborât.
 * Timpii vin din poziția reală a autobuzului cât timp acesta e pe traseu, ca
 * minutele afișate să se potrivească cu pinul de pe hartă.
 */
export function rideStatus(sim: Simulation, ride: Ride, t: number): RideStatus {
  const vehicle = sim.vehicleById(ride.leg.vehicleId, t);
  const etaBoard = vehicle ? sim.etaOf(vehicle, ride.leg.fromKey, t) : (ride.boardMs - t) / 1000;
  const etaAlight = vehicle ? sim.etaOf(vehicle, ride.leg.toKey, t) : (ride.alightMs - t) / 1000;

  let phase: RidePhase;
  if (vehicle) phase = etaAlight == null ? 'done' : etaBoard == null || etaBoard <= 0 ? 'onboard' : 'waiting';
  else phase = t >= ride.alightMs ? 'done' : t >= ride.boardMs ? 'onboard' : 'waiting';

  // restul rutei (eventualul al doilea autobuz) rămâne cel din orar
  const rest = ride.plan.arriveAt - ride.leg.alightAt + walkSeconds(ride.plan.walk);
  return {
    vehicle,
    phase,
    etaBoard,
    etaAlight,
    etaDestination: etaAlight == null ? null : etaAlight + rest,
  };
}
