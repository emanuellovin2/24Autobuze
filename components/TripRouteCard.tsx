'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { rideStatus } from '@/lib/sim/ride';
import { hhmm, minutesLabel, walkLabel } from '@/lib/format';
import type { Leg } from '@/lib/sim/planner';

/**
 * Cardul din colțul hărții: cât mai durează până la destinație și toată ruta,
 * inclusiv schimbul de autobuz, cu etapele deja parcurse bifate.
 */
export default function TripRouteCard() {
  const sim = useStore((s) => s.sim);
  const net = useStore((s) => s.net);
  const stage = useStore((s) => s.stage);
  const ride = useStore((s) => s.ride);
  const done = useStore((s) => s.done);
  const destination = useStore((s) => s.destination);
  const startKey = useStore((s) => s.startKey);
  const open = useStore((s) => s.routeOpen);
  const setOpen = useStore((s) => s.setRouteOpen);
  const t = useTick(1);

  const status = useMemo(() => (sim && ride ? rideStatus(sim, ride, t) : null), [sim, ride, t]);

  if (!destination || (stage !== 'riding' && stage !== 'transfer' && stage !== 'arrived')) return null;

  const plan = ride?.plan;
  const startName = net?.stops.find((s) => s.key === startKey)?.name;
  const remaining = status?.etaDestination ?? null;
  // etapele parcurse + cea curentă + ce mai urmează din planul ales
  const upcoming = plan ? plan.legs.slice(1) : [];
  const current = stage === 'riding' ? ride?.leg : null;
  const finished = done;

  return (
    <div className="panel raise pointer-events-auto w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide muted">
            {stage === 'arrived' ? 'Călătorie încheiată' : `Spre ${destination.title}`}
          </span>
          <span className="block text-xl font-bold leading-tight tabular-nums">
            {stage === 'arrived'
              ? 'Ai ajuns'
              : stage === 'transfer'
                ? 'Aștepți schimbul'
                : remaining != null
                  ? `mai ai ${minutesLabel(remaining)}`
                  : 'se calculează…'}
          </span>
        </span>
        {plan && stage === 'riding' && (
          <span className="shrink-0 text-right text-xs muted">
            sosire
            <br />
            <strong className="font-semibold tabular-nums text-[var(--ink)]">{hhmm(plan.arriveAt / 60)}</strong>
          </span>
        )}
        <span className="shrink-0 text-xs muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ol className="flex flex-col gap-2 border-t px-3.5 py-3 text-xs" style={{ borderColor: 'var(--line)' }}>
          <Row icon="●" iconColor="var(--color-mine)" title={`Pleci din ${startName ?? '—'}`} />

          {finished.map((leg, i) => (
            <LegRow key={`d${i}`} leg={leg} state="done" />
          ))}
          {current && <LegRow leg={current} state="now" />}
          {upcoming.map((leg, i) => (
            <LegRow key={`u${i}`} leg={leg} state="next" />
          ))}

          {plan && plan.walk > 60 && (
            <Row icon="🚶" title={`${walkLabel(plan.walk)} până la ${destination.title}`} muted={stage !== 'arrived'} />
          )}
          <Row icon="◉" iconColor="var(--color-dest)" title={destination.title} strong />
        </ol>
      )}
    </div>
  );
}

function LegRow({ leg, state }: { leg: Leg; state: 'done' | 'now' | 'next' }) {
  return (
    <li className={`flex items-start gap-2.5 ${state === 'next' ? 'opacity-60' : ''}`}>
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
        style={{ background: leg.color }}
      >
        {leg.line}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {state === 'done' ? '✓ ' : ''}
          {leg.fromName} → {leg.toName}
        </span>
        <span className="block truncate muted">
          {hhmm(leg.boardAt / 60)} – {hhmm(leg.alightAt / 60)} · {leg.stops} stații · spre {leg.headsign}
        </span>
      </span>
      {state === 'now' && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          acum
        </span>
      )}
    </li>
  );
}

function Row({
  icon,
  iconColor,
  title,
  strong,
  muted,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <li className={`flex items-center gap-2.5 ${muted ? 'opacity-60' : ''}`}>
      <span className="grid size-6 shrink-0 place-items-center text-[13px]" style={{ color: iconColor }}>
        {icon}
      </span>
      <span className={`min-w-0 flex-1 truncate ${strong ? 'font-semibold' : ''}`}>{title}</span>
    </li>
  );
}
