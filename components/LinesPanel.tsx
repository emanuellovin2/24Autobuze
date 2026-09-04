'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import { minutesLabel } from '@/lib/format';

export default function LinesPanel() {
  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const selectedLine = useStore((s) => s.selectedLine);
  const selectLine = useStore((s) => s.selectLine);
  const setOrigin = useStore((s) => s.setOrigin);
  const fromKey = useStore((s) => s.fromKey);
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
        <button onClick={() => selectLine(null)} className="btn btn-quiet btn-sm self-start">
          ← toate liniile
        </button>

        <div className="flex items-center gap-3">
          <span className="line-badge size-12 text-lg" style={{ background: line.color }}>
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
                      onClick={() => setOrigin(s.key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${
                        fromKey === s.key ? 'bg-black/[0.05] dark:bg-white/[0.08]' : ''
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
              <button onClick={() => selectLine(l.ref)} className="card-button flex items-center gap-3 p-2.5" data-active={selectedLine === l.ref}>
                <span className="line-badge size-11 text-[15px]" style={{ background: l.color }}>
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

      <AirportRuns />
    </div>
  );
}

/**
 * Pe lângă cele 14 linii cu orar fix, operatorul publică și curse speciale spre
 * aeroport, pe linia 18: ore diferite de la o zi la alta, fără listă de stații.
 * Le arătăm ca atare, fiindcă nu pot fi simulate ca o linie obișnuită.
 */
function AirportRuns() {
  const airport = useStore((s) => s.net?.airport);
  const [open, setOpen] = useState(false);
  const t = useTick(60);
  if (!airport?.days.length) return null;

  const today = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long' }).format(new Date(t));

  return (
    <div className="panel mt-1 rounded-xl border p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
        <span className="line-badge size-11 text-[15px]" style={{ background: '#db2777' }}>
          18
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">✈️ {airport.name}</span>
          <span className="block text-xs muted">
            {airport.days.reduce((n, d) => n + d.runs.length, 0)} curse pe săptămână, ore diferite pe zile
          </span>
        </span>
        <span className="shrink-0 text-xs muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs muted">{airport.note}</p>
          {airport.days.map((d) => (
            <div key={d.day} className="flex items-start gap-2 text-xs">
              <span
                className={`w-20 shrink-0 font-semibold ${d.day.toLowerCase() === today.toLowerCase() ? 'text-[var(--color-brand)]' : ''}`}
              >
                {d.day}
              </span>
              <span className="flex flex-wrap gap-1">
                {d.runs.map((r, i) => (
                  <span key={i} className="rounded-md border px-1.5 py-0.5 tabular-nums" style={{ borderColor: 'var(--line)' }}>
                    {r.at} <span className="muted">{r.from}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
          <p className="text-[11px] muted">Orele sunt cele publicate de operator, fără simulare.</p>
        </div>
      )}
    </div>
  );
}
