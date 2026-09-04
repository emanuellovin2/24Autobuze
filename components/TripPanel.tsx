'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTick } from './useTick';
import PlaceSearch from './PlaceSearch';
import OriginPicker from './OriginPicker';
import BusRoute from './BusRoute';
import { popularDestinations, type SearchHit } from '@/lib/search';
import { planJourney, type Journey } from '@/lib/sim/planner';
import { rideStatus } from '@/lib/sim/ride';
import { localTime } from '@/lib/sim/engine';
import { catIcon, hhmm, minutesLabel, occupancyLabel, walkLabel } from '@/lib/format';

/* Panoul de jos: aceeași succesiune la fiecare etapă a călătoriei —
 * unde vrei să ajungi → ce autobuze te duc → urmărește autobuzul →
 * ai coborât, continui? */
export default function TripPanel() {
  const stage = useStore((s) => s.stage);
  if (stage === 'idle') return <Idle />;
  if (stage === 'search') return <Search />;
  if (stage === 'options') return <Options />;
  if (stage === 'riding') return <Riding />;
  if (stage === 'transfer') return <Transfer />;
  return <Arrived />;
}

/* ------------------------------------------------------------------ */

function Idle() {
  const startTrip = useStore((s) => s.startTrip);
  const setExplore = useStore((s) => s.setExplore);
  const net = useStore((s) => s.net);
  const places = useStore((s) => s.places);

  return (
    <div className="flex flex-col gap-2.5">
      <button onClick={startTrip} className="btn btn-primary btn-lg w-full justify-start gap-3 rounded-2xl px-4 py-4 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 text-lg">🔎</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight">Unde vrei să ajungi?</span>
          <span className="block truncate text-xs font-medium text-white/85">
            Strada, stația sau un reper — îți spun ce autobuz ajunge primul
          </span>
        </span>
        <span className="shrink-0 text-lg">›</span>
      </button>

      <div className="flex gap-2">
        <button onClick={() => setExplore('statia')} className="btn btn-ghost flex-1">
          🚏 Stația mea
        </button>
        <button onClick={() => setExplore('linii')} className="btn btn-ghost flex-1">
          🚌 Toate liniile
        </button>
      </div>

      <p className="px-1 text-[11px] muted">
        {net ? `${net.lines.length} linii · ${net.stops.length} stații` : 'se încarcă rețeaua'}
        {places ? ` · ${places.streets.length} străzi din Bacău` : ''}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Search() {
  const net = useStore((s) => s.net);
  const destination = useStore((s) => s.destination);
  const fromKey = useStore((s) => s.fromKey);
  const setDestination = useStore((s) => s.setDestination);
  const resetTrip = useStore((s) => s.resetTrip);
  const pickMode = useStore((s) => s.pickMode);
  const setPickMode = useStore((s) => s.setPickMode);
  const popular = useMemo(() => (net ? popularDestinations(net) : []), [net]);

  // destinația e aleasă, dar nu știm de unde pleacă: întrebăm doar asta
  if (destination && !fromKey) {
    return (
      <div className="flex flex-col gap-3">
        <Head title="De unde pleci?" subtitle={`spre ${destination.title}`} onClose={resetTrip} />
        <OriginPicker />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Head title="Unde vrei să ajungi?" onClose={resetTrip} />

      <PlaceSearch
        autoFocus
        placeholder="Strada, stația sau un reper: mall, gară, spital…"
        onPick={(h: SearchHit) => setDestination(h)}
        emptyState={
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide muted">Locuri căutate des</p>
            <div className="flex flex-wrap gap-1.5">
              {popular.map((h) => (
                <button key={h.title} onClick={() => setDestination(h)} className="chip">
                  <span aria-hidden>{catIcon(h.subtitle)}</span>
                  {h.title}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <button
        onClick={() => setPickMode(pickMode === 'dest' ? 'none' : 'dest')}
        className="btn btn-ghost w-full"
        data-active={pickMode === 'dest'}
      >
        🗺️ {pickMode === 'dest' ? 'Atinge harta unde vrei să ajungi' : 'Arată pe hartă unde vrei să ajungi'}
      </button>

      <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        <OriginPicker compact />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Options() {
  const sim = useStore((s) => s.sim);
  const net = useStore((s) => s.net);
  const destination = useStore((s) => s.destination);
  const fromKey = useStore((s) => s.fromKey);
  const done = useStore((s) => s.done);
  const chooseJourney = useStore((s) => s.chooseJourney);
  const resetTrip = useStore((s) => s.resetTrip);
  const startTrip = useStore((s) => s.startTrip);
  const t = useTick(1);

  // lista se recalculează la 5 secunde: minutele curg în continuu, dar
  // ordinea autobuzelor nu sare sub degetul omului
  const slot = Math.floor(t / 5000);
  const journeys = useMemo(
    () => (sim && fromKey && destination ? planJourney(sim, fromKey, destination.targets, t) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, fromKey, destination, slot]
  );
  const now = sim ? localTime(t).secOfDay : 0;
  const fromStop = net?.stops.find((s) => s.key === fromKey);
  const fromName = fromStop?.name ?? '';
  const destStop = net?.stops.find((s) => s.key === destination?.targets[0]?.key);
  // se poate întâmpla după un schimb: stația de coborâre e chiar lângă destinație
  const alreadyThere = !!destination?.targets.some((x) => x.key === fromKey);

  return (
    <div className="flex flex-col gap-3">
      <Head
        title={done.length ? `Continui spre ${destination?.title}` : `Spre ${destination?.title}`}
        subtitle={
          fromName
            ? `pleci din stația ${fromName}${fromStop?.lines.length ? ` · liniile ${fromStop.lines.join(', ')}` : ''}`
            : undefined
        }
        onClose={resetTrip}
        onBack={done.length ? undefined : startTrip}
      />

      {destStop && !alreadyThere && (
        <p className="panel rounded-xl border px-3 py-2 text-xs muted">
          Cea mai apropiată stație de <strong className="font-semibold text-[var(--ink)]">{destination?.title}</strong>{' '}
          este <strong className="font-semibold text-[var(--ink)]">{destStop.name}</strong>
          {destination?.targets[0]?.walk ? ` · ${walkLabel(destination.targets[0].walk)}` : ''} · liniile{' '}
          {destStop.lines.join(', ')}
        </p>
      )}

      {alreadyThere && (
        <div className="panel rounded-xl border p-4 text-sm">
          <p className="font-semibold">Ești deja la {destination?.title}.</p>
          <p className="mt-1 muted">Stația {fromName} e chiar acolo — nu mai ai nevoie de autobuz.</p>
          <button onClick={resetTrip} className="btn btn-primary mt-3 w-full">
            Călătorie nouă
          </button>
        </div>
      )}

      {!alreadyThere && journeys.length === 0 && (
        <p className="panel rounded-xl border p-4 text-sm muted">
          Nu găsesc niciun autobuz spre {destination?.title} în intervalul următor, nici direct, nici cu o schimbare.
          Încearcă altă stație de plecare sau altă oră.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {journeys.map((j, i) => (
          <li key={j.id}>
            <JourneyOption journey={j} now={now} best={i === 0} onChoose={() => chooseJourney(j, t)} />
          </li>
        ))}
      </ul>

      {journeys.length > 0 && (
        <p className="text-xs muted">Atinge autobuzul cu care vrei să mergi — îl marchez pe hartă și îi vezi toată ruta.</p>
      )}
    </div>
  );
}

function JourneyOption({ journey, now, best, onChoose }: { journey: Journey; now: number; best: boolean; onChoose: () => void }) {
  const first = journey.legs[0];
  return (
    <button onClick={onChoose} className="card-button p-3" data-best={best}>
      <div className="flex items-center gap-3">
        <span className="line-badge size-12 text-base" style={{ background: first.color }}>
          {first.line}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">spre {first.headsign}</span>
            {best && (
              <span className="shrink-0 rounded-full bg-[var(--color-brand)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
                ajunge primul
              </span>
            )}
          </span>
          <span className="block truncate text-xs muted">
            urci la {first.fromName} · {hhmm(first.boardAt / 60)}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold leading-tight tabular-nums">{minutesLabel(journey.departAt - now)}</span>
          <span className="block text-[11px] muted">până vine</span>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-xs" style={{ borderColor: 'var(--line)' }}>
        {journey.legs.length > 1 ? (
          <span className="flex items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: journey.legs[0].color }}>
              {journey.legs[0].line}
            </span>
            <span className="muted">→</span>
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: journey.legs[1].color }}>
              {journey.legs[1].line}
            </span>
            <span className="muted">schimbi la {journey.transferName}</span>
          </span>
        ) : (
          <span className="muted">fără schimbare · cobori la {first.toName}</span>
        )}
        <span className="ml-auto font-semibold tabular-nums">
          ajungi în {Math.max(1, Math.round(journey.totalSec / 60))} min
        </span>
      </div>

      {journey.walk > 60 && <p className="mt-1 text-[11px] muted">după coborâre mai ai {walkLabel(journey.walk)}</p>}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Riding() {
  const sim = useStore((s) => s.sim);
  const ride = useStore((s) => s.ride);
  const destination = useStore((s) => s.destination);
  const backToOptions = useStore((s) => s.backToOptions);
  const resetTrip = useStore((s) => s.resetTrip);
  const t = useTick(1);
  const [allStops, setAllStops] = useState(false);

  const status = useMemo(() => (sim && ride ? rideStatus(sim, ride, t) : null), [sim, ride, t]);
  if (!ride || !status) return null;

  const { leg } = ride;
  const waiting = status.phase === 'waiting';
  const next = ride.plan.legs[1];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="line-badge size-12 text-base" style={{ background: leg.color }}>
          {leg.line}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight">
            {waiting ? `Vine la ${leg.fromName}` : `Ești în autobuzul ${leg.line}`}
          </p>
          <p className="truncate text-xs muted">
            {waiting
              ? `autobuzul ${leg.line} spre ${leg.headsign}`
              : `cobori la ${leg.toName}${next ? ` și schimbi cu ${next.line}` : ''}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold leading-none tabular-nums">
            {minutesLabel((waiting ? status.etaBoard : status.etaAlight) ?? 0)}
          </p>
          <p className="text-[11px] muted">{waiting ? 'până vine' : 'până cobori'}</p>
        </div>
      </div>

      <div className="panel flex items-center gap-2 rounded-xl border px-3 py-2 text-xs muted">
        <span className="text-base" aria-hidden>📍</span>
        <span className="min-w-0 flex-1">
          {waiting
            ? 'Autobuzul e marcat pe hartă cu pin portocaliu — vezi exact unde e acum.'
            : `Urmărește pinul pe hartă până la ${leg.toName}.`}
          {status.vehicle ? ` ${occupancyLabel(status.vehicle.occupancy)}.` : ' Încă nu a plecat din capăt.'}
        </span>
      </div>

      {/* toată ruta autobuzului ales, stație cu stație */}
      <div className="panel rounded-xl border p-3">
        <BusRoute vehicleId={leg.vehicleId} fromKey={leg.fromKey} toKey={leg.toKey} onlyBetween={!allStops} />
        <button onClick={() => setAllStops(!allStops)} className="btn btn-quiet btn-sm mt-1 w-full">
          {allStops ? 'arată doar drumul meu' : `arată toată ruta liniei ${leg.line}`}
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={backToOptions} className="btn btn-ghost flex-1">
          Alt autobuz
        </button>
        <button onClick={resetTrip} className="btn btn-quiet flex-1">
          Renunț
        </button>
      </div>

      {destination && (
        <p className="text-xs muted">
          Destinația finală: <strong className="font-semibold text-[var(--ink)]">{destination.title}</strong>
          {status.etaDestination != null ? ` · ${minutesLabel(status.etaDestination)} în total` : ''}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Transfer() {
  const ride = useStore((s) => s.ride);
  const destination = useStore((s) => s.destination);
  const continueTrip = useStore((s) => s.continueTrip);
  const resetTrip = useStore((s) => s.resetTrip);
  if (!ride) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border-2 p-4" style={{ borderColor: 'var(--color-brand)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide muted">Ai coborât la {ride.leg.toName}</p>
        <h2 className="mt-1 text-[19px] font-bold leading-tight">Vrei să continui ruta?</h2>
        <p className="mt-1 text-sm muted">
          Mai ai o etapă până la <strong className="font-semibold text-[var(--ink)]">{destination?.title}</strong>. Îți
          arăt autobuzele care pleacă de aici în acea direcție și în cât timp ajung.
        </p>

        <div className="mt-3 flex gap-2">
          <button onClick={continueTrip} className="btn btn-primary btn-lg flex-1">
            Da, continui
          </button>
          <button onClick={resetTrip} className="btn btn-ghost btn-lg flex-1">
            Nu, am terminat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Arrived() {
  const destination = useStore((s) => s.destination);
  const ride = useStore((s) => s.ride);
  const resetTrip = useStore((s) => s.resetTrip);
  const walk = ride?.plan.walk ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border-2 p-4" style={{ borderColor: 'var(--color-brand)' }}>
        <p className="text-3xl" aria-hidden>🎉</p>
        <h2 className="mt-1 text-[19px] font-bold leading-tight">Ai ajuns la {destination?.title}</h2>
        <p className="mt-1 text-sm muted">
          Ai coborât la {ride?.leg.toName}.{walk > 60 ? ` Mai ai ${walkLabel(walk)} până la destinație.` : ''}
        </p>
        <button onClick={resetTrip} className="btn btn-primary btn-lg mt-3 w-full">
          Călătorie nouă
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Head({ title, subtitle, onClose, onBack }: { title: string; subtitle?: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div className="flex items-start gap-2">
      {onBack && (
        <button onClick={onBack} className="btn btn-ghost btn-icon-sm shrink-0" title="Înapoi">
          ←
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[17px] font-bold leading-tight">{title}</h2>
        {subtitle && <p className="truncate text-xs muted">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="btn btn-ghost btn-icon-sm shrink-0" title="Închide">
        ✕
      </button>
    </div>
  );
}
