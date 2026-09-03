# Autobuze Bacău — unde vrei să ajungi?

Aplicație instalabilă pe telefon (PWA) care răspunde la o singură întrebare: **spui unde vrei să ajungi, ea îți spune ce autobuz te duce primul acolo și ți-l arată pe hartă până cobori** — inclusiv schimbul, dacă e nevoie de unul.

Este un **proiect conceptual**: autobuzele din Bacău nu au (încă) GPS public, așa că pozițiile sunt calculate de o simulare care rulează în browser, pornind de la orarele reale ale operatorului. Nu există server și nici bază de date — tot ce vezi se calculează pe dispozitivul tău.

**Demo:** *(link Vercel după deploy)*

---

## Cum se folosește

Aplicația are un singur fir, cel pe care îl are și călătorul în cap:

1. **„Unde vrei să ajungi?”** — bara de jos. O atingi și apar locurile căutate des din Bacău (gara, mall, spital, piața, universitatea) și un câmp în care poți scrie strada, stația sau reperul. Tot acolo spui **unde te afli acum**: scrii strada ori stația, lași telefonul să găsească stația cea mai apropiată, sau atingi harta.
2. **Ce autobuze te duc acolo** — apar toate variantele, **ordonate după care te duce primul**, cu linia, direcția, în câte minute vine autobuzul și la ce oră ajungi. Variantele cu schimbare sunt marcate ca atare.
3. **Autobuzul ales** — după ce îl atingi, apare pe hartă cu **un pin portocaliu mare**, cu minutele scrise sub el și cu un halou care pulsează, ca să nu îl pierzi din ochi. Etapa (de unde urci până unde cobori) e desenată gros peste rețea; harta îl readuce singură în cadru dacă iese.
4. **Cardul din colțul ecranului** — cât mai durează până la destinație și toată ruta, inclusiv schimbul: etapele parcurse bifate, cea curentă marcată „acum”, ce urmează în gri.
5. **La schimb** — când autobuzul ajunge în stația unde trebuie să cobori, aplicația întreabă **„Vrei să continui ruta?”**. Dacă apeși *nu*, se ia de la zero. Dacă apeși *da*, apar autobuzele care pleacă din acea stație în direcția destinației, cu timpii lor — exact ca la pasul 2 — și, după ce alegi, din nou pinul pe hartă. La fel la fiecare schimb.

În afara călătoriei, două panouri secundare: **Stația mea** (panoul de sosiri, ca afișajul din stație) și **Toate liniile** (traseele și stațiile fiecărei linii).

## Aplicație instalabilă (PWA)

Se instalează pe ecranul principal, ca o aplicație obișnuită: manifest, iconițe proprii, ecran fără bara browserului. Un service worker (`public/sw.js`) ține în telefon rețeaua, orarele și codul aplicației, iar fundalul de hartă rămâne salvat pentru zonele deja vizitate — deci în autobuz, cu semnal slab, aplicația tot pornește.

Butonul „Instalează” apare singur pe Android/desktop; pe iPhone se folosește *Partajează → Adaugă pe ecranul principal*. Service worker-ul se înregistrează doar în build-ul de producție (`npm run build && npm start`), ca dezvoltarea să nu servească fișiere vechi.

Iconițele se regenerează cu `node scripts/make-icons.mjs` (desenate în cod, fără dependențe; rezultatul e comis în repo).

## Ce mai are

| | |
|---|---|
| **Harta completă** | Toate cele 14 linii urbane, cu traseele desenate pe străzile reale ale Bacăului, și toate cele 82 de stații. |
| **Autobuze live** | Cercuri verzi cu numărul liniei, care se deplasează în timp real pe traseu. Atingi unul și vezi unde e, ce întârziere are și cât mai are până la tine. |
| **Repere, nu doar stații** | Scrii „mall”, „gară”, „spital”, „Luceafărul”, „Auchan”. Pentru un reper, aplicația alege singură stația de coborâre care te duce cel mai repede acolo, cu tot cu minutele de mers pe jos. |
| **Comenzi de timp** | Ceasul simulării poate fi pus pe pauză, accelerat (×5, ×20) sau mutat la o anumită oră — util ca să vezi o călătorie întreagă, cu schimb cu tot, în câteva secunde. |
| **Telefon și desktop** | Pe telefon: hartă pe tot ecranul și panoul călătoriei jos, sub degetul mare. Pe desktop: panou lateral plus hartă mare. |

## Ce este real și ce este simulat

Distincția contează, așa că e scrisă și în aplicație, la butonul **„?”**.

