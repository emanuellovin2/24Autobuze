import type * as maplibregl from 'maplibre-gl';

/**
 * Autobuzele sunt desenate ca imagini generate pe canvas, nu ca text de hartă:
 * cercul verde cu numărul liniei arată identic pe orice dispozitiv și nu depinde
 * de fonturile serverului de hărți.
 */
const SIZE = 64;
const R = 22;

function draw(ref: string, opts: { selected: boolean; dimmed: boolean }): ImageData {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d')!;
  const cx = SIZE / 2;

  if (opts.selected) {
    g.beginPath();
    g.arc(cx, cx, R + 8, 0, Math.PI * 2);
    g.fillStyle = 'rgba(245,158,11,0.35)';
    g.fill();
  }

  // umbră discretă, ca autobuzul să se desprindă de hartă
  g.beginPath();
  g.arc(cx, cx + 1.5, R, 0, Math.PI * 2);
  g.fillStyle = 'rgba(15,23,42,0.28)';
  g.fill();

  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fillStyle = opts.dimmed ? '#94a3b8' : opts.selected ? '#f59e0b' : '#16a34a';
  g.fill();
  g.lineWidth = 3.5;
  g.strokeStyle = '#ffffff';
  g.stroke();

  const label = ref.length > 3 ? ref.slice(0, 3) : ref;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${label.length >= 3 ? 19 : 23}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  g.fillText(label, cx, cx + 1);

  return g.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Pinul autobuzului urmărit: mare, portocaliu, cu vârful exact în poziția
 * autobuzului. Trebuie să sară în ochi peste tot desenul hărții.
 */
const PIN_W = 84;
const PIN_H = 108;

function drawPin(ref: string): ImageData {
  const c = document.createElement('canvas');
  c.width = PIN_W;
  c.height = PIN_H;
  const g = c.getContext('2d')!;
  const cx = PIN_W / 2;
  const cy = 40;
  const r = 32;

  g.shadowColor = 'rgba(15,23,42,0.45)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;

  g.beginPath();
  g.moveTo(cx, PIN_H - 4);
  g.quadraticCurveTo(cx - 12, cy + r - 4, cx - r * 0.78, cy + r * 0.62);
  g.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.22, false);
  g.quadraticCurveTo(cx + 12, cy + r - 4, cx, PIN_H - 4);
  g.closePath();
  g.fillStyle = '#f59e0b';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 4;
  g.strokeStyle = '#ffffff';
  g.stroke();

  g.beginPath();
  g.arc(cx, cy, r - 9, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();

  const label = ref.length > 3 ? ref.slice(0, 3) : ref;
  g.fillStyle = '#0f172a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${label.length >= 3 ? 20 : 25}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  g.fillText(label, cx, cy + 1);

  return g.getImageData(0, 0, PIN_W, PIN_H);
}

export function pinId(ref: string) {
  return `pin-${ref}`;
}

export function iconId(ref: string, selected: boolean, dimmed: boolean) {
  return `bus-${selected ? 's' : dimmed ? 'd' : 'n'}-${ref}`;
}

export function registerBusIcons(map: maplibregl.Map, refs: string[]) {
  for (const ref of refs) {
    for (const [selected, dimmed] of [
      [false, false],
      [true, false],
      [false, true],
    ] as [boolean, boolean][]) {
      const id = iconId(ref, selected, dimmed);
      if (map.hasImage(id)) continue;
      map.addImage(id, draw(ref, { selected, dimmed }), { pixelRatio: 2 });
    }
    if (!map.hasImage(pinId(ref))) map.addImage(pinId(ref), drawPin(ref), { pixelRatio: 2 });
  }
}
