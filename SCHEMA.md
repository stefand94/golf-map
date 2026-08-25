# Data schema — `data.js`

This documents every field used by the map's data structures, so a new course
entry (or a new contributor) doesn't need to reverse-engineer the render code
in `london-golf-map-v5_1.html` to know what's expected.

## Top-level constants

| Const | Shape | Purpose |
|---|---|---|
| `ACCESS` | `{tierKey: {label, colour, pole}}` | Flag styling per visitor-access tier. `colour`/`pole` are the flag and pole hex colours drawn on the map pin. 5 tiers: `public`, `open`, `weekday`, `limited`, `application`. |
| `BANDS` | `{bandKey: label}` | Green-fee price bucket labels (`low`/`mid`/`high`/`premium`), plus `na` used inline for "not applicable" (e.g. members-only, no visitor fee). |
| `REGIONS` | ordered array of strings | Drives both the region filter chips and sort order (via `REGIONS.indexOf(c.r)`). First 8 are the original London-catchment regions; last 5 (`South Coast & Sussex`, `East Anglia`, `South West England`, `Midlands`, `North of England`) were added for the England Top 100 courses. |
| `ARCHS` | array of `[matchKey, displayLabel]` | 10 canonical architect filter tags. A course matches a tag if its free-text `arch` field contains `matchKey` as a case-insensitive substring — not an exact list, so unusual one-off architects (e.g. "Laidlaw Purves") get no tag and only show in the free-text note. |
| `LINES` | `{lineKey: {c: colour, n: displayName}}` | Rail line styling — colour and display name per Tube/Overground/Elizabeth-line/National-Rail route key. |
| `R` | `{stationName: [lineKey, ...pointsAlongLine]}` | The London rail network drawn on the map. Coordinates are real station positions (TfL StopPoint API + National Rail open data, see `scripts/fetch_rail_stations.py`). |
| `ROUTE_LINE`, `LABEL_AT` | lookup objects | Rendering hints for which route a given line-segment key belongs to, and which point along a route gets the line label. |
| `ISOLATED` | array of `[name, lat, lng, lineKey]` | Stations not on a drawn route polyline but still needed for a course's nearest-station reference (Kingston, Woking, Hemel Hempstead). |
| `MANUAL_IX` | array of station names | Stations needing a manually-nudged label position to avoid overlap on the map — purely a rendering aid. |
| `C` | array of course objects | The 121 original London-catchment courses. See below. |
| `C_TOP100` | array of course objects | The 100 England Top 100 national courses. Appended onto `C` via `C.push(...C_TOP100)` at the end of the file — from the app's perspective there is one course array. |
| `RAIL_GEOM` (`data/rail-geometry.js`) | `{family: [[[lat,lng],...], ...]}` | Real track geometry for the 8 TfL-network line families (`met`/`jub`/`nor`/`pic`/`cen`/`dis`/`eli`/`ovg`), traced from OpenStreetMap via `scripts/fetch_rail_geometry.py`. Each family maps to a list of polylines (one per matched OSM way, not stitched into one line). When a family has an entry here, the app draws these instead of the `spline()` approximation through `R`'s station points; National Rail groupings (`tl`/`gn`/`chil`/`sn`/`se`/`swr`/`wcml`) have no entry and always fall back to the spline, since they're our own station groupings by corridor, not one physical route. |

## Course object fields

Every field below appears on **all** courses unless marked otherwise.

