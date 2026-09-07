# Testing

Short version. The exhaustive step-by-step checklist is
[`docs/testing-full.md`](docs/testing-full.md) — consult it when you touch an
area not covered here, and add a step there for every new interactive feature
(then summarise the load-bearing ones below).

**Whenever a new data field or invariant ships, add a check to
`scripts/test_data.js`. Whenever a new interactive feature ships, add a step
to `docs/testing-full.md`.** These docs are only useful if they stay current.

## Layer 1 — automated, always run before committing

```bash
node scripts/test_data.js   # data-file integrity + course counts
node scripts/check_js.js    # every js/*.js parses + correct load order
```

- `test_data.js` loads `data/*.js` for real (Node `vm`) and checks required
  fields, valid access/region/band values, resolvable `stn`s, well-formed
  `nearStation`/`clubInfo`/`courseStats`/`logo`, the course-count total, and
  no duplicate name+coordinate entries. Run after any `data/*.js` edit.
- `check_js.js` parses each module alone, checks the HTML loads exactly the
  known modules in the known order (update the `ORDER` array if you
  add/remove/reorder one), then parses the concatenation. Run after any
  `js/*.js` or `<script src>` edit.
- Neither executes load-time code, so a module calling a function from a
  *later* module only throws in a real browser — Layer 2 #1 is the backstop.

## Layer 2 — browser checks (run after any rendering / filter / persistence change)

Via the Browser tool: `preview_start` against `.claude/launch.json`, then
`navigate` / `javascript_tool` / `read_console_messages`.

1. **No console errors.** `read_console_messages` with `onlyErrors: true`
   right after load — should be empty.
2. **"undefined" sweep.** In the page console:
   ```js
   const bad=[];for(let i=0;i<C.length;i++){if(popupHTML(i).includes('undefined'))bad.push(C[i].n);}bad
   ```
   Should be `[]`.
3. **Persistence round-trip.** Toggle a filter, make a correction, reload —
   both survive. Then `clearStoredState()` in the console to reset. **Never
   leave test state in `localStorage`** (`tripStartFresh()` for trip data).
4. **Fit-to-results.** "Show all results on map" with no filters → zooms out
   to the whole country, not the London default. Needs the Browser pane
   actually fronted (backgrounded tab = 0×0 map container = false failures).
5. **Trip discovery.** Trip planning by region and by anchor course → non-empty
   results, map fits bounds (incl. radius circle), clicking a result navigates
   and closes the drawer. "Set as anchor course for a trip" from a popup opens
   it pre-seeded.
6. **Trip Builder cart loop.** Add courses from "Nearby" → running cost /
   coverage update, nearest-neighbour order, numbered dashed route on map.
7. **Costs tab.** Add hotels/POIs + set group size → whole-trip and per-person
   totals reconcile with the line items.
8. **Popups spot-check.** A course with a `logo` (e.g. Sunningdale) letterboxes
   cleanly; the handicap calculator pre-fills from `courseStats` where present;
   National Rail badge shows for non-TfL nearest stations only.
9. **Zoom-gating.** Rail lines/labels off below `RAIL_MIN_ZOOM` (9), station
   dots below `STN_MIN_ZOOM` (11); markers cluster into numbered badges until
   `disableClusteringAtZoom` (14). Clicking an unclustered flag still opens a
   working popup.

## Not covered (deliberately)

Visual regression, cross-browser, real mobile devices, load testing — not
proportionate for a static site with no backend.
