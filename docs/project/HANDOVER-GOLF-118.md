# Handover — GOLF-118: flag ferry legs + split ferry/drive time

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM one).
**Date:** 2026-09-08
**Read first:** `CLAUDE.md`, `docs/project/GOLF-117-ferry-spike.md` (the
research this is built on — §1 has live test data, §4 is the approved
scope), then the source files named below.
**Branch:** work on one branch (e.g. `golf-118-ferry`), not `main`. Push
for a Cloudflare preview before merge.
**Priority:** P3, post-go-live — not a blocker. Land it when the go-live
UX batch (GOLF-108/109/116/100) is clear.

**Verify before every push:**
```bash
node scripts/test_data.js
node scripts/check_js.js
```
Plus an in-browser check via `./scripts/serve.sh` — no console errors, no
literal "undefined" in any itinerary row.

---

## Objective

Right now a trip leg that crosses water (e.g. mainland → Mull, → Islay,
→ Arran) shows a single "driving time" that silently includes a ferry the
user is never told about. Make it honest:

1. Detect that a leg uses a ferry.
2. Show how much of the leg time is ferry vs driving.
3. Tag the leg with **"⛴ This route has a ferry"**.

The exact sailing timetable is explicitly **not** in scope — see §4 of the
spike. No fares, no schedules, no booking.

---

## Part 1 — Worker (`scripts/cloudflare-worker/ors-proxy.js`, `handleRoute()`)

### What ORS gives us
The directions request currently sends only `{ coordinates: [...] }`. Add:
```js
extra_info: ["waytypes"]
```
The GeoJSON response then carries
`features[0].properties.extras.waytypes`, with:
- `.values` — array of `[fromIdx, toIdx, code]` triples over the route's
  coordinate array. **Way-type code `9` = Ferry** (ORS way-type enum).
- `.summary` — array of `[{ value, distance, amount }]` (amount = % of
  route distance). Handy for `ferryMiles`.

Per-segment `duration`/`distance` are in
`features[0].properties.segments[]`.

### New response fields (add to the existing `{ minutes, miles, route }`)
- `hasFerry` — `true` if any `waytypes` value has code `9`, else `false`.
- `ferryMiles` — summed distance of the ferry way-type (from `.summary`
  where `value === 9`, converted to miles), else `0`.
- `ferryMinutes` — minutes of `minutes` attributable to ferry ways.
  Best-effort extraction:
  - **Preferred:** map the ferry `[fromIdx, toIdx]` coordinate ranges onto
    the segment/step durations and sum the overlap.
  - **Acceptable fallback for v1:** `ferryMiles ÷ 18 mph × 60`
    (typical CalMac vehicle-ferry service speed ≈ 15–20 mph). If you use
    the fallback, say so in a code comment and the PR.
  - Clamp `ferryMinutes` to `< minutes`.

Keep it **backwards compatible**: don't rename or restructure existing
fields. Older clients and older cache entries simply won't have the new
ones.

### Worker acceptance criteria
- [ ] `POST {origin:[-5.4757,56.4126],destination:[-5.7057,56.4712]}`
      (Oban→Craignure) returns `hasFerry:true`, `ferryMinutes` roughly
      40–55, `ferryMiles` > 0.
- [ ] A pure-road leg (e.g. two courses in the Home Counties) returns
      `hasFerry:false`, `ferryMinutes:0`, `ferryMiles:0`.
- [ ] `minutes`, `miles`, `route` values are unchanged from before this
      change for both cases.
- [ ] Malformed / missing `extras` in an ORS response → `hasFerry:false`,
      no throw (defensive parse).

---

## Part 2 — Client cache (`js/ors.js`, `orsEnsureLeg()` ~L102–119)

The leg cache entry built at ~L111 is
`{minutes, miles, route, ts}`. Add the three new fields:
```js
c[key] = { minutes: Math.round(data.minutes),
           miles: data.miles!=null ? Math.round(data.miles*10)/10 : null,
           route: Array.isArray(data.route) ? data.route : null,
           hasFerry: !!data.hasFerry,
           ferryMinutes: typeof data.ferryMinutes==='number' ? Math.round(data.ferryMinutes) : 0,
           ferryMiles: typeof data.ferryMiles==='number' ? Math.round(data.ferryMiles*10)/10 : 0,
           ts: Date.now() };
```
- Any existing cached entry (saved before this change) lacks these — every
  reader must treat missing `hasFerry` as `false` and missing
  `ferryMinutes` as `0`. Do **not** bump/wipe the whole ORS cache for
  this; let old entries age out naturally, or refresh lazily.
- Check whether the ORS cache has a version key; if it does and bumping it
  is cheap and safe, that's fine, but it's not required.

`tripDayRealEstimate()` (~L125) and `legEstimate()` in
`js/trip-route.js` (~L448) both read this cache entry — make sure whatever
shape you return still carries the ferry fields through to the render
layer (or expose a small helper `legFerryInfo(a,b)` mirroring
`tripDayRealEstimate`).

