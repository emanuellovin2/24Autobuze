'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import StopPicker from './StopPicker';
import { planJourney, type Journey } from '@/lib/sim/planner';
import { localTime } from '@/lib/sim/engine';
import { hhmm, minutesLabel } from '@/lib/format';

export default function PlannerPanel() {
  const sim = useStore((s) => s.sim);
  const myStop = useStore((s) => s.myStop);
  const destStop = useStore((s) => s.destStop);
  const swap = useStore((s) => s.swapStops);
  const selectVehicle = useStore((s) => s.selectVehicle);
  const selectLine = useStore((s) => s.selectLine);
  const t = useTick(1);

  const journeys = useMemo(
    () => (sim && myStop && destStop ? planJourney(sim, myStop, destStop, t) : []),
    [sim, myStop, destStop, t]
  );
  const now = sim ? localTime(t).secOfDay : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-3">
        <StopPicker target="origin" label="De unde pleci" placeholder="Stația ta sau un reper din oraș" tone="mine" />
        <StopPicker target="dest" label="Unde vrei să ajungi" placeholder="Ex.: mall, gară, spital, Luceafărul…" tone="dest" />
        <button
          onClick={swap}
          title="Inversează"
          className="panel absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 rounded-full border p-1.5 text-xs transition hover:border-[color:var(--muted)]"
        >
          ⇅
        </button>
      </div>

      {(!myStop || !destStop) && (
        <p className="panel rounded-xl border p-4 text-sm muted">
          Alege punctul de plecare și destinația. Poți scrie un reper cunoscut („mall”, „gara”, „spital”) sau poți apăsa
          <strong className="font-semibold"> alege pe hartă</strong> și să atingi direct locul unde vrei să ajungi.
        </p>
      )}

      {myStop && destStop && journeys.length === 0 && (
        <p className="panel rounded-xl border p-4 text-sm muted">
          Nu găsesc nicio cursă în intervalul următor, nici directă, nici cu o schimbare. Încearcă altă oră cu comanda de
          timp sau alege o stație apropiată.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {journeys.map((j, i) => (
          <li key={j.id}>
            <JourneyCard
              journey={j}
              now={now}
              best={i === 0}
              onFocus={() => {
                selectLine(j.legs[0].line);
                selectVehicle(j.legs[0].vehicleId);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function JourneyCard({ journey, now, best, onFocus }: { journey: Journey; now: number; best: boolean; onFocus: () => void }) {
  const total = Math.round(journey.totalSec / 60);
  const wait = Math.max(0, Math.round(journey.waitSec / 60));
  return (
    <button
      onClick={onFocus}
      className={`panel w-full rounded-xl border p-3 text-left transition hover:border-[color:var(--muted)] ${
        best ? 'border-[color:var(--color-brand)] ring-1 ring-[color:var(--color-brand)]/25' : ''
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {journey.legs.map((l, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-xs muted">→</span>}
              <span className="rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ background: l.color }}>
                {l.line}
              </span>
            </span>
          ))}
          {best && <span className="ml-1 rounded-full bg-[var(--color-brand)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">cel mai rapid</span>}
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{total} min</span>
      </div>

      <p className="text-xs muted">
        Pleci în <strong className="font-semibold text-[var(--ink)]">{minutesLabel(journey.departAt - now)}</strong> ·
        ajungi la <strong className="font-semibold text-[var(--ink)]">{hhmm(journey.arriveAt / 60)}</strong>
        {journey.legs.length > 1 ? ` · schimbi la ${journey.transferName}` : ' · fără schimbare'}
        {wait > 0 ? ` · ${wait} min așteptare` : ''}
      </p>

      <ol className="mt-2 flex flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
        {journey.legs.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ background: l.color }} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{hhmm(l.boardAt / 60)}</span> urci la {l.fromName} ·{' '}
              <span className="font-medium">{hhmm(l.alightAt / 60)}</span> cobori la {l.toName}
              <span className="muted"> ({l.stops} stații, spre {l.headsign})</span>
            </span>
          </li>
        ))}
      </ol>
    </button>
  );
}
