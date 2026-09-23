# GOLF-183 deliverable 1 — course coordinate audit

**Report only. No `data/*.js` file was changed by this pass.** Owner/BA pick
the fix scope; deliverable 2 is a separate job.

- **Scope:** all **565 map-visible** courses, all three nations
  (`courseShownOnMap()` — so the 314 unranked South Africa clubs are out).
- **Source:** OpenStreetMap via Overpass, fetched **2026-09-23** —
  `leisure=golf_course`, `golf=course` and named `sport=golf` features across
  GB/Ireland and South Africa (4,242 named features). **No ORS geocoding**,
  per DEC-023.
- **Method:** each course's name is normalised (club/course/links/the stripped)
  and matched to the nearest OSM golf feature within 60 km carrying the same
  distinctive tokens. Where the match is a way/relation, the course's *current*
  point is tested against the real outline (point-in-polygon), which is a much
  better signal than distance alone.
- **Suggested coords** are the OSM element's bbox centre. For a fix pass that
  is a good "somewhere on the property" point but **not** the best one — prefer
  a `golf=clubhouse` / `building=clubhouse` node inside the outline where one
  exists. Every row carries the OSM element URL so the fix can be checked by eye.

## Headline

| # | Finding | Courses |
|---|---|---|
| A | Coordinates at ≤4 decimal places | 52 |
| B | Point shared with a **different** club | 4 (2 points) |
| B2 | Point shared by variants of the same club (legitimate) | 50 (23 points) |
| C | More than 1 km from the name-matched OSM feature | 26 |
| D | No name-matching OSM feature found — not assessable | 69 |

