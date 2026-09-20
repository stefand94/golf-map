# Product decisions

_Stable IDs `DEC-nnn`. Record: decision · context · alternatives · reason ·
date · affected features. Newest first. Full rationale for older calls lives
in `.claude/plans/history/2026-H1-archive.md` — grep by ticket._

## DEC-017 — GOLF-148 POI presentation: English labels, per-leg scoping, 3-then-10

- **Decision:** three calls, made by the owner 2026-09-20, that unblock the
  GOLF-148 UI work.
  1. **Labels use `name:en` where it exists**, falling back to OSM's `name`.
     One consistent form across all five region files.
  2. **Suggestions are scoped per-leg** — sights inside the corridor between
     today's stops, not ranked across the whole trip.
  3. **Three sights per day, expanding to ten** on "show more".
- **Context:** the shipped dataset (`d58e8a3`) mixes four naming forms in
  Wales alone — fully Welsh (`Parc Cenedlaethol Eryri`), Welsh+English hybrid
  (`Bannau Brycheiniog National Park`), dual (`Castell Biwmares / Beaumaris
  Castle`) and plain English (`Conwy Castle`). Measured: 12% of Welsh rows
  carry a Welsh-language name, but **30% of the top 50** do, so it lands on
  exactly the headline sights a trip planner surfaces. The other two questions
  had been logged as open since the feature was scoped.
- **Alternatives considered:** *Labels* — dual "Eryri / Snowdonia" (matches
  road signage, but doubles label length in a narrow itinerary card and gives
  only one country special treatment); leave as OSM has it (zero work, but two
  adjacent castles labelled in different languages reads as a bug).
  *Scoping* — whole-trip ranking spread across days (better coverage on a day
  with no drive, but the suggestion stops relating to where you are); per-leg
  with a near-the-stop fallback (more complete, more logic).
  *Counts* — 5-then-15 (taller day card); uncapped expand (a corridor through
  England holds hundreds, and the tail is low-scoring filler).
- **Reason:** the inconsistency, not the language, was the actual defect —
  a mixed list looks broken regardless of which language wins. Per-leg matches
  the per-day "Things to see" UI already built in `js/poi.js` and answers the
  real question ("what do I stop at on the way?"). Three fits a day card
  without dominating the itinerary; ten is browsable without becoming a list
  to wade through.
- **Known cost, accepted:** the English label is **not** the familiar one.
  OSM's `name:en` for the park is "Eryri National Park", not "Snowdonia" — so
  choosing English-primary does not buy back the pre-rebrand name, and no
  label source would. Getting "Snowdonia" specifically would need a hand-kept
  override list, which is not in scope. Revisit if testers report it.
- **Correction (2026-09-20, same day):** this entry first recorded the relabel
  as a scoring-free rebuild from the saved JSON. That was wrong. `name:en` was
  never in `KEEP_TAGS`, so `collect()` discarded it at fetch time and
  `pois_raw.json` has only OSM `name` — a rebuild from saved data would emit
  byte-identical files. The repair needs **network work**, though not a
  re-fetch: every record keeps its OSM type/id, so `scripts/backfill_names.py`
  asks Overpass for those objects directly (~72 id queries against 28,124
  objects, ~20 minutes, reusing `fetch_pois.overpass()` so it inherits mirror
  rotation and backoff per DEC-016) rather than repeating the 400-tile
  overnight crawl. `name:en` is now in `KEEP_TAGS`, so this cannot recur.
  The original name is kept as `name_local` per record so the decision stays
  reversible without another fetch.
- **Affects:** GOLF-148 (UI stage), `scripts/backfill_names.py` (one-off
  repair, not a pipeline stage), `scripts/fetch_pois.py` (`KEEP_TAGS`).
- **Status:** agreed 2026-09-20.

## DEC-016 — GOLF-142 data source: Overpass, as a live per-viewport call (not a bulk cache)

- **Decision:** GOLF-142 unblocked. Data source is **Overpass**
  (OpenStreetMap), reusing/extending GOLF-96's existing Worker pattern.
  Google Places and other candidates from DEC-015 are not chosen —
  deferred, not ruled out permanently.
