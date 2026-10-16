# GOLF-252 to 268: UX review requirements (DEC-040)

_Moved here from `design/ux-review-requirements.md` by the BA, 2026-10-16. Assets stay in `design/svg-proposals/`.
Each bundle's bullets are its acceptance criteria._

| Bundle | Ticket | Dev | Bundle | Ticket | Dev |
|---|---|---|---|---|---|
| B0 | GOLF-252 | Barry | B8 | GOLF-260 | Barry |
| B1 | GOLF-253 | Gavin | B9 | GOLF-261 | Gavin |
| B2 | GOLF-254 | Geoff | B10 | GOLF-262 | Gavin |
| B3 | GOLF-255 | Barry | B11 | GOLF-263 | Geoff |
| B4 | GOLF-256 | Barry | B12 | GOLF-264 | Barry |
| B5 | GOLF-257 | Geoff | B13 | GOLF-265 | Geoff |
| B6 | GOLF-258 | Gavin | B14 | GOLF-266 | Barry (sweep; everyone rolling) |
| B7 | GOLF-259 | Gavin | B3 desktop pane / B13 CTA | GOLF-267 / GOLF-268 | Barry / Geoff |

**Lanes:** Gavin 253 → 258 → 259 → 261 → 262 (sole owner of `js/trip-ui.js` and `js/trip-model.js`).
Geoff 254 → 257 → 263 → 265 → 268. Barry 252 → 264 → 260 → 255 → 256 → 267 (if quick) → 266.
Barry starts 255 and 256 only once 253 and 254 are live.


