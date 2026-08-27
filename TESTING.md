# Testing

**Whenever a new data field or invariant ships, add a check to
`scripts/test_data.js`. Whenever a new interactive feature ships, add a
step below.** This file is only useful if it stays current — treat updating
it as part of shipping the feature, not an afterthought.

Two layers, because this app has no build step and adding a headless-browser
test dependency just for DOM assertions isn't worth it at this size:

## Layer 1 — automated, no browser needed

```bash
node scripts/test_data.js
```

Loads `data/*.js` for real (via Node's `vm` module, not regex) and checks:
every course has the fields SCHEMA.md says are required; access tier/region/
band values are all valid against `ACCESS`/`REGIONS`/`BANDS`; every
London-catchment `stn` resolves to a real station in `R`/`ISOLATED`;
`nearStation`/`clubInfo`/`courseStats`/`logo` are well-formed when present;
course count matches the last-known total; no duplicate name+coordinate
entries. Exits non-zero on any failure, with a readable list of what broke.

Run this after any edit to a `data/*.js` file, before committing.

## Layer 2 — manual/agent-run, needs a real browser

Run these via the Browser tool (`preview_start` against `.claude/launch.json`,
then `navigate`/`javascript_tool`/`read_console_messages`) after any change
that touches rendering, filters, or persistence:

1. **No console errors.** `read_console_messages` with `onlyErrors: true`
   right after page load — should be empty.
2. **The "undefined" sweep.** Run this in the page's JS console:
   ```js
   const bad=[];for(let i=0;i<C.length;i++){const h=popupHTML(i);if(h.includes('undefined'))bad.push(C[i].n);}
   bad // should be []
   ```
   Catches any popup field that renders a raw `undefined` because a course
   is missing an optional field the render code assumed was there.
3. **Reload persistence round-trip.** Toggle a filter, make a correction
   (via "Correct this"), reload the page — filter and correction should
   still be there. Then call `clearStoredState()` in the console to reset
   before moving on (don't leave test state in `localStorage`).
4. **Fit-to-results sanity.** Click "Show all results on map" with no
   filters active — should zoom out to show pins across the whole country,
   not stay at the default London view. (This one specifically needs the
   Browser pane actually displayed/fronted — `map.getSize()`/`fitBounds()`
   silently misbehave against a backgrounded tab with a 0×0 container; if
   a check like this gives a nonsensical result, front the tab and retry
   before assuming it's a real bug.)
5. **Trip Planning.** Open it, try both "by region" (e.g. South West
   England) and "by anchor course" (e.g. Formby, 40 mile radius) — results
   should be non-empty for any reasonably well-served area, map should
   fit bounds to the results (including the dashed radius circle in anchor
   mode), clicking a result should navigate to it and close the drawer.
   Also: click "Set as anchor course for a trip" on any course's popup —
   should open Trip Planning already in anchor mode with that course
   pre-selected and results populated.
6. **Course Handicap calculator.** Collapsed behind a "Calculate your
   handicap" button on every popup — click it to reveal the calculator,
   pre-filled with `courseStats` where we have it (66 of 221 so far, e.g.
   Royal Birkdale), otherwise all four fields (par/slope/rating/index) are
   blank for manual entry. If a course has multiple tees on record (via
   "Correct this" — see #10a below), a Tee dropdown appears above the
   fields; switching it re-fills par/slope/rating for that tee. Verify one
   output against a hand-calculated example, and that an incomplete set of
   fields shows "Fill in all four fields." rather than a wrong number.

10a. **Multi-tee course stats via "Correct this".** Open any course's
   editor — a "Course stats" section lets you add one row per tee (name/
   par/slope/rating) via "+ Add tee", and remove a row via "Remove". Save,
   reopen the popup, and confirm the handicap calculator now shows a Tee
   dropdown pre-filled with the values you entered for each tee. A single
   unnamed tee row saves in the plain `{par,slope,rating}` shape (backward
   compatible with pre-existing `courseStats`); two or more (or one with a
   name) save as `{tees:[...]}`.
7. **Club logo popups.** Spot-check a course with a `logo` field (e.g.
   Sunningdale) — image should be fully visible (letterboxed, not
   cropped) inside its frame, and a course without one should render with
   no gap or broken-image icon.
8. **Rail/station zoom-gating.** At the default London view (zoom 9) rail
   lines and line-name labels should be visible; zoom out to a country-wide
   view (e.g. via "Show all results on map") and they should disappear
   entirely, not just fade — then zoom back in past `RAIL_MIN_ZOOM` (9)
   and they should reappear, respecting whatever state the Rail/Labels
   toggle buttons are in. Station dots (and their NR rings) are gated
   separately at `STN_MIN_ZOOM` (11) the same way — below zoom 11 they're
   off the map entirely even with the Stations toggle pressed, since at
   country/regional zoom they were just clutter on top of the course flags;
   zoom back in past 11 and they reappear, still respecting the Stations
   toggle's own on/off state.
8a. **Marker clustering.** At any zoom wide enough to see more than one
   town's worth of courses (the default country-wide view especially),
   nearby course flags should collapse into a single numbered circular
   badge rather than rendering as 302 overlapping flags — badge color/size
   should step up with count (small navy → larger ink-dark tiers). Clicking
   a cluster zooms/spiderfies it apart; past `disableClusteringAtZoom` (14)
   every course renders as its own individual flag again, and clicking one
   still opens its normal popup with working buttons (this goes through
   `L.markerClusterGroup` now instead of a plain `layerGroup` — verify a
   popup opens correctly on an unclustered flag, since that's the one thing
   most likely to regress if the library's marker-wrapping ever changes).
9. **National Rail badge.** Open a London-catchment course whose nearest
   station is on a non-TfL line (e.g. Mill Hill Golf Club → Mill Hill
   Broadway, Thameslink) — should show a red "NR" badge next to the
   station name. A course on a TfL line (Tube/Overground/Elizabeth/DLR)
   should show no badge. Every Top 100 course's nationwide `nearStation`
   should always show the badge (that lookup is always National Rail).
   The badge also shows directly on the map: any National Rail station
   (e.g. Mill Hill Broadway) has a red halo ring drawn right around its dot
   at any zoom the Stations layer is visible, not just once zoomed in far
   enough for text labels to appear (≥ zoom 11 for interchanges, ≥ 13
   otherwise, same as before) — its persistent label and its tooltip/popup
   on click should also show the red "NR" suffix; a Tube-only station
   shouldn't have a ring or an "NR" suffix anywhere.
   Separately: clicking any course draws a dashed line to its nearest
   station (`drawLink()`) — for any course whose nearest station is
   National Rail (every `nearStation` nationwide lookup, e.g. Royal Cinque
   Ports → Deal; or a London-network `stn` on a non-TfL line), a small
   National-Rail-roundel-style icon marker should appear right at that
   station's coordinates, not just the dashed line with nothing at the
   other end. A TfL-only `stn` (e.g. a course walking distance from a
   Tube-only station) shouldn't get the roundel.
10. **Trip Planning anchor search.** Open Trip Planning → By anchor
    course — the anchor field should be a free-text search (not a plain
    302-option dropdown): typing a partial name (e.g. "Sunning") should
    narrow the suggestions to matching courses, and typing a full exact
    name should immediately run the search and populate results/map.
    Typing something that doesn't exactly match any course should show
    "No course matches that name exactly" rather than silently doing
    nothing or erroring.

11. **Trip Builder pane — entry, discovery loop, cart (GOLF-31).** From
    any course's popup, click "Set as anchor course for a trip" (e.g.
    Royal Dornoch) — the left column should swap from the filter/course
    list to the "Trip Builder" pane (filters/list hidden, `#tb-pane`
    visible), and Dornoch should already be in the cart. The "Nearby" tab
    should list bookable courses near Dornoch (e.g. Brora, Nairn, Castle
    Stuart) sorted by distance; clicking "Add" on Castle Stuart should add
    it to the cart, update the running cost estimate/coverage count, and
    re-seed the "Nearby" list from Castle Stuart instead of Dornoch (so
    Nairn should still appear, now closer). Repeat once more — the cart
    should show all 3 in a sensible nearest-neighbour order, the map should
    show a numbered dashed route through them, and the still-unpicked
    discovery candidates should also be visible on the map at the same
    time. Each cart row shows a rough weekday-fee estimate (e.g. "~£295
    wd") pulled from the course's fee text, or "fee not parseable" if none
    could be extracted, plus a running "Rough total" with a coverage count
    above the list. Use the ▲/▼ buttons on a row to move it earlier/later —
    the order updates immediately in the list and on the map's numbered
    route, and survives a reload. "auto-order by nearest-neighbour" resets
    the cart to the greedy-distance order (only when clicked — manual
    reordering is never silently overwritten). The cart renders as a
    checkout-style list — each row's fee is a large right-aligned number,
    and a dark "Rough total" bar with a large total sits below the list.
    The discovery radius no longer draws a circle on the map (removed as
    distracting) — only the numbered course markers and dashed route show.
    Click "Remove" (✕) on one cart
    entry — it should disappear from both the cart list and the map
    immediately, cost/order recomputed. Click
    "Exit" — the pane should close and the normal filter/course list should
    reappear; the trip route stays visible on the map (it's independent of
    the pane now — see #14 below); the cart contents should
    still be there if you re-open the pane (same persistence guarantee as
    Played/Want — reload the page and confirm too). While the pane is open,
    open "Correct this" on any course and close it again — the trip route
    on the map must NOT disappear (only genuinely-unrelated drawer closes
    should clear it). Open "Review & export corrections" — the exported
    JSON's `trip` array should reflect the cart's current manual order, not
    a freshly recomputed one.
12. **Trip Builder — region discovery tab (GOLF-27 logic, GOLF-31 UI).**
    With the pane open, click the "By region" tab and pick "S London &
    Surrey" with the default 8-mile border threshold — results should
    include bookable courses actually in that region (no "border" chip)
    plus nearby courses from other regions (e.g. Kent, West/SW London)
    tagged "border", with a gray dashed marker on the map distinct from the
    gold in-region markers; each row should have an "Add" button that adds
    it to the cart same as the Nearby tab. Setting the border input to 0
    should drop back to in-region-only results.
13. **Scotland/Wales visibility (GOLF-25/26).** Toggle the "Scotland only"
    chip — result count should drop to 41, and "Show all results on map"
    should fit the map bounds to Scotland (roughly Islay to Fraserburgh, not
    still centred on London). Same for "Wales only" (22 results, bounds
    roughly Pembrokeshire to Wrexham). Spot-check a course card/popup from
    each nation (e.g. St Andrews (Old), Royal Porthcawl) for a `SCO #`/
    `WAL #` rank badge and no "undefined" anywhere. Don't repeat GOLF-22's
    bug: with no filter active, a Scotland/Wales course should still be
    reachable within a couple of scrolls under the default "by name" sort,
    not buried at the end of an unfiltered list.
14. **Persistent "Add to trip" map feedback (outside the pane).** With the
    Trip Builder pane closed, open any course's popup and click "Add to
    trip" — the mast's "Trip Builder" link should immediately show a count
    badge, and the map should redraw/fit to a numbered dashed route
    through the cart without opening the pane. Add a second course from a
    different popup — the route should extend to include it. Reload the
    page with a non-empty cart — the route should be present on load
    (without forcing a re-fit/zoom). Opening and closing the "Correct
    this"/export drawer must not clear this route either.

## What's explicitly not covered

Visual regression (screenshots), cross-browser testing, real mobile
devices (the Browser tool's mobile preset is an emulation, not the real
thing), and load testing — none of these are proportionate for a
302-course static site with no backend.
