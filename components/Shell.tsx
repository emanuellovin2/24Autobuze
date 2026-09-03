'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useStore, type Tab } from '@/lib/store';
import StopPanel from './StopPanel';
import LinesPanel from './LinesPanel';
import PlannerPanel from './PlannerPanel';
import TimeControls from './TimeControls';
import AboutDialog from './AboutDialog';
import VehicleCard from './VehicleCard';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

const TABS: [Tab, string, string][] = [
  ['statia', 'Stația mea', '🚏'],
  ['calatorie', 'Călătorie', '🧭'],
  ['linii', 'Linii', '🚌'],
];

export default function Shell() {
  const load = useStore((s) => s.load);
  const net = useStore((s) => s.net);
  const loadError = useStore((s) => s.loadError);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setAbout = useStore((s) => s.setAbout);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);

  const snap = useStore((s) => s.sheet);
  const setSnap = useStore((s) => s.setSheet);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const Panel = tab === 'statia' ? StopPanel : tab === 'calatorie' ? PlannerPanel : LinesPanel;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 md:left-[404px]">
        <MapView />
      </div>

      {/* ---------- bara laterală, pe desktop ---------- */}
      <aside className="panel raise absolute inset-y-0 left-0 z-20 hidden w-[404px] flex-col border-r md:flex">
        <Header onAbout={() => setAbout(true)} onTheme={toggleTheme} theme={theme} />
        <TabBar tab={tab} setTab={setTab} />
        <div className="flex-1 overflow-y-auto p-4 scroll-thin">
          {loadError ? <LoadError message={loadError} /> : net ? <Panel /> : <Skeleton />}
        </div>
        <Footer />
      </aside>

      {/* ---------- comenzile de timp, peste hartă ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-3 md:left-[404px]">
        <div className="pointer-events-auto w-full max-w-sm md:w-80">
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
        <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4 md:left-[404px] md:top-24">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            Atinge harta unde vrei să {pickMode === 'dest' ? 'ajungi' : 'urci'}
            <button onClick={() => setPickMode('none')} className="rounded-full bg-white/25 px-2 py-0.5 text-xs">
              renunț
            </button>
          </div>
        </div>
      )}

      {/* ---------- cartonașul autobuzului ---------- */}
      <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+14.5rem)] left-3 z-20 md:bottom-6 md:left-[420px]">
        <VehicleCard />
      </div>

      {/* ---------- panoul de jos, pe telefon ---------- */}
      <section
        className={`panel raise absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t transition-[height] duration-300 md:hidden ${
          snap === 'full' ? 'h-[86%]' : 'h-[13.5rem]'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          className="flex cursor-grab touch-none flex-col items-center pt-2 pb-1"
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const dy = dragStart.current == null ? 0 : e.clientY - dragStart.current;
            dragStart.current = null;
            if (Math.abs(dy) < 8) setSnap(snap === 'full' ? 'peek' : 'full');
            else setSnap(dy < 0 ? 'full' : 'peek');
          }}
        >
          <span className="h-1 w-10 rounded-full" style={{ background: 'var(--line)' }} />
        </div>
        <TabBar tab={tab} setTab={setTab} onPick={() => setSnap('full')} />
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 scroll-thin">
          {loadError ? <LoadError message={loadError} /> : net ? <Panel /> : <Skeleton />}
        </div>
      </section>

      {/* ---------- butoane mici pe telefon ---------- */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2 md:hidden">
        <button onClick={toggleTheme} className="panel raise grid size-9 place-items-center rounded-xl border text-sm" title="Temă">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button onClick={() => setAbout(true)} className="panel raise grid size-9 place-items-center rounded-xl border text-sm" title="Despre">
          ?
        </button>
      </div>

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

function TabBar({ tab, setTab, onPick }: { tab: Tab; setTab: (t: Tab) => void; onPick?: () => void }) {
  return (
    <div className="flex gap-1 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
      {TABS.map(([id, label, icon]) => (
        <button
          key={id}
          onClick={() => {
            setTab(id);
            onPick?.();
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition ${
            tab === id ? 'bg-[var(--color-brand)] text-white' : 'muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
          }`}
        >
          <span aria-hidden>{icon}</span>
          {label}
        </button>
      ))}
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
      {[...Array(6)].map((_, i) => (
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
