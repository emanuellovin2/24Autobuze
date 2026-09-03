/**
 * Pasul 2 — dă coordonate celor ~83 de stații reale.
 * Strategie, în ordinea încrederii:
 *   1. OVERRIDE manual (puncte de interes verificate: Auchan, Gara, Elbac, FNC…)
 *   2. adresă exactă din OSM  („Calea Republicii, nr.88” -> nodul cu addr:housenumber=88)
 *   3. cel mai apropiat număr cunoscut de pe aceeași stradă
 *   4. interpolare pe axa străzii, după numărul poștal
 * Rezultat: data/stops.json + raport cu metoda folosită pentru fiecare stație.
 */
import fs from 'node:fs';
import { stopKey, prettyName, splitAddress, stripDiacritics } from './lib-stops.mjs';

const OSM = (f) => JSON.parse(fs.readFileSync(`data/.osm-cache/${f}.json`, 'utf8'));
const routes = JSON.parse(fs.readFileSync('data/routes.raw.json', 'utf8'));

/** stații care sunt puncte de interes reale: adresa de pe site nu trebuie să le miște */
// „elbac” lipsește intenționat: are adresă reală (Calea Moinești nr. 34), iar
// numărul mic o plasează lângă oraș, nu la capătul vestic al străzii.
const HARD = new Set(['fnc', 'auchan', 'jumbo', 'selgros', 'cora', 'gara', 'autogara',
  'cartier fiald', 'capu dealului', 'piata centrala', 'stadionul municipal', 'pasaj letea']);

/* ---------- coordonate verificate manual (puncte de interes / capete de linie) ---------- */
const OVERRIDE = {
  fnc:                  [26.92439, 46.51600], // capătul sudic al Căii Republicii, zona industrială
  wmw:                  [26.92310, 46.52140],
  auchan:               [26.92920, 46.51059],
  jumbo:                [26.92692, 46.50368],
  selgros:              [26.90668, 46.58722],
  cora:                 [26.92190, 46.56250], // Bd. Alexandru cel Bun nr.10 (azi Supernova)
  gara:                 [26.89510, 46.56589],
  autogara:             [26.92056, 46.57191],
  elbac:                [26.87426, 46.57833], // capătul vestic al Căii Moinești
  'cartier fiald':      [26.90332, 46.58251], // str. Tazlăului
  'capu dealului':      [26.95519, 46.58591], // capătul estic al Căii Bârladului
  'piata centrala':     [26.91451, 46.56813],
  'stadionul municipal':[26.91350, 46.55733],
  'arena mall':         [26.91621, 46.58050],
  'aprod purice':       [26.90930, 46.58120],
  'catedrala ortodoxa': [26.91072, 46.57012],
  'podul cu lanturi':   [26.91700, 46.57620],
  'nv karpen':          [26.89890, 46.57070],
  pambac:               [26.89533, 46.57040],
  'fabrica de bere':    [26.88700, 46.57450],
  'cartier cfr':        [26.88250, 46.57320],
  'popas gheraiesti':   [26.90528, 46.59651],
  'statiunea pomicola': [26.93120, 46.59200],
  'intersectia izvoare':[26.92412, 46.55533],
  'bazar letea':        [26.92063, 46.54172],
  subex:                [26.92200, 46.54600],
  pompieri:             [26.91700, 46.55250],
  'nicu enea':          [26.91870, 46.57430], // str. Nicu Enea, zona Cornișa
  'bus selena':         [26.89700, 46.57080],
  'parcul trandafirilor':[26.90800, 46.56600],
  'centrul militar':    [26.90400, 46.56500],
  tribunal:             [26.91180, 46.56900],
  'baia publica':       [26.92172, 46.57165],
  'pod bistrita':       [26.92500, 46.57280],
  'complex serbanesti': [26.92933, 46.57983],
  'il caragiale':       [26.92230, 46.56800],
  'biserica precista':  [26.91480, 46.56520], // Curtea Domnească, pe Str. 9 Mai
  'pasaj letea':        [26.91520, 46.54680], // pasajul Letea, pe Calea Mărășești
};

