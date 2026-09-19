# GOLF-150 — UI review pass #2 (findings + shipped fixes)

_Structured review half of GOLF-150 (see BACKLOG.md row for the agreed
approach), done 2026-09-19 against `main` (`7985457`) via the local static
preview, desktop 1440×900 + 375px mobile, walking a real Scotland trip
(Carnoustie → St Andrews → Kingsbarns → Muirfield) through Discover →
Itinerary → Costs. Merged with the owner's own list (2026-09-19 message:
too many buttons, overflow, trip name placement, group-size control,
clear/share/filter as icons). GOLF-148's missing POI UI is out of scope
here — not a finding._

## Shipped in this pass

Owner's list:

1. **Trip name is the pane's headline, at the very top** (above the nation
   pills). 24px display type, and it *is* the trip menu (tap → switch /
   rename / new / duplicate / start fresh). In Plan mode — before there's
   an itinerary to name — the headline reads "Plan a trip" instead; same
   menu underneath. Cost/day pill + Beta badge sit on a meta line below it.
2. **No name prompt on "New trip".** It's created as "New trip" (numbered
   if taken) and named later via the headline menu.
3. **Share → Apple-style share icon, moved** into the header beside the
   name (trip-level action next to the trip). On touch devices with a
   native share sheet it opens the share sheet; desktop keeps one-click
   copy with a small "Link copied" bubble.
4. **Clear trip → trash icon** in the header, beside Share; disabled when
   the trip is already empty.
5. **Filters → standard sliders icon**, pushed to the right of the
   toolbar; shows a dot when a non-default filter is on.
6. **Group size → one segmented control** `[ − | 👤 2 golfers | + ]`
   (was an emoji + two floating circles). `−` disables at 1.
7. **Overflow fixed.** Toolbar items size to content and wrap instead of
   being forced into equal cells (which ellipsised "My trip" to "M…" on
   desktop and made the buttons physically overlap at 375px). On phones
   labels shorten ("Hotels", "Nearby", "2") so the row fits on one line.

Found during the review (confirmed defects):

8. **P0 — "+ Wishlist" in search results could silently create itinerary
   days.** Place results arrive ~1s after course results and used to be
   inserted *above* them, so the list jumped just as you clicked — the
   click landed on a place's "Add to trip" and created Day 1/Day 2 from a
   town. Reproduced twice in a row. Places now render *below* courses, so
   a late arrival never moves anything already on screen.
9. **P1 — retired Explore chrome leaking above the pane.** A "Nearest to
   Muirfield · Near my trip · All results" strip (`#list-mode`, Explore-era)
   appeared at the top of the pane once a trip had a course; its buttons
   did nothing visible. Now hidden with the rest of the Explore chrome.
10. **P2 — "This order looks inefficient" card had zero padding** — text
    ran flush against the card edge.

## Batch 2 — every proposal below, built on branch `golf-150-ui`

Owner approved all of them on 2026-09-19. What each became:

- **W1** — Discover's wishlist says "✓ N courses are in your itinerary
  across N days · View itinerary →" once everything is scheduled; the
  wishlist's CTA reads "Build itinerary →". The headline also shows the
  trip's name in Plan mode once the trip has days.
