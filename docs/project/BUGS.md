# Bug list — minor / polish

_Small defects and visual regressions that don't warrant a full backlog
discovery cycle. Continue the `GOLF-nnn` sequence. Promote to `BACKLOG.md`
if one turns out to be non-trivial. Newest at the bottom of each priority
group._

| ID | Area | Bug | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| GOLF-123 | Course card / popup | **"FROM HOME 5961 mi, as the crow flies"** straight-line distance is shown on every course card and needs to be removed. It's a raw great-circle distance from a hard-coded home location — meaningless to the user, and wrong-looking (thousands of miles). Remove the row/label entirely from the course card + popup render. If a "from home" figure is ever wanted it should be driving distance and opt-in — out of scope here, just delete the crow-flies one. | P2 | FIXED | Removed the row from both render sites — the `<dt>From home</dt>` line in `popupHTML()` (js/map.js) and the `X mi from home` span in the course card (js/explore.js). `distMiles()` (js/util.js) had no other caller and is deleted; `distOut()` stays (the "distance" sort still uses it). No "from home" figure now; a real driving-distance one would be a separate opt-in feature. |
| GOLF-124 | Map pins | New golf-ball-on-a-tee pins (GOLF-111) render correctly when you first focus a location, but as soon as you **add a course to the trip** the affected markers revert to the old default pin look. They should keep the new pin style in every state (default / in-trip / played / want). Likely the `render()` `setIcon` path after a trip mutation rebuilds the marker with the pre-GOLF-111 icon instead of `pinFor()` / `golfPinSVG()`. | P2 | FIXED | Root cause wasn't `setIcon` — once the trip is non-empty `render()` (js/explore.js) deliberately skips the whole main marker layer to declutter, and the discovery-candidate dots that replace it (`tripShow()`, js/trip-geo.js) were bare `L.circleMarker`s. Fix: `tripShow()` now draws each candidate with `pinFor(i)` — same golf-ball pin, size step, gold halo and in-trip/played/want tee tint as the Explore layer; out-of-radius candidates just fade to 0.5 opacity; the anchor keeps a gold ring behind its pin. Numbered itinerary route stops (⛳ day badges) unchanged. |

## Recently fixed (one line each — prune quarterly)

- **GOLF-123** (2026-09-08) — removed the meaningless "X mi from home, as the crow flies" row from the course card and popup (raw great-circle distance from a hard-coded home point).
- **GOLF-124** (2026-09-08) — nearby-course map pins kept the GOLF-111 golf-ball style after a course is added to the trip (`tripShow()` now uses `pinFor()` instead of plain circle dots).
