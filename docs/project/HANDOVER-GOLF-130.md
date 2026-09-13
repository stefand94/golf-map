# Implementation Task — GOLF-130 (Course marker visual redesign)

**Feature:** GOLF-130 — Replace the ball-on-tee course marker with a
teardrop pin + flag, larger circle, two-state colour (owner-locked
2026-09-13, direction **C** of four mocked-up options)

## Objective

Redesign the course marker `golfPinSVG()` builds (`js/util.js`, consumed by
`pinFor()` in `js/map.js`) from the current ball-on-tee shape (GOLF-111,
shipped 2026-09-08) to a teardrop map-pin with a flag icon, where the pin's
green body reads as a thin border around a large white or yellow circle.

## Context

- GOLF-111 shipped the current design: flat SVG, white ball + dimple hints
  on a coloured tee, `pinFor()` passing `{ranked, tint}`, `pinStateTint()`
  mapping trip state to tee colour.
- Owner (2026-09-13): "the current ball markers don't look as good as I'd
  want them to." Not a first pass — a deliberate revision of GOLF-111. Four
  directions were mocked up; owner picked **C** (teardrop + flag) with
  specific proportion and colour changes below.
- **This also very likely resolves GOLF-127** (wishlisted/anchor course
  still showing the numbered marker + a separate gold ring instead of a
  recoloured pin) — the new yellow-circle state *is* the recoloured-pin
  behaviour GOLF-127 asked for. Once this ships, re-check GOLF-127 against
  the new marker before closing it — don't close it blind, but expect it to
  fall out for free.

## Requirements

### 1. Shape — teardrop pin, circle fills most of it

- Keep the classic map-pin teardrop silhouette (rounded top, tapering to a
  point at the bottom — this is the pin's anchor point on the map, same
  role the tee tip plays today in `pinFor()`).
- The white/yellow circle inside should be **large** — most of the space
  inside the teardrop, leaving only a **thin** ring of the teardrop's own
  colour visible as a border/frame around it. This is a proportion change
  from the mockup, where the circle was noticeably smaller relative to the
  teardrop — make it bigger than that mockup showed.
- The circle stays a true circle (not stretched or clipped to the
  teardrop's outline) — it just doesn't reach every edge of the teardrop
  shape, since the teardrop narrows to a point at the bottom and the circle
  can't follow that taper.
- The flag icon inside the circle **scales with the circle** — bigger
  circle, proportionally bigger flag, same relative size and position
  within it. Don't hold the flag at a fixed pixel size while the circle
  around it grows.

### 2. Colour — exactly two states, not the current four

Replace `pinStateTint()`'s four-way mapping (default/want/in-trip/played →
red/amber/blue/green tee) with a **boolean**:

- **White circle** — the course has no association with the active trip:
  not wishlisted, not added as a stop, not marked played.
- **Yellow circle** — the course is wishlisted, **or** added to the active
  trip as a stop, **or** marked played. Any one of those is enough; there is
  no further distinction between them in colour. Owner (2026-09-13): "If it
  is unselected in any sense it is white. If it has been wishlisted or
  added to an itinerary it is yellow. There are only 2 states."
- The teardrop body itself stays **one colour always** (green — pick a
  shade that reads clearly against both the white and yellow circle; the
  mockup used `#1F7A4D`/`#155C39`, treat that as a starting point not a
  locked hex).

### 3. Remove the itinerary day-order markers entirely

