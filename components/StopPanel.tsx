'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import OriginPicker from './OriginPicker';
import { clockLabel, delayLabel, hhmm, minutesLabel, occupancyLabel } from '@/lib/format';

const FAVOURITES = ['piata centrala', 'gara', 'autogara', 'piata sud', 'stadionul municipal', 'auchan'];

export default function StopPanel() {
  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const myStop = useStore((s) => s.fromKey);
  const setMyStop = useStore((s) => s.setOrigin);
  const selectedVehicle = useStore((s) => s.selectedVehicle);
  const selectVehicle = useStore((s) => s.selectVehicle);
  const t = useTick(1);

  const stop = useMemo(() => net?.stops.find((s) => s.key === myStop) ?? null, [net, myStop]);
  const arrivals = useMemo(() => (sim && myStop ? sim.arrivalsAt(myStop, t, 9) : []), [sim, myStop, t]);

  return (
    <div className="flex flex-col gap-4">
      <OriginPicker />

      {!stop && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">Stații frecvente</p>
          <div className="flex flex-wrap gap-1.5">
            {FAVOURITES.map((k) => {
              const s = net?.stops.find((x) => x.key === k);
              if (!s) return null;
              return (
                <button key={k} onClick={() => setMyStop(k)} className="chip">
                  🚏 {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stop && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Următoarele sosiri</h2>
            <span className="text-xs muted">ora {clockLabel(t)}</span>
          </div>

          {arrivals.length === 0 && (
            <p className="panel rounded-xl border p-4 text-sm muted">
              Nicio sosire în următoarea oră. Linia poate să nu circule la ora asta — încearcă butonul de accelerare a
              timpului.
            </p>
          )}

          <ul className="flex flex-col gap-1.5">
            {arrivals.map((a) => {
              const d = delayLabel(a.delay);
              const on = selectedVehicle === a.vehicleId;
              return (
                <li key={a.vehicleId}>
                  <button
                    onClick={() => selectVehicle(on ? null : a.vehicleId)}
                    className="card-button flex items-center gap-3 p-2.5"
                    data-active={on}
                  >
                    <span className="line-badge size-11 text-[15px]" style={{ background: a.color }}>
                      {a.line}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">spre {a.headsign}</span>
                      <span className="flex items-center gap-1.5 text-xs muted">
                        {a.live ? (
                          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-brand)] text-[var(--color-brand)] live-dot" />
                        ) : null}
                        <span className={d.tone === 'late' ? 'text-amber-600 dark:text-amber-400' : ''}>
                          {a.live ? d.text : `plecare programată ${hhmm(a.scheduled)}`}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{occupancyLabel(a.occupancy)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-bold leading-tight tabular-nums">{minutesLabel(a.eta)}</span>
                      <span className="block text-[11px] muted tabular-nums">{hhmm(a.scheduled)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selectedVehicle && (
            <p className="text-xs muted">
              Traseul întreg al cursei alese e desenat pe hartă, iar cartonașul ei arată toate stațiile până la capăt.
              Atinge din nou cursa ca să o deselectezi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
