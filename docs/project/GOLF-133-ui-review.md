# GOLF-133 — General UI review pass (proposals)

_Consultant-style UI pass across Plan/Build/Costs, desktop + 375px mobile,
done 2026-09-13 against `main` (`b80cca5`) via the local static preview.
Scope was owner-undefined ("give it a look" — see BACKLOG.md GOLF-133 row),
so this pass covers the full app rather than one sweep area. Findings are
ranked by how much they'd embarrass the app in front of a real tester, not
by effort. **Nothing here is built yet** — this is Phase 1 (evaluate +
propose). Owner picks which items become tickets in Phase 2._

## How to read this

Each finding has a **severity**, what's wrong, why it matters, and a
proposed fix. Severities:

- **P0 — confirmed defect.** Verified in code, not just eyeballed. Should
  ship regardless of the rest of this list.
- **P1 — confirmed defect, lower blast radius.**
- **P2 — judgement call.** Real, but arguable; needs an owner decision.
- **P3 — polish / nice-to-have.**

---

## P0 — Every course photo and club logo is broken, sitewide

**What:** Open any course popup with a photo or logo (e.g. Yelverton,
`data/courses-top100.js`) and both images render as the browser's broken-
image icon. Verified via `javascript_tool`: the rendered `<img src>` is
literally `#`, not the real path.

**Root cause (confirmed in code):** `escUrl()` (`js/util.js:80-83`)
allowlists only `https?:`, `mailto:`, `/`, and `#` — anything else is
replaced with `#`. But every `photo.src` and `logo` value in every
`data/*.js` file is a bare relative path with no leading slash
(`images/courses/yelverton.jpg`, `images/clubs/*.jpg` — confirmed across
all five nation files, ~260 photos / 71 logos). None of them ever match
the allowlist, so `escUrl()` silently kills every one, in production, not
just this local preview.

**Why it matters:** This is the single most visible thing in the app —
course photos are the hero content of every popup — and it's been dark
site-wide since whenever `photo`/`logo` fields were added. A tester's
first course click shows a broken-image glyph instead of the course.

**Proposed fix:** One-line change to `escUrl()`'s regex to also allow bare
relative paths (e.g. add an alternative matching `^[\w.\-]` for same-origin
relative URLs), or prefix every `photo.src`/`logo` value with `/` at the
data layer and extend the allowlist's `/` case to also match without a
leading slash. Either way, this is small — the risk was never the fix,
it's that the images have apparently never rendered in real use and this
went unnoticed. Worth `grep`-confirming no other field (course `site`,
`sourceUrl`) has the same relative-path pattern before treating this as
fully scoped.

---

## P1 — Adding your first course zooms the map to near-blank grey tiles

**What:** Wishlist/add a single course to a fresh trip, then switch to the
Itinerary or Costs tab. The map jumps to zoom **19** (confirmed via
`map.getZoom()`) centred tight on that one course — at that zoom the Esri
tile layer has little to no coverage outside towns, so the map renders as
mostly blank grey with the pin pushed toward an edge. Looks broken, not
just "very zoomed in."

**Root cause:** Every `fitBounds()` call site (`js/trip-route.js`,
`js/trip-ui.js`, `js/trip-geo.js`) passes only a `padding` option, no
`maxZoom`. Leaflet's `fitBounds()` on a single-point (zero-area) box zooms
to the layer's max by default. Notably, `js/trip-share.js:236` already
guards against exactly this (`if(pts.length>1) m.fitBounds(...)`) — the
shared read-only view was evidently patched for this, but the main app's
several `fitBounds()` call sites weren't.

**Why it matters:** This is the very first thing a new trip looks like —
add one course, and the map that's supposed to sell the trip goes blank.

**Proposed fix:** Add `maxZoom` (something in the 13–14 range, town-level)
to the `fitBounds()` options at each call site, matching the existing
single-point special case already proven out in `trip-share.js`.

---

## P2 — Mobile Costs tab: floating "Show map" button overlaps body copy

