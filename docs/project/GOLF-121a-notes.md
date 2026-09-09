# GOLF-121a — South Africa full DotGolf pass (result notes)

**Branch:** `golf-121a-sa-full` (merged to `main` `6bc2fd8`) · **Date:** 2026-09-09 · **Status:** COMPLETE. Open follow-up items (real hole counts, ~14 manual coord checks, 6 clubs not in OSM) are tracked in "Still open" at the bottom — none block completion.

## Outcome

| | before | after |
| --- | --- | --- |
| `C_SOUTHAFRICA` entries | 99 | **421** (+322 net) |
| `C.length` (all nations) | 557 | 879 |

*(after-figures include the follow-up Overpass / spec / course-level pass — see
"Follow-up pass" at the bottom. The initial merge landed at 420 / 878.)*

Source: full `--all` pull of Handicap Network Africa's DotGolf club-finder
(`scripts/fetch_south_africa_golf_clubs.py --all`) — 449 clubs from
`GetClubHierarchies`, 447 resolved via `FindClubs`. Raw output
`scripts/output/south_africa_golf_clubs_all.json` (gitignored).

## What was added

Every one of the 321 new entries has: real `lat`/`lng` (validated in-country
and inside a bounding box for its assigned region), `topSouthAfrica:1`,
`conf:"est"`, `clubInfo.phone`/`site` where the API supplied one, and
**placeholder** `band:"mid"` / `wd:"R750"` / `we:"R850"` / `arch:"Unknown"` /
`spec:"18"` / `note:""` (same convention as the 2026-09-02 batch). No
`t100.za` rank, no `fee:{}` object (that's GOLF-120).

`NoOfHoles` was `0` for **every** club in the pull, so all 321 are `spec:"18"`.
Genuine 9-hole clubs in the batch are currently unmarked — needs a follow-up
pass.

### New regions

`data/config.js` `REGIONS` gained **`Free State`, `Limpopo`, `Northern Cape`**
(owner-approved 2026-09-09). HNA files 81 clubs under these; without the new
regions they'd have been unplaceable. Region mapping used (HNA union →
map region):

- Kwazulu-Natal → KwaZulu-Natal
- Boland / Southern Cape / Western Province → Western Cape & Garden Route
- Central Gauteng / Gauteng North / Ekurhuleni → Gauteng
- Mpumalanga → Mpumalanga & Kruger
- Border / Eastern Province → Eastern Cape
- North West / Free State / Limpopo / Northern Cape → same-named region

