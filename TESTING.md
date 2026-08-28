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

## What's explicitly not covered

Visual regression (screenshots), cross-browser testing, real mobile
devices (the Browser tool's mobile preset is an emulation, not the real
thing), and load testing — none of these are proportionate for a
326-course static site with no backend.
