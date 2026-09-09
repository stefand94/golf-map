# Handover — GOLF-108 / GOLF-109: course-pin visibility once a trip exists

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM one).
**Date:** 2026-09-09
**Type:** app-code / UX fix in `js/`. No data-file changes, no hosting.
**Priority:** P1 — **go-live blocker** (both tickets).
**Effort:** GOLF-108 ≈ M (½–2 days); GOLF-109 ≈ S–M, do it immediately
after 108 and re-test before assuming it needs separate work.
**Branch:** work on a branch, not `main` — this is a visible map-behaviour
change the owner will want to eyeball on the Cloudflare preview URL before
merge (`docs/deploying.md`).
**Read first:** `CLAUDE.md`, `docs/project/GOLF-107-uxpass.md` (the parent
scope doc — GOLF-108 and GOLF-109 sections have the full requirement and
acceptance criteria; this handover adds the code-level detail), `TESTING.md`.

---

## Why

Once a visitor has *anything* in their trip (a saved course, an anchor, or
discovery dots), the map stops showing the general course-pin layer. Two
owner-reported symptoms, 2026-09-07:

1. Selecting a country on load does **not** show that country's course pins
   on the map.
2. In the **Itinerary** tab, only trip courses show — you can't see or
   discover other nearby courses on the map the way you can in the
   **Discover** tab.

Net effect: the core "what golf is near here" value of the map disappears
exactly when the user starts planning a trip — the point they most need it.

---

## Root cause (confirmed)

Two layers draw courses, and the trip-builder pane suppresses the first:

- **`layer`** (`js/explore.js`) — the clustered "all courses, filtered"
  pin layer. Built in `render()`.
- **`tripLayer`** (`js/trip-*.js`) — the trip route, trip-course markers,
  and Discover "Nearby" candidate pins. Drawn by `tbDrawMap()`
  (`js/trip-route.js` ~596), which calls `tripShow()` (`js/trip-geo.js`
  ~92) and `tbDiscover()` (`js/trip-route.js` ~335).

**`js/explore.js` `render()` ~line 453:**

```js
if(tripBuilderOn&&tripLayer.getLayers().length)return;
```

The whole trip-builder pane (Discover / Itinerary / Costs) runs with
`tripBuilderOn === true`. As soon as `tripLayer` has any layer on it, this
early-return fires and `layer` is never populated — so the only course
pins on the map are whatever `tbDrawMap()` drew on `tripLayer`.

That early-return is itself a **deliberate 2026-09-01 declutter fix** — it
stopped the trip route getting lost under 500+ clustered pins (usually the
London cluster) regardless of where the trip actually was. Whatever you do
here **must preserve that intent**: the trip route and trip-course markers
stay clearly readable, not buried.

### GOLF-109 specifics

Turnberry lists **both** Ailsa and King Robert the Bruce in the sidebar,
but only one pin shows on the map in Discover. Most likely a *symptom* of
the same early-return (the map is only showing cart/discovery courses). If
it **still reproduces after GOLF-108 is fixed**:

- The map set is `C.map((c,i)=>i).filter(passes)` (`js/explore.js` ~454)
  while the sidebar list uses a different filter path — inspect `passes`
  for a ranking / `bookable` gate that drops the 2nd course of a
  shared-venue pair.
- `jitteredLatLng()` (`js/map.js` ~248) already de-stacks exactly
  coincident courses, so this is a **filter** problem, not an overlap
  problem — unless the two courses' coords differ slightly in the data
  (check `data/courses-*.js` for the venue).

---

## Product decision (owner, 2026-09-07 — do not re-litigate)

Build the nearby-course visibility as a **"show nearby courses" toggle**,
**defaulted to ON**. The owner may flip the default later without a code
change, so read the default from one obvious named constant / state field.

This resolves the only open question in `RISKS.md` R-9
(nearby-in-Itinerary: always / on-zoom / toggle) — it's **toggle, default
ON**. R-9 can be closed when this ships.

---

## Requirements (from `GOLF-107-uxpass.md`, restated)

Per tab:

1. **Discover tab** (`appMode==='plan'`): the map **always** shows the
   course-pin layer, filtered to the current nation + filters + search,
   whether or not a trip exists.
2. **Itinerary tab** (`appMode==='build'`, `tbBuildTab==='itin'`): the map
   shows trip courses + route **plus** other nearby bookable course pins,
   gated by the "show nearby courses" toggle (default ON). "Nearby" = the
   same query the Discover "Nearby" scope uses (`tbDiscover()` /
   `nearestCoursesToPoint()`), anchored on the trip's courses/stops. Note
   the current Discover query caps at 5 results (`.slice(0,5)` in
   `tbDiscover()`) — that's tuned for the sidebar list; for the *map* you
   will likely want a wider set (e.g. nearest N within a radius). Pick a
   sensible N/radius; keep it cheap (it's a synchronous distance sort over
   `C`, no network).
3. **Costs tab** (`appMode==='build'`, `tbBuildTab==='cost'`): unchanged —
   trip route + stops only is correct.
4. Course pins must **not** visually bury the trip route. Keep the route
   polyline and the numbered trip-course markers styled on top / more
   prominent (higher pane or z-index, or draw order).

---

## Implementation notes — two viable shapes, agent's call

The BA/PM view is *what* must be true (above). *How* is yours. Two obvious
routes, with the trade-offs:

