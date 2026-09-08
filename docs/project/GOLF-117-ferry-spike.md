# GOLF-117 — Research spike: ferry legs

**Type:** research / written recommendation only (like GOLF-101). No build.
**Date:** 2026-09-08
**Question from owner (item 10):** ferries are the practical way between
Scottish islands and open up an Islay→Ireland routing. Does routing already
handle them, can we flag them, and where would schedule/fare data come from?

---

## 1. Does the current ORS `driving-car` route already traverse ferries?

**Yes — but partially and inconsistently.** Tested live against the
production Worker (`geofftheworker.stefand94.workers.dev`) on 2026-09-08:

| Leg | ORS result | Ferry included? |
| --- | --- | --- |
| Kennacraig → Port Askaig (Islay) | 189 min / 29.5 mi | ✅ yes (CalMac vehicle ferry) |
| Oban → Craignure (Mull) | 66 min / 10.4 mi | ✅ yes |
| Cairnryan → Belfast | 202 min / 53.9 mi | ✅ yes (Irish Sea ferry) |
| Ardrossan → Brodick (Arran) | 233 min / 89.5 mi | ❌ no — routed the long way round (Claonaig–Lochranza + road), ignored the direct 55-min ferry |

So ORS **does** pull `route=ferry` ways into a `driving-car` route and
folds their crossing time into the `minutes`/`miles`/geometry it returns.
But which ferries it uses depends on how each ferry way is tagged in
OpenStreetMap (`motor_vehicle=yes`, a `duration=` tag, connectivity of the
slipway nodes), and ORS has a long-standing open bug where ferry
categorisation is unreliable
([GIScience/openrouteservice#678](https://github.com/GIScience/openrouteservice/issues/678)).
The Arran miss above is a concrete example.

**Two caveats even when it works:**
- The crossing *time* ORS returns is only the OSM `duration=` tag on the
  ferry way — frequently missing, approximate, or a single fixed value. It
  never reflects the actual timetable, so it silently ignores that you
  might arrive at the slipway and wait 4 hours for the next sailing.
- No fare is included (ORS has no concept of one).

---

## 2. Can we detect "this leg includes a ferry" from the response?

**Not today** — the Worker strips the ORS payload down to
`{minutes, miles, route}` and throws the rest away
(`handleRoute()` in `scripts/cloudflare-worker/ors-proxy.js`).

**It's a small Worker change to expose it.** ORS returns a way-type
breakdown if the directions request asks for it:

```js
// in the ORS request body, alongside coordinates:
extra_info: ["waytypes"]
```

The response then carries `features[0].properties.extras.waytypes.values`,
an array of `[fromIdx, toIdx, code]` triples where **code `9` = Ferry**
(ORS way-type enum). The Worker can sum the ferry segments and return e.g.:

```js
{ minutes, miles, route, hasFerry: true, ferryMiles: 6.1 }
```

This is a ~10-line addition to `handleRoute()`, no new endpoint, no extra
ORS request, no cost change. A geometry heuristic (detect long straight
over-water hops) is the fallback if `waytypes` proves flaky, but it's
hacky and shouldn't be first choice.

---

## 3. Operator / schedule / fare data — what's actually available

### CalMac (Scottish islands — the bulk of the use case)
- **No public API, no official GTFS feed.** Timetables are PDF/HTML on
  calmac.co.uk only.
- The **Traveline National Dataset (TNDS)** *does* include CalMac ferry
  timetables, as TransXChange XML, updated weekly, free — but behind an
  FTP-registration wall and in a format that needs conversion (e.g.
  `UK2GTFS`). That's a heavyweight pipeline for what we need
  ([TNDS on data.gov.uk](https://www.data.gov.uk/dataset/0447f8d9-8f1b-4a68-bbc8-246981d02256/traveline-national-dataset)).
- Realistically, for v1 this is a **static hand-maintained table**, same
  pattern as green fees.

### Islay ↔ Ireland (the routing the owner specifically wants)
- Served by **Kintyre Express** (Ballycastle ⇄ Port Ellen, ~1 hr, also
  via Campbeltown). **Passenger-only — no cars.** Fri–Mon, 29 Mar–30 Sep
  2026. ~£80 single / £150 return pp
  ([Kintyre Express timetables](https://kintyreexpress.com/tickets/),
  [Islay Info](https://www.islayinfo.com/get-here/sea/kintyre-express)).
- Passenger-only matters: a trip using this leg can't be a drive-through —
  it breaks the "one car the whole way" assumption the cost/route model
  currently makes. Worth a note in the UI, not silent.
- No open data — static info only.

### Known 2026 disruption (raises the maintenance cost of any table)
- **Port Ellen harbour closes from 2 June 2026 until 2029** for
  reconstruction; CalMac's Islay service runs **Kennacraig–Port Askaig**
  in the meantime
  ([CalMac route info](https://www.calmac.co.uk/en-gb/route-information/kennacraig-port-askaig-islay-port-ellen-islay/)).
  Any ferry data we hand-maintain will need touching through 2026–29.

---

## 4. Recommended v1 scope

**Flag ferry legs. Do not integrate timetables or fares.**

1. **Worker:** add `extra_info:["waytypes"]` to the `handleRoute()` ORS
   call; return `hasFerry` (bool) and `ferryMiles` (number). Backwards
   compatible — existing callers ignore the new fields.
2. **App:** on any itinerary drive-leg row where `hasFerry` is true, show a
   ferry glyph + a short note: *"This leg includes a ferry crossing —
   check sailing times and book ahead."*
3. **Operator link:** a small curated `data/ferries.js` (~12–15 rows:
   crossing name, operator, operator-page URL, rough duration, car/foot,
   seasonal note). Match the leg to the nearest crossing in that table by
   coordinates and link to the operator page. Same fetch-once /
   hand-maintain pattern as green fees; `lastVerified` per row.
4. **Explicitly out of v1:** adding crossing time or fare into the trip
   cost/duration estimate; live availability; foot-passenger vs car-deck
   pricing; seasonal schedule logic. All of that depends on date selection
   (not built) and belongs with the GOLF-103/104-era work.

**Effort:** Worker change S; UI note + `data/ferries.js` S–M. Post-go-live.

**Value:** low-cost honesty fix. Right now a trip that hops to Mull or
Islay shows a driving time that quietly assumes a ferry is always waiting —
flagging it stops the estimate from being misleading, without pretending we
have timetable data we don't.

---

## 5. Proposed follow-up ticket

> **GOLF-118 — Flag ferry legs in the itinerary** · P3 · post-go-live
> Worker returns `hasFerry`/`ferryMiles` via ORS `waytypes`; itinerary
> drive-leg rows with a ferry show a glyph + "check sailing times" note +
> operator link from a curated `data/ferries.js`. No timetable/fare
> integration (parked until date selection exists). Deps: none.

Timetable/fare integration stays an **IDEA**, dependent on date-selection
being built first.

---

## Sources
- [ORS ferry categorisation bug #678](https://github.com/GIScience/openrouteservice/issues/678)
- [ORS routing options / avoid_features](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options)
- [Traveline National Dataset](https://www.data.gov.uk/dataset/0447f8d9-8f1b-4a68-bbc8-246981d02256/traveline-national-dataset)
- [Kintyre Express timetables & fares](https://kintyreexpress.com/tickets/)
- [Islay Info — Kintyre Express](https://www.islayinfo.com/get-here/sea/kintyre-express)
- [CalMac Kennacraig–Islay route info (Port Ellen closure)](https://www.calmac.co.uk/en-gb/route-information/kennacraig-port-askaig-islay-port-ellen-islay/)
- Live tests against the production Worker, 2026-09-08 (table in §1).