Distinct courses flagged by A, B or C: **see the tables below** (there is
overlap — Sun City's two courses hit all three).

## Confirmed placeholders — fix these first

These are the unambiguous ones: coordinates rounded to 1–3 dp, all of them
kilometres from the real course.

| Nat | Course | id | Current | Real (OSM) | Off by |
|---|---|---|---|---|---|
| ZA | Gary Player Country Club (Sun City) | `gary-player-country-club-sun-city-9076` | -25.2025, 27.0527 | -25.33957, 27.10674 | 16.2 km |
| ZA | Lost City Golf Course (Sun City) | `lost-city-golf-course-sun-city-e374` | -25.2025, 27.0527 | -25.33414, 27.08936 | 15.1 km |
| ZA | Wedgewood | `wedgewood-746c` | -33.7139, 25.5207 | -33.90513, 25.38910 | 24.5 km |
| ZA | Olivewood | `olivewood-340f` | -32.83, 28.1 | *(1 dp — no OSM name match; needs a manual lookup)* | — |
| ZA | The Club at Steyn City | `the-club-at-steyn-city-d5fe` | -25.98, 27.97 | *(2 dp — no OSM name match; needs a manual lookup)* | — |
| ZA | CCJ Rocklands | `ccj-rocklands-1fdc` | -26.0499, 28.0767 | *(shares one point with CCJ Woodmead — Country Club Johannesburg's two campuses are at different sites, so at most one of these can be right)* | — |
| ZA | CCJ Woodmead | `ccj-woodmead-64df` | -26.0499, 28.0767 | *(same point as CCJ Rocklands)* | — |
| ZA | Arabella Golf Club | `arabella-golf-club-b5b9` | -34.3298, 19.0386 | -34.31589, 19.13099 | 8.6 km |
| ZA | Pretoria Country Club | `pretoria-country-club-038f` | -25.7608, 28.1999 | -25.74621, 28.14308 | 5.9 km |
| GB | Llandudno (Maesdu) | `llandudno-maesdu-785e` | 53.3127, -3.83 | 53.30771, -3.83187 | 0.57 km |
| IE | Golf at The Hawthorn Golf Club | `golf-at-the-hawthorn-golf-club-2f23` | 53.268, -8.933 | *(3 dp — no OSM name match)* | — |

Sun City is exactly as the owner reported: both courses on one rounded point
about 15 km north of the resort. **Batchwood Golf & Sports Centre** appears in
table C at 49 km, but that is a bad name match (it matched "Oaks Sports
Centre") — its own coordinate looks right; treat it as noise, not a finding.

## How to read the "km" column

Most of table C is between 1 and 1.5 km, and most of those are *not* errors:
a big links has a long outline, so its bbox centre can sit over a kilometre
from a perfectly correct clubhouse coordinate (Carnoustie, Moray, Walton
Heath, Archerfield). The **"outside outline"** note is the one that matters —
it means the current point is not on the course's own land at all. Rows marked
**name match weak** matched on generic words and should be discarded.

## A. Low precision — coordinates at 4 decimal places or fewer (52 courses)

Sorted worst first. 4 dp is ~11 m, so the tail of this list is only weak evidence; 1–2 dp (~1–11 km) is a hand-typed placeholder.

| Nat | Course | id | Current lat,lng | Suggested (OSM) | km | OSM element | Note |
|---|---|---|---|---|---|---|---|
| ZA | Olivewood | `olivewood-340f` | -32.83, 28.1 | — | — | — | no name match in OSM |
| GB | Llandudno (Maesdu) | `llandudno-maesdu-785e` | 53.3127, -3.83 | 53.30771, -3.83187 | 0.57 | [relation/19561246](https://www.openstreetmap.org/relation/19561246) | **outside outline** |
| ZA | The Club at Steyn City | `the-club-at-steyn-city-d5fe` | -25.98, 27.97 | — | — | — | no name match in OSM |
| GB | Prestatyn | `prestatyn-68bc` | 53.3413, -3.394 | 53.34380, -3.38514 | 0.65 | [way/238857619](https://www.openstreetmap.org/way/238857619) | **outside outline** |
| GB | The Monmouthshire | `the-monmouthshire-4611` | 51.8084, -3.023 | 51.80503, -3.02086 | 0.40 | [way/265619466](https://www.openstreetmap.org/way/265619466) | **outside outline** |
| GB | Vale Resort (Wales National) | `vale-resort-wales-national-579c` | 51.491, -3.3803 | — | — | — | no name match in OSM |
| IE | Golf at The Hawthorn Golf Club | `golf-at-the-hawthorn-golf-club-2f23` | 53.268, -8.933 | — | — | — | no name match in OSM |
| GB | Abergele | `abergele-372b` | 53.2811, -3.5963 | 53.28525, -3.60420 | 0.70 | [way/100119304](https://www.openstreetmap.org/way/100119304) | **outside outline** |
| GB | Abersoch | `abersoch-23e9` | 52.8192, -4.5045 | 52.81571, -4.50244 | 0.41 | [way/61042991](https://www.openstreetmap.org/way/61042991) | **outside outline** |
| GB | Aberystwyth | `aberystwyth-3269` | 52.4219, -4.0759 | 52.42377, -4.07220 | 0.33 | [way/1493651971](https://www.openstreetmap.org/way/1493651971) | **outside outline** |
| GB | Anglesey | `anglesey-ab2c` | 53.2343, -4.5135 | 53.24250, -4.51399 | 0.91 | [way/517914286](https://www.openstreetmap.org/way/517914286) | **outside outline** |
| GB | Batchwood Golf & Sports Centre | `batchwood-golf-sports-centre-5077` | 51.7667, -0.3546 | 51.33958, -0.17662 | 49.06 | [relation/16278](https://www.openstreetmap.org/relation/16278) | **name match weak** |
| GB | Beaconsfield | `beaconsfield-9d75` | 51.6096, -0.6087 | 51.61007, -0.61828 | 0.66 | [way/242596862](https://www.openstreetmap.org/way/242596862) | inside outline |
| GB | Bexleyheath Golf Club | `bexleyheath-golf-club-7ae1` | 51.4503, 0.132244 | 51.45030, 0.13224 | 0.00 | [way/5214805](https://www.openstreetmap.org/way/5214805) | inside outline |
| GB | Blairgowrie (Lansdowne) | `blairgowrie-lansdowne-cd80` | 56.5681, -3.33219 | 56.56810, -3.33219 | 0.00 | [way/1486321764](https://www.openstreetmap.org/way/1486321764) | **outside outline** |
| GB | Brookmans Park Golf Club | `brookmans-park-golf-club-6a84` | 51.7261, -0.193547 | 51.72610, -0.19355 | 0.00 | [way/4118123](https://www.openstreetmap.org/way/4118123) | inside outline |
| GB | Cabot Highlands (Old Petty) | `cabot-highlands-old-petty-75d0` | 57.5325, -4.0911 | — | — | — | no name match in OSM |
| GB | Centurion Club | `centurion-club-bba3` | 51.7412, -0.4063 | 51.73554, -0.39999 | 0.76 | [way/741950735](https://www.openstreetmap.org/way/741950735) | inside outline |
| GB | Clyne | `clyne-4da2` | 51.5955, -4.0135 | 51.59672, -4.02324 | 0.69 | [way/24677421](https://www.openstreetmap.org/way/24677421) | **outside outline** |
| GB | Gleneagles (Queen's) | `gleneagles-queen-s-521a` | 56.2834, -3.7521 | 56.27920, -3.75619 | 0.53 | [way/269353306](https://www.openstreetmap.org/way/269353306) | **outside outline** |
| GB | Gullane (No.1) | `gullane-no-1-a66a` | 56.0339, -2.8364 | 56.03047, -2.84560 | 0.69 | [way/1083233390](https://www.openstreetmap.org/way/1083233390) | **outside outline** |
| GB | Gullane (No.2) | `gullane-no-2-1724` | 56.0339, -2.8364 | 56.03047, -2.84560 | 0.69 | [way/1083233390](https://www.openstreetmap.org/way/1083233390) | **outside outline** |
| GB | Gullane (No.3) | `gullane-no-3-9a8d` | 56.0339, -2.8364 | 56.03047, -2.84560 | 0.69 | [way/1083233390](https://www.openstreetmap.org/way/1083233390) | **outside outline** |
| GB | Holyhead | `holyhead-94fd` | 53.2882, -4.6268 | 53.28938, -4.63186 | 0.36 | [relation/10677648](https://www.openstreetmap.org/relation/10677648) | **outside outline** |
| GB | Llandrindod Wells | `llandrindod-wells-aaf5` | 52.2299, -3.3563 | 52.22851, -3.36204 | 0.42 | [way/864668483](https://www.openstreetmap.org/way/864668483) | **outside outline** |
| GB | Machynys Peninsula | `machynys-peninsula-e0af` | 51.6598, -4.1485 | 51.66174, -4.14612 | 0.27 | [way/198022336](https://www.openstreetmap.org/way/198022336) | inside outline |
| GB | Montrose (1562) | `montrose-1562-0a17` | 56.7207, -2.45061 | 56.72070, -2.45061 | 0.00 | [way/264889578](https://www.openstreetmap.org/way/264889578) | inside outline |
| GB | North Middlesex Golf Club | `north-middlesex-golf-club-7286` | 51.6222, -0.169158 | 51.62220, -0.16916 | 0.00 | [way/4080097](https://www.openstreetmap.org/way/4080097) | inside outline |
| GB | North Wales | `north-wales-2688` | 53.3155, -3.8366 | 53.30770, -3.83902 | 0.88 | [way/102442331](https://www.openstreetmap.org/way/102442331) | **outside outline** |
| GB | Porthmadog | `porthmadog-6233` | 52.9131, -4.1568 | 52.91212, -4.16204 | 0.37 | [relation/17338975](https://www.openstreetmap.org/relation/17338975) | **outside outline** |
| GB | Pwllheli | `pwllheli-2c6c` | 52.8784, -4.4333 | 52.87925, -4.43851 | 0.36 | [way/90803562](https://www.openstreetmap.org/way/90803562) | inside outline |
| GB | Redbourn Golf Club | `redbourn-golf-club-2b8b` | 51.8141, -0.391369 | 51.81410, -0.39137 | 0.00 | [way/116515157](https://www.openstreetmap.org/way/116515157) | inside outline |
| GB | Sevenoaks Town Golf Club | `sevenoaks-town-golf-club-2307` | 51.2757, 0.2035 | — | — | — | no name match in OSM |
| GB | Sunningdale (New) | `sunningdale-new-86a7` | 51.3887, -0.6307 | 51.38191, -0.63423 | 0.80 | [relation/15410213](https://www.openstreetmap.org/relation/15410213) | inside outline |
| GB | Sunningdale (Old) | `sunningdale-old-8bde` | 51.3887, -0.6307 | 51.38191, -0.63423 | 0.80 | [relation/15410213](https://www.openstreetmap.org/relation/15410213) | inside outline |
| GB | Upminster Golf Club | `upminster-golf-club-fa89` | 51.5652, 0.2504 | 51.56520, 0.25040 | 0.00 | [relation/18079483](https://www.openstreetmap.org/relation/18079483) | inside outline |
| GB | Vale of Llangollen | `vale-of-llangollen-8814` | 52.9687, -3.1374 | 52.96864, -3.13422 | 0.21 | [way/290606079](https://www.openstreetmap.org/way/290606079) | **outside outline** |
| GB | Wallasey | `wallasey-91a0` | 53.4279, -3.0802 | 53.42791, -3.08020 | 0.00 | [way/105929019](https://www.openstreetmap.org/way/105929019) | inside outline |
| GB | Wheathampstead Golf Village | `wheathampstead-golf-village-9600` | 51.8078, -0.311369 | — | — | — | no name match in OSM |
| GB | Wildernesse | `wildernesse-10fb` | 51.2824, 0.2224 | 51.28052, 0.22631 | 0.34 | [way/5013935](https://www.openstreetmap.org/way/5013935) | inside outline |
| GB | Wildernesse Golf Club | `wildernesse-golf-club-832e` | 51.2823, 0.2223 | 51.28052, 0.22631 | 0.34 | [way/5013935](https://www.openstreetmap.org/way/5013935) | inside outline |
| IE | Belvoir Park Golf Club | `belvoir-park-golf-club-afa8` | 54.5615, -5.91348 | 54.55983, -5.91964 | 0.44 | [way/40069675](https://www.openstreetmap.org/way/40069675) | inside outline |
| IE | Narin & Portnoo | `narin-portnoo-4307` | 54.8442, -8.4257 | — | — | — | no name match in OSM |
| IE | St. Margaret's Golf Club | `st-margaret-s-golf-club-f54a` | 53.4231, -6.3639 | — | — | — | no name match in OSM |
| ZA | Blair Atholl Golf & Equestrian Estate | `blair-atholl-golf-equestrian-estate-6d26` | -25.9084, 27.9088 | — | — | — | no name match in OSM |
| ZA | Gary Player Country Club (Sun City) | `gary-player-country-club-sun-city-9076` | -25.2025, 27.0527 | -25.33957, 27.10674 | 16.18 | [way/1516928087](https://www.openstreetmap.org/way/1516928087) | **outside outline** |
| ZA | Kyalami | `kyalami-5395` | -25.9759, 28.0593 | -25.97590, 28.05928 | 0.00 | [way/28768782](https://www.openstreetmap.org/way/28768782) | inside outline |
| ZA | Lost City Golf Course (Sun City) | `lost-city-golf-course-sun-city-e374` | -25.2025, 27.0527 | -25.33414, 27.08936 | 15.09 | [way/182253893](https://www.openstreetmap.org/way/182253893) | **outside outline** |
| ZA | Mbombela | `mbombela-8672` | -25.4819, 31.0015 | — | — | — | no name match in OSM |
| ZA | Sishen | `sishen-158a` | -27.6854, 23.0562 | -27.68540, 23.05622 | 0.00 | [way/181375917](https://www.openstreetmap.org/way/181375917) | inside outline |
| ZA | Steenberg | `steenberg-d822` | -34.068, 18.4268 | -34.06796, 18.42695 | 0.01 | [way/947275731](https://www.openstreetmap.org/way/947275731) | inside outline |
| ZA | Zimbali Country Club | `zimbali-country-club-5ff1` | -29.5477, 31.1976 | — | — | — | no name match in OSM |

## B. Point shared with a *different* club (2 points, 4 courses)

| Nat | Course | id | Current lat,lng | Suggested (OSM) | km | OSM element | Note |
|---|---|---|---|---|---|---|---|
| ZA | Gary Player Country Club (Sun City) | `gary-player-country-club-sun-city-9076` | -25.2025, 27.0527 | -25.33957, 27.10674 | 16.18 | [way/1516928087](https://www.openstreetmap.org/way/1516928087) | **outside outline** |
| ZA | Lost City Golf Course (Sun City) | `lost-city-golf-course-sun-city-e374` | -25.2025, 27.0527 | -25.33414, 27.08936 | 15.09 | [way/182253893](https://www.openstreetmap.org/way/182253893) | **outside outline** |
| ZA | CCJ Rocklands | `ccj-rocklands-1fdc` | -26.0499, 28.0767 | — | — | — | no name match in OSM |
| ZA | CCJ Woodmead | `ccj-woodmead-64df` | -26.0499, 28.0767 | — | — | — | no name match in OSM |

### B2. Point shared by variants of the same club — informational, usually legitimate (23 points, 50 courses)

- `51.3887, -0.6307` (GB) — Sunningdale (Old) · Sunningdale (New)
- `51.1164, -4.20747` (GB) — Saunton (East) · Saunton (West)
- `51.3852, -0.704007` (GB) — The Berkshire (Red) · The Berkshire (Blue)
- `52.4984, -2.24111` (GB) — Enville (Highgate) · Enville (Lodge)
- `51.991, -0.666149` (GB) — Woburn (Marquess) · Woburn (Duke's) · Woburn (Duchess)
- `51.3995, -0.589597` (GB) — Wentworth (West) · Wentworth (East)
- `56.4988, -2.71359` (GB) — Carnoustie (Championship) · Carnoustie (Burnside)
- `56.2831, -3.75422` (GB) — Gleneagles (King's) · Gleneagles (PGA Centenary)
- `56.0339, -2.8364` (GB) — Gullane (No.1) · Gullane (No.2) · Gullane (No.3)
- `57.7206, -3.29679` (GB) — Moray (Old) · Moray (New)
- `56.0448, -2.80347` (GB) — Archerfield (Fidra) · Archerfield (Dirleton)
- `51.6082, -2.93218` (GB) — Celtic Manor (Twenty Ten) · Celtic Manor (Montgomerie)
- `55.1873, -7.82296` (IE) — Rosapenna (St Patrick's Links) · Rosapenna (Sandy Hills Links) · Rosapenna (Old Tom Morris Links)
- `53.3097, -6.626` (IE) — The K Club (Palmer North) · The K Club (Palmer South)
- `55.291, -7.37277` (IE) — Ballyliffin (Glashedy) · Ballyliffin (Old Links)
- `53.0962, -6.07879` (IE) — Druids Glen · Druids Glen (Druids Heath)
- `51.8988, -8.29109` (IE) — Fota Island (Deerpark) · Fota Island (Belvelly)
- `52.0605, -9.56337` (IE) — Killarney (Killeen) · Killarney (Mahony's Point)
- `53.1872, -6.18591` (IE) — Powerscourt (East) Golf Club · Powerscourt (West) Golf Club
- `-33.9513, 22.4065` (ZA) — Fancourt (The Links) · Fancourt (Montagu) · Fancourt (Outeniqua)
- `-26.1562, 28.1079` (ZA) — Royal Johannesburg & Kensington (East) · Royal Johannesburg & Kensington (West)
- `-29.7169, 31.0449` (ZA) — Mount Edgecombe (The Woods) · Mount Edgecombe (The Lakes)
- `-26.1146, 27.9664` (ZA) — Randpark (Firethorn) · Randpark (Bushwillow)

## C. More than 1 km from the name-matched OSM golf feature (26 courses)

| Nat | Course | id | Current lat,lng | Suggested (OSM) | km | OSM element | Note |
|---|---|---|---|---|---|---|---|
| GB | Batchwood Golf & Sports Centre | `batchwood-golf-sports-centre-5077` | 51.7667, -0.3546 | 51.33958, -0.17662 | 49.06 | [relation/16278](https://www.openstreetmap.org/relation/16278) | **name match weak** |
| ZA | Wedgewood | `wedgewood-746c` | -33.7139, 25.5207 | -33.90513, 25.38910 | 24.49 | [way/340684668](https://www.openstreetmap.org/way/340684668) | **outside outline** |
| ZA | Gary Player Country Club (Sun City) | `gary-player-country-club-sun-city-9076` | -25.2025, 27.0527 | -25.33957, 27.10674 | 16.18 | [way/1516928087](https://www.openstreetmap.org/way/1516928087) | **outside outline** |
| ZA | Lost City Golf Course (Sun City) | `lost-city-golf-course-sun-city-e374` | -25.2025, 27.0527 | -25.33414, 27.08936 | 15.09 | [way/182253893](https://www.openstreetmap.org/way/182253893) | **outside outline** |
| ZA | Arabella Golf Club | `arabella-golf-club-b5b9` | -34.3298, 19.0386 | -34.31589, 19.13099 | 8.62 | [way/49188988](https://www.openstreetmap.org/way/49188988) | **outside outline** |
| ZA | Pretoria Country Club | `pretoria-country-club-038f` | -25.7608, 28.1999 | -25.74621, 28.14308 | 5.91 | [way/302906986](https://www.openstreetmap.org/way/302906986) | **outside outline** |
| GB | The Duke's Course (St Andrews) | `the-duke-s-course-st-andrews-8d81` | 56.3194, -2.8444 | 56.34791, -2.81641 | 3.61 | [node/7878234726](https://www.openstreetmap.org/node/7878234726) | **name match weak** |
| GB | The Glen (North Berwick) | `the-glen-north-berwick-37d0` | 56.0586, -2.68957 | 56.05977, -2.74648 | 3.54 | [way/44698834](https://www.openstreetmap.org/way/44698834) | **outside outline** |
| IE | Concra Wood Golf Club | `concra-wood-golf-club-9b90` | 54.1189, -6.73127 | 54.10841, -6.70003 | 2.35 | [way/721962532](https://www.openstreetmap.org/way/721962532) | **outside outline** |
| GB | Spey Valley | `spey-valley-42b0` | 57.1882, -3.83378 | 57.19632, -3.81070 | 1.66 | [way/798492122](https://www.openstreetmap.org/way/798492122) | **outside outline** |
| GB | Borth & Ynyslas | `borth-ynyslas-3f67` | 52.4973, -4.0512 | 52.50983, -4.05329 | 1.41 | [relation/12860284](https://www.openstreetmap.org/relation/12860284) | inside outline |
| GB | Walton Heath (New Course) | `walton-heath-new-course-41f4` | 51.2801, -0.246873 | 51.26924, -0.23647 | 1.40 | [way/22084377](https://www.openstreetmap.org/way/22084377) | **outside outline** |
| GB | Archerfield (Fidra) | `archerfield-fidra-54d4` | 56.0448, -2.80347 | 56.05567, -2.79225 | 1.40 | [way/161228170](https://www.openstreetmap.org/way/161228170) | **outside outline** |
| GB | Archerfield (Dirleton) | `archerfield-dirleton-bf8b` | 56.0448, -2.80347 | 56.05567, -2.79225 | 1.40 | [way/161228170](https://www.openstreetmap.org/way/161228170) | **outside outline** |
| IE | Doonbeg | `doonbeg-1f21` | 52.7461, -9.50259 | 52.75688, -9.49582 | 1.28 | [way/207562122](https://www.openstreetmap.org/way/207562122) | **outside outline** |
| ZA | Fancourt (The Links) | `fancourt-the-links-6665` | -33.9513, 22.4065 | -33.96072, 22.41238 | 1.18 | [way/47154776](https://www.openstreetmap.org/way/47154776) | inside outline |
| ZA | Fancourt (Montagu) | `fancourt-montagu-efa1` | -33.9513, 22.4065 | -33.96072, 22.41238 | 1.18 | [way/47154776](https://www.openstreetmap.org/way/47154776) | inside outline |
| ZA | Fancourt (Outeniqua) | `fancourt-outeniqua-99a2` | -33.9513, 22.4065 | -33.96072, 22.41238 | 1.18 | [way/47154776](https://www.openstreetmap.org/way/47154776) | inside outline |
| GB | Royal Troon (Old) | `royal-troon-old-8f3b` | 55.5254, -4.63729 | 55.53273, -4.65074 | 1.17 | [way/118107415](https://www.openstreetmap.org/way/118107415) | **outside outline** |
| GB | Hainault Forest Golf Club | `hainault-forest-golf-club-1d8d` | 51.6057, 0.133239 | 51.61506, 0.14048 | 1.16 | [way/25925045](https://www.openstreetmap.org/way/25925045) | **outside outline** |
| GB | Walton Heath (Old Course) | `walton-heath-old-course-e914` | 51.2781, -0.243873 | 51.26924, -0.23647 | 1.11 | [way/22084377](https://www.openstreetmap.org/way/22084377) | inside outline |
| GB | Moray (Old) | `moray-old-cfad` | 57.7206, -3.29679 | 57.71924, -3.31434 | 1.05 | [way/102611542](https://www.openstreetmap.org/way/102611542) | **outside outline** |
| GB | Moray (New) | `moray-new-c338` | 57.7206, -3.29679 | 57.71924, -3.31434 | 1.05 | [way/102611542](https://www.openstreetmap.org/way/102611542) | **outside outline** |
| GB | Carnoustie (Burnside) | `carnoustie-burnside-f2c9` | 56.4988, -2.71359 | 56.49438, -2.72845 | 1.04 | [way/26237513](https://www.openstreetmap.org/way/26237513) | **outside outline** |
| IE | Carton House (Montgomerie) Golf Club | `carton-house-montgomerie-golf-club-2605` | 53.3905, -6.56674 | 53.38271, -6.55864 | 1.02 | [way/657053688](https://www.openstreetmap.org/way/657053688) | **outside outline** |
| GB | Carnoustie (Championship) | `carnoustie-championship-5e36` | 56.4988, -2.71359 | 56.49355, -2.72720 | 1.02 | [way/1459805268](https://www.openstreetmap.org/way/1459805268) | **outside outline** |

## D. Not assessable — no name-matching OSM golf feature within 60 km (69 courses)

Not a finding: OSM simply has no golf feature carrying this name nearby (the outline is often unnamed, with the name on a clubhouse node or a site relation). These need a manual OSM lookup each if the fix scope includes them.

| Nat | Course | id | Current lat,lng |
|---|---|---|---|
| GB | Aberdovey | `aberdovey-6327` | 52.5449, -4.05731 |
| GB | Askernish | `askernish-3266` | 57.1871, -7.39632 |
| GB | Cabot Highlands (Old Petty) | `cabot-highlands-old-petty-75d0` | 57.5325, -4.0911 |
| GB | Elie (Golf House Club) | `elie-golf-house-club-8ca0` | 56.1889, -2.83952 |
| GB | Godstone Golf Club | `godstone-golf-club-5a2e` | 51.2514, -0.044668 |
| GB | Grim's Dyke Golf Club | `grim-s-dyke-golf-club-7129` | 51.6208, -0.363191 |
| GB | Kington | `kington-02f7` | 52.2135, -3.03774 |
| GB | Monifieth Links | `monifieth-links-e3fb` | 56.4822, -2.81209 |
| GB | Nefyn & District | `nefyn-district-163c` | 52.9372, -4.56466 |
| GB | Northants County | `northants-county-4362` | 52.2759, -0.938731 |
| GB | Peterhead | `peterhead-d886` | 57.5181, -1.80339 |
| GB | Playgolf Northwick Park | `playgolf-northwick-park-2c54` | 51.5717, -0.319806 |
| GB | Prince's (Shore/Dunes/Himalayas) | `prince-s-shore-dunes-himalayas-4916` | 51.2935, 1.37115 |
| GB | Royal Dornoch | `royal-dornoch-221d` | 57.879, -4.02365 |
| GB | Royal St David's | `royal-st-david-s-c788` | 52.8589, -4.11371 |
| GB | Sevenoaks Town Golf Club | `sevenoaks-town-golf-club-2307` | 51.2757, 0.2035 |
| GB | South Herts Golf Club | `south-herts-golf-club-cf7f` | 51.6362, -0.190479 |
| GB | Trump International (New) | `trump-international-new-496d` | 57.2663, -2.03114 |
| GB | Trump International (Old) | `trump-international-old-fda9` | 57.2834, -2.01552 |
| GB | Vale Resort (Wales National) | `vale-resort-wales-national-579c` | 51.491, -3.3803 |
| GB | West Lancs | `west-lancs-1a0e` | 53.5042, -3.05594 |
| GB | Wheathampstead Golf Village | `wheathampstead-golf-village-9600` | 51.8078, -0.311369 |
| GB | Woodhall Spa (Hotchkin) | `woodhall-spa-hotchkin-f4ac` | 53.1552, -0.205758 |
| IE | Donegal (Murvagh) | `donegal-murvagh-9282` | 54.6129, -8.15954 |
| IE | Glasson Golf Club | `glasson-golf-club-e143` | 53.4757, -7.90095 |
| IE | Golf at The Hawthorn Golf Club | `golf-at-the-hawthorn-golf-club-2f23` | 53.268, -8.933 |
| IE | Killarney (Killeen) | `killarney-killeen-bfeb` | 52.0605, -9.56337 |
| IE | Killarney (Mahony's Point) | `killarney-mahony-s-point-6fae` | 52.0605, -9.56337 |
| IE | Lahinch (Old) | `lahinch-old-c9ed` | 52.9345, -9.34529 |
| IE | Narin & Portnoo | `narin-portnoo-4307` | 54.8442, -8.4257 |
| IE | New Forest Golf Club | `new-forest-golf-club-48e7` | 53.3999, -7.42762 |
| IE | Seapoint Golf Club | `seapoint-golf-club-66ff` | 53.7525, -6.25599 |
| IE | St. Margaret's Golf Club | `st-margaret-s-golf-club-f54a` | 53.4231, -6.3639 |
| IE | The K Club (Palmer South) | `the-k-club-palmer-south-b26d` | 53.3097, -6.626 |
| ZA | Atlantic Beach Links | `atlantic-beach-links-49b1` | -33.7472, 18.4484 |
| ZA | Blair Atholl Golf & Equestrian Estate | `blair-atholl-golf-equestrian-estate-6d26` | -25.9084, 27.9088 |
| ZA | Bosch Hoek | `bosch-hoek-82de` | -29.3521, 30.0961 |
| ZA | CCJ Rocklands | `ccj-rocklands-1fdc` | -26.0499, 28.0767 |
| ZA | CCJ Woodmead | `ccj-woodmead-64df` | -26.0499, 28.0767 |
| ZA | Centurion | `centurion-e882` | -25.8737, 28.2041 |
| ZA | Cotswold Downs | `cotswold-downs-3f26` | -29.7506, 30.7939 |
| ZA | Ebotse Links | `ebotse-links-bbd2` | -26.1539, 28.3516 |
| ZA | Elements | `elements-f536` | -24.7993, 28.13 |
| ZA | Euphoria Golf Club | `euphoria-golf-club-f9c5` | -24.5641, 28.646 |
| ZA | Eye of Africa | `eye-of-africa-a480` | -26.3604, 28.0246 |
| ZA | Goldfields West | `goldfields-west-8df6` | -26.392, 27.4735 |
| ZA | Goose Valley | `goose-valley-76fc` | -34.0261, 23.3793 |
| ZA | Hermanus | `hermanus-3249` | -34.4101, 19.2552 |
| ZA | Huddle Park | `huddle-park-f79a` | -26.1547, 28.1051 |
| ZA | Kambaku | `kambaku-6eba` | -25.433, 31.9535 |
| ZA | Knysna Golf Club | `knysna-golf-club-c2f7` | -34.0582, 23.0789 |
| ZA | Leopard Creek Country Club | `leopard-creek-country-club-6440` | -25.4596, 31.5392 |
| ZA | Maccauvlei | `maccauvlei-254b` | -26.6821, 27.9425 |
| ZA | Mbombela | `mbombela-8672` | -25.4819, 31.0015 |
| ZA | Olivewood | `olivewood-340f` | -32.83, 28.1 |
| ZA | Paarl Golf Club | `paarl-golf-club-363f` | -33.7609, 18.9798 |
| ZA | Parys | `parys-d206` | -26.8894, 27.466 |
| ZA | Pearl Valley Golf Club | `pearl-valley-golf-club-1e4f` | -33.822, 18.9858 |
| ZA | Pinnacle Point Golf Club | `pinnacle-point-golf-club-28b5` | -34.1962, 22.0869 |
| ZA | Plettenberg Bay CC | `plettenberg-bay-cc-5aaf` | -34.0624, 23.3557 |
| ZA | Prince's Grant | `prince-s-grant-bea7` | -29.3392, 31.375 |
| ZA | Royal Johannesburg & Kensington (East) | `royal-johannesburg-kensington-east-0d7c` | -26.1562, 28.1079 |
| ZA | Selborne Park | `selborne-park-6b4e` | -30.376, 30.6784 |
| ZA | Serengeti | `serengeti-2578` | -26.0356, 28.2814 |
| ZA | State Mines Country Club | `state-mines-country-club-268f` | -26.2088, 28.3738 |
| ZA | The Club at Steyn City | `the-club-at-steyn-city-d5fe` | -25.98, 27.97 |
| ZA | Wingate Park | `wingate-park-fa7e` | -25.8308, 28.2804 |
| ZA | Zebula | `zebula-2ee3` | -24.7642, 27.9501 |
| ZA | Zimbali Country Club | `zimbali-country-club-5ff1` | -29.5477, 31.1976 |

## Reproducing this

No script was committed (GOLF-119's lesson: the recipe is the artefact). Two
Overpass calls, then a local match — the public instance times out under load,
so retry rather than widening the query:

```
# GB + Ireland
[out:json][timeout:280];
(nwr["leisure"="golf_course"](49.5,-11.5,61.2,2.2);
 nwr["golf"="course"](49.5,-11.5,61.2,2.2);
 nwr["sport"="golf"]["name"](49.5,-11.5,61.2,2.2););
out center tags;

# South Africa — same body, bbox (-35.5,15.5,-21.5,33.5)
```

Then `out geom;` for the matched ways/relations to run the point-in-polygon
test. Matching: normalise both names (strip accents/punctuation and the
stopwords golf/club/course/links/country/the/estate/resort/…), require every
token of the shorter name to appear in the longer one plus one token of ≥4
characters — or an exact normalised equality, which is what rescues short
names like "Rye".
