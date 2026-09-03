'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { walkLabel } from '@/lib/format';
import type { SearchHit } from '@/lib/search';

/**
 * Câmpul de căutare a unui punct din oraș.
 * Cetățeanul poate scrie „mall”, „gara”, „luceafarul” — sau poate să nu scrie
 * nimic și să atingă direct harta.
 */
export default function StopPicker({
  target,
  label,
  placeholder,
  tone,
}: {
  target: 'origin' | 'dest';
  label: string;
  placeholder: string;
  tone: 'mine' | 'dest';
}) {
  const net = useStore((s) => s.net);
  const search = useStore((s) => s.search);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const setMyStop = useStore((s) => s.setMyStop);
  const setDestStop = useStore((s) => s.setDestStop);
  const selectedKey = useStore((s) => (target === 'dest' ? s.destStop : s.myStop));

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => net?.stops.find((s) => s.key === selectedKey) ?? null, [net, selectedKey]);
  const hits: SearchHit[] = useMemo(() => (search && q.trim() ? search(q, 7) : []), [search, q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (h: SearchHit) => {
    if (target === 'dest') setDestStop(h.stopKey);
    else setMyStop(h.stopKey);
    setQ('');
    setOpen(false);
  };

  const clear = () => {
    if (target === 'dest') setDestStop(null);
    else setMyStop(null);
    setQ('');
  };

  const picking = pickMode === target;
  const accent = tone === 'dest' ? 'var(--color-dest)' : 'var(--color-mine)';

  return (
    <div ref={box} className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase muted">
          <span className="size-2 rounded-full" style={{ background: accent }} />
          {label}
        </span>
        <button
          type="button"
          onClick={() => setPickMode(picking ? 'none' : target)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            picking ? 'bg-amber-500 text-white' : 'muted hover:text-[var(--ink)]'
          }`}
          style={picking ? undefined : { border: '1px solid var(--line)' }}
        >
          {picking ? 'atinge harta…' : 'alege pe hartă'}
        </button>
      </div>

      {selected ? (
        <button
          type="button"
          onClick={clear}
          className="panel group flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition hover:border-[color:var(--muted)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{selected.name}</span>
            <span className="block truncate text-xs muted">liniile {selected.lines.join(', ')}</span>
          </span>
          <span className="shrink-0 text-xs muted group-hover:text-[var(--ink)]">schimbă ✕</span>
        </button>
      ) : (
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter') choose(hits[active]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className="panel w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--color-brand)]"
        />
      )}

      {open && hits.length > 0 && !selected && (
        <ul className="panel raise absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border py-1 scroll-thin">
          {hits.map((h, i) => (
            <li key={h.kind + h.title}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left ${i === active ? 'bg-black/[0.04] dark:bg-white/[0.06]' : ''}`}
              >
                <span className="mt-0.5 text-base leading-none">{h.kind === 'landmark' ? '📍' : '🚏'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.title}</span>
                  <span className="block truncate text-xs muted">
                    {h.subtitle}
                    {h.walk ? ` · ${walkLabel(h.walk)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
