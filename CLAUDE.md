# Golf Map — project guide for Claude

Solo static-web golf trip-planner. Current status, backlog, decisions and
risks live in `docs/project/` (maintained via the `golf-ba-pm` skill) —
start there. Full phase-by-phase history is archived at
`.claude/plans/history/2026-H1-archive.md` (huge, append-only — useful for
archaeology, not for onboarding; grep it by ticket number).

## What this app is

- Fully static site, zero build step, zero framework. Plain `<script src>`
  tags (non-module — inline `onclick=`/`onchange=` handlers depend on
  global scope), loaded in a fixed order from `london-golf-map-v5_1.html`.
- Zero runtime API calls for course data — everything in `data/*.js` is
  pre-fetched once by a `scripts/*.py` script and hand-merged in. The only
  live network call is to one small Cloudflare Worker
  (`scripts/cloudflare-worker/ors-proxy.js`, deployed at
  `geofftheworker.stefand94.workers.dev`) that proxies OpenRouteService
  (driving directions/geocoding) and OpenStreetMap Overpass (heritage POIs,
  hotels) so no API key ever reaches the browser.
- All per-visitor state (trips, corrections, filters) lives in that
  browser's own `localStorage`. No accounts, no database, no server beyond
  the one stateless Worker.
- Hosted on **GitHub Pages** (canonical/live) and **Cloudflare Pages**
  (per-branch preview URLs) — see `docs/deploying.md`.

## App structure (3 modes, one pane)

Explore mode was retired. The app is `appMode`: `'plan'` (default —
search/discover/wishlist) or `'build'` (`#trip` — days/items/costs), plus a
read-only `'shared'` view (`#share=...`). `js/app-mode.js` is the single
entry/exit point (`setAppMode()`), hash-routed, `popstate`-synced.

`js/trip-ui.js`'s `renderTripBuilder()` renders the whole pane: navbar →
unified search → toolbar (trip menu, group size, filters, clear/share) →
nation pills (GB/Ireland/South Africa) → 3 tabs (Discover / Itinerary /
Costs).

## Data model (trip)

- `TRIP` (Set of course indices) + `tripSeq` (order) = the cart/wishlist.
- `tripDays[]`: `{id, kind:'golf'|'start'|'free'|'end', place, placeLat,
  placeLng, date, driveIn, items:[]}`. Each day's `items[]` is the single
  ordered source of truth (`{id,type:'golf'|'hotel'|'poi',...}`) — golf
  carries a course index, hotel/poi carry `{name,price,priceType,guests,
  lat,lng,nights,stayId}`. Drive legs are always *computed* between
  consecutive located stops, never a manually-added item type.
- Multi-trip: `trips{tripId:{...snapshot}}` + `activeTripId`, snapshotted
  on every `saveState()`.
- Course green fees: legacy free-text `wd`/`we` strings, being migrated
  course-by-course to a structured `fee:{weekday,weekend,weekendTwilight?,
  confidence,lastVerified}` object (GOLF-97/98, in progress — see
  `data/courses-top100.js` for the furthest-along file).

## Data files

`data/courses-{london,top100,scotland,wales,ireland,southafrica}.js` +
`data/{config,stations,rail-geometry}.js`. Schema documented in
`SCHEMA.md`. 557 courses total (114 in the England Top 100).

## Conventions (from accumulated user feedback — see memory files)

- **Push aggressively to `main`** — no PR review, no feature-branch hosting
  needed for most changes. Larger/riskier UI rewrites sometimes land on a
  branch first for stakeholder review (check `git branch`/`git log` for
  anything unmerged before assuming `main` is current).
- **Ask before implementing anything ambiguous** — don't silently guess on
  product decisions.
- **When told to work autonomously**, implement the full batch and report
  back concisely rather than pausing to check in.
- **Always clear trip/test `localStorage` state** (`tripStartFresh()` or
  equivalent) before ending a session that touched the live app.
- **Data-entry/research jobs** (course lists, green fees) follow a
  fetch-once → JSON intermediate → manual/scripted merge pattern — never
  write scrapers against a site whose ToS forbids it (see GOLF-97/98's BRS
  Golf finding). Background Haiku agents are used for large batch research
  jobs; each returns JSON, never edits data files directly (avoids
  concurrent-write conflicts) — merge by hand or with a small script after.

## Verification checklist after any change

```bash
node scripts/test_data.js   # data-file integrity + course counts
node scripts/check_js.js    # all js/*.js modules parse + correct load order
```
Plus, for UI changes: in-browser check for console errors and "undefined"
in rendered popups; `TESTING.md` is the short checklist, `docs/testing-full.md`
the exhaustive one for anything not covered by the two scripts above.

## Where to look for more detail

- `docs/project/` — status, backlog, decisions, risks (living SoT).
- `SCHEMA.md` — full data-field reference.
- `TESTING.md` / `docs/testing-full.md` — short / exhaustive test checklist.
- `scripts/README.md` — what each fetch/merge script does.
- `docs/deploying.md` — Cloudflare Pages preview-URL workflow.
- `docs/pwa.md` — PWA manifest/service-worker notes.
- `.claude/plans/history/2026-H1-archive.md` — full phase-by-phase history if
  you need to know *why* something is the way it is. Long; grep for a ticket
  number (e.g. `GOLF-97`) rather than reading linearly.

## Known outstanding issues (check before assuming these are fixed)

- OpenRouteService **Geocoding** endpoint intermittently 403s (account-side
  issue, not code) — place search degrades to a "temporarily unavailable"
  message rather than looking broken. Confirm live before troubleshooting
  place-search bugs.
- GOLF-98 (real green-fee data entry) is an ongoing, incremental job —
  check `docs/project/IN_PROGRESS.md` for exactly how far it's got.
