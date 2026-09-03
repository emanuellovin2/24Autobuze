/**
 * Pasul 3 — construiește rețeaua finală: public/network.json
 *  - traseul fiecărei linii urmează străzile reale (rutare OSRM prin stațiile în ordine)
 *  - fiecare stație e proiectată pe traseu (distanța de la capăt) -> permite ETA exact
 *  - orarele sunt cele publicate de operator; sensul retur e derivat din turul aceleiași curse
 */
import fs from 'node:fs';
import { stopKey } from './lib-stops.mjs';

const routes = JSON.parse(fs.readFileSync('data/routes.raw.json', 'utf8'));
const stopList = JSON.parse(fs.readFileSync('data/stops.json', 'utf8'));
const platforms = JSON.parse(fs.readFileSync('data/platforms.json', 'utf8'));
const byKey = new Map(stopList.map((s) => [s.key, s]));

const CACHE = 'data/.osrm-cache';
fs.mkdirSync(CACHE, { recursive: true });

const COLORS = {
  '3': '#e11d48', '4': '#7c3aed', '5': '#0891b2', '6': '#ea580c', '14': '#65a30d',
  '17': '#2563eb', '17B': '#60a5fa', '18': '#db2777', '18B': '#f472b6', '18J': '#a21caf',
  '22': '#0d9488', '22B': '#2dd4bf', '22J': '#14b8a6', '22S': '#047857',
};

/* ---------------- geometrie ---------------- */
const R = 6371000, rad = (x) => (x * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
/** proiecția unui punct pe segment, în coordonate plane locale (suficient la scara unui oraș) */
function projectOnSegment(p, a, b) {
  const kx = Math.cos(rad(p[1])) * 111320, ky = 110540;
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = p[0] * kx, py = p[1] * ky;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + dx * t, qy = ay + dy * t;
  return { t, dist: Math.hypot(px - qx, py - qy) };
}
/** distanța de-a lungul poliliniei până la proiecția punctului, căutând înainte de la `minDist` */
function locate(shape, cum, p, minDist) {
  let fwd = null, any = null;
  for (let i = 1; i < shape.length; i++) {
    const { t, dist } = projectOnSegment(p, shape[i - 1], shape[i]);
    const along = cum[i - 1] + (cum[i] - cum[i - 1]) * t;
    if (!any || dist < any.dist) any = { along, dist };
    if (along >= minDist - 1 && (!fwd || dist < fwd.dist)) fwd = { along, dist };
  }
  // dacă punctul cel mai apropiat de traseu e în urmă (traseul trece de două ori prin zonă),
  // preferăm totuși ordinea din orar, dar nu acceptăm o proiecție absurd de depărtată
  if (fwd && any && fwd.dist > any.dist * 3 && fwd.dist > 300) return { along: Math.max(minDist, any.along), dist: any.dist };
  return fwd ?? any;
}

/* ---------------- OSRM ---------------- */
async function osrm(coords, tag) {
  const file = `${CACHE}/${tag}.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const path = coords.map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.code === 'Ok') {
        fs.writeFileSync(file, JSON.stringify(json.routes[0]));
        await new Promise((r) => setTimeout(r, 1200));
        return json.routes[0];
      }
      throw new Error(json.code + ' ' + (json.message ?? ''));
    } catch (e) {
      if (attempt === 4) throw new Error(`OSRM ${tag}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
}

/* ---------------- orar ---------------- */
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const LAYOVER = 4; // minute de staționare la capăt înainte de cursa de întoarcere

/** curse pentru ambele sensuri, pornind de la orarul publicat (doar sensul tur) */
function buildTrips(schedule) {
  const out = { tur: [], retur: [] };
  for (const [dep, arr] of schedule) {
    const d = toMin(dep);
    let a = toMin(arr);
    if (a < d) a += 24 * 60;                       // cursă peste miezul nopții
    const dur = Math.max(6, a - d);
    out.tur.push({ dep: d, dur });
    out.retur.push({ dep: a + LAYOVER, dur });     // aceeași mașină se întoarce
  }
  out.tur.sort((x, y) => x.dep - y.dep);
  out.retur.sort((x, y) => x.dep - y.dep);
  return out;
}

/* ---------------- construcție ---------------- */
const DWELL = 15; // secunde de oprire în stație
const lines = [];
const warnings = [];

for (const r of routes) {
  const dirs = [];
  for (const dir of ['tur', 'retur']) {
    // rutăm prin peroane (punctul real de pe sensul acesta), nu prin centrul stației
    const seq = [];
    for (const raw of r.stops[dir]) {
      const pf = platforms[raw];
      const st = byKey.get(stopKey(raw));
      if (!pf || !st) { warnings.push(`linia ${r.ref}/${dir}: stație necunoscută „${raw}”`); continue; }
      if (seq.length && seq[seq.length - 1].key === st.key) continue; // duplicate consecutive pe site
      seq.push({ key: st.key, name: st.name, lon: pf.lon, lat: pf.lat });
    }
    if (seq.length < 2) { warnings.push(`linia ${r.ref}/${dir}: prea puține stații`); continue; }

    const route = await osrm(seq.map((s) => [s.lon, s.lat]), `${r.ref}-${dir}`);
    const shape = route.geometry.coordinates.map(([lon, lat]) => [+lon.toFixed(5), +lat.toFixed(5)]);
    const cum = [0];
    for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + hav(shape[i - 1], shape[i]));
    const total = cum[cum.length - 1];

    // proiectăm stațiile pe traseu, monoton crescător
    const stops = [];
    let cursor = 0;
    seq.forEach((s, i) => {
      const loc = i === 0 ? { along: 0, dist: 0 }
        : i === seq.length - 1 ? { along: total, dist: 0 }
        : locate(shape, cum, [s.lon, s.lat], cursor);
      if (!loc) { warnings.push(`linia ${r.ref}/${dir}: nu pot proiecta „${s.name}”`); return; }
      if (loc.dist > 250) warnings.push(`linia ${r.ref}/${dir}: „${s.name}” la ${Math.round(loc.dist)} m de traseu`);
      cursor = loc.along;
      stops.push({ key: s.key, d: Math.round(loc.along) });
    });

    const straight = hav([seq[0].lon, seq[0].lat], [seq[seq.length - 1].lon, seq[seq.length - 1].lat]);
    if (total > straight * 3.2 && straight > 800) warnings.push(`linia ${r.ref}/${dir}: traseu suspect de lung (${(total / 1000).toFixed(1)} km faţă de ${(straight / 1000).toFixed(1)} km în linie dreaptă)`);

    dirs.push({ id: dir, headsign: seq[seq.length - 1].name, length: Math.round(total), shape, stops });
  }

  const tripsLV = buildTrips(r.schedule.LV);
  const tripsSD = buildTrips(r.schedule.SD);
  lines.push({
    ref: r.ref,
    name: r.title.replace(/^TRASEUL?\s*/i, '').replace(/^[\d\w]+\s*[:.]?\s*/, '').trim() || r.title,
    color: COLORS[r.ref] ?? '#16a34a',
    directions: dirs,
    trips: { LV: { tur: tripsLV.tur, retur: tripsLV.retur }, SD: { tur: tripsSD.tur, retur: tripsSD.retur } },
  });
  const km = dirs.map((d) => (d.length / 1000).toFixed(1)).join(' / ');
  console.log(`${r.ref.padEnd(4)} ${km.padEnd(12)} km  ${dirs.map((d) => d.stops.length).join('+')} stații  ${tripsLV.tur.length}+${tripsLV.retur.length} curse L-V`);
}

