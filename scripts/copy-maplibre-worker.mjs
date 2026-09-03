/**
 * MapLibre își pornește workerul cu `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
 * iar Turbopack nu servește acel fișier — harta rămâne albă, fără dale.
 * Copiem workerul și modulul lui comun în public/ și îi spunem explicit adresa.
 */
import fs from 'node:fs';
import path from 'node:path';

const from = 'node_modules/maplibre-gl/dist';
const to = 'public/maplibre';
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

fs.mkdirSync(to, { recursive: true });
for (const f of files) {
  const src = path.join(from, f);
  if (!fs.existsSync(src)) {
    console.error(`lipsește ${src} — verifică versiunea maplibre-gl`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(to, f));
}
console.log(`worker MapLibre copiat în ${to}/`);
