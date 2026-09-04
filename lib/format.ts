export function minutesLabel(seconds: number): string {
  if (seconds <= 30) return 'acum';
  const m = Math.round(seconds / 60);
  if (m <= 1) return '1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function clockLabel(ms: number): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function clockLabelSeconds(ms: number): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

export function dayLabel(ms: number): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(ms));
}

/** minute de la miezul nopții -> „14:23” */
export function hhmm(minutesOfDay: number): string {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

export function delayLabel(seconds: number): { text: string; tone: 'ok' | 'late' | 'early' } {
  const m = Math.round(seconds / 60);
  if (m >= 2) return { text: `+${m} min întârziere`, tone: 'late' };
  if (m <= -2) return { text: `${m} min în avans`, tone: 'early' };
  return { text: 'la timp', tone: 'ok' };
}

export function occupancyLabel(v: number): string {
  if (v < 0.35) return 'locuri libere';
  if (v < 0.7) return 'moderat aglomerat';
  return 'aglomerat';
}

export function walkLabel(metres: number): string {
  const min = Math.max(1, Math.round(metres / 80));
  return `${min} min pe jos`;
}

/** emoji pentru categoria unui reper — ajută ochiul să găsească rapid în listă */
const CAT_ICON: Record<string, string> = {
  'cumpărături': '🛍️',
  'piețe': '🧺',
  transport: '🚉',
  'sănătate': '🏥',
  'sport & agrement': '🌳',
  'educație': '🎓',
  'instituții': '🏛️',
  'cultură': '🎭',
  repere: '📌',
  cartiere: '🏘️',
};

export function catIcon(subtitle: string): string {
  return CAT_ICON[subtitle.split(' · ')[0]] ?? '📍';
}

/** „14, 4, 17B, 3” -> „3, 4, 14, 17B”: liniile se citesc în ordine, ca pe stație */
export function sortLines(lines: string[]): string[] {
  return [...lines].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));
}

/** căutare tolerantă la diacritice */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șşŞȘ]/g, 's')
    .replace(/[țţŢȚ]/g, 't')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
