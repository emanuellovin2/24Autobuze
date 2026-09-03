'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '@/lib/store';
import { clock } from '@/lib/sim/clock';
import { nearestStop } from '@/lib/search';
import { iconId, registerBusIcons } from './busIcons';
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

  const net = useStore((s) => s.net);
  const sim = useStore((s) => s.sim);
  const theme = useStore((s) => s.theme);
  const selectedLine = useStore((s) => s.selectedLine);
  const selectedVehicle = useStore((s) => s.selectedVehicle);
  const myStop = useStore((s) => s.myStop);
  const destStop = useStore((s) => s.destStop);
  const pickMode = useStore((s) => s.pickMode);

  function applyPick(key: string) {
    const st = useStore.getState();
    if (st.pickMode === 'dest') st.setDestStop(key);
    else st.setMyStop(key);
  }


  /* ---------------- selecții ---------------- */
  function syncSelection() {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !ready.current || !st.net) return;

    if (m.getLayer('routes-active')) m.setFilter('routes-active', ['==', ['get', 'line'], st.selectedLine ?? '___']);
    if (m.getLayer('routes-line')) m.setPaintProperty('routes-line', 'line-opacity', st.selectedLine ? 0.18 : 0.75);

    const picked: GeoJSON.Feature[] = [];
    const mine = st.net.stops.find((s) => s.key === st.myStop);
    const dest = st.net.stops.find((s) => s.key === st.destStop);
    if (mine) picked.push({ type: 'Feature', properties: { color: '#2563eb' }, geometry: { type: 'Point', coordinates: [mine.lon, mine.lat] } });
    if (dest) picked.push({ type: 'Feature', properties: { color: '#dc2626' }, geometry: { type: 'Point', coordinates: [dest.lon, dest.lat] } });
    (m.getSource('picked') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: picked });
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
    add('trace', empty);
    add('picked', empty);

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
        'line-opacity': 0.75,
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 9],
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

    function layer(spec: maplibregl.LayerSpecification) {
      if (m!.getLayer(spec.id)) m!.removeLayer(spec.id);
      m!.addLayer(spec);
    }

    for (const id of ['vehicles', 'stops-circle']) {
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

      const vehicles = sim.vehiclesAt(t);
      const features: GeoJSON.Feature[] = vehicles.map((v: Vehicle) => ({
        type: 'Feature',
        properties: {
          id: v.id,
          line: v.line,
          icon: iconId(v.line, v.id === st.selectedVehicle, !!st.selectedLine && st.selectedLine !== v.line),
          bearing: v.bearing,
        },
        geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      }));
      (m.getSource('vehicles') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features,
      });

      const src = m.getSource('trace') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        const v = st.selectedVehicle ? vehicles.find((x) => x.id === st.selectedVehicle) : null;
        const path = v && st.myStop ? sim.pathTo(v, st.myStop) : [];
        src.setData(
          path.length > 1
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } }] }
            : empty
        );
      }
    }, 50);
    return () => clearInterval(id);
  }, [sim]);

  useEffect(syncSelection, [selectedLine, myStop, destStop, selectedVehicle, net]);

  /* încadrează traseul liniei alese */
  useEffect(() => {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !selectedLine || !st.net) return;
    const line = st.net.lines.find((l) => l.ref === selectedLine);
    if (!line) return;
    const b = new maplibregl.LngLatBounds();
    for (const d of line.directions) for (const c of d.shape) b.extend(c as [number, number]);
    m.fitBounds(b, { padding: { top: 80, bottom: 120, left: 60, right: 60 }, duration: 900 });
  }, [selectedLine]);

  /* centrează pe stația aleasă */
  useEffect(() => {
    const m = map.current;
    const st = useStore.getState();
    if (!m || !myStop || !st.net) return;
    const s = st.net.stops.find((x) => x.key === myStop);
    if (s) m.easeTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 14.5), duration: 800 });
  }, [myStop]);

  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = pickMode === 'none' ? '' : 'crosshair';
  }, [pickMode]);

  // maplibre adaugă clasa .maplibregl-map cu position:relative, care ar anula „absolute inset-0”,
  // așa că înălțimea o luăm de la părinte
  return <div ref={ref} className="h-full w-full" />;
}
