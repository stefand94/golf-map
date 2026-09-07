# GOLF-107 — Pre-go-live UX refinement pass (scope)

Source: product owner's bug list, 2026-09-07. Each item below is a child
ticket. "Blocker?" = my recommendation on whether it should hold go-live;
owner has final say. Effort: S ≈ <½ day, M ≈ ½–2 days, L ≈ multi-day.

Triage note: **every item here is a code/UX issue, not hosting** — all
reproduce on the local server (`./scripts/serve.sh`).

---

## GOLF-108 — Course pins suppressed once a trip exists (map visibility) · Blocker: YES · M

**Symptoms (owner items 1 + 11):**
- Selecting a country on load does not show that country's course pins on
  the map.
- In the Itinerary tab, only trip courses show — nearby/other courses are
  not discoverable on the map the way they are in the Discover tab.

**Root cause (found):** `js/explore.js` `render()` ~line 455 —
`if (tripBuilderOn && tripLayer.getLayers().length) return;` — bails out
before populating the clustered course `layer` whenever anything is on
`tripLayer` (a saved trip, an anchor, discovery dots). The whole
trip-builder pane (Discover / Itinerary / Costs tabs) runs with
`tripBuilderOn === true`, so the general course-pin layer is effectively
never shown once the user has a trip.

**Requirement:**
1. **Discover tab:** the map always shows the course-pin layer filtered to
   the current nation + filters + search, whether or not a trip exists.
2. **Itinerary tab:** the map shows trip courses/route **plus** other
   nearby bookable course pins (so "what else is near Portrush" works here,
   not only in Discover). Nearby = same query the Discover "Nearby" scope
   uses, anchored on the trip's courses/stops.
3. **Costs tab:** unchanged (trip route + stops only is fine).
4. Course pins must not visually bury the trip route — keep the route and
   trip-course markers styled on top / more prominent.

**Open question (owner):** in the Itinerary tab, should the extra nearby
pins be **always on**, **on above a zoom threshold**, or behind a small
**"show nearby courses" toggle**? Recommendation: toggle, default on.

**Acceptance criteria:**
- [ ] Fresh load, trip has ≥1 course, pick "Great Britain" → GB course
      pins appear on the map in the Discover tab.
- [ ] Itinerary tab with Portrush in the trip → Portrush + nearby course
      pins visible on the map; opening one still works (popup, add-to-trip).
- [ ] Trip route and trip-course markers remain clearly readable over the
      pin layer.
- [ ] Removing the last course from a trip does not blank the map
      (existing 2026-09-01 fix still holds).

---

## GOLF-109 — Multi-course venues: all courses show on the map · Blocker: YES · S–M

**Symptom (owner item 9):** Turnberry lists both Ailsa and King Robert the
Bruce in the sidebar, but only one shows on the map in Discover.

**Likely cause:** partly a symptom of GOLF-108 (early-return showing only
cart/discovery courses). If it still reproduces after GOLF-108: the map set
is `C.filter(passes)` (`js/explore.js` ~456) while the sidebar list uses a
different filter — inspect `passes` for a ranking/`bookable` gate that
drops the second course of a shared-venue pair. Note `jitteredLatLng()`
(`js/map.js` ~248) already de-stacks exactly-coincident courses, so this is
a *filter* problem, not an overlap problem, unless their coords differ
slightly (check the data).

**Requirement:** every course that appears in the sidebar list for the
current filter state also has a pin on the map (subject to the same
filters), including the 2nd/3rd course of a shared venue.

**Acceptance criteria:**
- [ ] Discover, no filters, GB selected → both Turnberry courses have
      pins; both open independently.
- [ ] Spot-check 2 other shared venues (e.g. Sunningdale Old/New, a
      36-hole club) — all constituent courses pinned.

---

## GOLF-110 — Hide the nearest-railway-station feature · Blocker: recommend YES (declutter) · S

**Ask (owner item 3):** rail/station stuff is a legacy of the original
London-only concept; hide it until/unless public-transport planning is a
real feature. Keep the code and data dormant, don't delete.

**Scope:** behind a single feature flag (e.g. `const RAIL_FEATURE=false`
in `js/config`/`map.js`), suppress:
- the `t-rail` / `t-lbl` / `t-stn` toggle buttons in the HTML map controls;
- adding `railLayer` / `stnLayer` / `lblLayer` / `stnLblLayer` to the map,
  and the `restyleRail()` / `zoomend` work;
- `drawLink()` (the dashed course→station line) on course-marker click;
- the "By rail" row in `popupHTML()` (`js/map.js` ~207) and the fee/rail
  line in `courseTooltipHTML()`;