**A. Loosen the `render()` early-return.**
Let `layer` populate behind `tripLayer` when the pane is open, but only in
the tab states that want it (Discover always; Itinerary when the toggle is
ON; never on Costs). Keep `tripLayer` on top. Pro: reuses the existing
filtered/clustered layer and its nation+filters+search wiring for free
(requirement 1 is almost automatic). Con: you must re-solve the 2026-09-01
clutter problem — probably by keeping the route/trip markers on a higher
Leaflet pane and making sure `fitBounds` still frames the trip, not the
whole cluster.

**B. Extend `tbDrawMap()` / `tbDiscover()`** to draw the wider nearby set
on `tripLayer` itself in the Itinerary tab (it already does this for
Discover via `pts2`, gated `appMode==='plan'` — see `js/trip-route.js`
~605). Pro: one code path, declutter intent stays intact, full control of
styling and draw order. Con: requirement 1 (Discover shows *all* filtered
courses, not just 5 nearest) still needs the `layer` path or a broadened
query — so you may end up doing a bit of both.

Whichever way: `tripShow()` already renders candidates with `pinFor(i)`
(GOLF-124 fix), so nearby pins already match the golf-ball pin style and
the in-trip / played / want tee tint — don't regress that.

### Key files

- `js/explore.js` — `render()` ~426, the early-return ~453, `passes`
  filter, `layer`.
- `js/trip-route.js` — `tbDrawMap()` ~596, `tbDiscover()` ~335,
  `tbNearbyAnchorPoint()` ~329.
- `js/trip-geo.js` — `tripShow()` ~92, `tripClear()`.
- `js/trip-ui.js` — tab row + `activeTab` ~695 (`tbBuildTab`; 'discover'
  maps to `appMode==='plan'`), toolbar markup (a likely home for the
  toggle control).
- `js/map.js` — Leaflet panes / `pinFor()` / `jitteredLatLng()` (for
  GOLF-109).

### Toggle

- One control, labelled "Show nearby courses" (or similar), visible in the
  Itinerary tab (and harmless/hidden elsewhere — Discover always shows
  them, Costs never does).
- Default ON, from a single named constant/state field.
- Does it persist per-visitor in `localStorage` (`golfmap:v1`)? Not
  required for v1 — a sensible default each session is fine — but if it's
  a one-line add alongside the existing persisted trip-builder UI state,
  do it. Owner's stated priority is just "default ON for now".

---

## Acceptance criteria

GOLF-108:

- [ ] Fresh load, trip has ≥1 course, pick "Great Britain" → GB course
      pins appear on the map in the Discover tab.
- [ ] Itinerary tab with Portrush in the trip, toggle ON → Portrush +
      nearby course pins visible on the map; opening a nearby pin still
      works (popup renders, "add to trip" works).
- [ ] Toggle OFF in the Itinerary tab → nearby pins disappear; trip route
      + trip courses remain.
- [ ] Trip route and trip-course markers stay clearly readable over the
      pin layer in every tab.
- [ ] Removing the last course from a trip does **not** blank the map (the
      2026-09-01 fix still holds — test: add one course, remove it, map
      still shows the filtered course layer, not nothing).
- [ ] Costs tab unchanged — trip route + stops only.

GOLF-109:

- [ ] Discover, no filters, GB selected → **both** Turnberry courses
      (Ailsa + King Robert the Bruce) have pins; both open independently.
- [ ] Spot-check 2 other shared venues (e.g. Sunningdale Old/New, plus one
      36-hole club) — every constituent course has its own pin.

---

## Verification

```bash
node scripts/test_data.js
node scripts/check_js.js
```

Plus in-browser (`./scripts/serve.sh`), against the scenarios in the
acceptance criteria:

- Console clean (no errors) through: pick nation → add course → switch
  Discover/Itinerary/Costs → toggle nearby on/off → remove last course.
- No `undefined` in any course popup/tooltip opened from a nearby pin.
- `TESTING.md` short checklist for anything map-adjacent you touched.
- **Clear trip/test state before you finish** (`tripStartFresh()` or
  equivalent) — see `CLAUDE.md`.

---

## Out of scope

- Any change to the Discover "Nearby" **sidebar list** (still 5, still
  anchored the same way) — this ticket is the **map**.
- Basemap / pin visual restyle — that's GOLF-105 / GOLF-111 (done).
- Persisting the toggle across sessions if it's more than a trivial add.
- New filter controls. Nearby uses the existing nation/filter/anchor
  state; don't add UI beyond the one toggle.

---

## Definition of Done

- All acceptance criteria above pass, verified in-browser (not assumed).
- `test_data.js` + `check_js.js` pass.
- Existing trip-builder behaviour (route drawing, fitBounds framing,
  Discover sidebar, empty-trip map) intact.
- `RISKS.md` R-9 closed; `GOLF-107-uxpass.md` GOLF-108 + GOLF-109 sections
  marked DONE with a one-line implementation summary each (match the
  house style of the already-closed GOLF-110…116 sections in that file).
- `BACKLOG.md` GOLF-108 + GOLF-109 rows → DONE + a "Recently completed"
  line each.
- Trip/test `localStorage` state cleared.
- Branch pushed; owner review on the Cloudflare preview URL **before**
  merge to `main`.

> Inspect the existing code and follow established project patterns
> (globals not modules, ordered `<script src>`, the existing Leaflet
> layer/pane setup) before introducing anything new.
