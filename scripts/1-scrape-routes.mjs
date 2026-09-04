/**
 * Pasul 1 — extrage traseele reale STP Bacău de pe transportpublicbc.ro.
 * Paginile HTML sunt păstrate în data/.route-cache/ ca să nu lovim site-ul la fiecare rulare.
 * Rezultat: data/routes.raw.json
 */
import fs from 'node:fs';
import path from 'node:path';

const CACHE = 'data/.route-cache';
const BASE = 'https://transportpublicbc.ro/trasee/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/** slug -> { ref, name } */
const ROUTES = [
  ['traseul-3-f-n-c-elbac', '3'],
  ['traseul-4-cora-gheraiesti', '4'],
  ['traseul-5-cora-serbanesti', '5'],
  ['traseul-6-clinica-gtl-capu-dealului', '6'],
  ['traseul-14-f-n-c-milcov-gara', '14'],
  ['traseul-17-f-n-c-mioritei-gara', '17'],
  ['traseul-17b-auchan-mioritei-gara', '17B'],
  ['traseul-18-f-n-c-gara', '18'],
  ['traseu-18b-auchan-gara', '18B'],
  ['traseu-18j-jumbo-gara', '18J'],
  ['traseu-22-f-n-c-cartier-fiald', '22'],
  ['traseu-22b-auchan-cartier-fiald', '22B'],
  ['traseu-22j-jumbo-cartier-fiald', '22J'],
  ['traseu-22s-fnc-cartier-fiald', '22S'],
];

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8211;|&ndash;|&#8212;/g, '-')
    .replace(/&#8217;|&#39;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8222;|&#8221;|&quot;/g, '"')
    .replace(/&rarr;|&#8594;/g, '→')
    .replace(/\s+/g, ' ')
    .trim();

async function html(slug) {
  const file = path.join(CACHE, `${slug}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const res = await fetch(BASE + slug + '/', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const body = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, body);
  await new Promise((r) => setTimeout(r, 1500));
  return body;
}

/** listele de stații apar ca text numerotat sub titlurile TUR / RETUR */
function parseStops(raw) {
  const flat = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const lines = flat.split(/<[^>]+>/).map(decode).filter(Boolean);
  const out = { tur: [], retur: [] };
  let cur = null;
  for (const s of lines) {
    // pe unele pagini titlul e lipit de sens: „TUR F.N.C. → Cartier FIALD”
    if (/^RETUR\b/i.test(s)) { cur = 'retur'; continue; }
    if (/^TUR\b/i.test(s)) { cur = 'tur'; continue; }
    if (/^Compania noastr/i.test(s)) break;
    if (!cur) continue;
    if (/→/.test(s)) continue;
    const m = s.match(/^(\d{1,2})[.)]\s*(.+)$/);
    if (m) { out[cur].push(m[2].trim()); continue; }
    // rândurile fără număr sunt greșeli de redactare pe site (ex. „Pasaj Letea (2)” la linia 17)
    if (out[cur].length && s.length > 2 && s.length < 70 && !/^\d{1,2}:\d{2}$/.test(s)) out[cur].push(s);
  }
  return out;
}

/** orarele apar în <table>; tabelul-antet dă sensul, următorul tabel dă perechile plecare/sosire */
function parseSchedules(raw) {
  const tables = raw.match(/<table[\s\S]*?<\/table>/gi) || [];
  const rows = (t) => (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(decode));
  const trips = [];
  let heading = null;
  for (const t of tables) {
    const rs = rows(t);
    const times = rs.filter((r) => r.length >= 2 && /^\d{1,2}:\d{2}$/.test(r[0]) && /^\d{1,2}:\d{2}$/.test(r[1]));
    if (times.length === 0) { heading = rs.flat().find((c) => /→/.test(c)) || heading; continue; }
    trips.push({ dir: heading, pairs: times.map((r) => [r[0], r[1]]) });
  }
  // primul bloc = Luni-Vineri, al doilea = Sâmbătă-Duminică (ordinea din pagină)
  return { LV: trips[0]?.pairs ?? [], SD: trips[1]?.pairs ?? [], dir: trips[0]?.dir ?? null };
}

/* ---------- cursele speciale spre aeroport (linia 18) ---------- *
 * Nu au listă de stații publicată, ci doar ore de plecare pe zile ale
 * săptămânii, din GARA sau din FNC. Le păstrăm separat, ca informație. */
const DAYS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

function parseAirport(raw) {
  const tables = raw.match(/<table[\s\S]*?<\/table>/gi) || [];
  const days = [];
  let cursor = 0;
  for (const table of tables) {
    const at = raw.indexOf(table, cursor);
    cursor = at + table.length;
    // ziua e scrisă în titlul dinaintea tabelului: „Marți – Traseul 18 (Aeroport)”
    const before = decode(raw.slice(Math.max(0, at - 500), at));
    const day = DAYS.filter((d) => before.includes(d)).pop();
    const runs = (table.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .map((r) => (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(decode))
      .filter((cells) => cells.length >= 2 && /^\d{1,2}:\d{2}$/.test(cells[1]))
      .map(([from, at]) => ({ from, at }))
      .sort((a, b) => a.at.localeCompare(b.at));
    if (day && runs.length) days.push({ day, runs });
  }
  return days;
}

const airportRaw = await html('traseu-18-curse-aeroport');
const airport = {
  ref: '18',
  name: 'Curse Aeroport',
  note: 'Curse speciale ale liniei 18 către Aeroportul „George Enescu”, cu ore diferite de la o zi la alta.',
  source: BASE + 'traseu-18-curse-aeroport/',
  days: parseAirport(airportRaw),
};
fs.writeFileSync('data/airport.json', JSON.stringify(airport, null, 1));
console.log(
  `18 aeroport: ${airport.days.map((d) => `${d.day} ${d.runs.length}`).join(', ')} -> data/airport.json`
);

const result = [];
for (const [slug, ref] of ROUTES) {
  const raw = await html(slug);
  const title = decode((raw.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || slug).replace(/\s*-\s*Transport Public Bacau\s*$/i, '');
  const stops = parseStops(raw);
  const sched = parseSchedules(raw);
  result.push({ ref, slug, title, stops, schedule: { LV: sched.LV, SD: sched.SD }, scheduleDir: sched.dir });
  console.log(
    `${ref.padEnd(4)} ${String(stops.tur.length).padStart(2)} tur / ${String(stops.retur.length).padStart(2)} retur   ` +
      `orar: ${String(sched.LV.length).padStart(3)} curse L-V, ${String(sched.SD.length).padStart(2)} curse S-D`
  );
}
fs.writeFileSync('data/routes.raw.json', JSON.stringify(result, null, 1));
console.log(`\n→ data/routes.raw.json (${result.length} linii)`);
