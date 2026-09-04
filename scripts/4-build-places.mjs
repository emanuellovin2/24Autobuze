/**
 * Pasul 4 — toate străzile Bacăului, cu stațiile de autobuz de lângă fiecare.
 *
 * Omul nu caută „stația Narcisa”, ci strada pe care stă. Scriptul ia din
 * OpenStreetMap fiecare drum cu nume din municipiu (plus zona din jur pe unde
 * trec autobuzele), lipește segmentele aceleiași străzi și calculează, pentru
 * fiecare, stațiile din care se ajunge pe jos acolo.
 *
 * Rezultat: public/places.json (încărcat separat de hartă, ca pornirea să fie rapidă)
 */
import fs from 'node:fs';

const CACHE = 'data/.osm-cache';
/** serverele publice Overpass sunt aglomerate pe rând; le încercăm în ordine */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'autobuze-bacau/1.0 (proiect demonstrativ, date OSM)';

/** cutia care acoperă toată rețeaua de autobuz, cu margine de ~1,5 km */
const BBOX = [46.4900, 26.8500, 46.6200, 26.9800]; // S, W, N, E

const HIGHWAY = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|track|footway|path|cycleway';

/* drumuri cu nume care nu sunt „strada mea”: pasaje, poteci de parc, drumuri europene */
const SKIP_NAME = /^(DN\d|DJ\d|DC\d|E\s?\d|Drumul European|Autostrada|Acces\b|Parcare\b)/i;

const network = JSON.parse(fs.readFileSync('public/network.json', 'utf8'));

