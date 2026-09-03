'use client';

import { useStore } from '@/lib/store';

export default function AboutDialog() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAbout);
  const net = useStore((s) => s.net);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setOpen(false)}>
      <div
        className="panel raise max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border p-5 scroll-thin sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">Despre acest proiect</h2>
          <button onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-1 text-sm muted hover:text-[var(--ink)]">
            închide ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p>
            O hartă live a autobuzelor din Bacău: vezi unde se află fiecare autobuz, prin ce stații trece și în cât timp
            ajunge la tine. Este un <strong>concept demonstrativ</strong> — autobuzele nu au încă GPS, așa că pozițiile
            sunt calculate de o simulare care rulează în browserul tău.
          </p>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">Ce este real în aplicație</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>Cele <strong>{net?.lines.length ?? 14} linii urbane</strong> și traseele lor, publicate de {net?.operator ?? 'Transport Public SA Bacău'}.</li>
              <li>Cele <strong>{net?.stops.length ?? 82} stații</strong>, cu numele și adresele lor oficiale.</li>
              <li><strong>Orarele reale</strong>: orele de plecare și duratele curselor, luate de pe site-ul operatorului.</li>
              <li>Geometria traseelor urmează <strong>străzile adevărate</strong> ale Bacăului (OpenStreetMap).</li>
            </ul>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">Ce este simulat</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>Poziția fiecărui autobuz pe traseu, calculată din orar și din lungimea traseului.</li>
              <li>Întârzierile (±3 minute) și gradul de aglomerare — generate reproductibil, la fel pentru toți.</li>
              <li>Poziția exactă a unor stații, acolo unde adresa publicată nu este suficient de precisă.</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-semibold">Cum funcționează</p>
            <p className="muted">
              Fiecare cursă din orar are o oră de plecare și o durată. Simularea distribuie durata pe traseu, proporțional
              cu distanța, adăugând timpul de staționare în stații. Din aceeași formulă rezultă și punctul desenat pe
              hartă, și minutele afișate în panoul de sosiri — deci cele două nu se pot contrazice niciodată.
            </p>
          </div>

          <div>
            <p className="mb-1 font-semibold">Ce s-ar schimba cu GPS real</p>
            <p className="muted">
              Doar sursa pozițiilor. Aplicația citește un flux de vehicule cu <em>linie, sens, poziție, întârziere</em>.
              Înlocuind simularea cu un flux GTFS-Realtime de la operator, harta, panoul de sosiri și planificatorul de
              călătorie rămân neschimbate.
            </p>
          </div>

          <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            Nu folosi această aplicație pentru a-ți planifica o călătorie reală. Orarul oficial este pe
            transportpublicbc.ro.
          </p>
        </div>
      </div>
    </div>
  );
}
