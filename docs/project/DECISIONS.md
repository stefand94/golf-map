# Product decisions

_Stable IDs `DEC-nnn`. Record: decision · context · alternatives · reason ·
date · affected features. Newest first. Full rationale for older calls lives
in `.claude/plans/history/2026-H1-archive.md` — grep by ticket._

## DEC-010 — Basemap: Esri keyless tiles + street/satellite toggle, no new provider account

- **Decision:** GOLF-105 is rescoped. Instead of adopting a keyed raster
  provider (MapTiler / Stadia), both Leaflet maps move to **Esri's
  keyless ArcGIS Online tile services** and gain a base-layer toggle:
  Light Gray Canvas (default), Imagery Hybrid (satellite + labels), and
  optionally World Topographic. No account, no API token. If a keyless
  Esri basemap can't be made to work, the ticket is deferred/cancelled
  pending a vector-map (GOLF-106) evaluation — not moved to another keyed
  provider.
- **Context:** owner trialled MapTiler and Stadia and judged neither a
  meaningful visual improvement over the current OSM tiles, and did not
  want another signup / key to manage. Owner does want a **satellite
  view**, which no keyless OSM-based source can provide. Owner rates
  Apple's basemaps highest but not worth the $99/yr developer fee.
- **Alternatives:** keyed raster provider (rejected — not impressed, extra
  account); stay on the OSM public server (rejected — R-8, production ban);
  Apple MapKit JS (rejected — cost); do nothing / defer (fallback if Esri
  keyless proves unworkable).
- **Reason:** removes the R-8 production-ban risk, adds a genuinely useful
  aerial course view, and costs zero setup/maintenance. Trade-off: Esri's
  keyless endpoints are covered by a usage policy rather than a contract
  and could change — acceptable at this scale, with GOLF-106 as the
  long-term answer.
- **Date:** 2026-09-10 · **Affects:** GOLF-105, GOLF-106, R-8,
  `js/map.js`, `js/trip-share.js`.

## DEC-009 — Course coverage is "enough"; further national bulk pulls paused

- **Decision:** stop expanding course coverage for now. GOLF-121b (UK &
  Ireland curation strategy) and GOLF-121c+ (per-nation bulk pulls) are
  POSTPONED; GOLF-119 (DotGolf coverage audit) is ON HOLD. South Africa's
  map view is ringfenced to a ~107-course ranked set (GOLF-121d). The
  Australia top-100 pull run 2026-09-09 is for owner review only and does
  **not** go into the app yet.
- **Context:** at 879 courses the map is too dense; the owner's judgement
  is that GB & Ireland ranked coverage (England ~120, Scotland 100,
  Ireland 83, Wales 38) is already sufficient for the product's purpose (a
  trip planner, not a course directory). No reported "missing course"
  gaps.
- **Alternatives:** keep pulling nation by nation (more data, worse map
  density, more maintenance); add show-all toggles per nation now
  (deferred — data stays in the files, gated by `courseShownOnMap()`).
- **Reason:** density/clarity and maintainability beat raw completeness
  pre-go-live. Reversible — the data is retained, only the map gate and
  the roadmap sequencing change.
- **Date:** 2026-09-09 · **Affects:** GOLF-119, GOLF-121b/c/d, future
  expansion; `courseShownOnMap()`.

## DEC-008 — Nearest-railway-station feature hidden (dormant, not removed)

- **Decision:** the rail-line / station / nearest-station-link feature is
  flag-gated off (GOLF-110). Code, data (`data/stations.js`,
  `data/rail-geometry.js`, `nearStation` fields) and functions stay in the
  repo, disabled behind one flag.
- **Context:** it is a leftover from the original London-Tube-only concept.
  For a GB/Ireland/South Africa road-trip planner it is clutter and implies
  a public-transport planning capability that does not exist.
- **Alternatives:** delete it (loses the work if PT planning is ever
  wanted); leave it on (misleading, adds map clutter).
- **Reason:** cheap, reversible, de-clutters the map before go-live. Revisit
  if/when public-transport routing becomes a real feature.
- **Date:** 2026-09-07 · **Affects:** GOLF-110, `js/map.js`, shared view.

## DEC-007 — Affiliate-first monetization steers the hotel-provider choice (direction, not firm)

