/** Normalizarea numelor de stații: site-ul operatorului scrie același loc în 5 feluri. */

const STREET_PREFIX = /^(Str\.?|Strada|Calea|Bvd\.?|Blv\.?|B-dul|Bulevardul|Prelungirea|Aleea|Sos\.?|Șos\.?)\s/i;

export const stripDiacritics = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[șş]/gi, 's').replace(/[țţ]/gi, 't');

/** separă „Nume – Str. X, nr.Y” în {name, address}; adresele pure rămân nume */
export function splitAddress(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (m && m[1] && !STREET_PREFIX.test(m[1]) && (STREET_PREFIX.test(m[2]) || /\bnr\.?\s*\d/i.test(m[2]))) {
    return { name: m[1].trim(), address: m[2].trim() };
  }
  // unele nume au două separatoare: „Pasaj Letea – Orizont – Calea Mărășești”
  const tail = s.match(/^(.*?)\s+[-–—]\s+((?:Str\.?|Strada|Calea|Bvd\.?|Blv\.?|B-dul|Bulevardul)\s.*)$/i);
  if (tail && tail[1]) return { name: tail[1].trim(), address: tail[2].trim() };
  return { name: s, address: null };
}

/** cheie canonică: fără diacritice, fără (1)/(2), fără punctuație, litere mici */
export function stopKey(rawName) {
  let s = splitAddress(rawName).name;
  s = s.replace(/\s*\(\s*\d\s*\)\s*/g, ' ').replace(/(?<=[a-zăâîșț])\s*\(\d\)$/i, '');
  s = stripDiacritics(s).toLowerCase();
  s = s.replace(/\bnr\.?\s*/g, '').replace(/[.,;:]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[s] ?? s;
}

/** variante care nu se reduc automat la aceeași cheie */
const ALIASES = {
  'fnc': 'fnc', 'f n c': 'fnc',
  'bcr': 'bcr', 'b c r': 'bcr',
  'ara': 'ara', 'a r a': 'ara',
  'i l caragiale': 'il caragiale',
  'n v karpen': 'nv karpen', 'colegiul n v karpen': 'nv karpen', 'colegiul nv karpen': 'nv karpen',
  'exim group': 'exim group',
  'petrom': 'petromv',
  'bancii': 'bancii',
  'pasaj letea orizont': 'pasaj letea',
  'mioritei': 'mioritei',
  'podul cu lanturi': 'podul cu lanturi',
  'scoala generala 9': 'scoala generala 9', 'scoala generala nr 9': 'scoala generala 9',
  'scoala generala 6': 'scoala generala 6',
  'holding agricola': 'holding agricola',
  'complex serbanesti': 'complex serbanesti',
  'baia publica': 'baia publica',
  'pod bistrita': 'pod bistrita',
  'cartier cfr': 'cartier cfr',
  'str arcadie septilici 5': 'arcadie septilici 5',
  'str arcadie septilici 28': 'arcadie septilici 28',
  'str vasile parvan 18': 'vasile parvan 18',
  'str stefan cel mare 25': 'stefan cel mare 25',
  'gara': 'gara',
  'jumbo': 'jumbo',
  'popas gheraesti': 'popas gheraiesti',
  'statiunea pomicola': 'statiunea pomicola',
};

/** numele frumos afișat: preferă varianta cu diacritice și fără (1)/(2)/adresă */
export function prettyName(variants) {
  const cands = variants.map((v) => {
    let n = splitAddress(v).name;
    n = splitAddress(n).name;                                  // „Pasaj Letea – Orizont – Calea Mărășești”
    return n.replace(/\s*\(\s*\d\s*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  });
  const score = (s) => {
    let n = 0;
    if (/[ăâîșțĂÂÎȘȚ]/.test(s)) n += 10;          // are diacritice
    if (!/\d/.test(s)) n += 2;                     // fără numere reziduale
    if (!/\./.test(s)) n += 1;                     // „FNC” în loc de „F.N.C.”
    n += Math.min(s.length, 24) / 100;             // varianta mai descriptivă
    return n;
  };
  return cands.sort((a, b) => score(b) - score(a))[0];
}
