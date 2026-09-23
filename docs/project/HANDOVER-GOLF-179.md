# Implementation Task

**Feature:** GOLF-179: Stop overlapping pins on the trip map
**Status:** READY (owner approved 2026-09-23)
**Priority:** P3 (visual polish, no data affected; BA's call)

## Objective

When the trip map is zoomed out, hotel and POI icons can sit on top of a course pin, or on top of each other, and disappear. The owner's example is Portrush, where the hotel icon is hidden under the course flag. Every icon should stay visible and readable. Where needed, an icon is moved clear and gets a line back to its real location.

## Scope

- The trip map in build mode, which is visible on both the **Itinerary** and **Costs** tabs.
- The read-only `#share=` view's map. This is a BA assumption, because it draws the same stops; confirm it with the BA if it turns out to be a separate path.

## Requirements

1. **Courses never move.** Course pins always sit on their exact location.
2. If a hotel or POI icon would overlap a course pin or another icon, it is moved just clear of the overlap. A thin line connects it to its exact location.
3. **Priority:** hotels are placed before POIs. When space is tight, a hotel gets the nearer position and the POI is moved.
4. A moved icon stays visibly near its real spot, no more than about two icon-widths away. If it can't be placed within that distance, it is hidden. **POIs are hidden before hotels, and courses are never hidden.**
5. When the map is zoomed in far enough that nothing overlaps, every icon sits on its exact location with no line.
6. The layout recalculates after zooming or panning, and when stops are added, removed or moved between days.
7. A moved icon behaves exactly as it does today when tapped or hovered: same popup, same content.
8. Drive route lines still start and end at the **real** location, not at the moved icon.

## Acceptance criteria

- [ ] Portrush-type case: a hotel next to a course, zoomed out. The course pin is where it is today, and the hotel icon sits beside it, fully visible, with a line to its real spot.
- [ ] Zoom in on the same case until they no longer overlap. The hotel sits on its real spot and there is no line.
- [ ] A hotel and a POI both next to one course. The hotel is closer and the POI is further out, both with lines.
- [ ] Around one course, crowd more stops than fit within about two icon-widths. POIs disappear first, then hotels, and the course is never hidden. Zooming in brings them all back.
- [ ] Two courses overlapping each other look exactly as they do today.
- [ ] Tapping a moved icon opens the same popup as before.
- [ ] The route line still meets the real location of each stop.
- [ ] Behaviour is the same on the Itinerary tab, the Costs tab and the shared view.
- [ ] The map works at phone width, and panning and zooming don't flicker or stutter on a trip of about 10 days.
- [ ] There are no console errors.
- [ ] `test_data.js`, `check_js.js`, `test_course_ids.js`, `test_fee_v2.js` and `test_currency.js` all pass.
- [ ] Send before and after screenshots of the Portrush case to the BA, and get sign-off before going live.

## Out of scope

- The Discover map, including its hotel search and POI layers.
- Courses overlapping each other. These stay as they are today, by the owner's decision.
- Any indicator counting how many icons are hidden. Hidden stops still appear in the Itinerary list.
- Any change to what is on the map. This ticket only changes where icons are drawn.

## Constraints

- Zero-build, global-scope scripts, following the existing Leaflet patterns.
- Do not touch the owner's browser localStorage. His trip data is live.
- **The working tree contains GOLF-162's uncommitted files (parked):** `scripts/fetch_*_golf_clubs.py`, `scripts/fetch_dotgolf_clubs.py`, `scripts/diff_dotgolf_rewrite.py`, `scripts/README.md`, `docs/country-onboarding.md`. Do not commit, delete or revert them. Stage only your own files.
- If GOLF-178 is in progress at the same time, coordinate: both touch the build-mode UI.

## Definition of done

All acceptance criteria are met, the map behaves as before when zoomed in, all five scripts pass, and the owner has seen the after screenshots.

> The coding agent should inspect the existing codebase and follow established project patterns before introducing new architecture.
