# GOLF-185 — Mobile redesign: map-first with a bottom sheet

_Status: **READY** (2026-09-23), **P1**, and on the GOLF-180 go-public
checklist: it must land before the site goes public. All owner questions
answered 2026-09-23. Decision record: DEC-027._

## Problem

Owner, 2026-09-23: the mobile UI "is unintuitive and masks all the cool
functionality". UI review at 375 px found:

1. List and map are never on screen together (full-screen list ↔ map
   toggle). The map — the product's best asset — starts hidden.
2. First screen is pure chrome: no course anywhere.
3. The map is empty until a nation is picked (GOLF-81 gate), but the
   nation pills live on the list side, so "Show map" first shows a bare map.
4. Picking a nation changes nothing visible on the list side.
5. "+ Add to trip" in a map popup zooms right into that one course, every
   other pin disappears, and there is no confirmation.
6. The course filters (price, ranked, access, architect, weekend) are
   unreachable on **every** viewport — they lived on the Explore panel
   retired by DEC-002 and are `display:none` since.
7. Polish: tabs at the top, out of thumb reach; 3-line map attribution;
   the layers button covers the popup; the popup holds 9 actions; "+
   Wishlist" vs "+ Add to trip" for the same action; the floating pill still
   covers text; search results carry no price.

## Target experience (owner-approved direction)

- Full-screen map on phones, with a draggable **bottom sheet** holding what
  the pane holds today. Three resting heights: **peek** (one-line summary),
  **half** (lists, map still visible above), **full** (Itinerary / Costs).
- **Bottom tab bar**: Discover / Itinerary / Costs.
- **Search floats over the map**, with a **filter icon** beside it.
- **First-visit country card** over the map: semi-transparent frosted
  ("glass") background; choosing a country rolls/fades the card away and
  the map moves to that country with its pins showing.
- **Current look kept**: same colour tokens, fonts and component styles. This
  changes layout and interaction, not the brand.

## Split

| ID | Piece | Depends on |
| --- | --- | --- |
| GOLF-185a | Bottom sheet + bottom tab bar (the base layer) | — |
| GOLF-185b | Course card in the sheet + add-to-trip that stays on the map | 185a |
| GOLF-185c | First-visit country card | 185a |
| GOLF-185d | Filter panel behind an icon (all viewports) | a slot for the icon from 185a; otherwise parallel |
| GOLF-185e | Polish: one add label, compact attribution, layers-button clash, fee in search results | 185a |

Built on branch `mobile-sheet`, reviewed by the owner on its Cloudflare
preview URL on a real phone, then merged to `main` in one go (one DEC-011
trip wipe, not five). 185d is the one piece suited to a second worktree.

## Requirements and acceptance criteria

"Phone" = viewport ≤ 900 px wide (the existing mobile breakpoint), checked
at 375 × 812 and 430 × 932. "Desktop" = > 900 px.

### GOLF-185a — Bottom sheet + tab bar

- [ ] On a phone the map fills the screen at all times in Plan and Build
      mode; the list ↔ map toggle ("Show map / Show list") no longer exists.
- [ ] A sheet sits over the map with three resting heights: peek, half,
      full. The user can drag it between them, and tapping its handle
      moves it up one height.
- [ ] Peek shows a one-line summary (nation, courses in view or trip
      size, trip total).
- [ ] Discover opens the sheet at half, Itinerary and Costs at full. The
      user can still drag it anywhere afterwards.
- [ ] Discover / Itinerary / Costs are in a bar at the bottom of the
      screen, within thumb reach. The top-of-pane segmented control is
      gone on phones.
- [ ] The trip name menu, share and the cost badge stay reachable.
      Group size is reachable from the trip menu or the sheet (dev's
      choice); nothing that exists today is lost.
- [ ] Scrolling a list inside the sheet scrolls the list, not the sheet,
      until the list is at its top.
- [ ] No content is permanently hidden behind the tab bar or any floating
      control at any sheet height (the GOLF-136 class of bug).
- [ ] The map stays usable (pan, zoom, pin tap) in the visible area above
      the sheet at peek and half.
- [ ] Respects the iPhone home-indicator safe area.
- [ ] Desktop layout is unchanged.

### GOLF-185b — Course card + add-to-trip

- [ ] On a phone, tapping a course pin shows that course in the sheet
      (not a Leaflet popup over the map): name, region, access, green fee,
      Top 100 rank where present, and one prominent "Add to trip" button.
- [ ] Every action the popup offers today (website, phone, handicap
      calculator, mark played, want to play, correct this, set as anchor)
      is still reachable from the card, behind a secondary "More"
      control.
- [ ] Adding a course keeps the map where it is: no zoom-in, other pins
      stay visible.