- **Decision:** early monetization is assumed to be **booking affiliate
  commission**, so hotel-data provider evaluation (GOLF-103) weights
  "gives affiliate deep links" alongside coverage. Leading candidate is an
  affiliate-native aggregator (Travelpayouts/Hotellook) over a
  pure-data API (Google Places) or a pricing API (Amadeus).
- **Context:** owner wants a cheap path to first revenue; a test user
  called hotel info "really cool and convenient". No accounts yet, so
  ad/subscription models are weak; affiliate links need no login.
- **Alternatives:** ads, subscription, paid tier — all need a backend /
  accounts (GOLF-104) first; Google Places gives better data but no
  revenue rail.
- **Status:** directional — revisit once real booking-referral volume (or
  lack of it) is known. Not a firm commitment.
- **Date:** 2026-09-07 · **Affects:** GOLF-103, GOLF-104.

## DEC-006 — Cloudflare Pages is the canonical host; dev instance is password-gated

- **Decision:** consolidate hosting onto **Cloudflare Pages** (retire GitHub
  Pages once a custom domain is confirmed stable). The live site goes on a
  custom domain the product owner buys (leaning Cloudflare Registrar). All
  deployments stay **link-only / `noindex`** for now. Preview deployments
  get a **shared-password gate** via a `functions/_middleware.js` Basic-Auth
  check, keyed off a `DEV_PASSWORD` env var set on the **Preview**
  environment only. The ORS proxy Worker gets a **CORS allowlist** now and
  **rate limiting** once it sits on the custom domain.
- **Context:** product owner wants a real URL to share plus a hidden place
  to build/test, and is very keen that no API keys/secrets leak.
- **Alternatives:** keep GitHub Pages canonical (two hosts, no easy dev
  lock); Cloudflare Access / per-user SSO for the dev gate (heavier than
  needed); leave Worker CORS open (quota-abuse risk once public).
- **Reason:** one platform already in use, free preview URLs, at-cost
  domains, and a minimal no-build password gate. Secrets are already
  server-side only (`ORS_API_KEY` in the Worker) — this work keeps it that
  way and closes the CORS/abuse gap.
- **Date:** 2026-09-07 · **Affects:** GOLF-35, GOLF-102, `docs/deploying.md`,
  `ors-proxy.js`, PWA manifest/`sw.js`.

## DEC-005 — Trip sharing v1 ships as a throwaway demo

- **Decision:** the first shareable-trip feature (GOLF-99) is an explicitly
  disposable v1 to get a demo out; it will be rebuilt properly later.
- **Context:** stakeholder wants something shareable now; a robust design
  needs server-side state the app deliberately doesn't have.
- **Alternatives:** wait for a real backend; URL-encoded state only.
- **Reason:** demo value now outweighs throwaway cost.
- **Date:** 2026-09-02 · **Affects:** GOLF-99, GOLF-100.

## DEC-004 — No backend; all state in localStorage

- **Decision:** the app stays a static site with zero persistence layer;
  the only server is the stateless ORS proxy Worker.
- **Alternatives:** add accounts + a database for cross-device trips.
- **Reason:** keeps hosting free and the project solo-maintainable; every
  feature is scoped to fit this.
- **Affects:** everything.

## DEC-003 — Course data is pre-fetched, never fetched at runtime

- **Decision:** all course data is researched offline and hand-merged into
  `data/*.js`; the browser makes zero API calls for course data.
- **Reason:** no API keys in the browser, no rate limits, works offline,
  fast. **Never write a scraper against a site whose ToS forbids it** (the
  GOLF-97/98 BRS Golf finding).
- **Affects:** all data-entry work.

## DEC-002 — Explore mode retired

- **Decision:** the standalone Explore page was removed; its search/filter
  role folded into Plan mode's unified search and nation pills.
- **Date:** 2026-09-04 · **Affects:** `js/app-mode.js`, navigation.

## DEC-001 — Green fees use a banded structured object

- **Decision:** migrate free-text `wd`/`we` to
  `fee:{weekday,weekend,weekendTwilight?,confidence,lastVerified}`.
- **Reason:** enables real fee ranges, filtering, and confidence tracking.
- **Date:** 2026-09-05 (GOLF-97) · **Affects:** GOLF-98, cost model.