Owner (2026-09-13): remove them, not just leave them untouched. The numbered
marker used in Build/Itinerary mode to show a stop's position in the day
sequence (referred to in `BUGS.md` GOLF-127 as `trip-golf-marker` — the
class `tripShow()` in `js/map.js` applies to a trip stop, separately from
the gold anchor ring GOLF-127 already covers) goes away completely. A trip
stop on the map becomes the same teardrop-pin marker as everywhere else
(yellow circle, since it's added to the trip) — no number overlay, no
separate numbered-marker code path.

**Impact — flagging this so it's a deliberate call, not a surprise:**
sequence (which stop is day 1 vs day 2 vs day 3) will no longer be visible
by looking at the map on its own. It's still fully available in the
Itinerary tab's ordered list, and the drive-route line between stops still
draws in order — but a tester looking only at the map pins can no longer
tell stop order from the pin itself. If `tripShow()`'s numbered marker
carries any other behaviour today (e.g. click-to-jump-to-that-stop in the
itinerary list), either preserve that behaviour on the plain pin or flag it
to the owner rather than dropping it silently — the ask is to remove the
*number*, not necessarily any interaction wired to it.

### 4. Ranked-course treatment — carry forward unchanged

GOLF-111's ranked-course halo + size step (30px vs 22px) is not something
the owner asked to change — carry it forward on the new shape as-is unless
it visibly conflicts with the new proportions, in which case flag it rather
than dropping it silently.

## Acceptance Criteria

- [ ] Every course marker (Discover, Explore, wishlist, course search
      results — wherever `pinFor()`/`golfPinSVG()` is used today) renders as
      a teardrop pin with a large circle and a flag icon, not the old
      ball-on-tee.
- [ ] The circle occupies most of the teardrop's interior width; the
      teardrop's own colour shows only as a thin border around it.
- [ ] The circle is visibly circular at every marker size the app uses
      (ranked vs unranked), not stretched or egg-shaped.
- [ ] The flag scales visibly with the circle — check it side-by-side at
      the ranked (larger) and unranked (smaller) sizes and confirm the flag
      isn't a fixed size that looks too small or too large at one of them.
- [ ] A course with no trip association renders a **white** circle.
- [ ] A wishlisted course, a course added as a trip stop, and a course
      marked played all render a **yellow** circle — verify all three
      individually.
- [ ] A course that is, say, wishlisted **and** added as a stop still just
      renders yellow (no third colour, no visual difference from the
      single-condition case).
- [ ] Ranked courses keep their existing size bump + halo treatment on the
      new shape.
- [ ] A trip stop on the map shows no day-order number — it renders as the
      plain (yellow, since it's in the trip) teardrop pin like any other
      selected course.
- [ ] Stop sequence is still correctly readable from the Itinerary tab's
      list and from the drive-route line order — only the on-pin number is
      gone, nothing else about sequencing broke.
- [ ] `node scripts/check_js.js` passes (marker code touches `js/util.js`,
      `js/map.js`; check `js/trip-share.js`/`js/explore.js` for any other
      direct consumer of the old shape).
- [ ] No console errors; no marker renders blank/broken at any zoom level
      the app currently supports.

## Edge Cases

- The `.mcluster` cluster badge (restyled to match the ball-on-tee in
  GOLF-111) needs a look — decide whether it should visually echo the new
  teardrop/circle or stay a simple numbered badge; not specified by the
  owner, use judgement and flag the choice in the PR.
- Popups, tooltips, and the mobile list view that reference the marker
  colour/state (if any do) should be checked for any hardcoded assumption
  about four states rather than two.
- The `#share=` read-only view (`js/trip-share.js`) uses the same marker
  function — confirm it picks up the new shape/colours too, since it's a
  separate Leaflet instance from the main map.

## Dependencies

- None blocking. Independent of GOLF-129/35/102 (hosting) and GOLF-98/120
  (fee data).
- **Relates to GOLF-127** — see Context. Re-verify GOLF-127's reported bug
  against the new marker before closing it.

## Out of Scope

- Any further "played" vs "in trip" vs "wishlisted" distinction — explicitly
  rejected by the owner (2026-09-13): two states only.
- Hotel/POI markers — this ticket is course markers only.
- Any change to marker *behaviour* (click targets, popups, clustering
  logic) — visual only.

## Constraints

- No build step, no framework change — same flat inline SVG approach as
  GOLF-111 (no gradients; the existing house style).
- Files that change: `js/util.js` (`golfPinSVG()`), `js/map.js` (`pinFor()`,
  `pinStateTint()`, and `tripShow()` for the day-order marker removal),
  possibly `js/trip-share.js` if it has its own copy of any of this rather
  than reusing the shared functions.

## Implementation Guidance

- `pinStateTint()` collapses from a 4-way switch to a 2-way one — this
  should shrink code, not grow it.
- The mockup shown to the owner (direction C) used a `path` teardrop with a
  white circle roughly 40% of the teardrop's width; the owner wants that
  circle noticeably larger — treat the mockup as shape reference only, not
  final proportions.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

## Product-owner tasks

- **O1** — Merged to `main` 2026-09-13 (`8137da5`). Sanity-check the look on
  production: circle size, flag scale at both marker sizes, white vs yellow
  on a real wishlist + a real trip stop, and the `.mcluster` cluster-badge
  call the dev flagged (left as a plain numbered circle — confirm or
  override). Confirmation, not an open design review — shape and two-state
  colour are locked.
- **O2** — Re-check GOLF-127 against the shipped marker (see Context) and
  say whether it can close.

## Definition of Done

- All acceptance criteria satisfied.
- Owner has signed off the look on production (O1).
- `node scripts/check_js.js` passes; no visual regression in clustering,
  popups, or the shared-trip view.
- GOLF-127 re-checked (O2) and closed or kept open with a reason.
