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

## Verifying a re-run

After running either script, spot-check a few known values against the
current `data/*.js` (e.g. Sunningdale's coordinates, Clapham Junction's
station position) before merging anything in by hand.

## Last run

| Script | Last run | Notes |
|---|---|---|
| `fetch_rail_stations.py` | 2026-08-25 | Sourced the 314 stations currently in `data/stations.js` |
| `fetch_england_golf_clubs.py` | 2026-08-25 | Sourced the 100 England Top 100 entries in `data/courses-top100.js` |
