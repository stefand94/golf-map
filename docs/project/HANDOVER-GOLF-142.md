# Handover — GOLF-142: "Show hotels" toggle layer on the map

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM
one).
**Date:** 2026-09-17 (rewritten — see revision note below)
**Read first:** `CLAUDE.md`, this doc, then the source files named below.
**Branch:** work on one branch (e.g. `golf-142-hotel-layer`), not `main`.
Push for a Cloudflare preview before merge.
**Priority:** P2. Not a go-live blocker.

**Revision note:** this ticket originally targeted Travelpayouts/Hotellook
as the data source (DEC-014). That product was confirmed discontinued
before build started (DEC-015 — `engine.hotellook.com` 404s, their static
hotel-data dump 403s). Re-decided 2026-09-17 onto **Overpass** (DEC-016),
reusing/extending GOLF-96's existing Worker pattern. No owner signup step
is needed this time — Overpass is free, keyless, and already integrated.

**Verify before every push:**
```bash
node scripts/test_data.js
node scripts/check_js.js
```
Plus an in-browser check via `./scripts/serve.sh` — no console errors, hotel
pins visible/hidden correctly at different zoom levels, toggle works in both
the Plan/Discover map and the trip-building map.

---

## Objective

Add a toggleable "Show hotels" layer to the map. When on, hotel pins
appear for whatever area of the map is currently visible, and update as
the user pans/zooms — a **live call every time**, not a pre-fetched or
cached dataset. When off (default), no hotel pins show, and existing map
behaviour is completely unchanged.

This is **not** the same as the existing GOLF-96 "add a stay" hotel
picker (a modal search tied to a specific point when building an
itinerary) — this is a persistent, ambient browsing layer, available
independent of trip-building.

---

## Context — existing patterns to reuse

- **Worker proxy + Overpass pattern:** the Cloudflare Worker
  (`scripts/cloudflare-worker/ors-proxy.js`) already proxies Overpass.
  `handleHotels()` (~line 485, GOLF-96) is the closest sibling: takes
  `{mode:'hotels', point:[lng,lat], radius}`, queries Overpass with
  `nwr(around:${radius},${lat},${lng})["tourism"~"^(hotel|guest_house|
  hostel|apartment|motel)$"]`, and returns `{pois:[{name, category, lat,
  lng}]}`. It also already has the multi-mirror fallback loop
  (`OVERPASS_URLS`) — reuse that, don't rebuild it.
- **Point+radius → viewport/bbox query:** GOLF-96's query is a single
  point + radius. This ticket needs whatever's currently visible on the
  map instead. Overpass supports this natively — replace
  `around:${radius},${lat},${lng}` with a bounding-box filter,
  `nwr(south,west,north,east)[...]`, where the four values come from the
  Leaflet map's current bounds (`map.getBounds()` → `getSouth()`/
  `getWest()`/`getNorth()`/`getEast()`). Add a new Worker mode (e.g.
  `mode:'hotelsViewport'`) taking `{bbox:[south,west,north,east]}` rather
  than overloading the existing point-based `'hotels'` mode used by
  GOLF-96 — keep that one untouched so the "add a stay" picker is
  unaffected.
- **Debounced viewport re-fetch:** `js/trip-route.js:676` already has a
  `map.on('moveend zoomend', ...)` listener with debouncing for a live
  "nearby courses" redraw (GOLF-131). Follow the same pattern here rather
  than inventing a new one.
- **Zoom-gated rendering:** `js/map.js:89-90` (`railWeight()`/
  `stnRadius()`) already steps behaviour by `map.getZoom()` at 10/12/14.
  Use a similar threshold check to decide "am I zoomed in enough to show
  hotels" — exact number is a build-time judgment call, tune it in-browser
  against real areas (dense city vs. remote links course) so it feels
  right, not so sparse it's pointless or so wide it's noisy. This also
  matters for Overpass fair-use (see Constraints) — don't fire viewport
  queries at low zoom levels where the bbox covers a huge area.
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
   - Each pin is a simple marker — **no price shown** (Overpass has no
     price data anyway). Hotel name appears on tap/click (a lightweight
     popup/tooltip, consistent with how course pins already show info).
3. When off: no hotel pins, no network calls for hotels, and the toggle
   state does not otherwise change any other map behaviour (course pins,
   routing, etc.).
4. Data source: **Overpass**, via a new Worker mode extending the
   `handleHotels()` pattern to accept a bounding box instead of a
   point+radius. No API key, no owner setup step — reuse the existing
   `OVERPASS_URLS` mirror list and fallback logic.
5. Toggle state does not need to persist across sessions (it's a
   browsing-mode preference, not trip data) unless trivial to add via the
   existing `localStorage` state pattern — owner's call if the agent asks,
   default to **not persisting** if not asked.