- any rail references in the shared-trip view.
Leave `data/stations.js`, `data/rail-geometry.js`, `nearStation` fields and
all the functions in place — flag-gated, not removed.

**Decision:** recorded as DEC-008.

**Acceptance criteria:**
- [ ] No rail/station toggles, lines, dots, labels or link lines anywhere
      (main map + shared view) at any zoom.
- [ ] No course popup/tooltip shows rail info; no "undefined" left behind.
- [ ] Flipping the flag back to `true` restores today's behaviour.
- [ ] `check_js.js` passes.

---

## GOLF-111 — Course marker redesign · Blocker: NO (nice-to-have) · S once asset decided

**Ask (owner item 4):** replace the current pins; owner asked what format
to supply. See "Marker asset — what to hand over" at the bottom of this
doc. **Blocked on owner providing the asset/spec.**

**Requirement:** new marker must work as a *map pin at small size* — flat,
crisp at 22–32px, transparent background, ideally one or two flat colours,
and able to carry the states the map already encodes: ranked vs unranked
(currently size 30 vs 22 via `pinFor()`/`golfPinSVG()`), plus the
in-trip / played / want states shown in tooltips/popups. Inline SVG,
consistent with the current `golfPinSVG()` approach.

**Acceptance criteria:**
- [ ] New pin renders sharp on retina at both sizes; no raster blur.
- [ ] Ranked/unranked still visually distinct.
- [ ] Cluster badges (`.mcluster`) restyled to match if needed.
- [ ] Legible on the new basemap (coordinate with GOLF-105).

---

## GOLF-112 — City search: click a result to focus the map · Blocker: NO (strong nice-to-have) · M

**Ask (owner item 2):** searching a city should let you click the result
to fly the map there, not only add it as a trip stop.

**Requirement:** in the unified search geocode results
(`js/trip-ui.js` ~58–124), clicking a place result **pans/zooms the map**
to it. Adding it as a start/free/end stop becomes a secondary explicit
action (e.g. a "+ add stop" button on the row), not the default click.

**Open question (owner):** after focusing, should a temporary marker drop
at the searched place (cleared on next search), or just move the view?
Recommendation: temporary marker + view.

**Acceptance criteria:**
- [ ] Search "St Andrews", click the result → map flies there, no trip
      change.
- [ ] The add-as-stop path still exists and is discoverable.
- [ ] Works in Discover and Itinerary tabs.

---

## GOLF-113 — "Discover by Region" region list must match the selected nation · Blocker: YES · S

**Symptom (owner item 8):** the By-region `<select>` lists every region
globally — "Gauteng" shows while browsing the UK.

**Root cause (found):** `js/trip-ui.js` ~598 builds the options from the
flat `REGIONS` array (`data/config.js` ~25) with no nation filter.

**Requirement:** the region dropdown lists only regions that contain ≥1
course in the currently selected nation. If no nation is selected, either
show all (grouped by nation via `<optgroup>`) or prompt to pick a nation
first — recommendation: `<optgroup>` by nation.

**Implementation note:** region names are already nation-distinct; derive
with `REGIONS.filter(r => C.some((c,i) => C[i].r === r && courseNation(i)
=== state.nation))`, or build a region→nation map once.

**Acceptance criteria:**
- [ ] GB selected → only GB/Scotland/Wales regions in the dropdown.
- [ ] South Africa selected → only SA regions.
- [ ] Switching nation updates the dropdown; a now-invalid selected region
      resets cleanly (no stale filter).

---

## GOLF-114 — Header + nation pills layout · Blocker: YES (looks unfinished) · S–M

**Symptom (owner item 7):** too little space between the header and the
pills; pills are small and don't fill the sidebar or distribute evenly.

**Requirement:**
1. Add vertical breathing room between the "Golf Tripper" header bar and
   the nation pills (design-system spacing token, not a magic number).
2. The pill row spans the full sidebar width; pills share the width
   **evenly and dynamically** — computed from the number of nations
   (`NATIONS.length`), so adding a 4th/5th nation redistributes with no
   code change. CSS grid `grid-template-columns: repeat(N, 1fr)` or
   `flex: 1 1 0` on each pill.
3. Pills large enough to be comfortable tap targets on mobile (≥40px
   high).
4. Long nation labels: wrap or shrink gracefully, don't overflow.

**Acceptance criteria:**
- [ ] 3 pills fill the sidebar edge-to-edge, equal width.
- [ ] Temporarily adding a fake 4th nation → 4 equal pills, no layout
      change needed.
- [ ] Clear gap between header and pills at all pane widths; nothing
      clipped on a 360px-wide screen.

