# Testing

**Whenever a new data field or invariant ships, add a check to
`scripts/test_data.js`. Whenever a new interactive feature ships, add a
step below.** This file is only useful if it stays current — treat updating
it as part of shipping the feature, not an afterthought.

Two layers, because this app has no build step and adding a headless-browser
test dependency just for DOM assertions isn't worth it at this size:

## Where the JS lives

Since GOLF-70 the app's JavaScript is no longer one inline `<script>` block in
`london-golf-map-v5_1.html`. It lives in `js/*.js`, loaded as plain
`<script src>` tags — **not** ES modules, so every top-level declaration stays
global and the inline `onclick=` handlers in the HTML still resolve, exactly
the way `data/*.js` already worked. **The load order is significant** and is
listed in the HTML; several files run code at load time that depends on
earlier ones. If you add, remove, or reorder a module, update the `ORDER`
array in `scripts/check_js.js` to match, or Layer 1 will fail.

| File | What's in it |
| --- | --- |
| `js/util.js` | Flag marker SVG, station index, National Rail badges, spline, architect tags, the `EDITS` overlay, played/want lists, shared course metrics (`feeNum`/`distMiles`/`rankNum`). |
| `js/trip-model.js` | The trip data model: `TRIP`, `tripDays` and their items, all day/item CRUD, drag-and-drop reordering, multi-trip snapshot/restore. No rendering. |
| `js/state.js` | localStorage load/save/clear, the Explore filter `state`, `HOME`, the map binding, and the initial `loadStoredState()`. |
| `js/handicap.js` | The Course Handicap calculator embedded in a course popup. Loads before `map.js`, which calls it while building popups. |
| `js/map.js` | The Leaflet map: basemap, rail/station layers, clustered course markers, pin/popup/tooltip HTML, mobile list/map toggle. |
| `js/trip-geo.js` | Distance and discovery queries, the trip map layer, and the green-fee/accommodation/fuel cost model. |
| `js/trip-route.js` | Route ordering and drawing: nearest-neighbour ordering, day colours, per-leg estimates, all trip map drawing. |
| `js/trip-add.js` | Adding things to a trip: pane search results, wishlist/day adds, place anchoring, draggable row HTML. |
| `js/ors.js` | The drive-time heuristic plus the OpenRouteService proxy layer (legs, geometry, geocoding, POIs) and its caches. |
| `js/trip-ui.js` | The Trip Builder pane: day legs, itinerary lists, Costs tab, day schedule, wishlist, `renderTripBuilder()` and its wiring. |
| `js/app-mode.js` | The three modes (Explore/Plan/Build), the URL hash, `pushState`/`popstate`. |
| `js/explore.js` | The Explore page: filter chips, fee-range control, place + course search, fuzzy matching, nearest-to-trip list, `render()`, legend. |
| `js/editor.js` | The corrections drawer and per-course editor, JSON export/copy/download, clear-saved-state. |
| `js/boot.js` | Startup: first `render()`, cold-load mode restore from the hash, initial cart draw. Must load last. |

## Layer 1 — automated, no browser needed

```bash
node scripts/test_data.js
node scripts/check_js.js
```

Loads `data/*.js` for real (via Node's `vm` module, not regex) and checks:
every course has the fields SCHEMA.md says are required; access tier/region/
band values are all valid against `ACCESS`/`REGIONS`/`BANDS`; every
London-catchment `stn` resolves to a real station in `R`/`ISOLATED`;
`nearStation`/`clubInfo`/`courseStats`/`logo` are well-formed when present;
course count matches the last-known total; no duplicate name+coordinate
entries. Exits non-zero on any failure, with a readable list of what broke.

Run `test_data.js` after any edit to a `data/*.js` file, before committing.

`check_js.js` is the multi-file replacement for the old "pull the inline
`<script>` block out of the HTML and pipe it through `node --check`" step,
which no longer applies now that the JS is split across `js/*.js`. It parses
every module on its own, verifies the HTML loads exactly the known modules in
the known order, and then parses the concatenation in load order — which is
what the browser effectively evaluates, so it also catches a top-level
`const`/`let` accidentally declared twice across two files. Run it after any
edit to `js/*.js` or to the `<script src>` list, before committing.

What it deliberately does **not** catch, because it never executes anything:
a module whose *load-time* code calls a function declared in a later module.
That throws only in a real browser, so Layer 2's console-error check below is
the backstop for it — run it after moving code between modules.

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
   badge rather than rendering as 326 overlapping flags — badge color/size
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
    326-option dropdown): typing a partial name (e.g. "Sunning") should
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
14. **Trip Builder — no station clutter, no stale anchor, search-to-add
    (GOLF-35/36/37).** Set Royal Dornoch as anchor, add Brora — confirm no
    train-station marker or dashed station link appears anywhere on the
    map while the pane is open (only the gold course markers and the trip
    route itself); open a plain single-course popup outside the pane and
    confirm its nearest-station marker still shows there as before (this
    is a Trip-Builder-only suppression, not a global one). Remove both
    cart entries via ✕ until the cart is empty — the "Nearby" tab should
    fall back to its empty-state hint, not keep showing Dornoch-area
    courses. Now, from a course's plain popup in a different part of the
    country (e.g. Perranporth in Cornwall), click "Add to trip" — re-open
    the pane and confirm the "Nearby" list shows genuinely nearby courses
    (e.g. Trevose, St Enodoc) rather than anything left over from Dornoch.
    Inside the pane, use the new "Search & add a course" box (above the
    Nearby/By region tabs) to type a partial/misspelled course name — it
    should reuse the same fuzzy matching as the main search box, list
    matching bookable courses not already in the cart, and each one's
    "Add" button should add it to the cart and re-seed the Nearby list
    from it, same as clicking "Add" from the Nearby/By region lists.
15. **Persistent "Add to trip" map feedback (outside the pane).** With the
    Trip Builder pane closed, open any course's popup and click "Add to
    trip" — the mast's "Trip Builder" link should immediately show a count
    badge, and the map should redraw/fit to a numbered dashed route
    through the cart without opening the pane. Add a second course from a
    different popup — the route should extend to include it. Reload the
    page with a non-empty cart — the route should be present on load
    (without forcing a re-fit/zoom). Opening and closing the "Correct
    this"/export drawer must not clear this route either.