**Real** — preluat de pe [transportpublicbc.ro](https://transportpublicbc.ro/trasee/):
- cele 14 linii urbane (3, 4, 5, 6, 14, 17, 17B, 18, 18B, 18J, 22, 22B, 22J, 22S) și capetele lor;
- lista completă de stații pentru fiecare sens, cu numele și adresele oficiale;
- **orarele**: orele de plecare din capăt și durata fiecărei curse, separat pentru zilele lucrătoare și pentru weekend.

Real, din [OpenStreetMap](https://www.openstreetmap.org/):
- geometria străzilor Bacăului și adresele folosite pentru poziționarea stațiilor;
- traseele urmează drumurile adevărate, calculate cu [OSRM](https://project-osrm.org/).

**Simulat**:
- poziția fiecărui autobuz, dedusă din orar și din lungimea traseului;
- întârzierile (±3 minute) și gradul de aglomerare — generate cu o funcție cu sămânță fixă, deci identice pentru toți utilizatorii, la aceeași oră;
- poziția exactă a unor stații, acolo unde adresa publicată nu e suficient de precisă (vezi câmpul `method` din `data/platforms.json`, care spune pentru fiecare peron cum a fost localizat).

> Nu folosi aplicația pentru a-ți planifica o călătorie reală. Orarul oficial este pe transportpublicbc.ro.

---

## Cum funcționează simularea

Fiecare cursă din orar are o oră de plecare și o durată publicată. Motorul:

1. distribuie durata pe traseu **proporțional cu distanța**, adăugând ~15 secunde de staționare în fiecare stație intermediară;
2. obține astfel, pentru fiecare cursă, ora de sosire în fiecare stație;
3. la orice moment `t`, poziția autobuzului este punctul de pe traseu corespunzător timpului scurs, iar ETA-ul pentru o stație este `plecare + sosire[stație] + întârziere − t`.

Poziția desenată pe hartă și minutele afișate în panoul de sosiri ies **din aceeași formulă**, deci nu se pot contrazice: dacă panoul spune „3 min”, autobuzul de pe hartă chiar e la 3 minute distanță.

Codul este împărțit astfel încât înlocuirea simulării cu date reale să însemne o singură schimbare:

```
lib/sim/engine.ts     poziții, sosiri, ETA        <- aici ar intra fluxul GPS / GTFS-Realtime
lib/sim/planner.ts    rute directe și cu un schimb
lib/sim/ride.ts       starea cursei alese (aștept / sunt în autobuz / am coborât)
lib/sim/clock.ts      ceasul simulării
lib/store.ts          firul călătoriei: căutare → opțiuni → urmărire → schimb
components/MapView.tsx  randare MapLibre
```

---

## Rulare locală

```bash
npm install
npm run dev
```

Se deschide pe http://localhost:3000. Nu are nevoie de nicio cheie API și de nicio variabilă de mediu.

## Regenerarea datelor

Rețeaua este deja generată în `public/network.json` și inclusă în repo, deci build-ul nu apelează servicii externe. Dacă operatorul își schimbă traseele:

```bash
npm run data:all
```

Se execută cei trei pași, fiecare rulabil și separat:

| Pas | Comandă | Ce face |
|---|---|---|
| 1 | `npm run data:scrape` | Extrage traseele și orarele de pe site-ul operatorului (paginile se salvează în `data/.route-cache/`, ca rulările următoare să nu mai ceară nimic de la serverul lor) → `data/routes.raw.json` |
| 2 | `npm run data:geocode` | Dă coordonate celor 217 peroane, folosind adresele și geometria străzilor din OSM → `data/stops.json`, `data/platforms.json` |
| 3 | `npm run data:build` | Calculează traseele pe străzi cu OSRM și scrie `public/network.json` |

Pasul 3 afișează avertismente pentru stațiile care ies de pe traseu sau pentru trasee suspect de lungi — utile ca să prinzi o stație plasată greșit.

## Deploy pe Vercel

Proiect Next.js standard, fără configurare:

1. importă repo-ul pe [vercel.com/new](https://vercel.com/new);
2. lasă setările implicite (Framework: Next.js);
3. Deploy.

Nu sunt variabile de mediu de setat.

---

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **MapLibre GL JS** pentru hartă, cu fundal vectorial [CARTO](https://carto.com/basemaps) (fără cheie API)
- **Zustand** pentru starea interfeței; motorul de simulație rulează în afara React și actualizează harta direct, ca să nu redeseneze componente de 20 de ori pe secundă

## Credite și licențe

- Trasee, stații și orare: **Transport Public S.A. Bacău** — transportpublicbc.ro
- Hartă și adrese: **© OpenStreetMap contributors**, sub [ODbL](https://www.openstreetmap.org/copyright)
- Fundal de hartă: **CARTO**
- Rutare pe străzi: **OSRM**

Proiect demonstrativ, fără afiliere cu Transport Public S.A. Bacău sau cu Primăria Municipiului Bacău.