---

## GOLF-115 — Long trip name gets clipped · Blocker: YES · S

**Symptom (owner item 6, screenshot):** a long trip name is truncated
mid-word with no affordance.

**Requirement:** the trip-name control shows the full name via one of:
wrap to 2 lines then ellipsis, ellipsis + `title`/tooltip on hover, or the
field grows. Pick per the design system; must not push the toolbar layout
around. The edit affordance stays reachable.

**Acceptance criteria:**
- [ ] A 60-character trip name is fully readable (inline or on hover) and
      doesn't break the toolbar row.
- [ ] Rename still works; share view shows the full name too.

---

## GOLF-116 — Costs tab: consolidate hotel stays into one line · Blocker: YES (costs are wrong) · M

**Symptom (owner item 5):** a hotel stayed twice / for multiple nights
shows one line per night, so a 2-night stay appears as two lines.

**Target output:** one line per stay —
`Hotel A (R300/night × 2 nights) — R600`.
Hotel items carry `{stayId, nights, price, priceType, guests, …}` — group
the Costs-tab breakdown by `stayId` (fall back to name+coords), sum
`nights`, show `unit × nights = subtotal`.

**Do together with GOLF-100** (per-person column) — same renderer
(`js/trip-ui.js` cart lines ~216–225 / `js/trip-model.js` cost calc).

**Acceptance criteria:**
- [ ] Same hotel across 2 nights / 2 stays → one line with `× N nights`
      and correct subtotal.
- [ ] Different hotels still separate lines.
- [ ] Trip total unchanged in value, only the breakdown is regrouped.
- [ ] Golf and POI lines unaffected.

---

## GOLF-100 (update) — Costs tab: total + per-person columns · Blocker: owner's call · M

Owner wants the Costs tab to show **two columns: total and per-person**
(group size ÷). This is squarely GOLF-100's remit — fold it in rather than
a new ticket. Do alongside GOLF-116. Per-person = whole-trip and per-line
where meaningful, using the existing toolbar group-size control and the
per-room/per-person model from GOLF-74.

---

## GOLF-117 — Research spike: ferry legs · Blocker: NO · research only

**Ask (owner item 10):** ferries are the practical way between Scottish
islands, and open up an Islay→Ireland routing. Spike, not a build.

**Questions to answer:**
- Does the current ORS `driving-car` route via the Worker already traverse
  `route=ferry` ways (OSM tags them; ORS often includes short vehicle
  ferries)? Test Kennacraig–Islay, Oban–Mull, a mainland–Ireland case.
- Can we detect "this leg includes a ferry" from the ORS response and
  surface it (icon, note, rough crossing time)?
- Operators/data: CalMac (Scottish islands), Islay↔Ireland
  (Ballycastle–Port Askaig seasonal). Any free schedule/fare source, or is
  it a static hand-maintained table like green fees?
- Scope of a v1: just *flag* ferry legs and link to the operator, vs
  include crossing time/cost in the trip estimate.

**Deliverable:** a short written recommendation (like GOLF-101), added to
this repo, with a proposed follow-up ticket if worthwhile.

---

## Recommended go-live blocker set

**Block go-live:** GOLF-108, GOLF-109, GOLF-113, GOLF-114, GOLF-115,
GOLF-116 (+ GOLF-100 per-person if owner wants it in v1).

**Ship when ready, not blocking:** GOLF-110 (recommend doing it anyway —
cheap, big declutter), GOLF-111 (needs asset), GOLF-112.

**Post-go-live:** GOLF-117.

---

## Marker asset — what to hand over (answer to owner item 4)

The attached image (a detailed illustrated map-pin with a golf-green
scene) is good as a *silhouette reference* but not usable as the asset: on
a map with dozens–hundreds of pins it must be tiny, crisp, recolourable
and cheap to render. A painted raster illustration fails all four.

**Best:** a **flat SVG**, designed at ~24px, one or two solid colours,
transparent background, a single `<path>` if possible. Ideally a tiny set:
default pin, ranked pin (or just a size step), and optionally an
in-trip/selected variant — or just give one silhouette and let the coding
agent derive states by colour/size as `golfPinSVG()` does today.

**Acceptable alternatives:**
- A one-line description + a reference (e.g. "a rounded teardrop pin with a
  small flag cut out of the centre, single green fill") and the coding
  agent draws the SVG.
- A named icon from an open-licensed set (e.g. a specific Lucide /
  Tabler / Font Awesome Free glyph) — tell us which; we inline it and note
  the licence.

**Avoid:** PNG/JPG, multi-colour gradients/shadows baked into the image,
anything only legible above ~40px.