---

## Acceptance Criteria

- [ ] Given the toggle is off (default), the map behaves exactly as it
      does today — no hotel pins, no hotel network requests.
- [ ] Given the toggle is switched on while zoomed out past the
      threshold, no hotel pins appear (and no fetch fires) until zoomed
      in further.
- [ ] Given the toggle is on and the map is zoomed in past the threshold,
      hotel pins for the visible area appear within a reasonable time
      (a loading state is fine if the fetch is slow).
- [ ] Given hotels are showing and the user pans to a new area, the pin
      set updates to match the new viewport without a full page reload.
- [ ] Clicking/tapping a hotel pin shows its name.
- [ ] The toggle is present and independently operable on both the
      Plan/Discover map and the trip-building (Itinerary) map.
- [ ] Turning the toggle off removes all hotel pins immediately.
- [ ] The existing GOLF-96 "add a stay" point-based hotel picker still
      works unchanged (its Worker mode was not touched).
- [ ] No console errors, no literal "undefined" anywhere in hotel pin
      popups.

---

## Edge Cases

- Overpass returns zero hotels for the visible area (rural/remote
  course, or genuinely sparse OSM coverage — this is expected and not
  a bug) — show nothing, not an error state.
- Overpass request fails, times out, or all mirrors in `OVERPASS_URLS`
  are down — fail silently/gracefully (no hotel pins, maybe a small
  non-blocking indicator); must not break the rest of the map or throw a
  console error. `handleHotels()` already has this fallback-loop pattern
  — mirror it.
- Rapid panning/zooming — the debounce must prevent a flood of
  overlapping requests (same concern already solved for the nearby-courses
  listener at `js/trip-route.js:676`, and doubly important here given
  Overpass's fair-use limits — see Constraints).
- Switching the toggle off mid-fetch — the in-flight response should not
  render pins after the user has already turned the layer off.
- A very large viewport (zoomed far out, if the zoom gate is set
  generously) — cap the bbox size or the zoom threshold so a single
  query can't ask Overpass for hotels across, say, all of Scotland.
- Existing saved trips / `localStorage` state — this feature adds no new
  trip data, so old trips must load unaffected.

---

## Dependencies

- None external — Overpass needs no signup or key. Builds on the existing
  Worker proxy pattern (GOLF-96's `handleHotels()` and `OVERPASS_URLS`
  are the direct base, not just a reference).

---

## Out of Scope (do not build)

- Price display on pins or anywhere in this layer (Overpass has no price
  data).
- Google Places, Travelpayouts, or any other data source.
- De-duplicating hotels if a second source is ever added later.
- Any change to the existing GOLF-96 "add a stay" hotel picker flow or
  its Worker mode.
- Booking/affiliate click-through UI.
- Persisting toggle state across sessions (unless trivial — see
  Requirement 5).

---

## Constraints

- Zero-backend static site — no API key involved this time, but keep the
  Overpass query itself server-side in the Worker (consistent with the
  existing pattern), not issued directly from the browser.
- Plain non-module `<script src>` load order — no build step, no bundler,
  no framework introduced.
- Must not regress existing map functionality (course pins, routing,
  clustering, GOLF-131's nearby-courses live-update, GOLF-96's hotel
  picker).
- **Overpass fair-use policy:** public Overpass servers expect roughly
  ≤10,000 requests/day and give priority to occasional users over heavy
  ones, throttling more aggressively under load. GOLF-96's usage (one
  query per "add a stay" click) was low-volume; this layer's live
  re-fetch-on-pan design is not. At current small-beta traffic this is a
  non-issue, but the debounce interval and zoom-gate threshold should be
  tuned conservatively (not too eager to re-fetch) rather than
  aggressively, and it's worth a one-line PR note flagging this as
  something to revisit if usage grows (see DEC-016).

---

## Definition of Done

- All acceptance criteria satisfied.
- Existing functionality (course pins, routing, geocoding, GOLF-96 hotel
  picker, PWA install) remains intact.
- `node scripts/test_data.js` and `node scripts/check_js.js` pass.
- Verified in-browser: toggle works in both map views, zoom-gating works,
  pan/zoom re-fetch works, toggle-off clears pins, no console errors.
- Test/scratch `localStorage` state cleared before finishing.
- PR notes: confirm the debounce interval and zoom threshold chosen, and
  flag Overpass fair-use as a thing to monitor if traffic grows.

> The coding agent should inspect the existing codebase and follow
> established project patterns (plain ordered non-module scripts,
> globals, the Worker proxy pattern, the existing debounced
> `moveend`/`zoomend` listener, design-system spacing tokens, no build
> step) before introducing anything new.
