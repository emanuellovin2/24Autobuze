'use client';

import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { clock } from '@/lib/sim/clock';
import { clockLabelSeconds, dayLabel } from '@/lib/format';
import { isRush, localTime } from '@/lib/sim/engine';

const SPEEDS = [1, 5, 20];
const MOMENTS: [string, number][] = [
  ['07:30 vârf', 7 * 60 + 30],
  ['12:00 amiază', 12 * 60],
  ['17:00 vârf', 17 * 60],
  ['22:00 seara', 22 * 60],
];

export default function TimeControls({ compact = false }: { compact?: boolean }) {
  const t = useTick(4);
  const sim = useStore((s) => s.sim);
  const live = clock.isLive;
  const rush = sim ? isRush(localTime(t).secOfDay) : false;

  return (
    <div className={`panel raise rounded-2xl border ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums leading-none">{clockLabelSeconds(t)}</span>
            {live ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">
                <span className="relative inline-flex size-1.5 rounded-full bg-current live-dot" />
                live
              </span>
            ) : (
              <button onClick={() => clock.reset()} className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                simulare · revino la live
              </button>
            )}
          </div>
          {!compact && (
            <p className="mt-0.5 truncate text-[11px] muted">
              {dayLabel(t)}
              {rush ? ' · oră de vârf, autobuzele merg mai încet' : ''}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => (clock.paused = !clock.paused)}
            className="panel grid size-8 place-items-center rounded-lg border text-xs transition hover:border-[color:var(--muted)]"
            title={clock.paused ? 'Continuă' : 'Pauză'}
          >
            {clock.paused ? '▶' : '❚❚'}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => {
                clock.speed = s;
                clock.paused = false;
              }}
              className={`grid h-8 min-w-8 place-items-center rounded-lg border px-1.5 text-xs font-semibold transition ${
                clock.speed === s && !clock.paused
                  ? 'border-transparent bg-[var(--color-brand)] text-white'
                  : 'panel hover:border-[color:var(--muted)]'
              }`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>

      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {MOMENTS.map(([label, min]) => (
            <button
              key={label}
              onClick={() => clock.jumpTo(min)}
              className="panel rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:border-[color:var(--color-brand)]"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
