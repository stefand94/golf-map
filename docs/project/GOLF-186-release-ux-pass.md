# GOLF-186 – GOLF-195 — Release UX pass (flows and interactions)

_Owner review, 2026-09-24: "what improvements can be made to the overall
flow and interactions … as we work our way to general release". Findings
are from a BA/UI walk-through on localhost (desktop, 800 × 600) plus the
GOLF-185 phone review the day before. Phone layout itself is GOLF-185; these
tickets apply to **all viewports** unless stated. Owner answers recorded
inline._

**Release-gate items (added to GOLF-180):** GOLF-186, 187, 190, 193.

---

## GOLF-186 — One hotel picker, one tap to add · P1 · READY

**Problem (observed):** three disconnected ways to find a hotel (the "Show
hotels" map layer, "+ Add to Day → A place to stay", the free-text "Search a
hotel…" box). In the picker, "+" does not add: it fills a form that has
scrolled off-screen ("📍 Location set") and the user must scroll up and
press Add. Rows show name and type only — no distance, no order that means
anything, and the options aren't on the map. The nights box is an
unlabelled "1". The day line keeps saying "Staying near St Andrews" after a
hotel is chosen.

**Requirements / AC**
- [ ] Each golf day shows a "Where are you staying?" slot. It's empty until a
      stay is chosen, and after that it shows the hotel's name.
- [ ] Opening it shows candidates sorted by distance from that day's golf,
      each with its distance, **and** the same candidates as numbered pins on
      the map, matching the list.
- [ ] One tap on a row or on a candidate pin adds that hotel to the day
      immediately. No second "Add" step.
- [ ] After adding, nights (labelled, stepper) and price (optional) are
      editable in place.
- [ ] Nights > 1 fills the following days with the same stay (existing
      GOLF-96 behaviour; owner confirmed 2026-09-24). Changing nights
      updates them.
- [ ] Free-text hotel search stays available inside the same picker, for a
      hotel that isn't listed.
- [ ] "Add to Day N" from the "Show hotels" map layer lands in the same
      state as picking from the list.
- [ ] A stay with no entered price shows its fallback as an estimate
      ("~£100 est."), never as a plain price. See GOLF-193.

**Out of scope:** hotel prices/ratings/booking links (no data source).

## GOLF-187 — Search: one ranked list, towns group their courses · P1 · READY

**Problem (observed, "st andrews" in GB):** 10 courses are listed before
the town, which comes 12th, below the fold. Kingsbarns and Lundin match
with no reason given. "Saint Andrews Major" appears twice. Courses say "+
Wishlist" and towns say "Start a trip here" / "Add as a day". Results stay
open across tab switches and sit above the itinerary.

**Requirements / AC**
- [ ] Results are one list ranked by relevance, not split into a Courses
      section and a Towns section.
- [ ] When a town matches and has courses nearby or sharing its name, it
      shows as a group heading ("📍 St Andrews · 11 courses") with those
      courses beneath it (owner, 2026-09-24).
- [ ] Every row carries a type marker (⛳ course / 📍 place).
- [ ] A course that matches only by proximity says so ("near St Andrews").
- [ ] Duplicate places (same name and location) appear once.
- [ ] Tapping a row moves the map to it and opens its card. A place card
      offers "Courses near here" and "Add as a day"; a course card is the
      normal course card (GOLF-185b on phones).
- [ ] Switching tab (Discover / Itinerary / Costs) closes the results.
- [ ] Searching "St Andrews" shows the town's heading in the first screen
      of results at 375 px.

**Depends on:** GOLF-190 for the add-button wording.

## GOLF-188 — Things to see: all shown, filters start off · P2 · READY

**Problem (observed):** all five type buttons start "on" and tapping one
*hides* that type; "on" and "off" look identical.

**AC (owner's spec, 2026-09-24)**
- [ ] Opening Things to see shows every type, with no type button
      selected.
- [ ] Tapping a type shows only that type; tapping more types adds them;
      tapping a selected type removes it; with none selected, all show.
- [ ] Selected buttons look clearly different from unselected, and screen
      readers announce the state (`aria-pressed`).
- [ ] An "All" control clears the selection.

## GOLF-189 — Discover starts with something to look at · P2 · IDEA

Discover shows nothing until a course or town is known. Proposal: once a
country is picked, show a few ready-made lists, e.g. "Top 100 in GB",
"Links under £100", "Pay & play gems". Needs owner input on which lists,
and a data check that the fields behind them are filled well enough.

## GOLF-190 — Shortlist → Itinerary: one model, consistent names · P1 · DISCOVERY

**Problem:** "Plan a trip" turns into "My trip"; Discover has "Your
wishlist"; buttons say "+ Wishlist" or "+ Add to trip"; "Build itinerary →"
moves between them. It's unclear whether the wishlist *is* the trip.

**Decision (owner, 2026-09-24):** keep two stages: a **shortlist** of
courses you fancy, then an **itinerary** of scheduled days. Name them the
same way everywhere: buttons, headings, empty states, share view, toasts.

**OPEN QUESTION:** GOLF-185e (2026-09-23) set the add button to "Add to
trip". Under this model the button adds to the *shortlist*. Is the button
"Add to shortlist", or does "trip" mean shortlist + itinerary together? The
answer rewrites 185e's first AC.

## GOLF-191 — The map follows the trip · P2 · READY

**Observed:** after adding a hotel, the map stayed put and the day's course
was off-screen. On desktop, "Add to trip" from a pin zooms right into that
course (GOLF-185b fixes this on phones only).

**AC**
- [ ] A "Show whole trip" map control frames every stop in the trip.
- [ ] Adding a stay or a stop keeps both it and the rest of that day in
      view.
- [ ] On desktop, adding a course from its pin does not zoom in, and the
      other pins stay (matches GOLF-185b).

## GOLF-192 — Nearby says how far "nearby" is · P3 · READY

Nearby for Askernish lists courses 114–126 mi away with no hint that they're
far. **AC:** each Nearby row shows an approximate drive time (or distance)
and rows beyond a threshold are marked as a long drive. Dev picks the
threshold; propose it in the PR.

## GOLF-193 — Costs read the same everywhere; estimates are marked · P1 · READY

**Observed:** a stay with no price shows **£100** on the Itinerary day
card and **£50** on the Costs tab (per person, the default). Neither says
it's an estimate. Only green fees carry a "typical rates" note.

**AC**
- [ ] The Per person / Total choice (GOLF-178) applies app-wide: day
      cards, day headers, the trip badge, Costs, the shared view.
      Every figure says which it is.
- [ ] Any figure that includes an app-filled estimate is marked (~, "est.")
      wherever it appears, including totals that contain one.
- [ ] Mixed currencies still follow DEC-026.

## GOLF-194 — Small interaction polish · P3 · READY

- [ ] Removing something from the trip shows "Removed · Undo" for a few
      seconds, and Undo restores it exactly. **Check the current behaviour
      first**: it was not tested in the review.
- [ ] Group size moves off the top of every tab into the trip menu on
      desktop too (phones get it via GOLF-185a).

## GOLF-195 — First-visit "how it works" hint · P3 · IDEA

Three short steps (pick courses → build days → see costs) on first visit,
ideally on GOLF-185c's country card. Deliberately not in 185's scope:
decide after 185 ships.