/* ---------- nume de afișat, acolo unde site-ul operatorului scrie neîngrijit ---------- */
const DISPLAY = {
  jumbo: 'Jumbo',
  fnc: 'FNC',
  'popas gheraiesti': 'Popas Gherăiești',
  'scoala generala 9': 'Școala Generală nr. 9',
  'scoala generala 6': 'Școala Generală nr. 6',
  'arcadie septilici 5': 'Arcadie Șeptilici nr. 5',
  'arcadie septilici 28': 'Arcadie Șeptilici nr. 28',
  'prelungirea arcadie septilici 5': 'Prelungirea Șeptilici nr. 5',
  'prelungirea arcadie septilici 68': 'Prelungirea Șeptilici nr. 68',
  'vasile parvan 18': 'Vasile Pârvan nr. 18',
  'stefan cel mare 25': 'Ștefan cel Mare nr. 25',
  'pasaj letea': 'Pasaj Letea – Orizont',
  'nv karpen': 'Colegiul N.V. Karpen',
  ara: 'A.R.A.',
  bcr: 'BCR',
  'il caragiale': 'I.L. Caragiale',
  petromv: 'Petrom Mioriței',
  bancii: 'Băncii',
  'cartier cfr': 'Cartier CFR',
  'energiei 2': 'Energiei nr. 2',
  'energiei 25': 'Energiei nr. 25',
  'energiei 36': 'Energiei nr. 36',
  'energiei 39': 'Energiei nr. 39',
};

/* ---------- indexul de adrese OSM ---------- */
const addrIdx = new Map(); // stradă normalizată -> [{n, lon, lat}]
for (const e of OSM('addresses').elements) {
  const street = e.tags['addr:street'];
  const n = parseInt(String(e.tags['addr:housenumber']).replace(/\D.*/, ''), 10);
  if (!street || !Number.isFinite(n)) continue;
  const k = normStreet(street);
  const lon = e.center ? e.center.lon : e.lon;
  const lat = e.center ? e.center.lat : e.lat;
  if (lon == null) continue;
  if (!addrIdx.has(k)) addrIdx.set(k, []);
  addrIdx.get(k).push({ n, lon, lat });
}

/* ---------- axele străzilor (polilinii unite din OSM) ---------- */
const R = 6371000, rad = (x) => (x * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const pkey = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
const plen = (p) => p.reduce((t, _, i) => (i ? t + hav(p[i - 1], p[i]) : 0), 0);

function chainWays(segs) {
  segs = segs.map((s) => s.slice());
  const chains = [];
  while (segs.length) {
    let cur = segs.pop(), moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], head = pkey(cur[0]), tail = pkey(cur[cur.length - 1]);
        if (pkey(s[0]) === tail) { cur = cur.concat(s.slice(1)); }
        else if (pkey(s[s.length - 1]) === tail) { cur = cur.concat(s.slice().reverse().slice(1)); }
        else if (pkey(s[s.length - 1]) === head) { cur = s.slice().concat(cur.slice(1)); }
        else if (pkey(s[0]) === head) { cur = s.slice().reverse().concat(cur.slice(1)); }
        else continue;
        segs.splice(i, 1); moved = true; break;
      }
    }
    chains.push(cur);
  }
  return chains.sort((a, b) => plen(b) - plen(a));
}

const streetAxis = new Map(); // stradă normalizată -> polilinie
{
  const byName = {};
  for (const w of OSM('streets').elements) {
    if (!w.geometry || !w.tags?.name) continue;
    (byName[w.tags.name] ||= []).push(w.geometry.map((g) => [g.lon, g.lat]));
  }
  // Numerele poștale pornesc dinspre centru: orientăm fiecare axă cu capătul dinspre centru primul.
  const CENTER = [26.9146, 46.5671];
  for (const [n, segs] of Object.entries(byName)) {
    const axis = chainWays(segs)[0];
    if (hav(axis[axis.length - 1], CENTER) < hav(axis[0], CENTER)) axis.reverse();
    streetAxis.set(normStreet(n), axis);
  }
}

function normStreet(s) {
  return stripDiacritics(s).toLowerCase()
    .replace(/^(strada|str\.?|calea|bulevardul|bvd\.?|blv\.?|b-dul|soseaua|sos\.?|aleea)\s+/i, '')
    .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** cel mai apropiat punct de pe o polilinie */
function nearestOnAxis(p, poly) {
  let best = null;
  for (let i = 1; i < poly.length; i++) {
    const { t, dist } = projectOnSegment(p, poly[i - 1], poly[i]);
    if (!best || dist < best.dist) {
      best = { dist, lon: poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, lat: poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t };
    }
  }
  return best;
}
function projectOnSegment(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320, ky = 110540;
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = p[0] * kx, py = p[1] * ky;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { t, dist: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) };
}

const METRES_PER_NUMBER = 11.5;

