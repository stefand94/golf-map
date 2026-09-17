# Handover — GOLF-142: "Show hotels" toggle layer on the map

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM
one).
**Date:** 2026-09-17
**Read first:** `CLAUDE.md`, this doc, then the source files named below.
**Branch:** work on one branch (e.g. `golf-142-hotel-layer`), not `main`.
Push for a Cloudflare preview before merge.
**Priority:** P2. Not a go-live blocker.

**Verify before every push:**
```bash
node scripts/test_data.js
node scripts/check_js.js
```
Plus an in-browser check via `./scripts/serve.sh` — no console errors, hotel
pins visible/hidden correctly at different zoom levels, toggle works in both
the Plan/Discover map and the trip-building map.

---

## Owner action required before this can be built

This ticket needs a **Travelpayouts** API token, which only the owner can
create (it's tied to their own affiliate account and payout details):

1. Sign up at travelpayouts.com (free, no credit card required).
2. In the partner dashboard, find the **API** / **API keys** section
   (sometimes under "Tools" or "Access to API") and generate a token.
3. Confirm the token has access to the **Hotellook / hotel search** API
   (the same underlying data source as their `search.hotellook.com` /
   `engine.hotellook.com` endpoints) — Travelpayouts bundles several
   verticals (flights, hotels, car hire) and hotel access may need to be
   requested/enabled separately from the dashboard.
4. Note the token and the account's **affiliate marker** (a short ID used
   in outbound links) — the coding agent will need both. Do not paste the
   token into chat with the coding agent or commit it anywhere; it goes
   into the Cloudflare Worker's environment/secrets, the same way
   `ORS_API_KEY` already does (`wrangler secret put`, see
   `scripts/cloudflare-worker/README.md` or the existing `ORS_API_KEY`
   setup for the exact command).

The coding agent should stop and ask if this token isn't available yet
rather than building against a guess at the API shape.

---

## Objective

Add a toggleable "Show hotels" layer to the map. When on, hotel pins
appear for whatever area of the map is currently visible, and update as
the user pans/zooms. When off (default), no hotel pins show, and existing
map behaviour is completely unchanged.

This is **not** the same as the existing GOLF-96 "add a stay" hotel
picker (a modal search tied to a specific point when building an
itinerary) — this is a persistent, ambient browsing layer, available
independent of trip-building.

---

## Context — existing patterns to reuse