16. **Day-by-day itinerary schedule (GOLF-33).** With 4+ courses in the
    cart, click "+ Add day" twice — Day 1 and Day 2 sections should
    appear, all cart courses starting in "Unscheduled". Use a course row's
    day dropdown to assign it to Day 1 — it should move out of Unscheduled
    into the Day 1 section immediately, and the map marker for that course
    should recolour to Day 1's colour and relabel to "D1·n". Assign two
    more courses to Day 2 — Day 2's section should show a "Drive to
    today's first stop" number input (Day 1 should NOT show one — no
    previous day to drive from); enter a value (e.g. 45) and confirm it's
    still there after switching discovery tabs or adding a search result
    (i.e. survives a `renderTripBuilder()` re-render), and after a full
    page reload. The map's numbered route should follow day order (all of
    Day 1's stops, then all of Day 2's), with each day's markers a
    distinct colour from the others and from any unscheduled/discovery
    markers. Remove a scheduled course from the cart entirely (✕) — it
    should disappear from its day with no leftover blank slot or console
    error. Click "Remove day" on a day that still has courses — those
    courses should fall back to "Unscheduled", not disappear from the
    cart. Open "Review & export corrections" with a day schedule in
    place — the exported JSON should include a `days` array (day number,
    courses, and the manually-entered `driveInMinutes` where set) labelled
    as a user estimate, alongside the existing flat `trip` array.
17. **Clear trip, drag reordering, and map declutter (stakeholder
    follow-up on GOLF-33).** With 3+ courses in the cart (mix of scheduled
    and unscheduled), click "Clear trip" — a confirm dialog should appear
    ("Clear all N courses..."); cancelling it must leave the cart
    untouched, confirming it should empty TRIP/tripSeq/tripDays entirely
    in one click (no need to remove each course individually), clear the
    mast's cart badge, and clear the map. Drag a course's ⠿ handle onto
    another course within the same day — it should reorder to just before
    the drop target, both in the list and in the map's numbered route.
    Drag an Unscheduled course onto a course inside a day — it should
    both move into that day AND land at that position (not just append to
    the end). Drag a scheduled course onto a course in the Unscheduled
    section — it should move back to Unscheduled. Drop on the empty area
    below a day's last course (or on an empty day) — the dragged course
    should append to the end of that day. While the Trip Builder pane is
    open, confirm the map shows **only** the trip's own markers (cart +
    discovery candidates) — the full 326-course marker cluster should be
    entirely absent, even when the trip is somewhere sparse and the map
    happens to be centred near London. Click "Exit" — the full course
    marker layer should reappear immediately with the correct count.

18. **Suggested overnight town per day (GOLF-34a).** Assign a course with
    a known nearest station (e.g. any London-catchment course) to a day —
    the day block should show "Staying near: `<station name>`" beneath
    its courses. Assign a Scotland/Wales/Top-100 course whose only
    location signal is `nearStation` (not `stn`) — same behavior, reading
    the nearest-station name from that field instead. If a day's last
    course has neither `stn` nor `nearStation`, the line should fall back
    to the course's region rather than showing nothing broken; if even
    that's missing, the line should simply not render (no "undefined",
    no empty "Staying near:"). An empty day (no courses assigned yet)
    shows no suggestion line at all.

19. **Multiple named trips (GOLF-42).** Open Trip Builder, add 2 courses,
    add a day and assign one to it — this is trip "A". Click "+ New" (a
    prompt asks for a name) — the pane should show an empty cart; add a
    different course — trip "B". Switch back to "A" via the trip dropdown
    — its 2 courses and day assignment should be exactly as left, with no
    bleed-through from "B". Click "Duplicate" on "A" — the copy should
    start identical, then diverge the moment you add/remove a course from
    either copy (editing one must never touch the other). Reload the
    page — all trips, the active-trip selection, and each trip's own day
    schedule should survive intact. Try deleting the only remaining trip
    — it should refuse (alert) rather than leave zero trips; deleting any
    other trip should fall back to a remaining one cleanly. As a
    migration check: manually set `localStorage['golfmap:v1']` to an
    old-format flat `{trip,tripSeq,tripDays}` object (no `trips` key) and
    reload — it should load cleanly as a single trip named "My trip" with
    nothing lost, not throw or show "undefined" anywhere in the pane.

20. **Auto-estimated drive times (GOLF-43).** Build a 2-day trip with a
    course far from the first day's course assigned to Day 2 — the Day 2
    drive-time field should show a placeholder number (not empty) with an
    "AUTO" chip and "estimated from straight-line distance" text, with the
    input itself left blank (not pre-filled as a real value). Type a real
    number into that field — the AUTO chip and estimate text should
    immediately switch to the existing "(your estimate — real directions
    coming later)" copy, and the typed value should persist across a
    reload. Day 1 never shows a drive-time row at all (nothing to drive
    from). A day with no courses yet, or whose previous day has no
    courses yet, shows "(no estimate yet — add a course to both days)"
    instead of a number.

21. **Trip cost summary (GOLF-44).** Build a multi-day trip spanning 2+
    scheduled days with courses that have parseable weekday fees. The pane
    should show three separately-labelled, separately-checkable line
    items — green fees (with a "X of Y courses have a parseable fee"
    coverage note), accommodation (one night's typical rate per scheduled
    day except the last, labelled "typical rate — not live pricing"), and
    fuel (straight-line-derived mileage × a per-mile rate) — followed by
    an "Estimated trip total" that sums whichever lines are still checked.
    Unchecking a line item (e.g. accommodation) immediately drops it from
    the total by exactly that line's amount, and the state persists across
    a reload only for the session (the checkboxes are UI state, not saved
    to `localStorage` — re-opening the pane after a reload defaults both
    back to checked). No "undefined" anywhere in the pane or a full
    `popupHTML()` sweep.

