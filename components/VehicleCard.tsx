'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { delayLabel, minutesLabel, occupancyLabel } from '@/lib/format';

/** cartonașul autobuzului selectat — apare peste hartă */
export default function VehicleCard() {
  const sim = useStore((s) => s.sim);
  const net = useStore((s) => s.net);
  const id = useStore((s) => s.selectedVehicle);
  const myStop = useStore((s) => s.myStop);
  const selectVehicle = useStore((s) => s.selectVehicle);
  const t = useTick(1);

  const v = useMemo(() => (sim && id ? sim.vehicleById(id, t) : null), [sim, id, t]);
  if (!v) return null;

  const next = net?.stops.find((s) => s.key === v.nextStopKey);
  const mine = net?.stops.find((s) => s.key === myStop);
  const etaMine = mine && sim ? sim.etaOf(v, mine.key, t) : null;
  const d = delayLabel(v.delay);

  return (
    <div className="panel raise pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: v.color }}>
          {v.line}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Autobuz {v.line} spre {v.headsign}</p>
          <p className="truncate text-xs muted">
            <span className={d.tone === 'late' ? 'text-amber-600 dark:text-amber-400' : ''}>{d.text}</span> ·{' '}
            {occupancyLabel(v.occupancy)} · {Math.round(v.progress * 100)}% din traseu
          </p>
        </div>
        <button onClick={() => selectVehicle(null)} className="shrink-0 text-xs muted hover:text-[var(--ink)]">
          ✕
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t pt-2.5 text-xs" style={{ borderColor: 'var(--line)' }}>
        <div>
          <p className="muted">Următoarea stație</p>
          <p className="truncate font-semibold">{next?.name ?? '—'}</p>
          <p className="tabular-nums muted">{minutesLabel(v.nextStopEta)}</p>
        </div>
        <div>
          <p className="muted">{mine ? `Până la ${mine.name}` : 'Stația mea'}</p>
          {mine ? (
            <p className="text-base font-bold tabular-nums">{etaMine == null ? 'a trecut deja' : minutesLabel(etaMine)}</p>
          ) : (
            <p className="muted">alege o stație</p>
          )}
        </div>
      </div>
    </div>
  );
}
