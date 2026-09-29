# GOLF-207 to 209: map pills, country at the top, country as a focus

_Owner, 2026-09-29, after reviewing the `mobile-sheet` preview. Decisions
recorded as DEC-033. All three build on `mobile-sheet` and ship in the same
release as GOLF-185 (one DEC-011 wipe)._

| Ticket | What | Dev | Order |
| --- | --- | --- | --- |
| GOLF-207 | Itinerary: pills replace the second filter icon; new POIs map layer | Gavin | now |
| GOLF-208 | Desktop pane order: name → countries → tabs → search → pills; group size and £ total move to Itinerary | Barry | now, in parallel |
| GOLF-209 | Country is a focus, not a wall (GB ↔ Ireland near the border) | Geoff | **sizing only**, after GOLF-198 merges |

**Shared file:** 207 and 208 both touch the toolbar block of
`renderTripBuilder()` in `js/trip-ui.js` (~line 1310–1345). Barry lands 208's
layout first. Gavin builds 207's POI layer (poi.js / map) in parallel, then
pulls Barry's push before he wires the pills into the toolbar. Tell each other
before you push.

---

## GOLF-207 — Itinerary: pills for Hotels / Courses / POIs, no second filter icon

**P2 · Gavin.**

**Owner:** the second filter icon in Itinerary isn't needed. Replace it with
pills — "Hotels", "Courses", "POIs". Each pill turns on or off the things
that are **not** in the trip. So selecting "POIs" shows all the POIs nearby;
unselecting it leaves only the POIs added to the trip.

**Today (Itinerary toolbar):** course-filters icon · "Hotels" (nearby hotels
layer) · "Nearby courses" · a second filter icon holding *Everything / Golf
only / Stays only / Stops only* and *Drive times* on/off.

**Plan:**
- Remove the second filter icon and its menu (`#tb-filter-drop`,
  `tbItinFilter`, `tbDriveToggle`). What's in the trip is always shown, and
  drive legs are always drawn.
- The Itinerary toolbar becomes: course-filters icon · **Hotels** · **Courses** · **POIs**.
  - **Hotels:** the existing nearby-hotels layer (`tbHotelLayerOn`), unchanged.
  - **Courses:** the existing "Nearby courses" toggle (`tbShowNearby`), renamed. Behaviour unchanged.
  - **POIs:** new. Shows nearby POIs (not in the trip) on the map, from the
    GOLF-148 data in `js/poi.js`. It works like the Hotels layer: it follows the map view as you pan and zoom,
    and needs a zoom level before pins appear, so the map isn't flooded. Loads the region
    file(s) the view touches (the lazy loader already exists; never precache
    region files). It shows the best-ranked ones in view (`poiRank()`), with
    a sensible cap. Uses the group icons/colours already in `POI_GROUPS`.
    Tapping a POI pin gives a popup with name, kind and "Add to Day N" (the same add
    path as the per-day "Things to see" list).
- POIs already in the trip keep showing whatever the pill says. The
  per-day "Things to see" link in each day stays as it is.
- All three pills: same look as the existing pills (✓ when on), and they work at
  375 px without wrapping to a second row (use the short labels if needed).

**AC:**
1. Itinerary has no second filter icon. The toolbar reads: filters icon, Hotels, Courses, POIs.
   On a 375 px phone they fit on one row.
2. Hotels and Courses behave exactly as the old Hotels and Nearby pills did.
3. POIs on, zoomed into a trip area: POI pins show in view, and panning refreshes them. Off: only
   POIs already in the trip remain. Zoomed out too far: a short hint, no flood.
4. Adding a POI from its pin puts it in the right day and it stays visible when
   the pill is off.
5. Drive legs are always drawn. Golf, hotels and stops in the trip are always
   listed. Nothing depended on the removed filter (check the Costs tab and
   share view).
6. No region file in `sw.js` PRECACHE_URLS. No console errors, no
   "undefined". Inputs ≥ 16 px on phone (GOLF-200).

**Judgement calls to list:** the zoom threshold, the cap per view, whether a
POI pill state is remembered across reloads.

---

## GOLF-208 — Desktop pane order: country at the top, group size and £ to Itinerary

**P2 · Barry.** Reopens GOLF-204's desktop half.

**Owner:** country is the top-level choice, above Discover/Itinerary/Costs.
Move group size and the £ total to the Itinerary view. The pane then reads:
trip name → countries → search → pills (Show hotels, plus a new Show POIs).

**Plan (desktop, > 900 px):**
- Pane order: **header** (trip name ▾, share, clear, Beta) → **country pills**
  (GB / Ireland / South Africa) → **tabs** (Discover / Itinerary / Costs) →
  tab content.
- Country pills show on **all three tabs**, not only Discover. What a pick does
  on Itinerary/Costs is set out in GOLF-209. Until then, a pick on those tabs
  refocuses the map and search on that country and leaves you on the tab. The trip is untouched.
- **Discover** content: search bar → pills row: course-filters icon · Show hotels
  · **Show POIs** (the same layer and state as GOLF-207's POIs pill; Gavin
  provides it. Leave a slot and wire it when he pushes).
- **Group size stepper and the £ total pill leave the header** and move to
  Itinerary, the same as the phone already does (185a additions). Costs keeps
  its own per-person/total view.
- The phone is unchanged: the country chip already sits at the top beside search,
  and group size is already in Itinerary. Only add the Show POIs pill to the
  phone's Discover row.

**AC:**
1. Desktop Discover reads top to bottom: name/actions → countries → tabs →
   search → [filters] Show hotels · Show POIs → lists.
2. Countries are visible and working on Itinerary and Costs too.
3. No group size or £ pill in the desktop header or Discover. Itinerary shows
   both. Changing group size there still updates Costs, the £ badge and every
   per-person figure.
4. Phone at 375 × 812 is unchanged, apart from the Show POIs pill.
5. No console errors, no "undefined". Three scripts pass.

---

## GOLF-209 — Country as a focus, not a wall (GB ↔ Ireland)

**P3 · Geoff · sizing first, don't build.**

**Owner:** GB and Ireland are closely linked. The country choice should act as
a focus point, not a hard filter. If a trip moves into an area where you can
cross over, the nearby courses etc. should include Ireland. "If that is a
massive change, then leave things as is for now."

**Ask:** find out how big this is, and report before building anything:
- Where does the nation filter bite today? List the places: `courseShownOnMap()`,
  Nearby courses, search, By region, auto-plan `bookable()`, hotels, POIs.
- The simplest version that meets the owner's intent. For example: Nearby and the
  Itinerary map layers ignore the country and just use distance from the
  trip's stops/route, while Discover lists and search keep the country as a
  default focus. What breaks?
- Ferry legs (GOLF-118) already let a trip cross the Irish Sea. Does a GB trip
  with a Stranraer/Holyhead day then see Irish courses?
- Estimate: small (≤ a day, few files) / medium / large. Say which parts are risky.

**AC:** a short written report to the BA with the list, the proposed version and
the estimate. No code pushed.