/** cât de departe de începutul străzii cade un număr poștal, învățat din adresele OSM */
const fitCache = new Map();
function numberToMetres(street, axis, addresses) {
  if (fitCache.has(street)) return fitCache.get(street);
  const pts = addresses
    .map((a) => ({ n: a.n, d: distanceAlong(axis, [a.lon, a.lat]) }))
    .filter((p) => p.d != null && p.n > 0);
  let fit = null;
  if (pts.length >= 2) {
    // regresie liniară prin origine și prin adresele cunoscute
    const n = pts.length;
    const sx = pts.reduce((t, p) => t + p.n, 0);
    const sy = pts.reduce((t, p) => t + p.d, 0);
    const sxx = pts.reduce((t, p) => t + p.n * p.n, 0);
    const sxy = pts.reduce((t, p) => t + p.n * p.d, 0);
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) > 1e-6) {
      const a = (n * sxy - sx * sy) / denom;
      const b = (sy - a * sx) / n;
      if (a > 0.5) fit = { at: (num) => Math.max(0, a * num + b), label: `${n} adrese, ${a.toFixed(1)} m/nr.` };
    }
  } else if (pts.length === 1 && pts[0].d > 20) {
    const { n, d } = pts[0];
    fit = { at: (num) => (num / n) * d, label: `1 adresă (nr.${n} la ${Math.round(d)} m)` };
  }
  fitCache.set(street, fit);
  return fit;
}

/** distanța de-a lungul axei până la proiecția unui punct */
function distanceAlong(poly, p) {
  let acc = 0;
  let best = null;
  for (let i = 1; i < poly.length; i++) {
    const seg = hav(poly[i - 1], poly[i]);
    const { t, dist } = projectOnSegment(p, poly[i - 1], poly[i]);
    if (!best || dist < best.dist) best = { dist, d: acc + seg * t };
    acc += seg;
  }
  return best && best.dist < 300 ? best.d : null;
}

/** punct de pe axă la o anumită distanță de început (limitat la lungimea străzii) */
function alongMetres(poly, metres) {
  const total = poly.reduce((t, _, i) => (i ? t + hav(poly[i - 1], poly[i]) : 0), 0);
  return alongFraction(poly, total > 0 ? Math.min(metres, total) / total : 0);
}

/** punct pe polilinie la fracția f din lungime */
function alongFraction(poly, f) {
  const total = plen(poly), target = Math.max(0, Math.min(1, f)) * total;
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = hav(poly[i - 1], poly[i]);
    if (acc + d >= target) {
      const t = d === 0 ? 0 : (target - acc) / d;
      return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t];
    }
    acc += d;
  }
  return poly[poly.length - 1];
}

/** „Str. 9 Mai, nr.33” / „Energiei 25” / „Calea Barladului nr.78” -> {street, num} */
function parseAddress(addr) {
  if (!addr) return null;
  addr = addr.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  let street, num;
  const withNr = addr.match(/^(.+?)[,\s]+nr\.?\s*(\d+)/i);
  if (withNr) { street = withNr[1]; num = +withNr[2]; }
  else {
    const trailing = addr.match(/^(.+?)[,\s]+(\d+)\s*(?:[-–]\s*\d+)?\s*$/);
    if (!trailing) return null;
    street = trailing[1]; num = +trailing[2];
  }
  const k = normStreet(street);
  if (!k) return null;
  // „Prelungirea X” nu e indexată separat în OSM: cade pe strada X
  const alt = k.replace(/^prelungirea\s+/, '');
  const resolved = addrIdx.has(k) || streetAxis.has(k) ? k : alt;
  return { street: resolved, num };
}

/* ---------- peroane: fiecare variantă scrisă pe site e un punct pe teren ---------- */
/* Pe bulevardele cu sens unic, „Chimiei nr.21” (spre nord) și „Chimiei nr.76” (spre sud) sunt
   două peroane diferite. Le ținem separat pentru rutare, dar le grupăm sub aceeași stație. */
const platforms = new Map(); // text brut -> peron
const stops = new Map();     // cheie canonică -> stație

for (const r of routes) {
  for (const dir of ['tur', 'retur']) {
    for (const raw of r.stops[dir]) {
      const key = stopKey(raw);
      if (!stops.has(key)) stops.set(key, { key, variants: [], lines: new Set() });
      const st = stops.get(key);
      st.variants.push(raw);
      st.lines.add(r.ref);
      if (!platforms.has(raw)) {
        const { name, address } = splitAddress(raw);
        platforms.set(raw, { raw, key, address: address ?? (/\d/.test(name) ? name : null) });
      }
    }
  }
}