| Field | Type | Meaning |
|---|---|---|
| `n` | string | Course name, as shown on the pin/card. |
| `lat`, `lng` | number | Coordinates. |
| `r` | string | Region — must be one of the `REGIONS` values. |
| `a` | string | Access tier key — must be one of the `ACCESS` keys. |
| `band` | string | Price band key — one of `BANDS`, or `"na"`. |
| `wd`, `we` | string | Weekday / weekend green fee, as free text (not always a single number — ranges, "Members only", "Ask club" etc. are common and intentional). |
| `conf` | string | Data confidence: `"club"` (from the club's own site), `"press"` (published guide/trade press), or `"est"` (indicative/unverified). Drives an on-card confidence badge. |
| `arch` | string | Free-text architect credit. Matched against `ARCHS` for filter tagging; not itself constrained to a fixed vocabulary. |
| `spec` | string | Free-text course spec, e.g. `"18 · par 70 · 6,216 yds"`. Format is not fully consistent across entries — some omit yardage or par (see GOLF-12, which will formalise par/slope/course-rating as structured fields rather than parsing this string). |
| `note` | string | Free-text description shown in the popup/card. |
| `site` | string | Club website URL, or `""` if unknown. |

### London-catchment-only fields (present on `C` entries, absent on `C_TOP100`)

| Field | Type | Meaning |
|---|---|---|
| `stn` | string | Name of the nearest station on the drawn rail network (must match a key in `R` or `ISOLATED`). Used to draw the dashed link line on selection. |
| `walk` | string | Free-text walking directions/time from that station. |
| `book` | string | Online booking URL, or `""`/absent if unknown. |

Top 100 entries deliberately have **no** `stn`/`walk`/`book` — most are well
outside the London rail catchment this map was built around. Instead they
carry `nearStation` (see below), a nationwide nearest-station lookup by
straight-line distance rather than a walkable London-network station.

### Optional fields (present on some entries in either array)

| Field | Type | Meaning |
|---|---|---|
| `t100` | object | National-ranking object. Keys vary by which ranking list a course appears on: `gl` (Greater London list — historically a string label, not a number), `gbi` (Great Britain & Ireland ranking, number or label), `eng` (England Top 100 ranking, always a number 1–100 for `C_TOP100` entries). A course can have more than one key if it appears on multiple lists. |
| `top100:1` | boolean flag | Marks an entry as one of the 100 England Top 100 courses. Only ever present (and always `1`) on `C_TOP100` entries. |
| `sweep:1` | boolean flag | Marks a lower-confidence entry found via a broad geographic search rather than direct verification. London-catchment (`C`) only. |
| `winter:1` | boolean flag | Marks a course specifically noted as playing well/draining well in winter. |
| `nearStation` | `{n, lat, lng, mi}` | GOLF-10: nearest station **nationally** by straight-line (haversine) distance, computed via `scripts/compute_nearest_stations.py` + `scripts/merge_nearest_stations.py`. Deliberately a separate field from `stn`/`walk` — those imply a walkable London-network station; this is "as the crow flies" and may be many miles, including across water on the coast. Currently only populated on `C_TOP100` entries lacking `stn`. |
| `courseStats` | `{par, slope, rating}` | GOLF-12/13: par, USGA/WHS Slope Rating and Course Rating, needed for the Course Handicap calculator (`Handicap Index × (Slope ÷ 113) + (Rating − Par)`, `courseHandicap()`). **Not yet populated on any entry** — pending a data source (see `scripts/GOLF-12-course-stats-spike.md`; `golfapi.uk` free tier, once an API key is available). The calculator UI (`calcHTML()`) checks for all three sub-fields and renders nothing if absent, so this is safe to leave unset. |
| `clubInfo` | `{phone?, membership?, teeBooking?, blurb?}` | GOLF-11: contact/booking details from England Golf's club-finder API (`scripts/fetch_england_golf_clubs.py` + `scripts/merge_club_details.py`), keyed to the club regardless of which of its courses the entry represents. All sub-fields optional and independently absent if England Golf doesn't have them — popups degrade gracefully. Note: England Golf's `FacilityTypes` (amenity icons) field was evaluated and deliberately **not** used — it was empty across every club spot-checked — see `scripts/README.md`. |
| `logo` | `string` (relative path) | GOLF-21: path to a small local JPEG (`images/clubs/*.jpg`, ~160px wide, ~3-9KB each) decoded/resized from England Golf's `LogoImage` base64 blob via `scripts/fetch_club_images.py`, then merged in by `scripts/merge_club_images.py`. Only on `C_TOP100` entries whose club had a logo in the England Golf data (71 of 100). Rendered as a thumbnail at the top of the popup (`popupHTML()`); absent gracefully (no broken-image icon) when unset. Not fetched at runtime — a static file reference, same zero-API-call property as everything else. |

## Derived/computed (not stored, computed at render time)

- **GOLF-24 Trip Planning mode** (`tripByRegion()`/`tripByAnchor()`,
  standalone drawer opened via `openTripPlanner()`) — **supersedes GOLF-14**,
  which only worked for London courses sharing a rail line and did nothing
  for any Top 100 entry. Two browse-only modes: by `REGIONS` value, or by an
  anchor course + straight-line radius (`haversineMiles()`, miles). Both
  filter to `bookable(i)` (`public`/`open` access tier). Nothing persisted —
  purely computed on demand; results are drawn on a dedicated `tripLayer`
  cleared whenever the drawer closes.

## Runtime-only state (not in `C`/`C_TOP100`, lives in `localStorage`)

| Const | Shape | Purpose |
|---|---|---|
| `PLAYED`, `WANT` | `Set<courseIndex>` | GOLF-15: two distinct personal lists ("Played" / "Want to play"), mutually exclusive per course — marking a course played clears it from the want list. Toggled from the popup, persisted via the same `localStorage` mechanism as `EDITS` (GOLF-9), cleared together via "Clear saved filters & corrections". |

## Conventions worth preserving

- **No runtime API calls.** Every field above is a static literal, refreshed
  by manually re-running a script in `scripts/` and hand-merging its output —
  see `scripts/README.md`. The shipped page never fetches data at load time.
- **Free text over structured fields where the underlying reality is messy**
  (`wd`/`we`/`spec`/`note`) — deliberate, not an oversight; club fee structures
  and course specs don't fit a clean schema without losing information.
  `t100` and future structured additions (e.g. GOLF-12's par/slope/rating)
  should stay structured fields precisely because they *are* consistent data.
