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

**Resolved (owner 2026-09-07):** build it as a **"show nearby courses"
toggle**, but **default it to ON** for now (owner may flip the default
later without code change).

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

## GOLF-110 — Hide the nearest-railway-station feature · Blocker: recommend YES (declutter) · S · STATUS: CLOSED ✅

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
- [x] No rail/station toggles, lines, dots, labels or link lines anywhere
      (main map + shared view) at any zoom.
- [x] No course popup/tooltip shows rail info; no "undefined" left behind.
- [x] Flipping the flag back to `true` restores today's behaviour.
- [x] `check_js.js` passes.

**DONE / CLOSED (2026-09-08, branch `golf-114-110-uxpass` → `main`):** added a single
`const RAIL_FEATURE=false;` at the top of `js/map.js`. With it off: the
rail-polyline build loop and the station-dot build loop are skipped
entirely (`railPolys`/`stnDots` stay empty), `restyleRail()` early-returns
and its `zoomend` binding is not attached, `drawLink()` clears `linkLayer`
and returns before drawing the dashed course→station line, the `<dt>By
rail</dt>` row in `popupHTML()` is gated out, and the `t-rail`/`t-lbl`/
`t-stn` toggle wiring in `js/explore.js` is gated (the buttons themselves
already sit in the always-`display:none` retired `.filters` block).
`courseTooltipHTML()` had no rail line to remove (it shows fee + rank only).
`data/stations.js`, `data/rail-geometry.js`, every `nearStation` field and
all the rail functions are untouched — setting the flag to `true` restores
the previous behaviour in full. Verified in-browser: 0 rail/station layers
render at z13 over London, no "By rail" in popups, `drawLink()` a no-op.
`check_js.js` + `test_data.js` pass.

---

## GOLF-111 — Course marker redesign · Blocker: NO (nice-to-have) · S · STATUS: DONE ✅

**DONE / CLOSED (2026-09-08):** `golfPinSVG()` rebuilt in `js/util.js`
(not `js/map.js` — it moved there earlier) from the owner's reference PNG
(2026-09-08): flat inline SVG, white ball with a few dimple hints,
coloured tee, `#23303A` outline, `drop-shadow` filter, no gradients.
`pinFor()` (`js/map.js`) now sets `iconAnchor` at the tee tip
(bottom-centre) and passes `{ranked, tint}`. Ranked keeps the 30-vs-22
size step plus a gold halo ring; `pinStateTint()` colours the tee
in-trip → `#2E5C8A` / played → `#2E8B45` / want → `#B98900`, default red
`#D14A3A`, and the icon refreshes live via the `setIcon` loop already in
`render()`. `.mcluster` badge restyled to white fill / dark ring / ink
count, heavier ring for the bigger tiers. `tooltipAnchor` added so the
hover card still clears the taller marker. Verified: `check_js.js` +
`test_data.js` pass; all 8 size×state SVGs render correct in a browser
harness; no console errors.

**Ask (owner item 4):** replace the current pins.

**Design intent (owner 2026-09-07):** a **golf ball on a tee**.

**Requirement:** implement it as a **flat inline SVG** (NOT a raster
image — see "Marker asset" note at the bottom), replacing `golfPinSVG()`
in `js/map.js`. Design at ~24px so it stays crisp and legible as a small
map pin over the new basemap (GOLF-105). Must still carry the states the
map encodes today: ranked vs unranked (currently size 30 vs 22 via
`pinFor()`), plus in-trip / played / want (via colour or a small accent,
as now). A subtle drop/anchor shadow so it reads as a pin is fine; no
baked-in gradients. Restyle the cluster badge (`.mcluster`) to match if
needed.

**Note:** a starter SVG can be produced in a design pass if the owner
wants a concrete shape to react to; otherwise the coding agent draws it
from this description.

