'use client';

import dynamic from 'next/dynamic';

/**
 * Aplicația e o hartă live: nu are ce randa serverul dinainte, iar ceasul
 * simulării ar produce oricum nepotriviri la hidratare. O încărcăm doar în browser.
 */
const Shell = dynamic(() => import('./Shell'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-12 animate-pulse place-items-center rounded-2xl bg-[var(--color-brand)] text-2xl">🚌</span>
        <p className="text-sm muted">Se încarcă harta Bacăului…</p>
      </div>
    </div>
  ),
});

export default function AppClient() {
  return <Shell />;
}
