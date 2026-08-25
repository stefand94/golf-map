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
