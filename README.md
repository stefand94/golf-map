# The Britain Golf Explorer

Greater London's visitor-friendly courses, England's Top 100, and curated
notable courses across Scotland and Wales, in one place — a way to explore
Britain's golf and find the easiest way to get there.

**Live site:** https://stefand94.github.io/golf-map/

## What this is

A single-page interactive map covering 322 golf courses:

- **123 London-catchment courses** — pay-and-play/visitor-friendly courses
  swept geographically across Greater London, Herts, Bucks, Surrey, Kent
  and Essex, each linked to its nearest National Rail/Underground station
  and a walk time, with the rail network itself drawn on the map.
- **England's Top 100 (and beyond)** — every nationally-ranked course, plus
  a further tier of notable courses just outside the strict top 100 (110
  entries total), shown with its nearest station nationally (straight-line
  distance, clearly labelled as such) since most sit well outside the
  London rail network. 6 of these (The Grove, Royal Wimbledon, both Walton
  Heath courses, The Addington, Knole Park) are also genuinely
  London-catchment, so they're merged into a single entry there instead of
  listed twice, and Coombe Hill is already a London-catchment entry too.
- **51 curated Scotland courses + 38 curated Wales courses** — notable
  courses (not a full national directory) sourced from Scottish Golf's and
  Wales Golf's public club directories, shown the same way as the England
  Top 100.

Every course card/popup shows green fees, access tier (pay & play,
members' guest, restricted days, etc.), architect, a club logo where
available, and links to the club's own site and tee-booking page.

Beyond browsing, the app includes:

- **Trip Builder** — a dedicated pane (swaps in for the course list) for
  building an actual trip: pick a course, see what's bookable nearby, add
  the next one, and keep going — the cart (with a rough per-course fee
  estimate and running total, and manually reorderable via ▲/▼, with an
  opt-in "auto-order by nearest-neighbour" fallback) and its route update
  live on the map as you go. The trip route stays visible on the map even
  outside the pane — adding a course via any popup's "Add to trip" button
  immediately shows the growing route, no need to open the pane to see it.
  Discovery can also browse by region (including nearby courses just over
  the region border, tagged as such) instead of by proximity to your last
  pick.
- **Course Handicap calculator** — enter your Handicap Index plus a
  course's par/slope/rating (pre-filled where we have it, otherwise typed
  in from your scorecard) to get your Course Handicap for that round.
- **Played / Want to play** lists, and a **Correct this** flow for
  submitting fixes to any course's data.
- Filtering by access, green fee, architect, region, and free-text search
  (with fuzzy fallback for typos).

## How it's built

Plain HTML/CSS/vanilla JavaScript and [Leaflet](https://leafletjs.com/) —
**no build step, no framework, no backend.** All course data is baked into
static `data/*.js` files at "build" time by the scripts in `scripts/` (see
`scripts/README.md`); the shipped page makes **zero runtime API calls**.
The only per-visitor state (corrections, Played/Want-to-play, filters,
map position) lives in that visitor's own browser `localStorage` and
never leaves it.

```
london-golf-map-v5_1.html   the app (markup + CSS + JS, one file)
index.html                  redirect to the file above, for GitHub Pages
data/                       course, station and config data, loaded as plain <script>s
images/clubs/               resized club logo thumbnails
scripts/                    one-off/on-demand data-refresh scripts (see scripts/README.md)
SCHEMA.md                   documents every field on a course entry
TESTING.md                  automated + manual regression checklist
```

## Running it locally

No install, no build:

```bash
python3 -m http.server 8934
```

then open `http://localhost:8934/london-golf-map-v5_1.html`.

## Refreshing the data

Data is fetched on-demand by the scripts in `scripts/`, never on a
schedule — see `scripts/README.md` for what each one does and when it
was last run.

## Testing

```bash
node scripts/test_data.js
```

runs the automated data-integrity checks. `TESTING.md` also documents the
manual/browser checklist to run after any change touching rendering,
filters, or persistence.
