'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { hhmm, minutesLabel } from '@/lib/format';

/**
 * Toată ruta unui autobuz: fiecare stație, cu ora din orar și cu minutele
 * rămase până acolo. Stațiile prin care a trecut deja sunt bifate, cea către
 * care merge acum e marcată, iar stația unde urci și cea unde cobori sunt
 * scoase în evidență.
 */
export default function BusRoute({
  vehicleId,
  fromKey,
  toKey,
  /** arată doar bucata dintre urcare și coborâre */
  onlyBetween = false,
}: {
  vehicleId: string;
  fromKey?: string | null;
  toKey?: string | null;
  onlyBetween?: boolean;
}) {
  const sim = useStore((s) => s.sim);
  const t = useTick(1);

  const route = useMemo(() => (sim ? sim.routeOf(vehicleId, t) : null), [sim, vehicleId, t]);
  if (!route) return null;

  const i = fromKey ? route.stops.findIndex((s) => s.key === fromKey) : -1;
  const j = toKey ? route.stops.findIndex((s) => s.key === toKey) : -1;
  const shown = onlyBetween && i >= 0 && j > i ? route.stops.slice(i, j + 1) : route.stops;
  const nextIdx = route.stops.find((s) => !s.passed)?.idx ?? route.stops.length;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide muted">
        {onlyBetween ? 'Stațiile până cobori' : `Toată ruta · spre ${route.headsign}`} · {shown.length} stații
      </p>

      <ol className="relative flex flex-col pl-5">
        <span
          className="absolute left-[7px] top-3 bottom-3 w-0.5 rounded"
          style={{ background: route.color, opacity: 0.3 }}
        />
        {shown.map((s) => {
          const board = s.key === fromKey;
          const alight = s.key === toKey;
          const now = s.idx === nextIdx;
          return (
            <li key={s.key + s.idx} className={`relative flex items-center gap-2 py-1 ${s.passed && !board && !alight ? 'opacity-45' : ''}`}>
              <span
                className={`absolute -left-5 grid place-items-center rounded-full border-2 ${
                  board || alight ? 'size-4' : 'size-3'
                }`}
                style={{
                  left: board || alight ? '-1.375rem' : '-1.25rem',
                  background: board ? 'var(--color-mine)' : alight ? '#f59e0b' : now ? route.color : 'var(--panel)',
                  borderColor: board ? 'var(--color-mine)' : alight ? '#f59e0b' : route.color,
                }}
              />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${board || alight || now ? 'font-semibold' : ''}`}>
                {s.name}
                {board && <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-mine)]">urci</span>}
                {alight && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">cobori</span>}
              </span>
              <span className="shrink-0 text-right text-[11px] tabular-nums">
                <span className="block muted">{hhmm(s.scheduled)}</span>
              </span>
              <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums">
                {s.passed ? <span className="muted">a trecut</span> : minutesLabel(s.eta)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
