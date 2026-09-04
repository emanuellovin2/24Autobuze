'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { nearestStops } from '@/lib/places';
import { walkLabel } from '@/lib/format';
import type { Stop } from '@/lib/types';
import PlaceSearch from './PlaceSearch';

/**
 * „Unde te afli acum?” — stația de urcare. Omul poate scrie strada sau stația,
 * poate lăsa telefonul să găsească stațiile cele mai apropiate, sau poate atinge harta.
 */
export default function OriginPicker({ compact = false }: { compact?: boolean }) {
  const net = useStore((s) => s.net);
  const fromKey = useStore((s) => s.fromKey);
  const setOrigin = useStore((s) => s.setOrigin);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<'idle' | 'busy' | 'denied'>('idle');
  /** stațiile din jurul locației telefonului, ca omul să aleagă dacă nu e cea așteptată */
  const [around, setAround] = useState<{ stop: Stop; walk: number }[]>([]);

  const stop = net?.stops.find((s) => s.key === fromKey) ?? null;

  const locate = () => {
    if (!navigator.geolocation || !net) return setGeo('denied');
    setGeo('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestStops(net, pos.coords.longitude, pos.coords.latitude, 4);
        setAround(near);
        if (near[0]) setOrigin(near[0].stop.key);
        setGeo('idle');
        setOpen(false);
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (stop && !open) {
    return (
      <div className="flex flex-col gap-2">
        <button onClick={() => setOpen(true)} className="card-button flex items-center gap-2.5 px-3 py-2.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: 'var(--color-mine)' }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide muted">Pleci din</span>
            <span className="block truncate text-[15px] font-semibold">{stop.name}</span>
            <span className="block truncate text-[11px] muted">liniile {stop.lines.join(', ')}</span>
          </span>
          <span className="shrink-0 text-xs muted">schimbă</span>
        </button>

        {around.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {around.map(({ stop: s, walk }) => (
              <button
                key={s.key}
                onClick={() => setOrigin(s.key)}
                className="chip"
                data-active={s.key === fromKey}
                title={`liniile ${s.lines.join(', ')}`}
              >
                {s.name} · {walk} m
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide muted">
          <span className="size-2 rounded-full" style={{ background: 'var(--color-mine)' }} />
          Unde te afli acum
        </span>
        {stop && (
          <button onClick={() => setOpen(false)} className="btn btn-quiet btn-sm">
            renunț
          </button>
        )}
      </div>

      <PlaceSearch
        tone="mine"
        placeholder={compact ? 'Strada sau stația ta' : 'Scrie strada sau stația unde ești acum'}
        onPick={(h) => {
          if (h.stopKey) setOrigin(h.stopKey);
          setOpen(false);
        }}
      />

      <div className="flex gap-2">
        <button onClick={locate} className="btn btn-mine flex-1" disabled={geo === 'busy'}>
          {geo === 'busy' ? 'Caut poziția…' : '📍 Locația mea'}
        </button>
        <button
          onClick={() => {
            setPickMode(pickMode === 'origin' ? 'none' : 'origin');
            setOpen(false);
          }}
          className="btn btn-ghost flex-1"
          data-active={pickMode === 'origin'}
        >
          Alege pe hartă
        </button>
      </div>

      {around.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide muted">Stațiile cele mai apropiate de tine</p>
          {around.map(({ stop: s, walk }) => (
            <button key={s.key} onClick={() => setOrigin(s.key)} className="card-button flex items-center gap-2.5 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="block truncate text-[11px] muted">liniile {s.lines.join(', ')}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{walkLabel(walk)}</span>
            </button>
          ))}
        </div>
      )}

      {geo === 'denied' && (
        <p className="text-xs muted">
          Nu am putut obține locația. Scrie strada sau stația, ori atinge harta în locul unde te afli.
        </p>
      )}
      {stop && (
        <p className="text-xs muted">
          Acum ești marcat la stația <strong className="font-semibold text-[var(--ink)]">{stop.name}</strong>
          {stop.lines.length ? ` · liniile ${stop.lines.join(', ')}` : ''}.
        </p>
      )}
    </div>
  );
}
