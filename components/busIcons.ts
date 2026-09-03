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
  }
}
