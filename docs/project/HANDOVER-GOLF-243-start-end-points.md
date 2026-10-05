# Dev brief: GOLF-243, trip start and end points (Gavin, after GOLF-153)

Standing rules: `HANDOVER-GOLF-221-225.md`. Product questions go to the BA. **Start this only once GOLF-153 is merged**: it builds on 153's airports list, flight and train blocks.

## What the owner wants
It should be easy to say where a trip starts and ends, e.g. **start at Inverness Airport, end at Edinburgh Waverley**. This matters most in detailed mode, and should also work in the list view, even when the point is just a city name. It must be **easy to add from the Itinerary view**.

## Today
- A day can be `kind:'start'|'end'` with a `place`. It is routable only when picked from search (`tripDaySetPlaceGeo`, `js/trip-model.js`).
- That takes several steps. It creates a whole extra day, while arrival is usually the same day as golf. Place search also depends on ORS geocoding, which sometimes returns 403.

## Design (BA calls, confirm with BA before changing any)
1. **Trip-level, not a day.** Add `tripStart` and `tripEnd`: `{label, lat, lng, kind:'airport'|'station'|'place', code?}`.
   - Start is the first stop of Day 1. End is the last stop of the final day.
   - They stay attached to the trip when days are reordered, added or deleted.
   - Leave the existing start and end day kinds working as they are. No migration.
2. **The Itinerary view gets two rows:**
   - "Start: + Add start point" above Day 1, and "End: + Add end point" below the last day. Once set, each shows a chip such as "✈ Inverness Airport (INV)" with edit and clear.
   - Show them in both list and detailed view. Add a "Same as start" shortcut for the end, for round trips.
3. **One picker that works instantly.** Search runs over a static list first:
   - Airports come from 153's `data/airports.js`.
   - Main railway stations come from a new `data/rail-stations.js`, covering GB and Ireland, plus SA if any are worth including. Source them from OSM (ODbL, already credited): fetch once, merge by hand, and do the terms check first.
   - Then it falls back to the existing place search for any town or city.
   - Plain text with no coordinates is allowed. Show it as a label only, and the UI says it has no drive leg.
   - It must not need a Worker call to find an airport or station.
4. **List view:** a located start or end feeds a real drive leg into or out of the trip. That leg counts in the fuel total, the map and the costs, the same as any other leg.
5. **Detailed mode:**
   - A start at an airport is the same thing as 153's inbound arrival flight: one object, not two. Setting the arrival flight's airport sets the start, and the reverse.
   - An end at an airport is the flight home: drive, then check-in buffer, then flight.
   - An end at a station is drive, then a 20-minute buffer (BA pick, editable), then a train block.
   - A start at a station is an arrival-only train.
   - A plain place has no transport block, just the first or last drive.
6. **Map:** a distinct start pin and end pin. They're small and must not be confused with course or hotel pins.
7. **Share and state:**
   - Both fields ride along only when set. Old share links must render byte-identically.
   - Add both to the GOLF-224 load whitelist and extend `test_state_persist.js`: they survive a release, an old trip loads without them, and a corrupt value is dropped.

## Out of scope
Live train or flight lookup; timetables; ferries as start points; any new Worker call.

## AC
- [ ] On an empty or existing trip, set start = Inverness Airport and end = Edinburgh Waverley from the Itinerary tab in **3 taps or fewer** each, with the Worker blocked.
- [ ] List view: a drive leg from INV to the first stop and from the last stop to Waverley; fuel and costs include them.
- [ ] Detailed view: the inbound flight and the start are one object. The end shows drive, buffer and train with times computed.
- [ ] Reordering or deleting days keeps the start first and the end last.
- [ ] A plain city name works as a label, with no leg and no errors.
- [ ] Old trips and old share links are unchanged. No console errors, no "undefined". Checked at 375 wide and on desktop.
- [ ] All 4 check scripts pass, a provenance row is added for the station data, and X-Build is live.
- [ ] Report back in a few lines: commit, build, iPhone-only checks, and test data left.
