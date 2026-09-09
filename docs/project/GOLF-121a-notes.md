# GOLF-121a — South Africa full DotGolf pass (result notes)

**Branch:** `golf-121a-sa-full` · **Date:** 2026-09-09 · **Status:** done, pending owner review of the escalation lists below.

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
