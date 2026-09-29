# GOLF-199 to 204: owner phone feedback, 2026-09-29

_Owner, 2026-09-29, from the live site (`golftripper.uk`) on an iPhone. Eight items.
Answers to the BA's questions are recorded as DEC-032._

The screenshots were taken on **live**, not on the unreleased mobile redesign
(`mobile-sheet`). Items 2, 3 and 6 are already the redesign's direction, so they
become amendments to GOLF-185a/b/c (see `GOLF-185-mobile-redesign.md`,
"Owner phone feedback 2026-09-29"). The rest are new tickets.

| Owner item | Where it went | Dev |
| --- | --- | --- |
| 1 Page zooms in when the search is tapped | GOLF-200 | Geoff |
| 2 Search on the map; Discover/Itinerary/Costs buttons at the bottom | GOLF-185a (built; confirm on phone) | Barry |
| 3 Compact course card with "Show more" | GOLF-185b (AC amended) | Barry |
| 4 Brora's card opens, the page scrolls, the card closes | GOLF-201 | Barry |
| 5 "Auto schedule" button spills over | GOLF-202 | Geoff (moved from Gavin) |
| 6 Map on the home page; search hidden until a country is picked; group size out of Discover | GOLF-185a/c (AC amended) | Barry |
| 7 Costs: "Other" category, fuel moves in, custom costs | GOLF-203 | Gavin |
| 8 Country before search | GOLF-204 (desktop) + GOLF-185c (phone) | Geoff / Barry |

## Order of work (parallel where it can be)

1. **Now, in parallel:**
   - **Geoff**: GOLF-199, the integration merge. This comes first because everything else builds on it.
   - **Gavin**: GOLF-203, on a new branch `golf-203-other-costs` cut from `golf-190-shortlist` @ `33255fe`. It touches the Costs code only, which `mobile-sheet` barely changes.
   - **Barry**: GOLF-201. Reproduce and diagnose it on live and on the `mobile-sheet` preview. **Do not push to `mobile-sheet` until Geoff says 199 has landed.**
2. **After 199 lands** (everyone pulls `mobile-sheet`):
   - **Barry**: 185a fixes (group size, duplicate £0), then 185b with 201's fix, then 185c with 204's phone half.
   - **Geoff**: GOLF-200, then GOLF-204 (desktop).
   - **Gavin**: merge `golf-203-other-costs` into `mobile-sheet`, then GOLF-202.
3. The BA checks each ticket on the `mobile-sheet` preview, and the owner reviews it on a phone. There is one release merge to `main` on the owner's go-ahead (DEC-011 wipes trips once).

Rules for every dev: don't mint IDs, don't edit `docs/project/`, never push to `main`, and report ticket by ticket with your judgement calls listed. Run the three scripts in CLAUDE.md before reporting. Check for no console errors and no "undefined".

---

## GOLF-199 — Integration merge: `golf-190-shortlist` into `mobile-sheet`

**P1 · Geoff.** Owner go-ahead 2026-09-29 (DEC-032).

**Why:** three branches rewrite the same files (`js/trip-ui.js`, `js/map.js`, `london-golf-map-v5_1.html`). All of `golf-190-shortlist` is BA-checked (186, 187, 188, 190, 191 desktop, 192, 193, 194, 197, 185d). Merge it once now, so new work builds on one base.

**Plan:**
- Work in a **fresh worktree**, not the main checkout (that has uncommitted GOLF-162 script changes that must not be swept in).
- Merge `origin/golf-190-shortlist` (@ `33255fe` or later) into `mobile-sheet` (@ `82fe2fd`). `golf-188-things-to-see` is already inside it.
- Resolve conflicts. On a phone, `mobile-sheet`'s layout wins; on desktop, `golf-190-shortlist`'s behaviour wins.
- Let the sw.js hook bump CACHE_NAME, push `mobile-sheet`, and tell the BA and Barry the commit and build (`APP_VERSION`).

**AC:**
1. `mobile-sheet` contains every commit from `golf-190-shortlist`. `main` is untouched.
2. The three scripts pass. No console errors on load, at desktop or 375 × 812.
3. The four known risk spots work after the merge. Check them yourself and list the result for each:
   - (a) the 186 hotel picker on a phone. The old layout jumped to the map, but it must now open in the sheet.
   - (b) 187's phone tap from a search result to the course card. That fix keyed off the old `mob-list` class, which 185a removed.
   - (c) 185d's filter icon and panel at ≤ 900 px. 185d hid `.mob-toggle`, which no longer exists.
   - (d) trip fits use `mapFitTrip` / `mapFitDay` / `mapHoldCamera` (js/map.js) with `animate:false`. An animated fit gets swallowed.
4. Desktop behaves as it did on `golf-190-shortlist`, and a phone behaves as it did on `mobile-sheet`, plus the merged features.

---

## GOLF-200 — iPhone zooms in when an input is tapped

**P1 bug · Geoff · after 199.**

**Owner:** tapping the search box zooms the page in. The page stays zoomed, including on the map, until you pinch back out.

**Cause (BA):** iOS Safari zooms into any focused input whose font size is under 16 px. On live, the search box is 13.5 px. On `mobile-sheet` the search box is already 16 px, but other inputs may still be smaller: trip name, day place, hotel name/price/nights, the filter panel, and 203's new inputs.