Source: UX review 2026-10-15 (https://claude.ai/artifact/SbE2cgzh38sBaoDFXnrsL6) + Stefan's decisions 2026-10-16.
Rule from Stefan: everything in the review is in scope unless listed under "Stefan's exclusions/changes".
Grouped into **single-pass bundles**: one dev, one pass, P1 + matching P2/P3 in the same files together.
Ranked by bundle order. Sev: P1 broken/misleading · P2 friction · P3 polish. Effort S <1h · M ~1 day · L design job.
All decisions are now settled (see the end of this file).

## Stefan's exclusions / changes (already decided)
- Shared-link "Copy this trip / Plan your own" CTA: do it, **low priority** (not top-12).
- Price display: **keep "Up to £X"** (fair upper estimate). Make it consistent everywhere. **No new price fetch.**
- Costs: **£0 rows stay**. **Remove fuel** from the Costs tab and total (drive times stay on itinerary).
- Filters "Area" chips (25, London-first): **leave as is**.
- Country gate: **glass panel on desktop AND phone**, no "Just looking" link. Map behind defaults to a GB+Ireland view.
- Shared-link previews: OK to put the **trip name only** in the server-visible part of the URL (query) for OG tags.
- Growth ideas logged as IDEA GOLF-269 (yardage-book direction), 270 (map/list hover linking), 271 (desktop "trip strip"). Ready-made trips are not logged: cancelled as GOLF-189 (DEC-035).
- High priority called out: emoji marker replacement, fit-to-trip glyph, search & add flow, desktop map attribution.

## Bundle order (recommended)
0 → 1 → 2 → (3, 4, 5 in parallel) → (6+7 same dev) → (8, 9, 10, 11, 12 in parallel) → 13 → 14.
File clash warning: bundles B6, B7, B9, B10 all live in `js/trip-ui.js` + `index.html` CSS — same dev or strictly serial.

---

### B0 — Legacy CSS/markup cleanup (do first, de-risks everything) · P2 · S–M · no decision
- Problem: dead Explore-era CSS/markup still ships and causes cascade bugs + duplicate controls (hidden legacy "Filters" button).
- Change: delete `.filters .list .card .chip .togg .btn2 #q #sort cart-* fee-slider` rules and hidden markup (`index.html` ~1792–1857) after grep confirms no live references.
- Files: `index.html`, `scripts/check_js.js` still passes.

### B1 — Shared price formatter (prereq for B3, B4, B6, B9) · P2 · S–M · no decision
- Problem: same course shows different prices per surface (Kingsbarns £486 search vs £443 shortlist); "£3690" no separator; POA/blank inconsistent.
- Change: one `fmtGreenFee(i)` used by popup, phone card, search rows, nearby list, shortlist, itinerary rows, costs. Output "Up to £X" (upper of wd/we/structured fee, same source field everywhere); "Price on request" for POA; "No published fee" when empty. All money via one `fmtMoney()` with `toLocaleString('en-GB')` (£3,690).
- Files: `js/util.js` (new helpers), callers in `js/map.js`, `js/trip-ui.js`, `js/trip-add.js`, `js/explore.js`, `js/trip-share.js`. No data changes.

### B2 — Map markers & colour system (HIGH, P1) · L · no decision
Assets: `design/svg-proposals/` (art agent, in progress) — markers, clusters, fit icon, `templates.js` reference.
- P1 Remove Finchley Road HOME marker (`js/map.js:564`, `HOME` `js/state.js:440`); distance-out sort measures from trip start point else map centre.
- P1 Numbered day pins: scheduled trip course = teardrop in day colour with white day number; unscheduled shortlist = green + white ring.
- P1 Untangle yellow: ranked = gold star badge (no halo); played = tick badge; want = heart badge (see B3 decision); no fill changes for state.
- P1 New 8-colour day palette replacing `TRIP_DAY_COLORS` (`js/trip-route.js:61`, `js/trip-share.js:470`) — away from green/navy/gold; no repeat until day 9.
- P1 (HIGH) Replace emoji markers (`tbEmojiIcon`: hotel/POI stops, 📍 search pin) with SVG teardrop-family stay / things-to-see / place pins; redesign start/end pins to match.
- P1 Hover tooltips: close on `popupopen`; never bind when `matchMedia('(hover:none)')`. (stuck "Walton Heath · Up to £275" bug)
- P2 Tap targets: pad marker hit area to 44px (transparent iconSize, SVG centred).
- P3 Clusters: course-green fill, white count, sizes 30/36/44, gold dot if contains a trip course.
- P3 (HIGH per Stefan) Fit-to-trip: SVG frame icon replacing "⤢", rounded like layers button; `fitBounds` padding ≥48px, extra on the pane/sheet side.
- P3 Drop access-colour flag inside pins (access moves to popup chip, B3).
- P3 Unscheduled "suggested order" route: dashed, weight 2.5, 50% opacity (currently solid `#1B2733`).
- P3 POIs: filled category circles with white outline + small glyph; legend in the POI status pill (`js/poi.js:350,448`).
- Files: `js/util.js` (`pinShapeSVG` family), `js/map.js`, `js/trip-route.js`, `js/poi.js`, `js/trip-geo.js`, `js/trip-share.js`, `js/state.js`, `index.html` CSS.

### B3 — Course popup + phone course card (one pass) · P2 · M · decided
Depends on B1.
- Order: name → "Up to £X" → one-line summary + access chip → **Add to trip** (full width, first) → quiet icon row (website, phone, directions) → "More" menu (Mark played, Want to play, Set as anchor, Correct this).
- "Club website" no longer a black filled button. Handicap calculator moved out of popup.
- Phone: `tel:` link on phone number; price shown once (no double POA); access ("Application/invitation only") as chip next to name in collapsed state; secondary actions as 44px rows; description stays in one position.
- Phone: tapped pin pans above the card and is highlighted (1.25× + white ring); card sized to content (no blank ~200px), animate transform not height.
- Desktop: popup slimmed (order + buttons above, no handicap calc). Close button ≥32px; no 10px uppercase subhead wrap. **Course detail in the side pane is PARKED pending a PoC (Stefan) — not part of B3.**
- "Want to play": KEEP as a life list — heart badge (B2) + its own filter (B11).
- Files: `js/map.js` (`popupHTML`), `js/mobile-sheet.js` (`.bs-card`), `index.html` (`.leaflet-popup-content` 1488, card CSS).

### B4 — Search & add flow (HIGH, "main interaction") · P1/P2 · M · no decision
Depends on B1; B2 for map highlight pins.
- P1 No reflow under cursor: reserve town-heading row height while geocoder loads.
- P1 Added rows stay put, button becomes "✓ Added" with Undo (no row removal → no accidental double-add).
- P2 Row action = outlined circular "+" (44px hit), not a column of filled navy pills; names not underlined, no ⛳ emoji, 15px semibold; price right-aligned.
- P3 Geocoder noise: drop place hits with <~3 courses within 15mi when a strong match exists (Hornchurch, St Andrews Bristol…); normalise "St." → "St".
- P3 One label everywhere for the town action: "Add as a day" (desktop says "Start a trip here").
- P3 Town hit fits map to its courses and pulses pins; hovering a result highlights its pin.
- P3 Toasts: bottom-left of map area on desktop, above the tab bar on phone (not over pane Add buttons).
- P3 Phone: search focus closes an open course card (or results get a solid backdrop).
- Files: `js/search*.js`/`js/trip-add.js` (unified search), `js/map.js`, toast helper, `index.html` CSS.

### B5 — First load / glass country panel / map frame · P2 (attribution HIGH) · M–L · no decision
Assets: country outlines from `design/svg-proposals/countries/`.
- Frosted-glass panel over the live map (default view GB+Ireland) on desktop and phone: wordmark, one-line promise, three country cards (outline + name + course count). No "Just looking". Fallback: solid frosted fill where `backdrop-filter` is unsupported/slow. Replaces `.mob-gate` (`js/mobile-sheet.js:84`).
- On country pick, `fitBounds` to that nation's shown courses after layout (Scotland currently cut off).
- (HIGH) Desktop attribution collapses behind the ⓘ button (reuse phone pattern) when map < ~600px wide.
- Pane width `clamp(400px,42vw,640px)` instead of `minmax(480px,680px)` (`index.html:171`); drag-resizable on desktop.
- Files: `js/mobile-sheet.js`, `js/app-mode.js`/`js/map.js` (init + fit), `index.html`.

### B6 — Itinerary layout + chronological order (one pass) · P2 · L · decided
- P2 Chrome above Day 1 (~530px desktop / ~255px phone): hide nation pills in build mode; group size + List/Calendar + Add start in one row; sticky compact toolbar on scroll.
- P2 Day card compaction: one "+ Add" per day → menu (stay, course, stop, cost, activity); "Where are you staying?" single-line prompt, shown only where a stay is missing. Add a "Compact" toggle collapsing days to one line (Day 3 · Carnoustie · 1h 9m · £450) — decided yes.
- P2 **Chronological order (Stefan):** list view renders every item in `items[]` order, **including the day's hotel** (today `tripDayStay()` pins the first hotel into the bottom "Where are you staying?" slot, `js/trip-ui.js:396`); adding a stop lets you choose position (before/after an existing row) or inserts by time when it has one (today `d.items.push` always appends, `js/trip-model.js:291,354`).
- P3 "Staying near X" vs empty stay prompt: "Suggested base: St Andrews · find hotels" until a stay is picked; carry base across consecutive days ≤~30 min apart.
- P3 Day colour (from B2 palette) on day-card dot/top edge and as a **straight 3px left bar on rows** (Stefan liked this) — replaces the curved `inset box-shadow` bracket (`.tb-item-golf`, `index.html:499`), on Discover shortlist rows too (unscheduled = neutral).
- P3 Text/spacing: gap after 🏨 (→ icon in B14), drive caption ≥12px, drop "· live" (`js/trip-ui.js:297`), hide day total when it repeats the single row's price, two left edges only.
- P3 Reset pane scroll on tab change (or remember per tab).
- P2 Trash/"Clear trip" moves into the trip-title menu as "Delete trip…" (red), not next to Share.
- Files: `js/trip-ui.js`, `js/trip-model.js`, `js/trip-add.js`, `index.html`.

### B7 — Drag & drop (same dev as B6, after it) · P1/P2 · M · no decision
- P1 "⋯ Move to" menu: flip up when no room, max-height viewport−16px with inner scroll, items labelled "Day 4 · Gleneagles", focus ring `--accent` (was orange).
- P2 On drag start collapse all day cards to headers (~48px) so every day is on screen; drop slot shows coloured line + "Day 4 · Gleneagles"; expand on drop.
- P3 Whole day header is the day drag target; item grips get a 44px hit column; desktop item grips show on hover.
- P3 Touch shim (`js/touch-dnd.js`): hold 500→350–400ms; visible lift (scale 1.02 + shadow) when hold completes (vibrate does nothing on iOS). Keep the rest.
- Files: `js/trip-model.js` (~594–740), `js/trip-ui.js` (~1540–1680), `js/touch-dnd.js`, `index.html`.

### B8 — Calendar · P2 · M · no decision
- P2 Help text margin bug: `.hint` (`index.html:1547`) overrides `.tl-howto` (939) → fix specificity.
- P2 Block content: "09:00–14:00", price, access chip; hour height ~44px so a day fits a laptop.
- P2 Phone: one day at a time with a day switcher; grid is the only scroller (no nested scroll in the sheet); visible "+" instead of long-press-on-empty to add.
- P3 Legend shows only kinds present in the trip, darker swatch + icon.
- P3 Verify arrive-by buffer: Day 2 drive ends exactly at 09:00 tee time, no 45-min golf buffer visible (`js/timeline.js`). Bug or display issue — investigate first.
- Files: `js/timeline-ui.js`, `js/timeline.js`, `index.html`; `node scripts/test_timeline.js`.

### B9 — Costs · P1 · S–M · no decision
- P1 Banner contrast: `.cost-est` / `.cost-est-note` (`index.html:806–807`) grey on navy 1.2–1.8:1 → `rgba(255,255,255,.72)` inside `.cost-banner`.
- P2 Remove fuel line and its contribution to the total; "estimate" caveat then driven only by typical-rate green fees.
- P2 Footnote built from counts ("All 6 green fees are published rates" / "4 of 6 confirmed; 2 are typical rates") — current text contradicts itself.
- P3 Phone: hide sheet-header £ pill on Costs tab; drop "Showing cost per person" label; floating search/country chip consistent across tabs.
- £0 rows stay (Stefan).
- Files: `js/trip-ui.js` (~800–900 costs), `index.html`.

### B10 — Discover lists / shortlist · P3 · S · no decision
- One heading (drop duplicate "Shortlist · 6 courses" title); light ✕ that darkens on hover (or into ⋯).
- "Suggested order (nearest-neighbour)" → "Suggested order: shortest driving"; split dense summary into 3 labelled stats.
- "0.0 mi · ~5 min drive" → "Same club"/"Next door" under 0.5 mi.
- Files: `js/trip-ui.js`, `js/explore.js`.

### B11 — Filters, hotels, POIs · P2/P3 · M · no decision
- P2 Desktop filter drawer opens over the pane (left), map stays visible/undimmed so pins thin live.
- P3 Price: chips + synced slider; Min/Max boxes behind "Custom".
- P3 Layer status pill actionable: "Zoom in to see hotels ›" zooms to 12; "Couldn't load · Retry". (Check hotel failure on production first — it failed from localhost.)
- P3 Labels "Hotels" / "Things to see" on both platforms (not "Show POIs"/"POIs"); same selected style as filters (B14).
- Area chips: unchanged.
- **Want to play filter (DEC-040):** a filter that shows only courses marked Want to play. Uses the same selected style as the other filters.
- Files: `js/course-filters.js`, `js/poi.js`, hotel layer module, `index.html`.

### B12 — Phone chrome & tap targets · P2 · M · decided
- P2 Top-of-map controls (8 controls, 4 shapes): Feedback into sheet ⋯ menu; layers/fit/locate in one rounded right column. Drop +/− zoom on phone (pinch only) — decided.
- P2 `min-height:var(--tap)` on `.tb-btn` etc. on phone (share/clear 36, chips 36, Add 97×36, filter 44×36, card links 26).
- P3 Sheet header contextual: Discover "129 courses in view"; Itinerary "6 days · 6 courses" (no truncation).
- Files: `js/mobile-sheet.js`, `index.html`.

### B13 — Shared link · P2/P3 · M · no decision (CTA low priority)
- P2 Link preview "Golf Tripper – {trip name}": trip name in query string (e.g. `?t=`), `functions/_middleware.js` injects OG/Twitter title/description (+ static OG image). Trip data stays in the hash. (Stefan OK'd.)
- P3 Compress payload (deflate + base64url via CompressionStream), versioned so existing `#share=` links still decode; target ~400–600 chars (now 2,190). Must pass `test_state_persist.js`/share tests.
- P3 Phone header stacks title above actions; numbered day dots (B2); attribution behind ⓘ; always open in List view; space after 📸; wordmark at top.
- Low priority, split out as **GOLF-268**: sticky footer "Copy to my trips" / "Plan your own trip".
- Files: `js/trip-share.js`, `functions/_middleware.js`.

### B14 — Visual system, site-wide (rolling; apply as each bundle touches a surface, plus one sweep) · P2 · L · no decision
- Selected states: two only — segmented (white-on-grey) for exclusive views, filled navy chip for toggles/filters; drop ✓ prefixes and outlined variants.
- Shape roles: primary actions 10px-radius rectangles, chips pills, icon buttons circles.
- Icons: one 1.75px stroke set (Lucide/Tabler, MIT, inlined like `SHARE_ICON_SVG`) replacing UI emoji ⛳ 🏨 🚗 📍 💷 📸 🖨️.
- Type: 12px floor for anything read; 10–11px badges only; one card padding (16px), one content indent.
- Brand: simple mark (24px) + 17px wordmark; Beta as small plain text.
- Files: `index.html` CSS + every renderer.

## SVG assets — ready (2026-10-16)
`design/svg-proposals/` — `index.html` preview sheet, `README.md` (iconSize/iconAnchor: 22×33→[11,32], 30×45→[15,44], discs centre-anchored), `templates.js` reference generators.
Design calls made (devs follow these):
- Day palette slot 7 changed #15803D → **#4D7C0F** (green read as a course pin). All 8 day colours ≥4.9:1 for the white numeral.
- Badges = ink disc with white rim: ranked star right shoulder; played tick / want heart left shoulder (played wins if both).
- Start/end stay round discs (keeps GOLF-243 intent); end gets a chequered flag. All pins get a thin white under-rim for satellite.
- Drink POI colour → **#9A6512** (4.95:1) instead of #B7791F (3.64:1).
- Scheduled stay/see stops take their **day colour**, like course pins.
- Cluster sizes **30/36/44** (code currently 30/36/42 — move to 44 for the tap target).
- Course counts for the glass panel cards: GB 370 · Ireland 83 · South Africa 107 (shown on map). Northern Ireland courses carry `topIreland` → counted under Ireland; GB outline = England, Scotland, Wales. Devs should compute counts at runtime, not hard-code.

## Stefan's decisions on the open items (2026-10-16)
1. "Want to play": **keep** as a life list (heart badge + own filter). (B3)
2. Itinerary "Compact" one-line-per-day **toggle: add it**. (B6)
3. Phone +/− zoom buttons: **drop them** (pinch only). (B12)
4. Desktop course detail in the side pane: **approved 2026-10-16 from the mock** (https://claude.ai/artifact/VuPQJf3QghRpjn1FMz1oKe) → **GOLF-267**, built by Barry in the same pass as B3. Pin → slim popup (name, "Up to £X", Add, Details); Details or a list row → full course in the pane; "‹ Discover"/Esc → back to the list at its old scroll position, row highlighted; prev/next arrows; selected pin highlighted. B3's "Desktop: popup slimmed…" bullet is delivered by this.

## Not tested (devs should verify)
Real iPhone (safe areas, keyboard + sheet), native desktop DnD, hotel picker live (failed from localhost), widths ≥1440px.