**Acceptance criteria:**
- [x] New pin renders sharp on retina at both sizes; no raster blur.
- [x] Ranked/unranked still visually distinct (size step + gold halo).
- [x] In-trip / played / want still visually distinct (tee colour).
- [x] Pin tip sits on the course coordinate (anchor at tee tip).
- [x] Cluster badges (`.mcluster`) restyled to match.
- [ ] Legible on the new basemap — recheck when GOLF-105 lands (drawn
      against current OSM tiles for now; white ball + dark outline is a
      deliberately basemap-agnostic choice).

---

## GOLF-112 — City search: click a result to focus the map · Blocker: NO (strong nice-to-have) · M · STATUS: CLOSED ✅

**DONE / CLOSED (2026-09-08, branch `golf-116-100-112` → `main`):** the
place-name in the unified search results is now a link (`.tb-unified-place-focus`)
that flies the map (`tbFocusPlaceOnMap()` in `js/map.js`) and drops a
temporary 📍 marker — cleared on the next search, the next manual pan/zoom,
or Escape. No trip stop is added. "Add to trip" / "Start a trip here"
stays as a separate primary button on the row. The click also moves
`tbPlaceAnchor` + `tbDiscoveryTab='anchor'` so Discover's "Nearby" list
re-scopes to the focused place (fix landed after owner review: without it
the list stayed pinned to the last course added). geocode-403 graceful
degradation untouched. Works in Discover and Itinerary. Link underline
dropped (hover-only) per owner feedback.

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

## GOLF-113 — "Discover by Region" region list must match the selected nation · Blocker: YES · S · STATUS: CLOSED ✅

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
- [x] GB selected → only GB/Scotland/Wales regions in the dropdown.
- [x] South Africa selected → only SA regions.
- [x] Switching nation updates the dropdown; a now-invalid selected region
      resets cleanly (no stale filter).

**DONE / CLOSED (2026-09-07, branch `golf-113-115-uxpass` → `main`):** new
`tbRegionsForNation()` + `tbRegionOptionsHTML()` in `js/trip-ui.js` build the
`#tb-region` options from `REGIONS.filter(r => C.some((c,i) => C[i].r === r &&
courseNation(i) === state.nation))`. With no nation selected the list is
grouped by nation via `<optgroup>`. The nation-pill click handler clears
`tbRegion` when it is no longer valid for the newly selected nation, so no
stale region filter lingers. Verified in-browser: GB → 25 options, no
Gauteng; South Africa → 6 SA regions; ZA→GB with "Gauteng" selected resets
`tbRegion` to `''` while a still-valid region survives.

---

## GOLF-114 — Header + nation pills layout · Blocker: YES (looks unfinished) · S–M · STATUS: CLOSED ✅

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
- [x] 3 pills fill the sidebar edge-to-edge, equal width.
- [x] Temporarily adding a fake 4th nation → 4 equal pills, no layout
      change needed.
- [x] Clear gap between header and pills at all pane widths; nothing
      clipped on a 360px-wide screen.

**DONE / CLOSED (2026-09-08, branch `golf-114-110-uxpass` → `main`):** `.nation-pills`
is now `display:grid; grid-template-columns:repeat(var(--nation-count,3),1fr)`
with `gap:var(--sp-2)` and `padding:var(--sp-6) var(--sp-5) var(--sp-2)` —
`--sp-6` (24px) top is the header→pills breathing room, `--sp-5` sides match
the navbar/toolbar gutter so the row spans the full sidebar. `--nation-count`
is written inline (`style="--nation-count:${NATIONS.length}"`) by
`tbNationPillsHTML()` in `js/trip-ui.js`, so adding a nation to `NATIONS`
redistributes the row with zero CSS change. Each `.nation-pill` is a centred
flexbox with `min-height:var(--tap)` (44px ≥ 40), reduced horizontal padding,
`min-width:0` and `overflow-wrap:break-word` so long labels wrap instead of
overflowing; grid keeps all pills equal height. Verified: 3 equal pills
edge-to-edge, a temporary 4th nation → 4 equal pills (equal height with a
wrapped long label), 24px visible gap under the "Golf Tripper" masthead, and
nothing clipped at a 360px viewport. `check_js.js` + `test_data.js` pass.

---

## GOLF-115 — Long trip name gets clipped · Blocker: YES · S · STATUS: CLOSED ✅

