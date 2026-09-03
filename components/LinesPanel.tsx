'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { minutesLabel } from '@/lib/format';

export default function LinesPanel() {
  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const selectedLine = useStore((s) => s.selectedLine);
  const selectLine = useStore((s) => s.selectLine);
  const setMyStop = useStore((s) => s.setMyStop);
  const myStop = useStore((s) => s.myStop);
  const t = useTick(1);

  const vehicles = useMemo(() => (sim ? sim.vehiclesAt(t) : []), [sim, t]);
  const countByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vehicles) m.set(v.line, (m.get(v.line) ?? 0) + 1);
    return m;
  }, [vehicles]);

  const line = net?.lines.find((l) => l.ref === selectedLine) ?? null;

  if (line) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => selectLine(null)} className="self-start text-xs font-medium muted hover:text-[var(--ink)]">
          ← toate liniile
        </button>

        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: line.color }}>
            {line.ref}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{line.name}</p>
            <p className="text-xs muted">
              {countByLine.get(line.ref) ?? 0} autobuze în circulație acum · {(line.directions[0]?.length ?? 0) / 1000 > 0 ? `${(line.directions[0].length / 1000).toFixed(1)} km` : ''}
            </p>
          </div>
        </div>

        {line.directions.map((dir) => (
          <div key={dir.id} className="panel rounded-xl border p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">
              {dir.id === 'tur' ? 'Dus' : 'Întors'} · spre {dir.headsign}
            </p>
            <ol className="relative flex flex-col gap-0.5 pl-4">
              <span className="absolute left-[5px] top-2 bottom-2 w-0.5 rounded" style={{ background: line.color, opacity: 0.35 }} />
              {dir.stops.map((s) => {
                const stop = net?.stops.find((x) => x.key === s.key);
                const arrivals = sim ? sim.arrivalsAt(s.key, t, 1) : [];
                const next = arrivals.find((a) => a.line === line.ref && a.dir === dir.id);
                return (
                  <li key={s.key + dir.id} className="relative">
                    <button
                      onClick={() => setMyStop(s.key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${
                        myStop === s.key ? 'bg-black/[0.05] dark:bg-white/[0.08]' : ''
                      }`}
                    >
                      <span
                        className="absolute -left-4 size-3 rounded-full border-2 border-[color:var(--panel)]"
                        style={{ background: line.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{stop?.name ?? s.key}</span>
                      {next && <span className="shrink-0 text-xs font-semibold tabular-nums">{minutesLabel(next.eta)}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs muted">
        Cele {net?.lines.length ?? 14} linii urbane ale {net?.operator ?? 'operatorului'}. Atinge o linie ca să îi vezi
        traseul și stațiile.
      </p>
      <ul className="flex flex-col gap-1.5">
        {net?.lines.map((l) => {
          const active = countByLine.get(l.ref) ?? 0;
          return (
            <li key={l.ref}>
              <button
                onClick={() => selectLine(l.ref)}
                className="panel flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition hover:border-[color:var(--muted)]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: l.color }}>
                  {l.ref}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{l.name}</span>
                  <span className="block text-xs muted">{l.directions.map((d) => d.stops.length).join(' + ')} stații</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{active}</span>
                  <span className="block text-[10px] uppercase tracking-wide muted">pe traseu</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