Existing curated entries were **not** re-regioned (e.g. Zebula stays under
"Mpumalanga & Kruger" though it's physically Limpopo) — acceptance criteria
say curated entries are untouched. Worth a tidy-up later.

## Dropped (not merged)

- **96** exact duplicates of the curated 99 (name-normalised match, or
  coordinates within ~250 m), incl. 3 manual drops: `Middelburg Golf Club`
  (identical coords to `Middelburg Country Club`), `Eden National GC St
  Cathryns` (kept `St Cathryns Golf Club`), `Soutpansberg Golf Club` (coord
  was in the Cederberg, nowhere near Soutpansberg).
- **32** with `0,0` / absent coordinates or off-continent (`Kotarana` had a
  New Zealand coordinate). **Real courses in this bucket that HNA simply has
  no coordinates for — hand-add later:** The Club at Steyn City, Zwartkop
  Country Club, Sardinia Bay, Ethekwini, Olivewood, Kingswood, Sedge Links,
  Heron Banks, Akasia, Felixton, Richmond Natal, Coastal Green, Zwartberg,
  Burgundy Mupine, Hazendal. (Rest were `… GC - Windsor Park` society
  aliases, `DP TEST 2`, `Fairways Virtual GC`, `PGA 1922 Club`,
  `Fairview Par 3 Course` — correctly junk.)

## Escalations — owner / follow-up needed

### Coordinate verification (16 entries merged but flagged)

Six pairs of merged entries sit on near-identical coordinates — at least one
of each pair almost certainly has a bad source coordinate:

| entry | paired with | likely issue |
| --- | --- | --- |
| `Maritzburg Golf Club` | `Margate Country Club` | Maritzburg has Margate's coords (should be ~Pietermaritzburg) |
| `Newcastle Country Club` | `Mount Edgecombe GC` | Newcastle coord is near Melmoth, not Newcastle |
| `Midlands GC` | `Estcourt Golf Club` | identical coords |
| `Riverside GC Kzn` | `Windsor Park GC` | Durban municipal-course society clubs |
| `Sabie Country Club` | `Sabi River Sun Golf Club` | two real courses ~12 km apart, coords collided |
| `Millvale Golf Course` | `Koster Golf Club` | two real rural clubs, coords collided |

Plus these had an admin-suffix name (`X GC - <other club> GC`) stripped and
should be sanity-checked as real distinct courses: `Atlantis GC`,
`Chatsworth GC`, `Durban GC`, `Tanglewood GC`, `Mount Edgecombe GC`.

### Multi-course estates

DotGolf is club-level. Where a club has sibling courses the API doesn't list
them separately — not fabricated here. A course-level pass (club-site /
Top100GolfCourses cross-check) is still needed for the multi-course estates,
same as the 2026-08-30 audit did for Fancourt / Mount Edgecombe / Sun City.

## Verification done

- `node scripts/test_data.js` → OK, 879 courses
- `node scripts/check_js.js` → OK
- In-browser (`golf-map-preview`): South Africa nation pill + all 9 regions
  (incl. the 3 new) filter correctly, course lists populate, pins/clusters
  render, bulk-entry popup clean (no `undefined`/`NaN`), no new console
  errors. Test `localStorage` cleared.

---

## Follow-up pass (2026-09-09, same branch)

Owner asked for four things after reviewing the initial merge.

### 1. Overpass coordinate correction

New script `scripts/fetch_sa_golf_overpass.py` pulls every golf course OSM
knows in South Africa (`leisure=golf_course` / `golf=course`, area 3600087565)
→ `scripts/output/sa_golf_overpass.json` (292 named courses; **0** carry a
`holes` tag).

Bulk entries were matched to OSM by normalised name and, where a match was
found, their `lat`/`lng` snapped to the OSM course centroid:

- **80** coordinate snaps. Most were sub-kilometre precision bumps (HNA gives
  a clubhouse/town point). Auto-apply was capped to moves of **0.4–25 km** to
  avoid the ambiguous-place-name trap (two towns called Richmond / Walmer).
- **2** larger relocations applied via a hand-checked allow-list:
  `Vryheid Golf Club` (had Wild Coast Sun coords) and `Maritzburg Golf Club`
  (had Margate coords).
- Moves **>25 km** from an exact-name match were **not** applied — left for
  manual review. Still needing a manual coordinate check: `Richmond`,
  `Walmer Country Club`, `Kranspoort`, `Fynbos`, plus ~10 municipal /
  society clubs with no distinct OSM course.

### 2. The "15 dropped real courses"

They were never lost from the app — 4 were already present as curated
entries (Steyn City, Olivewood, Kingswood, Richmond). Of the remaining 11
that HNA gave `0,0`:

- **5 recovered** from OSM and re-added (`conf:"est"`, region hand-set):
  Zwartkops Country Club, Akasia Golf Club (Gauteng); Felixton Country Club
  (KwaZulu-Natal); Sedge Links, Hazendal Golf Club (Western Cape & Garden
  Route).
- **6 not in OSM either** — still absent, need a manual source:
  Sardinia Bay, Ethekwini, Heron Banks, Coastal Green, Zwartberg,
  Burgundy Mupine.

### 3. Hole count → `spec:"Unknown"`

`NoOfHoles` was `0` for the entire pull and OSM has no `holes` tag on any SA
course, so the assumed `spec:"18"` was never real data. **396** bulk entries
changed `spec:"18"` → `spec:"Unknown"` (renders as "Course Unknown" in the
popup). Owner will supply a real hole-count list later. The only bulk
entries that keep `spec:"18"` are the two Randpark courses below (both
independently confirmed full 18s).

### 4. Course-level pass (multi-course estates)

Cross-checked every SA club with known sibling courses against club sites /
Top100GolfCourses. Already fully covered: Royal Johannesburg (East/West),
Fancourt (×3), Zimbali (CC/Lakes), Mount Edgecombe (Woods/Lakes), Sun City
(Gary Player/Lost City).

- **Randpark** was the one genuine gap — one entry for a 36-hole club.
  Split into `Randpark (Firethorn)` (Sid Brews, 1971; Joburg Open host) and
  new `Randpark (Bushwillow)` (Bob Grimsdell remodel, 1952 / rebranded
  2013). The Creek 9 nine-holer was not added.
- **Serengeti** checked and left as one entry — its second course
  (Whistling Thorn) is an 18-hole par-3 course, not a championship course.
- **−5 redundant society-club aliases removed**: `Chatsworth GC`,
  `Durban GC`, `Midlands GC`, `Mount Edgecombe GC`, `Tanglewood GC` — all
  "… - Windsor Park" / "… - Papwa Sewgolum" municipal-course societies with
  no distinct course (Durban GC / Mount Edgecombe GC also duplicated curated
  entries). Kept `Windsor Park GC`, `Riverside GC Kzn`, `Atlantis GC`.

### Net effect

99 → **421** SA entries: +321 DotGolf, +5 OSM re-adds, −5 society aliases,
+1 Randpark split. `C.length` 557 → **879**.

### Still open

- Real hole counts for the ~396 `spec:"Unknown"` entries (owner to source).
- Manual coordinate check: Richmond, Walmer Country Club, Kranspoort,
  Fynbos, ~10 society clubs.
- 6 clubs still missing entirely (not in OSM): Sardinia Bay, Ethekwini,
  Heron Banks, Coastal Green, Zwartberg, Burgundy Mupine.
- Curated entries still not re-regioned (Zebula etc.).

---

## GOLF-121d — SA map ringfenced to the top 100 (2026-09-09)

`zaRanked:1` + re-derived `t100.za` applied to 107 courses (union of
satop100courses.com "Top 100 by ranking" + Top100GolfCourses.com SA list).
Non-ranked SA entries stay in the file, hidden from the map by
`courseShownOnMap()` (js/explore.js). Sources fetched via two Haiku agents
into scratchpad; matched + merged via scratchpad/{match,apply}.js.

Ranked in a source list but absent from this dataset (no coords, not added):
**Beachwood** (Durban, KZN), **Boschenmeer** (Paarl, WC).

### Final combined ranking (t100.za)

```
  1  Durban Country Club  (satop 1 / Top100GC 1)
  2  Fancourt (The Links)  (satop - / Top100GC 2)
  3  Leopard Creek Country Club  (satop 5 / Top100GC 6)
  4  St Francis Links  (satop 7 / Top100GC 4)
  5  Arabella Golf Club  (satop 4 / Top100GC 9)
  6  Glendower Golf Club  (satop 6 / Top100GC 8)
  7  Blair Atholl Golf & Equestrian Estate  (satop 2 / Top100GC 17)
  8  Pearl Valley Golf Club  (satop 3 / Top100GC 16)
  9  Royal Johannesburg & Kensington (East)  (satop 12 / Top100GC 7)
 10  Millvale Golf Course  (satop - / Top100GC 10)
 11  Humewood Golf Club  (satop 19 / Top100GC 3)
 12  The River Club  (satop - / Top100GC 12)
 13  Gary Player Country Club (Sun City)  (satop - / Top100GC 13)
 14  Fancourt (Montagu)  (satop - / Top100GC 14)
 15  East London Golf Club  (satop 17 / Top100GC 15)
 16  George Golf Club  (satop - / Top100GC 18)
 17  Erinvale Golf Club  (satop 8 / Top100GC 29)
 18  Sishen  (satop - / Top100GC 19)
 19  The Club at Steyn City  (satop 16 / Top100GC 25)
 20  Pezula  (satop - / Top100GC 21)
 21  Highland Gate  (satop 21 / Top100GC 22)
 22  Fancourt (Outeniqua)  (satop - / Top100GC 23)
 23  Zimbali Country Club  (satop 18 / Top100GC 28)
 24  Simola Golf & Country Estate  (satop - / Top100GC 24)
 25  Pinnacle Point Golf Club  (satop - / Top100GC 26)
 26  Pretoria Country Club  (satop 22 / Top100GC 34)
 27  Royal Johannesburg & Kensington (West)  (satop 25 / Top100GC 32)
 28  CCJ Woodmead  (satop 27 / Top100GC 31)
 29  Elements  (satop - / Top100GC 30)
 30  Kyalami  (satop 36 / Top100GC 27)
 31  Parkview  (satop 30 / Top100GC 36)
 32  Randpark (Firethorn)  (satop 26 / Top100GC 40)
 33  CCJ Rocklands  (satop 34 / Top100GC 33)
 34  Prince's Grant  (satop 31 / Top100GC 38)
 35  Champagne Sports Resort  (satop 20 / Top100GC 50)
 36  Houghton Golf Club  (satop 28 / Top100GC 43)
 37  Victoria Golf Club  (satop 33 / Top100GC 39)
 38  De Zalze  (satop 32 / Top100GC 46)
 39  Hermanus  (satop 24 / Top100GC 55)
 40  Bryanston  (satop 29 / Top100GC 53)
 41  Eye of Africa  (satop 37 / Top100GC 45)
 42  Oubaai Golf Club  (satop - / Top100GC 41)
 43  Pecanwood  (satop - / Top100GC 44)
 44  Wild Coast Sun Country Club  (satop 52 / Top100GC 37)
 45  Clovelly  (satop 55 / Top100GC 35)
 46  Serengeti  (satop 41 / Top100GC 49)
 47  Ebotse Links  (satop 40 / Top100GC 51)
 48  Lost City Golf Course (Sun City)  (satop - / Top100GC 47)
 49  Maccauvlei  (satop - / Top100GC 48)
 50  Cotswold Downs  (satop 45 / Top100GC 52)
 51  Gowrie Farm  (satop 56 / Top100GC 42)
 52  Steenberg  (satop 44 / Top100GC 54)
 53  Royal Cape Golf Club  (satop 46 / Top100GC 56)
 54  Modderfontein  (satop 42 / Top100GC 69)
 55  San Lameer  (satop 50 / Top100GC 61)
 56  Mount Edgecombe (The Woods)  (satop 54 / Top100GC 60)
 57  Plettenberg Bay CC  (satop - / Top100GC 57)
 58  Euphoria Golf Club  (satop - / Top100GC 59)
 59  Killarney Country Club  (satop 47 / Top100GC 71)
 60  Wingate Park  (satop 53 / Top100GC 65)
 61  Dainfern  (satop 61 / Top100GC 58)
 62  Stellenbosch  (satop 57 / Top100GC 63)
 63  Atlantic Beach Links  (satop 58 / Top100GC 66)
 64  THE ELS CLUB-Copperleaf  (satop - / Top100GC 62)
 65  Wanderers  (satop 60 / Top100GC 72)
 66  Randpark (Bushwillow)  (satop - / Top100GC 67)
 67  Krugersdorp  (satop 66 / Top100GC 70)
 68  Silver Lakes Golf & Wildlife Estate  (satop - / Top100GC 68)
 69  Mbombela  (satop 74 / Top100GC 64)
 70  Woodhill  (satop 43 / Top100GC 95)
 71  Irene  (satop 65 / Top100GC 76)
 72  Paarl Golf Club  (satop 69 / Top100GC 75)
 73  Umhlali  (satop 73 / Top100GC 73)
 74  Ruimsig  (satop 67 / Top100GC 80)
 75  Mount Edgecombe (The Lakes)  (satop 62 / Top100GC 89)
 76  Umdoni Park  (satop 79 / Top100GC 74)
 77  Eagle Canyon  (satop 63 / Top100GC 91)
 78  Goldfields West  (satop 64 / Top100GC 90)
 79  Milnerton Golf Club  (satop - / Top100GC 77)
 80  Parys  (satop - / Top100GC 78)
 81  Reading Country Club  (satop 72 / Top100GC 86)
 82  King David Mowbray  (satop 83 / Top100GC 79)
 83  St Francis Bay  (satop 80 / Top100GC 84)
 84  Zebula  (satop - / Top100GC 82)
 85  Mossel Bay Golf Club  (satop - / Top100GC 83)
 86  Centurion  (satop 82 / Top100GC 85)
 87  Glenvista Golf Club  (satop 75 / Top100GC 92)
 88  Olivewood  (satop 86 / Top100GC 81)
 89  Waterkloof Golf Club  (satop 68 / Top100GC 100)
 90  Selborne Park  (satop 87 / Top100GC -)
 91  Benoni CC  (satop 88 / Top100GC -)
 92  Knysna Golf Club  (satop - / Top100GC 88)
 93  Westlake  (satop 91 / Top100GC 87)
 94  Royal Port Alfred  (satop 84 / Top100GC 96)
 95  Katberg  (satop 85 / Top100GC 98)
 96  Kambaku  (satop 90 / Top100GC 94)
 97  Port Elizabeth Golf Club  (satop 92 / Top100GC -)
 98  Jackal Creek  (satop 93 / Top100GC -)
 99  Wedgewood  (satop 94 / Top100GC 93)
100  Huddle Park  (satop 95 / Top100GC -)
101  Goose Valley  (satop - / Top100GC 97)
102  Emfuleni  (satop 98 / Top100GC -)
103  Southbroom  (satop 99 / Top100GC 99)
104  Bosch Hoek  (satop 97 / Top100GC 102)
105  Somerset West CC  (satop 100 / Top100GC -)
106  Kingswood  (satop - / Top100GC 101)
107  State Mines Country Club  (satop - / Top100GC 103)

Not in dataset (ranked, no course entry): Beachwood, Boschenmeer
```