- **Context:** DEC-015 left the data source open after Travelpayouts died.
  Google was the obvious next candidate but has two real costs: (a) no
  true hard spending cap exists on Google Maps Platform — budget alerts
  only notify, they don't stop billing, so "just cap it" isn't actually
  available as a safety net; (b) the caching-restriction problem already
  noted in DEC-014 still applies. Owner also raised a concern about
  "caching a lot of data" — clarified this was never actually the plan:
  GOLF-142 was already spec'd (see `HANDOVER-GOLF-142.md`, "Debounced
  viewport re-fetch") as a **live call on every pan/zoom**, matching the
  GOLF-131 nearby-courses pattern, not a bulk fetch-once-and-ship-in-`data/
  *.js` model like course data. That live-call architecture is unchanged
  by this decision — only which backend the Worker calls changes.
- **Alternatives considered:** Google Places (cost/ToS friction, see
  above); other affiliate/hotel networks (Booking.com affiliate/XML API,
  RateHawk/Ostrovok, Amadeus) — not evaluated, left as future options if
  Overpass coverage proves too weak in practice.
- **Reason:** Overpass has zero new signup, no cost, no caching
  restriction (ODbL allows reuse with attribution), and the Worker
  already has a working, deployed query against it (`handleHotels()`,
  GOLF-96) returning the exact shape GOLF-142 needs — only the
  point+radius query needs extending to a bounding-box/viewport query.
  Coverage is the accepted known weakness (real gaps vs. real hotels not
  mapped in OSM) — this was already flagged in GOLF-103's original
  discovery and is being accepted for v1 rather than solved.
- **New consideration flagged, not yet a blocker:** GOLF-96 fires
  Overpass queries rarely (once per "add a stay" click). GOLF-142 as
  spec'd fires on every debounced pan/zoom while the toggle is on — a
  materially higher request volume. Public Overpass servers have a
  fair-use policy (~10,000 requests/day, heavier throttling under load).
  Fine at current small-beta traffic; worth monitoring if usage grows.
- **Date:** 2026-09-17 · **Affects:** GOLF-142 (unblocked, data source =
  Overpass), GOLF-103 (data-source question resolved for v1, revisit if
  coverage proves inadequate), `HANDOVER-GOLF-142.md` (rewritten).

## DEC-015 — Travelpayouts/Hotellook is dead; GOLF-142 data source reopened

- **Decision:** DEC-014 is superseded. Travelpayouts/Hotellook cannot be
  used for GOLF-142 — the product no longer exists. GOLF-103/GOLF-142's
  data-source question is **reopened**; no replacement chosen yet
  (OPEN QUESTION).
- **Context:** while signing up, the owner couldn't find an API-token
  flow matching the plan and instead found only a "deeplink" generator
  (an affiliate marketing link to a partner site, not an API
  credential) — a sign the account's product surface had changed.
  Investigated 2026-09-17: Hotellook (the brand, the widgets, and the
  hotel-search API) was **shut down by Travelpayouts on 2026-10-20**
  [sic — see note below on date]. Confirmed live, not just from
  documentation: `engine.hotellook.com`'s static-data endpoint returns
  **404** (domain decommissioned), and `travelpayouts.com`'s static
  bulk hotel-data dump (`data/en/hotels.json`) returns **403 Access
  Denied** (S3-style denial, consistent with the file being pulled).
  Both the live search API and the static fallback are gone, not just
  one of them.
- **Note on the shutdown date:** Travelpayouts' own help-center article
  states the closure happened 2025-10-20. Today's date in this project
  is 2026-09-17, so — taking that article's date at face value — the
  shutdown happened roughly 11 months before this decision, i.e. it was
  already long gone when DEC-014 was made 2026-09-17 and this was
  simply never checked before that decision was written. Worth the
  owner independently confirming the exact date if it matters, since an
  AI-summarized web search is the source, not a primary document read
  directly.
