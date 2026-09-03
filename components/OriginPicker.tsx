'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { nearestStop } from '@/lib/search';
import PlaceSearch from './PlaceSearch';

/**
 * „Unde te afli acum?” — stația de urcare. Omul poate scrie strada sau stația,
 * poate lăsa telefonul să găsească cea mai apropiată stație, sau poate atinge harta.
 */
export default function OriginPicker({ compact = false }: { compact?: boolean }) {
  const net = useStore((s) => s.net);
  const fromKey = useStore((s) => s.fromKey);
  const setOrigin = useStore((s) => s.setOrigin);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<'idle' | 'busy' | 'denied'>('idle');

  const stop = net?.stops.find((s) => s.key === fromKey) ?? null;

  const locate = () => {
    if (!navigator.geolocation || !net) return setGeo('denied');
    setGeo('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestStop(net, pos.coords.longitude, pos.coords.latitude);
        setOrigin(near.stop.key);
        setGeo('idle');
        setOpen(false);
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (stop && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="panel flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:border-[color:var(--muted)]"
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: 'var(--color-mine)' }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide muted">Pleci din</span>
          <span className="block truncate text-[15px] font-semibold">{stop.name}</span>
        </span>
        <span className="shrink-0 text-xs muted">schimbă</span>
      </button>
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
          <button onClick={() => setOpen(false)} className="text-xs muted hover:text-[var(--ink)]">
            renunț
          </button>
        )}
      </div>

      <PlaceSearch
        tone="mine"
        placeholder={compact ? 'Strada sau stația ta' : 'Scrie strada sau stația unde ești acum'}
        onPick={(h) => {
          setOrigin(h.stopKey);
          setOpen(false);
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={locate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: 'var(--color-mine)' }}
        >
          {geo === 'busy' ? 'Caut poziția…' : '📍 Locația mea'}
        </button>
        <button
          onClick={() => {
            setPickMode(pickMode === 'origin' ? 'none' : 'origin');
            setOpen(false);
          }}
          className="panel flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition hover:border-[color:var(--muted)]"
        >
          Alege pe hartă
        </button>
      </div>

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