/** rezolvă un peron: adresa exactă are prioritate, POI-urile sunt fixate manual */
function resolve(p) {
  if (HARD.has(p.key) && OVERRIDE[p.key]) return { lon: OVERRIDE[p.key][0], lat: OVERRIDE[p.key][1], method: 'POI fix' };

  const m = parseAddress(p.address);
  if (m) {
    const { street, num } = m;
    const axis = streetAxis.get(street);
    // În Bacău există străzi omonime (o „9 Mai” și în Șerbănești): păstrăm doar
    // adresele de lângă coridorul pe care circulă efectiv autobuzul.
    let list = addrIdx.get(street) ?? [];
    if (axis && list.length) {
      const near = list.filter((a) => nearestOnAxis([a.lon, a.lat], axis).dist < 200);
      if (near.length) list = near;
    }

    // 1. număr exact — cea mai bună dovadă
    const exact = list.find((a) => a.n === num);
    if (exact) {
      const snap = axis ? nearestOnAxis([exact.lon, exact.lat], axis) : null;
      const use = snap && snap.dist < 220 ? snap : exact;
      return { lon: use.lon, lat: use.lat, method: `adresă ${street} ${num}` };
    }

    // 2. interpolare pe axă.
    // Adresele cunoscute din OSM ne dau relația „număr poștal -> metri de la
    // începutul străzii”. Nu putem presupune o densitate fixă: pe o stradă
    // industrială ca Moinești, nr. 34 e deja la 1,8 km, fiindcă loturile
    // fabricilor sunt uriașe. Când nu avem nicio adresă, cădem pe ~11,5 m/număr.
    if (axis) {
      const fit = numberToMetres(street, axis, list);
      const metres = fit ? fit.at(num) : num * METRES_PER_NUMBER;
      const q = alongMetres(axis, metres);
      return { lon: q[0], lat: q[1], method: `axă ${street} nr.${num} ≈ ${Math.round(metres)} m${fit ? ` (${fit.label})` : ''}` };
    }

    // 3. fără axă: cel mai apropiat număr cunoscut, dacă e rezonabil de aproape
    if (list.length) {
      const best = list.reduce((a, b) => (Math.abs(b.n - num) < Math.abs(a.n - num) ? b : a));
      if (Math.abs(best.n - num) <= 15) return { lon: best.lon, lat: best.lat, method: `≈${street} ${best.n} (cerut ${num})` };
    }
  }

  if (OVERRIDE[p.key]) return { lon: OVERRIDE[p.key][0], lat: OVERRIDE[p.key][1], method: 'override' };
  return null;
}

for (const p of platforms.values()) {
  const r = resolve(p);
  if (r) Object.assign(p, r);
}

/* Pasul 2: peroanele scrise fără adresă („Piața Sud (2)”) împrumută coordonatele
   de la un peron al aceleiași stații, de pe același sens. „(2)”/„(3)” = sensul de retur. */
const side = (raw) => (/\(\s*[23]\s*\)/.test(raw) ? 'B' : 'A');
const byStop = new Map();
for (const p of platforms.values()) {
  if (!byStop.has(p.key)) byStop.set(p.key, []);
  byStop.get(p.key).push(p);
}
for (const [, group] of byStop) {
  for (const p of group) {
    if (p.lon != null) continue;
    const donor = group.find((o) => o.lon != null && side(o.raw) === side(p.raw)) ?? group.find((o) => o.lon != null);
    if (donor) { p.lon = donor.lon; p.lat = donor.lat; p.method = `preluat de la „${donor.raw}”`; }
  }
}
const unresolved = [...platforms.values()].filter((p) => p.lon == null);

/* ---------- stațiile canonice: centrul peroanelor lor ---------- */
for (const st of stops.values()) {
  st.name = DISPLAY[st.key] ?? prettyName(st.variants);
  st.lines = [...st.lines];
  const pts = st.variants.map((v) => platforms.get(v)).filter((p) => p.lon != null);
  st.lon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  st.lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  st.spread = Math.max(0, ...pts.map((p) => hav([p.lon, p.lat], [st.lon, st.lat])));
}

const list = [...stops.values()].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
for (const st of list) {
  const flag = st.spread > 400 ? ' <-- peroane foarte depărtate' : '';
  console.log(`  ${st.name.padEnd(28)} ${st.lat.toFixed(5)},${st.lon.toFixed(5)}  ${String(st.variants.length).padStart(2)} variante, ${Math.round(st.spread)} m între peroane${flag}`);
}
console.log(`\n${stops.size} stații canonice | ${platforms.size} peroane | ${unresolved.length} nerezolvate`);
unresolved.forEach((p) => console.log('  !! ' + p.raw));

fs.writeFileSync('data/stops.json', JSON.stringify(
  list.map((s) => ({ key: s.key, name: s.name, lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), lines: s.lines })), null, 1));
fs.writeFileSync('data/platforms.json', JSON.stringify(
  Object.fromEntries([...platforms.values()].filter((p) => p.lon != null)
    .map((p) => [p.raw, { key: p.key, lon: +p.lon.toFixed(6), lat: +p.lat.toFixed(6), method: p.method }])), null, 1));
console.log('→ data/stops.json, data/platforms.json');