- **Impact:** GOLF-142 cannot proceed as scoped. `HANDOVER-GOLF-142.md`
  is now stale (its Worker/data-source guidance assumes Travelpayouts)
  and needs a rewrite once a new data source is chosen. The API token
  the owner generated during this investigation should be treated as
  exposed (shared in a chat transcript) and is moot anyway since the
  product behind it doesn't work — no action needed to revoke it
  specifically, but it should not be used.
- **Remaining candidates, undecided:** (1) **Google Places** — works,
  but reopens both the per-call cost profile and the caching-restriction
  problem already documented in DEC-014's additional-reason note (still
  valid, just no longer decisive on its own since the "simpler/free"
  alternative it was being weighed against is gone); (2) **Overpass**
  (already integrated for GOLF-96, free, no new signup) — coverage is
  the known weakness, but re-check whether "coverage over a wide
  toggleable area" is actually as gap-prone as the original GOLF-103
  discovery assumed, now that the free alternative is off the table;
  (3) other affiliate/hotel-data networks not yet evaluated (e.g.
  Booking.com's own affiliate/XML API, RateHawk/Ostrovok, Amadeus).
  None of these were evaluated in this pass — **next step is a fresh,
  short options review before resuming GOLF-142's build**, not silently
  defaulting to one.
- **Date:** 2026-09-17 · **Affects:** GOLF-103 (reopened), GOLF-142
  (blocked pending new data-source decision), DEC-014 (superseded).

## DEC-014 — SUPERSEDED 2026-09-17, see DEC-015 — Hotel-layer data source: Travelpayouts/Hotellook, no price shown in v1

- **Decision:** GOLF-142 (the "Show hotels" toggle layer) uses
  Travelpayouts/Hotellook as its data source, not Google Places or the
  existing Overpass-based picker. v1 shows plain pins only — no price, no
  booking link.
- **Context:** GOLF-103 had this exact data-source/visual-treatment
  question open in DISCOVERY since 2026-09-07 with three candidates never
  decided between. Owner asked for a concrete "show hotels" button
  2026-09-17, which forced the decision.
- **Alternatives considered:** Google Places (best coverage + ratings/
  photos, but no price data at all and requires a Google Cloud billing
  account even for the free tier); running both sources at once
  (rejected — needs de-duplication logic and roughly doubles the
  integration work for no proven need); Amadeus (parked, needs
  date-selection first, not revisited here).
- **Reason:** Travelpayouts is the simpler build (free signup, no billing
  card, one API token) and is the only candidate with both price data and
  affiliate links, which fits the existing monetization direction
  (DEC-007). Price display itself was still deferred to a future version
  per the owner's standing "no map full of price stickers" preference —
  the data source choice and the visual-treatment choice were separable,
  and only the source needed deciding now.
- **Additional reason found 2026-09-17 (independent of cost):** Google's
  Places API terms forbid caching/storing most place content at all —
  only the place ID may be stored indefinitely, and coordinates for at
  most 30 days; name, address, rating, and photos have no caching
  exception and must be fetched live from Google on every render. That's
  structurally incompatible with this project's fetch-once →
  cache/store → ship pattern used for every other data source
  (`data/*.js`, the Overpass/ORS Worker pattern). Cost aside, Google
  would force a live-fetch-every-time architecture for hotel data that
  doesn't fit how the rest of the app is built. Travelpayouts carries no
  equivalent restriction. Sources: Google's Places API policies
  (developers.google.com/maps/documentation/places/web-service/policies)
  and Maps Platform Service Specific Terms (cloud.google.com/maps-platform/terms/maps-service-terms).
- **Date:** 2026-09-17 · **Affects:** GOLF-103 (data-source question now
  resolved), GOLF-142 (new ticket, build spec).

## DEC-013 — Cluster badge stays a plain numbered circle

- **Decision:** GOLF-139 cancelled. The `.mcluster` marker cluster badge is
  not restyled to echo the teardrop/circle pin shape introduced in
  GOLF-130; it stays a plain numbered circle.
- **Context:** GOLF-130 left this as an open call (its O1) rather than a
  decided scope item; GOLF-133's UI review pass carried it forward as an
  unresolved loose end instead of re-litigating it.
- **Alternatives considered:** restyle the badge to match the teardrop pin
  (rejected).
- **Reason:** owner judged the plain badge fine as-is — not a visual
  inconsistency worth fixing.
- **Date:** 2026-09-13 · **Affects:** GOLF-139 (cancelled), GOLF-130.

## DEC-012 — Wishlist-to-Day-1 auto-materialization stays as-is

- **Decision:** GOLF-138 cancelled. No change to current behaviour — the
  first course added via "+ Wishlist" to an otherwise-empty trip continues
  to auto-materialize as a fully scheduled Day-1 itinerary stop (green fee
  counted into Costs), rather than sitting in an unscheduled "wishlist
  pool."
- **Context:** raised as an open question in GOLF-133's UI review — the
  "+ Wishlist" label implies "save this for later," but a single-course
  trip already auto-schedules to Day 1.
- **Alternatives considered:** keep a wishlisted course unscheduled until
  explicitly dragged/added onto a day (rejected).
- **Reason:** owner confirmed the existing behaviour is the intended
  product model, not a defect.
- **Date:** 2026-09-13 · **Affects:** GOLF-138 (cancelled), GOLF-133.

## DEC-011 — Every deploy wipes every visitor's saved trip data (no migration, no warning)

- **Decision:** on every deploy to `main`, all `localStorage` trip state
  (trips, itinerary days/items, wishlist, filters) is cleared for **every**
  visitor on their next load — not just the owner's own browser. No
  per-visitor opt-out, no "we've updated, here's what changed" notice, no
  attempt to migrate old data forward — a version mismatch just means wipe.
- **Context:** raised as a fix for a specific annoyance — a coding session
  testing GOLF-130 against production left stray trip data in the owner's
  own browser, and it kept reappearing on reopen. The owner asked for
  deploys to auto-clear state generally, not just a one-off cleanup.
- **Alternatives considered:** (a) scope the auto-clear to the owner's
  browser only (a local debug flag), leaving testers' saved trips
  untouched by deploys; (b) detect the version change and show a
  non-destructive "app updated" notice instead of deleting data. Both
  were raised and explicitly rejected — the owner confirmed (a) is not
  what they want: **every** visitor, including real testers, should start
  fresh after any deploy, deliberately, even though this means a tester
  can silently lose in-progress itinerary work the moment any change
  ships (a typo fix included, not only a schema-breaking one).
- **Reason:** owner's explicit call after the trade-off (real tester data
  loss on every deploy, not just risky ones) was raised directly — see
  GOLF-132.
