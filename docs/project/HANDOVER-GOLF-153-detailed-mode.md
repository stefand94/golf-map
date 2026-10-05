# Dev brief: GOLF-153 detailed mode v1 (Gavin)

Decision: **DEC-039**. Standing rules: `HANDOVER-GOLF-221-225.md` ("Standing rules"). Product questions go to the BA; don't guess.

## What the owner wants
A **toggle on the Itinerary tab** ("Detailed") that turns each day into a **calendar day view**: an hour grid, with each item a block sized by its duration and drive legs drawn as blocks between them. It also shows what a calendar doesn't: drive time, price and per-person cost. The owner's own worked example (backlog row GOLF-153):

> Depart 9:40 LCY (BA942) → arrive Inverness 10:55 → 5 min drive → 12:24 tee off Cabot Highlands (£350) → drive to Dufftown → stay Dufftown Inn

**Times are computed.** Set a fixed time on an item (a tee time, a flight's arrival) and everything after it is pushed, with drive times filling the gaps. Items with no fixed time flow from the item before them.

## Scope (v1)
1. **Model (additive only):**
   - Optional `time` (HH:MM, the fixed start) and `durationMins` on any item.
   - New `type:'flight'` with: flight number; from and to airport; depart and arrive times; optional price.
   - The arrival airport is a **located stop**, so the drive from the airport to the first course is computed like any other leg.
   - The model only *stores* fixed times. Computed times are derived at render time and never stored.
2. **Tee times:** let a golf item take a tee time. **Superseded by DEC-039's owner answers:** 5h from the tee time plus a 45-minute arrival buffer; flights within the trip and the flight home get a drive to the airport plus a check-in buffer. Propose sensible defaults for a hotel (check-in end of day, no block?) and for POIs, and tell the BA what you picked.
3. **Day view:** the hour grid shows only the hours in use (e.g. 07:00–21:00). It must work at 375 wide, and that's the real test. Desktop gets the same view, wider.
4. **Conflicts:** if a fixed time can't be met, show a clear warning on that block, e.g. "Arrives 12:40, tee time 12:24". Never silently move a fixed time.
5. **Share:** the read-only shared view shows the timed plan.
   - **Old share links must render exactly as now.**
   - New fields ride along only when set, keeping the payload small.
6. **Persistence:** add the new fields to the GOLF-224 load whitelist (`js/state.js`), and extend `test_state_persist.js`:
   - fields survive a release;
   - an old trip loads with no times;
   - a corrupt time value is dropped, not fatal.

## Out of scope (v1)
Tours, meals, trains and ferries as timed items; flight lookup or any flight API; print/PDF; any new Worker call.

## Things to know
- `items[]` is the ordered source of truth. Drive legs are **computed** between consecutive located stops (`js/trip-geo.js`), never stored as items. Keep it that way.
- The ferry legs from GOLF-118 already split ferry and drive time. Reuse those durations.
- **Airports:** a small static list of GB, Irish and South African airports, with coordinates, in `data/`.
  - Source it from **OurAirports (public domain)**. Fetch once, then merge by hand (CLAUDE.md data rule).
  - Add a row to `docs/data-provenance.md`.
  - Free text stays allowed for anything not on the list, but such an item has no location and so no drive leg. Say so in the UI.
- GOLF-235 counting is unchanged. Test on localhost only; since GOLF-241 it doesn't ping stats. **Don't build trips on golftripper.uk.**
- Clearing test data: leave the app page first, then clear, then cold-load (your own lesson).
- Ask the BA before changing anything about the default (non-detailed) Itinerary view.

## Suggested order
Do the model and the computed-time engine with tests, then the day view, then flights, then share. Push in slices if it helps. Each slice must leave the default view untouched.

## AC
- [ ] The toggle is off by default; with it off, nothing changes for any existing trip.
- [ ] The owner's worked example builds end to end: 09:40 flight, drive 5 min, 12:24 tee time, drive to Dufftown, stay. Times compute and the drives fill the gaps.
- [ ] Changing a tee time moves everything after it. A conflict shows a warning, not a silent shift.
- [ ] Works at 375 wide and on desktop. No console errors, no "undefined".
- [ ] The shared view shows the timed plan; old share links render byte-identically.
- [ ] All 4 check scripts pass. X-Build live.
- [ ] Report back with: the commit and build, what you verified and how, what only Stefan's iPhone can check, and what test data is left.
