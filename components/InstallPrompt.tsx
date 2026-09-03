'use client';

import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'autobuze:install-dismissed';

/**
 * Aplicația poate fi instalată pe ecranul principal și merge apoi și fără
 * semnal bun: rețeaua, orarele și harta vizitată rămân în telefon.
 */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // în dezvoltare service worker-ul ar servi fișiere vechi la fiecare salvare
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[sw]', e));
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
      try {
        setHidden(localStorage.getItem(DISMISSED) === '1');
      } catch {
        setHidden(false);
      }
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* modul privat: rămâne ascunsă doar în sesiunea asta */
    }
  };

  if (!evt || hidden) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex justify-center px-3 md:bottom-4 md:left-[404px]">
      <div className="panel raise pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-base">🚌</span>
        <p className="min-w-0 flex-1 text-xs">
          <strong className="block text-[13px] font-semibold">Pune aplicația pe ecranul principal</strong>
          <span className="muted">Se deschide instant și merge și fără semnal.</span>
        </p>
        <button
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          }}
          className="shrink-0 rounded-xl bg-[var(--color-brand)] px-3 py-2 text-xs font-bold text-white"
        >
          Instalează
        </button>
        <button onClick={close} className="shrink-0 px-1 text-xs muted" title="Nu acum">
          ✕
        </button>
      </div>
    </div>
  );
}
