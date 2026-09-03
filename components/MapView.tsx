'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '@/lib/store';
import { clock } from '@/lib/sim/clock';
import { nearestStop, stopHit } from '@/lib/search';
import { iconId, pinId, registerBusIcons } from './busIcons';
import { minutesLabel } from '@/lib/format';
import type { Vehicle } from '@/lib/types';

const STYLE = {
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const BACAU: [number, number] = [26.9146, 46.5671];

// workerul e servit din public/ (vezi scripts/copy-maplibre-worker.mjs)
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;

export default function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const fitted = useRef(false);
  const lastRecentre = useRef(0);

  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const theme = useStore((s) => s.theme);
  const selectedLine = useStore((s) => s.selectedLine);
  const selectedVehicle = useStore((s) => s.selectedVehicle);
  const fromKey = useStore((s) => s.fromKey);
  const destination = useStore((s) => s.destination);
  const ride = useStore((s) => s.ride);
  const pickMode = useStore((s) => s.pickMode);

  function applyPick(key: string) {
    const st = useStore.getState();
    const stop = st.net?.stops.find((s) => s.key === key);
    if (!stop) return;
    if (st.pickMode === 'dest') st.setDestination(stopHit(stop));
    else st.setOrigin(key);
  }

  /* ---------------- selecții ---------------- */
  function syncSelection() {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !ready.current || !st.net || !st.sim) return;

    if (m.getLayer('routes-active')) m.setFilter('routes-active', ['==', ['get', 'line'], st.selectedLine ?? '___']);
    if (m.getLayer('routes-line')) m.setPaintProperty('routes-line', 'line-opacity', st.selectedLine ? 0.16 : 0.7);

    // punctele importante ale călătoriei: de unde pleci, unde cobori, unde vrei să ajungi
    const picked: GeoJSON.Feature[] = [];
    const point = (lon: number, lat: number, color: string, label: string) =>
      picked.push({ type: 'Feature', properties: { color, label }, geometry: { type: 'Point', coordinates: [lon, lat] } });

    const stop = (key: string | null | undefined) => st.net!.stops.find((s) => s.key === key);
    const start = stop(st.ride ? st.ride.leg.fromKey : st.fromKey);
    if (start) point(start.lon, start.lat, '#2563eb', st.ride ? 'urci aici' : 'ești aici');
    const alight = st.ride ? stop(st.ride.leg.toKey) : null;
    if (alight && st.ride) point(alight.lon, alight.lat, '#f59e0b', st.ride.final ? 'cobori aici' : 'schimbi aici');
    if (st.destination) point(st.destination.lon, st.destination.lat, '#dc2626', st.destination.title);

    (m.getSource('picked') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: picked });

    // etapa curentă, desenată gros peste restul rețelei
    const legPath = st.ride ? st.sim.pathBetween(st.ride.leg.line, st.ride.leg.dir, st.ride.leg.fromKey, st.ride.leg.toKey) : [];
    (m.getSource('leg') as maplibregl.GeoJSONSource | undefined)?.setData(
      legPath.length > 1
        ? {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: { color: st.ride!.leg.color }, geometry: { type: 'LineString', coordinates: legPath } },
            ],
          }
        : empty
    );
  }

  /* ---------------- straturile proprii ---------------- */
  /**
   * Stilul hărții și rețeaua de transport sosesc independent: oricare poate fi
   * gata primul. Funcția se reapelează singură până când amândouă sunt prezente.
   */
  function buildLayers() {
    const m = map.current;
    const state = useStore.getState();
    if (!m) return;
    if (!state.net) return; // efectul pe [net] va reveni
    if (!m.isStyleLoaded()) {
      m.once('styledata', buildLayers);
      return;
    }
    if (ready.current && m.getLayer('vehicles')) return;

    registerBusIcons(m, state.net.lines.map((l) => l.ref));
    const dark = state.theme === 'dark';

    const routes: GeoJSON.Feature[] = [];
    for (const line of state.net.lines) {
      for (const dir of line.directions) {
        routes.push({
          type: 'Feature',
          properties: { line: line.ref, color: line.color, dir: dir.id },
          geometry: { type: 'LineString', coordinates: dir.shape },
        });
      }
    }
    const stops: GeoJSON.Feature[] = state.net.stops.map((s) => ({
      type: 'Feature',
      properties: { key: s.key, name: s.name, lines: s.lines.join(' · ') },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    }));

    add('routes', { type: 'FeatureCollection', features: routes });
    add('stops', { type: 'FeatureCollection', features: stops });
    add('vehicles', empty);
    add('leg', empty);
    add('trace', empty);
    add('picked', empty);
    add('tracked', empty);

    function add(id: string, data: GeoJSON.FeatureCollection) {
      if (m!.getSource(id)) (m!.getSource(id) as maplibregl.GeoJSONSource).setData(data);
      else m!.addSource(id, { type: 'geojson', data });
    }

    layer({
      id: 'routes-casing',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': dark ? '#0b1220' : '#ffffff',
        'line-opacity': dark ? 0.75 : 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 8],
      },
    });
    layer({
      id: 'routes-line',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.6, 15, 4],
        'line-opacity': 0.7,
      },
    });
    layer({
      id: 'routes-active',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'line'], '___'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
        'line-opacity': 0.85,
      },
    });
    // etapa aleasă: de unde urci până unde cobori
    layer({
      id: 'leg-casing',
      type: 'line',
      source: 'leg',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': dark ? '#0b1220' : '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 8, 15, 15],
        'line-opacity': 0.9,
      },
    });
    layer({
      id: 'leg-line',
      type: 'line',
      source: 'leg',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 15, 10],
        'line-opacity': 1,
      },
    });
    layer({
      id: 'trace',
      type: 'line',
      source: 'trace',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-opacity': 0.95, 'line-dasharray': [0.5, 1.4] },
    });
    layer({
      id: 'stops-circle',
      type: 'circle',
      source: 'stops',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.4, 14, 5, 17, 8],
        'circle-color': dark ? '#0b1220' : '#ffffff',
        'circle-stroke-color': dark ? '#cbd5e1' : '#0f172a',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 2],
        'circle-opacity': 0.95,
      },
    });
    layer({
      id: 'stops-label',
      type: 'symbol',
      source: 'stops',
      minzoom: 13.6,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-font': ['Open Sans Semibold'],
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': dark ? '#e8edf5' : '#0f172a',
        'text-halo-color': dark ? '#0b1220' : '#ffffff',
        'text-halo-width': 1.6,
      },
    });
    layer({
      id: 'picked-halo',
      type: 'circle',
      source: 'picked',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 9, 16, 20],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.22,
      },
    });
    layer({
      id: 'picked-dot',
      type: 'circle',
      source: 'picked',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 9],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });
    layer({
      id: 'picked-label',
      type: 'symbol',
      source: 'picked',
      minzoom: 12.5,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Semibold'],
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': dark ? '#0b1220' : '#ffffff',
        'text-halo-width': 2,
      },
    });
    layer({
      id: 'vehicles',
      type: 'symbol',
      source: 'vehicles',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.42, 14, 0.62, 17, 0.85],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
    // autobuzul urmărit: cerc pulsant + pin mare, ca să se vadă de la prima privire
    layer({
      id: 'tracked-halo',
      type: 'circle',
      source: 'tracked',
      paint: {
        'circle-radius': 18,
        'circle-color': '#f59e0b',
        'circle-opacity': 0.28,
        'circle-stroke-color': '#f59e0b',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.5,
      },
    });
    layer({
      id: 'tracked-pin',
      type: 'symbol',
      source: 'tracked',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-anchor': 'bottom',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 0.72, 17, 0.95],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-font': ['Open Sans Semibold'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': dark ? '#fbbf24' : '#b45309',
        'text-halo-color': dark ? '#0b1220' : '#ffffff',
        'text-halo-width': 2.2,
      },
    });

    function layer(spec: maplibregl.LayerSpecification) {
      if (m!.getLayer(spec.id)) m!.removeLayer(spec.id);
      m!.addLayer(spec);
    }

    for (const id of ['vehicles', 'stops-circle', 'tracked-pin']) {
      m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
    }
    m.on('click', 'vehicles', (e) => {
      // când utilizatorul alege un punct pe hartă, un autobuz care trece peste
      // locul atins nu trebuie să fure atingerea
      if (useStore.getState().pickMode !== 'none') return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) {
        useStore.getState().selectVehicle(id);
        e.preventDefault();
      }
    });
    m.on('click', 'stops-circle', (e) => {
      const key = e.features?.[0]?.properties?.key as string | undefined;
      if (key) {
        applyPick(key);
        e.preventDefault();
      }
    });
    m.on('click', (e) => {
      if (e.defaultPrevented) return;
      const st = useStore.getState();
      if (st.pickMode === 'none') return;
      const near = nearestStop(st.net!, e.lngLat.lng, e.lngLat.lat);
      applyPick(near.stop.key);
    });

    ready.current = true;
    syncSelection();

    // la prima construcție încadrăm întreg orașul, ca utilizatorul să vadă toată rețeaua
    if (!fitted.current) {
      const b = new maplibregl.LngLatBounds();
      for (const st of state.net.stops) b.extend([st.lon, st.lat]);
      m.fitBounds(b, { padding: { top: 90, bottom: 70, left: 50, right: 50 }, duration: 0 });
      fitted.current = true;
    }
  }

  /* ---------------- inițializare ---------------- */
  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: STYLE.light,
      center: BACAU,
      zoom: 12.2,
      minZoom: 10,
      maxZoom: 18,
      attributionControl: false,
    });
    map.current = m;
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __map?: unknown }).__map = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenStreetMap · CARTO · trasee STP Bacău (demo)',
      }),
      'bottom-left'
    );
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, showAccuracyCircle: true }), 'bottom-right');
    m.on('error', (ev) => console.error('[maplibre]', (ev as unknown as { error?: Error }).error?.message ?? ev));
    m.on('style.load', () => {
      ready.current = false;
      buildLayers();
    });
    // cât timp omul se plimbă singur pe hartă nu îi mutăm cadrul sub deget
    m.on('dragstart', () => (lastRecentre.current = Date.now() + 15000));

    // containerul își capătă dimensiunea reală după montare (și se schimbă la
    // rotirea telefonului sau la redimensionarea ferestrei)
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(ref.current);
    m.resize();
    m.on('load', () => buildLayers());

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- schimbarea temei ---------------- */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    ready.current = false;
    // setStyle șterge straturile proprii. Evenimentele de încărcare a stilului
    // sosesc în momente diferite de la o versiune la alta, așa că reîncercăm
    // construcția până reușește (buildLayers e idempotentă).
    m.setStyle(STYLE[theme]);
    const started = Date.now();
    const retry = setInterval(() => {
      if (!map.current || map.current.getLayer('vehicles') || Date.now() - started > 8000) {
        clearInterval(retry);
        return;
      }
      buildLayers();
    }, 250);
    return () => clearInterval(retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    if (net && map.current) buildLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  /* ---------------- bucla de animație ---------------- */
  useEffect(() => {
    if (!sim) return;
    // 20 de actualizări pe secundă dau o mișcare fluidă; browserul încetinește
    // singur intervalul când fila e în fundal, deci nu consumă baterie degeaba
    const id = setInterval(() => {
      const m = map.current;
      if (!m || !ready.current) return;
      const t = clock.now();
      const st = useStore.getState();
      const trackedId = st.ride ? st.ride.leg.vehicleId : st.selectedVehicle;

      const vehicles = sim.vehiclesAt(t);
      const features: GeoJSON.Feature[] = [];
      let tracked: Vehicle | null = null;
      for (const v of vehicles) {
        if (v.id === trackedId) {
          tracked = v;
          continue; // autobuzul urmărit se desenează cu pin, nu cu cerc
        }
        features.push({
          type: 'Feature',
          properties: {
            id: v.id,
            line: v.line,
            icon: iconId(v.line, false, !!trackedId || (!!st.selectedLine && st.selectedLine !== v.line)),
            bearing: v.bearing,
          },
          geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        });
      }
      (m.getSource('vehicles') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });

      /* ---- autobuzul urmărit: pin, halo pulsant și drumul până la tine ---- */
      const trackedSrc = m.getSource('tracked') as maplibregl.GeoJSONSource | undefined;
      if (trackedSrc) {
        if (tracked) {
          const waitStop = st.ride ? st.ride.leg.fromKey : st.fromKey;
          const eta = waitStop ? sim.etaOf(tracked, waitStop, t) : null;
          const goal = st.ride && (eta == null || eta <= 0) ? st.ride.leg.toKey : waitStop;
          const goalEta = goal ? sim.etaOf(tracked, goal, t) : null;
          trackedSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  id: tracked.id,
                  icon: pinId(tracked.line),
                  label: goalEta != null ? minutesLabel(goalEta) : `linia ${tracked.line}`,
                },
                geometry: { type: 'Point', coordinates: [tracked.lon, tracked.lat] },
              },
            ],
          });
          if (m.getLayer('tracked-halo')) {
            const pulse = 16 + 7 * (1 + Math.sin(Date.now() / 380)) * 0.5;
            m.setPaintProperty('tracked-halo', 'circle-radius', pulse);
          }
          // dacă autobuzul iese din cadru, îl aducem înapoi (fără să smucim harta)
          if (Date.now() > lastRecentre.current && !m.getBounds().contains([tracked.lon, tracked.lat])) {
            lastRecentre.current = Date.now() + 4000;
            m.easeTo({ center: [tracked.lon, tracked.lat], duration: 1200 });
          }
        } else {
          trackedSrc.setData(empty);
        }
      }

      const src = m.getSource('trace') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        const waitStop = st.ride ? st.ride.leg.fromKey : st.fromKey;
        const path = tracked && waitStop ? sim.pathTo(tracked, waitStop) : [];
        src.setData(
          path.length > 1
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } }] }
            : empty
        );
      }
    }, 50);
    return () => clearInterval(id);
  }, [sim]);

  useEffect(syncSelection, [selectedLine, fromKey, destination, selectedVehicle, ride, net]);

  /* încadrează traseul liniei alese */
  useEffect(() => {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !selectedLine || st.ride || !st.net) return;
    const line = st.net.lines.find((l) => l.ref === selectedLine);
    if (!line) return;
    const b = new maplibregl.LngLatBounds();
    for (const d of line.directions) for (const c of d.shape) b.extend(c as [number, number]);
    m.fitBounds(b, { padding: { top: 80, bottom: 120, left: 60, right: 60 }, duration: 900 });
  }, [selectedLine]);

  /* la alegerea unui autobuz, arătăm dintr-o privire tot drumul acelei etape */
  useEffect(() => {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !ride || !st.net || !st.sim) return;
    const path = st.sim.pathBetween(ride.leg.line, ride.leg.dir, ride.leg.fromKey, ride.leg.toKey);
    const v = st.sim.vehicleById(ride.leg.vehicleId, clock.now());
    const b = new maplibregl.LngLatBounds();
    for (const c of path) b.extend(c as [number, number]);
    if (v) b.extend([v.lon, v.lat]);
    if (!b.isEmpty()) {
      lastRecentre.current = Date.now() + 6000;
      m.fitBounds(b, { padding: { top: 150, bottom: 260, left: 40, right: 40 }, duration: 900, maxZoom: 15.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.leg.vehicleId]);

  /* centrează pe stația de plecare aleasă */
  useEffect(() => {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !fromKey || st.ride || !st.net) return;
    const s = st.net.stops.find((x) => x.key === fromKey);
    if (s) m.easeTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 14.5), duration: 800 });
  }, [fromKey]);

  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = pickMode === 'none' ? '' : 'crosshair';
  }, [pickMode]);

  // maplibre adaugă clasa .maplibregl-map cu position:relative, care ar anula „absolute inset-0”,
  // așa că înălțimea o luăm de la părinte
  return <div ref={ref} className="h-full w-full" />;
}
