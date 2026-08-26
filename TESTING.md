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
6. **Course Handicap calculator.** Visible on every popup — pre-filled
   with `courseStats` where we have it (66 of 221 so far, e.g. Royal
   Birkdale), otherwise all four fields (par/slope/rating/
   index) are blank for manual entry. Verify one output against a
   hand-calculated example, and that an incomplete set of fields shows
   "Fill in all four fields." rather than a wrong number.
7. **Club logo popups.** Spot-check a course with a `logo` field (e.g.
   Sunningdale) — image should be fully visible (letterboxed, not
   cropped) inside its frame, and a course without one should render with
   no gap or broken-image icon.
8. **Rail zoom-gating.** At the default London view (zoom 9) rail lines
   and line-name labels should be visible; zoom out to a country-wide view
   (e.g. via "Show all results on map") and they should disappear
   entirely, not just fade — then zoom back in past `RAIL_MIN_ZOOM` (9)
   and they should reappear, respecting whatever state the Rail/Labels
   toggle buttons are in.
9. **National Rail badge.** Open a London-catchment course whose nearest
   station is on a non-TfL line (e.g. Mill Hill Golf Club → Mill Hill
   Broadway, Thameslink) — should show a red "NR" badge next to the
   station name. A course on a TfL line (Tube/Overground/Elizabeth/DLR)
   should show no badge. Every Top 100 course's nationwide `nearStation`
   should always show the badge (that lookup is always National Rail).
   The badge also shows directly on the map: zoom into a National Rail
   station (e.g. Mill Hill Broadway, ≥ zoom 11 since it's an interchange,
   ≥ 13 otherwise) — its persistent label and its tooltip/popup on click
   should both show the red "NR" suffix; a Tube-only station shouldn't.
10. **Trip Planning anchor search.** Open Trip Planning → By anchor
    course — the anchor field should be a free-text search (not a plain
    221-option dropdown): typing a partial name (e.g. "Sunning") should
    narrow the suggestions to matching courses, and typing a full exact
    name should immediately run the search and populate results/map.
    Typing something that doesn't exactly match any course should show
    "No course matches that name exactly" rather than silently doing
    nothing or erroring.

## What's explicitly not covered

Visual regression (screenshots), cross-browser testing, real mobile
devices (the Browser tool's mobile preset is an emulation, not the real
thing), and load testing — none of these are proportionate for a
221-course static site with no backend.