22. **Real driving times via the ORS proxy (GOLF-45).** `ORS_PROXY_URL`
    is live (points at the deployed Cloudflare Worker) — build a 2-day
    trip with courses far enough apart to need a real leg and confirm:
    the drive-time field is briefly unset/AUTO on first render (cache
    miss fires an async fetch), then updates to a "live" chip with "real
    driving time via OpenRouteService" copy once the fetch resolves;
    reloading the page keeps showing the live value instantly (no
    re-fetch) because it's cached in `localStorage` under
    `golfmap:legcache:v1`, keyed by the course-pair's coordinates. To spot
    check the not-configured fallback path still works (e.g. after a
    local edit), temporarily blank `ORS_PROXY_URL` and confirm the field
    falls straight back to GOLF-43's AUTO/heuristic chip with no errors —
    then revert. No "undefined" anywhere; `node scripts/test_data.js`
    unaffected (no data-file changes).

23. **"Show POIs" per overnight stop (GOLF-46).** With a course scheduled
    on a day, the "Staying near: `<town>`" line should show a "Show POIs"
    link (only when `ORS_PROXY_URL` is configured — hidden entirely when
    it's blank). Clicking it toggles to "Hide POIs" and, on first click,
    shows a brief "Loading nearby food, fuel and places to stay…" message
    followed by a short list of real nearby hotels/restaurants/fast
    food/fuel (each with a category chip) once the proxy responds — small
    purple dots for each also appear on the map near that day's last
    course, without pulling the map's fit-bounds toward them. Toggling a
    second day's POIs on works independently; toggling either back off
    hides its list/markers without losing the cached data (re-toggling on
    is instant, no re-fetch — confirm by wrapping `window.fetch` and
    checking the call count on a repeat `tbPoisFor()` call). Removing a
    day clears its POI toggle along with it; "Clear trip" resets all POI
    toggles too. No "undefined" anywhere in the pane; `node
    scripts/test_data.js` unaffected (no data-file changes).

24. **Weekend-aware cost estimate (GOLF-48).** Find (or use) a course
    whose weekday/weekend fees differ. With it scheduled on a day that has
    no date set, the cost summary's green-fee line should use the weekday
    rate (unchanged pre-GOLF-48 behavior). Set that day's new optional
    date input to a real Saturday or Sunday — the green-fee total should
    immediately switch to the weekend rate; set it to a weekday date and
    it switches back. A course in Unscheduled (no day, no date context at
    all) always costs at the weekday rate regardless of any other day's
    date. The date persists across a reload (stored per-day, validated as
    a plain `YYYY-MM-DD` string on load). No "undefined" anywhere; `node
    scripts/test_data.js` unaffected (no data-file changes).

25. **Trip Builder gets a real URL (GOLF-41).** Navigate directly to
    `london-golf-map-v5_1.html#trip` (no clicking through the UI first) —
    the page should load straight into the Trip Builder pane (map/list
    filters hidden, `body.trip-mode` set), not the normal course-browsing
    view. Click "Exit" — the URL's hash should clear and the browser's
    back button state is now "not in trip mode". Re-enter via the header's
    "Trip Builder" button or a course popup's "Set as anchor course" —
    both should set the URL to `#trip`. With the browser window wide
    (>900px), trip mode's pane should be noticeably wider than the normal
    360–420px list column (roughly 480–680px) since the itinerary is now
    the point of the page, not a sidebar; the map stays visible throughout,
    just narrower. Press the browser's Back button while in trip mode —
    it should exit cleanly (same as clicking "Exit", cart contents
    untouched); press Forward — it should re-enter cleanly. Bookmark/copy
    the `#trip` URL, open it in a fresh tab (or reload) — it opens
    straight into Trip Builder again, same cart (same `localStorage`).
    Mobile-width pass: the list↔map toggle still works correctly with the
    pane swapped in for the list. No "undefined" anywhere in a full
    `popupHTML()` sweep; `node scripts/test_data.js` unaffected (no
    data-file changes — pure app-state/UI/routing).

26. **Real driving routes + per-leg colouring (GOLF-50).** With
    `ORS_PROXY_URL` pointed at a Worker running the current
    `ors-proxy.js` (the `/geojson` directions variant), build a trip with
    2+ courses across 2+ days and let a leg's real drive time resolve
    (the "live" chip appears). The map's route for that leg should draw
    as a **solid** polyline following real roads (not a straight dashed
    line), and each leg's colour should correspond to the *arriving*
    stop's day — a 3-day trip should show visibly distinct colours per
    day, not one uniform line. Any leg whose real route hasn't resolved
    yet (or the Worker predates GOLF-50, i.e. no `route` field) falls
    back to a dashed straight line in the same day colour — confirm this
    fallback still renders (don't just test the happy path). With
    `ORS_PROXY_URL` unset (shipped default), the whole trip should render
    as dashed straight-line-only, colour-coded by day, unchanged from
    pre-GOLF-50 behavior. No "undefined"; `node scripts/test_data.js`
    unaffected (no data-file changes).

27. **Free/start/end days (GOLF-51).** In the Trip Builder pane, add a
    day and set its type dropdown to "Start point", "Free day", or
    "End point" (in addition to the default "Golf day") — each should
    show a distinct coloured left border (stone for start/end, purple for
    free) and kind-appropriate header/hint copy (e.g. a start/end/free
    day should say something like "no round scheduled" rather than
    prompting to add a course). Type a place name into that day's place
    input (e.g. "Edinburgh") — it should persist across a reload. A
    start/free/end day with no courses should be silently skipped from
    the map route and cost estimate (same as before this ticket — no
    special-casing needed elsewhere). No "undefined"; `node
    scripts/test_data.js` unaffected (no data-file changes).

28. **Hover tooltips on course markers (GOLF-52).** Hover a course marker
    on the map (or call `marker.openTooltip()` directly if testing via
    automation, since synthetic hover doesn't reliably trigger Leaflet's
    tooltip) — a small tooltip should appear showing the course name,
    green fee, and ranking (where applicable), styled distinctly from the
    full popup. Spot-check a course with no ranking (no "undefined" where
    the ranking would go) and a course with no parseable fee. No
    "undefined" across a full sweep of `courseTooltipHTML(i)` for all
    courses.

29. **Trip Builder pane layout: search box placement + nearest-5 nearby
    list (GOLF-53/54).** Open the Trip Builder pane — "Search & add a
    course" should render near the top, directly under the trip switcher
    and above the day-schedule cart (not below it). Switch to the
    "Nearby" discovery tab with an anchor set — it should always show
    exactly the 5 closest bookable courses not already in the cart,
    sorted nearest-first by straight-line distance, with no radius input
    anywhere in the UI. Adding one of those 5 to the cart should
    immediately re-seed the list from the newly-added course. No
    "undefined"; `node scripts/test_data.js` unaffected (no data-file
    changes — pure app-state/UI).

30. **Place search for start/free/end days (GOLF-56).** In the Trip
    Builder pane, type into a day's place input (e.g. "Newquay") — after
    a short pause a dropdown of real geocoded matches should appear below
    the input (via the Worker's `mode:'geocode'` endpoint); clicking a
    result should fill the input, close the dropdown, and set that day's
    coordinates. Build a trip spanning a start-day place, a free-day
    place with a course, and a course-only day (e.g. London → Newquay +
    Perranporth) — the map route and drive-time/fuel estimates should
    treat the geocoded places as real waypoints alongside the golf
    courses (verify via `tripDayOrder()` returning place-then-course
    stops in the right sequence, and `tripDayLegMiles()`/
    `tripDayEffectiveDriveIn()` producing a sane, non-null estimate for
    the place-to-place leg). Place stops should render as a visually
    distinct hollow-ring marker vs. a solid golf-course marker. Reload
    the page and confirm the place name and coordinates both persist. No
    "undefined"; `node scripts/test_data.js` unaffected (no data-file
    changes — pure app-state/UI/Worker).

31. **5-tab Trip Builder sidebar redesign (GOLF-57).** Open the Trip
    Builder pane and confirm the shared chrome: nav bar (wordmark + "{n}
    days · £{total}" pill), one unified search bar, and 5 tab buttons —
    Itinerary / Day / Costs / Add / Discover. On the Itinerary tab only,
    a filter row (All/Golf/Hotels/POI pills + a Drive times On/Off
    toggle) should appear above the list.
    - **Itinerary → All**: one card per day, golf legs as the bold hero
      row (name + price), hotel/POI legs smaller/secondary, a drive-leg
      row when the toggle is on (omitted when off), and a dashed-border
      "DAY TOTAL" row per card.
    - **Itinerary → Golf/Hotels/POI**: flat list (Golf/POI) or a
      connected rail/timeline layout (Hotels) instead of day cards.
    - **Day tab**: unchanged all-days drag-and-drop editor (`⠿` handles,
      day dropdowns) plus a new hotel/POI mini-editor per day — "+ Add
      hotel/stay" and "+ Add point of interest" prompt for a name (and,
      for hotels, an optional nightly £ rate), and each added item shows
      a "Remove" control. A link at the bottom points to the Costs tab
      instead of the old inline cost summary.
    - **Costs tab**: a full-bleed accent banner showing the grand total,
      a 3-row category table (Golf/Stays/POI), then an itemized
      "Line items" table with a category tag per row.
    - **Add tab**: pick a target day from a dropdown, then use the
      course search box — each result's button reads "+ Add to Day N"
      and adds straight to that day (falls back to the old anchor-select
      behavior if no day is chosen).
    - **Discover tab**: unchanged Nearby/By-region course discovery,
      just living under its own tab now; its gold-ring candidate markers
      should only appear on the map while this tab is active (switch to
      another tab and confirm they disappear).
    - Type in the unified search bar character-by-character and confirm
      the input never loses focus/caret position (a real regression risk
      any time a search box's results share a re-render path with the
      input itself).
    - Add a hotel (with a price) and a POI to a day, reload the page, and
      confirm both survive (`d.hotel`/`d.pois` round-trip through
      `saveState()`/`loadStoredState()`/`validateTripEntry`).
    - No "undefined" anywhere across the 5 tabs; `node
      scripts/test_data.js` unaffected (no data-file changes — pure
      app-state/UI). **Known deviations from the original handoff spec**
      (see the plan file's Phase 13 entry): the Day tab still shows all
      days at once rather than a single expanded day; the search bar is
      course-only (no hotel/city search — hotels/POIs are manual-entry);
      the Costs tab always includes Stays (no independent toggle, unlike
      the old cost summary's separate Accommodation checkbox).

32. **Trip Builder usability round 2 (GOLF-58).** Trip switcher dropdown
    should show just the trip name, no "(N)" course count. On a course
    row in the Day tab, its "move to day" dropdown should include a
    "+ New day" option — picking it creates a new day and assigns the
    course to it in one step. Search for a course (via the top search bar
    or the Discover tab's "Nearby"/"By region"/"Near a place" lists) and
    hit Add on a brand-new trip with zero days — it should land directly
    in an auto-created "Day 1", never in Unscheduled. The header button
    should read "Plan a trip" and the pane's own exit link should read
    "← Back to Explore". In the Discover tab, click "Near a place",
    search a city/town — a dropdown of real geocoded matches should
    appear; picking one should re-fit the map around that place plus the
    5 nearest bookable courses to it, each with a working "Add" button.
    Starting a brand-new trip (trip switcher "+ New") should land
    directly on this "Near a place" sub-tab. No "undefined"; `node
    scripts/test_data.js` unaffected (no data-file changes — pure
    app-state/UI).

33. **Trip lifecycle bugs + wishlist-default add + place search in the
    unified bar (GOLF-60/61/62).** Note: this supersedes step 32's "lands
    directly in Day 1" behavior — adding a course now defaults to the
    wishlist instead. Open Trip Builder, create 2 extra trips (trip
    switcher "+ New"), add a couple of courses to each, then click
    **"Start fresh"** next to the trip switcher and confirm the dialog —
    you should land on exactly one new, empty trip, with no leftover
    trips reachable from the switcher dropdown. Type into the top search
    bar, switch/create/duplicate/delete a trip, and confirm the search box
    is empty and no stale place-anchor state carries over on the new
    active trip. Type a course name in the top search bar with zero days
    scheduled and hit **"+ Wishlist"** on 2-3 results — they should land
    in "Unscheduled (Wishlist)" at the bottom of the Day tab, never on a
    day, and that block should show a suggested nearest-neighbour order
    plus a running £ fee total and straight-line drive estimate across the
    pool. With a day open/focused (Day tab, a day's rows visible), the
    same search results should grow a second "+ Day N" button next to
    "+ Wishlist" — clicking it adds straight to that day instead. Type a
    real place name (e.g. "Inverness") into the top search bar — a
    "Places" group should appear above "Golf courses" with a "📍 Start a
    trip here" action; clicking it should anchor the trip to that place
    (Discover tab's "Near a place" sub-tab, map re-fit around it) and
    clear the search box. No "undefined" anywhere in the pane; `node
    scripts/test_data.js` unaffected (no data-file changes — pure
    app-state/UI). Note: this round did not implement GOLF-63 (item-level
    `items[]` day timeline) or GOLF-64 (Explore/Plan/Build three-mode
    restructure) — see the plan file's Phase 15 section for why those were
    deferred rather than rushed.

34. **Item-level day timeline + Explore/Plan/Build modes (GOLF-63/64).**
    Note: this supersedes step 33's "Day tab"/"Discover tab" wording — the
    old 5-tab pane (Itinerary/Day/Costs/Add/Discover) is retired.
    *Modes:* from the map, hit **"Plan a trip"** — you should land in
    **Plan** mode at URL `#plan` (trip switcher + search + Nearby/By
    region/Near a place + a Wishlist section), never straight in day
    scheduling. A course popup's **"+ Add to trip"** should do the same,
    with that course in the wishlist. With at least one wishlist course,
    **"Start scheduling days →"** switches to **Build** mode at `#trip`
    (Itinerary + Costs tabs, plus a **"← Back to wishlist"** link back to
    Plan with the trip intact). Browser Back should walk Build → Plan →
    Explore and Forward should walk back up, with `#trip`/`#plan`/empty
    hashes matching the mode at every hop; a cold load on `#plan` or
    `#trip` should open that mode directly (old GOLF-41 `#trip` bookmarks
    still work).
    *Items:* in Build → Itinerary, on one day add a hotel, two rounds, a
    point of interest and a second, different hotel. Hotel/POI now open an
    inline **search-as-you-type** picker (not the old `prompt()` boxes) —
    picking a real result gives that stop coordinates; a plain typed name
    still works and just shows "no location". Every consecutive pair of
    located stops should show a 🚗 drive row *between* them, not just at
    day boundaries. Drag ⠿ any row — hotel, POI or round — into any
    position, including into another day: the drive rows, day total and
    Costs breakdown should all re-derive from the new order. Dragging a
    round to the Wishlist unschedules it; dragging a hotel/POI there is a
    no-op (it snaps back rather than being deleted). A priced POI should
    show its £ figure on the POI filter list (it used to be dropped).
    *Migration:* a trip saved before this round (day shape
    `courses`/`hotel`/`pois`) should load looking identical, flattened
    once into golf → POI → hotel order.
    No "undefined" in any mode/tab, no horizontal overflow at 375px;
    `node scripts/test_data.js` unaffected (no data-file changes — pure
    app-state/UI). Expect proxy 502s in the console for absurdly long legs
    (e.g. a London course and an Aberdeen hotel on one day) — that is ORS
    refusing the route, and the app falls back to its straight-line
    estimate by design.

35. **Day drag-reorder, city-picker on day creation, add-a-city-to-trip
    (GOLF-65/66/67).**
    *Day drag:* in Build → Itinerary, build a 3-day trip (two rounds on
    Day 1, one on Day 2, Day 3 set to "Free day" with a place). Each day
    header now carries its own ⠿ handle and is draggable as a whole.
    Drag the free day's header onto Day 2 — it should land *before* Day 2
    (matching the item-drag convention), the Day 1/2/3 labels should
    renumber by position, and each day's kind, place, date and full item
    list should travel with it. Drive rows, day totals and the Costs
    breakdown should all re-derive from the new order. Drop a day onto
    the "+ Add day" bar to move it to the very last position (the only
    way to get there, since every other day drop lands before its
    target). A hand-typed "Drive to today's first stop" override is
    cleared on exactly the days whose *predecessor* changed, and only
    those — an override elsewhere in the list survives the reorder, and
    dates are never touched. Item drag (a round/hotel/POI within or
    between days, and out to the Wishlist) must still work unchanged.
    Reload — the new day order should persist.
    *City picker on add:* hit **"+ Add day"** — the new day's place box
    should be created *and focused*, ready to type, with placeholder
    "Search a city (e.g. Edinburgh)" and the same GOLF-56 debounced
    search-as-you-type picker wired. A day with no city is still valid
    (rest/travel days) — the picker is an offer, not a gate.
    *Add a city to the trip:* in Plan mode with **no** trip started, a
    place result offers only "📍 Start a trip here". Once a start city is
    anchored (or any day exists), the same result grows a second
    **"+ Add to trip"** action and the first relabels to "📍 Anchor
    here". Clicking "+ Add to trip" must add that place as a new
    `kind:'free'` day with real placeLat/placeLng and **must not**
    re-anchor the trip or change mode — anchor stays where it was, you
    stay in Plan, the search box stays open (so several cities can be
    added in a row), and an "Added <city> as Day N" note appears.
    "📍 Anchor here" must still anchor and clear the search (GOLF-61
    behaviour unchanged).
    No "undefined" across all 9 mode/tab/filter views, no horizontal
    overflow at 375px, and "Start fresh" must clear the new transients
    (`tbPlaceAddedNote`, `tbFocusDayPlace`, `tbDayDrag`) as well as the
    trip. `node scripts/test_data.js` unaffected (no data-file changes).
    Note: if the ORS proxy is returning 502/504 (upstream
    OpenRouteService outage — it was during this round's verification),
    the geocode dropdowns return nothing and the pickers degrade to
    plain typed text by design. Stub `window.orsGeocode` in the console
    to exercise the picker UI in that case.

36. **Stakeholder feedback round 3 — Explore search/filters + day-card
    fixes (GOLF-69).** Ten-item batch; one item (merging the standalone
    Day tab into Itinerary) was already shipped by GOLF-64 and needed no
    change.
    *Explore search finds places:* on the Explore page type "Glasgow"
    into the main search box. A **"Towns & cities"** strip must appear
    directly under the box with geocoded results and the same actions as
    the Trip Builder's unified bar ("Start a trip here", plus "+ Add to
    trip" once a trip exists). Same 300ms debounce and stale-response
    guard as that bar — type fast and only the last query's results
    should land.
    *Search on top, filters in a dropdown:* the search box must be the
    **first** control in the panel, with a single collapsed **FILTERS**
    dropdown under it holding access/green fee/architect/area/show-only.
    The summary carries a count badge of active filter groups, and the
    dropdown auto-opens on load when a filter was restored from
    localStorage (otherwise a saved filter is invisible).
    *Green fee is a range:* two-thumb slider plus typed Min £ / Max £
    boxes and a readout. Sliders and boxes must stay in sync in both
    directions; a thumb at either extreme means *unbounded* (readout
    reads "any price", or "£N+" at the top). The scale tops out at the
    95th percentile, not the £1,150 maximum, so ordinary fees aren't
    squashed into the first 10% of the track. Courses whose fee doesn't
    parse ("POA") pass while the range is untouched and drop out once a
    bound is set. Reload — the range must persist.
    *Nearest-to-trip list:* add a course to the trip from the Explore
    page. The bottom-left course list must be **replaced** (not
    supplemented) by a "Nearest to <course>" list, closest first, with
    the trip's own courses excluded and an "+ Add to trip" button per
    row. The **All results** pill returns to the normal filtered list.
    Map markers must still show the full filtered set underneath either
    list.
    *Drag to the bottom of a day:* grab a course row in Build →
    Itinerary. A dashed **"↓ Drop here to put it last on Day N"** zone
    must appear inside every day (hidden at rest), each day must gain a
    dashed outline, and the row/zone under the pointer must highlight.
    Dropping on the zone appends to the end of that day — the position
    that was previously unreachable, because dropping on a row always
    inserts *before* it. `body.tb-dragging` must clear on drop *and* on
    a cancelled drag (dragend).
    *Row alignment:* every row in a day — golf, hotel, POI, and the
    wishlist rows — must line up on the **first letter** of its name, in
    one column, regardless of type or of how wide its trailing controls
    are. (The old bug: three bare flex children under
    `justify-content:space-between` centre the middle one.)
    *Day 1 is the start of the trip:* from a completely empty trip, each
    of the three entry points — a map popup's "Add to trip", the pane's
    "+ Wishlist", and picking a city from either search box — must land
    the first item **directly in Day 1**, with no separate start slot and
    nothing left in Unscheduled. Second and later course adds still go to
    the wishlist (GOLF-62 unchanged). Picking a city while in **Build**
    must **not** bounce you to Plan/Discover.
    *Day card chrome:* each header reads exactly "Day 1" / "Day 2" — no
    "— 1 course · 2 stops" suffix. **"+ Add day"** sits directly under
    Day 1's card; the bottom bar keeps "Clear trip" and stays the
    drop target for moving a dragged day to last place, and only shows
    its own add-day button once there are 2+ days.
    *Chronological mixed day:* a day holding a POI, a round and a hotel
    must render them as one list in whatever order they're dragged into
    (e.g. Burns Cottage → Western Gailes → Redburn Hotel), with drive
    legs interleaved and the **golf row visually prominent** (bold name,
    accent rule down its left edge).
    *Hotel/POI map markers:* a hotel stop draws a 🏨 marker and a POI a
    📍 marker. A stop with real geocoded coordinates sits on them; one
    without falls back to the day's own city, then the day's last course,
    then the nearest day either side that has one — jittered a few
    hundred metres so several locationless stops don't stack, and its
    tooltip says "(approximate — no address set)".
    No console errors, no "undefined" in the pane, no horizontal overflow
    at 375px, and `node scripts/test_data.js` unaffected (no data-file
    changes).

37. **Stakeholder feedback round 4 — Explore search navigates only, item
    editing, hotel per-person pricing, price-band chips
    (GOLF-72/73/74/75).**
    *Explore search is navigation, nothing else:* on the Explore page type
    "Islay" into the main search box. The **"Towns & cities"** strip must
    still appear, but each hit is now one clickable row with **no**
    trip-related buttons — no "Start a trip here", no "+ Add to trip"
    (GOLF-72 deliberately reversed that part of GOLF-69a). Clicking a hit
    must fly the map to that place at zoom 11 and change **nothing** about
    the trip: day count, wishlist, anchor and the current mode must all be
    exactly as they were. The Plan-mode unified search bar is unchanged
    and must keep both of its actions.
    *Editing an itinerary item:* in Build → Itinerary, a hotel or POI row
    must offer **✎ Edit** in its **⋯ row menu** (since the GOLF-71 merge
    every per-row action lives in that one overflow menu — Edit is no
    longer a separate inline button beside a ✕, and the ✕ itself is now
    "🗑 Remove" inside the same menu). Edit replaces that row in place
    with an inline form (never a browser `prompt()`) carrying the item's
    current name, price and pricing basis. Name is the same
    search-as-you-type geocode picker used when adding — picking a new
    result must rewrite the item's coordinates (and therefore its drive
    legs); leaving the name untouched must **preserve** the existing
    coordinates; typing over the name by hand must clear them. Save keeps
    the item's position in the day (its `id` is not regenerated). Cancel
    discards. A **golf** row has no Edit entry at all — by design; its
    only trip-level property is the day, which appears as the "Move to"
    section at the top of that same ⋯ menu (post-GOLF-71 this replaced the
    inline day dropdown).
    *Hotel per-person-sharing pricing:* the hotel add/edit form has a
    **Per room / night** vs **Per person sharing** toggle, with a
    **Guests** input that appears only for "per person" (default 2). At
    £90 per person × 2, the itinerary row must read
    `£90 × 2 (sharing) = £180` — post-GOLF-71 that worked label sits on
    the row's small grey meta line under the hotel name, because GOLF-71's
    right-hand price column is a single nowrap figure and shows the £180
    total (with the arithmetic in its `title=` tooltip on Build-mode rows).
    The day total must include **£180**, and
    the Costs tab must show Stays £180 with the line item annotated
    `(£90 × 2 sharing)`. Switching the toggle must not lose a half-typed
    name or price. A "per room" hotel is unaffected and renders as a plain
    `£180`. POI items have no pricing-basis controls.
    *Migration must be a no-op for old data:* a trip saved before this
    round (a hotel with `price` and no `priceType`, including the
    pre-GOLF-63 `hotel`/`pois` shape) must load as `priceType:'room'`,
    `guests:2` and cost **exactly what it cost before** — a £90 hotel
    stays £90, never £180.
    *Price-band chips:* the Filters dropdown's Green fee section shows
    four quick chips — **≤ £30 / £31–70 / £71–150 / £151+** — above the
    existing range slider. Clicking one sets the slider, the Min £/Max £
    boxes and the readout to that range (one filter, two controls; the old
    Set-based band filtering must **not** be back). The matching chip
    highlights only while the range exactly equals it; dragging the slider
    off it clears the highlight; clicking the active chip returns to "any
    price". The slider itself must still work in both directions and land
    on exact values (£151 must read 151, not 150).
    No console errors, no "undefined" in any rendered UI, no horizontal
    overflow at 375px in either the Explore filter dropdown or Build's
    itinerary rows and open edit form, and `node scripts/test_data.js`
    unaffected (no data-file changes).

38. **Empty-trip Build mode dead end (GOLF-76, stakeholder-reported live
    bug).** From a fully empty trip (`tripStartFresh()`, or a fresh
    default trip on first visit), open Build mode / navigate directly to
    `#trip`. The empty-state message must be followed by a working
    **"＋ Add a day"** button (previously there was no button anywhere on
    this screen — a dead end), alongside a **"Browse courses"** button
    back to Plan. Clicking "＋ Add a day" must create Day 1 with its
    Options panel already open on the city picker. Separately: add a
    course to the wishlist but create no day, then open Build — the
    bottom end-zone bar must also show a working "＋ Add a day" button
    (previously it only appeared once 2+ days already existed).
    *Post-GOLF-71 note:* the redesign removed the old per-day "+ Add day"
    button that used to sit under Day 1, so "＋ Add a day" now appears in
    exactly one place at a time (the empty state, or the bottom end-zone
    bar) and the old "hide the duplicate when exactly one day exists"
    rule no longer applies — there is no duplicate to hide.
39. **Design-system pass + drag-and-drop reliability (GOLF-71).** Open the
    Trip Builder pane in each of the three modes (Explore, Plan, Build).
    *Design tokens:* every radius, shadow, spacing, font size and tap
    target comes from a `--radius-*` / `--shadow-*` / `--sp-*` / `--fs-*`
    / `--tap` custom property — no hardcoded px should be reintroduced.
    Buttons all use the single `.tb-btn` primitive and are at least 44px
    tall.
    *One search bar:* there must be exactly one search input at the top of
    the pane. It is sticky, so scrolling deep into a long itinerary keeps
    it in view. Every other search field (day city, add-stop location,
    Explore) is the same `tbSearchFieldHTML` component — typing debounces,
    ArrowUp/ArrowDown move through results and Enter picks one. There is
    no second "Near a place" box in Discover.
    *Drag-and-drop (the important one — do these as real drags, not by
    calling functions):* (a) drag a wishlist course onto a day, grabbing
    it **by its name**, not the handle — it must move, not start a link
    drag; (b) reorder two stops within one day; (c) drag a stop from one
    day onto a row in another day; (d) drag a whole day by its header
    handle onto an earlier day; (e) drag a day onto the bottom "Add day"
    bar to move it last. In each case the source row must visibly lift
    (fades and shrinks slightly), an accent insertion line must appear
    above the target, and the "Put it last on Day N" drop zone must
    overlay the card **without shifting the layout**.
    *Copy:* no card should carry an explanatory sentence longer than a
    short phrase — the detail belongs in a `title=` tooltip (e.g. the
    date field reads "Date · optional", the drive field shows a
    `live`/`auto`/`yours` chip).
    At 375px the day header must read "Day 1" in full, with the place name
    truncating instead. No console errors, no "undefined" in the pane, and
    `node scripts/check_js.js` plus `node scripts/test_data.js` both pass.

40. **Place-search failure vs. no-match distinction (Phase 22 fix).** With
    the ORS geocoding endpoint unreachable (as it genuinely was when this
    was written — no stubbing needed to reproduce), typing a place name in
    Explore's search box must show **"Place search is temporarily
    unavailable."** in `#place-results`, and typing one in the Plan/Build
    unified search bar must show the same message under a "Towns & cities"
    heading, both instead of silently showing nothing (which is
    indistinguishable from "no such place" and was the actual stakeholder
    bug report). To check the other side of the distinction, stub
    `window.orsGeocode=(t,cb)=>cb([])` and search a nonsense string — both
    surfaces must fall back to their ordinary no-match copy ("No matches" /
    "No places or bookable courses match…"), with **no** "unavailable"
    message. Course search itself must be unaffected throughout. No
    console errors (network-level 502/403s from the failing ORS endpoint
    are expected and fine — only JS exceptions count). `node
    scripts/check_js.js` and `node scripts/test_data.js` both pass.

41. **Ireland course data (GOLF-77).** Click the "Ireland only" flag chip
    and confirm the count reads "37 of 363" (not 326 — Ireland's 37
    courses are additive on top of the existing London/Top100/Scotland/
    Wales set). Click "Fit to results" and confirm the map recentres over
    the island of Ireland, not London. Open a Northern Ireland popup (e.g.
    Royal Portrush) and confirm fees render in `£`; open a Republic of
    Ireland popup (e.g. Old Head) and confirm fees render in `€` — the
    currency split is genuine, not a bug. Confirm the popup shows an
    `IRE #N` ranking badge, a region drawn from the new Ireland-specific
    `REGIONS` entries, and — since no Irish course carries `nearStation`
    on this map — the graceful "Outside the rail catchment" copy rather
    than "undefined". `node scripts/test_data.js` reports "OK — 363
    courses (114 Top 100)".

42. **South Africa course data (GOLF-78).** Click the "South Africa only"
    flag chip and confirm the count reads "19 of 382" (additive on top of
    the existing 363). Click "Fit to results" and confirm the map recentres
    over South Africa, not London/Ireland. Open a popup (e.g. Fancourt or
    Leopard Creek) and confirm fees render in `R` (ZAR); confirm the popup
    shows a `ZA #N` ranking badge, a region drawn from the new South
    Africa-specific `REGIONS` entries (Western Cape & Garden Route,
    KwaZulu-Natal, Gauteng, Eastern Cape, Mpumalanga & Kruger, North West),
    and — since no South African course carries `nearStation` or `stn` on
    this map — the graceful "Outside the rail catchment" copy rather than
    "undefined". `node scripts/test_data.js` reports "OK — 382 courses
    (114 Top 100)".

43. **"Near a place" merged into "Nearby" (GOLF-91).** Note: supersedes
    every earlier mention above of a separate "Near a place" Discover
    sub-tab (steps 32/33/34) — Discover is now a 2-way segmented control,
    "Nearby" / "By region", not 3-way. Open the Discover tab on a fresh
    trip — it should show "Nearby" and "By region" only, no third button.
    With nothing anchored yet, "Nearby" should read "Add a course, or
    search a town or city in the bar above, to see what's nearby." Add a
    course from anywhere (search bar, a course popup, Discover results) —
    "Nearby" should now read "Courses near **<course name>**." and list 5
    nearby courses. Search a place in the top bar and pick it — "Nearby"
    should switch to "Courses near **<place name>**." (the place wins).
    Add another course after that — "Nearby" should switch back to that
    course (most-recently-added anchor wins, matching "select a course or
    a place, see nearby regardless"). No "undefined"; `node
    scripts/check_js.js` and `node scripts/test_data.js` unaffected (pure
    app-state/UI, no data-file changes).

44. **Nation pills moved to the very top; automatic 1-day-per-course
    scheduling (GOLF-94).** Two independent checks:
    - **Pill placement**: on any tab (Discover/Itinerary/Costs), confirm
      `#tb-nation-pills` is the very first child of `#tb-pane`, above the
      navbar — not just visible on Discover.
    - **Automatic scheduling**: start fresh, add 2+ courses via
      `tbAddToWishlist()` (search bar/Discover/a popup) with zero days —
      confirm they land in the wishlist, not a day. Click into the
      Itinerary or Costs tab (or call `enterBuildMode()`) — confirm each
      wishlist course got its own new day, appended after any existing
      days, in nearest-neighbour order, and the wishlist is now empty.
      Re-enter Build with nothing new queued — confirm no duplicate days
      are created. Manually insert a `kind:'free'` day between two golf
      days, add another wishlist course, re-enter Build — confirm the free
      day stays exactly where it was and the new course is appended as a
      new day at the end (existing days, of any kind, are never touched by
      this automatic path). Separately, the manual "Auto schedule ▾ →
      Reschedule all courses (full reset)" button remains a deliberate,
      opt-in destructive action: every `kind:'golf'` day is rebuilt from
      scratch (nearest-neighbour order over every course in the trip,
      scheduled and unscheduled alike) while free/start/end days keep
      their exact position. `node scripts/check_js.js` and `node
      scripts/test_data.js` unaffected (pure app-state/UI, no data-file
      changes).

45. **Prompt-based day-reorder suggestion (GOLF-95).** Supersedes any
    notion of a silent/automatic reorder — the app must never reorder
    days on its own; it only ever offers, via a dismissible banner at the
    top of the Itinerary tab. Build a 4-course trip (auto-scheduled into
    4 golf days per GOLF-94), then insert a `kind:'free'` day with real
    `placeLat`/`placeLng` between day 2 and day 3 such that it's *not*
    the nearest-neighbour-optimal slot (e.g. a day whose place is
    actually closest to day 4). Confirm `tripSuggestedDayReorder()`
    returns a non-null `{origIdxs,suggestedIdxs,sig}` and the banner
    ("This order looks inefficient — want to auto-order the trip for a
    better route?") renders above the day cards. Click **Auto-order**:
    confirm the days are correctly reordered (nearest-neighbour over
    every locatable day's first stop), `driveIn` is cleared only on days
    whose predecessor changed, dates are untouched, and the banner
    disappears. Re-create the same suboptimal arrangement and click
    **Not now**: confirm the banner disappears and does **not** reappear
    on a subsequent render of the *same* arrangement (`tbReorderDismissedSig`
    correctly suppresses re-prompting for that exact day-id sequence);
    then change the day arrangement again (a different sig) and confirm
    the banner *does* reappear despite the earlier decline. Confirm a
    day arrangement that's already nearest-neighbour-optimal shows no
    banner at all. Confirm `tbReorderDismissedSig` resets on every
    trip-lifecycle boundary (`tripCreateNew`, `tripDelete`, `tripSwitchTo`,
    `tripDuplicate`, `wipeStoredState`, `tripStartFresh`) alongside the
    other GOLF-60b transients. `node scripts/check_js.js` and `node
    scripts/test_data.js` unaffected (pure app-state/UI, no data-file
    changes).

## What's explicitly not covered

Visual regression (screenshots), cross-browser testing, real mobile
devices (the Browser tool's mobile preset is an emulation, not the real
thing), and load testing — none of these are proportionate for a
326-course static site with no backend.
