'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import { walkLabel } from '@/lib/format';
import type { SearchHit } from '@/lib/search';

/**
 * Câmpul în care omul scrie unde vrea să ajungă sau unde se află: numele
 * străzii, al stației sau un reper cunoscut („mall”, „gara”, „spital”).
 */
export default function PlaceSearch({
  placeholder,
  onPick,
  autoFocus = false,
  tone = 'brand',
  emptyState,
}: {
  placeholder: string;
  onPick: (hit: SearchHit) => void;
  autoFocus?: boolean;
  tone?: 'brand' | 'mine';
  /** ce se arată cât timp nu s-a scris nimic — de exemplu locațiile populare */
  emptyState?: ReactNode;
}) {
  const search = useStore((s) => s.search);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const hits: SearchHit[] = useMemo(() => (search && q.trim() ? search(q, 8) : []), [search, q]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const choose = (h: SearchHit) => {
    setQ('');
    onPick(h);
  };

  const accent = tone === 'mine' ? 'var(--color-mine)' : 'var(--color-brand)';

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base">🔎</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter') choose(hits[active]);
          }}
          placeholder={placeholder}
          enterKeyHint="search"
          className="panel w-full rounded-xl border py-3 pl-10 pr-3 text-[15px] outline-none transition placeholder:text-[color:var(--muted)]"
          style={{ borderColor: q ? accent : undefined }}
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-xs muted"
          >
            ✕
          </button>
        )}
      </div>

      {q.trim() === '' && emptyState}

      {q.trim() !== '' && hits.length === 0 && (
        <p className="px-1 text-xs muted">Nu găsesc nimic cu acest nume. Încearcă strada, stația sau un reper apropiat.</p>
      )}

      {hits.length > 0 && (
        <ul className="panel overflow-hidden rounded-xl border">
          {hits.map((h, i) => (
            <li key={h.kind + h.title} className="border-t first:border-t-0" style={{ borderColor: 'var(--line)' }}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${i === active ? 'bg-black/[0.04] dark:bg-white/[0.06]' : ''}`}
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