- [ ] A brief confirmation appears ("Added · View trip"); "View trip"
      goes to the Itinerary tab.
- [ ] After an add, the Discover nearby suggestions are visible without a
      mode switch, and they are visibly highlighted on the map as well
      (owner, 2026-09-23).
- [ ] Nothing in a card renders as "undefined" for courses with missing
      fields.

### GOLF-185c — First-visit country card

- [ ] When no nation has been chosen, a card over the map asks where the
      user is playing, with Great Britain, Ireland and South Africa.
- [ ] The card has a semi-transparent frosted-glass background; the map
      is visible, blurred, behind it.
- [ ] Choosing a country makes the card roll/fade away, and the map fits
      that nation's visible courses on screen with their pins showing
      (GOLF-184's fit behaviour, see Dependencies).
- [ ] Once a nation is chosen, the card does not reappear on reload. The
      nation can still be changed from a small control on screen.
- [ ] With "reduce motion" switched on, the card simply disappears (no
      roll animation).
- [ ] Shared (`#share=`) links never show the card.

### GOLF-185d — Filter panel (all viewports)

- [ ] A filter icon next to the search opens a filter panel with price
      range, ranked / Top 100, access type, architect and "playable at
      weekends". These are the filters that exist in the code today; no
      new filters.
- [ ] Applying filters changes which course pins show on the map and
      which courses appear in Discover lists and search results, so the
      map and the lists always agree (owner, 2026-09-23).
- [ ] While any filter is active, the icon shows it (e.g. a dot or a
      count), and the panel has a one-tap "Clear filters".
- [ ] Filters persist on reload, as they already do in `localStorage`.
- [ ] Works on desktop as well as phones (it is unreachable on both today).
- [ ] No quick-filter chips on the main screen; the filters live behind
      the icon only (owner, 2026-09-23).

### GOLF-185e — Polish

- [ ] The add action is labelled "Add to trip" everywhere (buttons in the
      popup/card, search results, Nearby lists). Renaming the "Your
      wishlist" section is renamed under GOLF-190 (trip = shortlist + itinerary).
- [ ] Map attribution is compact on phones (e.g. collapsed behind an ⓘ),
      still present and legible when opened (licence obligation).
- [ ] No map control overlaps the course card or the country card.
- [ ] Course search results show the green fee alongside the region.

## Edge cases

- **DEC-011 wipe:** every deploy clears `localStorage`, so every
  returning user sees the country card again after each deploy. Accepted
  as a consequence of DEC-011 unless the owner says otherwise.
- **Stale filters:** filter state is already persisted, but invisible
  today. A browser that saved filters under old Explore may be silently
  hiding courses right now. The active-filter indicator (185d) is the
  fix; the DEC-011 wipe on merge also clears them.
- **Landscape phone / short screens:** the half height must still leave a
  usable strip of map; full must not cover the tab bar.
- **Keyboard open** (search focused): the sheet and tab bar must not jump
  over the results or the input.
- **Shared view** (`#share=`) is a separate read-only page and is out of
  scope; it must be unaffected.
- **Tablet (768–900 px):** gets the phone layout (the existing
  breakpoint). Check it once; don't design for it separately.

## Dependencies

- **GOLF-184** (P1 bug, READY, Dev 2; ships with GOLF-182/183): fixes the
  mobile map landing too zoomed-in. Keep it. It is live-production pain now,
  and 185 is weeks away. 185c reuses its "fit the nation on screen"
  behaviour. Its AC (3) ("after opening and closing the map toggle")
  becomes moot once 185a removes the toggle, and that's fine.
- **Branch `claude/lucid-lumiere-1c4943`** (GOLF-182/183, touching
  `js/trip-route.js` and `js/trip-share.js`) should merge before `mobile-sheet`
  is cut. Low overlap, but it avoids a rebase.
- **GOLF-162**'s uncommitted script changes sit in the main checkout. The
  branch must be cut from a clean tree so they are not swept in.
- **GOLF-180:** added to the go-public checklist as a must-land item
  (owner, 2026-09-23).

## Out of scope

- Visual rebrand (colours, fonts): kept as is.
- The read-only shared view.
- Any change to what pins show in which tab (GOLF-108/109 rules stand).
- New filters, or filter chips on the main screen.
- GOLF-143 map-engine work.
- Desktop layout, except the filter icon (185d).

## Owner answers (2026-09-23)

1. Priority **P1**, and it must land before going public (added to GOLF-180).
2. Filters narrow map pins, Discover lists **and** search.
3. After an add, nearby suggestions are listed in the sheet **and**
   highlighted on the map.
4. One label: **"Add to trip"**.