**Symptom (owner item 6, screenshot):** a long trip name is truncated
mid-word with no affordance.

**Requirement:** the trip-name control shows the full name via one of:
wrap to 2 lines then ellipsis, ellipsis + `title`/tooltip on hover, or the
field grows. Pick per the design system; must not push the toolbar layout
around. The edit affordance stays reachable.

**Acceptance criteria:**
- [x] A 60-character trip name is fully readable (inline or on hover) and
      doesn't break the toolbar row.
- [x] Rename still works; share view shows the full name too.

**DONE / CLOSED (2026-09-07, branch `golf-113-115-uxpass` → `main`):** the
trip-menu `<summary>` in `tbTripMenuHTML()` (`js/trip-model.js`) wraps the
name in a `.tb-drop-label` span that ellipsises inside the fixed toolbar
cell (`.tb-toolbar > * { flex:1 1 0; min-width:0 }` keeps the row from
growing) and carries the full name as a `title` tooltip. The shared-trip
payload now carries `nm` (`js/trip-share.js`, length-capped like every other
field) and `renderSharedTrip()` shows it in the wordmark in place of
"Shared trip". Verified in-browser: a 61-char name is fully present + on
hover, toolbar width unchanged, shared view shows the full name.

---

## GOLF-116 — Costs tab: consolidate hotel stays into one line · Blocker: YES (costs are wrong) · M · STATUS: CLOSED ✅

**DONE / CLOSED (2026-09-08, branch `golf-116-100-112` → `main`):**
`tripCostLineItems()` (`js/trip-ui.js`) now groups hotel night-items by
`stayId` (fallback `name + lat/lng` to 3dp) into one row —
`Hotel A (£300/night × 2 nights) — £600`. Grand total is unchanged
(the consolidated amount is the sum of the same per-night `det.total`
values that were previously separate rows). Golf/POI lines untouched.
Owner reviewed — "the other 2 [116/100] are working, will need tweaking
down the line."

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

## GOLF-100 (update) — Costs tab: total + per-person columns · Blocker: YES (in go-live scope, owner 2026-09-07) · M · STATUS: CLOSED ✅

**DONE / CLOSED (2026-09-08, branch `golf-116-100-112` → `main`):** a
per-person figure (`.cost-pp`, "£X pp") now renders under every amount in
the Costs tab — line rows, category headers, fuel, grand total — shown
only when group size > 1, driven by the existing toolbar group-size
control. **GOLF-74 open question resolved from the code:** GOLF-91
replaced GOLF-74's per-room model with per-person-per-night × whole-trip
group size, and every cost line divides cleanly by group size, so
per-person = line total ÷ group size uniformly (no special per-room
path). Documented in PR #2. Owner reviewed — working, minor tweaks
expected later.

---

Owner wants the Costs tab to show **two columns: total and per-person**
(group size ÷). This is squarely GOLF-100's remit — fold it in rather than
a new ticket. Do alongside GOLF-116. Per-person = whole-trip and per-line
where meaningful, using the existing toolbar group-size control and the
per-room/per-person model from GOLF-74.

---

## GOLF-117 — Research spike: ferry legs · Blocker: NO · research only · STATUS: CLOSED ✅

**DONE 2026-09-08** — full write-up in `GOLF-117-ferry-spike.md`. TL;DR:
ORS `driving-car` already routes over `route=ferry` ways (verified live —
Islay, Mull, Cairnryan work; Arran doesn't) but inconsistently and with no
timetable awareness. Ferry legs become detectable by adding
`extra_info:["waytypes"]` (code 9 = ferry) to the Worker's directions call
— small change. No free CalMac API (only TNDS TransXChange XML); Kintyre
Express (Islay↔Ireland) is passenger-only + seasonal; Port Ellen closed
2026–29. Recommendation: **flag-only v1** (glyph + "check sailing times" +
operator link from a curated `data/ferries.js`), no timetable/fare
integration until date selection exists. Follow-up ticket **GOLF-118**
(P3, post-go-live) raised.


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
