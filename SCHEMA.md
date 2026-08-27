# Data schema — `data.js`

This documents every field used by the map's data structures, so a new course
entry (or a new contributor) doesn't need to reverse-engineer the render code
in `london-golf-map-v5_1.html` to know what's expected.

## Top-level constants

| Const | Shape | Purpose |
|---|---|---|
| `ACCESS` | `{tierKey: {label, colour, pole}}` | Flag styling per visitor-access tier. `colour`/`pole` are the flag and pole hex colours drawn on the map pin. 5 tiers: `public`, `open`, `weekday`, `limited`, `application`. |
| `BANDS` | `{bandKey: label}` | Green-fee price bucket labels (`low`/`mid`/`high`/`premium`), plus `na` used inline for "not applicable" (e.g. members-only, no visitor fee). |
| `REGIONS` | ordered array of strings | Drives both the region filter chips and sort order (via `REGIONS.indexOf(c.r)`). First 8 are the original London-catchment regions; next 5 (`South Coast & Sussex`, `East Anglia`, `South West England`, `Midlands`, `North of England`) were added for the England Top 100 courses; next 5 (`Fife & East Lothian`, `Angus & Aberdeenshire`, `Ayrshire & Argyll`, `Highlands & Islands`, `Perthshire & Central Scotland`) for GOLF-25's Scotland courses; last 6 (`South Wales Coast`, `North Wales Coast`, `West Wales`, `Mid Wales`, `North Wales`, `South Wales Borders`) for GOLF-26's Wales courses. Note: default sort is `"name"`, not `"region"` (see GOLF-22) — appending new regions to the end of this list does not bury them in the default view. |
| `ARCHS` | array of `[matchKey, displayLabel]` | 10 canonical architect filter tags. A course matches a tag if its free-text `arch` field contains `matchKey` as a case-insensitive substring — not an exact list, so unusual one-off architects (e.g. "Laidlaw Purves") get no tag and only show in the free-text note. |
| `LINES` | `{lineKey: {c: colour, n: displayName}}` | Rail line styling — colour and display name per Tube/Overground/Elizabeth-line/National-Rail route key. |
| `R` | `{stationName: [lineKey, ...pointsAlongLine]}` | The London rail network drawn on the map. Coordinates are real station positions (TfL StopPoint API + National Rail open data, see `scripts/fetch_rail_stations.py`). |
| `ROUTE_LINE`, `LABEL_AT` | lookup objects | Rendering hints for which route a given line-segment key belongs to, and which point along a route gets the line label. |
| `ISOLATED` | array of `[name, lat, lng, lineKey]` | Stations not on a drawn route polyline but still needed for a course's nearest-station reference (Kingston, Woking, Hemel Hempstead). |
| `MANUAL_IX` | array of station names | Stations needing a manually-nudged label position to avoid overlap on the map — purely a rendering aid. |
| `C` | array of course objects | The 123 London-catchment courses. See below. |
| `C_TOP100` | array of course objects | The remaining 94 England Top 100 national courses not already in `C` (6 — The Grove, Royal Wimbledon, both Walton Heath courses, The Addington, Knole Park — are genuinely London-catchment and live in `C` instead, with `top100:1`/`t100.eng` merged in, rather than being listed twice). Appended onto `C` via `C.push(...C_TOP100)` at the end of the file — from the app's perspective there is one course array. |
| `C_SCOTLAND` | array of course objects | GOLF-25: 41 curated notable Scottish courses (`data/courses-scotland.js`). Appended onto `C` via `C.push(...C_SCOTLAND)`, same convention as `C_TOP100`. |
| `C_WALES` | array of course objects | GOLF-26: 22 curated notable Welsh courses (`data/courses-wales.js`). Appended onto `C` via `C.push(...C_WALES)`, same convention as `C_TOP100`. |
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
| `conf` | string | Data confidence: `"club"` (from the club's own site), `"press"` (published guide/trade press), or `"est"` (indicative/unverified). Drives an on-card confidence badge. GOLF-25/26: all `C_SCOTLAND`/`C_WALES` fee/access/architect/note fields are marked `"est"` — only coordinates/phone/website came from a live-verified source (the DotGolf API) this round. |
| `arch` | string | Free-text architect credit. Matched against `ARCHS` for filter tagging; not itself constrained to a fixed vocabulary. |
| `spec` | string | Free-text course spec, e.g. `"18 · par 70 · 6,216 yds"`. Format is not fully consistent across entries — some omit yardage or par (see GOLF-12, which will formalise par/slope/course-rating as structured fields rather than parsing this string). |
| `note` | string | Free-text description shown in the popup/card. |
| `site` | string | Club website URL, or `""` if unknown. |

### London-catchment-only fields (present on `C` entries, absent on `C_TOP100`/`C_SCOTLAND`/`C_WALES`)

| Field | Type | Meaning |
|---|---|---|
| `stn` | string | Name of the nearest station on the drawn rail network (must match a key in `R` or `ISOLATED`). Used to draw the dashed link line on selection. |
| `walk` | string | Free-text walking directions/time from that station. |
| `book` | string | Online booking URL, or `""`/absent if unknown. |

Top 100, Scotland, and Wales entries deliberately have **no** `stn`/`walk`/`book`
— they're well outside (or entirely outside the country from) the London
rail catchment this map was built around. Instead they carry `nearStation`
(see below), a nationwide nearest-station lookup by straight-line distance
rather than a walkable London-network station.

### Optional fields (present on some entries in either array)

| Field | Type | Meaning |
|---|---|---|
| `t100` | object | National-ranking object. Keys vary by which ranking list a course appears on: `gl` (Greater London list — historically a string label, not a number), `gbi` (Great Britain & Ireland ranking, number or label), `eng` (England Top 100 ranking, always a number 1–100 for `C_TOP100` entries), `sco` (GOLF-25: Scotland ranking, number, present on most but not all `C_SCOTLAND` entries — a handful of curated-but-unranked courses omit it), `wal` (GOLF-26: Wales ranking, number, same partial-coverage convention as `sco`). A course can have more than one key if it appears on multiple lists. |
| `top100:1` | boolean flag | Marks an entry as one of the 100 England Top 100 courses. Present (and always `1`) on every `C_TOP100` entry, plus the 6 merged London-catchment courses noted above that live in `C` instead. |
| `topScot:1` | boolean flag | GOLF-25: marks an entry as one of the 41 curated Scotland courses. Only ever present (and always `1`) on `C_SCOTLAND` entries. |
| `topWales:1` | boolean flag | GOLF-26: marks an entry as one of the 22 curated Wales courses. Only ever present (and always `1`) on `C_WALES` entries. |
| `sweep:1` | boolean flag | Marks a lower-confidence entry found via a broad geographic search rather than direct verification. London-catchment (`C`) only. |
| `winter:1` | boolean flag | Marks a course specifically noted as playing well/draining well in winter. |
| `nearStation` | `{n, lat, lng, mi}` | GOLF-10: nearest station **nationally** by straight-line (haversine) distance, computed via `scripts/compute_nearest_stations.py` + `scripts/merge_nearest_stations.py`. Deliberately a separate field from `stn`/`walk` — those imply a walkable London-network station; this is "as the crow flies" and may be many miles, including across water on the coast. Currently only populated on `C_TOP100` entries lacking `stn`. |
| `courseStats` | `{par, slope, rating}` or `{tees:[{name,par,slope,rating}]}` | GOLF-12/13: par, USGA/WHS Slope Rating and Course Rating, pre-filling the Course Handicap calculator (`Handicap Index × (Slope ÷ 113) + (Rating − Par)`, `courseHandicap()`) via `scripts/fetch_course_stats.py` + `scripts/merge_course_stats.py` against `golfapi.uk`'s free RapidAPI tier (200 requests/month; White tee preferred, else Yellow, else whatever's available). Populated on 66 of 221 entries so far — the free tier's monthly cap means the initial fetch was scoped to London 18-hole courses + England's Top 30 and split across monthly batches; re-run `fetch_course_stats.py` once quota resets to pick up the rest (it's resumable — skips anything already in `scripts/output/course_stats.json`). A user can also add/override this per-course via "Correct this" — that flow supports multiple tees (saved as `{tees:[...]}`; a single unnamed tee still saves as the plain `{par,slope,rating}` shape for backward compatibility), stored only in that browser's `EDITS`/`localStorage`, never in the committed data files. `calcHTML()` doesn't require this field: every popup's calculator (collapsed behind a "Calculate your handicap" button) shows manual-entry fields regardless, `courseStats` just pre-fills them when present, with a Tee dropdown when more than one tee is on record. |
| `clubInfo` | `{phone?, membership?, teeBooking?, blurb?}` | GOLF-11: contact/booking details from England Golf's club-finder API (`scripts/fetch_england_golf_clubs.py` + `scripts/merge_club_details.py`), keyed to the club regardless of which of its courses the entry represents. All sub-fields optional and independently absent if England Golf doesn't have them — popups degrade gracefully. Note: England Golf's `FacilityTypes` (amenity icons) field was evaluated and deliberately **not** used — it was empty across every club spot-checked — see `scripts/README.md`. GOLF-25/26: Scotland/Wales entries currently only carry `phone`, hand-embedded by a one-off builder script from the same DotGolf API response rather than run through `merge_club_details.py` — `membership`/`teeBooking`/`blurb` were not pulled this round but could be added later by re-running the standard merge script against the existing `scripts/output/scottish_golf_clubs.json`/`wales_golf_clubs.json`. |
| `logo` | `string` (relative path) | GOLF-21: path to a small local JPEG (`images/clubs/*.jpg`, ~160px wide, ~3-9KB each) decoded/resized from England Golf's `LogoImage` base64 blob via `scripts/fetch_club_images.py`, then merged in by `scripts/merge_club_images.py`. Only on `C_TOP100` entries whose club had a logo in the England Golf data (71 of 100). Rendered as a thumbnail at the top of the popup (`popupHTML()`); absent gracefully (no broken-image icon) when unset. Not fetched at runtime — a static file reference, same zero-API-call property as everything else. |

## Derived/computed (not stored, computed at render time)

- **GOLF-31 Trip Builder pane** (`enterTripBuilder()`/`exitTripBuilder()`/
  `renderTripBuilder()`, `#tb-pane`) — **supersedes GOLF-24's modal**
  (`openTripPlanner()`/`tripPlannerMode()`, retired). Not a drawer: a
  persistent left-hand pane that replaces `.filters`/`.list` in the same
  grid column (`body.trip-mode` CSS toggle), so building a trip and seeing
  the map update happen side by side rather than behind a modal. The loop
  is: pick a course (from its popup's "Set as anchor course for a trip," or
  an in-pane "Add" button) → it's added to the `TRIP` cart and becomes the
  new discovery anchor → nearby bookable courses are shown → pick the next
  one → repeat. Two discovery sub-tabs, both computed on demand (nothing
  extra persisted beyond `TRIP` itself):
  - **Nearby** — `tripByAnchor(anchor, radiusMiles)` (unchanged from
    GOLF-24) wrapped by `tbDiscover()` to exclude courses already in the
    cart; `anchor` auto-advances to the most recently added cart course
    (`tbEffectiveAnchor()`), which is what makes "Dornoch → Castle Stuart →
    Nairn" walk forward geographically instead of staying pinned to the
    first pick.
  - **By region** — `tripByRegion(region, borderMiles)`, unchanged from
    GOLF-27: since `REGIONS` is a flat label list with no real geometry,
    "just over the border" is derived from course geography rather than a
    hand-maintained adjacency table — any `bookable(i)` course outside the
    chosen region whose straight-line distance to its single nearest course
    *inside* the region is within `borderMiles` (default 8, tunable) is
    included and flagged `{border:true}`, rendered with a "border" chip and
    a visually distinct (grey, dashed) map marker so it doesn't look like a
    filter bug.
  The cart itself (`tripOrder()`/`tripCostEstimate()`/`tripListHTML()`/
  `tripShowOrdered()`) is unchanged from GOLF-28. Both the confirmed cart
  route and the not-yet-added discovery candidates draw on `tripLayer`
  simultaneously (`tbDrawMap()`), which needed `tripShow()`/
  `tripShowOrdered()` to gain optional `clear`/`fit` params so the two
  draws don't wipe each other out. The pane's map overlay persists while
  open — `closeDrawer()` only clears `tripLayer` when the *unrelated*
  corrections-editor drawer closes and Trip Builder isn't active, so
  opening "Correct this" mid-trip doesn't erase the route.

## Runtime-only state (not in `C`/`C_TOP100`, lives in `localStorage`)

| Const | Shape | Purpose |
|---|---|---|
| `PLAYED`, `WANT` | `Set<courseIndex>` | GOLF-15: two distinct personal lists ("Played" / "Want to play"), mutually exclusive per course — marking a course played clears it from the want list. Toggled from the popup, persisted via the same `localStorage` mechanism as `EDITS` (GOLF-9), cleared together via "Clear saved filters & corrections". |
| `TRIP` | `Set<courseIndex>` | GOLF-28: the trip cart, same pattern as `PLAYED`/`WANT` — toggled from the popup ("Add to trip") or the GOLF-31 Trip Builder pane's discovery-list "Add" buttons, persisted the same way, cleared together with the others. Insertion order (preserved by JS `Set` iteration) is the starting point for `tripOrder()`'s greedy nearest-neighbour walk. Also included in the "Review & export corrections" JSON export (`trip` array) since there's no backend to persist it beyond this browser. |

## Conventions worth preserving

- **No runtime API calls.** Every field above is a static literal, refreshed
  by manually re-running a script in `scripts/` and hand-merging its output —
  see `scripts/README.md`. The shipped page never fetches data at load time.
- **Free text over structured fields where the underlying reality is messy**
  (`wd`/`we`/`spec`/`note`) — deliberate, not an oversight; club fee structures
  and course specs don't fit a clean schema without losing information.
  `t100` and future structured additions (e.g. GOLF-12's par/slope/rating)
  should stay structured fields precisely because they *are* consistent data.