**Plan:** make every text `input`, `select` and `textarea` at least 16 px at ≤ 900 px wide. **Do not** fix it with `maximum-scale=1` or `user-scalable=no` in the viewport meta, because that blocks pinch-zoom for people who need it (accessibility).

**AC:**
1. At 375 × 812, every visible input, select and textarea computes to font-size ≥ 16 px. Include the ones inside the sheet, the hotel form, the trip menu, the filter panel and Costs.
2. On an iPhone (the owner checks), tapping the search box, a hotel field or a custom-cost field does not zoom the page.
3. Pinch-zoom still works.
4. Desktop sizes are unchanged.

---

## GOLF-201 — A course card opens, the page scrolls, then the card closes (Brora)

**P1 bug · Barry.** Diagnose now, fix after 199 inside 185b.

**Owner (live, iPhone, video):** tapping Brora opens its card, the page scrolls up to fit it, then the card disappears. Screenshots at 08:31/08:32 show Brora near the top of the screen, with a clustered "2" pin nearby.

**Likely cause (unconfirmed; the dev confirms):** the popup auto-pans the map to fit. The pan fires `moveend`, and something re-renders or re-clusters the markers, which removes the marker that owns the open popup. Suspects: the Nearby/Discover re-render on map move, and the cluster refresh.

**Plan:**
- Reproduce it on live at 375 × 812 with Brora and any pin near the top edge. Find what closes the popup.
- 185b replaces the phone popup with a card in the sheet, so the phone symptom may go with it. **Still fix the cause**, because desktop popups and the sheet card can be hit by the same re-render.

**AC:**
1. On a phone, tapping Brora (and any pin within 60 px of the top edge, or next to a cluster) opens its card, and the card stays open until the user closes it or taps elsewhere.
2. The same on desktop with the popup.
3. Panning or zooming the map while a card is open doesn't close it, unless the course leaves the view.
4. Report the cause in one line.

---

## GOLF-202 — "Auto schedule" button spills over

**P3 bug · Gavin · after 203.**

**Owner:** in Itinerary on a phone, the "Auto schedule ▾" button overflows its pill, and the text and chevron run past the edge. It sits next to "+ Add a day". The label has a "▾" in the text **and** a second chevron (the `<details>`/`<summary>` marker), so it shows two arrows.

**AC:**
1. At 375, 430 and desktop widths, "+ Add a day" and "Auto schedule" sit side by side (or stack neatly), and neither overflows or clips its text.
2. Only one chevron is shown.
3. The menu still opens and works.

---

## GOLF-203 — Costs: an "Other" category, with fuel and custom costs

**P2 · Gavin.** Branch `golf-203-other-costs` from `golf-190-shortlist` @ `33255fe`, which is merged into `mobile-sheet` after 199.

**Owner:** "As a user I want to add car rental, public transport, caddie fees and so on to the budget."

**Requirements:**
- The Costs tab gets a new category, **Other**, alongside the existing ones (golf, hotels and so on). Fuel moves out of wherever it sits now and into Other. The fuel on/off toggle (`tbIncludeFuel`) is kept and still defaults as it does today.
- Under Other, **"+ Add a cost"** adds a line with:
  - a free-text label, placeholder e.g. "Car hire", max 80 characters like hotel names;
  - an amount;
  - a **per person / whole group** switch (owner, DEC-032). Costs shows the right figure in both its Per person and Total views, using group size, the way hotels do today (193).
- Each line can be edited and removed. Remove goes through 194's "Removed X · Undo".
- Custom costs belong to the trip (not a day). They are saved with it (multi-trip snapshot), count in the trip total, the £ badge and the Itinerary "Trip total", and appear in shared (`#share=`) links, read-only.
- **Currency:** use the currency the Costs tab already totals in (GOLF-169). If the trip mixes currencies, add a small currency picker on the line, defaulting to the trip's first nation. That's the dev's call, so list it as a judgement call.
- Amounts the user types are not estimates, so they carry no "~" (193's rule is that only estimates are marked).

**AC:**
1. Costs shows an Other category containing Fuel (with its toggle) and any custom lines. With no custom lines and fuel off, it shows "+ Add a cost" and doesn't look broken.
2. Adding "Car hire", £300, whole group, with a group of 4 shows £300 in Total and £75 in Per person. "Caddie", £50, per person shows £200 in Total and £50 in Per person.
3. The trip total (Costs, the Itinerary card and the £ badge) includes them.
4. They survive reload, switching trips and back, and Undo after remove.
5. A share link made after adding them shows them in the shared view, read-only, with the same totals. **Links made before this change still open unchanged.** Encode the field as optional; don't change the meaning of existing fields.
6. The label is escaped: `<b>x</b>` shows as text. No "undefined", and no NaN with an empty or non-numeric amount (an empty amount counts as 0, or the line isn't saved until it has one; dev's call).
7. Works at 375 × 812 inside the sheet, with inputs ≥ 16 px (GOLF-200).

---

## GOLF-204 — Country before search in Discover

**P2 · desktop: Geoff, after 200 · phone: Barry, inside 185c.**

**Owner:** you pick a country first and then search, so the page should read in that order.

**Desktop AC:**
1. In Discover, the Great Britain / Ireland / South Africa pills sit **above** the search box.
2. Nothing else moves; search still searches the chosen nation as today.

**Phone:** covered by 185c (see its amended AC). A first screen asks for the country, and search stays hidden until one is picked. After that, search sits at the top of the map with a small country switch next to it.