---

## Part 3 — Itinerary render (`js/trip-ui.js`)

The drive-leg line for a day is built around ~L170
(`const mins = (isDayFirst && d.driveIn!=null) ? d.driveIn : (leg ? leg.minutes : null)`)
and rendered in the day card near ~L488–490. There's also a leg display
helper region in `js/ors.js` (`orsHumanMins()` ~L199 for "Xh Ym").

When the leg for a day has `hasFerry` **and** `ferryMinutes > 0`:
- Replace the plain "2h 55m" leg time with a split:
  **"2h 0m driving + ~55m ferry"** (drive part = `minutes - ferryMinutes`,
  ferry part rounded, keep the leading `~`). Reuse `orsHumanMins()` for
  both halves.
- Add a small tag/badge on the leg row: **`⛴ This route has a ferry`**.
  Style it with existing design-system tokens (same treatment family as
  other small metadata chips in the day card — find one and match it).
- If `hasFerry` is true but `ferryMinutes` is 0 (shouldn't happen, but
  guard): show the tag, don't attempt the split.
- A manual `driveIn` override on the day (user-entered) still wins for the
  number, but keep the ferry tag visible so the information isn't lost.

Do the same in the **shared-trip view** (`js/trip-share.js`) if it renders
leg times — check `renderSharedTrip()`. The share payload
(`js/trip-share.js` ~L29 / ~L116) carries `driveIn`; if the shared view
shows computed leg times it should also show the ferry tag. Adding
`hasFerry`/`ferryMinutes` to the share payload is fine (length-cap
numbers like the other fields).

### Render acceptance criteria
- [ ] A trip with a mainland→Mull or mainland→Islay leg shows the
      **⛴ This route has a ferry** tag and a "driving + ferry" split on
      that leg, in both the Itinerary tab and the shared view.
- [ ] A road-only trip is visually unchanged.
- [ ] An old saved trip (localStorage from before this change) loads with
      no console error; ferry legs just won't show the tag until the leg
      re-resolves against the updated Worker.
- [ ] No "undefined" / "NaN" anywhere in the leg row.

---

## Part 4 — Operator link (`data/ferries.js`) — NICE-TO-HAVE, not required

If it's quick: add `data/ferries.js` — a small hand-maintained table
(~12–15 rows) following the same fetch-once/manual-merge pattern as green
fees (see `data/courses-top100.js` for the `fee:{…}` style; keep this
simpler):
```js
// { name, operator, url, approxMinutes, vehicles: true|false, note, lastVerified }
```
Cover: the main CalMac vehicle crossings (Kennacraig–Islay, Oban–Mull,
Oban–Coll/Tiree, Ardrossan/Claonaig–Arran, Mallaig–Skye/Small Isles,
Uig–Lochmaddy/Tarbert, Ullapool–Stornoway, Wemyss Bay–Rothesay,
Gourock–Dunoon), the Cairnryan–Belfast/Larne Irish Sea routes, and
**Kintyre Express** Ballycastle–Islay (`vehicles: false`, seasonal note).

Then, when a leg `hasFerry`, match its ferry sub-segment midpoint to the
nearest row by coordinates and render the operator name as a link next to
the tag. Add `data/ferries.js` to the `<script src>` list in
`london-golf-map-v5_1.html` in load order, and to `scripts/check_js.js`'s
expected list if it enumerates files.

**Ship GOLF-118 without this if it adds meaningful time** — the tag +
time split is the core deliverable.

---

## Out of scope (do not build)
- Sailing timetables, departure times, "next sailing" logic.
- Ferry fares / adding ferry cost to the Costs tab.
- Live availability or booking.
- Foot-passenger vs car-deck distinction (beyond the static `vehicles`
  flag in the optional table).
- Fixing ORS's occasional refusal to use a ferry (e.g. Ardrossan→Arran
  routes the long way). Known limitation — `hasFerry:false` and a long
  drive is an acceptable v1 outcome. Note it in the PR, don't chase it.

## Definition of done
- Worker returns `hasFerry` / `ferryMinutes` / `ferryMiles`, backwards
  compatible; both check scripts pass.
- Itinerary + shared view show the tag and the drive/ferry split on ferry
  legs; road-only trips unchanged.
- Old saved trips / old ORS cache entries load with no error.
- In-browser: no console errors, no "undefined"/"NaN", checked on a
  ferry trip and a road trip.
- Test/scratch `localStorage` cleared before you finish.
- PR notes: how `ferryMinutes` was derived (segment overlap vs distance
  fallback), and whether `data/ferries.js` was included.

> Inspect the existing codebase and follow established project patterns
> (plain ordered non-module scripts, globals, design-system spacing
> tokens, no build step) before introducing anything new.
