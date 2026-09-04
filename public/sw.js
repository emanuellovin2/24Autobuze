/*
 * Service worker-ul aplicației.
 *
 * Aplicația nu are server: rețeaua de transport e un fișier JSON, iar orarul
 * rulează în browser. Deci, odată instalată, poate funcționa complet offline —
 * mai puțin fundalul de hartă, care se păstrează doar pentru zonele vizitate.
 */
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const TILE_LIMIT = 600;

const PRECACHE = [
  '/',
  '/network.json',
  '/places.json',
  '/manifest.webmanifest',
  '/maplibre/maplibre-gl-worker.mjs',
  '/maplibre/maplibre-gl-shared.mjs',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      // un fișier lipsă (ex. în dev) nu trebuie să blocheze instalarea
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // paginile: încercăm rețeaua, dar dacă utilizatorul e în autobuz fără semnal
  // servim aplicația din cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/', { ignoreSearch: true }).then((r) => r || Response.error()))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // fișierele build-ului au hash în nume: dacă există în cache, sunt corecte
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/maplibre/')) {
      event.respondWith(cacheFirst(req, SHELL));
      return;
    }
    if (url.pathname === '/network.json' || url.pathname === '/places.json' || url.pathname === '/manifest.webmanifest') {
      event.respondWith(staleWhileRevalidate(req, SHELL));
      return;
    }
    return;
  }

  // fundalul de hartă (CARTO): păstrăm ce s-a vizitat, cu o limită de spațiu
  if (url.hostname.endsWith('cartocdn.com') || url.hostname.endsWith('openstreetmap.org')) {
    event.respondWith(tileCache(req));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

async function tileCache(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    return hit || Response.error();
  }
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  const keys = await cache.keys();
  if (keys.length > TILE_LIMIT) await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((k) => cache.delete(k)));
  trimming = false;
}