- **Worker proxy pattern:** the Cloudflare Worker
  (`scripts/cloudflare-worker/ors-proxy.js`) already proxies ORS and
  Overpass so no API key reaches the browser. `handleHotels()`
  (~line 485) is the closest sibling: takes `{mode:'hotels', point:[lng,lat],
  radius}`, returns `{pois:[{name, category, lat, lng}]}`. This new layer
  should follow the same shape (new `mode`, e.g. `'hotelsLayer'`, or extend
  the existing handler — coding agent's call), but note the query pattern
  differs: GOLF-96 is a single point + radius; this ticket needs whatever
  is currently visible on the map (a **viewport**, i.e. a bounding box of
  NE/SW corners), which changes on every pan/zoom.
- **Debounced viewport re-fetch:** `js/trip-route.js:676` already has a
  `map.on('moveend zoomend', ...)` listener with debouncing for a live
  "nearby courses" redraw (GOLF-131). Follow the same pattern here rather
  than inventing a new one.
- **Zoom-gated rendering:** `js/map.js:89-90` (`railWeight()`/
  `stnRadius()`) already steps behaviour by `map.getZoom()` at 10/12/14.
  Use a similar threshold check to decide "am I zoomed in enough to show
  hotels" — exact number is a build-time judgment call, tune it in-browser
  against real areas (dense city vs. remote links course) so it feels
  right, not so sparse it's pointless or so wide it's noisy.
- **Toggle UI:** there's an existing "Nearby courses" toggle pattern
  (GOLF-108, `js/trip-ui.js`) for reference on how an on/off map-layer
  control is currently built and styled in this app.

---

## Requirements

1. A "Show hotels" toggle control, visible in both the Plan/Discover map
   view and the trip-building map view. Off by default.
2. When on:
   - Hotel pins render only above a zoom threshold (hidden when zoomed
     out too far — dev to tune).
   - Panning or zooming while on triggers a debounced re-fetch for the
     newly visible area and redraws the pins (old pins outside the new
     viewport removed, matching `js/trip-route.js:676`'s pattern).
   - Each pin is a simple marker — **no price shown**. Hotel name appears
     on tap/click (a lightweight popup/tooltip, consistent with how
     course pins already show info).
3. When off: no hotel pins, no network calls for hotels, and the toggle
   state does not otherwise change any other map behaviour (course pins,
   routing, etc.).
4. Data source: Travelpayouts/Hotellook, fetched server-side via a new
   Worker mode, following the `handleHotels()`/ORS-proxy pattern — the
   API token lives in the Worker's environment, never in client code or
   `data/*.js`.
5. Toggle state does not need to persist across sessions (it's a
   browsing-mode preference, not trip data) unless trivial to add via the
   existing `localStorage` state pattern — owner's call if the agent asks,
   default to **not persisting** if not asked.

---

## Acceptance Criteria

- [ ] Given the toggle is off (default), the map behaves exactly as it
      does today — no hotel pins, no hotel network requests.
- [ ] Given the toggle is switched on while zoomed out past the
      threshold, no hotel pins appear (and ideally no fetch fires) until
      zoomed in further.
- [ ] Given the toggle is on and the map is zoomed in past the threshold,
      hotel pins for the visible area appear within a reasonable time
      (a loading state is fine if the fetch is slow).
- [ ] Given hotels are showing and the user pans to a new area, the pin
      set updates to match the new viewport without a full page reload.
- [ ] Clicking/tapping a hotel pin shows its name.
- [ ] The toggle is present and independently operable on both the
      Plan/Discover map and the trip-building (Itinerary) map.
- [ ] Turning the toggle off removes all hotel pins immediately.
- [ ] No console errors, no literal "undefined" anywhere in hotel pin
      popups.

---

## Edge Cases

- Travelpayouts returns zero hotels for the visible area (rural/remote
  course) — show nothing, not an error state.
- Travelpayouts request fails or times out — fail silently/gracefully
  (no hotel pins, maybe a small non-blocking indicator); must not break
  the rest of the map or throw a console error.
- Rapid panning/zooming — the debounce must prevent a flood of
  overlapping requests (same concern already solved for the nearby-courses
  listener at `js/trip-route.js:676`).
- Switching the toggle off mid-fetch — the in-flight response should not
  render pins after the user has already turned the layer off.
- Existing saved trips / `localStorage` state — this feature adds no new
  trip data, so old trips must load unaffected.

---

## Dependencies

- Owner must supply a working Travelpayouts API token + affiliate marker
  before build can start (see "Owner action required" above).
- Builds on the existing Worker proxy pattern (GOLF-96's `handleHotels()`
  is the closest sibling, not a hard dependency — can be added alongside
  it as a new mode).

---

## Out of Scope (do not build)

- Price display on pins or anywhere in this layer.
- Booking / affiliate click-through UI (the affiliate marker only needs
  to be wired into the Worker's Travelpayouts request per their API
  requirements, if required by their terms — no user-facing "Book now"
  flow yet).
- Google Places as a second/fallback data source.
- De-duplicating hotels if a second source is ever added later.
- Any change to the existing GOLF-96 "add a stay" hotel picker flow.
- Persisting toggle state across sessions (unless trivial — see
  Requirement 5).

---

## Constraints

- Zero-backend static site — the Travelpayouts token lives only in the
  Cloudflare Worker's environment, never in `data/*.js`, never in client
  JS, never committed to the repo.
- Plain non-module `<script src>` load order — no build step, no bundler,
  no framework introduced.
- Must not regress existing map functionality (course pins, routing,
  clustering, GOLF-131's nearby-courses live-update).

---

## Definition of Done

- All acceptance criteria satisfied.
- Existing functionality (course pins, routing, geocoding, existing
  GOLF-96 hotel picker, PWA install) remains intact.
- `node scripts/test_data.js` and `node scripts/check_js.js` pass.
- Verified in-browser: toggle works in both map views, zoom-gating works,
  pan/zoom re-fetch works, toggle-off clears pins, no console errors.
- Test/scratch `localStorage` state cleared before finishing.
- PR notes: confirm whether Travelpayouts supports a true bounding-box
  query or whether the implementation approximates it (e.g. viewport
  center + a radius sized to cover the visible area) — this wasn't
  verified during discovery and is worth flagging either way.

> The coding agent should inspect the existing codebase and follow
> established project patterns (plain ordered non-module scripts,
> globals, the Worker proxy pattern, the existing debounced
> `moveend`/`zoomend` listener, design-system spacing tokens, no build
> step) before introducing anything new.