**What:** At 375px (Costs tab, scrolled to the bottom), the fixed/sticky
"Show map" pill sits directly on top of the last two lines of the currency
disclaimer ("...planned for a future update — for now amounts display in
each course's own local currency"). The text is unreadable at any scroll
position — the button doesn't move, so there's no way to read it on a
phone.

**Why it matters:** Small, but it's exactly the kind of thing a beta
tester on their phone screenshots and reports as "your app is broken,"
and it's on the Costs tab — one of the three core tabs.

**Proposed fix:** Add bottom padding/margin to the scrollable content
equal to the pill button's height (+ safe margin) whenever it's visible,
or move the pill to not overlap scrollable text (e.g. anchor above the
tab bar instead of floating over content).

---

## P2 — "Border" field is a bare number input with no visible unit

**What:** By-region search shows a plain `Border` label next to a number
input (default `8`). The only explanation of what it does ("include
courses just outside the region, within this many miles of its edge") is
a hover-only `title` tooltip — invisible on touch devices, which is most
of this app's likely usage.

**Why it matters:** A tester on mobile has no way to discover what this
field means or what unit it's in; worst case they assume it's broken or
ignore it.

**Proposed fix:** Either put the unit inline in the visible label
("Border (mi)") or add a short static caption under the field, in
addition to (not instead of) the existing tooltip for desktop.

---

## P3 — "+ Wishlist" immediately schedules a real, costed itinerary day

**What:** Clicking "+ Wishlist" on a By-region result (`tbSelect()` →
`tbAddToWishlist()` in code) adds the course to the trip set. But the
first course added to an otherwise-empty trip shows up in the Itinerary
tab as a fully scheduled "Day 1" stop (drag handle, "···" menu, "Add
stay"/"Add stop" actions) with its green fee already counted into the
Costs tab total — not as a distinct, unscheduled "wishlist pool" item.

**Why it matters:** This may well be intentional (a single-course trip
auto-materializing into a day is a reasonable shortcut), but the button
is explicitly labelled "Wishlist," which sets an expectation of "save
this for later, don't commit it to a day yet." Whether that gap matters
depends on how the owner wants "wishlist" and "itinerary" to relate — it's
a product question, not something to fix blind.

**Proposed fix:** Not proposing a code change here — flagging for an
owner call: is "wishlist item auto-becomes Day 1 the moment your trip has
one course" the intended model, or should a wishlisted course stay
unscheduled until explicitly dragged/added to a day?

---

## P3 — `.mcluster` cluster badge still an open call from GOLF-130

Carried forward, not re-litigated: GOLF-130's O1 left the marker cluster
badge as a plain numbered circle rather than echoing the new teardrop/
circle pin style, and it was never explicitly confirmed or overridden.
Since this review pass exists precisely to catch "does everything still
look right together" after GOLF-130/127/129 landed close together, it
belongs in this list rather than staying a loose end. No proposal beyond
"decide: keep as-is, or restyle to match the new pin."

---

## P3 — Overall visual language is competent but generic

**What:** The chrome (white cards, navy/blue pill buttons, gray body text,
Manrope) is clean and consistent, and nothing here is broken — but nothing
in the UI's own styling (empty states, header, panel chrome) gives it a
distinct personality tied to golf or travel. Empty states ("Nothing on
your wishlist yet," "No courses in that region yet — pick one above") are
plain single-line gray text with no visual weight.

**Why it matters:** Lowest priority on this list by design — this is a
"nice to have before real strangers see it" item, not a defect. Flagging
because the ticket was framed as a pre-go-live sanity check and a
consultant pass would be incomplete without naming it.

**Proposed fix (if picked up):** Not urgent enough to spec in detail here;
if the owner wants to invest, the highest-leverage single change would be
the empty states (wishlist, region-not-picked, no-results) since those are
what a first-time visitor sees before any data is on screen.

---

## Suggested next step

Owner picks which of the above become real tickets (P0/P1 are the ones
worth doing regardless; P2/P3 are calls). Once triaged, split into
GOLF-13x tickets the normal way rather than building off this doc
directly.