- **Date:** 2026-09-13 · **Affects:** GOLF-132, `js/trip-ui.js` state
  load, `sw.js`/deploy tooling (needs a stable per-deploy version
  identifier to compare against), the Beta-notice copy from GOLF-129
  ("Trips are saved only in this browser" — still true within a deploy,
  now needs a caveat that a deploy resets it).

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
- **Revisit trigger:** when the project starts commercialising (paired
  with the GOLF-104 backend/accounts work and the GOLF-103 hotel
  direction), re-evaluate paying for a premium basemap — Apple MapKit JS,
  a keyed raster tier, or vector (GOLF-106). Note Apple MapKit JS is its
  own map engine, not Leaflet raster tiles, so adopting it is a
  GOLF-106-sized engine port, not a URL swap.
- **As shipped (2026-09-10, `main` `8490f33`):** scope locked to **two**
  raster layers, not three — **Default = Esri World Street Map** (not Light
  Gray Canvas; owner's call at scope-lock, reads more like the old OSM
  street style) and **Satellite = Imagery Hybrid**. Toggle labels are
  literally "Default" / "Satellite". Owner also asked for a true OSM-*style*
  default — Esri only offers that as a **vector** basemap (needs MapLibre),
  so it was declined here and folded into GOLF-106; the raster Default
  stays World Street Map. World Topo stays rejected (too busy). Light Gray
  Canvas remains a one-line future add.
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
