'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import StopPicker from './StopPicker';
import { clockLabel, delayLabel, hhmm, minutesLabel, occupancyLabel } from '@/lib/format';
import { nearestStop } from '@/lib/search';

const FAVOURITES = ['piata centrala', 'gara', 'autogara', 'piata sud', 'stadionul municipal', 'auchan'];

export default function StopPanel() {
  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const myStop = useStore((s) => s.myStop);
  const setMyStop = useStore((s) => s.setMyStop);
  const selectedVehicle = useStore((s) => s.selectedVehicle);
  const selectVehicle = useStore((s) => s.selectVehicle);
  const t = useTick(1);
  const [geoState, setGeoState] = useState<'idle' | 'busy' | 'denied'>('idle');

  const stop = useMemo(() => net?.stops.find((s) => s.key === myStop) ?? null, [net, myStop]);
  const arrivals = useMemo(() => (sim && myStop ? sim.arrivalsAt(myStop, t, 9) : []), [sim, myStop, t]);

  const locate = () => {
    if (!navigator.geolocation || !net) return setGeoState('denied');
    setGeoState('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestStop(net, pos.coords.longitude, pos.coords.latitude);
        setMyStop(near.stop.key);
        setGeoState('idle');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <StopPicker target="origin" label="Stația mea" placeholder="Caută stația sau un reper: gară, mall, spital…" tone="mine" />

      {!stop && (
        <div className="flex flex-col gap-3">
          <button
            onClick={locate}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-mine)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {geoState === 'busy' ? 'Caut poziția…' : '📍 Folosește locația mea'}
          </button>
          {geoState === 'denied' && (
            <p className="text-xs muted">Nu am putut obține locația. Alege stația din listă sau atinge harta.</p>
          )}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">Stații frecvente</p>
            <div className="flex flex-wrap gap-1.5">
              {FAVOURITES.map((k) => {
                const s = net?.stops.find((x) => x.key === k);
                if (!s) return null;
                return (
                  <button
                    key={k}
                    onClick={() => setMyStop(k)}
                    className="panel rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-[color:var(--color-brand)]"
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
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
                    className={`panel flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      on ? 'border-amber-500 ring-2 ring-amber-500/25' : 'hover:border-[color:var(--muted)]'
                    }`}
                  >
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
                      style={{ background: a.color }}
                    >
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
              Traseul rămas până la tine e desenat cu portocaliu pe hartă. Atinge din nou cursa ca să îl ascunzi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
