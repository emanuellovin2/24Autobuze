'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import BusRoute from './BusRoute';
import { delayLabel, minutesLabel, occupancyLabel } from '@/lib/format';

/** cartonașul autobuzului atins pe hartă — cu toată ruta lui, la o atingere */
export default function VehicleCard() {
  const sim = useStore((s) => s.sim);
  const net = useStore((s) => s.net);
  const id = useStore((s) => s.selectedVehicle);
  const myStop = useStore((s) => s.fromKey);
  const selectVehicle = useStore((s) => s.selectVehicle);
  const destination = useStore((s) => s.destination);
  const t = useTick(1);
  const [open, setOpen] = useState(false);

  const v = useMemo(() => (sim && id ? sim.vehicleById(id, t) : null), [sim, id, t]);
  if (!v || !id) return null;

  const next = net?.stops.find((s) => s.key === v.nextStopKey);
  const mine = net?.stops.find((s) => s.key === myStop);
  const etaMine = mine && sim ? sim.etaOf(v, mine.key, t) : null;
  const d = delayLabel(v.delay);
  // dacă e aleasă o destinație, marcăm în listă și stația unde ar trebui să cobori
  const exit = destination?.targets.find((x) => sim?.dirs.get(`${v.line}|${v.dir}`)?.stopKeys.includes(x.key));

  return (
    <div className="panel raise pointer-events-auto flex max-h-[70dvh] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border">
      <div className="flex items-start gap-3 p-3">
        <span className="line-badge size-11 text-[15px]" style={{ background: v.color }}>
          {v.line}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            Autobuz {v.line} spre {v.headsign}
          </p>
          <p className="truncate text-xs muted">
            <span className={d.tone === 'late' ? 'text-amber-600 dark:text-amber-400' : ''}>{d.text}</span> ·{' '}
            {occupancyLabel(v.occupancy)} · {Math.round(v.progress * 100)}% din traseu
          </p>
        </div>
        <button onClick={() => selectVehicle(null)} className="btn btn-quiet btn-icon-sm shrink-0" title="Închide">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t px-3 py-2.5 text-xs" style={{ borderColor: 'var(--line)' }}>
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

      <button onClick={() => setOpen(!open)} className="btn btn-quiet btn-sm w-full rounded-none border-t" style={{ borderColor: 'var(--line)' }}>
        {open ? 'ascunde ruta ▲' : 'vezi toată ruta acestui autobuz ▼'}
      </button>

      {open && (
        <div className="overflow-y-auto border-t px-3 py-2.5 scroll-thin" style={{ borderColor: 'var(--line)' }}>
          <BusRoute vehicleId={id} fromKey={myStop} toKey={exit?.key} />
        </div>
      )}
    </div>
  );
}