/* ---------- repere pentru căutare („unde vrei să mergi?”) ---------- */
const landmarks = JSON.parse(fs.readFileSync('data/landmarks.json', 'utf8')).map((lm) => {
  const near = stopList
    .map((s) => ({ key: s.key, name: s.name, d: hav([lm.lon, lm.lat], [s.lon, s.lat]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .filter((s, i) => i === 0 || s.d < 900);
  return { ...lm, stops: near.map((s) => ({ key: s.key, walk: Math.round(s.d) })) };
});
const far = landmarks.filter((l) => l.stops[0].walk > 700);
if (far.length) warnings.push(`repere departe de orice stație: ${far.map((l) => `${l.name} (${l.stops[0].walk} m)`).join(', ')}`);

const network = {
  city: 'Bacău',
  operator: 'Transport Public SA Bacău',
  generated: new Date().toISOString().slice(0, 10),
  dwellSeconds: DWELL,
  stops: stopList.map((s) => ({ key: s.key, name: s.name, lon: s.lon, lat: s.lat, lines: s.lines })),
  landmarks,
  lines,
};
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/network.json', JSON.stringify(network));

console.log(`\n${lines.length} linii, ${stopList.length} stații, ${landmarks.length} repere -> public/network.json (${(fs.statSync('public/network.json').size / 1024).toFixed(0)} KB)`);
if (warnings.length) { console.log(`\n${warnings.length} avertismente:`); warnings.forEach((w) => console.log('  ! ' + w)); }