- **W2 / C1** — order is now header → tabs → tab-specific chrome.
  Discover: nation pills, search, Hotels. Itinerary: search ("Add a course
  or town…"), Hotels / Nearby / filters. Costs: nothing but the costs.
  Nation pills don't filter course search in Build.
- **W3** — the place button is secondary ("＋ Add as a day", with a
  tooltip saying what it does), and adding one shows a toast "Added North
  Berwick as Day 6 · Undo" (plus "Open" from Plan). Undo removes the day
  and restores the Nearby anchor.
- **I1** — reorder suggestion is a one-line banner "↻ Reordering could
  save ~23 miles · Review" (straight-line miles); Now/Suggested + buttons
  expand under it.
- **I2** — one quiet "＋ Add to Day N ▾" per day → "A place to stay" /
  "A stop (sight, lunch…)".
- **I3** — a day with nothing priced shows no total; an unpriced row
  shows a muted "TBC" instead of "–".
- **I4** — `tripShortPlace()` (first comma segment) in day headers,
  reorder labels, staying-near and place search results; full label kept
  as a tooltip / region line.
- **I5** — "Staying near" uses the day's own place, else the course name
  without its layout ("Carnoustie (Championship)" → Carnoustie), else its
  region. Station names are no longer used.
- **S1** — unified search asks the geocoder for `layers=coarse`
  (towns/regions only). **Needs the Worker redeployed by hand** — until
  then the Worker ignores it and results stay noisy.
- **S2** — × clear button in the search bar (Escape also clears).
- **C2** — pane bottom padding 88px + safe area on mobile, so the last
  card clears the "Show map" pill.
- **C3** — Beta badge moved into the "Golf Tripper" masthead.

## Proposals (original triage list — all built in batch 2 above)

### Workflow (the "clunky" feeling)

- **W1 (P1) — the wishlist/itinerary boundary is invisible.** Once
  courses land on days, Discover's "Your wishlist" says *"Nothing on your
  wishlist yet"* while the trip holds 4 courses and £2.5k — reads like data
  loss. And places create days directly from search. Proposal: Discover
  shows "4 courses in your itinerary → view" when the wishlist is empty but
  the trip isn't, and the wishlist gets one explicit CTA — "Build itinerary
  from N courses" — as *the* hand-off from Plan to Build.
- **W2 (P1) — tabs are the primary navigation but sit 5th in the stack**
  (header → nations → search → toolbar → tabs). Proposal: header → tabs →
  tab-specific chrome. Discover gets search + nations + hotels; Itinerary
  gets its toolbar (nearby / hotels / filters); Costs gets group size only.
  Today the toolbar reflows as you switch tabs because it holds a mix of
  all three, and search/nation pills sit above Costs where they do nothing.
- **W3 (P2) — two verbs for adding.** Courses: "+ Wishlist". Places:
  "Start a trip here" / "+ Add to trip" (creates a day). Same list, same
  button style, very different consequences. Proposal: style the place
  action as secondary and add an undo toast ("Added Kingsbarns as Day 2 ·
  Undo").

### Itinerary tab

- **I1 (P1) — reorder suggestion dominates the tab.** Unprompted, ~15
  lines on mobile, lists full geocoder strings twice. Proposal: one-line
  banner "Reordering could save ~40 min driving · Review" that expands.
- **I2 (P2) — button density on day cards.** Every day carries two
  full-width buttons (Add stay / Add stop): 12 buttons for a 6-day trip.
  Proposal: one quiet "+ Add" row per day opening a stay/stop menu.
- **I3 (P2) — "–" for a day with no fee** sits right beside the "⋯" menu
  and reads as a collapse/minus control. Use muted "No fee" or leave blank.
- **I4 (P2) — long geocoder labels everywhere.** "Kingsbarns Golf Links,
  Fife, Scotland, United Kingdom" in day headers, reorder chips, "Staying
  near". Show the first segment; keep the full string as a tooltip.
- **I5 (P3) — "Staying near Golf Street / Leuchars / Drem"** — the
  auto reverse-geocoded hamlet names look like mistakes. Prefer nearest
  town, or label it as a suggestion.

### Search

- **S1 (P2) — noisy place results.** "Carnoustie" returns the High
  School, Library and Panmure F.C. as "towns & cities". Restrict geocoder
  layers to locality/region (ORS `layers=locality,region,county`).
- **S2 (P3) — no clear (×) button** in the search field; clearing a query
  on mobile means select-all + delete.

### Chrome / mobile

- **C1 (P2) — nation pills in Build mode** are irrelevant once an
  itinerary exists — hide on Itinerary/Costs (falls out of W2).
- **C2 (P2) — the floating "Show map" pill covers content** at 375px
  (sits over "Use suggested order"). Pane needs bottom padding ≥ pill
  height + margin.
- **C3 (P3) — two stacked headers.** "Golf Tripper" masthead bar + pane
  header. The Beta badge could move into the masthead and free the meta line.