/* ---------------- Overpass, cu cache pe disc ---------------- */
async function overpass(name, query) {
  const file = `${CACHE}/${name}.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(`  ↓ ${name}… `);
  let last = null;
  for (let attempt = 0; attempt < OVERPASS.length * 2; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: query,
        // fără aceste două anteturi serverul public răspunde 406
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json));
      console.log(`${json.elements.length} elemente`);
      await new Promise((r) => setTimeout(r, 2000)); // serverul public e comun, nu îl luăm la rând
      return json;
    } catch (e) {
      last = e;
      process.stdout.write(`(${e.message}, reîncerc) `);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error(`Overpass ${name}: ${last?.message ?? 'eșuat'}`);
}

/* ---------------- geometrie ---------------- */
const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** Douglas–Peucker: păstrează forma străzii cu de câteva ori mai puține puncte */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1;
    let maxD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(points[k], points[i], points[j]);
      if (d > maxD) {
        maxD = d;
        far = k;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function segmentDistance(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320;
  const ky = 110540;
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = p[0] * kx, py = p[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const round = (c) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

/* ---------------- 1. datele brute ---------------- */
console.log('OpenStreetMap:');
const [S, W, N, E] = BBOX;

const inCity = await overpass(
  'streets-city',
  `[out:json][timeout:180];area["name"="Bacău"]["admin_level"="8"]->.a;` +
    `way(area.a)["highway"~"^(${HIGHWAY})$"]["name"];out tags geom;`
);
const inBox = await overpass(
  'streets-around',
  `[out:json][timeout:180];way(${S},${W},${N},${E})["highway"~"^(${HIGHWAY})$"]["name"];out tags geom;`
);
const settlements = await overpass(
  'settlements',
  `[out:json][timeout:120];node(${S},${W},${N},${E})["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"];out body;`
);

const cityWays = new Set(inCity.elements.map((e) => e.id));
const places = settlements.elements
  .filter((e) => e.tags?.name)
  .map((e) => ({ name: e.tags.name, lon: e.lon, lat: e.lat, rank: e.tags.place === 'city' ? 0 : 1 }));

/** localitatea unui grup de segmente: municipiul dacă e în el, altfel satul cel mai apropiat */
function localityOf(ways, centre) {
  if (ways.some((w) => cityWays.has(w.id))) return 'Bacău';
  const tagged = ways.map((w) => w.tags['addr:city']).find(Boolean);
  if (tagged) return tagged;
  let best = null;
  for (const p of places) {
    const d = hav(centre, [p.lon, p.lat]);
    if (!best || d < best.d) best = { d, name: p.name };
  }
  return best?.name ?? 'Bacău';
}

/* ---------------- 2. segmentele aceleiași străzi, grupate ---------------- */
/* Aceeași stradă apare în OSM ca zeci de segmente, iar numele se repetă de la un
 * sat la altul („Strada Viilor” există și în Barați, și în Măgura). Grupăm întâi
 * după nume, apoi separăm grupurile aflate la kilometri distanță unul de altul. */
const byName = new Map();
const seenWay = new Set();

for (const way of [...inCity.elements, ...inBox.elements]) {
  if (seenWay.has(way.id)) continue;
  seenWay.add(way.id);
  const name = (way.tags?.name ?? '').trim();
  if (!name || SKIP_NAME.test(name) || !way.geometry?.length) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push({ id: way.id, tags: way.tags, pts: way.geometry.map((g) => [g.lon, g.lat]) });
}

/** distanța minimă între două segmente (sub prag ne oprim: nu ne trebuie valoarea exactă) */
function segmentsClose(a, b, limit) {
  for (const p of a) for (const q of b) if (hav(p, q) < limit) return true;
  return false;
}

/** segmentele aceluiași nume care se ating formează o singură stradă */
function cluster(ways, limit = 500) {
  const parent = ways.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ways.length; i++) {
    for (let j = i + 1; j < ways.length; j++) {
      if (find(i) === find(j)) continue;
      if (segmentsClose(ways[i].pts, ways[j].pts, limit)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  ways.forEach((w, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(w);
  });
  return [...groups.values()];
}

/* ---------------- 3. stațiile de lângă fiecare stradă ---------------- */
const stops = network.stops;

/** stațiile din care se ajunge pe jos la stradă, cea mai apropiată prima */
function nearbyStops(parts) {
  const out = [];
  for (const s of stops) {
    let min = Infinity;
    for (const part of parts) {
      for (const p of part) {
        const d = hav(p, [s.lon, s.lat]);
        if (d < min) min = d;
      }
    }
    out.push({ key: s.key, walk: Math.round(min) });
  }
  out.sort((a, b) => a.walk - b.walk);
  // prima stație intră întotdeauna (chiar dacă e departe), restul doar dacă sunt
  // la o distanță pe care omul chiar o merge pe jos
  return out.filter((s, i) => i === 0 || (s.walk < 800 && i < 5));
}

const streets = [];
let skipped = 0;
for (const [name, ways] of byName) {
  for (const group of cluster(ways)) {
    const parts = group.map((w) => simplify(w.pts, 6).map(round)).filter((p) => p.length > 1);
    if (!parts.length) continue;

    let length = 0;
    for (const p of parts) for (let i = 1; i < p.length; i++) length += hav(p[i - 1], p[i]);

    // centrul: mijlocul celui mai lung segment — cade pe stradă, nu în spatele blocurilor
    const longest = parts.reduce((a, b) => (b.length > a.length ? b : a));
    const centre = longest[Math.floor(longest.length / 2)];
    const loc = localityOf(group, centre);

    const near = nearbyStops(parts);
    // străzile din satele din jur intră doar dacă chiar are cine să le ducă acolo
    if (loc !== 'Bacău' && near[0].walk > 1000) {
      skipped++;
      continue;
    }

    streets.push({
      n: name,
      loc,
      c: centre,
      l: Math.round(length),
      g: parts,
      s: near.map((s) => [s.key, s.walk]),
    });
  }
}

streets.sort((a, b) => a.n.localeCompare(b.n, 'ro'));

const out = {
  city: 'Bacău',
  generated: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap (ODbL)',
  streets,
};
fs.writeFileSync('public/places.json', JSON.stringify(out));

const size = (fs.statSync('public/places.json').size / 1024).toFixed(0);
const inBacau = streets.filter((s) => s.loc === 'Bacău').length;
const reachable = streets.filter((s) => s.s[0][1] <= 500).length;
console.log(
  `\n${streets.length} străzi (${inBacau} în municipiu, ${streets.length - inBacau} în localitățile din jur, ` +
    `${skipped} sărite fiindcă n-au nicio stație la mai puțin de 1 km), ` +
    `${reachable} la sub 500 m de o stație -> public/places.json (${size} KB)`
);
