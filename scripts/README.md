# Data-refresh scripts

These scripts (re)generate the raw data behind the map. **They are run manually,
on-demand — there is no scheduler, cron job, or server.** Each writes to a JSON
file under `scripts/output/` (gitignored); merging that output into `data.js`
is a separate, manual step, so a bad fetch can never silently corrupt the live
map.

The shipped page (`london-golf-map-v5_1.html` + `data/*.js`) makes **zero
runtime API calls** — everything it reads is a static literal baked into the
data files by hand, using these scripts' output as the source of truth.

## Scripts

### `fetch_rail_stations.py`
Fetches station coordinates for the London rail network:
- TfL StopPoint API (tube, overground, Elizabeth line, DLR)
- `davwheat/uk-railway-stations` GitHub CSV (National Rail, GB-wide)

```bash
python3 scripts/fetch_rail_stations.py
```
Writes `scripts/output/rail_stations.json` — `{name: {lat, lng, source}}`.
Used to populate the `R` / `ISOLATED` station tables in `data/stations.js`.

### `fetch_england_golf_clubs.py`
Looks up named clubs against England Golf's public "Find and Play" club-finder
API (undocumented but unauthenticated — powers englandgolf.org's own site).
Returns coordinates, website, phone, and amenity/facility data per club.

```bash
python3 scripts/fetch_england_golf_clubs.py --names-file my_names.json
```
`my_names.json` is `{key: "Club name to search for"}` — not committed, since
the specific batch changes per use (e.g. once for the Top 100 list, later for
amenity enrichment of existing entries per GOLF-11).
Writes `scripts/output/england_golf_clubs.json`.

Known gotchas (hit while sourcing the original Top 100 batch):
- Exact club names sometimes miss the search — try dropping "Golf Club", or
  dropping apostrophes, or a well-known alternate name (e.g. "Hollinwell" for
  Notts GC).
- A handful of clubs (e.g. Swinley Forest) are genuinely absent from the
  directory — fall back to `api.postcodes.io` with the club's postcode.
- The `NoOfHoles` field in club details has been unreliable in spot checks
  (showed "9" for several known 18-hole championship courses) — don't trust
  it without cross-checking.

### `fetch_scottish_golf_clubs.py` / `fetch_wales_golf_clubs.py`
GOLF-25/26: same script as `fetch_england_golf_clubs.py`, pointed at
`scottishgolf.org`/`walesgolf.org` instead. Both sites run the same
"DotGolf" white-label platform as England Golf — confirmed live this round
by hitting `GetClubsByName`/`GetClubDetails` directly against both domains
and getting back the identical response shape, even though each site's own
current front-end JS uses a different flow (`GetClubHierarchies`+`FindClubs`)
internally. Same usage/output shape as the England script:

```bash
python3 scripts/fetch_scottish_golf_clubs.py --names-file scripts/output/scotland_names.json --out scripts/output/scottish_golf_clubs.json
python3 scripts/fetch_wales_golf_clubs.py --names-file scripts/output/wales_names.json --out scripts/output/wales_golf_clubs.json
```

Same gotchas as the England script (short/alternate search terms often
needed) plus two new ones hit this round:
- Castle Stuart is genuinely absent from Scottish Golf's own directory
  (same situation as Swinley Forest in England's data) — fell back to
  `api.postcodes.io` with its postcode.
- Two entries (Newport GC in Wales, Gailes Links in Scotland) came back
  from the live API with `Latitude:0.0,Longitude:0.0` — a data-quality gap
  in the source directories themselves, not a script bug. Same
  postcodes.io fallback applied.

### `fetch_ireland_golf_clubs.py`
GOLF-77: same script again, pointed at `golfireland.ie` — confirmed live
via Browser-tool network inspection (382 clubs found) to run the identical
"DotGolf" platform/API shape as England/Scotland/Wales.

```bash
python3 scripts/fetch_ireland_golf_clubs.py --names-file scripts/output/ireland_names.json --out scripts/output/ireland_golf_clubs.json
```

Gotchas hit this round:
- Several search terms needed shortening (e.g. "Royal Co Down" not "Royal
  County Down Golf Club") to get a hit at all — same as every prior nation.
- `best_candidate()`'s difflib closest-match scoring picked the **wrong**
  club for "Royal Co Down" — "Royal Co Down Ladies GC" (ClubId 30205,
  `Latitude:0.0,Longitude:0.0`) scored closer to the search string than the
  real club (ClubId 30204). Caught by spot-checking all resolved
  coordinates for `0.0,0.0`/implausible values — always do this pass rather
  than trusting the script's picks blindly, same lesson as the Newport/
  Gailes zero-coordinate bug above. Fixed by fetching `GetClubDetails`
  directly for the correct `clubId`.
- Old Head Golf Links is genuinely absent from Golf Ireland's own directory
  (same situation as Swinley Forest/Castle Stuart) — no postcodes.io
  equivalent exists for Ireland, so its coordinates were sourced via
  `WebSearch` (Wikipedia's "Old Head of Kinsale" article, cross-checked
  against oldhead.com) and hand-added to the output JSON.

### `fetch_south_africa_golf_clubs.py`
GOLF-78: not a `GetClubsByName` clone like the four scripts above — HNA's
(`handicaps.co.za`) `FindClubs` endpoint is location/radius-based, not
name-text-based (confirmed live: a `{SearchText:'Fancourt'}` POST returns
unfiltered alphabetical results, no name filtering at all). Uses a two-step
lookup instead: `GetClubHierarchies {}` (one call, returns all ~449 SA
clubs nationally with just name/region/id, no coordinates) fetched once per
run, matched client-side via `difflib` against the requested names, then
`FindClubs {clubId,pageNumber:1,pageSize:10}` per matched club for the full
record (coordinates come back directly — no separate "View Details" page
fetch needed, better than expected).

```bash
python3 scripts/fetch_south_africa_golf_clubs.py --names-file scripts/output/southafrica_names.json --out scripts/output/south_africa_golf_clubs.json
```

Output JSON shape matches every other nation's script, so
`merge_club_details.py`/`merge_club_images.py` need no changes. No
fee/architect/note fields exist in HNA's response at all (`Website`,
`LogoImage`, `TeeBookingUrl`, `MembershipUrl`, `FacilityDescription` were
null for every course fetched this round) — that content is hand-curated,
same as Scotland/Wales/Ireland.

### `extract_courses.py`
Pulls `{n, lat, lng}` out of a `data/courses-*.js` file into plain JSON, for
feeding into `compute_nearest_stations.py`. Regex-based against the existing
single-line-per-course formatting — not a JS parser.

```bash
python3 scripts/extract_courses.py data/courses-top100.js --out scripts/output/top100_courses.json
```

### `compute_nearest_stations.py`
GOLF-10: nearest station to each course **nationally**, by straight-line
(haversine) distance — not real routing. Needs `fetch_rail_stations.py`'s
output (nationwide, not just London) and a courses JSON from
`extract_courses.py`.

```bash
python3 scripts/compute_nearest_stations.py --courses scripts/output/top100_courses.json
```
Writes `scripts/output/nearest_stations.json` — `{courseName: {station, lat, lng, miles}}`.
A naive nearest-neighbour can occasionally pick a closed/tiny halt over an
obvious nearby mainline station, or (on the coast) a station across water
that's closer as the crow flies than any station reachable by land — spot-check
the largest distances before merging.

### `merge_nearest_stations.py`
Merges `compute_nearest_stations.py`'s output into a `data/courses-*.js` file
in place, as a `nearStation:{n,lat,lng,mi}` field per course (see SCHEMA.md).
Idempotent — re-running replaces any existing `nearStation` field rather than
duplicating it.

```bash
python3 scripts/merge_nearest_stations.py data/courses-top100.js --nearest scripts/output/nearest_stations.json
```

### `merge_club_details.py`
GOLF-11: merges `fetch_england_golf_clubs.py`'s output into a
`data/courses-*.js` file as a `clubInfo:{phone,membership,teeBooking,blurb}`
field, keyed by course name with any trailing "(Old)"/"(Hotchkin)"/etc.
qualifier stripped (several Top 100 entries share one physical club).

```bash
python3 scripts/merge_club_details.py data/courses-top100.js --clubs scripts/output/england_golf_clubs.json
```

**Scope note:** the original plan expected England Golf's per-club
`FacilityTypes` field to give amenity icons (bar, buggy hire, etc.) — a spot
check across ~95 clubs found it consistently `null` on `GetClubDetails`, so
that's not actually available there and isn't merged. `LogoImage`/banner
image fields are also skipped on purpose: they're raw base64 blobs averaging
~470KB each — embedding them would add tens of MB to a data file that's
currently ~130KB total. A real image pipeline (fetch once, save as actual
`.jpg` files, reference by relative path) would need its own ticket.

**Also note:** `GetClubsByName` can return several close matches for one
query (e.g. "St Georges" → both "St Georges Hill Golf Club" and "The Royal
St Georges Golf Club") — the script picks the closest name match via
`difflib`, not just the first result, but a real name collision (like that
one) can still need a more specific query. Verify unfamiliar matches via
`matched_name` in the output JSON before trusting them.

### `fetch_club_images.py`
GOLF-21: decodes and resizes club logo images out of the `LogoImage` base64
blobs already sitting in `scripts/output/england_golf_clubs.json` (from
`fetch_england_golf_clubs.py`) — does not hit the network again. Resizes to
~160px wide, JPEG quality ~70, landing around 15-25KB each (raw blobs
average ~470KB), saved under `images/clubs/`.

**Requires Pillow** (`pip install Pillow`) — a one-time local dev dependency
for this script only, never shipped to the browser. Every other script here
uses only the Python standard library; this is the one deliberate exception.

```bash
python3 scripts/fetch_club_images.py
```
Writes `images/clubs/*.jpg` plus `scripts/output/club_images.json` — a
`{clubName: relativePath}` map for `merge_club_images.py` to consume.

### `merge_club_images.py`
Merges `fetch_club_images.py`'s output into a `data/courses-*.js` file as a
`logo:"images/clubs/....jpg"` field, keyed by course name with any trailing
"(Old)"/"(Hotchkin)"/etc. qualifier stripped (same convention as
`merge_club_details.py`). Idempotent.

```bash
python3 scripts/merge_club_images.py data/courses-top100.js --images scripts/output/club_images.json
```

### `fetch_course_stats.py` + `merge_course_stats.py`
GOLF-12/13: fetches par/slope/course rating from `golfapi.uk` (RapidAPI,
free tier — 200 requests/month, 5 req/min) and merges it into a
`data/courses-*.js` file as `courseStats:{par,slope,rating}`, which
pre-fills the Course Handicap calculator.

Needs a `scripts/output/.rapidapi_key` file (gitignored, one line, your
own RapidAPI key — never hardcoded or committed) before running. Two
calls per unique *club* (search + course lookup), not per course entry —
several Top 100 entries share one physical club. Resumable: writes
incrementally, skips anything already resolved on a re-run, and takes
`--max-requests` to cap how much of the monthly quota a single run spends
— useful since 200/month doesn't cover all 221 courses in one pass.

```bash
python3 scripts/fetch_course_stats.py --max-requests 180
python3 scripts/merge_course_stats.py data/courses-top100.js --stats scripts/output/course_stats.json
python3 scripts/merge_course_stats.py data/courses-london.js --stats scripts/output/course_stats.json
```

**Scope note:** first pass was scoped to London 18-hole courses + England's
Top 30 (133 courses, 127 unique clubs) rather than all 221, since that
already needs 254 requests at 2/club — over one month's free-tier cap.
Re-run `fetch_course_stats.py` (same command) once quota resets to
continue; it'll pick up wherever it left off.

### `fetch_rail_geometry.py`
Traces real track geometry for the TfL network lines (Underground,
Elizabeth line, and the two Overground branches we cover: Weaver,
Lioness) from OpenStreetMap's free Overpass API — no key needed. Replaces
the app's spline-through-station-coordinates approximation, which looked
visibly wrong once the basemap started showing real streets underneath
it (see the CartoDB Voyager switch above).

```bash
python3 scripts/fetch_rail_geometry.py
```
Writes `scripts/output/rail_geometry.json` — `{family: [[[lat,lng],...], ...]}`,
one polyline per matched OSM way (not stitched into one continuous line —
an earlier version tried that and Overpass's member ordering wasn't
reliable enough, producing long straight "jump" artifacts between
unrelated ways; per-way segments avoid that failure mode entirely and
Leaflet renders adjoining ways as one visual line anyway).

**Scope note:** National Rail groupings (Thameslink, Southern,
Southeastern, South Western, Great Northern, Chiltern, WCML) are
deliberately NOT traced — those are our own station groupings by rough
geographic corridor, not a single physical route the way "the Northern
line" is, so there's no one OSM relation that corresponds to what we've
grouped. Those keep the spline approximation.

Rate-limited gently against Overpass's public instance (occasional
`HTTP 429` on a family is normal under load — the script just skips that
family; re-run to pick up whatever failed).

### `merge_rail_geometry.py`
Turns `fetch_rail_geometry.py`'s output into `data/rail-geometry.js` (a
plain `RAIL_GEOM` global, same loading convention as every other
`data/*.js` file), rounding coordinates to 5 decimal places to keep the
committed file smaller.

```bash
python3 scripts/merge_rail_geometry.py
```

### `test_data.js`
GOLF-17: automated data-integrity checks (no browser needed) — every course
has its required fields, valid access/region/band values, resolvable `stn`
references, well-formed optional sub-objects, no duplicates. See
`TESTING.md` for this plus the manual/browser-based checks that complement
it.

```bash
node scripts/test_data.js
```

## Verifying a re-run

After running either fetch script, spot-check a few known values against
the current `data/*.js` (e.g. Sunningdale's coordinates, Clapham Junction's
station position) before merging anything in by hand — then run
`node scripts/test_data.js` to catch anything the spot-check missed.

## Last run

| Script | Last run | Notes |
|---|---|---|
| `fetch_rail_stations.py` | 2026-08-25 | Sourced the London-network stations in `data/stations.js`; also a nationwide 2,882-station set used by `compute_nearest_stations.py` |
| `fetch_england_golf_clubs.py` | 2026-08-25 | Sourced the 100 England Top 100 entries in `data/courses-top100.js` |
| `compute_nearest_stations.py` + `merge_nearest_stations.py` | 2026-08-25 | Populated `nearStation` on all 100 Top 100 entries (GOLF-10) |
| `fetch_england_golf_clubs.py` + `merge_club_details.py` | 2026-08-25 | Populated `clubInfo` on 98 of 100 Top 100 entries (GOLF-11); Swinley Forest still absent from the directory, Prince's needs a name-mapping fix |
| `fetch_club_images.py` + `merge_club_images.py` | 2026-08-25 | Populated `logo` on 71 of 100 Top 100 entries (GOLF-21); 393KB total added to `images/clubs/`, the other 29 clubs had no `LogoImage` in the England Golf data |
| `fetch_rail_geometry.py` + `merge_rail_geometry.py` | 2026-08-25 | Wrote `data/rail-geometry.js` — real OSM track geometry for all 8 TfL-network line families, replacing the spline approximation for those |
| `fetch_scottish_golf_clubs.py` | 2026-08-26 | Sourced the 41 Scotland entries in `data/courses-scotland.js` (GOLF-25) |
| `fetch_wales_golf_clubs.py` | 2026-08-26 | Sourced the 22 Wales entries in `data/courses-wales.js` (GOLF-26) |
| `fetch_ireland_golf_clubs.py` | 2026-08-30 | Sourced the 37 Ireland entries in `data/courses-ireland.js` (GOLF-77) |
| `fetch_south_africa_golf_clubs.py` | 2026-08-30 | Sourced the 19 South Africa entries in `data/courses-southafrica.js` (GOLF-78) |
| `compute_nearest_stations.py` + `merge_nearest_stations.py` | 2026-08-26 | Populated `nearStation` on all 41 Scotland + 22 Wales entries |
| `fetch_course_stats.py` + `merge_course_stats.py` | 2026-08-25 | Populated `courseStats` on 66 of 221 entries (GOLF-12/13) — London 18-hole + England Top 30 scope, first of two monthly batches (free-tier quota) |
