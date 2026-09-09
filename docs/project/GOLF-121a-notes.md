# GOLF-121a — South Africa full DotGolf pass (result notes)

**Branch:** `golf-121a-sa-full` · **Date:** 2026-09-09 · **Status:** done, pending owner review of the escalation lists below.

## Outcome

| | before | after |
| --- | --- | --- |
| `C_SOUTHAFRICA` entries | 99 | **420** (+321) |
| `C.length` (all nations) | 557 | 878 |

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

- `node scripts/test_data.js` → OK, 878 courses
- `node scripts/check_js.js` → OK
- In-browser (`golf-map-preview`): South Africa nation pill + all 9 regions
  (incl. the 3 new) filter correctly, course lists populate, pins/clusters
  render, bulk-entry popup clean (no `undefined`/`NaN`), no new console
  errors. Test `localStorage` cleared.
