'use client';
import { useEffect, useState } from 'react';
import { clock } from '@/lib/sim/clock';

/**
 * Reîmprospătează un panou de N ori pe secundă.
 * Harta se animează la 20 fps prin MapLibre, dar textele („3 min”) n-au nevoie
 * de mai mult de o actualizare pe secundă — așa React nu redesenează inutil.
 */
export function useTick(hz = 1): number {
  const [t, setT] = useState(() => clock.now());
  useEffect(() => {
    const id = setInterval(() => setT(clock.now()), Math.max(60, 1000 / hz));
    const un = clock.subscribe(() => setT(clock.now()));
    return () => {
      clearInterval(id);
      un();
    };
  }, [hz]);
  return t;
}
