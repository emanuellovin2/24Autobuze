'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import StopPanel from './StopPanel';
import LinesPanel from './LinesPanel';
import TripPanel from './TripPanel';
import TripRouteCard from './TripRouteCard';
import TimeControls from './TimeControls';
import AboutDialog from './AboutDialog';
import VehicleCard from './VehicleCard';
import InstallPrompt from './InstallPrompt';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

export default function Shell() {
  const load = useStore((s) => s.load);
  const net = useStore((s) => s.net);
  const loadError = useStore((s) => s.loadError);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setAbout = useStore((s) => s.setAbout);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const explore = useStore((s) => s.explore);
  const setExplore = useStore((s) => s.setExplore);
  const stage = useStore((s) => s.stage);
  const advance = useStore((s) => s.advance);

  const t = useTick(2);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // singurul loc care mută călătoria mai departe: când autobuzul urmărit
  // ajunge în stația de coborâre, întrebăm dacă omul continuă ruta
  useEffect(() => {
    advance(t);
  }, [t, advance]);

  const content = loadError ? (
    <LoadError message={loadError} />
  ) : !net ? (
    <Skeleton />
  ) : explore ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setExplore(null)} className="panel grid size-8 shrink-0 place-items-center rounded-lg border text-sm">
          ←
        </button>
        <h2 className="text-[17px] font-bold">{explore === 'statia' ? 'Stația mea' : 'Toate liniile'}</h2>
      </div>
      {explore === 'statia' ? <StopPanel /> : <LinesPanel />}
    </div>
  ) : (
    <TripPanel />
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 md:left-[404px]">
        <MapView />
      </div>

      {/* ---------- bara laterală, pe desktop ---------- */}
      <aside className="panel raise absolute inset-y-0 left-0 z-20 hidden w-[404px] flex-col border-r md:flex">
        <Header onAbout={() => setAbout(true)} onTheme={toggleTheme} theme={theme} />
        <div className="flex-1 overflow-y-auto p-4 scroll-thin">{content}</div>
        <Footer />
      </aside>

      {/* ---------- ruta și ceasul, peste hartă ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 md:left-[404px] md:flex-row md:items-start md:justify-between">
        <div className="pointer-events-auto">
          <TripRouteCard />
        </div>
        <div className="pointer-events-auto ml-auto w-full max-w-sm md:w-80">
          <div className="hidden md:block">
            <TimeControls />
          </div>
          <div className="md:hidden">
            <TimeControls compact />
          </div>
        </div>
      </div>

      {/* ---------- indicator „alege pe hartă” ---------- */}
      {pickMode !== 'none' && (
        <div className="pointer-events-none absolute inset-x-0 top-32 z-30 flex justify-center px-4 md:left-[404px] md:top-24">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            Atinge harta unde {pickMode === 'dest' ? 'vrei să ajungi' : 'te afli'}
            <button onClick={() => setPickMode('none')} className="rounded-full bg-white/25 px-2 py-0.5 text-xs">
              renunț
            </button>
          </div>
        </div>
      )}

      {/* ---------- cartonașul autobuzului atins pe hartă ---------- */}
      {stage !== 'riding' && (
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+12rem)] left-3 z-20 md:bottom-6 md:left-[420px]">
          <VehicleCard />
        </div>
      )}

      {/* ---------- panoul de jos, pe telefon ---------- */}
      <section
        className="panel raise absolute inset-x-0 bottom-0 z-30 flex max-h-[82dvh] flex-col rounded-t-2xl border-t md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="h-1 w-10 rounded-full" style={{ background: 'var(--line)' }} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-1 pb-4 scroll-thin">{content}</div>
      </section>

      {/* ---------- butoane mici pe telefon ---------- */}
      <div className="absolute right-3 top-28 z-20 flex flex-col gap-2 md:hidden">
        <button onClick={toggleTheme} className="panel raise grid size-9 place-items-center rounded-xl border text-sm" title="Temă">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button onClick={() => setAbout(true)} className="panel raise grid size-9 place-items-center rounded-xl border text-sm" title="Despre">
          ?
        </button>
      </div>

      <InstallPrompt />
      <AboutDialog />
    </div>
  );
}

function Header({ onAbout, onTheme, theme }: { onAbout: () => void; onTheme: () => void; theme: string }) {
  const net = useStore((s) => s.net);
  return (
    <div className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--line)' }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-lg">🚌</span>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-bold leading-tight">Autobuze Bacău</h1>
        <p className="truncate text-xs muted">
          {net ? `${net.lines.length} linii · ${net.stops.length} stații · simulare live` : 'se încarcă rețeaua…'}
        </p>
      </div>
      <button onClick={onTheme} className="panel grid size-8 place-items-center rounded-lg border text-sm" title="Schimbă tema">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <button onClick={onAbout} className="panel grid size-8 place-items-center rounded-lg border text-sm" title="Despre proiect">
        ?
      </button>
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t px-4 py-2.5 text-[11px] muted" style={{ borderColor: 'var(--line)' }}>
      Proiect demonstrativ · trasee și orare publicate de Transport Public SA Bacău · hartă OpenStreetMap
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl" style={{ background: 'var(--line)' }} />
      ))}
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      Nu am putut încărca rețeaua de transport ({message}). Reîncarcă pagina.
    </div>
  );
}
