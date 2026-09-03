/**
 * Generează iconițele PWA (public/icons/*.png) fără nicio dependență:
 * desenăm un autobuz pe o pânză RGBA la scară 4×, apoi micșorăm — de aici
 * vin marginile netede — și codificăm PNG cu zlib din Node.
 *
 * Se rulează manual (`node scripts/make-icons.mjs`); rezultatul e comis în repo.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 4; // supersampling

const GREEN = [22, 163, 74];
const DARK = [15, 42, 26];
const WHITE = [255, 255, 255];
const GLASS = [186, 230, 210];

class Canvas {
  constructor(size) {
    this.n = size;
    this.px = new Uint8Array(size * size * 4);
  }
  set(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const i = (y * this.n + x) * 4;
    const src = a / 255;
    const dst = (this.px[i + 3] / 255) * (1 - src);
    const out = src + dst;
    if (out <= 0) return;
    this.px[i] = (r * src + this.px[i] * dst) / out;
    this.px[i + 1] = (g * src + this.px[i + 1] * dst) / out;
    this.px[i + 2] = (b * src + this.px[i + 2] * dst) / out;
    this.px[i + 3] = out * 255;
  }
  rect(x0, y0, w, h, color, radius = 0) {
    for (let y = Math.floor(y0); y < y0 + h; y++) {
      for (let x = Math.floor(x0); x < x0 + w; x++) {
        if (radius > 0) {
          const dx = Math.max(x0 + radius - x - 0.5, x - 0.5 - (x0 + w - radius), 0);
          const dy = Math.max(y0 + radius - y - 0.5, y - 0.5 - (y0 + h - radius), 0);
          if (dx * dx + dy * dy > radius * radius) continue;
        }
        this.set(x, y, color);
      }
    }
  }
  circle(cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, color);
      }
    }
  }
  /** micșorează de SS ori, mediind pixelii — anti-aliasing simplu */
  downsample() {
    const n = this.n / SS;
    const out = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const acc = [0, 0, 0, 0];
        for (let j = 0; j < SS; j++) {
          for (let i = 0; i < SS; i++) {
            const s = ((y * SS + j) * this.n + x * SS + i) * 4;
            const a = this.px[s + 3];
            acc[0] += this.px[s] * a;
            acc[1] += this.px[s + 1] * a;
            acc[2] += this.px[s + 2] * a;
            acc[3] += a;
          }
        }
        const d = (y * n + x) * 4;
        const a = acc[3];
        out[d] = a ? acc[0] / a : 0;
        out[d + 1] = a ? acc[1] / a : 0;
        out[d + 2] = a ? acc[2] / a : 0;
        out[d + 3] = a / (SS * SS);
      }
    }
    return { n, px: out };
  }
}

function png({ n, px }) {
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0; // filtru „none”
    Buffer.from(px.buffer, y * n * 4, n * 4).copy(raw, y * (n * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // adâncime
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** un autobuz văzut din față, pe fundal verde */
function icon(size, { bleed = false } = {}) {
  const n = size * SS;
  const c = new Canvas(n);
  const u = n / 100; // unități procentuale

  if (bleed) c.rect(0, 0, n, n, GREEN);
  else c.rect(0, 0, n, n, GREEN, 22 * u);

  // zona sigură pentru iconițele „maskable”: glifa stă în cercul central
  const s = bleed ? 0.68 : 0.86;
  const w = 46 * u * s;
  const h = 58 * u * s;
  const x = (n - w) / 2;
  const y = (n - h) / 2 - 1 * u;
  const r = 9 * u * s;

  c.rect(x, y, w, h, WHITE, r);
  // parbriz
  c.rect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.3, GLASS, r * 0.55);
  // grilă / bandă
  c.rect(x + w * 0.12, y + h * 0.52, w * 0.76, h * 0.12, [226, 232, 240], r * 0.3);
  // faruri
  c.circle(x + w * 0.24, y + h * 0.75, w * 0.09, [250, 204, 21]);
  c.circle(x + w * 0.76, y + h * 0.75, w * 0.09, [250, 204, 21]);
  // roți
  c.rect(x - w * 0.06, y + h * 0.86, w * 0.24, h * 0.14, DARK, r * 0.5);
  c.rect(x + w * 0.82, y + h * 0.86, w * 0.24, h * 0.14, DARK, r * 0.5);

  return png(c.downsample());
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', icon(192)],
  ['icon-512.png', icon(512)],
  ['icon-maskable-512.png', icon(512, { bleed: true })],
  ['apple-touch-icon.png', icon(180, { bleed: true })],
];
for (const [name, buf] of files) {
  writeFileSync(resolve(OUT, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} kB`);
}
