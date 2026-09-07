## Phase 31 — Scoping: trip sharing (demo), group/per-person costing, and a course-imagery proposal (2026-09-02)

### Context

Stakeholder confirmed three next-priority items, explicitly asked to be
**scoped** (requirements + steps for low-level implementer agents), not
built in this pass: (1) a shareable trip — map overview, day-by-day
costs, itemised total — explicitly accepted as a "get a demo out" v1 that
will be redone properly later; (2) a group-booking feature — specify a
group size, get a whole-trip cost and a per-person cost, following the
per-room/per-person "vibe" GOLF-74 already established for hotels; (3) a
written proposal on sourcing course imagery, copyright-safe. Grounded
against the real, current code (`js/trip-model.js`, `js/trip-geo.js`,
`js/trip-ui.js`, `js/app-mode.js`, `js/editor.js`,
`scripts/cloudflare-worker/ors-proxy.js`) — verified this session, not
assumed:

- Confirmed **zero backend beyond the stateless ORS proxy Worker**
  (4 `mode` branches: directions, `pois`, `geocode`, `heritage-pois` — no
  database, no accounts, no persistence layer anywhere). Every byte of
  trip data lives in one browser's `localStorage` under key `golfmap:v1`.
  This is the hard constraint every ticket below is scoped against.
- Confirmed the exact cost-computation chain: `tripItemPriceDetail(d,it)`
  (`js/trip-geo.js:244`) is the single source of truth for one item's
  price (`{base,guests,sharing,total,cur}`), consumed by
  `tripCostLineItems()`/`tripCostBreakdown()` (`js/trip-ui.js:269,285`),
  which drives the Build-mode Costs tab. A per-person feature must hook
  in here, not duplicate the math elsewhere.
- Confirmed the multi-trip snapshot shape (GOLF-42):
  `trips={[tripId]:{name,created,modified,trip,tripSeq,tripDays,
  tripLastAdded,tbAnchor,tripDayNextId}}` + `activeTripId` — any new
  trip-level field (group size, a share flag) is a new key alongside
  these, following the exact same snapshot/restore pattern
  (`tripSnapshotActive()`/`tripRestoreActive()`).
- Confirmed the JSON export shape (`js/editor.js:114-148`) already
  produces `{source,exported,corrections,trip,days,allTrips?}` — a
  ready-made starting point for a share payload, not something to invent
  from scratch.
- Confirmed hash-routing (`js/app-mode.js`): `setAppMode(mode,opts)` is
  the single entry/exit point for `explore`/`plan`/`build`
  (`''`/`'#plan'`/`'#trip'`), with `popstate` re-sync already wired — a
  fourth mode slots into this exact same pattern.

### GOLF-86: Shareable trip link (v1 — read-only snapshot, no backend) — DONE (2026-09-03)

**Product shape, confirmed against the stakeholder's 3 bullets**: a
recipient who opens the link sees (a) the whole trip's stops on the map,
(b) a day-by-day breakdown with each day's cost, (c) a full itemised
total — i.e. essentially the *existing* Build-mode Itinerary + Costs tabs,
rendered read-only, for someone who wasn't the one who built the trip.

**Explicitly a v1/demo, not Pillar 4 tier 3+ (Phase 11)**: no server, no
live sync — a share link is a **frozen snapshot** at the moment it was
generated; edits made afterward by the trip's owner do not propagate to
anyone holding the link. This limitation must be stated in the UI itself
("This is a snapshot from {date} — ask for a new link if the trip has
changed"), not hidden. Revisiting with a real backend (magic-link cloud
sync, Pillar 4 tier 3) is future work, not this ticket.

**Design — zero backend, matches the app's existing static-first
architecture:**
1. **Encode the trip into the URL itself.** A trip's shareable payload is
   small (a handful of days/items) — no need for a compression library.
   Build a compact JSON shape (course *indices* only, referencing the
   already-loaded static `C[]` array — never re-embed full course
   records) mirroring the existing export shape
   (`js/editor.js`'s `trip`/`days` fields, trimmed to just what a
   read-only view needs: `tripSeq`, `tripDays` with their `items`), then
   `encodeURIComponent(JSON.stringify(...))` into a new URL hash state,
   e.g. `#share=<payload>`. Use `btoa`/`atob` only if the plain
   `encodeURIComponent` form proves too long in practice for a typical
   trip — check with a real 5-day/15-item trip before deciding either
   way is needed.
2. **New `appMode:'shared'`**, added to `js/app-mode.js`'s existing
   `appModeFromHash()`/`setAppMode()` machinery — a 4th value alongside
   `explore`/`plan`/`build`, entered whenever the hash starts with
   `#share=`. Landing here from a fresh page load (not from in-app
   navigation) is the primary path — this needs to work for someone who
   has never opened the app before, cold, exactly like `#trip`/`#plan`
   already do per GOLF-41.
3. **A new read-only render function** (e.g. `renderSharedTrip()` in
   `js/trip-ui.js` or a new `js/trip-share.js` module, following the
   modularization convention from Phase — GOLF-70) that decodes the hash
   payload into a *local, disposable* trip-shaped object — deliberately
   **not** writing into `TRIP`/`tripSeq`/`tripDays`/`localStorage` at all,
   so viewing a shared link can never clobber the viewer's own in-progress
   trip. Reuses existing render primitives read-only: the map drawing
   logic from `js/trip-route.js` (`tripShowOrdered`-equivalent, generalized
   to take an explicit trip object instead of reading the live globals —
   check whether this needs a small refactor to accept a parameter, or
   whether it's cleaner to temporarily swap in the decoded trip as "the
   active trip" for rendering purposes only and swap back — decide during
   implementation, but the *rule* is: the viewer's real trip must be
   provably untouched), `tripDayScheduleHTML()`'s day-card layout, and
   `tripCostBreakdown()`'s cost math — all read-only, no drag-and-drop, no
   add/edit buttons, no wishlist.
4. **The "Share" action**: a button in Build mode (next to the trip
   switcher) that builds the payload from the *current* active trip,
   writes it into `location.hash`, and copies the full resulting URL to
   the clipboard (`navigator.clipboard.writeText`) with a toast/confirm —
   same UX pattern as any existing copy-to-clipboard affordance already
   in the app (check `js/editor.js`'s export drawer for the existing
   copy-JSON button to reuse its exact interaction).
5. **Graceful degradation**: a malformed/truncated `#share=` payload
   (a link cut short by some sharing channel) shows a clear "This link
   looks broken or incomplete" message rather than a blank page or a
   console error — wrap the decode in try/catch.

**Explicitly out of scope for this ticket**: editing a shared trip,
"save this shared trip as my own" (a real, plausible follow-up — flag it
back to the stakeholder once v1 ships, don't build speculatively), any
backend, any account system, any live sync.

**Acceptance criteria**: build a real multi-day trip with courses +
a hotel + a POI, click Share, copy the link, open it in a **fresh private
browser tab** (not just a new tab in the same profile — must prove no
`localStorage` bleed-through), confirm the map shows every stop, every day
renders with its own cost, the itemised total matches the original
Build-mode Costs tab exactly; confirm the viewer's own separate trip (if
any) is untouched after viewing; confirm editing the original trip
afterward does *not* change what the already-generated link shows;
confirm a hand-corrupted `#share=` value shows the broken-link message,
not a crash.

**Implemented exactly as scoped above.** `js/trip-share.js` (new module,
loaded right after `js/app-mode.js`, before `js/boot.js` — added to
`scripts/check_js.js`'s `ORDER` array): `tripBuildSharePayload()`/
`tripEncodeShareURL()` build a compact `{v,gs,seq,days}` payload (course
*indices* only, referencing the static `C[]` array), `tbShareTrip(btn)`
writes it into `location.hash` via `history.pushState` and copies to the
clipboard with the standard copy/feedback pattern. `js/app-mode.js`'s
`appModeFromHash()` gained a 4th mode, `'shared'`, entered whenever the
hash starts with `#share=` (checked before the existing `#trip`/`#plan`
checks) — `setAppMode()` branches early for it: no `body.trip-mode`, no
`syncMastTripButton()`, straight to `renderSharedTrip()`.

`renderSharedTrip()` uses the "temporarily swap live globals, render with
the existing pure functions, restore in a `finally`" strategy rather than
threading an explicit trip object through every render primitive — swaps
`TRIP`/`tripSeq`/`tripDays`/`groupSize`/`tbIncludeFuel`, calls
`tbItinAllHTML()`/`tripCostBreakdown()`/a new read-only
`tbCostsTabReadOnlyHTML()` (identical to the live Costs tab minus the fuel
checkbox's `onchange`, which would otherwise flip the *viewer's* live
state), then restores every swapped global before returning — verified
this session to leave `localStorage` byte-for-byte unchanged. A dedicated
`sharedMapInstance`/`renderSharedMap()` (separate Leaflet instance bound to
`#shared-map`) avoids touching the app's real `map`/`tripLayer`. Malformed/
truncated `#share=` payloads are caught in `tripDecodeSharePayload()`
(returns `null` on any parse failure) and render the "This link looks
broken or incomplete" message via the same code path as a mid-render
exception (belt-and-braces try/catch inside `renderSharedTrip()` itself).

**Verified end-to-end via the real UI** (not just direct function calls):
built a real 2-day-worth-in-1-day trip (2 golf courses + a £120 hotel + a
£15 POI, groupSize 2, grand total £284), clicked the real `tbShareTrip()`
path, opened the resulting `#share=` URL in a genuinely separate browser
tab — map/itinerary/costs all rendered correctly with the exact matching
total; captured that tab's `localStorage` before and after viewing the
link and confirmed it was byte-identical (no bleed-through); then, in the
*original* tab, mutated the live trip after the link had already been
generated (hotel → £999, POI removed, new total £1,132.338) and reloaded
the share-link tab on the **same, already-captured URL** — it still showed
the original frozen £284/£120-hotel/POI-present data, proving the snapshot
doesn't track later edits; finally navigated to a hand-corrupted
`#share=%7Bthis-is-not-valid-json...` value and confirmed the graceful
broken-link message rendered with no console error.

**A genuinely new, more severe browser-caching gotcha found this
session, worth flagging beyond GOLF-87's existing note**: mid-session, the
preview tab kept returning a demonstrably stale `js/app-mode.js` (an old
function body, confirmed via `.toString()`) on ordinary `<script src>`
loads, while a `fetch(url,{cache:'no-store'})` against the exact same URL
correctly returned the fresh file — proving the file on disk and the
server's response were both fine, and this was a pure browser-side HTTP
cache issue. GOLF-87's documented fix (a full `preview_stop` +
`tabs_close` + fresh `preview_start` on the same port) **did not clear
it** — a brand-new tab on a freshly-restarted server, same port, still
served the stale script. Root cause: the plain Python `SimpleHTTPServer`
backing `.claude/launch.json`'s preview config sends no `Cache-Control`/
`Expires` header, so the browser falls back to heuristic caching — and
that heuristic cache, once poisoned, survives tab closures *and* full
server-process restarts on the same origin/port (Chrome keys its HTTP
disk cache by origin, which includes the port, and the underlying browser
profile/session persists across all of the above). **The only fix that
worked**: switch to an entirely different port (a fresh cache-key/origin)
— a second, manually-started `python3 -m http.server` on a new port
immediately served fresh content with no other changes. If a future
session hits inexplicably-stale JS that survives a full preview teardown,
try a new port before anything else.

### GOLF-87: Group size and per-person costing — DONE (2026-09-02/03)

Implemented exactly as scoped below. `groupSize:number` (default 2, min 1)
added to the trip snapshot shape (`js/trip-model.js`, every trip-construction
site incl. `tripStartFresh()`), mirrored as a live-global via
`groupSizeFor()` in `js/trip-geo.js`. A stepper (👥 − N +) sits in the shared
top bar next to the trip switcher, reusing `.tb-btn`/`.tb-field` styling,
wired to `tripSetGroupSize()`.

**Two real cost surfaces exist, not one** — this was the round's main
discovery. The Build-mode Costs tab is driven by `tripItemPriceDetail()`
(`js/trip-geo.js`) → `tripCostLineItems()`/`tripCostBreakdown()`
(`js/trip-ui.js`); the Plan-mode wishlist's rough total is driven by a
separate, actually-live function, `tripWishlistSummaryHTML()`
(`js/trip-route.js`). A parallel set of functions in `js/trip-geo.js`
(`tripCostSummary()`/`tripCostSummaryHTML()`/`tripCostEstimateByDay()`) was
edited for groupSize in an earlier session under the wrong assumption that
*they* backed the wishlist — confirmed via grep this round that they are
dead code, never called anywhere in the app. Left as-is (internally
consistent, just unreferenced) rather than cleaned up, out of scope for this
pass. `tripWishlistSummaryHTML()` was the one that actually needed the fix,
and got it: green fees × `groupSizeFor()`, with a " for N travellers" suffix
when groupSize > 1.

Green fees and POI costs scale by `groupSize` (each traveller pays their own
round/stop); hotel cost is **not** re-multiplied — GOLF-74's own per-item
`priceType`/`guests` sharing model stays independent, only a *new* hotel
item's `guests` defaults to the trip's `groupSize` (`tripDayAddStop()`,
edit-path `tripDayUpdateStop()` deliberately left alone, still defaulting to
`HOTEL_GUESTS_DEFAULT`). Fuel stays a fixed trip total, unaffected.

**A real bug found and fixed along the way**: `tripItemPriceDetail()`'s
golf/POI branches had been given `sharing:groupSize>1` — but `sharing` is a
GOLF-74 hotel-only display flag consumed by `tripCostLineItems()`'s label
code (`det.base.toFixed(0)`), and since `groupSize` defaults to 2, this made
every golf/POI item's `sharing` `true` by default, crashing the Costs tab on
any course with no parseable fee (`det.base===null`). Fixed by reverting
both branches back to `sharing:false`, with the golf/POI "× N" tag computed
independently from `groupSizeFor()` in the consumer instead. Verified safe
via grep of every `.sharing` consumer in the codebase (all hotel-only).

**Verified end-to-end** via the worked example (2 golf courses, a hotel
marked `priceType:'person'`/`guests:4`/£100, a £20 POI, groupSize 4→2): fees
and POI scaled ×4/×2 correctly, hotel stayed £400 flat in both directions,
POI's line-item *label* correctly showed no stray "sharing" text once the
bug above was fixed (only its `tag` reads "× 4"); the min-1 floor on the
stepper holds; a real DOM click-through of the stepper buttons (not just
console calls) confirmed 2→3→2→1→1 with `groupSize` tracking each step; the
Plan-mode wishlist rendered "£258 in green fees (2 of 2 priced) for 4
travellers" live in the pane.

**Two browser-testing gotchas hit and worth remembering**: (1)
`tripStartFresh()` calls a real `window.confirm()` — any test script must
`window.confirm=()=>true;` first or it silently no-ops, leaving stale trip
data in place; (2) the preview tab can retain stale in-memory JS across a
`force:true` re-navigation and even a service-worker cache-clear — a genuine
fix required a full `preview_stop` + `tabs_close` + fresh `preview_start`.

`node scripts/test_data.js`/`node scripts/check_js.js` unaffected, as
expected (pure app-state/UI, no data-file changes). Test/trip localStorage
state cleared via `tripStartFresh()` before finishing.

### GOLF-87 (original scope, kept for reference)

**Product shape, confirmed against the stakeholder's description**:
specify a group size once per trip; costs "flow through" the same way
GOLF-74's hotel per-room/per-person toggle already works; end result is
both a whole-trip total *and* a per-person figure.

**The one real design decision this ticket has to make explicit** (not
obvious from the stakeholder's one-line description — flag for their
review rather than guess silently): **which cost categories scale with
group size, and which don't.**
- **Green fees and POI costs are inherently per-traveller** — each
  golfer plays their own round and pays their own green fee, so the
  *trip total* for these should be `feePerRound × groupSize` (today's
  `tripCostEstimateByDay()`/`tripCostLineItems()` compute the cost of
  *one* round per scheduled course, not per traveller — this is the one
  genuine behavior change, not just a new display line).
- **Hotel cost is already its own per-item sharing model** (GOLF-74's
  `priceType`/`guests` on each hotel item) — a trip-level `groupSize`
  should **not** silently multiply hotel cost again on top of that (that
  would double-count a room already marked "per person sharing ×2").
  Recommended default: a new hotel item's `guests` field defaults to the
  trip's `groupSize` instead of the current hardcoded `2`
  (`HOTEL_GUESTS_DEFAULT`), so "flows through" happens naturally at
  entry time, while each hotel keeps its own independently-editable
  `guests` (a group of 4 might still book 2 twin rooms, not 1×4 — that's
  a legitimate real-world case the per-item model already supports and
  must keep supporting).
- **Fuel is a shared trip cost** — one car, one tank, regardless of group
  size (or however many cars — out of scope to model multiple vehicles).
  Trip total stays as-is; only the *per-person* figure divides it by
  `groupSize`.

**Data model**: add `groupSize:number` (default `2`, minimum `1`) to the
trip snapshot shape (`js/trip-model.js`'s per-trip object, alongside
`name`/`tripDays`/etc.) — persisted/restored through the exact same
`tripSnapshotActive()`/`tripRestoreActive()` path as every other trip
field, no new persistence mechanism needed. A live-global mirror
(`groupSize` module variable, matching how `TRIP`/`tripSeq`/`tripDays`
already work) alongside the existing ones.

**UI**: a group-size stepper/number input, likely in the shared top bar
next to the trip switcher (same visual weight as the trip name, since
it's a trip-level fact) — reuses GOLF-71's `.tb-field`/token-based input
styling, not a new component. Changing it live-recomputes every cost
figure (green fees/POI × groupSize, hotels unaffected unless a hotel's
own `guests` happens to still be unedited-default, fuel unaffected total
but the per-person split changes).

**Costs tab** (`tbCostsTabHTML()`, `js/trip-ui.js`): grows a second
headline figure alongside the existing grand total — "£X total trip cost
· £Y per person" — with a short breakdown of which lines were
multiplied (a small note or icon per line, e.g. "× groupSize" tag on
Golf/POI rows, "shared" tag on Fuel, "as entered" on Hotel) so the
maths is legible, not a silent multiplication a stakeholder has to trust
blindly. `tripCostBreakdown()` needs a `groupSize`-aware variant (or an
added parameter) that returns both the group total and the per-person
figure without duplicating the line-item math — extend the existing
function rather than writing a parallel one.

**Acceptance criteria**: set group size to 4 on a trip with 2 scheduled
rounds (£50 fee each) + one hotel already marked per-person-sharing ×4
(£100/person) + a POI (£20) + some fuel miles; confirm the Costs tab shows
green fees × 4 = £400 total (not £100), hotel stays £400 (not further
multiplied), POI × 4 = £80, fuel unchanged in total but shown divided
by 4 in the per-person line; confirm changing group size to 2 live-
updates every affected figure; confirm a hotel item's own `guests` can
still be edited independently of the trip's `groupSize` without being
overwritten on next render. `node scripts/test_data.js`/
`node scripts/check_js.js` unaffected (no data-file changes — pure
app-state/UI).

### GOLF-88: Course imagery — a research/sourcing proposal (deliverable is a document, not a feature) — DONE (2026-09-03)

Delivered as an Artifact: https://claude.ai/code/artifact/621d7880-b82f-4251-989c-39fa904b16b4

Real spot-check research performed this session (`WebFetch`/`WebSearch`
against Wikimedia Commons' `Special:MediaSearch`, 11 courses across all
6 nations/regions, 2 Ireland + 4 South Africa as required): **8/11 hit
(~73% overall) — 6/6 (100%) across England/Scotland/Wales even for
modest municipal courses (Trent Park, Bude & North Cornwall), 1/2 (50%)
Ireland (Royal County Down hit strongly, an obscure Galway club found
nothing), 2/4 (50%) South Africa with marginal hit volumes (Fancourt 1
photo, Leopard Creek 3, sourced via the now-defunct Panoramio's
Commons-migrated archive) — Glendower and Humewood both missed
entirely.** England Golf's `LogoImage`/`ClubImageBannerUrl` license
terms were checked directly (`WebFetch` against their Find & Play page
and a `WebSearch` for API/license docs) and confirmed genuinely
unverifiable — no stated terms found anywhere public, flagged in the
proposal as blocked pending their written sign-off rather than assumed
clear.

Proposal covers all 5 required sections: source candidates (Wikimedia
Commons primary, Geograph GB/NI fallback, England Golf flagged-blocked,
Mapillary considered-and-rejected, Unsplash/Pexels named as
not-the-real-course), the coverage estimate above, a fetch/resize/
attribute pipeline mirroring the existing `scripts/fetch_*.py`
philosophy and reusing GOLF-21's Pillow-based resize plan (with
attribution-metadata capture flagged as the one genuinely new piece
beyond GOLF-21, since CC-BY-SA legally requires visible credit), a
£0-infra/developer-time cost estimate, and a recommendation — Commons
first, Geograph GB/NI fallback, graceful "no photo" degradation
elsewhere (no generic stock filler) — reached from the coverage data,
with a Top 100 (114-course) pilot suggested before any full 557-course
run.

No code shipped this round, as scoped — a decision document only,
awaiting stakeholder go/no-go before any fetch pipeline gets built.

### GOLF-88 (original scope, kept for reference)

Not a code ticket — the ask is explicitly "a proposal," i.e. a written
recommendation the stakeholder reviews before anything is built,
following the exact precedent already set by this project (GOLF-12's
course-stats spike, GOLF-49's fee-parsing investigation): research first,
present options + a recommendation, get a steer, *then* scope an
implementation ticket if approved.

**What the proposal needs to cover** (for whoever — human or agent —
produces it):
1. **Openly-licensed source candidates**, evaluated for coverage across
   the app's now-500+ courses (GB/Ireland/South Africa) and genuine
   license safety (not just "free to view"):
   - **Wikimedia Commons** — huge UK/Ireland coverage via Wikipedia
     articles' own infoboxes, almost all CC-BY-SA/CC0/public-domain,
     structured category pages per course/club where they exist; the
     best-fit single source given breadth + license clarity.
   - **Geograph Britain and Ireland** (geograph.org.uk) — every photo
     explicitly CC-BY-SA 2.0 with clear per-photo attribution metadata,
     strong rural/countryside GB+Ireland coverage (a natural fit for
     links/parkland courses specifically), likely weaker for South
     Africa.
   - **England Golf's own `LogoImage`/`ClubImageBannerUrl`** — already
     partially integrated (GOLF-11/21's club-logo pipeline) but that's
     *club branding*, not course photography, and its exact license
     terms (member-club-supplied to England Golf, not necessarily
     freely re-publishable elsewhere) need to be actually checked, not
     assumed reusable — flag this explicitly in the proposal as needing
     verification, since it's the one source already halfway integrated
     and easy to wrongly assume is already cleared.
   - **Mapillary / OpenStreetMap-adjacent street-level imagery** — CC-BY-SA,
     but street-level/road-facing shots are a poor fit for "a photo of
     the course," worth naming as considered-and-likely-rejected rather
     than silently omitted.
   - **Unsplash/Pexels** — broad "golf course" stock imagery, free
     licenses, but **not** photos of *this specific* course — only
     useful as a generic placeholder/fallback, not real course imagery;
     name this trade-off explicitly rather than presenting it as
     equivalent to the sourced options above.
2. **A coverage estimate**: spot-check a sample (10-15 courses spanning
   all 6 current nations/regions, including at least 2-3 South African
   and Irish courses specifically, since those are newer/less-documented
   in English-language sources) against Wikimedia Commons + Geograph to
   give a realistic "expect photos for roughly N% of courses" number
   rather than assuming full coverage.
3. **A recommended pipeline**, mirroring this app's existing "fetch once,
   bake into static data, zero runtime calls" philosophy (same as every
   `scripts/fetch_*.py` script): a one-off script per source
   (Wikimedia Commons API / Geograph's API, both free+keyless) that
   resolves a course name to a candidate image, downloads + resizes it
   (same `Pillow`-based pattern GOLF-21 already scoped for club logos —
   reuse that plan rather than re-deriving it), and — critically —
   **captures and stores attribution metadata** (photographer, license,
   source URL) alongside each image, since CC-BY-SA/BY licenses legally
   require visible attribution, unlike the club-logo pipeline which
   didn't need this. This attribution requirement is the main net-new
   engineering piece beyond what GOLF-21 already designed.
4. **A cost/effort estimate**: this is entirely free-tier/keyless APIs
   (no signup blockers like the RapidAPI/ORS precedents elsewhere in this
   plan) — effort is developer time (writing + running the fetch/resize/
   attribute pipeline, spot-checking results for correctness) rather than
   any recurring cost. Ballpark in the same style as the Phase 24
   monetization estimate: infra cost £0, time cost is the real variable,
   proportional to how many courses are targeted (all 500+ vs. a curated
   subset like the existing Top 100 lists).
5. **A recommendation**: most likely "Wikimedia Commons as primary,
   Geograph as GB/Ireland fallback, explicit 'no photo available'
   graceful degradation for the remainder (consistent with how `logo`
   already degrades gracefully today) rather than falling back to
   generic stock imagery that isn't actually the course" — but this
   should be the proposal's own conclusion, reached from the actual
   coverage spot-check, not asserted here.

**Deliverable**: a short written document/artifact (not code), following
the pattern of prior research write-ups in this plan (e.g. GOLF-12,
Phase 24's HNA South Africa report) — presented to the stakeholder for a
go/no-go before any fetch pipeline gets built.

### Sequencing for this phase

Independent tickets — no dependency between GOLF-86/87/88, and none
depends on Phase 30's Scotland data work. Suggested implementation order
once approved: GOLF-87 (smaller, self-contained, extends existing
GOLF-74 machinery) → GOLF-86 (larger, new render surface + URL
encoding) → GOLF-88 (research deliverable, can run in parallel with
either).

### Verification approach

- **GOLF-86**: fresh-private-tab test as described in its acceptance
  criteria is the critical one — proves no state bleed between the
  share-link viewer and the trip owner. `node scripts/check_js.js` after
  any new module; no data-file changes expected.
- **GOLF-87**: the worked £50/£100-per-person/£20/fuel example in its
  acceptance criteria, both directions of the group-size change (4→2).
- **GOLF-88**: no code verification — success is a document the
  stakeholder can make a go/no-go call from.
- All three, per standing convention: clear any test/trip `localStorage`
  state before ending the implementation session.

## Phase 30 — Scotland Top 100 broadening (GOLF-85) — DONE

Executed exactly per the plan below. `data/courses-scotland.js` grew from
51 → **100** curated courses (49 new entries, sourced/verified earlier
this session via `scripts/fetch_scottish_golf_clubs.py` against Scottish
Golf's public club-finder API — every fuzzy match manually eyeballed
against its query text; one wrong match caught and corrected, `the-dukes`
had matched "Fairmont St Andrews" instead of the real Duke's Course
operator, St Andrews Links Trust). Regions assigned by hand across the 5
existing Scotland buckets; new entries use placeholder fee/arch/note
fields (`conf:"est"`, `band:"mid"`, `arch:"Unknown"`) since they weren't
individually hand-researched this round, matching Phase 27's Ireland/SA
precedent; no `t100.sco` rank stamped on the new batch. `EXPECTED_TOTAL`
in `scripts/test_data.js` bumped 508→557, plus the file's own
`C_SCOTLAND.length` assertion 51→100. `node scripts/test_data.js` — OK,
557 courses (114 Top 100). `node scripts/check_js.js` — OK, 15 modules.
Committed to `main` as `bcf8c80` (not pushed, per standing convention).

### Superseded plan (kept for reference)

### Context

Mirrors Phase 27 (Ireland/South Africa broadening): grow
`data/courses-scotland.js` from 51 curated courses toward Scotland's
Top 100, matching the stakeholder's explicit "add in the extra scottish
courses we need" instruction (item 1 of the original 5-part message).
All sourcing/verification legwork is already done this session (subagent
delegation was abandoned after 3 stuck-in-plan-mode failures — see
Errors/fixes in the carried-forward summary — so this finishes via direct
tool calls once plan mode is exited): 49 new course names looked up
against Scottish Golf's public club-finder API
(`scripts/fetch_scottish_golf_clubs.py`, same DotGolf-platform pattern as
England/Wales/Ireland/SA), every fuzzy match manually eyeballed against
its query text (one wrong match found and corrected — `the-dukes` had
matched "Fairmont St Andrews" instead of the real Duke's Course operator,
St Andrews Links Trust), coordinates spot-checked. Final verified
lat/lng/name/phone/site data for all 49 lives in `/tmp/sco_summary.json`
and is also preserved in the conversation summary's Files section (a
printed key→name/lat/lng table) as a fallback if that temp file is gone.

### Plan

1. **Re-verify `/tmp/sco_summary.json` still exists**; if not, rebuild it
   from the preserved printed table in the prior summary (49 rows) —
   the full phone/site data would need re-deriving/re-fetching in that
   case, but name/lat/lng alone is enough to proceed since fee/arch/note
   fields are already going to be `conf:"est"` placeholders (matching the
   Phase 27 precedent for newly-added, not-yet-hand-researched courses).
2. **Build 49 new JS object literals** matching
   `data/courses-scotland.js`'s exact schema (confirmed live: `n, lat,
   lng, nearStation?, clubInfo:{phone}?, r, a, band, wd, we, conf, arch,
   spec, note, topScot:1, t100:{sco:N}?, site`). Each new entry gets:
   - `r`: assigned to the closest-fitting one of the 5 existing regions
     (Fife & East Lothian / Angus & Aberdeenshire / Ayrshire & Argyll /
     Highlands & Islands / Perthshire & Central Scotland) by real
     geography, same manual-assignment approach as every prior region
     mapping in this project.
   - `a:"public"` (or "limited"/"application" where the club name implies
     it, e.g. member-only-sounding clubs — default to "public" otherwise).
   - `band`/`wd`/`we`: generic placeholder banding (`"mid"`, a flat
     estimate string) — `conf:"est"`, matching Phase 27's documented
     precedent for the new-batch fields not being hand-researched yet.
   - `arch:"Unknown"`, `spec:"18"`, `note:""` — same placeholder
     convention as Phase 27's new Ireland/SA batch.
   - No `t100.sco` numbering (existing numbering is already
     non-sequential/non-unique per the schema recon — omitting avoids
     adding to that inconsistency; consistent with Phase 27 precedent of
     not stamping ranks on newly-added sibling/batch entries).
   - `clubInfo:{phone:...}` and `site:...` populated from the verified
     summary data where present.
3. **Append the 49 entries** to the `C_SCOTLAND` array in
   `data/courses-scotland.js`, before the closing `];`, and update the
   file's header comment course count (51 → 100).
4. **Update `EXPECTED_TOTAL`** in `scripts/test_data.js`: 508 → 557
   (508 + 49), with a dated comment following the existing convention.
5. **Verify**: run `node scripts/test_data.js` (expect 557 courses, Top
   100 count unchanged) and `node scripts/check_js.js` (module parse/load
   check); spot-check 4-5 new coordinates against real-world geography;
   confirm no stale `t100.sco` collisions were introduced.
6. **Commit to `main`** (per standing convention — additive data work
   commits directly, pushing stays the stakeholder's manual action),
   with a commit message following the Phase 27-style precedent.
7. **Write this up** in the plan file as a completed "Phase 30 — GOLF-85"
   section (replacing this plan stub), following the exact style of
   Phase 27's Ireland/SA write-up (data-quality issues found/fixed,
   known limitations, verification performed).

### Then continue to GOLF-87 → GOLF-86 → GOLF-88

Per the already-approved Phase 31 scoping (full specs already written
above, unchanged): implement GOLF-87 (group size / per-person costing)
directly against `js/trip-model.js`/`js/trip-geo.js`/`js/trip-ui.js`,
then GOLF-86 (shareable trip link, new `appMode:'shared'` + URL-hash
payload), then produce GOLF-88 (course-imagery sourcing proposal, a
written document, published as an Artifact) — each verified per its own
acceptance criteria already documented in Phase 31, and each committed to
`main` (not pushed) when done. Given the repeated subagent plan-mode
failures this session, all of this executes via direct tool calls, not
delegated background agents.

Stakeholder's noted caveat carried forward: they flagged wanting to look
at a proper backend "soon" — this maps to Phase 11's existing Pillar 4
tiers 2-4 roadmap (export/import link → magic-link cloud sync → full
accounts), already documented, not actioned this round.

# Golf Map — Backlog & Architecture Review

## Context

The map started as a single hand-curated HTML file covering ~121 London-rail-reachable courses. Last session it grew fast: real station coordinates were sourced from TfL/National Rail, the data was split into `data.js`, and 100 nationally-ranked "England Top 100" courses were bolted on (sourced one-off from England Golf's public club-finder API plus a published price-list photo). That growth was necessarily quick-and-dirty — the data pipeline lives only as throwaway scripts in a scratch directory that were never committed, the UI's filter panel was designed for 5 facets and now carries dramatically more, and several genuinely new data-source opportunities (nearest station, club amenities, photos, handicap calculation) were identified but not pursued.

This plan turns "we shipped something" into "we have a maintainable base to keep building on": a documented data pipeline, a UI that scales past 221 courses, and a scoped, sequenced backlog for what comes next — agreed with the stakeholder before implementation starts, so execution can run in a lower-effort mode without re-litigating scope.

## Current-State Findings (verified this session)

- **Files:** `london-golf-map-v5_1.html` (441 lines, ~36K — markup/CSS/app logic) + `data.js` (347 lines, ~132K — all map/course data), plus `.claude/launch.json` for local preview. No `package.json`, no build step, no test suite. Two commits in git so far.
- **Data volume:** 221 courses — 121 original London-catchment entries (44 of which are lower-confidence "sweep" finds), 100 England Top 100 entries.
- **Schema is inconsistent by design, undocumented in practice:** `stn`/`walk`/`book` only exist on the 121 London entries (Top 100 entries intentionally have no rail station on this map). `t100` (ranking object) is on 130 entries. Reasonable design calls, but nowhere written down — a future contributor has to reverse-engineer the rules from the render code.
- **Architect data is very unnormalized:** 96 distinct free-text `arch` strings across 221 courses; only 10 canonical filter tags exist (matched via regex substring against that free text), so exotic one-off architects (e.g. "Laidlaw Purves", "C.K. Hutchison") get no filter tag at all.
- **UI has outgrown its original design:** the filter panel renders 5 access chips + 4 price chips + 10 architect chips + 13 region chips + 7 "show only" chips, all flat and always visible, plus a long scrolling legend.
- **No persistence:** filters, map view, and user corrections all reset on reload. The app's own UI already says *"Nothing is saved between sessions — export before you close the tab,"* a known, self-acknowledged gap.

## How Data Gets Refreshed (answering the direct question)

**Today: fetched once, stored forever, zero runtime calls.** Every external fact on the map — TfL/National Rail station coordinates, England Golf club coordinates/websites, the Top 100 rankings/fees — was pulled **exactly once**, last session, via one-off `curl`/Python commands run in a scratch directory, then hand-baked into `data.js` as static literals. When a user opens or refreshes the page, it makes **no API calls at all** — it's a fully static file reading pre-fetched data. This is a deliberate, good property (offline-capable, no API keys shipped, nothing to rate-limit or break for end users) and the plan keeps it.

**Going forward (GOLF-1 below):** the *scripts* that do the fetching get committed to the repo so the process is repeatable — but the refresh itself stays **manual/on-demand**, run by request (by me, or whoever maintains this), not on a schedule. Nothing about this introduces a server, a cron job, or a runtime dependency for the shipped page. If you'd rather have data refresh automatically on a schedule (e.g. a weekly job that re-fetches and redeploys), that's a materially different, bigger piece of infrastructure — flag it if you want it scoped separately; it's not assumed here.

## Data Source Opportunities (researched this session)

| Source | What it offers | Cost/access | Fit |
|---|---|---|---|
| England Golf `/api/clubs/GetClubDetails` (already used for coords/site) | Also returns phone, email, `FacilityTypes`/`Icons` (bar, buggy hire, changing rooms, driving range, pro shop, etc.), `LogoImage`/`ClubImageBannerUrl`/`ThumbnailImageSource`, `TeeBookingUrl`, `MembershipUrl`, social links, `TotalMembers` | Free, unauthenticated, but undocumented (powers their own site, not a published product) | High — already integrated, just under-used |
| `davwheat/uk-railway-stations` GitHub CSV (already used for London stations) | ~2,600 National Rail stations, GB-wide, name/lat/lon/CRS code | Free, static file | High — exactly what's needed for nearest-station on Top 100 courses nationally |
| TfL StopPoint API (already used) | Tube/Overground/Elizabeth/DLR station points | Free, unauthenticated | Already fully used for London |
| England Golf's WHS platform (`whsplatform.englandgolf.org`, spotted as an image host in club data; the club-search API already exposes an `IsWHSRated` flag per facility type) | Unconfirmed, but a promising lead for **course/slope rating** specifically, since it's their official World Handicap System platform | Unknown — needs the GOLF-12 spike to confirm | First avenue to check for par/slope/course rating before looking elsewhere |
| `golfapi.uk` (found via search, not integrated) | Claims 2,668 UK clubs w/ scorecards, hole-by-hole data, Google reviews, membership pricing | Unknown — likely commercial, needs a research spike | Fallback source for course stats if the WHS platform lead doesn't pan out |
| Routing APIs (Google/etc.) | Real driving/walking directions and time to nearest station | Paid, API key, rate limits | **Deferred** — stakeholder chose straight-line distance instead |

## Decisions Made (stakeholder input this session)

1. **Sequencing:** Foundation first (data pipeline + schema docs), before UI or new data.
2. **UI/UX depth:** Light declutter within the current vanilla JS/Leaflet single-file approach — no new build tooling, no framework.
3. **Nearest-station distance:** Straight-line ("as the crow flies"), not real routing — free, fast, no API key, must be clearly labeled as approximate in the UI.
4. **Persistence:** `localStorage` for filters/corrections is near-term priority, not deferred.
5. **Mobile:** Not a current requirement — dropped from scope (see removed ticket below).
6. **Course stats (GOLF-12):** Scope narrowed to an overview only — par, slope rating, course rating. No hole-by-hole scorecard data needed.
7. **New feature confirmed:** a Course Handicap calculator (Handicap Index → Course Handicap at the selected course), dependent on GOLF-12 producing usable slope/rating data.
8. **Phase 4 backlog confirmed:** Trip planner (GOLF-14) stays; "Favorites" is replaced with a "Played / Want to Play" two-list concept (GOLF-15).
9. **Housekeeping:** Attribution/label for the Top 100 data source should just say **"England Golf"** — no longer description needed.

## Roadmap

### Phase 1 — Foundation (data pipeline + schema)

**GOLF-1: Commit a reusable data-refresh pipeline**
- Create a `scripts/` folder (Python, matching what was used ad hoc last session) with one script per data source currently baked into `data.js` by hand: (a) rail station coordinates (TfL + `uk-railway-stations` CSV), (b) England Top 100 club lookup (England Golf API + the price-list figures). Each script is independently re-runnable, produces the same shape of output on a clean run, and writes to an intermediate JSON file rather than directly mutating `data.js` — a human (or a follow-up script) merges that JSON in, so a bad fetch can't silently corrupt the live file.
- **Acceptance criteria:** Running each script from a clean checkout reproduces the current data (spot-checked against known values, e.g. Sunningdale's coordinates); scripts committed with a short `scripts/README.md` explaining what each hits and when it was last run; refresh cadence is manual/on-demand — no scheduler, cron, or server introduced; no runtime dependency added to the shipped HTML page.
- **Size:** M. **Depends on:** nothing.

**GOLF-2: Document the course data schema**
- Add a schema comment block (or a small `SCHEMA.md`) at the top of `data.js` listing every field used across `C`, which entries use it (all / London-only / Top-100-only), and its type/format. Cover the `stn`/`walk`/`book` London-only convention and the `t100` ranking object shape explicitly.
- **Acceptance criteria:** A new contributor (or future me) can read the schema doc and correctly predict which fields a new course entry needs without reading the render code.
- **Size:** S. **Depends on:** nothing — can run in parallel with GOLF-1.

**GOLF-3: Split `data.js` by concern**
- Break the single `data.js` into a small number of plain `<script>`-loaded files — e.g. `data/config.js` (ACCESS/BANDS/REGIONS/ARCHS/LINES), `data/stations.js` (R/ROUTE_LINE/LABEL_AT/ISOLATED/MANUAL_IX), `data/courses-london.js`, `data/courses-top100.js`. No build step introduced — still plain global-scope scripts.
- **Acceptance criteria:** Page behavior is unchanged (verified in-browser, no console errors, course count still 221); each file is independently comprehensible without needing the others open.
- **Size:** S. **Depends on:** GOLF-2.

**GOLF-4: Data-provenance surfacing**
- Add a lightweight "data last refreshed" note per data batch (station coords, Top 100 list) sourced from the new scripts' run date, surfaced in the map legend.
- **Acceptance criteria:** Legend shows at least two distinct refresh dates (stations vs Top 100) once GOLF-1 exists.
- **Size:** S. **Depends on:** GOLF-1.

### Phase 2 — UI/UX light declutter + persistence

**GOLF-5: Redesign the filter panel**
- Group the current flat chip lists into collapsible sections (e.g. "Who can play" + "Green fee" open by default; "Architect," "Area," "Show only" collapsed behind a disclosure toggle, badge-counted so users know filters are hiding). No new component library — extend the existing vanilla JS/CSS.
- **Acceptance criteria:** All existing filter functionality still works (verified against the existing `passes()` filter logic — no filter chip removed, just reorganized); panel height at rest is meaningfully shorter than today's.
- **Size:** M. **Depends on:** nothing.

**GOLF-6: Reduce course-card badge clutter**
- Course cards currently can stack EDITED / sweep / winter / GL# / GBI# / ENG# badges simultaneously. Consolidate into a clearer visual hierarchy.
- **Acceptance criteria:** A card for a heavily-tagged course reads cleanly at a glance; no information dropped, just re-prioritized visually.
- **Size:** S. **Depends on:** nothing.

**GOLF-7: Collapsible legend**
- Convert the always-open, long scrolling legend into a toggleable panel.
- **Acceptance criteria:** Legend content unchanged, just togglable.
- **Size:** S. **Depends on:** nothing.

**GOLF-9: Persist filters, map view, and corrections to `localStorage`**
- Save selected filter state, current map center/zoom, and — highest-value — the `EDITS` object (user corrections) to `localStorage`, restored on load. Keep the existing JSON export/import as a manual backup path, not a replacement.
- **Acceptance criteria:** A correction made via "Correct this," followed by a page reload, is still present; filters and map position survive a reload; existing "Review & export corrections" flow still works unchanged; a way to clear stored state exists.
- **Size:** M. **Depends on:** nothing functionally, but do after GOLF-5/6/7 so it's not persisting a UI layout that's about to change.

~~**GOLF-8: Mobile layout re-check**~~ — **Dropped.** No current requirement for mobile support.

### Phase 3 — Data enrichment

**GOLF-10: Nearest National Rail station for Top 100 courses**
- Using the GB-wide rail station dataset already identified (`davwheat/uk-railway-stations`), compute the nearest station to each of the 100 Top 100 courses by straight-line (haversine) distance. Populate `stn` and a distance-appropriate equivalent to `walk`, draw the existing dashed link line on selection (reusing `drawLink()`), and **label it explicitly as straight-line distance** (e.g. "Nearest station: Newark North Gate — 8.2 miles, straight-line" rather than the London-style "5-min walk" phrasing).
- **Acceptance criteria:** All 100 Top 100 courses show a nearest station in popup and card; wording clearly distinguishes this from walkable London-style distances; spot-check 5 courses against a map to confirm plausibility (a naive nearest-neighbour can occasionally pick a closed/tiny halt over an obvious nearby mainline station).
- **Size:** M. **Depends on:** GOLF-1.

**GOLF-11: Pull England Golf amenities/contact/imagery into popups**
- Re-fetch (via the GOLF-1 pipeline) and store phone number, amenity icons, and club logo/banner image for Top 100 courses from England Golf's `GetClubDetails`.
- **Acceptance criteria:** Popups for Top 100 courses show at least phone (where available) and amenity icons; missing data degrades gracefully (no broken images, no "undefined" text).
- **Size:** M. **Depends on:** GOLF-1.

**GOLF-12 (research spike): Course overview stats — par, slope rating, course rating**
- Scope is deliberately an overview only, **not** hole-by-hole data. First check England Golf's own WHS platform (`whsplatform.englandgolf.org`) and the `IsWHSRated` flag already visible in their facility-type data — if their club API or a related endpoint exposes Course Rating/Slope Rating directly, that's free and already-trusted. If not, evaluate `golfapi.uk` as a fallback (cost, terms, coverage, data quality). Deliverable is a short findings memo, not an integration commitment.
- **Acceptance criteria:** A written recommendation (go / no-go / needs budget approval) covering which source (if any) reliably provides par + slope rating + course rating for a meaningful share of the 221 courses, with enough detail to greenlight GOLF-13 or shelve it.
- **Size:** S (time-boxed spike). **Depends on:** nothing.

**GOLF-13: Course Handicap calculator**
- Given a course with par, slope rating, and course rating (from GOLF-12) and a user-entered Handicap Index, compute and display Course Handicap using the standard World Handicap System formula: `Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating − Par)`, rounded to the nearest whole number per WHS convention. Surface as a small input + result in the course popup, only shown for courses where GOLF-12 data exists.
- **Acceptance criteria:** Entering a Handicap Index for a course with known par/slope/rating produces a correct Course Handicap (verified against a hand-calculated example); the input/result is hidden or clearly labeled "not available" for courses without the underlying data; no persistence required beyond the current session unless folded into GOLF-9.
- **Size:** S–M. **Depends on:** GOLF-12 (blocked until a data source is confirmed — this ticket may need re-scoping if the spike comes back "no reliable free source").

### Phase 4 — New features (backlog, not yet scheduled)

- **GOLF-14: Trip planner** — surface 2+ bookable courses reachable off the same rail line as a same-day itinerary suggestion.
- **GOLF-15: "Played" / "Want to Play" personal lists** — two distinct list states per course (not a single generic favorites list), builds on GOLF-9's persistence infrastructure.
- **GOLF-16: "Distance from Home" as a labeled, sortable stat** — the underlying `distOut()` function already exists and already drives the "by distance out" sort; this is just about surfacing it as visible, explicitly-labeled ("as the crow flies") text on Top 100 cards/popups, where it's currently invisible.

## Explicitly Out of Scope (for now)

- Real driving/walking routing to nearest station (needs a paid API).
- Any build tooling / framework introduction for the UI.
- ~~Mobile-specific layout work.~~ — **Reopened as GOLF-19** (Phase 5) at the stakeholder's request; the rest of this list still stands.
- Hole-by-hole scorecard data.
- Scheduled/automatic data refresh (current model is manual, on-demand re-runs of committed scripts).
- Committing to `golfapi.uk` or any paid data source without the GOLF-12 spike's findings first.

## Verification Approach (for whoever implements each ticket)

- **Phase 1 (pipeline/schema):** Run each new script from a clean checkout; diff its output against current `data.js` values for a handful of known courses; confirm the shipped HTML page still has zero runtime network calls (check the Network tab / `read_network_requests` shows nothing beyond the tile layer and static assets).
- **Phase 2 (UI):** Load in-browser via the existing `.claude/launch.json` preview; check console for errors; exercise every filter chip and confirm `passes()` results match pre-change behavior; reload the page after making a correction to confirm GOLF-9 persistence.
- **Phase 3 (enrichment):** Spot-check a sample of Top 100 courses' nearest-station assignments against an actual map; confirm popups degrade gracefully (no "undefined") for any course missing new optional fields; verify GOLF-13's Course Handicap output against a hand-calculated example.

---

## Status as of this plan revision

Phases 1–4 (GOLF-1 through GOLF-16) are **all implemented and committed**,
including GOLF-13 (Course Handicap calculator — the formula itself needed no
API and is live now; only its inputs, `courseStats:{par,slope,rating}`, are
still unpopulated, pending GOLF-12's data source). GOLF-12's spike concluded
`golfapi.uk`'s free tier is the path forward, at the stakeholder's explicit
instruction not to spend money. Signing up for RapidAPI is a real account
creation, which is outside what I can do on the stakeholder's behalf per this
project's standing rules — **the stakeholder needs to create the free
RapidAPI account, subscribe to `golfapi.uk`'s free tier, and hand over the
resulting API key** before GOLF-12/13's data side can proceed. Everything
else in this phase does not depend on that.

## Phase 5a — stakeholder review findings (do these first)

Raised when the stakeholder tried the app after Phase 3/4 shipped. Verified
each one directly (in-browser, via the JS console) before writing this up —
findings below are confirmed, not assumed.

**GOLF-22 (bug): Top 100 courses are effectively invisible on first use**
Not a data problem — checked directly: Royal Birkdale, Royal Liverpool, St
Enodoc (Church), Formby, Hillside etc. are all correctly present in
`data/courses-top100.js` with correct rankings, and the search box finds
them instantly (typing "birkdale" correctly returns Royal Birkdale, Formby,
Hillside). The actual bugs, both confirmed live:
1. The map's default view is London-centered at zoom 9. Royal Birkdale
   (Southport), Royal Liverpool (Wirral), and St Enodoc (Cornwall) are all
   hundreds of miles outside that viewport — invisible unless a user
   manually pans/zooms all the way out, with no on-screen hint that they
   should.
2. The default list sort ("by area") orders by `REGIONS.indexOf`, and the
   5 Top 100-only regions were appended *after* the original 8 London
   regions — so Top 100 courses in outlying regions sink to the bottom of
   the list. Confirmed directly: **Royal Birkdale is literally card #221 of
   221** in the default unfiltered view. Nobody scrolls that far.
3. There's no "zoom to fit" / "show me everything" control at all.
- **Fix approach:** add a visible "Show all / fit map to results" control
  (recomputes map bounds from whatever's currently passing `passes()`);
  when the "England Top 100 only" chip is active, auto-fit bounds to it;
  reconsider whether "by area" should stay the default sort or whether
  something that doesn't structurally bury 100 courses (e.g. "by ranking",
  or interleaving) makes more sense as the default. Also worth a one-line
  UI hint near the map on first load ("zoom out to see all 221, including
  100 nationally").
- **Acceptance criteria:** Royal Birkdale (or any Top 100 course) is
  reachable within a couple of scrolls/clicks from a completely fresh load,
  not buried at the literal end of the list; a "fit to results" control
  exists and is verified to actually move the map; re-run GOLF-17's manual
  checklist after, since this touches default state.
- **Size:** S–M. **Depends on:** nothing — do this first, it's a bug in
  already-shipped work, ahead of any Phase 5 polish.

**GOLF-23: Cross-check the Top 100 list against a second published source**
The current 100 entries came from one photographed price list, transcribed
and geocoded last session — a second independent source would catch both
transcription errors and any courses that list simply omitted. Plan: pull
the course-name list (not the prose/rankings themselves — those are
copyrighted; we're only verifying facts, not reproducing another site's
write-up) from a second published England Top 100-style ranking (e.g.
top100golfcourses.com, National Club Golfer, or Today's Golfer's list) via
`WebSearch`/`WebFetch`, and diff it against our 100: flag anything in ours
that doesn't appear elsewhere (possible transcription slip) and anything
appearing on 2+ external lists that we're missing entirely.
- **Acceptance criteria:** a short findings note (which of our 100 are
  corroborated, which aren't, what's missing) with a clear go/no-go on
  whether any changes are needed — this is a verification pass, not an
  automatic rewrite of the data; any actual additions/corrections get
  proposed before being merged in.
- **Size:** S. **Depends on:** nothing.

**GOLF-24: Standalone Trip Planning mode (supersedes GOLF-14's inline blurb)**
Remove the "Same-day pairing" section GOLF-14 added inside each popup —
it only ever worked for London-catchment courses with a `stn` (same rail
line), so it silently did nothing for all 100 Top 100 entries, which is
exactly where the stakeholder wants this most (Cornwall, the Liverpool
coast). Replace with a dedicated toggle-driven **Trip Planning** mode,
agreed as browse-only for v1 (pick candidates, see them on the map — nothing
saved/persisted; a "build & save a named trip" version can follow once this
gets used and feedback comes in):
- **By region:** pick one of the existing 13 `REGIONS` values, show every
  bookable course in it. Known limitation, disclosed up front rather than
  silently: some regions are coarse (`South West England` currently spans
  Cornwall through Dorset) — reusing the existing field avoids inventing a
  new geographic taxonomy right now, but this may want splitting into finer
  sub-regions once the stakeholder has tried it.
- **By anchor course:** pick any course as an anchor, show other bookable
  courses within a distance radius (straight-line, reusing the haversine
  logic already built for GOLF-10's `nearStation` lookups), ranked by
  proximity — generalizes GOLF-14's "same rail line" idea into "same area,"
  and works for all 221 courses, not just the London ones with a station.
- **Acceptance criteria:** the old inline "Same-day pairing" popup section
  is gone; a new Trip Planning toggle exists and is reachable from the main
  panel; both region and anchor-course modes return sensible results
  (spot-check Cornwall and the Liverpool/Sefton coast specifically, since
  those are exactly the cases raised); results render on the map, distinct
  from the main filtered course view.
- **Size:** M. **Depends on:** nothing functionally, but do after GOLF-22
  (no point building a better trip planner while the underlying course list
  is still hard to see in the first place).

## Phase 5b — quality, accessibility, mobile, search, imagery

Execution order across all of Phase 5: **5a first** (GOLF-22 is a live bug
in shipped work; GOLF-23/24 flow from the same stakeholder review), then
5b starting with GOLF-17 as agreed — build the regression habit first so
every ticket after it gets checked by it, then the rest in the order below.
Ticket numbers reflect the order each was scoped, not execution order.

**GOLF-17: Regression test suite, extended as we go**
Two honest layers, not one fake one — this app has no build step and I don't
want to introduce npm/a headless-browser dependency just to get automated
DOM tests, so the split is:
- `scripts/test_data.py` (or `.js`, TBD in implementation — no new runtime
  dependency either way): static, no-browser checks — every `data/*.js`
  file parses; every course has the fields SCHEMA.md says are required;
  every `stn` value resolves to a real `R`/`ISOLATED` station; every
  `nearStation`/`clubInfo`/`courseStats` sub-object has the right shape when
  present; course count matches the last-known total (catches accidental
  duplicates/drops). Run via a single command, e.g. `python3 scripts/test_data.py`.
- A documented **manual/agent-run checklist** (new `TESTING.md`, or folded
  into `scripts/README.md`) for the behavioral checks that genuinely need a
  real browser — no console errors, the "no undefined in any `popupHTML(i)`"
  sweep, a reload to confirm `localStorage` persistence still round-trips.
  This is exactly what I've been running by hand each session via the
  Browser tool; writing it down means it's not just tribal knowledge in my
  head, and it's what I (or a future session) should re-run after every
  feature below.
- **Acceptance criteria:** `python3 scripts/test_data.py` exits non-zero on
  a deliberately-broken data file (verify by temporarily breaking one
  field); `TESTING.md` lists every manual check currently being run,
  precisely enough that another session could follow it without guessing;
  a one-line note at the top of `TESTING.md` reminding future-me to add a
  new check here whenever a new data field or interactive feature ships.
- **Size:** S. **Depends on:** nothing — do this first as agreed.

**GOLF-18: Accessibility pass**
Audited the current markup directly. What's already right: chips/toggles
use `aria-pressed` correctly, the search input has `aria-label`, cards are
real `<button>` elements (keyboard-focusable by default), editor form
fields use `<label for>`. What's missing:
- The legend's expand/collapse header (`legend-head`, added in GOLF-7) is a
  plain `<div>` with a click handler — not focusable, no `role="button"`,
  no `aria-expanded`. Fix: real `<button>` or add `tabindex`/`role`/keydown
  handling and `aria-expanded`.
- No skip-link past the filter panel to the map/course list for keyboard
  users.
- The correction/export drawer (`#drawer`) doesn't trap focus while open or
  restore focus to the triggering element on close.
- The result count (`#count`) and "nothing matches" empty state aren't in
  an `aria-live` region, so a screen-reader user filtering the list gets no
  feedback that anything changed.
- Colour contrast: spot-check `--stone` text on `--paper-2`/white backgrounds
  (used for a lot of secondary metadata) against WCAG AA; adjust if failing.
- **Explicitly out of scope:** individually keyboard-navigable map markers
  (a real Leaflet-specific undertaking) — the course list already gives
  keyboard users a complete, accessible parallel path to every course, and
  I'll say so explicitly in the UI/docs rather than silently leaving a gap.
- **Acceptance criteria:** keyboard-only pass (Tab/Shift+Tab/Enter/Escape,
  no mouse) can reach and operate every filter, the legend toggle, a card,
  the correction drawer (opens with focus inside, closes with focus
  restored), and the export drawer; count/empty-state changes are
  announced; contrast spot-check documented.
- **Size:** M. **Depends on:** GOLF-17 (so the fix can be checked off against
  a written checklist, not just eyeballed).

**GOLF-19: Mobile responsive polish**
There's already one breakpoint (`@media (max-width:900px)`, stacks the
panel above the map) but it's never been tuned or tested — GOLF-8 explicitly
dropped this work before; reopening it now at the stakeholder's request.
Scope is responsive polish, not a redesign: same single file, same
interactions, no gesture-driven UI. Concretely:
- Real testing at 375/390/428px widths (iPhone SE/13/Pro Max-ish) via the
  Browser tool's mobile preset, not just eyeballing at desktop width.
- Touch target sizing — chips/toggle buttons are ~28–32px tall today;
  bump toward the ~44px guidance for touch.
- Form inputs under 16px font-size trigger unwanted auto-zoom on iOS
  Safari — `#q` and `.fld input` are both 13px; bump to 16px+ on mobile.
- The 50vh split between panel and map is cramped with 221 courses in a
  list; consider a collapsible/expandable panel or a "show map" toggle
  instead of a fixed half-height scroll box.
- Popup width is a fixed 300px (`leaflet-popup-content{width:300px!important}`)
  — needs to shrink or scroll on narrow viewports instead of overflowing.
- **Acceptance criteria:** verified at the three widths above with the
  Browser tool's `resize_window`; no horizontal scroll/overflow anywhere;
  every interactive element meets touch-target sizing; no iOS auto-zoom on
  input focus.
- **Size:** M. **Depends on:** nothing functionally, but do after GOLF-18 so
  the accessibility fixes (skip-link, focus management) don't need redoing
  for a second layout.

**GOLF-20: Fuzzy search**
Current search (`state.q`, in `passes()`) is a plain case-insensitive
substring match across name/region/architect/note/walk/station — a typo or
partial-word search can miss a course entirely. Replace with a small
vanilla-JS fuzzy scorer (no library — keeps the zero-build-step property),
e.g. a subsequence-match score or short-Levenshtein-distance threshold.
Search stays a **filter**, not a re-sort — the existing `Sort` dropdown
still governs list order; typing a query narrows the list but doesn't
silently reorder it by relevance, so behavior stays predictable.
- **Acceptance criteria:** a one-character-typo query (e.g. "Sunningdle")
  still surfaces the intended course; existing exact-match searches keep
  working unchanged; performance stays instant-as-you-type across 221
  entries (trivial at this scale, but worth confirming no jank).
- **Size:** S. **Depends on:** nothing.

**GOLF-21: Course imagery, done properly**
GOLF-11 deliberately skipped England Golf's `LogoImage` field — it's a raw
base64 blob averaging ~470KB *per club*, which would have bloated
`data/courses-top100.js` by tens of MB inline. The fix isn't to inline them
at all: fetch once, **decode and resize down to a real small file**
(target: ~160px wide, JPEG quality ~70, landing around 15–25KB each), save
under a new `images/clubs/` folder, and reference by relative path (keeps
`file://` portability — no CDN, no runtime fetch).
- New script dependency: resizing needs Pillow (`pip install Pillow`) —
  a one-time local dev dependency for the fetch script only, never shipped
  to the browser. Flagging this explicitly since every other script so far
  has used only the Python standard library.
- New `scripts/fetch_club_images.py` (decode + resize + save) and
  `scripts/merge_club_images.py` (add a `logo:"images/clubs/....jpg"` field
  to the matching course entries), following the existing fetch-then-merge
  pattern.
- Scope: the 75 of 96 Top 100 clubs that have a `LogoImage` in the data
  already fetched for GOLF-11 (re-usable, no need to re-hit the API). The
  121 London-catchment courses have never been looked up against England
  Golf at all — that's new scope, not included here unless the stakeholder
  wants it broadened.
- Popup UI: small thumbnail near the top of the popup, `alt="<club name>"`,
  `loading="lazy"`, and simply absent (no broken-image icon, no layout
  shift) for the ~23 clubs without one.
- **Acceptance criteria:** total added repo size stays in the low single-digit
  MB (not tens of MB); every popup with a `logo` field renders it; every
  popup without one renders identically to today; no broken-image icons
  anywhere in a full sweep across all 221 courses.
- **Size:** M. **Depends on:** GOLF-17 (extend the data-integrity script to
  check `logo` paths actually resolve to files that exist).

## Hosting — discussion, not a ticket (per stakeholder: after Phase 5 lands)

Answering the questions asked now, for when this comes back up:

- **What this app actually needs:** static file hosting only. Everything is
  pre-baked into `data/*.js` at build time (via the `scripts/` pipeline);
  the shipped page makes zero runtime API calls; the only per-visitor state
  (corrections, Played/Want-to-play, filters) lives in that visitor's own
  browser `localStorage` and never leaves it. No database, no server, no
  auth — the whole app is exactly what it looks like: an HTML file plus a
  handful of JS/data files.
- **GitHub Pages vs. Lovable:** GitHub Pages is the right fit and I'd
  recommend it — it's free, serves static files over HTTPS, and plugs
  directly into the git repo already in place (no remote configured yet).
  Lovable is an AI app-builder aimed at apps that need a real backend
  (database, auth, server logic); adopting it here would mean taking on
  infrastructure this app deliberately doesn't need, for no functional
  gain given today's requirements. It would become relevant if/when the
  app grows a feature that genuinely needs a backend — see "cross-device
  sync" below.
- **Security considerations for going public:** no secrets are ever shipped
  to the browser (API keys, where used at all, only ever touch the local
  one-off fetch scripts, not the committed data files); `scripts/output/`
  is already gitignored, so raw fetch dumps don't leak into the public repo;
  no user data is collected or transmitted anywhere, so there's no user-data
  security surface to reason about; HTTPS is automatic on GitHub Pages. The
  repo becoming publicly readable is a non-issue since every data source is
  already public (price lists, England Golf's own public club finder).
- **What would actually require a real backend later:** cross-device sync of
  corrections/Played-Want-to-play (currently trapped in one browser) — that
  crosses the line from "static site" to "app with user accounts and a
  database," which is a materially bigger, different project and exactly
  the kind of thing Lovable (or Supabase/Firebase/a small Cloudflare Worker)
  would suit. Not needed for GitHub Pages hosting on its own.

## Parked idea — now superseded by Phase 6 below

~~**Regional trip stringing**~~ — the "build a multi-course itinerary"
idea parked here previously is now scoped concretely as GOLF-28 in Phase 6.

- **All phases:** `node -c data.js` (or equivalent) after any data-file edit; the existing `popupHTML()`-over-all-courses "undefined" sweep (used last session to catch a real bug) is a cheap regression check worth re-running after any schema change.

## Phase 6 — Scotland & Wales data, and Trip Planning expansion (current round)

### Context

Phases 1–5 shipped a mature England-only map: 121 London-catchment courses,
100 nationally-ranked Top 100 courses, per-course stats, corrections, and a
working but basic Trip Planning mode (browse by region or by anchor-course
radius). Two gaps remain, both raised directly by the stakeholder after
using the live site: (1) the map only covers England — Scotland and Wales
have no data at all, despite being obvious, well-known golf destinations;
(2) Trip Planning is browse-only — it shows candidate courses but doesn't
let a user actually *build* a trip (select courses, see a rough total cost,
see a sensible visiting order), and region boundaries are rigid flat labels
with no sense of "a course just over the border is still relevant."

**Feasibility research done this session (not assumed):** both
`scottishgolf.org/find-a-facility` and `walesgolf.org/find-a-facility` were
loaded live and their network traffic inspected. Both are built on the same
"DotGolf" white-label platform as England Golf's own site (confirmed via
the "Powered by DotGolf" footer link, `dotgolf.co.nz`), exposing the same
unauthenticated `POST /api/clubs/FindClubs` endpoint with the **identical
response schema** already consumed by `fetch_england_golf_clubs.py`
(`ClubName`, `Latitude`, `Longitude`, `Phone`, `Website`, `LogoImage`,
`TeeBookingUrl`, `MembershipUrl`, etc.). A live search for "Carnoustie"
returned real data (`Carnoustie Golf Club`, `56.49777,-2.719007`, phone
`01241 852480`). This means Scotland/Wales is **not** a research spike like
GOLF-12 was — it's a known-shape integration, low-risk.

**Stakeholder decisions this round:**
1. Scotland/Wales scope: **curated notable courses** (mirrors how the
   England Top 100 was built), not a full nationwide club enumeration.
2. Trip-leg routing (real train/driving directions): **stays account-free
   for now** — no new API signup this round; straight-line ordering only.
3. Nearby towns/accommodation: **skipped for now**, not scoped this round.
4. Sequencing: **Scotland & Wales data first**, Trip Planning expansion
   second (gives the trip builder more courses to work with from day one).

### GOLF-25: Scotland data pipeline

Mirrors the existing England Top 100 pipeline exactly, pointed at
`scottishgolf.org` instead of `englandgolf.org`:

- **New script `scripts/fetch_scottish_golf_clubs.py`** — same shape as
  `fetch_england_golf_clubs.py` (takes a names file, POSTs to
  `https://www.scottishgolf.org/api/clubs/FindClubs`, one call per club),
  writing `scripts/output/scottish_golf_clubs.json` in the **same JSON
  shape** as `england_golf_clubs.json`. Because the shape is identical,
  **`merge_club_details.py` and `merge_club_images.py` should need zero
  changes** — just point them at the new output file and a new
  `data/courses-scotland.js`. Confirm the exact `FindClubs` POST payload
  (the search-text field name) by inspecting the request body in-browser
  before writing the script, the same way the response shape was confirmed
  this session.
- **Course list sourcing:** cross-check 2–3 published "Scotland's best
  courses" / links-course rankings via `WebSearch` (same pattern as
  GOLF-23's England Top 100 cross-check) to build the initial name list —
  Open Championship venues (St Andrews Old, Carnoustie, Muirfield, Royal
  Troon, Turnberry) plus other widely-recognised links courses (Royal
  Dornoch, Kingsbarns, Gleneagles, North Berwick, Cruden Bay, etc.). Target
  scale: smaller than England's 100 — Scotland has fewer nationally-known
  courses; finalise the actual count during sourcing rather than
  pre-committing to a number now.
- **Reused unchanged:** `compute_nearest_stations.py` / `merge_nearest_stations.py`
  for `nearStation` (the underlying station dataset is already GB-wide —
  ScotRail stations should already be present); `fetch_course_stats.py` /
  `merge_course_stats.py` for `courseStats` against golfapi.uk, if it has
  Scottish coverage (verify during the next scheduled RapidAPI run — this
  field degrades gracefully if absent, exactly like it does for England
  courses without data yet).
- **New data file `data/courses-scotland.js`** (`C_SCOTLAND` array),
  loaded via a new `<script>` tag and concatenated the same way
  `C_TOP100` is: `C.push(...C_SCOTLAND)`.
- **New `REGIONS` entries** for Scotland (a small number of sub-regions —
  e.g. an East/Fife coast group, a West/Ayrshire group, a Highlands group —
  rather than one flat "Scotland" bucket, so region filtering/sorting stays
  meaningful; exact boundaries assigned by hand from real course geography
  during implementation, same as the existing English regions were).
- **New flag field**, e.g. `topScot:1`, analogous to `top100:1`, plus a
  matching "Show only" filter chip (`buildChips('f-flag',...)`, existing
  pattern). Whether it carries a numeric ranking (`t100.sco`) depends on
  whether the sourced list is a genuine numbered ranking or just a curated
  set — decide once the source list is in hand.
- **Docs:** extend `SCHEMA.md`, `scripts/README.md`, `TESTING.md` following
  the exact conventions already established for `C_TOP100`.

### GOLF-26: Wales data pipeline

Same mechanical pattern as GOLF-25, pointed at `walesgolf.org` (API shape
already confirmed identical). New `scripts/fetch_wales_golf_clubs.py`,
`scripts/output/wales_golf_clubs.json`, `data/courses-wales.js`
(`C_WALES`), `topWales:1` flag. Expect a notably smaller list than Scotland
(Royal Porthcawl, Aberdovey, Conwy, Pyle & Kenfig, Nefyn, Ashburnham,
Celtic Manor among the obvious candidates) — source the same way via
`WebSearch` cross-checking. Same reuse of `merge_club_details.py`,
`merge_club_images.py`, `compute_nearest_stations.py`/`merge_nearest_stations.py`,
`fetch_course_stats.py`/`merge_course_stats.py` unchanged.

**Acceptance criteria (GOLF-25 + GOLF-26):** `node scripts/test_data.js`
passes with the new course counts; every new course has coordinates that
plot correctly (spot-check 3–5 against a real map); popups render with no
"undefined" (the existing sweep check); Scotland/Wales courses are
reachable from the default view the same way GOLF-22 fixed for the England
Top 100 (not buried at the end of an unfiltered list, fit-to-results still
works with the larger combined course count).

### GOLF-27: Region-adjacency for Trip Planning's "by region" mode

Directly answers the stakeholder's Surrey/SW-London border example.
`REGIONS` has no real geometry (flat label strings — confirmed, see
`data/config.js`), so rather than hand-maintaining a region-adjacency
table, adjacency is derived from actual course geography:

- When `tripByRegion(region)` runs, also include bookable courses from
  *other* regions whose straight-line distance (`haversineMiles()`,
  already exists) to their single nearest course *within* the selected
  region falls under a threshold (proposed default: 8 miles, exposed as a
  tunable number input in the drawer, reusing the existing radius-input UI
  pattern from anchor mode rather than hardcoding it invisibly).
- Border-included courses are visually distinguished in
  `tripResultsHTML()` (a small "border" chip) so it's clear *why* a Kent
  course appears under a Surrey search, rather than looking like a filter
  bug.
- Pure logic/UI change to `tripByRegion()` and `tripResultsHTML()` — no
  new data, no schema change.

### GOLF-28: Trip Builder — select courses, rough cost, suggested order

The core "plan an actual trip" feature, scoped to what's achievable
account-free this round (real routing/accommodation explicitly deferred,
see GOLF-29/30 below):

- **A "trip cart"**: new `TRIP` `Set<courseIndex>`, following the exact
  same pattern as the existing `PLAYED`/`WANT` sets (toggled from the
  popup via a new "Add to trip" action, persisted through the same
  `saveState()`/`clearStoredState()` `localStorage` mechanism).
- **A third Trip Planning mode**, "My trip", alongside the existing "By
  region"/"By anchor course" (extends `openTripPlanner()`/`tripPlannerMode()`),
  listing every course currently in `TRIP` with a remove control, showing:
  - **Rough total cost** — a best-effort numeric extractor over each
    course's `wd`/`we` free-text fee fields (first number found via
    regex, or the midpoint of a range like "£120–£180"), summed, and
    **explicitly labelled as a rough estimate with a coverage count**
    ("rough estimate — 4 of 6 courses have a parseable fee") rather than
    silently presenting a misleadingly precise number for fields that are
    often "Members only" or "Ask club".
  - **Suggested visiting order** — a simple greedy nearest-neighbour walk
    over the selected courses (reusing `haversineMiles()`), starting from
    the first-added course (or `HOME`), explicitly labelled "as the crow
    flies, not a real route" — consistent with the existing `nearStation`
    mileage disclaimer convention already used elsewhere in the app.
  - **Map view**: selected courses connected by dashed lines in that
    suggested order on `tripLayer` (same layer/pattern as the existing
    anchor-radius drawing), each course's own nearest station shown via
    the recently-added `nrStationMarker()` so a user can eyeball which
    legs are near a station.
  - **Export**: extend the existing "Review & export corrections" JSON
    export drawer (or a lightweight sibling of it) to include the current
    trip list, since there's no backend to persist it beyond this
    browser's `localStorage`.
- **Acceptance criteria:** adding/removing a course from the trip cart
  updates the "My trip" list and map immediately; reloading the page
  preserves the trip cart (same persistence guarantee as Played/Want);
  the cost estimate's coverage count is accurate; the suggested order
  changes sensibly when courses are added in a different sequence;
  `node scripts/test_data.js` still passes (no data-file changes expected
  from this ticket).

### GOLF-29 (parked, not scheduled): Real driving/train routing between trip legs

Per this round's decision, kept account-free for now. When revisited: two
free-tier candidates worth spiking first — OpenRouteService and GraphHopper
(both free-tier, both need the stakeholder to create an account, same
precedent as the golfapi.uk RapidAPI key). Would replace GOLF-28's
straight-line suggested order with real driving time/distance, and could
use the existing GB-wide station dataset to suggest which legs are
realistically doable by train.

### GOLF-30 (parked, not scheduled): Nearby towns / accommodation

Per this round's decision, skipped. When revisited: no free structured
accommodation data source currently identified; the cheapest viable
approach would likely be an external link-out (Google/Booking.com search
for the course's nearest town), same no-API-key pattern as the existing
"Find the club site" fallback — but there's currently no "nearest town"
concept in the data either (`nearStation` gives a *station* name, which
often but not always coincides with a town name). Needs its own short
research step before scoping properly.

### Verification approach for Phase 6

- **GOLF-25/26:** spot-check coordinates for 3–5 sourced courses per
  nation against a real map before merging; run `node scripts/test_data.js`
  after each merge; the existing `popupHTML()`-over-all-courses "undefined"
  sweep in-browser; confirm the default view / fit-to-results still
  surfaces Scotland/Wales courses sensibly (don't repeat GOLF-22's bug).
- **GOLF-27:** in-browser, pick "S London & Surrey" and confirm SW-London
  courses near the Surrey border appear with a "border" chip; tune the
  8-mile default if the result set looks obviously wrong in either
  direction.
- **GOLF-28:** in-browser, add 3+ courses spanning a real geography (e.g.
  a Scotland course + an England Top 100 course) to the trip cart, reload
  the page to confirm persistence, verify the cost estimate's coverage
  count matches which courses actually have parseable fees, verify the
  map draws the suggested order correctly.

## Phase 7 — Trip Builder pane redesign, and the itinerary-builder roadmap

### Context

GOLF-27/28 shipped a working but browse-only Trip Planning experience: a
centered modal drawer (shared chrome with the course-corrections editor and
the export panel — `.drawer`/`.sheet`, capped at 560px/88vh) with three
mode buttons (by region / by anchor course / my trip), each re-rendering
the same `#tp-body` div. It works, but the stakeholder tried it and wants
something more like a real trip-building workflow: pick a course, see
what's nearby, add it, watch the cart/cost/map update, and keep going —
"Royal Dornoch → (see nearby) → Castle Stuart → (see nearby) →  Nairn" —
without a modal popping up and blocking the map each time. The long-term
ambition is a full itinerary builder ("fly into Inverness Friday, drive to
Dornoch, play in the afternoon...") with real travel times and lodging
suggestions — big enough that it needs its own sequenced roadmap rather
than one ticket.

**Explicit product decision this round:** the new Trip Builder is not an
overlay on top of the existing list panel — it **replaces** it. When
active, it takes over the same grid column the filter chips + course-card
list normally occupy (`.app`'s `minmax(360px,420px) 1fr` grid, unchanged),
the way a "page within a page" would. The map stays in place in its own
column throughout. Region/anchor discovery browsing get folded into this
same pane as sub-tabs rather than living on as a separate modal flow —
confirmed with the stakeholder rather than assumed.

**Explicit product decisions on scope for this round:** no new API
signups — directions/travel-time between legs stay straight-line
(`haversineMiles`) for now, same as GOLF-28's ordering; accommodation
stays a plain link-out (no booking API integration) and is pushed to the
backlog below, not built this round.

Architecture research this session (verified directly against the current
file, not assumed) confirms the data model from GOLF-27/28 needs **no
changes** — `TRIP` Set, `saveState()`/`loadStoredState()` persistence,
`haversineMiles()`, `bookable()`, `tripByAnchor()`, `tripByRegion()`,
`tripOrder()`, `tripCostEstimate()`/`extractFee()`, `tripLayer`,
`nrStationMarker()` are all reused as-is. This round is a UI/rendering
redesign around that existing model, not a data-model rewrite.

### GOLF-31: Trip Builder pane (replaces the modal Trip Planning drawer)

Implements the full "select → see nearby → add → see cart/cost/route →
repeat" loop as a persistent left-hand pane, per the architecture designed
this session against [london-golf-map-v5_1.html](london-golf-map-v5_1.html):

- **New state:** `tripBuilderOn` (pane active flag), `tbAnchor` (index
  currently seeding the "nearby" discovery list — updates to the
  most-recently-added course as the user keeps picking), `tbRadius`
  (adjustable discovery radius, default 30mi), `tbDiscoveryTab` ('anchor'
  vs 'region' sub-tab). A `tbEffectiveAnchor()` helper falls back to the
  last-added cart course (Set insertion order) when the explicit anchor
  has been removed or none was set.
- **New DOM:** a `#tb-pane` div, sibling of the existing `.filters`/`.list`
  inside `<aside class="panel">`, toggled via a `body.trip-mode` CSS class
  (mirrors the existing `body.mob-list`/`body.mob-map` pattern already
  used for the mobile list↔map toggle) — `.filters`/`.list` hide,
  `.tb-pane` shows, no grid/layout change needed.
- **New functions:** `enterTripBuilder(seedAnchor)` / `exitTripBuilder()`
  (mode switch, entered from the popup's existing "Set as anchor course"
  button and from the panel's Trip Planning entry point, both already
  wired to call into this instead), `tbSelect(i)` (sets anchor + calls the
  existing `toggleTrip(i)` — this is the "add to cart and re-seed nearby
  list from here" action), `tbDiscover(anchor,radius)` (thin wrapper
  around the existing `tripByAnchor()` that excludes courses already in
  the cart), `tbDrawMap()` (draws the confirmed cart route and the
  not-yet-added discovery candidates on the map simultaneously — needs
  the existing `tripShow()`/`tripShowOrdered()` extended with optional
  `clear`/`fit` params so the two draws don't wipe each other out),
  `renderTripBuilder()` (the pane's render function, hooked into the
  existing `render()` so every existing mutation call site — filters,
  played/want toggles, corrections save — keeps the pane in sync for
  free).
- **Modified:** `closeDrawer()` gets a one-line guard so opening/closing
  the *unrelated* corrections editor while the pane is active doesn't wipe
  the live trip route off the map (today it unconditionally clears trip
  map overlays on any drawer close); `tripShow()`/`tripShowOrdered()` get
  the optional clear/fit params described above, defaulting to today's
  behavior so no other call site changes; the mobile "show map" handler
  gets a re-fit call so a route drawn while the phone is still on the list
  view isn't fit against a zero-size hidden map container.
- **Retired:** the modal `openTripPlanner()`/`tripPlannerMode()` flow and
  its mode-button bar — folded into the new pane as "Nearby" / "By region"
  sub-tabs instead of living on as a separate UI, per the stakeholder's
  explicit "replace the one already there."
- **Reused UI vocabulary** (no new CSS components): `.card`/`.card-top`/
  `.cname`/`.cfee`/`.cmeta` for cart and discovery rows, `.fld`/`.grid2`
  for the radius/region inputs, `.btn2`/`.togg` for actions and sub-tabs,
  `.hint` for empty states — all already usable outside the modal drawer.
- **Acceptance criteria:** from a course popup, "Set as anchor course"
  opens the pane in the left column (map untouched, list/filters hidden);
  the pane shows a live "nearby courses" list seeded from that course;
  clicking a nearby course adds it to the cart, updates the running cost
  estimate and coverage count, redraws the map with a numbered dashed
  route through the cart *and* the still-visible discovery candidates, and
  re-seeds the nearby list from the newly-added course (Dornoch → Castle
  Stuart → Nairn, matching the stakeholder's example); removing a course
  from the cart updates everything immediately; "Exit" returns to the
  normal filter/list pane with cart contents untouched (same persistence
  guarantee as today); a "By region" sub-tab still supports the GOLF-27
  border-adjacency browsing without a modal; reload the page — the pane's
  last state doesn't need to persist, but the cart (`TRIP`) does, same as
  today; mobile list↔map toggle still works with the pane in place of the
  normal list; `node scripts/test_data.js` unaffected (no data-file
  changes).
- **Size:** L. **Depends on:** nothing new — pure UI/rendering work over
  the existing GOLF-27/28 data model.

### Backlog — the fuller itinerary vision (not scheduled this round)

Sequenced roughly in the order they'd need to land, since each leans on
the previous one's output. None of these are started; each needs its own
scoping pass (and, where noted, a stakeholder decision on account/cost
tradeoffs) before implementation.

**GOLF-32: Real driving directions and travel time between legs**
Unlocks the "it'll take about 2 hours, arrive that evening" framing —
replaces GOLF-28's straight-line `haversineMiles()` ordering/labelling
with an actual driving route + duration per leg, still ordered by the
existing greedy nearest-neighbour walk (`tripOrder()`) unless a future
revision wants a real travelling-salesman optimization.
- **Data source options, researched this session:**
  | Option | Cost | Access | Notes |
  |---|---|---|---|
  | **OSRM, self-hosted** | Free, open source (BSD-2-Clause) | No API key — you run the server | Best long-term fit for this app's "no runtime API key" philosophy, but means standing up and maintaining a small server (a real infra decision, not a static-site change) — a genuine departure from "zero backend," worth flagging explicitly before committing to it. FOSSGIS runs a free public demo instance (powers OSM.org's own directions) but its terms restrict it to light/non-commercial use — fine for spiking, not for production traffic. |
  | **OpenRouteService** | Free tier: 2,500 requests/day | Needs a free account + API key (a real signup, same category as the golfapi.uk RapidAPI key blocked in Phase 3 — stakeholder has to create it) | Covers driving directions, distance matrix, and more; 2,500/day is generous for a small personal-use trip planner, cheapest path to "real directions" without standing up infrastructure. |
  | **GraphHopper** | No standing free tier found — trial only, then paid | Needs account + billing eventually | Deprioritize unless ORS's limits prove too tight. |
  | **Google Directions API** | Paid past a small free credit; needs a Google Cloud billing account | Best data quality/reliability, but heaviest signup and the only one with a real ongoing cost risk | Only worth it if data quality becomes a proven problem with the free options. |
- **Recommendation:** spike OpenRouteService first (free, one signup, real
  driving times) with OSRM self-hosting as the longer-term free option if
  usage ever needs to scale past the ORS free tier. Do not reach for
  Google Directions unless both free options prove insufficient.
- **Depends on:** GOLF-31 (needs the pane's cart/ordering UI to attach
  travel-time labels to).

**GOLF-33: Multi-day itinerary builder**
The "Friday: fly into Inverness, drive to Dornoch, play in the afternoon;
Saturday: play Castle Stuart in the morning, then Cruden Bay (2hr drive,
arrive evening)..." scenario. Needs: assigning cart legs to days, manual
entry for non-driving legs (flights, ferries) since that's out of scope
for any routing API, and rendering the driving-time output from GOLF-32
as human-readable day-by-day text. This is a genuinely new data
model/UI (a day-by-day schedule on top of the flat trip cart), not a small
extension — worth its own design pass when it's actually scheduled.
- **Depends on:** GOLF-32 (needs real travel times to say anything more
  useful than the existing straight-line disclaimers).

**GOLF-34: "Where to stay" — accommodation, link-out first**
Per this round's decision: no booking-API integration yet. Nearest-term
version is a plain "search hotels near here" link-out per overnight stop
(same no-API-key, `target="_blank"` pattern already used for club
websites/tee booking — see `popupHTML()`'s action buttons), pointed at a
Google or Booking.com search URL built from the course/town name — no
account, no key, no cost.
- **Real structured accommodation data, researched this session, for when
  link-out isn't enough:**
  | Option | Cost | Access | Notes |
  |---|---|---|---|
  | **Link-out only (recommended near-term)** | Free | None | No live pricing/availability shown, just a pre-filled search — matches the app's existing zero-API-key philosophy exactly. |
  | **Booking.com Demand/Affiliate API** | Free (commission-based) | Requires an application + manual review, can take weeks to approve | Best-known brand, but the approval process is a real blocker for "start small." |
  | **Amadeus Self-Service (hotel search)** | Free tier: 2,000 calls/month | Needs a free developer account | Reasonable fallback if live pricing is wanted before Booking.com approval lands. |
  | **Travelpayouts** | Free to register | Aggregates Booking.com/Agoda/others via one partner key | Easier signup than going direct to Booking.com; worth a look if link-out ever feels insufficient. |
- **Also needs:** a "nearest town" concept — `nearStation` today gives a
  *station* name, which often but not always coincides with a place a
  hotel search makes sense for; may need a small lookup or just use the
  station name as the search seed (imperfect but zero-cost).
- **Depends on:** GOLF-31 for the leg list to attach a stay-here link to;
  loosely benefits from GOLF-33's day structure (so "where to stay" attaches
  to a night, not just a leg) but doesn't strictly require it.

**Explicitly not scoped anywhere above:** flight search/booking (manual
entry only, per GOLF-33); a "smart" auto-optimized itinerary (day-splitting,
opening-hours-aware scheduling) — the vision is a builder the user directs,
not an autonomous planner, unless that changes later.

### Verification approach for Phase 7

- **GOLF-31:** in-browser — the exact acceptance-criteria walkthrough above
  (Dornoch → Castle Stuart → Nairn), plus confirm the corrections editor
  drawer can still be opened/closed while the pane is active without the
  map route disappearing, plus a mobile-width pass (`resize_window`) to
  confirm the list↔map toggle still works with the pane swapped in.
- **GOLF-32 (when scheduled):** spike against a handful of known
  course-to-course legs, sanity-check returned durations against Google
  Maps by hand before trusting the API's numbers in the UI; confirm the
  ORS free-tier daily cap is nowhere close to being hit at this app's
  traffic level before shipping.
- **GOLF-33/34 (when scheduled):** scope their own verification once
  designed — too far out to specify usefully now.

## Phase 8 — Trip Builder bugs (reported by stakeholder, 2026-08-27) — DONE

Three issues raised after using the GOLF-31 Trip Builder pane live.
Reproduced, root-caused, fixed, and verified in-browser this round;
committed as `7ce7adc` (GOLF-35/36 + a bonus desync bug found while
reproducing them) and `83328f9` (GOLF-37).

**GOLF-35 (bug, fixed): Nearest-station line appeared inside Trip Builder**
`nrStationMarker()` was drawing a course's nearest-station marker/link line
inside the pane, zig-zagging over the actual trip route. Fix: suppressed
entirely while `tripBuilderOn` is true (the normal single-course popup view
is unaffected — this was a Trip-Builder-only suppression).

**GOLF-36 (bug, fixed): Discovery list stuck on a stale anchor after clearing a trip**
Root cause confirmed: `tbAnchor` was only ever set inside `tbSelect()` (the
"pick a nearby suggestion" path), and never reset when the cart emptied —
so a stale anchor (e.g. Dornoch) survived a clear-then-rebuild in a
different region (e.g. Cornwall), and a course added via a plain popup
"Add to trip" (not `tbSelect()`) never updated the anchor at all. Fix: keep
`tbAnchor` in lockstep with every cart mutation inside `toggleTrip()`
itself — adding anchors to the course just added, removing the
currently-anchored course re-anchors to whatever's now last, emptying the
cart clears the anchor to null.

**Bonus bug found + fixed while reproducing the above:** `setAsAnchor()`
(the popup's "Set as anchor course" button — the actual entry point into
Trip Builder) added straight to the `TRIP` Set without pushing onto
`tripSeq`, desyncing the two so the cart display silently dropped the
anchor course. Routed through `toggleTrip()` so cart/order/anchor stay in
sync on every add path.

**GOLF-37 (done): Search-to-add inside Trip Builder**
Added a "Search & add a course" box at the top of the pane, reusing the
main list's `searchMatches()`/`levenshtein()` fuzzy logic. Lists bookable
courses not already in the cart; each result's "Add" adds to the cart and
re-seeds the Nearby discovery list from it, same as the Nearby/By region
tabs.

**Verification performed:** replicated the exact reported repro
(Dornoch → clear → Cornwall/Perranporth) through the real UI functions
(`setAsAnchor`/`tbSelect`/`toggleTrip`), confirmed zero station markers
while the pane is open, confirmed the anchor/discovery list correctly
follows Perranporth (Trevose, St Enodoc) instead of staying on Dornoch,
confirmed the new search box surfaces and adds courses correctly. `node
scripts/test_data.js` and the full `popupHTML()` "undefined" sweep both
pass clean. `TESTING.md` check #14 documents the manual repro for future
regression passes.

## Phase 9 — Rome2Rio-style itinerary planner (stakeholder direction, 2026-08-27)

### Context and decisions

After Phase 8's bug fixes landed, the stakeholder asked for the Trip
Builder to grow into a genuine day-by-day itinerary planner — "select your
courses, then say course 1 day 1, drive through to town A, course B the
next day" — Rome2Rio-style, with golf trips specifically as the selling
point. Decisions made this round:

1. **Skip GOLF-32's API dependency for now.** Rather than wait on a real
   routing API/account signup, drive times between legs are **entered
   manually** by the user for v1. GOLF-32 (real driving directions via
   OSRM/OpenRouteService) is demoted to a later enhancement that upgrades
   the same day-schedule data model rather than something GOLF-33 blocks
   on.
2. **Go straight to a GOLF-33-shaped feature**, redefined around manual
   drive times instead of GOLF-32's output. Day structure first
   (Day 1/Day 2/…), calendar-date anchoring later — stakeholder explicitly
   wants the flexibility of real dates eventually, but agreed relative-day
   numbering is the right v1 scope, with the data model chosen so
   attaching a real date later doesn't require a rebuild.
3. **Skip granular hotel→course drive times for now** — "10 min from
   hotel" is too fine-grained at this stage. A night's stay is a
   place/town, not a routed leg with its own timing.
4. **Split GOLF-34 in two:**
   - **GOLF-34a**: just a town/place suggestion per overnight stop — no
     booking, no live data. Many courses already sit in or near a named
     town, so this is close to free once the day-schedule model exists.
   - **GOLF-34b**: real accommodation data/booking integration, pushed out
     — same research already on file from Phase 7 (link-out first, then
     Booking.com/Amadeus/Travelpayouts if link-out proves insufficient).

### OSRM — explained to the stakeholder this round, captured for reference

OSRM is a routing *engine*, not a data source: feed it an OpenStreetMap
road extract (e.g. all of Great Britain, ~1-2GB), it precomputes a routing
graph via `osrm-extract`/`osrm-contract`, then answers drive-time/distance
queries fast. Two ways to use it, with different implications:

- **Self-hosted, called live at runtime** — free forever, no API key, no
  rate limit, but means standing up and maintaining a small server
  (Docker container on a cheap VPS/Fly.io/Render box) — a real, if small,
  piece of infrastructure, and a genuine departure from this app's
  "zero backend, fully static" property.
- **Self-hosted, but run once to pre-bake drive times into the data
  files** (recommended path when this gets picked up) — run OSRM locally
  as a one-off/on-demand script (same pattern as everything else in
  `scripts/`), compute drive times for the course pairs we care about,
  bake the results into `data/*.js`, and never call OSRM at runtime. Keeps
  the shipped page's zero-runtime-API-calls property intact, genuinely
  free, no ongoing hosting cost — but drive times go stale if road
  conditions/routes change and aren't periodically refreshed (same
  staleness tradeoff already accepted for the England Top 100 fee data,
  the club amenity data, etc. — refreshed on-demand, not live).
- **Public FOSSGIS demo instance** — free, no signup, but its terms
  restrict it to light/non-commercial use; fine for a one-off spike, not
  something to lean on for anything resembling real traffic.
- **Alternative, still parked from Phase 7**: OpenRouteService — needs a
  free account/API key (a real signup, same category as the golfapi.uk
  RapidAPI key still blocked on Phase 3) but no server to run; simpler ops
  than self-hosting, 2,500 req/day free tier.

Net recommendation for whenever GOLF-32 is actually scheduled: self-host
OSRM locally, run it once to pre-bake drive times into the data pipeline,
keep the shipped page static — matches how every other data source in
this app already works.

### GOLF-33 (redefined): Day-by-day itinerary — manual drive times — DONE

Implemented and verified this round. New `tripDays` state
(`{id,courses:[],driveIn}`, `id`-keyed as planned so a real calendar date
can attach later without restructuring), persisted via the same
`saveState()`/`localStorage` path as `TRIP`/`tripSeq`. Pane's cart section
now renders `tripDayScheduleHTML()` — day blocks with a per-course "move
to day" dropdown, a manual drive-in-minutes input on every day but Day 1
(explicitly labelled "your estimate — real directions coming later"), an
Unscheduled bucket for cart courses not yet placed, and "+ Add day"/
"Remove day" controls (removing a day falls its courses back to
Unscheduled rather than dropping them). The map's numbered dashed route
(`tripDayOrder()`) now follows day order end-to-end and colour-codes each
day's stops from a small fixed palette so "which stops are the same day"
is answerable from the map alone; unscheduled/unassigned courses keep the
original gold marker. Removing a course from the cart entirely also drops
it from whichever day held it — verified no orphaned references. The
JSON export (`open-export`) now includes a `days` array alongside the
existing flat `trip` array, `driveInMinutes` labelled as a user estimate.

Verified in-browser end-to-end: built a 2-day/4-course Highlands trip via
the real UI functions (`setAsAnchor`/`tbSelect`/`tripDayAdd`/
`tripDaySetCourse`/`tripDaySetDriveIn`), confirmed itinerary order and
day-coloured map markers, confirmed the drive-in value and full day
structure survive a page reload, confirmed removing a cart course cleanly
drops it from its day, confirmed removing a day (with courses still on
it) falls them back to Unscheduled rather than losing them, confirmed a
full `popupHTML()` sweep and a render of the pane itself both stay free
of "undefined". `node scripts/test_data.js` unaffected (no data-file
changes — pure app-state/UI, as scoped). `TESTING.md` check #16 documents
the manual walkthrough for future regression passes.

Deliberately not done this round (matches the original scope): no
reordering of courses *within* a day, no calendar-date anchoring (day
numbers only, per the agreed v1 scope), no automated drive-time source
(GOLF-32/OSRM stays parked, manual input only).

Extends the existing `TRIP`/`tripSeq` cart model with a day-schedule
layer, rather than replacing it:

- **New state**: `tripDays` — an ordered array of day objects, each
  `{id, courses:[courseIndex,...], driveIn: minutes|null}` (`driveIn` is
  the manually-entered drive time to reach this day's first course from
  wherever the previous day ended — the only drive-time data point
  requested this round; no per-course-to-course-within-a-day timing, no
  hotel-to-course timing, per decision #3 above). Days are numbered by
  position (Day 1, Day 2, …) — no real calendar date attached yet, but the
  `id` (not array index) is chosen so a future revision can attach an
  actual date to each day object without restructuring anything that
  already depends on day order.
- **Cart → schedule**: a course already in `TRIP`/`tripSeq` gets assigned
  to a day (a simple "move to Day N" control per cart row, plus "add a new
  day" — mirrors the existing ▲/▼ reordering UX already in the pane rather
  than introducing a new interaction pattern). A course can only be
  scheduled once it's in the cart — the day-schedule is an arrangement of
  the existing cart, not a separate selection step, so GOLF-37's
  search-to-add and the Nearby/By region discovery tabs all still feed it
  the same way they feed the flat cart today.
- **Manual drive-time input**: a plain number input (minutes) per day,
  labelled clearly as user-entered, not computed — "Drive to Day 2's first
  stop: [   ] min (your estimate — real directions coming later)" — so the
  UI is honest that this isn't measured, consistent with the app's
  existing straight-line-distance disclaimer convention.
- **Rendering**: the pane's cart section grows day headers (e.g. "Day 1 —
  Royal Dornoch, Brora" / "Day 2 — drive ~45 min → Castle Stuart, Nairn"),
  the map keeps its existing numbered dashed route but the day boundary
  should be visually distinguishable (e.g. a different marker style or a
  small day-number badge next to each stop) so a "which stops are the same
  day" question is answerable from the map alone.
- **Persistence**: `tripDays` saved via the same `saveState()`/
  `localStorage` mechanism as `TRIP`/`tripSeq`.
- **Acceptance criteria**: build a 4-course trip across 2 days
  (2 courses/day), confirm the pane shows a clear day-by-day breakdown,
  confirm entering a manual drive time persists across reload, confirm the
  map visually distinguishes which stops belong to which day, confirm a
  course removed from the cart is also removed from whichever day it was
  scheduled on (no orphaned references), confirm `node scripts/test_data.js`
  is unaffected (no data-file changes — this is pure app-state/UI).
- **Size**: M–L. **Depends on:** GOLF-31 (done) — no dependency on GOLF-32,
  deliberately, per this round's decision.

### GOLF-34a: Suggested town per overnight stop — DONE

Implemented as `tripDaySuggestedTown(day)`
([london-golf-map-v5_1.html](london-golf-map-v5_1.html)): for each day,
reads the nearest-station name (`STN[V(i,'stn')].n` or
`C[i].nearStation.n`, whichever exists) off the day's *last* course
(roughly where the night starts), falling back to the course's region
(`C[i].r`) when no station data exists, rendered as "Staying near:
`<name>`" beneath the day's course list (only ever null/absent when
neither signal exists — verified no "undefined" leaks through). No new
data source, no API — reuses fields already on every course. Verified
in-browser against both a `stn`-keyed course and a `nearStation`-only
course; `node scripts/test_data.js` and the full `popupHTML()` sweep both
pass clean. `TESTING.md` check #18 documents the manual walkthrough.

### GOLF-34b (parked, not scheduled): Real accommodation data/booking

Unchanged from Phase 7's original GOLF-34 research — link-out first
(Google/Booking.com search URL, no API key), then Booking.com
Demand/Affiliate API, Amadeus Self-Service, or Travelpayouts if link-out
proves insufficient. Revisit once GOLF-34a is live and it's clear whether
a plain link-out is enough or the stakeholder wants live pricing/booking.

### Sequencing for this round

**Bugs (GOLF-35/36/37) → GOLF-33 (day-by-day, manual drive times) →
thorough test pass → GOLF-34a (town suggestion).** GOLF-32 (real OSRM/ORS
driving times) and GOLF-34b (real accommodation) both stay parked,
revisited only once the manual-input version has been used and the
stakeholder has feedback on what's actually missing.

## Phase 10 — Trip Builder usability bugs, and a production proposal (2026-08-27) — DONE

Raised immediately after GOLF-33 shipped, before GOLF-34a starts. Fixed,
tested, committed as `5baebea` ("Trip Builder: one-click clear, drag
reordering, map declutter") and pushed.

**GOLF-38 (bug, fixed): No one-click way to clear a whole trip**
Previously the only way to empty a trip was removing each course one at a
time. Added `tripClearAll()` (confirms via a native `confirm()` dialog,
then resets `TRIP`/`tripSeq`/`tripLastAdded`/`tbAnchor`/`tripDays` and
persists) and a "Clear trip" button next to "+ Add day" in the pane.

**GOLF-39 (bug, fixed): No way to reorder courses outside a day, or within one**
GOLF-33's day-assignment dropdown had replaced the old ▲/▼ reorder
controls with no replacement — courses not yet assigned to a day, and
courses within the same day, had no ordering mechanism at all. Fixed with
native HTML5 drag-and-drop (`tbDrag` + `tbMoveCourseTo()`), styled like
dragging a stop into place on Google Maps: a `⠿` handle on every cart row,
draggable into any position within a day, within Unscheduled, or across
into a different day (which also reassigns it).

**GOLF-40 (bug, fixed): Map clutter around London while planning a trip**
`render()` was always populating the full 326-course marker-cluster layer
underneath the Trip Builder pane's own overlays. Fixed by skipping that
population entirely while `tripBuilderOn` is true — the pane's own
map drawing (cart route, discovery candidates) is unaffected, London (or
any dense area) just stops competing with it visually.

**Verification performed:** confirmed a full trip clears in one click
(via a `window.confirm` stub in-browser, since the native dialog can't be
driven by the browser-automation tool — a testing-tool limitation, not an
app bug); confirmed drag-and-drop reordering within Unscheduled, within a
day, and across days; confirmed the base course layer stays empty while
`tripBuilderOn` and repopulates correctly on exit. `node
scripts/test_data.js` and the `popupHTML()` "undefined" sweep both pass
clean. `TESTING.md` check #17 documents the manual walkthrough.

**Also delivered this round, alongside the bug fixes:**
- **Itinerary-as-its-own-page options**, presented to the stakeholder in
  chat: (A) a hash-based client-side route within the same single HTML
  file (recommended — gives a real shareable/bookmarkable URL while
  keeping the app's "no build step, one file" architecture), (B) a second
  static page (`trip.html`) sharing `data/*.js` and `localStorage`, (C) a
  full-screen takeover of the existing pane with no real routing/URL.
  Recorded as GOLF-41 below for whenever it's picked up.
- **A production/hosting proposal**, published as an Artifact
  (https://claude.ai/code/artifact/b5ddd8ad-2391-4ad8-af1a-5beab513ae69):
  recommends GitHub Pages (already the live host — free, zero new
  infrastructure, matches the app's fully static/zero-backend
  architecture), a launch checklist, an explicit list of what "production
  for other people" does *not* require (accounts, a database, GDPR/cookie
  consent, analytics) given every bit of per-visitor state stays in that
  visitor's own `localStorage`, and a cost ledger (£0/yr minimum). Also
  covers the page-vs-pane options above, recommending option A.

### GOLF-41: Give the itinerary planner a real URL — DONE

Implemented as a `#trip` URL-hash-driven view state layered directly on
top of GOLF-31's existing `tripBuilderOn`/`body.trip-mode` toggle — no
data-model change, pure routing + a wider trip-mode layout
([london-golf-map-v5_1.html](../../../Golf%20Map/london-golf-map-v5_1.html)):

- **`enterTripBuilder(seedAnchor,opts)`/`exitTripBuilder(opts)`** both
  gained an optional `{pushHash:false}` escape hatch (default `true`) and
  now call `history.pushState()` to set/clear `location.hash` to `#trip`/
  `''` whenever they run from a normal in-app trigger (header "Trip
  Builder" button, a popup's "Set as anchor course", the pane's "Exit"
  link) — `pushState` rather than a plain `location.hash=` assignment, so
  entering/exiting doesn't stomp on a real earlier back-stack entry.
- **`popstate` listener**: the single source of truth for what the
  browser's Back/Forward buttons do — re-enters or exits (both called
  with `pushHash:false`, since the history entry already reflects the
  target state) whenever the hash and `tripBuilderOn` fall out of sync,
  which is exactly what a Back/Forward press does.
- **On-load bootstrap**: a one-line check right after the existing
  `render()` call — `if(location.hash==='#trip')enterTripBuilder(null,
  {pushHash:false})` — so a direct navigation, bookmark, or shared link
  opens straight into the pane, no click-through needed.
- **Wider trip-mode layout**: a `@media(min-width:901px)` rule bumps
  `.app`'s grid from the normal `minmax(360px,420px) 1fr` list column to
  `minmax(480px,680px) 1fr` while `body.trip-mode` is set — the itinerary
  gets noticeably more room since it's now the point of the page, while
  the map stays visible throughout (not hidden/stepped-aside, a simpler
  and less disruptive choice than a full takeover). Below 901px the
  existing GOLF-19 mobile list↔map toggle is unaffected — trip mode
  already occupies the same single column the list did.
- **Verified in-browser**: direct navigation to `...html#trip` opened
  straight into the pane (`body.trip-mode` set, filters/list hidden,
  confirmed via a fresh isolated tab — an earlier same-tab, same-viewport
  test round-tripped through *stale* browser-cached documents across
  several same-origin different-query-string navigations, which produced
  confusing intermediate readings; a clean tab eliminated that noise);
  clicking "Exit" cleared the hash and browser state; the header's "Trip
  Builder" button re-set it; Back correctly exited the pane
  (`tripBuilderOn`→false, hash→''), Forward correctly re-entered it
  (`tripBuilderOn`→true, hash→'#trip'); at 1400px width the pane measured
  ~680px (up from the normal ~420px), map filling the remainder; a full
  `popupHTML()` sweep across all 326 courses stayed clean throughout.
  `node scripts/test_data.js` and a full inline-JS `node --check` both
  pass (no data-file changes — pure app-state/UI/routing).
  `TESTING.md` check #25 documents the manual walkthrough.
- **Depends on:** GOLF-31 (done).

## Phase 11 — Requirements: route, cost, booking, and multi-trip planning (2026-08-27)

### Context

The stakeholder's stated long-term vision: **a one-stop shop for booking a
golf trip, figuring out the route, and knowing what it will cost.**
Everything below is scoped against that, not just the immediate next
ticket — for each of the three product pillars (route, cost, booking) this
phase identifies exactly what can be built now with zero API access by
using honest, clearly-labelled estimates ("spoofing" real API output with
local heuristics/lookup data), versus what genuinely requires an external
service and what account/key the stakeholder specifically needs to obtain.
A fourth pillar — multi-trip management, trip variations, and
sharing/collaboration — was scoped as a ladder of four options (from
"local only" to "full real-time collaboration"); the stakeholder chose
**local multi-trip management only, no sharing yet**, as the target for
this phase (see GOLF-42).

Current-state facts below (verified directly against
[london-golf-map-v5_1.html](london-golf-map-v5_1.html) this round, not
assumed) ground every ticket's scope.

### Current state — cost, booking, and trip data model

- **Green fees**: stored as free-text `wd`/`we` strings per course (e.g.
  `"£17"`, `"£45–£50"`, `"Ask club"`, `"£34–£140"`). `extractFee()`
  (`london-golf-map-v5_1.html:892`) regex-extracts numbers and averages the
  *first two* found (a third number, e.g. a twilight rate, is silently
  ignored); returns `null` for text with no digits. Across all 326
  courses, **240 (73.6%) have a parseable weekday fee**, 86 don't (mostly
  "Ask club"/"Application"/day-restricted text). `tripCostEstimate()`
  (line 898) sums `extractFee()` over `wd` only for the courses in a trip,
  reporting `{total, covered, of}` — it **always reads the weekday fee**,
  even for a day that will land on a weekend once real calendar dates
  exist (a known gap to fix once GOLF-33 gets real dates — see GOLF-48).
  Cost is computed over the flat trip list only; there's no per-day cost
  breakdown yet.
- **Booking**: every course has plain `site`/`book` URL fields, plus
  (202/326 courses) a `clubInfo` object with `phone`, `teeBooking`,
  `membership`, `blurb`. All render as static `target="_blank"` links
  (`london-golf-map-v5_1.html:760-773`) — there is no in-app booking flow,
  form, availability check, or API call anywhere today.
- **Accommodation**: no data field exists at all yet — GOLF-34a (town
  suggestion) and GOLF-34b (real accommodation) are both still ahead of
  this phase in the backlog.
- **Trip/day model**: exactly **one** live trip at a time — `TRIP` (Set),
  `tripSeq` (array), `tripDays` (array of `{id,courses,driveIn}`) are all
  singular module-level globals (`london-golf-map-v5_1.html:404-434`).
  There is no name, ID, save-as, or concept of multiple trips anywhere;
  `wipeStoredState()` destroys the one live trip irreversibly. The export
  drawer produces a one-off JSON snapshot of *that* trip
  (`{source,exported,corrections,trip,days}`,
  `london-golf-map-v5_1.html:1539-1558`) — not a persisted, re-loadable,
  named trip.
- **Course stats**: `courseStats:{par,slope,rating}` populated for 66/326
  courses (feeds the existing Course Handicap calculator only).
  `nearStation`/`stn` (straight-line distance) populated for 200/123
  courses respectively.

### Pillar 1 — Route (drive times between legs)

**Spoofable now, no API needed:** replace GOLF-33's "type a number or
leave it blank" drive-in field with an **auto-estimated default** the user
can still freely overwrite. Formula: `haversineMiles()` (already exists)
between the previous day's last course and the next day's first course,
× a routing-inefficiency factor (~1.3, a standard rule-of-thumb correction
for real roads not being straight lines) ÷ an assumed average UK
A-road/motorway-blend speed (~38mph) → minutes, rounded to the nearest 5.
Clearly labelled **"auto-estimated from straight-line distance — replace
with a real number when you know it"**, visually distinct from a value the
user has actually typed in (e.g. an "auto" chip that disappears once
edited). No new dependency, no signup, ships as soon as it's scheduled.

**Not spoofable beyond that heuristic** — real turn-by-turn,
road-network-aware driving time needs GOLF-32's routing engine, unchanged
from Phase 9's research:
- **Self-hosted OSRM** — free forever, no API key, but is a genuine
  departure from "zero backend": either running a small server live, or
  running it once locally to pre-bake numbers into the data files
  (recommended if this path is chosen — keeps the shipped page static).
- **OpenRouteService** — free tier, 2,500 requests/day, no server to run.
  **Stakeholder action needed**: create a free account at
  openrouteservice.org, generate an API key, and hand it over — same
  category of ask as the still-outstanding golfapi.uk RapidAPI key from
  Phase 3.

Recommendation: ship the heuristic now (GOLF-43 below); revisit GOLF-32
only once the stakeholder wants to close the gap between "a good estimate"
and "the real number."

### Pillar 2 — Cost

**Green fees**: already ~74% coverage with zero API needed — worth a
small, self-contained improvement (GOLF-49) to `extractFee()`: stop
silently dropping a 3rd+ number, and read `we` instead of `wd` once a day
actually has a calendar date attached (ties to the GOLF-33 date-anchoring
work already flagged as future scope in Phase 9).

**Accommodation nightly cost — spoofable now**: a small static lookup
table of *typical* UK golf-trip hotel nightly rates by region/place tier
(e.g. London ~£120, Highlands/rural Scotland ~£90, English seaside resort
towns ~£85 — real ballpark figures, sourced the same way every other
one-off dataset in this app was, via a couple of `WebSearch` calls, not
invented), applied per overnight stay once GOLF-34a's town suggestion
exists. Clearly labelled **"typical rate — not live pricing."** No API,
no signup.

**Fuel cost — spoofable now, free bonus**: the same haversine-based
distance used for the route heuristic above can drive a rough fuel-cost
estimate (distance × an assumed £/mile) at essentially no extra cost,
labelled the same way.

**All of the above assembles into a genuinely new "Trip cost summary"**
(green fees + accommodation estimate + fuel estimate, each separately
labelled and separately toggleable off if a number feels wrong) —
buildable almost entirely from data already in the app plus one small,
clearly-sourced lookup table, with real numbers swapped in later exactly
where GOLF-32/34b eventually land.

**Real accommodation pricing/live booking** stays exactly as scoped in
Phase 7/9's GOLF-34b research — unchanged, still parked:
| Option | Cost | Access |
|---|---|---|
| Booking.com Affiliate/Demand API | Free (commission-based) | Application + manual review, can take weeks |
| Amadeus Self-Service | Free tier, 2,000 calls/month | Free developer account signup |
| Travelpayouts | Free | Free registration, aggregates several providers |

**Stakeholder action needed** (only once link-out-plus-estimate stops
being enough): pick one of the three above and create the free
account/API key — this is not something I can do on the stakeholder's
behalf, per this project's standing rules on account creation.

### Pillar 3 — Booking

**Tee-time booking, explicitly descoped from "book inside the app":**
there is no unified UK tee-time booking API a personal project can
realistically reach — clubs run on disparate systems (BRS Golf, Golf
Genius, in-house), and getting real booking access to each would mean
individual commercial partnerships, not an API key. Recording this
explicitly rather than letting it silently vanish from the roadmap: the
realistic, permanent shape of this pillar is the **link-out already
built** (`book`/`clubInfo.teeBooking`, live today) — send the golfer to
the club's own booking flow. No further work scoped here unless the
stakeholder specifically wants to pursue partnership-level integrations
with a specific booking platform later.

**Accommodation booking**: same three options as Pillar 2's cost section
— link-out today (once GOLF-34a exists), real booking flow gated on the
same stakeholder account decision.

### Pillar 4 — Multi-trip management, variations, and sharing (chosen: local-only for now)

Four options were scoped as a ladder (each is a superset of the
infrastructure below it); **the stakeholder chose the first — local
multi-trip management, no sharing** — as this phase's target, with the
other three recorded for whenever the stakeholder wants to revisit:

1. **Local multi-trip management only** *(chosen — see GOLF-42)* — zero
   backend, ships immediately.
2. **Export/import shareable link or file** — still zero backend; a
   compact encoded link or downloadable file a friend opens in their own
   browser to get their own copy. One-way snapshot, not live, no
   accounts.
3. **Magic-link cloud sync, no accounts** — a small backend (e.g.
   Cloudflare Workers + KV) stores a trip behind an unguessable random
   link; anyone with the link can view — optionally edit — the live
   version. This is the first tier that's a genuine departure from "zero
   backend, fully static," though it still needs no user accounts (the
   link itself is the "password").
4. **Full accounts + real-time co-editing** — Google-Docs-style: sign-in,
   invites, permissions, live multi-cursor editing. Matches the long-term
   vision most completely but is a substantial project of its own — a
   real backend plus an auth provider (e.g. Supabase Auth/Firebase Auth).
   Deliberately not this phase, consistent with the stakeholder's earlier
   "don't need to cater for login yet."

### GOLF-42: Local multi-trip management — DONE

Implemented via a snapshot layer over the existing live globals, rather
than threading a `tripId` through every function that already reads/
writes `TRIP`/`tripSeq`/`tripDays`/`tripLastAdded`/`tbAnchor` directly —
those all keep their exact pre-GOLF-42 meaning ("the current trip's
working state"); a new `trips` dict + `activeTripId` hold every trip's
snapshot, kept fresh by `tripSnapshotActive()` (called from `saveState()`,
so every existing mutation path — `toggleTrip`, `tripDayAdd`,
`tbMoveCourseTo`, etc. — updates the active trip's stored snapshot for
free, with zero changes to any of those functions) and restored by
`tripRestoreActive()` on switch/reload
([london-golf-map-v5_1.html](london-golf-map-v5_1.html)).

- **Storage shape**: `{trips:{tripId:{name,created,modified,trip,tripSeq,tripDays,tripLastAdded,tbAnchor,tripDayNextId}},activeTripId}` replacing the old flat `trip`/`tripSeq`/`tripDays` keys in `saveState()`/`loadStoredState()`. A one-time migration wraps any pre-GOLF-42 flat-format stored state into a single `trips.default` entry named "My trip" — verified in-browser, nothing lost.
- **UI**: a "My Trips" row (`tripSwitcherHTML()`) at the top of the Trip Builder pane — a switcher `<select>` (each option shows name + course count) plus New/Duplicate/Rename/Delete buttons. Delete refuses (via `alert()`) to remove the last remaining trip. The rest of the pane (day schedule, drag reorder, cost estimate, map drawing) is unchanged — it operates on the live globals exactly as before.
- **Export**: the export drawer's JSON now includes an `allTrips` array (name, courses, days per trip) alongside the existing single active `trip`, whenever more than one trip exists.
- **Verified in-browser**: created 2 extra trips, confirmed full state isolation (no bleed-through) switching between all 3; duplicated a trip and confirmed edits to the copy never touched the original; reloaded and confirmed all 3 trips, the active selection, and each trip's own day schedule survived intact; confirmed the last-trip delete guard fires; manually wrote a pre-GOLF-42 flat-format `localStorage` entry and confirmed it migrates cleanly into a single "My trip" with no data loss and no "undefined". `node scripts/test_data.js` and the full `popupHTML()` sweep both pass clean; no console errors. `TESTING.md` check #19 documents the manual walkthrough.

### GOLF-43: Auto-estimated drive times (route heuristic, zero API) — DONE

Implemented as `tripDayAutoEstimate()`/`tripDayEffectiveDriveIn()`/
`tripDayDriveHTML()` ([london-golf-map-v5_1.html](london-golf-map-v5_1.html)):
haversine distance between the previous day's last course and this day's
first course, × a 1.3 routing-inefficiency factor ÷ an assumed 38mph
average, rounded to the nearest 5 minutes. Deliberately never written
into `d.driveIn` itself — shown only via the input's `placeholder` plus
an "AUTO" chip, so it's always live-recomputed from current day
membership and vanishes for free (standard input behaviour) the instant
a visitor types a real number, which `tripDaySetDriveIn()` then stores
exactly as before. Day 1 never shows a drive-time row (nothing to drive
from); a day or its predecessor with no courses yet shows a plain "no
estimate yet" message instead of a stale/misleading number.

Verified in-browser: a London→Scotland leg produced a ~700-minute
estimate (sanity-checks against real driving time for that distance);
typing a real value immediately swapped the AUTO chip for the existing
"your estimate" copy and persisted across reload; `node
scripts/test_data.js` and the full `popupHTML()` sweep both pass clean;
no console errors. `TESTING.md` check #20 documents the manual
walkthrough.

### GOLF-44: Trip cost summary (green fees + accommodation + fuel, zero API) — DONE

Implemented as `ACCOM_RATE_BY_REGION`/`accomRateFor()`, `FUEL_COST_PER_MILE`,
`tripCostSummary()`, and `tripCostSummaryHTML()`
([london-golf-map-v5_1.html](../../../Golf%20Map/london-golf-map-v5_1.html)),
replacing the old single "Rough total (weekday fees)" block in the Trip
Builder pane. Three separately-labelled, individually-toggleable line
items:

- **Green fees** — unchanged `tripCostEstimate()`/`extractFee()` over the
  full cart, with its existing coverage count.
- **Accommodation** — a static nightly-rate-by-region lookup table
  (`ACCOM_RATE_BY_REGION`, `ACCOM_RATE_DEFAULT=95`), sourced via
  `WebSearch` for typical Aug 2026 UK 3-star rates and tiered across the
  app's 24 existing `REGIONS` values (London ~£100–110, South
  Coast/SW England/East Anglia ~£90–100, Midlands/North of England ~£85,
  Scotland ~£90–100, Wales ~£70–75). One night per scheduled day except
  the last (no stay needed after the final round), rate keyed off the
  region of each day's last course. Clearly labelled "typical rate — not
  live pricing."
- **Fuel** — reuses GOLF-43's new `tripDayLegMiles()` (extracted out of
  `tripDayAutoEstimate()` as a shared helper — the estimate and the fuel
  cost both need the same straight-line-adjusted distance, independent of
  whatever a visitor typed into the drive-time input) × a flat
  `FUEL_COST_PER_MILE=0.18`.

Each line has its own checkbox (`tbIncludeAccom`/`tbIncludeFuel`,
module-level UI state — not persisted to `localStorage`, resets to
checked on reload) that immediately re-renders the "Estimated trip total"
without that line's amount. New CSS: `.cart-cost-lines`,
`.cart-cost-line`, `.cart-cost-cov`.

Verified in-browser: built a real 2-day/4-course Scotland trip (Fife,
Ayrshire, Highlands courses), confirmed green fees/accommodation/fuel all
computed sane, non-"undefined" numbers (£1,715 fees over 3 of 4 courses,
£100 accommodation for 1 night, ~121 miles / £21.76 fuel); confirmed
unchecking accommodation dropped the grand total by exactly £100; full
`popupHTML()` sweep across all 326 courses stayed clean. `node
scripts/test_data.js` unaffected (no data-file changes). `TESTING.md`
check #21 documents the manual walkthrough.

**Depended on:** GOLF-34a (done) and GOLF-43 (done).

### GOLF-48: Weekend-aware cost estimate — DONE

Rather than wait indefinitely for some future ticket to attach real
calendar dates to `tripDays` (Phase 9's GOLF-33 explicitly shipped
day-numbers-only, no date anchoring), this ticket became that trigger
itself: added a small optional per-day `date` field
([london-golf-map-v5_1.html](../../../Golf%20Map/london-golf-map-v5_1.html)) —
a plain `<input type="date">` in each day's header, defaulting to unset,
validated as a well-formed `YYYY-MM-DD` string wherever a day is loaded
or saved (`validateTripEntry()`, `tripDaySetDate()`).

- **`feeFieldForDate(dateStr)`**: `null`/invalid → `'wd'` (exactly the
  old always-weekday behavior); a real date → `'we'` if it falls on a
  Saturday/Sunday, else `'wd'`.
- **`tripCostEstimateByDay()`**: replaces the flat `tripCostEstimate(tripSeq)`
  call in `tripCostSummary()` — every scheduled day's courses are costed
  using that day's own `feeFieldForDate()` result; Unscheduled courses
  (no day, no date context) keep the old flat wd-only behavior, since
  there's nothing to derive a weekday from. `tripCostEstimate()` itself
  is untouched (kept as the single-list primitive `tripCostEstimateByDay()`
  is built from conceptually, even though nothing else calls it directly
  anymore).
- **Export**: the JSON export's `days` array now includes `date` per day
  alongside the existing `driveInMinutes`, for both the active trip and
  (via `allTrips`) every other saved trip.
- **Verified in-browser**: found a real course with a >£5 wd/we gap
  (Trent Park Golf Course, £17 wd / £27 we); with no date set the
  estimate correctly used £17; setting the day's date to a real Saturday
  switched it to £27; setting it to a Monday switched it back to £17; the
  date survived a full page reload; full `popupHTML()` sweep across all
  326 courses stayed clean. `node scripts/test_data.js` unaffected (no
  data-file changes — pure app-state/UI). `TESTING.md` check #24
  documents the manual walkthrough.

### GOLF-49 (reviewed, not changing): `extractFee()` and a 3rd+ number

Checked against real data before implementing (a one-off Node script over
all 326 courses' `wd` fields) rather than assuming the original framing —
**only 1 of 326 courses** has 3+ numbers in `wd`
("Sandown Park Golf Centre", `"~£10–£12 (9 hole par 3)"`), and for that
one case the current "average the first two" logic already gives the
correct answer (£11) — a generic "average every number found" fix would
actually make it worse (£10.33, corrupted by the irrelevant "9" in
"9 hole"). Decision: leave `extractFee()` as-is; revisit only if future
course data shows a genuine real-world case this logic gets wrong.

### GOLF-46: "Show POIs" per overnight stop — DONE

Implemented as a "Show POIs" toggle next to each day's "Staying near"
line in the Trip Builder pane
([london-golf-map-v5_1.html](../../../Golf%20Map/london-golf-map-v5_1.html)),
querying ORS's POI endpoint through the same Worker as GOLF-45 (routed
server-side by a `mode:'pois'` field the Worker checks before falling
through to the driving-directions handler — no new stakeholder action,
same key, same deployed Worker at
`https://geofftheworker.stefand94.workers.dev/`).

- **Worker** (`scripts/cloudflare-worker/ors-proxy.js`): `handlePois()`
  takes `{mode:'pois', point:[lng,lat], radius?, categories?}`, calls
  ORS's `/pois` endpoint with a `geojson` Point + `buffer` geometry, caps
  `radius` to 200–5000m and `category_ids` to 5 entries server-side
  (discovered live against the real API — ORS 400s past 5 categories;
  found via a temporary debug pass that echoed ORS's own error detail
  back through the proxy, since removed), and simplifies the GeoJSON
  FeatureCollection response down to `{pois:[{name,category,lat,lng}]}`.
- **App side**: `POI_CATEGORIES` is deliberately narrowed to 5 ids — fuel
  (596), restaurant (570), fast food (566), hotel (108), guest house
  (106) — to fit ORS's cap; café/bar/hostel dropped. `tbPoisFor(day)`
  mirrors `tripDayRealEstimate()`'s exact contract (cache lookup ->
  `null` on miss + async fetch + cache + re-render, silent on failure),
  cached in `localStorage` under `golfmap:poicache:v1` keyed by the day's
  last-course coordinates. `tbPoiOn` (a plain in-memory `Set` of day ids,
  not persisted — resets to hidden on reload, same as GOLF-44's cost-line
  checkboxes) drives the toggle; `tbPoiListHTML()` renders the result
  list under the day, `tbDrawPois()` draws small purple dots on the map
  for whichever days are toggled on — deliberately excluded from the
  route's `fitBounds` call so a petrol station never zooms the map away
  from the actual trip. `tripDayRemove()`/`tripClearAll()` both clean up
  `tbPoiOn` so no stale toggle survives a removed day or a cleared trip.
  Whole feature is inert (button doesn't even render) when
  `ORS_PROXY_URL` is unset, same pattern as GOLF-45.
- **Verified against the real deployed Worker**: a direct `curl` POST
  with the 5 narrowed category ids returned real nearby POIs (Carnoustie
  Golf Hotel, Thai Kitchen, Old Course Hotel, etc.); in-browser, a fresh
  cache miss correctly returned `null` and fired the fetch, which
  resolved with 29 real POIs, rendered cleanly in the list with no
  "undefined"; a repeat call against the warm cache made zero additional
  fetch calls (verified by wrapping `window.fetch`); full `popupHTML()`
  sweep across all 326 courses stayed clean; `node scripts/test_data.js`
  unaffected. `TESTING.md` check #23 documents the manual walkthrough.

### Follow-up clarifications (stakeholder questions, 2026-08-27)

Answered directly, verified against current provider docs (not assumed)
before recording here:

- **Google sign-in**: cheap to wire up on its own (Google Cloud project +
  OAuth client ID, ~15 min free; Google Identity Services JS, a few
  hours) — but on a pure static site it can only identify who *claims* to
  be signed in for display purposes; it can't securely gate or store
  per-user data without a backend to verify the token and own that data.
  Becomes cheap (half a day, not a separate project) only once Supabase
  Auth or Firebase Auth exists for Tier 3/4 sharing, since both bundle
  "Sign in with Google" as a checkbox on top of the account system that
  work would need anyway. **Stakeholder call: not a priority — recorded
  here, no ticket yet.**
- **OpenRouteService**: account+key is minutes of stakeholder effort.
  The real design question is that calling ORS straight from the browser
  either exposes the API key in page source (anyone can copy it and burn
  the free 2,500 req/day quota) or needs a small proxy. Confirmed via
  ORS's own community docs that a server-side proxy is the standard
  recommendation for exactly this reason. **Stakeholder call: worth doing
  sooner rather than later** — scoped concretely as GOLF-45 below, moved
  up in sequencing since it's genuinely small.
- **Travelpayouts, confirmed against their own docs**
  ([Hotel Search API](https://support.travelpayouts.com/hc/en-us/articles/203956133-Hotel-search-API),
  [travelpayouts.com](https://www.travelpayouts.com/en/)): yes, it's
  exactly the "surface hotels + monetize on booking" model — their Hotel
  Search API returns real aggregated pricing for an area, and pays a
  commission (from the hotel/OTA brand, not deducted from a shared pool)
  whenever a user books through your link, tracked via a last-click
  cookie and paid out monthly. Two caveats: API access is free but
  **granted on individual request/approval**, not instant self-serve like
  ORS; and their UI rules require showing the full result set with a
  "Book" button per hotel, with the outbound link firing only on that
  click. Real monetization path, but with an approval-wait ORS doesn't
  have — worth applying early if GOLF-34b/accommodation gets picked up,
  precisely because the wait is the bottleneck, not the engineering.

### GOLF-45: Real driving times via OpenRouteService, behind a small proxy — DONE

Fully live. Stakeholder deployed the Worker at
`https://geofftheworker.stefand94.workers.dev/` and added `ORS_API_KEY`
as an encrypted secret; `ORS_PROXY_URL` in
[london-golf-map-v5_1.html](../../../Golf%20Map/london-golf-map-v5_1.html)
now points at it.

**Verified end-to-end against the real deployed Worker** (not just
stubbed): a direct `curl` POST to the Worker returns a real ORS driving
time/distance (Carnoustie → Inverness-area leg, ~230min/188mi for the
in-browser test pair); in-browser, a fresh cache miss on
`tripDayRealEstimate()` correctly returned `null` and fired the real
fetch, which resolved with the live figures, updated
`tripDayEffectiveDriveIn()` to `real:true`, and rendered the "live" chip
in the pane; a repeat call against the now-warm cache made **zero**
additional fetch calls (verified by wrapping `window.fetch` and counting
invocations); full `popupHTML()` sweep across all 326 courses stayed
clean; `node scripts/test_data.js` unaffected.

- **Worker** (`scripts/cloudflare-worker/ors-proxy.js`): stateless, no
  database/state. Takes `POST {origin:[lng,lat],destination:[lng,lat]}`,
  calls ORS's driving-directions endpoint with the key read from
  `env.ORS_API_KEY` (an encrypted secret, never in the script body),
  returns `{minutes,miles}`. CORS open (`Access-Control-Allow-Origin: *`)
  — safe since the app has no login/session and the only thing worth
  guarding is the ORS key, which stays server-side. This is the app's
  first piece of server-side infrastructure ever, a deliberate small
  departure from "fully static" — but it changes nothing about how the
  main app itself is hosted (still GitHub Pages).
- **App-side** (`ORS_PROXY_URL`, `tripDayRealEstimate()`,
  `tripDayEffectiveDriveIn()`, `tripDayDriveHTML()`): `ORS_PROXY_URL`
  defaults to `''` — every code path checks this first and returns `null`
  immediately when unset, so the feature is fully inert (falls straight
  through to GOLF-43's heuristic) until the stakeholder's URL is filled
  in. `tripDayRealEstimate(dayIdx)` checks a `localStorage` cache
  (`golfmap:legcache:v1`, keyed by the leg's rounded lat/lng pair) first;
  on a miss it fires an async fetch to the proxy, caches the result, and
  re-renders the pane once it resolves (only if the pane is still open) —
  so a second view of an unchanged trip never re-hits the proxy or burns
  quota. `tripDayEffectiveDriveIn()` now prefers, in order: the visitor's
  own typed number → a cached real ORS estimate → the GOLF-43 heuristic —
  so nothing regresses for anyone before the Worker exists.
  `tripDayDriveHTML()` shows a distinct green "live" chip + "real driving
  time via OpenRouteService" copy when a real estimate is showing, vs.
  the existing "auto"/heuristic chip otherwise.
- **Verified in-browser**: with `ORS_PROXY_URL=''` (the shipped default),
  confirmed the drive-time field behaves identically to pre-GOLF-45
  (heuristic, AUTO chip, no network calls attempted). Temporarily set
  `ORS_PROXY_URL` to a dummy value with `window.fetch` stubbed to confirm
  the full live path: first call is a correctly-reported cache miss
  (async fetch fires), a moment later the cache holds the real value and
  `tripDayEffectiveDriveIn()`/`tripDayDriveHTML()` both switch to the
  "live" chip and copy; reverted `ORS_PROXY_URL` back to `''` before
  committing (never shipped non-empty without the stakeholder's actual
  URL). Full `popupHTML()` sweep across all 326 courses stayed clean.
  `node scripts/test_data.js` unaffected (no data-file changes).
  `TESTING.md` check #22 documents both the inert-by-default check and
  the stubbed-live-path check for future regression passes.
- **Acceptance criteria met**: real trip drive times will reflect actual
  ORS driving durations once the URL is set; repeated views of an
  unchanged trip don't re-hit the proxy (verified via the cache-hit path
  above); a failed/rejected fetch falls back to the heuristic silently,
  no broken UI (verified via a stubbed-rejection path); the ORS key never
  appears anywhere in the client-side app — it only ever exists inside
  the Worker's encrypted secret store.
- **Depends on:** GOLF-43 (done, the heuristic this supersedes/falls back
  to) and the stakeholder's ORS key (provided) — now blocked only on the
  stakeholder deploying the Worker and sending back its URL.

### Sequencing for this phase

**GOLF-34a (done) → GOLF-42 (done) → GOLF-43 (done) → GOLF-44 (done) →
GOLF-45 (done, live) → GOLF-46 (done) → GOLF-48 (done) → GOLF-41 (done).**
All eight tickets originally sequenced for this phase are now shipped.
GOLF-49 reviewed against real data and closed as not-worth-changing (see
above). GOLF-34b/real
accommodation booking stays parked, blocked specifically on the
stakeholder picking a provider (Travelpayouts now the leading option,
given the confirmed monetization path — but its API access needs an
early application given the approval wait) and completing that
signup/approval — not blocked on any further scoping work. Google
sign-in stays a recorded-but-unscheduled roadmap note. Pillar 4's tiers
2–4 (export/import link, magic-link cloud sync, full accounts) stay
recorded but unscheduled, revisited whenever the stakeholder wants to
move past local-only trip management.

## Phase 12 — Real driving routes, free/start/end days, hover tooltips, per-leg coloring, and UI research (2026-08-27)

### Context

Stakeholder asked for five things in one message: (1) real driving routes
on the map instead of straight dashed lines, (2) free/start/end days (a
day with no golf — an arrival, a rest day, a departure — optionally
carrying a plain place name), (3) hover tooltips on courses (name, fee,
ranking), (4) per-leg colour-coding of the route so a multi-day trip
doesn't read as one undifferentiated line, (5) UI research on how other
trip planners (Wanderlog, Rome2Rio) present an itinerary, with
suggestions to follow up on. Stakeholder chose to build #1-4 in one pass
rather than stage them.

### GOLF-50: Real driving routes + per-leg colour-coding — DONE (app side); Worker redeploy pending

`ors-proxy.js`'s `ORS_DIRECTIONS_URL` switched to the `/geojson` directions
variant, which returns route geometry alongside the same duration/distance
summary at no extra request/cost. `handleRoute()` now parses the
GeoJSON `FeatureCollection` shape and returns `route:[[lat,lng],...]|null`
alongside `minutes`/`miles`, capped at `ROUTE_MAX_POINTS=150` via a new
`simplifyRoute()` helper. `ORS_CACHE_KEY` bumped `v1`→`v2` (a deliberate
cache-abandonment, not a migration — old entries have no `route` field and
distinguishing "old entry" from "ORS genuinely found no geometry" isn't
reliable, so the cleanest fix is a fresh key). A shared `orsEnsureLeg()`
helper now backs both the existing drive-time estimate and the new
`orsLegRoute()`, so both share one fetch+cache path and `orsPending`
dedupes concurrent requests regardless of caller.

`tripShowOrdered()`'s route drawing changed from one continuous straight
dashed polyline to one `L.polyline` per consecutive leg, colour-coded by
the arriving stop's day, solid when real ORS geometry is cached, dashed
straight-line fallback otherwise — mirrors the existing auto/real visual
convention from GOLF-43/45.

**Blocked on stakeholder action**: the live Worker at
`https://geofftheworker.stefand94.workers.dev/` has not been redeployed
with this file's contents yet, so real route geometry won't appear live
(or fully testable locally) until that happens — same redeploy flow as
GOLF-45/46 (paste `ors-proxy.js` into the Cloudflare dashboard editor,
Save/Deploy).

### GOLF-51: Free/start/end days — DONE

Each `tripDays` entry gained two optional fields: `kind`
(`'golf'|'start'|'free'|'end'`, default `'golf'`) and `place` (free text,
≤80 chars, trimmed — no coordinates; the app's only station dataset is
London-only, so a real geocoded place picker was explicitly out of scope
this round). `tripDayScheduleHTML()` renders a day-type `<select>` plus a
place `<input>` per day, with kind-aware header/hint copy and a coloured
left border (stone for start/end, purple for free days). `tripDayOrder()`
already only walks `d.courses`, so start/free/end days (which typically
carry no courses) are naturally skipped from the map route/cost logic
with no additional code change. Verified in-browser against the
stakeholder's own example (Arrive in Edinburgh → St Andrews Old → Free
day in St Andrews → Carnoustie → Edinburgh end) — data model, rendering,
and persistence through `localStorage` all confirmed.

### GOLF-52: Hover tooltips on course markers — DONE

`courseTooltipHTML(i)` (name, fee, ranking) bound via
`m.bindTooltip(...,{direction:'top',offset:[0,-28],className:'course-tt'})`
alongside the existing popup binding. Verified programmatically (the
browser-automation tool's synthetic hover doesn't reliably trigger
Leaflet's real `mouseover` binding — a known testing-tool limitation, not
an app bug) via `marker.openTooltip()` + DOM inspection, then visually via
a forced-open screenshot.

### UI research (#5) and immediate follow-up requests — DONE

Presented research on Wanderlog/Rome2Rio-style itinerary UI. Stakeholder
liked the numbered-day-pin styling and Rome2Rio-style route colouring
already underway (no action needed) and gave three follow-ups:

- **Logged as a future requirement, not built this round**: Wanderlog-style
  ability to add multiple items per day (not just one golf round) — a
  genuinely new data model on top of `tripDays`, deferred until there's a
  concrete need.
- **GOLF-53: Move the "Search & add a course" box higher in the Trip
  Builder pane — DONE.** Moved above the day-schedule cart, directly under
  the trip switcher, so it's one of the first things visible on entering
  the pane.
- **GOLF-54: Replace the radius-based "Nearby" discovery list with a
  fixed nearest-5-by-haversine-distance list — DONE.** Stakeholder
  feedback: a distance-radius cutoff was "confusing" (empty or overflowing
  depending how remote the anchor was, with no clear signal why).
  `tripByAnchor(anchor,radiusMiles)` became `tripByAnchor(anchor,limit)` —
  sorted by straight-line distance, sliced to the requested count; the
  "Nearby" tab now always shows the 5 closest not-yet-added bookable
  courses to the current anchor, no radius input. The `tb-radius` UI and
  `tbRadius` state were removed entirely.

### Verification / remaining steps

Local `node --check` on the inline app JS and on `ors-proxy.js` both pass.
`node scripts/test_data.js` unaffected (no data-file changes this phase).
GOLF-50's Worker redeploy is done (see Phase 12 update below); GOLF-51's
`kind`/`place` reload-persistence was confirmed as part of GOLF-56's
verification pass. `TESTING.md` check #30 covers this round's newest
addition.

**GOLF-50 update: Worker redeployed and fully verified — DONE.** The
Cloudflare Worker at `https://geofftheworker.stefand94.workers.dev/` is
now live with real route geometry, confirmed via direct `curl` (POST
returns `{minutes,miles,route:[[lat,lng],...]}`) and in-app (a real
2-course trip rendered a solid, road-following 151-point polyline rather
than a straight dashed line). GOLF-55 (Git auto-deploy) is also fully
closed — resolved a live deploy incident along the way (blank Build root
directory, and `ORS_API_KEY` initially in the wrong "Variables and
secrets" section) — both fixed and verified live.

### GOLF-56: Place search for start/free/end day locations — DONE

Stakeholder asked: "start in London, drive to Newquay then play
Perranporth on day 2 — I want to see the drive for all 3 and search for
each place." Also asked whether the API supports public transit/train
routing — confirmed via `ask.openrouteservice.org`/
`giscience.github.io/openrouteservice` that ORS's free hosted API does
**not** support transit routing (needs a self-hosted instance with GTFS
data — out of scope); its geocoding/autocomplete endpoint **does** work
off the same key with no new signup, and became this ticket's data
source.

- **Worker** (`scripts/cloudflare-worker/ors-proxy.js`): new
  `mode:'geocode'` request kind — `handleGeocode()` calls ORS's
  `/geocode/autocomplete` endpoint (key passed as a query param, not the
  `Authorization` header the directions/POI endpoints use — a real,
  confirmed API difference), boundary-limited to GB, returns
  `{results:[{label,lat,lng}]}`. Deployed and verified live via `curl`.
- **Data model**: `tripDays` entries gained `placeLat`/`placeLng`
  alongside GOLF-51's existing `place` text field — `tripDaySetPlaceGeo()`
  sets all three from a picked result; manually editing the text field
  (`tripDaySetPlace()`) clears the coordinates, since free text no longer
  has a known location. `validateTripEntry()` migrates/validates both new
  fields; multi-trip snapshot/restore (GOLF-42) needed no changes since
  it deep-copies `tripDays` wholesale.
- **"Stop" abstraction**: introduced `tripDayStops(dayIdx)` (a day's
  optional geocoded place, then its courses, each as
  `{type,lat,lng,name,day}`) plus `tripDayFirstStop`/`tripDayLastStop`.
  `tripDayOrder()` now returns a flat array of these stop objects
  (instead of a course-index array + separate `dayOf` map).
  `tripShowOrdered()`, `orsLegKey`/`orsEnsureLeg`/`orsLegRoute`, and
  `tripDayRealEstimate`/`tripDayLegMiles` were all generalized from
  course-index-only to generic `{lat,lng}` points, so a geocoded place
  slots into the exact same leg-fetch/cache/draw machinery as a course
  with zero special-casing. Place stops draw as a hollow-ring marker,
  visually distinct from a solid course marker.
- **UI**: each day's place `<input>` is now a search-as-you-type box —
  debounced `input` listener calls the new `orsGeocode(text,cb)` helper
  (in-memory cache, no localStorage — search text is transient), renders
  a results dropdown; row selection uses `mousedown`+`preventDefault()`
  (not `click`) so the input's `blur` doesn't clobber the pick first.
  JSON export includes the new coordinate fields.
- **Verified live end-to-end**: built the stakeholder's exact example
  (Day 1 start=London, Day 2 free=Newquay + Perranporth) via real
  geocode calls against the deployed Worker — `tripDayOrder()` correctly
  produced London→Newquay→Perranporth in sequence, a real ORS drive-time
  ("LIVE" chip, 299 min for London→Newquay) and fuel estimate computed
  over the place leg, distinct hollow-ring markers for the two places vs.
  solid markers for the course, full state (`place`/`placeLat`/
  `placeLng`) survived a page reload, and a full `popupHTML()`/
  `courseTooltipHTML()` sweep across all 326 courses stayed clean. `node
  --check` and `node scripts/test_data.js` both pass. `TESTING.md` check
  #30 documents the walkthrough.

## Backlog — Trip Builder pane visual redesign (stakeholder request, 2026-08-27)

**Raised directly by the stakeholder, not yet scoped**: "I might send you
some wireframes later on to show an update of how I want to see the
planner. I don't like its current form." This is an open, unscoped
backlog item — the pane's current visual design (card-based day blocks,
inline drag handles, stacked chip/note styling — everything built across
Phases 7-12) works functionally but the stakeholder wants a different
overall look. No implementation should start on this until the wireframes
arrive; when they do, the actual redesign should be scoped as its own
ticket(s) against them rather than guessed at now.

**Superseded by Phase 13 below** — the stakeholder's promised follow-up
arrived as a full design-tool handoff (README + interactive mockup),
implemented autonomously while they were away.

## Phase 13 — 5-tab Trip Builder sidebar redesign, implemented while stakeholder was away (2026-08-28)

### Context

Stakeholder sent a zip (`Golf itinerary sidebar UI.zip`) containing a
proper design handoff for the pane redesign flagged in the backlog item
above: a `README.md` spec plus an interactive `.dc.html` mockup (a
proprietary design-tool export, needs its own `_ds/` bundle to render —
opened in-browser but only showed unfilled template placeholders since
it's outside the project and its JS runtime didn't execute; the README's
own instructions explicitly say not to copy its markup anyway, so the
README's prose was used as the source of truth throughout, consistent
with that instruction). Stakeholder's explicit instruction: implement it
fully without further check-ins, document decisions and open questions,
and report back with a concise remaining-features list once done — see
[GOLF-57] below for both.

### GOLF-57: 5-tab Trip Builder pane redesign — DONE

Replaced the flat `.tb-pane` content with the spec'd 5-tab structure
(Itinerary/Day/Costs/Add/Discover), built directly in
[london-golf-map-v5_1.html](london-golf-map-v5_1.html) against the app's
existing conventions (no new build step, single `<style>` block, vanilla
JS), reusing the entire existing Trip Builder data model
(`TRIP`/`tripSeq`/`tripDays`, multi-trip snapshot/restore, day-coloured
map route, ORS-backed real/heuristic drive times, discovery/anchor
logic, fuzzy search) with **one genuinely new data-model addition**, as
the README itself flagged as necessary: `tripDays[].hotel:{name,price}`
and `tripDays[].pois:[{name,price}]`, added via `tripDaySetHotel()`/
`tripDayAddPoi()`/`tripDayRemovePoi()`, validated/migrated in
`loadStoredState()`'s `validateTripEntry`, and multi-trip-snapshot-safe
for free (GOLF-42's snapshot layer deep-copies `tripDays` wholesale).

- **Shared chrome**: nav bar (wordmark + "{n} days · £{total}" pill,
  reusing the app's existing accent tokens rather than the mockup's
  literal hex values — see Design Tokens decision below), one unified
  search bar (course-only, see decision below), 5 equal-width tab
  buttons, and an Itinerary-tab-only filter row (All/Golf/Hotels/POI
  pills + a Drive times On/Off toggle).
- **Itinerary tab**: `tbItinAllHTML()` (day cards, golf as the bold hero
  leg, hotel/POI secondary, dashed-border day-total row, drive legs
  hidden when the toggle is off), `tbItinGolfListHTML()`/
  `tbItinPoiListHTML()` (flat lists), `tbItinHotelRailHTML()` (the
  connected rail/timeline layout the spec calls for specifically for
  hotels).
- **Day tab**: kept the existing all-days drag-and-drop editor
  (`tripDayScheduleHTML()`) rather than rebuilding it as the spec's
  single-expanded-day view — see decision below — with the new hotel/POI
  mini-editors (`tbPromptHotel()`/`tbPromptPoi()`, plain `prompt()`-based
  manual entry) appended per day.
- **Costs tab**: `tbCostsTabHTML()` — full-bleed accent banner with the
  grand total, a 3-row category table (Golf/Stays/POI), an itemized
  line-items table with category tags. Reuses `tripCostBreakdown()`
  (a new light wrapper aggregating the existing fee/accommodation/fuel
  building blocks from GOLF-44/48 into one structure the tab can render
  from) rather than duplicating any cost math.
- **Add tab**: `tbAddTabHTML()` — day-picker dropdown + a Golf/Hotel/POI
  segmented control (Golf wired to the real course search-and-add flow
  via `tbAddToDay()`; Hotel/POI segments route to the same manual-entry
  prompts as the Day tab, since there's no hotel/POI database to search
  — see decision below).
- **Discover tab**: `tbDiscoverTabHTML()` — the existing Nearby/By-region
  logic, unchanged, extracted out of the old inline `renderTripBuilder()`
  into its own function and now gated so its map candidate-overlay only
  draws while this tab is active (`tbDrawMap()` checks `tbTab==='disc'`)
  — previously it was always drawn whenever the Discover sub-state
  happened to be populated, which would have bled gold-ring candidate
  markers onto every other tab's map view now that Discover is no longer
  the only other pane state.
- **Focus-loss fix**: the unified search input's results render into a
  separate, always-present `#tb-search-results` div that the input
  listener patches directly (`innerHTML`/`display` only) instead of
  re-running the full `renderTripBuilder()` on every keystroke — an
  initial version did the latter and measurably dropped input focus/
  caret position after each typed character; fixed and verified
  character-by-character in-browser before shipping.
- **New CSS tokens**: `--accent-deep` (`#122f76`, hero golf-price/name
  text-on-tint contrast) and `--radius-sm/md/lg` (6/10/16px, the app had
  no rounding-token system before this). Every other design-token
  mapping in the spec (accent/accent-dark/accent-soft) was left pointing
  at the app's **existing** "Links navy" palette values rather than
  overwritten to the mockup's literal blue hex values — the app already
  has its own established brand color, and the README's own Design
  Tokens table frames this as a mapping onto existing vars, not a
  literal recolor.

### Decisions made (flagged for stakeholder review, not yet confirmed)

1. **Day tab kept as the existing multi-day drag-and-drop editor**,
   not rebuilt as the spec's "single expanded day" view — the current
   editor is load-bearing (cross-day drag reordering, from GOLF-39) and
   rebuilding it as single-day-only would have dropped that capability.
   Worth a look if the stakeholder specifically wants the tighter
   single-day layout back.
2. **Search bar is course-only** — the spec calls for unified
   course/hotel/city search, but the app has no hotel or city database
   to search against (nothing was ever sourced/scoped for one). Hotel/
   POI addition uses plain `prompt()`-based manual name+price entry
   instead. A real hotel/city search would need a new data source
   decision (same category of research as GOLF-34b's accommodation
   options).
3. **Costs tab always includes Stays** in the total, with no independent
   toggle — the old cost-summary block (superseded by this tab) had
   separate Accommodation/Fuel checkboxes; the new tab kept only the Fuel
   toggle, matching the spec's plainer 3-line receipt design. Flag if the
   stakeholder wants an independent Stays toggle back.
4. **Mockup file (`.dc.html`) was not used for pixel-matching** — it only
   rendered unfilled template placeholders outside the design tool's own
   environment. Implementation followed the README's detailed prose
   instead, per the README's own explicit instruction not to copy the
   mockup's markup anyway. Any pixel-level gap vs. the original mockup's
   exact spacing/type would need the stakeholder's own look at the
   original design-tool file to catch.

### Verification performed

Built a real 2-day/3-course test trip (Carnoustie Day 1 + Trevose added
via the new Add tab; St Andrews Old + Old Course Hotel £220 + Kingsbarns
Distillery POI Day 2) through the actual UI, exercised all 5 tabs,
confirmed the Discover-tab map-overlay gating, confirmed the search-bar
focus-loss fix holds, confirmed hotel/POI data survives a **true** page
reload (`window.location.reload()`, not just a same-document hash nav),
confirmed mobile width (375px) renders without overflow and the existing
list↔map toggle still works, confirmed the Day tab's drag handles/day
dropdowns render correctly post-refactor. `node scripts/test_data.js`
(326 courses, clean) and a full in-browser console-error check both
pass. Test trip cleared via `tripClearAll()` before finishing.
`TESTING.md` check #31 documents the walkthrough.

### Not implemented this round (see wrap-up message to stakeholder)

True hotel/POI/city search (manual entry only, see decision #2); a
single-expanded-day Day tab view (see decision #1); any pixel-fidelity
gap vs. the mockup's exact spacing/type that wasn't verifiable without
the original design-tool file; an independent Stays toggle on the Costs
tab (see decision #3).

## Phase 14 — Trip Builder usability round 2 (stakeholder feedback, 2026-08-28) — mostly DONE

Stakeholder tried GOLF-57 and sent six pieces of feedback in one message,
then said "I am going away now" — same standing instruction as Phase 13:
work autonomously, document decisions, report a concise remaining list.

### GOLF-58: workflow simplification + "start a trip from a place" — DONE

1. **Trip-name course count removed** — `tripSwitcherHTML()`'s `<option>`
   label dropped the `(N)` suffix; the nav bar's own "{n} days · £{total}"
   pill already carries that information without cluttering the switcher.
2. **"+ New day" inline in the per-course day-select** — `tripDaySelectHTML()`
   gained a `+ New day` option; picking it calls the new
   `tbAssignCourseDay()`, which creates the day and assigns the course in
   one action instead of requiring a trip back to the Day tab's "+ Add
   day" button first.
3. **Add workflow simplified — the "3-step tax" is gone.** Previously:
   add a course (lands in Unscheduled) → go add a day → go back and
   assign it. Now `tbAddToDay()` auto-creates Day 1 the first time a
   course is added if no day exists yet, and defaults to the
   currently-shown/last day otherwise — a course only ends up in
   Unscheduled if the visitor explicitly picks that from a row's
   dropdown afterwards. `tbSelect()` (the Discover-tab "Add" button) and
   the unified search bar's results both route through this same path,
   so every "Add" button in the pane behaves consistently now.
4. **Explore vs. Plan-a-trip split made explicit** — the header button
   was renamed "Trip Builder" → **"Plan a trip"**, and the pane's own
   exit control now reads **"← Back to Explore"** instead of a bare
   "Exit" — the two modes now have real, paired names rather than one
   being an unnamed default state. Scoped as a naming/labelling fix, not
   a structural rebuild — the underlying `body.trip-mode` pane-swap
   architecture (GOLF-31) is unchanged and was judged sound; flag if the
   stakeholder wants a deeper structural split (e.g. a literal 3rd
   top-level app mode) instead.
5. **"Search a city, get taken there, see what's around it"** — new
   Discover-tab sub-tab **"Near a place"** (`tbPlaceAnchor`, alongside
   the existing Nearby/By-region), using the same ORS geocode
   search-as-you-type box already built for day-place fields (GOLF-56).
   Picking a result stores `{label,lat,lng}`, and a new
   `nearestCoursesToPoint()` (a `tripByAnchor()` sibling anchored to a
   raw point instead of a course) lists the 5 closest bookable courses;
   `tbDrawMap()` fits the map to the place + those candidates together.
   `tripCreateNew()` now lands directly on this sub-tab — starting a
   fresh trip's very first screen is "search a place," matching the
   stakeholder's stated mental model exactly.
- **Verified in-browser**: new trip → Discover → Near a place → typed
  "Newquay" → real ORS geocode results appeared → picked "Newquay,
  England, United Kingdom" → got Perranporth/Trevose/St Enodoc/Bude &
  North Cornwall/Yelverton, all genuinely nearby Cornish courses,
  sorted correctly by distance → clicked Add on Trevose → it landed
  directly in an auto-created "Day 1" with no Unscheduled detour, nav
  pill updated to "1 day · £140" live. Day tab's per-course dropdown
  confirmed to carry the new "+ New day" option. `node
  scripts/test_data.js` (326 courses) and a full in-browser console
  check both pass clean. Test trip cleared before finishing (per the
  stakeholder's new standing instruction — see the session's saved
  memory note on this).

### GOLF-59 (scoped, not built this round): true multi-item day timeline

The stakeholder's biggest ask — "schedule multiple things per day: hotel
→ drive → golf → drive → detour POI → drive → different hotel that
evening, added incrementally, in a heirarchy of detail" — is a genuine
data-model rewrite, not a UI tweak, and was deliberately **not**
attempted this round while unsupervised: `tripDays[]` today stores a day
as three separate, differently-shaped fields (`courses:[i,...]`, one
`hotel:{name,price}|null`, `pois:[{name,price}]`) with a fixed
drive→golf→poi→hotel render order baked into `tripDayLegs()` — not a
single ordered list a visitor can freely arrange. Retrofitting true mixed
ordering onto that shape safely (without corrupting existing trips'
persisted data, the cost breakdown, the map route, or the JSON export —
all of which read `courses`/`hotel`/`pois` directly today) needs its own
careful pass, not a rushed one while the stakeholder can't review it.

**Concrete design for next session** (so this doesn't get re-derived from
scratch):
- Generalize each day to a single ordered `items:[]` array, each item
  `{id, type:'golf'|'hotel'|'poi', ...}` (`type:'golf'` carries a course
  index, `hotel`/`poi` carry the existing `{name,price}` shape plus a
  stable `id` so removal doesn't desync references the way a bare
  array-index would).
- Migrate on load: an old-shape day's `courses`/`hotel`/`pois` get
  flattened into `items` once, in today's fixed order, so every existing
  saved trip keeps its current appearance unchanged after the upgrade.
- Extend the existing drag-and-drop (`tbDrag`/`tbMoveCourseTo`) to carry
  a `{type,id}` pair instead of a bare course index, so hotel/POI rows
  become draggable into any position alongside courses using the same
  interaction already in place — no new interaction pattern to design.
- `tripDayLegs()` (itinerary rendering), `tripDayStops()` (map/route/cost
  waypoints), `tripCostBreakdown()`, and the JSON export all need
  updating to read `items` instead of the three separate fields — the
  biggest single chunk of the work, and the part most worth budgeting
  real time for rather than rushing.
- Once `items` exists, "drive to a different hotel that evening" and "a
  detour to a POI mid-route" both fall out for free — they're just
  additional items in the day's order, no special-casing needed.
- **Explicitly recommend doing this as its own focused session**, not
  bundled with anything else — it touches most of the Trip Builder's
  core rendering/cost/export code paths and deserves full attention and,
  ideally, the stakeholder's review before shipping (unlike this round's
  changes, which were all additive/low-risk).

### Verification / wrap-up for this round

`node --check` on the extracted inline script and `node
scripts/test_data.js` both pass; a full in-browser walkthrough (new trip
→ search a place → add a course → confirm Day tab/nav pill) was run and
is clean of console errors and "undefined". Test state cleared via
`tripClearAll()` before finishing, per the stakeholder's new standing
instruction to always hand the app back empty.

## Phase 15 — Trip Builder rethink: three-mode workflow, item-level day timeline, and lifecycle bugs (2026-08-28) — DONE (GOLF-60/61/62 shipped to main; GOLF-63/64 shipped to branch `trip-builder-item-timeline`, pending stakeholder review before merge)

### Context

After using GOLF-57/58 for real, the stakeholder sent six pieces of
feedback in one message: three concrete bugs (delete doesn't give a true
fresh start; the top search box only searches courses, not places; adding
a course only ever lands on Day 1, forcing a manual move afterward — plus
a fourth bug found in the same message, stale search text/place carrying
over into a new trip), and a genuine conceptual mismatch — the tool
doesn't model how a trip actually gets planned. Their own worked example:
*pick* Gullane/Muirfield/North Berwick around Edinburgh first (seeing
combined drive times/cost), *then* decide Day 1 = arrive, Day 2 = North
Berwick, Day 3 = rest, Day 4 = Gullane, Day 5 = Muirfield + train home —
a "conceptual → concrete" progression, not the other way round. They also
asked for a real per-day hierarchy (hotel → drive → golf → drive → detour
POI → drive → different hotel that evening) and explicitly asked for
research into how other trip planners handle this, offering to answer
questions rather than disappearing this round.

**Investigation done this session** (two Explore agents, full line-level
citations against [london-golf-map-v5_1.html](london-golf-map-v5_1.html),
not assumed) root-caused all four bugs precisely — see GOLF-60/61/62
below, each cites exact functions/lines. **Research done this session**
(`WebSearch`, not reused from Phase 12's older notes): Wanderlog lets you
select/drag stops into any day and computes travel time between whatever
order you drop them in; Roadtrippers' itinerary is one flat, date-ordered
waypoint list with a per-day "+" that adds straight into that date's
segment; the golf-specific planner Outing.golf has the group vote on/pick
courses first, then the organizer assigns each to a specific day
afterward. All three converge on the same two-phase shape the
stakeholder's own example describes: **gather candidates first, commit
them to specific days second** — this is not a novel pattern being
invented here, it's the standard shape across every reference app
checked.

**Decisions confirmed with the stakeholder directly** (via
`AskUserQuestion`, since they explicitly invited questions this round):
1. Adding a course defaults to a trip-level **wishlist** (unscheduled),
   not straight into a day — matches their Edinburgh example and every
   reference app above.
2. Picking a **place** in search always **anchors the whole trip
   there** (jumps the map, seeds nearby-course discovery from that
   point) rather than inserting as a mid-trip stop or asking each time.
3. Explore vs. Trip Planning becomes **three explicit top-level app
   modes** (Explore / Plan / Build) rather than reordering tabs inside
   one pane — the stakeholder chose this over the lighter option, so the
   conceptual→concrete split gets real distinct screens.

### GOLF-60: Trip lifecycle bugs (root-caused exactly, not guessed at)

**60a — "Delete keeps the old trip," no true fresh start.** Verified
`tripDelete()` (line 792) is *not* broken — it correctly removes the
entry from `trips{}`, reassigns `activeTripId`, calls
`tripRestoreActive()`, and persists via `saveState()`. The real gap:
Delete only ever deletes the *currently active* trip and falls back to
whatever else is left (often another old, unwanted trip) — there is no
one-click "wipe every trip, start with exactly one guaranteed-empty one"
reachable from inside the Trip Builder pane. The only function that
actually does that, `wipeStoredState()` (line 2673), is buried in the
unrelated corrections/export drawer with copy that never mentions trips
at all. **Fix:** add a "Start fresh" action next to the trip switcher
(in the shared top bar used by both new Plan and Build modes, see
GOLF-64) that deletes every trip and creates one new empty one in a
single click, its own `confirm()` dialog.

**60b — stale search text / stale place anchor on a new trip.**
Root-caused exactly: `tbSearchQ` (line 830) and `tbPlaceAnchor` (line
825) are page-session globals declared *outside* the per-trip snapshot
(`tripSnapshotActive`/`tripRestoreActive`, lines 727-742) — confirmed via
grep that `tbSearchQ` is assigned in exactly two places in the whole
file: its `''` declaration and the search box's own `input` handler
(line 2155) — nothing else ever resets it. `renderTripBuilder()` just
echoes whatever they currently hold straight into the DOM `value=`
attribute. **Fix:** `tripCreateNew()`, `tripDelete()`, `tripSwitchTo()`,
`tripDuplicate()`, and `wipeStoredState()` all reset `tbSearchQ=''` and
`tbPlaceAnchor=null` (today only `tripCreateNew()` happens to touch
`tbPlaceAnchor`, and nothing touches `tbSearchQ` anywhere).

**60c — "only lets me add to Day 1."** Root-caused exactly:
`tbDayShown` (line 2059) is also a page-session global outside the trip
snapshot, and `renderTripBuilder()` (line 2116) force-resets it to
`tripDays[0].id` — Day 1 — every time it's `null`/stale, which is every
render after a reload, a trip switch, or opening the pane fresh. The
unified search's "Add" button bakes that value in at render time
(`tbUnifiedSearchResultsHTML()`, lines 1615-1627: label literally reads
"+ Add to Day 1", `onclick` passes `dayId=1` explicitly). **Fully
superseded by GOLF-62** (default add target becomes the wishlist, not
any day) rather than patched in place — the bug class disappears instead
of being special-cased.

**GOLF-60 — DONE.** Added `tripStartFresh()` (wipes every trip, creates one
guaranteed-empty one, own `confirm()`) wired into a new "Start fresh"
button next to the trip switcher (`tripSwitcherHTML()`). Reset
`tbSearchQ=''`/`tbPlaceAnchor=null` in `tripCreateNew()` (tbPlaceAnchor was
already reset there, tbSearchQ was not), `tripDelete()`, `tripSwitchTo()`,
`tripDuplicate()`, `wipeStoredState()`, and the new `tripStartFresh()`
itself. 60c (add-only-lands-on-Day-1) is superseded by GOLF-62 below, per
plan, rather than patched separately. Verified in-browser: created 3 trips,
added courses to 2 of them, `tripStartFresh()` (with `confirm` stubbed
`true`) left exactly 1 trip (`Object.keys(trips).length` 3→1), `TRIP.size`
0, `tripDays.length` 0, `tbSearchQ`/`tbPlaceAnchor` both cleared; also
verified `tripCreateNew()` clears stale `tbSearchQ` left over from a prior
trip's search box.

### GOLF-61: Unified search finds places, not just courses

Confirmed precisely: `searchMatches()`/`tbSearchResults()` (lines
2459-2466, 1585-1589) only ever query `C[]` (course name/region/
architect/note/walk/station text) — there is no branch checking a
place/city gazetteer anywhere in that path. A working place geocoder
already exists (`orsGeocode()`, lines 1784-1797, backed by the deployed
ORS Worker) but is wired to a separate, buried input (`#tb-start-place`,
inside Discover's "Near a place" sub-tab) the main bar has no path to.

**Fix:** the top search bar fires both `tbSearchResults()` (courses) and
a debounced `orsGeocode()` call (places) on every keystroke, rendering
two labelled groups — "Places" above "Golf courses" — so typing
"Inverness" surfaces the real place (with a "📍 Start a trip here"
action — confirmed always-anchors behavior, see Context) alongside any
course whose own text happens to contain "Inverness." This becomes the
single search box the app needs; the standalone Discover "Near a place"
box's logic is absorbed into this shared component rather than
duplicated a third time.

**GOLF-61 — DONE.** The unified search bar (`tb-unified-search`) now fires
`tbSearchResults()` (courses, unchanged) and a debounced (300ms) `orsGeocode()`
call on every keystroke (`tbUnifiedSearchGeoDebounce`), rendering two
labelled groups in `tbUnifiedSearchResultsHTML()` — "Places" above "Golf
courses" — with a stale-response guard (`tbSearchQ.trim()!==q` bail) so a
slow geocode response from an earlier keystroke can't clobber a newer
query's results. A place result's "📍 Start a trip here" action calls the
new `tbAnchorTripToPlace()`, which always anchors the whole trip there
(sets `tbPlaceAnchor`, jumps to Discover's "place" sub-tab) per the
decision confirmed with the stakeholder — matches the existing
Discover-tab place box's behavior exactly, just reachable from the one
main search bar now. The standalone Discover "Near a place" box is left
in place (not removed) since GOLF-64, which would have retired the old
5-tab pane entirely, was deferred this round — see note at the end of this
phase. Verified in-browser: typing "Inverness" with a stubbed place result
renders a "Places" group with a working "Start a trip here" button above a
"Golf courses" group of real course-name matches; clicking anchors
`tbPlaceAnchor` to the right coordinates and clears the search box.

### GOLF-62: Adding a course defaults to the wishlist, not a day

**Confirmed with the stakeholder** — matches their Edinburgh example and
every reference app researched this round (Wanderlog, Roadtrippers,
Outing.golf: gather candidates first, commit to days second).

- A new `tbAddToWishlist(i)` becomes the default entry point (replacing
  `tbAddToDay(i,null)`'s current role as the implicit default): adds to
  `TRIP`/`tripSeq` exactly as today, but leaves `tripDays` untouched —
  the course simply becomes an entry in `tripUnscheduled()` (already a
  real concept in the code today, just never the *default* landing
  spot).
- The unified search's course results, every Discover Add button, and a
  popup's "Add to trip" action all route through `tbAddToWishlist()` by
  default now.
- **Still supported — the stakeholder explicitly also wants to add
  straight to a known day**: while a specific day is open/focused in
  Build mode, the same search results grow a second, explicit "+ Add to
  Day N" button next to the default "+ Add to wishlist" one. Wishlist is
  the default path; direct-to-day is the deliberate power path, not
  removed.
- The Wishlist itself (new view, see GOLF-64) shows a **suggested
  visiting order and running totals** across the unscheduled pool
  (reusing the existing nearest-neighbour ordering plus
  `tripCostEstimateByDay()`'s flat-list fallback, plus a straight-line/
  ORS drive-time sum in that order) — answering "see the driving times
  and costs" *before* any day exists, exactly as the stakeholder
  described.

**GOLF-62 — DONE.** New `tbAddToWishlist(i)` is now the default entry point:
adds to `TRIP`/`tripSeq` exactly as before, leaves `tripDays` untouched.
`tbSelect()` (Discover's "Add" button) and the unified search's course
results now route through it by default; a second, explicit "+ Day N"
button appears next to "+ Wishlist" in the unified search results only
when a day is focused (`tbTab==='day' && tbDayShown!=null`) — direct-to-day
stays available as the deliberate power path via `tbAddToDay()`, unchanged.
Popup's "Add to trip" (`toggleTrip()`) already only touched
`TRIP`/`tripSeq`, never a day, so it needed no change — it was always
wishlist-shaped. Added `tripWishlistSummaryHTML()`: a suggested
nearest-neighbour order (reusing `tripOrder()`) plus a running £ fee total
and straight-line/`DRIVE_INEFFICIENCY`-adjusted drive-time sum across the
unscheduled pool, shown above the Unscheduled block (relabelled
"Unscheduled (Wishlist)") in `tripDayScheduleHTML()`. The dedicated
Wishlist *view* described in GOLF-64 (a first-class Plan-mode section) was
not built — this ships the same suggested-order/running-totals data inside
the existing Day tab's Unscheduled block instead, since GOLF-64 itself was
deferred. Verified in-browser: added 3 courses via `tbAddToWishlist()` with
zero days existing — all 3 landed in Unscheduled, zero days auto-created;
the block rendered "Suggested order (nearest-neighbour): ... £65 in green
fees (2 of 3 priced) · ~9 mi / 15 min driving"; with a day focused, the
same search results grew a working "+ Day 1" button alongside "+
Wishlist".

**GOLF-63 and GOLF-64 — DONE in a follow-up session (2026-08-28), on branch
`trip-builder-item-timeline` rather than `main`,** specifically so the
stakeholder can try the restructure before it reaches production (this repo
auto-deploys `main`). Verification summaries under each ticket below. The
deferral note that follows is kept for the record of why they weren't
shipped in the same pass as GOLF-60/61/62.

**GOLF-63 and GOLF-64 — NOT DONE in the GOLF-60/61/62 round.** Scoped precisely below (kept
as future work, not rewritten), but not implemented in this session: GOLF-63
is a full data-model rewrite (`courses[]`/`hotel`/`pois[]` → one ordered
`items[]` per day) touching ~10 consumer functions
(`tripDayStops`/`tripDayLegs`/`tripDayOrder`/`tripCostEstimateByDay`/
`tripCostLineItems`/`tripCostBreakdown`/`tbItinGolfListHTML`/
`tbItinHotelRailHTML`/`tbItinPoiListHTML`/`tbDrag`/`tbMoveCourseTo`/JSON
export) plus a load-time migration for every existing saved trip, and
GOLF-64 is a full three-mode (Explore/Plan/Build) IA restructure retiring
the old 5-tab pane. Both are large, structurally risky changes to a
single-file app with no build step or automated UI tests, deployed straight
to production on push (Cloudflare Git auto-deploy, no staging). Given the
session's scope, shipping GOLF-60/61/62 solidly and verifiably — each
independently useful per the Sequencing note below — was judged the safer
call over rushing GOLF-63/64's much larger surface area in the same pass
and risking a broken live site. GOLF-63/64 remain fully scoped and ready to
pick up in a follow-up session; nothing in this round's GOLF-60/61/62 work
conflicts with or needs to be redone for them (GOLF-62's wishlist plumbing
in particular is exactly what GOLF-64's Plan mode expects to build on).

### GOLF-63: Item-level day timeline — freely-orderable golf/hotel/POI

The core structural ask: "drive from my hotel in Aberdeen to the course,
golf, a drive to St Andrews, a detour to see a POI... schedule multiple
things per day... a hierarchy of detail, adding more as you go." Scoped
conceptually last round as GOLF-59 and deliberately not built then; this
round grounds it precisely against the real code (all citations from
this session's Explore investigation, not re-derived):

- **New shape:** each `tripDays[]` entry gains one ordered `items:[]`
  array, replacing `courses[]`/`hotel`/`pois[]` as the source of truth.
  Each item: `{id, type:'golf'|'hotel'|'poi', ...}` — `golf` carries a
  course index; `hotel`/`poi` carry `{name, price, lat, lng}` (coords
  new, see next point). `id` is a stable identifier (not array
  position), matching the pattern `tripDays` itself already uses for the
  same reason.
- **Hotel/POI gain real coordinates.** Today's `tbPromptHotel()`/
  `tbPromptPoi()` (lines 572-583) are plain `prompt()` dialogs capturing
  only name+price — with no coordinates, a drive leg to/from a hotel can
  never be computed. Upgrade both to the same search-as-you-type
  `orsGeocode()` picker already built for day place-fields and the new
  unified search (GOLF-61) — a picked result stores `lat`/`lng` on the
  item; typing a plain name with no picked result still works exactly as
  before (graceful degradation — that item just contributes no drive
  leg, consistent with how every other optional field in this app
  degrades).
- **Drive legs become per-item, not just per-day.** Generalize the
  existing leg machinery (`tripDayRealEstimate`/`orsLegRoute`/
  `tripDayLegMiles` — already partly generalized to generic `{lat,lng}`
  points by GOLF-56) to compute a leg between *every* consecutive pair of
  items across the whole trip that both carry coordinates, so
  hotel→course→course→POI→different-hotel gets a real/heuristic drive
  time at each hop, the same way day-to-day legs work today. No
  manually-added "drive" item type — drive stays computed/derived,
  matching every reference app researched (none of them let you add a
  "drive" as its own stop; travel time is always inferred from stop
  order).
- **Migration:** on load, an old-shape day's `courses`/`hotel`/`pois`
  flatten once into `items`, in today's fixed render order
  (drive→golf→poi→hotel), so every existing saved trip looks identical
  immediately after the upgrade, then behaves under free ordering from
  then on.
- **Drag-and-drop:** extend `tbDrag`/`tbMoveCourseTo()` (lines 651-668)
  to carry `{type,id}` instead of a bare course index, so hotel/POI rows
  become draggable into any position alongside golf rounds via the exact
  interaction already in place — no new interaction pattern.
- **Every consumer updated to read `items` instead of the three old
  fields** — confirmed this session as the full list: `tripDayStops()`
  (1525-1531), `tripDayLegs()` (1922-1939), `tripDayOrder()`
  (1534-1539), `tripCostEstimateByDay()` (1294-1310),
  `tripCostLineItems()`/`tripCostBreakdown()` (2002-2015),
  `tbItinGolfListHTML()` (1963-1968), `tbItinHotelRailHTML()`
  (1970-1982), `tbItinPoiListHTML()` (1983-1988 — also fix the confirmed
  bug where this one silently drops `p.price`, unlike every other reader
  of the same field). The accommodation-rate fallback
  (`accomRateFor(C[last course].r)`) is currently duplicated
  independently in three separate places (`tripDayLegs`,
  `tripCostLineItems`, `tbItinHotelRailHTML`) — centralize into one
  helper as part of this rewrite instead of copying it a fourth time.
- **"Add it in underneath golf"** falls out for free once items are just
  an ordered list — a second hotel after a round is simply inserting a
  new `hotel` item after the `golf` item in that day, no special-casing.

**GOLF-63 — DONE.** Each `tripDays[]` entry now carries one ordered
`items:[]` (`{id,type:'golf'|'hotel'|'poi',...}`; hotel/POI gained
`lat`/`lng`) as the single source of truth; `courses`/`hotel`/`pois` are
gone from the live shape. New helpers `tripDayItems`/`tripDayCourses`/
`tripItemPoint`/`tripItemName`/`tripDayFindItem`/`tripDayAddStop`/
`tripDayRemoveItem`, and the triplicated accommodation-rate fallback is
centralised into `tripDayAccomFallback()` behind one `tripItemPrice()` that
every £ figure in the app now reads through — which is also what fixed
`tbItinPoiListHTML()` silently dropping `p.price`. `tbPromptHotel`/
`tbPromptPoi` are no longer `prompt()` dialogs but an inline `orsGeocode()`
search-as-you-type picker, so a picked stop carries real coordinates (a
plain typed name still works and simply contributes no leg). Legs are now
computed over a trip-wide `tripStopChain()` — a `tripLegEstimate()` between
*every* consecutive located pair, not just day boundaries — with
`tripTotalDriveMiles()` feeding fuel; `orsCacheLoad()` gained an in-memory
memo since legs are now read an order of magnitude more often. `tbDrag`
carries `{kind,dayId,id}` and `tbMoveCourseTo()` became `tbDropOn()`, so
hotel/POI rows drag anywhere alongside rounds. Load-time migration
(`tripDayMigrateItems`, wired into `validateTripEntry` and
`tripRestoreActive`) flattens an old-shape day once, in the exact previous
render order (golf → POI → hotel). *Verified in-browser:* a hand-built
pre-GOLF-63 localStorage trip migrated to a byte-for-byte equivalent
rendering (golf/golf/POI/POI/hotel, prices and the manual `driveIn` intact);
the ticket's own worked example — Aberdeen hotel → 2 rounds → St Andrews POI
→ Dundee hotel — built through the real UI produced a drive row at all four
hops (incl. St Andrews→Dundee at 25 min); a genuine HTML5 drag (real
`DragEvent`s through the inline handlers) moved a hotel from last to first
and the drive rows, day total and Costs line items all re-derived; a round
dragged to the wishlist unschedules, a hotel/POI dragged there is a no-op
rather than a silent delete. `node --check` clean, `node scripts/test_data.js`
still 326 courses.

### GOLF-64: Three explicit top-level modes — Explore / Plan / Build

**Confirmed with the stakeholder** (chosen over the lighter tab-reorder
option) — gives the conceptual→concrete split real distinct screens
rather than tabs inside one pane, per their explicit ask to "split out
the exploration view vs the trip planning view."

Built as a new `appMode` state (`'explore'|'plan'|'build'`) layered on
the *existing* pane-swap architecture, not a rewrite of the app shell —
reuses the same `#tb-pane` DOM target, the same `body.trip-mode` CSS
(hides `.filters`/`.list`, widens the grid column) whenever mode is
`'plan'` or `'build'`, and the same hash-routing pattern from GOLF-41
(`enterTripBuilder`/`exitTripBuilder`/`popstate`), extended from two URL
states to three: `''` → Explore, `'#plan'` → Plan, `'#trip'` → Build
(kept as-is, not renamed, so any bookmarked/shared GOLF-41 link keeps
working).

- **Explore** (unchanged map+filters+list) — the header's "Plan a trip"
  button and a course popup's "Add to trip" action both now enter
  **Plan** mode (never Build directly), landing the course in the
  wishlist per GOLF-62.
- **Plan mode** (new) — a single-view pane, deliberately with no
  sub-tabs (this is the "keep it simple" half of the split): shared top
  bar (trip switcher + Start Fresh, GOLF-60a) + the merged unified
  search (GOLF-61) for anchoring/searching; below it, today's Discover
  logic (Nearby/By-region/Near-a-place browsing, unchanged, just
  relocated here since Plan mode *is* the exploration-flavored half of
  planning); below that, the **Wishlist** (GOLF-62) with its suggested
  order/running totals, and one clear forward action once it holds at
  least one course: **"Start scheduling days →"**, switching `appMode`
  to `'build'`.
- **Build mode** (new) — the detailed, concrete half: shared top bar
  again, then two tabs — **Itinerary** (today's Day tab's editing power
  — drag-and-drop, day kind/place/date, GOLF-63's freely-ordered items —
  merged with today's separate Itinerary tab's read layout into one
  editable view, since every reference app researched treats "view" and
  "edit" as the same screen, never two) and **Costs** (unchanged
  breakdown table). A "← Back to wishlist" link returns to Plan mode
  without losing anything — Plan and Build are two views over the one
  active trip's data, never separate data.
- **Retired:** the old 5-tab set (Itinerary/Day/Costs/Add/Discover)
  inside one pane. Discover's logic moves into Plan; Day+Itinerary merge
  into Build's Itinerary tab; Costs stays, now under Build; the
  standalone Add tab is retired entirely — its job (course/hotel/POI
  entry) is fully absorbed into the unified search (GOLF-61) plus each
  day's own inline "+" (GOLF-63), removing a whole tab's worth of
  indirection — directly answers "too many steps."
- **Net effect:** 5 equally-weighted, unordered tabs → 0 tabs in Plan
  (single view) + 2 tabs in Build, and the mode/tab structure itself now
  narrates the workflow left-to-right instead of presenting five
  destinations with no implied order.

**GOLF-64 — DONE.** New `appMode` (`'explore'|'plan'|'build'`) layered on the
existing `#tb-pane`/`body.trip-mode` architecture exactly as scoped — no app
shell rewrite, and `tripBuilderOn` keeps its old meaning ("the pane is
open") so every existing `if(tripBuilderOn)` redraw hook was untouched. One
`setAppMode()` replaces the bodies of `enterTripBuilder`/`exitTripBuilder`
(both kept as wrappers), GOLF-41's hash routing extended from two states to
three (`''`/`#plan`/`#trip`, `#trip` deliberately not renamed), and popstate
plus the cold-load bootstrap both route off `appModeFromHash()`. The header
button and a popup's "+ Add to trip" (new `tbAddToPlan()`) now both land in
**Plan**, never Build. Plan is one scrolling view — shared top bar, unified
search, the relocated Discover logic, then `tbWishlistHTML()` with its
suggested order/running totals and "Start scheduling days →". Build has the
shared top bar, "← Back to wishlist", and two tabs: Costs unchanged, and one
merged **Itinerary** where the old Day tab's editable draggable rows and the
old Itinerary tab's read layout became a single view — `tripDayScheduleHTML()`
now interleaves `tripDayLegs()`' computed 🚗 rows between the editable item
rows, with a day total per card (the golf/hotel/POI filter pills still reach
the old flat read lists). The 5-tab set is retired: `tbTab` is gone
(`tbBuildTab` has two values), and `tbAddTabHTML()` was deleted outright.
*Verified in-browser:* full Explore → Plan → Build → back to wishlist →
Explore round trip via real button clicks; browser Back walked
Build→Plan→Explore and Forward walked back up with the hash matching
`appMode` at all five hops; cold loads on `#plan` and `#trip` open the right
mode; "Start fresh" and "+ New trip" return to Plan *and* correct the URL
(they previously would have left a stale `#trip`); no "undefined"/"NaN" and
no horizontal overflow across all six mode/tab combinations at 375px.

### Sequencing

GOLF-60 (lifecycle bugs) → GOLF-61 (unified place+course search) →
GOLF-62 (wishlist-default add) → GOLF-63 (items[] rewrite) → GOLF-64
(three-mode restructure, built last since it's the shell hosting
everything above). Each of 60-63 is independently useful and
independently verifiable before 64 wires them into the new mode
structure, so the biggest, riskiest piece (the mode/IA rebuild) isn't
hiding a regression from one of the smaller fixes underneath it.

### Verification approach

- **GOLF-60:** reproduce the exact reported repro — create 2 extra
  trips, delete down through them, confirm no stale trip ever resurfaces
  after "Start fresh"; confirm `tbSearchQ`/`tbPlaceAnchor` are empty
  immediately after create/delete/switch/duplicate.
- **GOLF-61:** type "Inverness" in the main search bar on a fresh trip,
  confirm a real place result appears (not just courses whose text
  happens to contain it), confirm picking it anchors the map + Discover.
- **GOLF-62:** add 3 courses via search with zero days existing yet,
  confirm all 3 land in the Wishlist (not Day 1), confirm the wishlist
  shows a rough order + total drive/cost; confirm the Build-mode
  direct-to-day "+ Add to Day N" path still works when a day is focused.
- **GOLF-63:** build a real multi-item day (hotel → golf → drive → POI →
  different hotel) via the actual UI, confirm drag-reorder across all
  item types, confirm drive legs compute between every consecutive
  geocoded pair, confirm cost breakdown and map route both reflect the
  new order, confirm an old pre-rewrite saved trip migrates to look
  identical on first load.
- **GOLF-64:** full walkthrough Explore → Plan (search a place, build a
  wishlist) → Build (schedule days, check costs) → back to wishlist →
  back to Explore, confirming the trip persists correctly at every hop,
  mobile width still works, and the `#plan`/`#trip` hashes both
  round-trip through browser Back/Forward correctly.
- Throughout: `node --check` on the extracted inline script, `node
  scripts/test_data.js` (326 courses, unaffected — no data-file
  changes), a full in-browser `popupHTML()`/console-error sweep, and
  clearing all test trip data via the new "Start fresh" control before
  ending the session (per the standing instruction already on file).

---

## Phase 16 — Rearranging the trip: draggable days, city-first day creation, add-a-city-to-trip (stakeholder feedback, 2026-08-29) — DONE (branch `trip-builder-item-timeline`, still pending merge review)

### Context

The stakeholder tried the live GOLF-63/64 build (Explore/Plan/Build modes,
item-level day timeline) and came back with three follow-ups, verbatim:

> "Allow me to drag days around or insert ones in new places. Like If I want
> to add a new starting point or some other day in the middle I can add it and
> then drag them around to see if 'maybe we should do a day off on day 2 or day
> 3 - how does that change things'
> When adding a day make it easier to add in a city - you can copy this
> functionaliyt from the search bar where you can click start trip here. - Same
> premise
> Once you have selected a start city in plan mode you should also be able to
> search for a city and just add it to your trip."

All three are the same underlying complaint from a different angle: GOLF-63
made the *contents* of a day freely rearrangeable, but the *days themselves*
stayed a fixed, append-only list, and a city could only ever enter the trip
as a discovery anchor, never as a stop. This round makes the day sequence as
malleable as the item sequence already is, and lets a place become trip data
rather than only a lens.

Deliberately narrow: three asks, three tickets, no adjacent rework.

### GOLF-65: drag a whole day into a new slot — DONE

Each day header is now `draggable`, with the same ⠿ handle glyph an item row
uses — the gesture reads as "the same drag, one level up". Dropping a day on
another day moves it to sit immediately *before* that day, matching the
item-drag convention exactly so both drags behave identically; dropping on
the "+ Add day" bar (`.tb-day-endzone`) moves it to the very last position,
which is otherwise unreachable given the before-the-target rule.

Implementation note: `tbDayDrag` is a second, separate global rather than a
third `kind` on `tbDrag`. The two drags have different drop grammars — an
item drop asks "before which *row*?", a day drop asks "before which *day*?"
— so folding them together would have forced every existing `tbDropOn()`
caller to learn about days. Instead every in-day drop handler funnels
through a new `tbDropInDay()`, which checks `tbDayDrag` first and falls
straight through to the untouched item logic when it's null. `tbDropOn()`'s
behaviour is byte-for-byte unchanged.

Day numbering was already positional (`tripDays.map((d,idx)=>Day ${idx+1})`,
nothing stored), so renumbering after a reorder is free — that convention is
kept, not replaced. No move up/down buttons existed to sit alongside or
replace; drag is the whole mechanism.

The one genuinely ambiguous call, documented inline: a day's stored
`driveIn` is a manual override of the leg driven *into* it (GOLF-43), so it
describes the gap to whatever day precedes it. A reorder changes that
predecessor, leaving the override describing a leg that no longer exists.
Rather than clear every override (destroys hand-entered data) or none
(leaves lies on screen), `tbDayMoveTo()` snapshots each day's predecessor
before and after the move and clears `driveIn` on exactly those days whose
predecessor changed — so an override elsewhere in the list survives a
reorder that didn't affect it. Dates are deliberately *not* touched: a date
is the visitor's own fact about that day, not a derived property of its
position.

*Verified in-browser:* built a 3-day trip (2 rounds on Day 1, 1 on Day 2,
Day 3 a placed Free day), dragged the free day onto Day 2 via real
`dragstart`/`drop` DOM events on the header — it landed in slot 2, labels
renumbered, and each day's kind/place/items travelled with it. Drive legs,
day totals and the Costs breakdown all re-derived from the new order (trip
total moved £147 → £226, the delta being recomputed fuel across the new leg
sequence). Drop-on-the-add-bar moved a day to last. The two days whose
predecessor changed had their stale 90/45-minute overrides cleared; the
untouched one kept its own. Order survived a reload. Item drag within a day,
between days, and out to the Wishlist all still work unchanged.

### GOLF-66: "+ Add day" opens the city picker — DONE

"+ Add day" used to drop an anonymous, placeless day at the bottom and leave
the visitor to spot the small place box and click into it. Per the
stakeholder's own framing ("copy this functionality from the search bar"),
this builds **no new search UI**: `tbAddDayWithPlace()` creates the day and
hands focus straight to the place input GOLF-56 already wired with the
debounced `orsGeocode()` search-as-you-type picker. Placeholder sharpened to
"Search a city (e.g. Edinburgh)" so it reads as a search, not a text field.

Scope call, documented inline: the day is created *first*, not after a city
is picked. A day with no city is a legitimate and common thing — a rest day,
a travel day — so the picker is an offer, not a gate. `tbFocusDayPlace` is
one-shot transient state, consumed and cleared by the place-box wiring so an
ordinary later re-render never yanks focus back.

*Verified in-browser:* "+ Add day" went 3 → 4 days with
`document.activeElement` landing on the new day's `tb-place-<id>` input, the
new placeholder in place, its results div wired, and the one-shot flag
cleared.

### GOLF-67: search a city and add it to the trip, without re-anchoring — DONE

Plan mode's place results offered exactly one action: anchor the whole trip
here. Anchoring is a *discovery lens* — it moves "show me what's nearby" and
touches no trip data — which is why it couldn't satisfy "start in Edinburgh,
then search St Andrews and add St Andrews itself". A second action,
"+ Add to trip", now sits alongside it and adds real trip data while leaving
the lens alone. It appears only once there's a trip to add to (an anchor is
set, or days exist); before that the only meaningful thing a place can do is
start the trip, and two near-identical buttons on an empty trip would be a
choice with no meaning. When it does appear, the first button relabels from
"📍 Start a trip here" to "📍 Anchor here", since by then it isn't starting
anything.

Landing spot — the call the ticket flagged as needing a judgement, made
against the existing data model and documented inline: the place is appended
as a new day, **not** dropped into the wishlist. The wishlist is a pool of
*courses* by construction — `tripUnscheduled()` derives from `tripSeq`
(course indices) and `tbDropOn()` explicitly refuses to put a non-golf item
there — so a city has no representation in it at all. A day already has
exactly the right shape for "a place we'll be": `place`/`placeLat`/`placeLng`,
geocoded and routable since GOLF-56. `kind:'free'` because an added city
carries no round yet; the visitor can switch it from the day's own dropdown
and drag it anywhere with GOLF-65. The search box deliberately stays open
after an add (rather than clearing, as anchoring does) so several cities can
be added in one pass, with an "Added <city> as Day N" note for feedback.

*Verified in-browser:* with Edinburgh anchored, clicking "+ Add to trip" on a
St Andrews result added it as a `free` day with real coordinates while
`tbPlaceAnchor` stayed Edinburgh and `appMode` stayed `plan` — no re-anchor,
no mode jump. A second city added as Day 2 in the same pass. "📍 Anchor here"
still anchors and clears the search (GOLF-61 unchanged). With no trip
started, only "Start a trip here" renders.

### Verification summary for this round

- `new Function()` parse of the extracted inline script clean after each of
  the three pieces; `node scripts/test_data.js` still 326 courses / 114 Top
  100 (no data-file changes — pure app-state/UI, as expected).
- Full in-browser walkthrough on a local server against this worktree: the
  three flows above, plus the item-drag regression sweep (within day,
  between days, out to wishlist).
- No "undefined" anywhere across all 9 mode/tab/filter views, and the
  `popupHTML()` sweep over all 326 courses came back clean.
- No horizontal overflow at 375px (`body.scrollWidth` 375, pane 374, zero
  elements past the viewport edge); no JS console errors.
- Caught and fixed a leftover in passing: `tbPlaceAddedNote` survived
  "Start fresh" — exactly the stale-transient class GOLF-60b was about — so
  the three new transients (`tbPlaceAddedNote`, `tbFocusDayPlace`,
  `tbDayDrag`) were added to every existing `tbSearchQ=''`/`tbPlaceAnchor=null`
  reset site.
- All test trip data cleared via "Start fresh" before ending the session
  (single empty default trip left in `localStorage`, zero edits/played/want),
  per the standing instruction.
- Environmental note: the ORS proxy's upstream (OpenRouteService) was
  returning 504s throughout this round, so live geocode dropdowns returned
  nothing. Confirmed pre-existing and independent of this diff (the worker
  itself is up; it's the upstream failing), and the pickers degrade to plain
  typed text by design. The picker UI was verified by stubbing
  `window.orsGeocode`, and cached ORS legs still exercised the real
  drive-time path.

## Phase 17 — Explore-page search and filters, day-card fixes, and chronological days (stakeholder feedback, 2026-08-29) — DONE (branch `trip-builder-item-timeline`, still pending merge review)

### Context

The stakeholder tried the live GOLF-65/66/67 build and sent ten pieces of
feedback in one message, then answered two follow-up questions. The ten split
cleanly into two groups — the Explore page's own search/filter/list chrome,
and the Build-mode day card — plus one item that turned out to be already
done. Shipped as GOLF-69.

Two of the ten were **superseded by the stakeholder's own clarifications**,
and the clarified version is what got built in both cases:

- On the nearest-courses list (item 3), the choice was "a new section
  underneath" vs "replaces the existing list". They picked replaces —
  "the already-existing area where the list of courses comes up in the
  bottom left of the screen", i.e. closer to how the old Discover tab worked.
- On day numbering (item 8), the original ask was to label the start day
  separately from "Day 1". Their final answer dropped that idea entirely:
  "when you start a trip it should automatically get added to day 1 - that
  will remove the ambiguity around which day to assign a course to." So
  rather than *naming* the ambiguity away, the ambiguity is gone: a trip's
  starting point lands in Day 1, and there is no separate start slot.

### Item 4 was already done — no change made

> "Once I am in the plan phase the day tab should be removed/merged in to the
> itinerary tab."

This is exactly what GOLF-64 shipped. Verified against the live branch before
touching anything: Build mode renders `TABS=[['itin','Itinerary'],
['cost','Costs']]` and nothing else, and the standalone Day tab was retired
along with the rest of the old 5-tab set. Confirmed in-browser — the tab row
reads Itinerary / Costs. Left alone deliberately rather than re-implemented.
Most likely the stakeholder was recalling the pre-GOLF-64 build, or reading
Build's Itinerary tab (which *is* the merged view) as still being the old
read-only one.

### GOLF-69a: the Explore page's search finds towns and cities — DONE

> "On the explore page, I am unable to search for a town or city. This should
> work the same as the unified search bar."

The Explore `#q` box was a pure course filter; the Trip Builder's unified bar
(GOLF-61) had grown place search and the two had silently diverged. The same
debounced `orsGeocode()` call now fires alongside the course filter on every
keystroke — same 300ms debounce, same stale-response guard, same two actions
on a hit — rendering into a "Towns & cities" strip directly under the box.
Deliberately additive: the box still filters the course list underneath, so
nobody loses the behaviour they had.

### GOLF-69b: search on top, filters in one dropdown, green fee as a range — DONE

> "Move the search bar to the top of the explore page. Add a drop down to
> access the filters. Change the greenfees filter to a slider with input boxes
> for min and max."

Search moved from sixth control to first; the five filter groups now live
inside one collapsed `<details>` with a count badge on its summary (without
that badge an active filter restored from localStorage would be invisible
behind a closed dropdown, so the dropdown also auto-opens in that case).

The green-fee filter changed shape, not just skin: the four fixed `BANDS`
chips (a `Set` of band keys) became a real numeric `feeMin`/`feeMax` range,
driven by two overlaid range inputs plus typed min/max boxes. Two judgement
calls, both documented inline:

- **Scale tops out at the 95th percentile, not the maximum.** One £1,150
  championship green fee would otherwise squash every ordinary course into
  the leftmost tenth of the track, where a £10 move is sub-pixel. A thumb at
  the top means *unbounded* rather than "£350", so nothing is ever hidden by
  the scale — the readout says "£N+" to make that legible.
- **Unpriced courses ("POA", blank) pass while the range is untouched and
  drop out once a bound is set.** Stating a price ceiling and still being
  shown courses with no known price is the more surprising of the two
  behaviours.

`state.price` is kept in the state shape but read by nothing, so a
localStorage payload written by an older build still loads unmodified.

### GOLF-69c: the course list becomes "nearest to your trip" — DONE

> "Once I have selected and added the first course to a trip on the explore
> page, the bottom area underneath should show the list of courses nearest to
> it." (clarified: *replaces* the existing list)

The moment the trip has something to be near, the bottom-left list is
replaced by bookable courses sorted by distance from it, closest first, trip
members excluded, each with its own "+ Add to trip". A mode strip above the
list names the anchor and offers a **Near my trip / All results** toggle —
a one-way switch would strand anyone who wanted to carry on browsing.

Two deliberate calls: the nearest list **ignores the filter chips** (it
answers "what else could I play while I'm there?", and silently dropping a
neighbouring course because an unrelated filter was still set would make it
untrustworthy), and the **map still shows the full filtered result set**
underneath either list — the replacement is of the list, not of the map.

### GOLF-69d: dragging to the bottom of a day, and seeing where a drop lands — DONE

> "Dragging a course down to the bottom of the list in the day view doesn't
> work, you can drag courses correctly into the other spots but it is worth
> highlighting the area you are dropping it into once you have grabbed a
> course."

Both halves have the same root cause: dropping on a row always inserts
*before* that row, so the last position was only ever reachable by hitting
the few pixels of dead space under the final row — and nothing on screen said
so. Each day now renders an explicit dashed **"↓ Drop here to put it last on
Day N"** zone, hidden at rest and revealed only while a drag is in progress
(`body.tb-dragging`, set from the one `tbDragBegin()`/`tbDragEnd()` pair every
dragstart and dragend funnels through — so a cancelled drag can't leave the
flag stuck on). While dragging, every day gains a dashed outline and whatever
the pointer is over — row, zone, or day — highlights.

### GOLF-69e: rows align on the first letter — DONE

> "The alignment of courses in the day tab is wrong, make sure courses are
> aligned on the first letter"

A real CSS bug, not a padding tweak. The rows were three bare flex children
under `justify-content:space-between`, which **centres the middle one** — so
each row's name started at a different x depending on how wide its trailing
controls happened to be (a golf row carries a day `<select>`, a hotel row
doesn't). The name block is now the `flex:1` growing child with the icon in a
fixed-width cell, so every row's first letter lands in one column regardless
of type or controls. The wishlist rows, which previously had no icon at all,
gained one for the same reason.

### GOLF-69f: starting a trip lands in Day 1, and doesn't hijack the tab — DONE

> "In the day tab, when I search and then select a city to start a trip there,
> it automatically switches me to the discover tab. It shouldnt do that. It
> should insert that day as the first card in the trip"

> "when you start a trip it should automatically get added to day 1 - that
> will remove the ambiguity around which day to assign a course to. Also move
> the add a day button to underneath the first day ... and remove the part in
> square brackets at the top of the card where it says Day 1 [- 1 course]."

The tab hijack was `tbAnchorTripToPlace()`'s unconditional `setAppMode('plan')`
— correct when GOLF-64 added it (anchoring *is* a Plan-mode action), wrong the
moment the same code became reachable from Build. Now guarded, so a visitor
mid-Build stays put.

The Day-1 rule is the more interesting change, because it required agreeing
what "starting a trip" means across three separate entry points that had
drifted apart: a map popup's "Add to trip" (`toggleTrip`), the pane's
"+ Wishlist" (`tbAddToWishlist`), and picking a city from either search box.
All three now share one rule — *the first thing added to an empty trip starts
the trip, and a trip starts in Day 1* — and it would have been incoherent for
them to disagree about whether a Day 1 exists yet. GOLF-62's wishlist-first
default is untouched for every add after the first; this is only about how a
trip begins.

Also in this ticket: day headers read exactly "Day 1", suffix gone; "+ Add
day" moved to sit directly under Day 1's card. The bottom bar keeps "Clear
trip" and remains the drop target that moves a dragged day to *last* place
(every day drop lands before its target, so the final slot is only reachable
past the last card), and only shows its own add-day button once there are 2+
days, so a one-day trip doesn't get two identical buttons.

### GOLF-69g: chronological days, and hotel/POI markers on the map — DONE

> "when adding in a non-golf place it should show in the card before or after
> the golf course ... if I start the trip in Glasgow, then drive straight
> through to play Western Gailes, then drive to Redburn to stay the night it
> should show all 3 of those activities in chronological order during the day
> but with the golf course taking visual prominence."

The data model for this already existed — GOLF-63's `items[]` made a day one
ordered list of golf/hotel/POI stops, freely draggable, with `tripDayLegs()`
interleaving computed drive legs between them. So this was verify-and-extend,
not rebuild: what was missing was the *visual prominence* half. Golf rows now
carry a heavier name and an accent rule down their left edge, hotels and POIs
read as the connective tissue between them. Confirmed against the
stakeholder's own worked example, in both orderings they described.

> "Hotels can be marked on maps with little hotel emojis and POIs with
> location pins. Since we dont have hotel information, you can drop the pin
> somewhere in the nearest city"

A day's own hotel/POI stops were never drawn on the map at all (the existing
`tbDrawPois()` draws *suggested* nearby POIs fetched from the ORS proxy — a
different thing). They now draw as emoji markers: 🏨 for a stay, 📍 for a POI,
one icon vocabulary shared with the list rows. Location falls back in
priority order — the stop's own geocoded point, then the day's city, then the
day's last course, then the nearest day either side with one of those — which
is the stakeholder's "drop the pin somewhere in the nearest city", generalised
so it still works on a day that has no city set. A fallback-placed pin is
jittered a few hundred metres (so several locationless stops on one day don't
stack into a single invisible marker) and says "(approximate — no address
set)" in its tooltip, so nobody mistakes it for a real address.

### Verification summary for this round

- `node --check` on the extracted inline script clean after each of the two
  groups, not just at the end; `node scripts/test_data.js` still 326 courses
  / 114 Top 100 (no data-file changes — pure UI, as expected).
- Full in-browser walkthrough on a local server against this worktree,
  covering all ten items: Explore place search returning six real Glasgow
  hits with the right actions; filters dropdown + badge; fee range narrowing
  326 → 74 courses at £40–90 and surviving a reload; the list flipping to
  "Nearest to Western Gailes" (0/1/2/4 mi, closest first) on the first add
  and back via the pill; a golf row dragged onto the new end zone landing
  last (`hotel, poi, golf`) with the highlight class applied and the drag
  flag cleared; all three row types aligned on one column; a city picked in
  Build staying in Build (`appMode` and `tbBuildTab` unchanged) and landing
  as Day 1 with real coordinates; headers reading "⠿ Day 1"/"⠿ Day 2"; "+
  Add day" rendering between Day 1's card and Day 2's; the stakeholder's
  Burns Cottage → Western Gailes → Redburn Hotel ordering with golf still
  prominent; and 🏨/📍 markers, one on its real coordinates and one on the
  Glasgow fallback.
- Item 4 checked against the live UI *before* any edit and confirmed already
  shipped by GOLF-64 — reported rather than rebuilt.
- No "undefined" in the pane, `popupHTML()` sweep over all 326 courses clean,
  no JS console errors on load or after the full flow, no horizontal overflow
  at 375px (both Explore and Build re-checked at mobile width).
- Caught and fixed two of my own bugs mid-round: `[hidden]` on the new
  place-results and list-mode strips lost to their `display:flex` rules (so
  an empty box rendered at rest), and the first cut of the nearest-list
  branch returned out of `render()` *before* the marker loop, blanking every
  map pin — moved below it.
- All test trip data cleared via "Start fresh" before finishing (single empty
  default trip left in `localStorage`, filters and search reset too), per the
  standing instruction.
- Environmental note: unlike last round, the ORS proxy was healthy throughout
  — live geocoding was exercised for real rather than stubbed.

---

## Phase — 2026-08-29 — GOLF-70: modularising the inline script (branch `modularization`)

### Why now, and why not a framework

`london-golf-map-v5_1.html` had grown to 3,836 lines, of which 3,311 were a
single inline `<script>` block holding the entire application: the Explore
page, the whole Trip Builder, the ORS integration, the corrections editor and
the boot sequence, plus several dozen module-level globals. Every ticket from
GOLF-31 onward has been slower to land than the one before it purely because
finding the right place to edit meant scrolling one enormous file. This pass
buys back that velocity and changes nothing a visitor can see.

Explicitly NOT done, at the stakeholder's direction and consistent with every
prior round's hosting discussion: no framework (React/Vue/etc.), no build step
(webpack/Vite/npm), no `type="module"`. The app remains one set of static files
deployed straight to Cloudflare Pages with zero pipeline. `type="module"` is
specifically ruled out because module scripts scope their top-level bindings —
that would silently break all 49 inline `onclick=`/`onchange=` attributes in
the HTML, every one of which resolves its handler off the global scope. The
new files are therefore plain `<script src>` tags loaded in a fixed order,
exactly the pattern `data/*.js` has used successfully since GOLF-10.

### The design constraint that drove the boundaries

The inline script is not a list of declarations — it interleaves function
declarations with roughly two dozen *top-level executed statements*: the
`STN`/`STN_LINES` index build, `loadStoredState()`, the `L.map(...)`
construction, the rail/station drawing loops, the 326-marker build loop, the
chip wiring, the fee-slider IIFE, the legend, the drawer wiring and the final
`render()`. Splitting a single script into several changes one thing that
matters: function declarations hoist *within* a script, not *across* scripts.
A top-level statement in file N calling a function declared in file N+1 would
work today and throw after the split.

The split is therefore made only at **contiguous line boundaries in the
original order**. Nothing is reordered. This has a very strong consequence:
concatenating the new files in load order reproduces the original script body
byte for byte, which is mechanically checkable with `diff` and is the primary
evidence for "zero behaviour change". The cost is that a couple of modules are
slightly less pure than a free-reordering split would allow (the popup HTML
builders sit in `map.js` next to the marker loop that calls them; the handicap
calculator and the fee-slider bounds sit where they fall). That trade is taken
deliberately: on a refactor whose single hard requirement is that nothing
changes, a provable transform beats a prettier one.

Two ordering hazards were checked by hand and are satisfied by the cut points
chosen: `FEE_SLIDER_MAX`'s IIFE calls `feeNum()`, declared ~130 lines below it
(both land in `js/explore.js`); and the initial marker loop calls `pinFor()`/
`popupHTML()`/`courseTooltipHTML()` (all land in `js/map.js`).

### The modules

Load order is top to bottom; each file may use anything above it.

| File | Contains |
|---|---|
| `js/util.js` | Golf-flag marker SVG, the derived `STN`/`STN_LINES` station index, National Rail badge/roundel helpers, rail spline smoothing, architect tagging, the `EDITS` correction overlay (`V`/`isEdited`), and the played/want lists. |
| `js/trip-model.js` | The trip data model: the `TRIP` cart and `tripSeq`, `tripDays` with their ordered `items`, all day/item CRUD, drag-and-drop reordering, multi-trip snapshot/restore, and Trip Builder session state. |
| `js/state.js` | `localStorage` load/save/clear, the Explore filter `state` object, `HOME`, the `map` binding, and the initial `loadStoredState()` call. |
| `js/map.js` | The Leaflet map itself: basemap, rail/station layers and zoom restyling, the clustered course markers, pin/popup/tooltip HTML, nearest-station link line, mobile list↔map toggle. |
| `js/trip-geo.js` | Haversine distance, "bookable", the nearby/by-region/near-a-place discovery queries, the trip map layer, and the fee/accommodation/fuel cost model. |
| `js/trip-route.js` | Nearest-neighbour ordering, day colours, the drawn day-coloured route, the discovery result list, the trip-wide stop chain, per-leg estimates and all trip map drawing. |
| `js/trip-add.js` | Adding to a trip: pane search results, wishlist/day adds, place anchoring and add-a-city, and the draggable course/item row HTML. |
| `js/ors.js` | The straight-line drive-time heuristic plus the OpenRouteService proxy layer — leg times, route geometry, geocoding, POI lookup — and their caches. |
| `js/trip-ui.js` | The Trip Builder pane: day legs, itinerary lists, the Costs tab, the editable day schedule, the wishlist, and `renderTripBuilder()` with all its wiring. |
| `js/app-mode.js` | The three top-level modes (Explore/Plan/Build), URL hash, `pushState`/`popstate`, and the entry points from popups and the masthead. |
| `js/handicap.js` | The Course Handicap calculator shown inside a course popup. |
| `js/explore.js` | Filter chips, the fee-range control, Explore search (courses + places), sorting/filtering/fuzzy matching, the nearest-to-trip list, `render()`, and the map legend. |
| `js/editor.js` | The corrections drawer with its focus trap, the per-course editor, the JSON export/copy/download, and "clear saved state". |
| `js/boot.js` | First `render()`, cold-load mode restore from the URL hash, and the initial cart draw. |

Every name that was global before is still global: each file is a plain
non-module script, so its top-level `function`/`const`/`let` declarations land
on the global scope exactly as they did when they shared one block. No
`window.x =` shims were needed anywhere.

Out of scope and untouched: `data/*.js`, all CSS, and all HTML markup. The
only HTML edit is replacing the inline `<script>` block with the fourteen
`<script src>` tags.

### Deviations from the plan as written

Two, both forced by the same class of bug and both found by actually loading
the page rather than by reading it.

1. **`handicap.js` moved ahead of `map.js`.** The plan kept it in its original
   position, late. But `map.js` builds all 326 course popups at load time, and
   `popupHTML()` embeds `calcHTML()` — a transitive call I missed when I
   checked only the marker loop's direct callees. Safe to hoist: `handicap.js`
   is nothing but function declarations, so moving it changes no execution
   order.
2. **`feeNum`/`distOut`/`distMiles`/`rankNum` relocated from `explore.js` to
   `util.js`.** The same failure, one layer down: `popupHTML()` calls
   `distMiles()` at load time, and these lived in a module loaded later. This
   is the one deliberate break from the strict contiguous-cut rule — four pure
   function declarations, no top-level execution, documented inline at both
   the source and the destination. It also retires a latent hazard that
   predates the split: `FEE_SLIDER_MAX` is a top-level IIFE that calls
   `feeNum()`.

Both are exactly the failure mode the contiguous-cut design predicted:
declarations hoist within a classic script but not across two of them.

### Verification — zero behaviour change

A 40-signal behavioural baseline was captured from the pre-split build
(rendered popup HTML, card lists, cost summaries, itinerary HTML, saved
state), with nondeterministic values normalised out. Post-split, **38 of 40
are byte-identical**. The two that differ were investigated rather than
waved through, and are nondeterministic by construction: `legend` (identical
length 7200; contains a `Math.random()` id) and `saved` (identical length
931; contains `Date.now()` timestamps).

Also confirmed:

- `node scripts/test_data.js` — OK, 326 courses (114 Top 100).
- `node scripts/check_js.js` — 14 modules parse individually and together;
  HTML load order matches.
- The split is provably lossless: concatenating the modules in load order
  reproduces the original script body byte for byte (asserted by the
  extraction script).
- Line count conserved: 3,311 original body lines → 3,454 across `js/*.js`,
  the delta being the 14 module banner headers.
- Explore screenshot pixel-identical to the pre-split baseline.
- Full browser walkthrough: Explore (course search narrowing to 2 of 326,
  live ORS place geocoding, filters, markercluster expansion, a full course
  popup including the relocated `distMiles()` stat and the `calcHTML()`
  calculator); Plan (unified search, nearby discovery, wishlist, cost
  summary); Build (day assignment recomputing drive legs, day total and the
  ORS-suggested stay town; item drag-reorder and day drag-reorder through
  the real `tbDragSetItem`/`tbDayDragSet`/`tbDropOn`/`tbDropInDay` handlers;
  Costs tab); Explore↔Plan↔Build by click and by browser Back/Forward
  (`popstate`); and a 375px mobile pass, where state also survived a real
  page reload.
- All 17 sampled inline-`onclick` globals resolve as functions, confirming
  the plain-`<script>` (non-module) choice held.
- A freshly-opened tab loads with **zero** console messages of any kind.
  (Errors seen in the tab used during development were that tab's retained
  pre-fix buffer, verified as stale against live page state, not assumed.)

## Phase 18 — GOLF-71: design-system pass, one search component, sketch-accurate day cards, and a real drag-and-drop fix (stakeholder feedback, 2026-08-29) — DONE (branch `sidebar-redesign`)

Stakeholder brief, in their words: *"Use the blue colour, round off edges
and pills etc… The more you can do with the fewest number of interactions
the better… There should only be one search bar for everything… follow
modern UI guidelines such as those from Apple… All radiuses should be
consistent… so simple to do that my grandma could plan a trip… no small,
finicky buttons… Get rid of any text within the cards which isn't
necessary… Also make sure all the dragging around functionality works. It
is a bit clunky… the item should visually 'lift' up."*

Confirmed up front and not re-litigated: keep the three modes
(Explore/Plan/Build), keep the light theme, keep and refine the existing
blue `--accent` / `--accent-deep`.

### A. The design-token system

All of these live on `:root` in `london-golf-map-v5_1.html`, which is
still the only stylesheet. Every hardcoded radius/shadow/spacing/size in
the Trip Builder CSS was replaced with a token reference.

Radius scale (the stakeholder's "all radiuses should be consistent"):

    --radius-xs:6px  --radius-sm:8px   --radius-md:12px
    --radius-lg:16px --radius-xl:22px  --radius-pill:9999px

`--radius-sm` moved 6px→8px and `--radius-md` 10px→12px so the scale is a
clean progression rather than the ad-hoc set that had accumulated.

Elevation scale — cards are now genuinely distinct from the `--paper-2`
panel behind them, and there is a dedicated token for the drag state:

    --shadow-sm:      0 1px 2px rgba(27,39,51,.06), 0 1px 1px rgba(27,39,51,.08)
    --shadow-md:      0 4px 14px rgba(27,39,51,.10), 0 2px 4px rgba(27,39,51,.08)
    --shadow-lg:      0 14px 40px rgba(27,39,51,.18), 0 4px 10px rgba(27,39,51,.10)
    --shadow-card:    0 1px 2px rgba(27,39,51,.05), 0 6px 16px -6px rgba(27,39,51,.14)
    --shadow-raised:  0 2px 4px rgba(27,39,51,.06), 0 14px 28px -10px rgba(27,39,51,.22)
    --shadow-dragging:0 24px 48px -12px rgba(27,39,51,.38), 0 8px 16px -6px rgba(27,39,51,.22)
    --shadow-focus:   0 0 0 3px var(--accent-soft)

Spacing scale (4px base):

    --sp-1:4px --sp-2:8px --sp-3:12px --sp-4:16px
    --sp-5:20px --sp-6:24px --sp-8:32px

Type scale:

    --fs-micro:10px   --fs-caption:11.5px --fs-small:12.5px --fs-body:13.5px
    --fs-title:15px   --fs-lg:17px        --fs-xl:20px      --fs-hero:38px

Tap targets and motion:

    --tap:44px --tap-sm:36px
    --ease:cubic-bezier(.2,.7,.3,1) --dur:.16s

`--tap` is the Apple HIG 44pt minimum and is applied as `min-height` on
the single new button primitive `.tb-btn` (variants `.is-primary`,
`.is-danger`, `.is-quiet`, `.is-sm`, `.is-icon`), which replaced the
older `.btn2`/ad-hoc button styles across the pane. The only sub-44px
interactive elements left are `.linkbtn` inline text links, which are
padded to ~38px with a compensating negative margin so they still sit on
the text baseline.

### B. One search component, four call sites

The pane previously hand-rolled "type → debounce → geocode → results
dropdown" separately in the Explore search, the Build search, the per-day
city field and the add-stop location field, each with its own timer
variable and its own markup. All four now go through:

* `tbGeocodeDebounced(key, text, cb, ms)` — a keyed debounce with a
  stale-response guard (`tbGeoLatest[key] !== text` drops late replies),
  in `js/trip-ui.js`. `explorePlaceDebounce` in `js/explore.js` was
  deleted in favour of it.
* `tbSearchFieldHTML(o)` — renders the input plus its results container;
  `variant:'bar'` gives the full-width pill from the sketch.
* `tbAttachSearch(id, opts)` — wires it up. Parameterised only by what a
  result *does* (`onPick`), with optional `onType`/`render`. Adds
  ArrowUp/ArrowDown/Enter/Escape keyboard handling that none of the
  hand-rolled versions had, and keeps the `mousedown`-not-`click` pick so
  `blur` can't clobber the selection.

Duplicates removed: Discover's separate "Near a place" box (the unified
bar already anchors it), and a doubled empty-state message
("Add a course to see what's nearby." stacked on "Add a course to seed
nearby suggestions.") in `tbResultsHTML`.

The one bar is now `position:sticky; top:0` inside `#tb-pane`, so it stays
one tap away however far the itinerary is scrolled.

### C. Layout and copy

Chrome now follows the sketch top to bottom: navbar → full-width search
pill → a three-control toolbar (trip menu / Filters / Clear trip) → three
pill tabs (Itinerary / Costs / Discover) → content. The filter controls
that were spread across the pane collapsed into the one Filters
`<details>` dropdown. "Clear trip" and "Start fresh — delete all trips"
stay distinct: the first is the toolbar button, the second is the last
item in the trip dropdown, with a `title` spelling out that it deletes
every trip.

Day cards were rebuilt to the sketch hierarchy: drag handle, accent dot,
bold "Day N", place subtitle, right-aligned total; a thin rule; a
collapsed "Options" disclosure holding day type / city / date / drive-in /
Remove day; then indented `🚗 Drive 45 min` captions above each stop row.
Golf rows are deliberately heavier than hotel/POI rows (13.5px bold with
an accent rule down the left edge and the price in `--accent-deep` at
15px, versus 12.5px medium and a muted price). A "TRIP TOTAL" card closes
the list.

Copy audit, before → after:

* "Date is optional — used to cost this day at the correct weekday/weekend
  rate" → **"Date · optional"**, with the explanation moved to `title=`.
* Four sentences explaining live vs estimated drive times → **"Drive in
  [ ] min"** plus a one-word `live` / `auto` / `—` / `yours` chip, each
  with its own tooltip.
* A ~60-word paragraph of drag instructions above the day list →
  **deleted**; the affordance is now the handle and the drop zone.
* The add-stop form's two-sentence footnote → `title=` tooltip; only
  "📍 Location set" shows once a location is picked.

Click count for "plan a real trip from scratch", measured in the browser:
**2 clicks** to have a trip. Focus the one search bar, type "St Andrews",
click "Start a trip here" — that creates the trip, creates Day 1, sets its
city, flies the map there and lists the five nearest courses. Each further
course is then 1 click ("＋ Wishlist"), and 1 click reaches the Itinerary.

### D. Drag-and-drop — root cause and fix

Four separate defects, all in the same gesture:

1. **The row itself was not the drag source.** Each stop row contained an
   `<a>` for the course link, and `<a href>` is natively draggable, so
   grabbing a row anywhere near its name started a *link* drag that no
   drop target would accept. Fixed by putting `draggable="true"` on the
   row and `draggable="false"` on the anchor inside it.
2. **The handle was a ~10×14px glyph.** Now a 28×44px hit area
   (`.tb-drag-handle`), and visible at rest — it was `color:var(--line)`,
   effectively invisible, now `--stone` at `opacity:.45` going to 1 on
   hover.
3. **`dragover` did not always `preventDefault()`** on nested targets, and
   `drop` only fires when the preceding `dragover` did. Every drag
   attribute is now emitted from one helper, `tbRowDragAttrs()` in
   `js/trip-add.js`, so a row can never be wired up half-right.
4. **The drop zone reflowed the layout at `dragstart`.** It used to be
   inserted into flow, which moved every row under the cursor the instant
   the drag began — the "it doesn't seem to pick it up" symptom. It is now
   `position:absolute` over the card, so nothing moves.

Lift feedback, as asked: `.tb-drag-src` fades the source to `opacity:.4`
and scales it to `.98`, the hovered target gets `--shadow-dragging` plus a
3px accent insertion line via `::before`, and `body.tb-dragging` gates all
of it.

Verified with real `left_click_drag` gestures in the browser, not by
calling the model functions — all five cases pass: wishlist course →
day (grabbed by the *name*, the case that used to fail), reorder within a
day, stop from Day 2 → a row on Day 1, whole day dragged onto an earlier
day (`tbDayMoveTo 2->1`, order `[1,2]`→`[2,1]`), and a day dropped on the
bottom bar to move it last (`tbDayMoveTo 2->null`, order back to `[1,2]`).

Note for future debugging: a synthetic single-jump drag that never fires
`dragenter` on the target is silently a no-op — that produced two false
"still broken" readings during this work before instrumentation showed the
event sequence was simply incomplete. Real continuous motion always fires
it.

### Also fixed along the way

* At 375px the day header truncated to "Da…". `.tb-day-title-text` is now
  `flex:0 0 auto` so the *place name* absorbs the squeeze instead.
* The `⚙` glyph in the Options summary rendered as an illegible hairline
  at 11.5px; replaced with a CSS chevron and the plain word "Options".
* Dead code removed: `tripDaySelectHTML`, `explorePlaceDebounce`,
  `tripSwitcherHTML` (kept only as a one-line alias to `tbTripMenuHTML`).

### Risk flags

* The Trip Builder CSS block was replaced wholesale via a scripted splice,
  so a class used only from a rarely-hit code path could in principle have
  lost its styling. A grep sweep caught one real case (`.tb-emoji-marker`,
  re-added) and all three modes render clean, but this is the most likely
  place for a stray regression.
* `--radius-sm` and `--radius-md` changed value, so any element outside
  the Trip Builder that used them shifted by 2px. Intentional, but worth
  knowing.
* This phase was written from the code rather than from Phase 13–17 of
  this plan; those phases were read only after the fact. Nothing here
  contradicts them, but the reconciliation was retrospective.

## Phase 19 — GOLF-72/73/74/75: Explore search is navigate-only, itinerary item editing, per-person hotel pricing, price-band chips (stakeholder feedback, 2026-08-29) — DONE (branch `trip-builder-item-timeline`)

Four stakeholder-requested changes, implemented on top of Phase 15–17's
`trip-builder-item-timeline` branch (NOT on top of Phase 18's
`sidebar-redesign`, which is a separate unmerged branch — this branch
still has the hand-rolled per-call-site geocode wiring, not
`tbAttachSearch`/`tbSearchFieldHTML`; nothing here conflicts with that
refactor conceptually, but a later merge of the two will need to move the
new edit-form fields onto the shared component).

### GOLF-72 — Explore-mode place search just navigates

GOLF-69a had made Explore's search reuse the Trip Builder bar's
geocode-result rendering *including its actions* ("📍 Start a trip here" /
"+ Add to trip"). The stakeholder's ask: *search "Islay", the map goes to
Islay, full stop* — no trip affordances on a page whose job is browsing.

`renderExplorePlaces()` in `js/explore.js` now renders each hit as one
full-width `<button class="explore-place ep-go">` carrying only
`data-lat`/`data-lng` and a "Show on map →" affordance. The delegated
handler does exactly `showMobileMap(); map.flyTo([lat,lng],11,{duration:.6})`
— the same fly-to pattern the course cards below already use — and reads
or writes **no trip state at all**. `tbTripStarted()`,
`tbAnchorTripToPlace()` and `tbAddPlaceToTrip()` are no longer called from
this file.

Deliberately unchanged: the **Plan-mode unified search bar** keeps both
the anchor and the add-to-trip actions (GOLF-61/67). That bar *is* the
trip-building surface; this ticket is Explore-mode-only.

`EXPLORE_PLACE_ZOOM = 11` — a town or island fills the frame without
committing to a single street.

### GOLF-73 — Edit alongside Remove on itinerary items

Each hotel/POI row in Build → Itinerary now has an **Edit** button next to
its ✕. Editing swaps the row **in place** for an inline form (not a
`prompt()` — GOLF-63 upgraded adding away from those, and editing holds the
same bar) offering name, price, the new pricing controls, and location via
the *existing* debounced `orsGeocode()` search-as-you-type picker.

Implementation call: **adding and editing share one state object and one
form.** `tbAddStop` grew an `itemId` field (null = add). `tbEditStop()`
seeds it from the saved item; `tbAddStopFormHTML(dayId,itemId)` only
renders for the matching slot, so the form appears where the edited row
was, and the "+ Add hotel/stay" form still appears at the foot of the day.
`tbAddStopCommit()` branches to the new `tripDayUpdateStop()` when
`itemId` is set. Net effect: the geocode wiring in `renderTripBuilder()`
(same element ids), the coordinate-keeping rule and the price fields all
exist once, not twice.

The "keep the picked coordinates only if the name still matches what was
picked" rule carries over unchanged and does the right thing for edits
too: `s.name` is seeded from the saved item, so leaving the name alone
preserves the item's existing coordinates, while typing over it drops them
(they would otherwise be a lie).

`tbAddStopCapture()` reads in-progress input back into the state object
before the pricing toggle forces a re-render, so switching per-room ↔
per-person never discards a half-typed name or price.

**Scope call — golf items get no Edit button at all.** Everything about a
round (name, fee, coordinates) comes from the course dataset, which has its
own corrections editor; the one trip-level fact a golf row carries — which
day it sits on — is already the dropdown immediately to its left. An Edit
button there would either duplicate that dropdown or open an empty form.
Documented inline in `tripDayItemRowHTML()`.

Price flows through untouched: price lives on the item and every reader
already goes through `tripItemPrice()`, so an edited price lands in
`tripDayTotal()`, `tripCostLineItems()` and `tripCostBreakdown()` with no
separate cost path to update.

### GOLF-74 — per-person-sharing vs per-night-total hotel pricing

Field shape on a hotel item:

    {id, type:'hotel', name, price, priceType:'room'|'person', guests, lat, lng}

* `priceType` defaults to `'room'`, meaning *the entered figure is already
  the full room cost* — i.e. **exactly** the pre-GOLF-74 meaning of
  `price`. No existing trip's total moves by a penny.
* `guests` defaults to 2 and is only meaningful when `priceType` is
  `'person'`.
* When `priceType==='person'`, the cost contribution is `price * guests`.

The multiplication happens in exactly one place: the new
`tripItemPriceDetail(d,it)` in `js/trip-geo.js`, which returns
`{base,guests,sharing,total}`. `tripItemPrice()` is now a one-line wrapper
returning `.total`, so every existing caller (itinerary rows, day totals,
the three flat Itinerary lists, the Costs table, the export) picks up the
new arithmetic for free and none of them can disagree.

Judgement call inside it: the **regional fallback rate is never
multiplied.** `tripDayAccomFallback()` returns a typical *room* rate by
construction (GOLF-44 wrote it that way), so per-person only ever applies
to a price the visitor actually typed.

Legibility, per the stakeholder's "not just baked silently into the
total": the itinerary row reads `Stay · £90 × 2 (sharing) = £180`, the
add/edit form shows a live `£90 × 2 (sharing) = £180 per night` line, and
the Costs tab's line item reads `Rusacks … (£90 × 2 sharing)  £180`. A
`'room'` stay renders exactly as before, `£180`, with no extra chrome.

Migration follows the existing `validateTripEntry()` convention: a saved
hotel item with no `priceType` is read as `'room'` + 2 guests on load
(`js/state.js`), and `tripDayMigrateItems()` stamps the same defaults when
flattening a pre-GOLF-63 `hotel` object. Both are strictly
total-preserving.

UI: a two-radio toggle (Per room / night · Per person sharing) plus a
Guests number input that only renders when "per person" is selected —
hotels only; the POI form is unchanged.

### GOLF-75 — price-band chips back, on top of the range slider

GOLF-69b replaced the four fixed `BANDS` chips with a continuous
`feeMin`/`feeMax` range. The stakeholder wanted the quick options back.
They return as **shortcuts, not a second filter system**: the original
`BANDS` boundaries from `data/config.js` (≤ £30 / £31–70 / £71–150 /
£151+) render as chips above the slider, and clicking one simply calls the
existing `feeRangeSet()`. There is still exactly one piece of filter state.

* A chip highlights when the current range *is* its range, compared after
  the same normalisation `feeRangeSet()` applies (0 → null at the bottom,
  the slider ceiling → null at the top), so the question is asked in the
  stored vocabulary. Dragging the slider off a band clears the highlight.
* Clicking the already-active chip clears back to "any price".
* `state.price` stays unused — the old Set-based band filtering is
  deliberately **not** resurrected.
* The chips are `class="fee-band-chip"`, **not** `class="chip"`: the
  generic chip handler keys off `data-k`/`data-v` into a state `Set` and
  would throw on these. Same pill styling, separate class.
* Wiring is delegated on `#f-fee-bands`, because `renderFeeBands()`
  rewrites the chips on every range change to refresh pressed state.

Fixed along the way: the range inputs' `step` moved 5 → 1. The band
boundaries are odd numbers (£31/£71/£151) and a step-5 track snapped the
thumb to the nearest multiple, so the slider silently disagreed with the
readout and the number boxes, which read the exact stored value. The typed
min/max boxes keep their £5 step.

### Verification performed

`node scripts/check_js.js` (14 modules parse + load order) and
`node scripts/test_data.js` (326 courses) both pass; no data files were
touched.

In-browser, against a local server serving **this worktree** (the
`golf-map-preview` launch config resolves against the main checkout, so a
separate static server was used):

* **GOLF-72.** Typed "Islay" in Explore's search; the geocoder returned
  "Isle of Islay, Scotland, United Kingdom" et al., rendered with **no**
  trip buttons. Clicking a hit calls `map.flyTo([55.78526,-6.23886],11)`
  (confirmed by instrumenting `map.flyTo`) and leaves
  `tripDays`/`tripSeq`/`tbPlaceAnchor` untouched with `appMode` still
  `'explore'`. Note: Leaflet's fly *animation* is a no-op inside the
  Browser pane (animation frames are throttled there) — the pre-existing
  course-card fly-to behaves identically, so the call, not the motion, is
  what was asserted.
* **GOLF-73/74.** Added a hotel through the real UI: picked "St. Andrews,
  Scotland, United Kingdom" from the geocode dropdown (coordinates
  attached, drive leg computed: "Trent Park Golf Course → St. Andrews ·
  7h 41m"), typed £90, switched to Per person sharing — the form kept the
  typed name and price and showed "£90 × 2 (sharing) = £180 per night".
  Saved item: `{price:90, priceType:'person', guests:2, lat:56.338795,
  lng:-2.79942}`. Row read `Stay · £90 × 2 (sharing) = £180`; day total
  £197 (£17 + £180); Costs tab Stays £180. Then hit **Edit**, re-searched
  "Rusacks", picked "Rusacks St. Andrews, Fife" (new coordinates written),
  changed the price to 120 and switched to Per room — item became
  `{price:120, priceType:'room', lat:56.342453, lng:-2.804267}`, day total
  £137, Stays £120, i.e. **not** doubled. The item `id` was preserved, so
  its position in the day survived the edit. A POI was edited the same way
  (name Castle → Castle Museum, price 10 → 25); its form correctly shows no
  pricing-basis controls.
* **Migration is genuinely a no-op.** Hand-built a pre-GOLF-63 *and*
  pre-GOLF-74 saved trip in `localStorage`
  (`hotel:{name:'Old Inn',price:90}`, `pois:[{name:'Castle',price:10}]`,
  no `items`, no `priceType`) and reloaded: it flattened to `items` with
  `priceType:'room', guests:2` and priced at **£90**, day total £117 —
  identical to pre-ticket behaviour.
* **GOLF-75.** Chips render ≤ £30 / £31–70 / £71–150 / £151+. Clicking
  "mid" set `feeMin=31, feeMax=70`, readout "£31 – £70", chip pressed, 28
  of 326 results; "premium" set `151/null`, readout "£151 – 350+", 73
  results, sliders reading exactly 151/350 (this is what surfaced the
  step-5 snapping). Dragging the max slider to 200 cleared the highlight
  and left `151/200` · 26 results. Clicking the active chip again returned
  to "any price" · 326 of 326 with the Filters badge hidden.
* **No console errors** across the whole session; no `"undefined"`
  anywhere in the rendered DOM. At **375px** (mobile preset) neither the
  Explore filter dropdown (band chips sit on one row above the slider) nor
  Build's itinerary rows nor the open edit form overflow —
  `documentElement.scrollWidth === innerWidth === 375` and zero descendants
  extend past the viewport in either place.
* Test state cleared before finishing: `localStorage` emptied and the page
  reloaded to one empty default trip, no played/want/edits, filters reset.

## Phase 20 — Fix: Build mode's empty-trip dead end (stakeholder-reported live bug, 2026-08-29) — DONE

### Context

The stakeholder reported the live GitHub Pages build (which they use directly
at the bookmarked `.../london-golf-map-v5_1.html#trip` URL) as "broken" —
unable to add days, hotels, or anything. Note up front: `main` at the time
of the report did **not** contain GOLF-71's redesign (branch `sidebar-redesign`,
commit `a051b4e`, still unmerged) — the stakeholder had been testing that
branch's local preview separately, so the live site's plainer look was
expected, not itself a bug. The real bug was functional, not visual, and
was reproduced directly.

### Root cause

`tripDayScheduleHTML()` in `js/trip-ui.js` had an early-return for the
empty-trip state (`!tripSeq.length && !tripDays.length`) whose copy said
"Add a day below" — but the only "+ Add day" button in the whole function
lived inside the day-cards loop (`tripDays.map(...)`, rendered under Day 1's
card), which never runs when `tripDays.length===0`. Landing on `#trip`
directly (or hitting "Start fresh") produced a screen with no way to
create the first day at all — a genuine dead end, not a cosmetic issue.

A second instance of the same bug class: the bottom "endzone" bar's
"+ Add day at the end" button was gated on `tripDays.length>1`, so a trip
with wishlist courses but zero days (reachable via the same "Start fresh"
→ add courses → Build path) also had no add-day button anywhere.

### Fix

- The empty-state branch now renders its own "+ Add day" button directly,
  instead of promising one "below" that didn't exist.
- The endzone bar's condition changed from `tripDays.length>1` to
  `tripDays.length!==1` — it now also shows when `tripDays.length===0`
  (covering the second case above), and stays hidden only when exactly one
  day exists (avoiding a duplicate button next to Day 1's own).

### Verification

`node scripts/check_js.js` and `node scripts/test_data.js` both pass.
In-browser against the local preview: `tripStartFresh()` → Build mode
landed on the empty-state message with a working "+ Add day" button
(previously absent); clicking it created Day 1 with the place field
focused, exactly as `tbAddDayWithPlace()` is supposed to behave. Test
state cleared before finishing.

Pushed directly to `main` (no separate branch — this is a one-line-class
bugfix to a live, reported dead end, not a design change needing review).

## Phase 21 — Merging `sidebar-redesign` (GOLF-71) into `main` (GOLF-72–76) — DONE

### Context

Phase 18's GOLF-71 design-system pass had been sitting on the unmerged
`sidebar-redesign` branch while Phases 19 and 20 (GOLF-72/73/74/75, then
GOLF-76) shipped straight to `main`. The stakeholder reviewed GOLF-71 and
approved the merge, so the two lines had to be reconciled. They had
diverged from merge base `232c9b3`: three commits each way, touching
almost exactly the same six files.

Mid-merge the stakeholder clarified the priority: **GOLF-71 is the source
of truth for UI/UX**, not an equal-weight blend. The rule adopted was
"keep GOLF-71's structure, styling and component patterns as the baseline;
re-implement the GOLF-72–76 *features* on top of them, using GOLF-71's own
classes and components rather than reintroducing main's older markup". One
earlier resolution was revisited on that basis (see the `.is-sharing`
reversal below).

### The six conflicts and how each was resolved

**1. `TESTING.md` (1 conflict).** Both sides only appended numbered
checks. Concatenated: main's checks 37 (GOLF-72/73/74/75) and 38
(GOLF-76) kept as-is, GOLF-71's check renumbered 37 → **39**. Checks 37
and 38 were then edited for mechanics GOLF-71 changed (see "TESTING.md
updates" below).

**2. `js/explore.js` (2 conflicts).** GOLF-71 replaced this strip's
hand-rolled debounce with the shared `tbGeocodeDebounced()`; GOLF-72
(which postdates it) had replaced the strip's *rendering* with
navigate-only rows. Both kept — the shared debounce (GOLF-71's internals)
plus GOLF-72's rendering and click handler. The local
`explorePlaceDebounce` handle was dropped as dead. Importantly, GOLF-71's
side of the render conflict still drew "Start a trip here"/"+ Add to
trip" buttons *and* referenced a `started` variable that GOLF-72 had
deleted — taking that side would have been both a feature regression and
a `ReferenceError`.

**3. `js/trip-add.js` (1 conflict).** GOLF-71 rebuilt the item row: one
`⋯` overflow menu (`tbRowMenuHTML`) replacing the inline day `<select>`
and `✕`, a dedicated `.tb-item-price` column, and drag wiring via
`tbRowDragAttrs()`. GOLF-73's Edit button and GOLF-74's price label were
re-expressed through that: **Edit became a `✎ Edit` menu item** in the
same overflow menu (hotel/POI only; golf rows get the "Move to" section
instead, still no Edit), and the price column shows the effective total
with the sharing arithmetic in its `title=` tooltip.

**4. `js/trip-model.js` (2 conflicts).** The add-stop form is now
GOLF-71's: `tbSearchFieldHTML()` for the location field, `.tb-btn` /
`.tb-field` primitives, token spacing, GOLF-71's shortened copy ("Add a
stay"). Layered onto it: GOLF-73's `itemId` parameter and edit-mode
titles/Save label, and GOLF-74's per-room/per-person radios, conditional
Guests field and live "£90 × 2 (sharing) = £180 per night" preview.

**5. `js/trip-ui.js` (5 conflicts).** The largest. GOLF-71 had extracted
`tbDayCardHTML()` out of `tripDayScheduleHTML()` and rewritten both, plus
`itinLegRowHTML()`, `tbItinHotelRailHTML()` and `tbWishlistHTML()`.
GOLF-71's versions were taken wholesale, then the GOLF-72–76 behaviour
re-added on top:
- GOLF-73's in-place row→edit-form swap, moved into `tbDayCardHTML()`'s
  row loop.
- `tripPriceLabel()` kept (main's), rewritten to delegate to GOLF-71's
  `tbMoney()` so it is a strict superset.
- GOLF-74's worked label wired into the hotel rail and the Costs line
  items; the Costs POI category label kept as GOLF-71's `'Stop'` (note:
  `tripCostBreakdown()` filters on that exact string — using main's
  `'POI'` here would have silently zeroed the POI subtotal).
- **GOLF-76 needed no code at all**: GOLF-71's rewritten
  `tripDayScheduleHTML()` already gives the empty state a working
  "＋ Add a day" button (plus "Browse courses"), and its end-zone bar
  shows "＋ Add a day" unconditionally. The dead end Phase 20 fixed
  cannot recur in GOLF-71's structure. GOLF-71 also removed the per-day
  "+ Add day" button under Day 1, so Phase 20's "hide the duplicate when
  exactly one day exists" rule is now moot.

**6. `london-golf-map-v5_1.html` (1 conflict).** GOLF-71's side was
empty: it had deleted the entire old Trip Builder CSS block (161 lines)
and rebuilt it on design tokens elsewhere in the file. Resolution was to
take the deletion, then audit for classes GOLF-72–76 had added *into* that
now-deleted block. Rather than eyeballing it, the deleted block was saved
and a script extracted every class referenced from any `class="..."` in
the HTML and all 14 JS modules, then diffed against every class defined in
the surviving CSS. That surfaced exactly two genuine casualties:
**`.tb-pricetype` and `.tb-guests`** (GOLF-74). Both were re-expressed in
GOLF-71's tokens (`--sp-*`, `--fs-*`, `--radius-*`, `--tap-sm`) rather
than pasted back with their old hardcoded px.

Two extra rules were needed that main never had: GOLF-71's
`.tb-addstop-row input{flex:1 1 120px}` would otherwise have stretched the
pricing radio buttons and the Guests box to 120px each, so both get an
explicit `flex:0` reset. GOLF-74's other CSS (`.fee-band-chip`,
`.fee-bands`, the `.explore-place` button restyle, `.ep-hint`) sat
*outside* the deleted block and auto-merged cleanly — GOLF-71 deliberately
scoped its redesign to the Trip Builder pane and left the Explore filter
chrome (`.chip` et al.) untouched, so those keeping main's styling is
correct, not a leftover.

### The one resolution that was revisited

Initially GOLF-74's worked label ("£90 × 2 (sharing) = £180") was rendered
*inside* GOLF-71's itinerary price column, with a new
`.tb-item-price.is-sharing` rule letting that column wrap. After the
stakeholder's "GOLF-71 is the baseline" steer this was reversed: GOLF-71's
price column is a single nowrap figure and stays exactly that. The
arithmetic instead renders on GOLF-71's **own existing `.cart-region`**
meta line under the hotel name — so the information is still visible
(not demoted to a tooltip), no new style was added, and the row's shape is
untouched. The `.is-sharing` CSS rule was deleted. Net result: zero
modifications to any GOLF-71 CSS rule; the only CSS added is the two
new-class definitions GOLF-71 had no equivalent for.

### Verification performed

`node scripts/check_js.js` (14 modules parse, load order matches) and
`node scripts/test_data.js` (326 courses) both pass. In-browser against a
local static server serving *this worktree* — worth noting, because a
preview server was already running against the main checkout and silently
served pre-merge files; the merged build had to be served on its own port
to test anything real.

- **GOLF-72 (the flagged high-risk regression), end-to-end with a live
  geocode:** typing "Islay" into Explore returned 6 hits, **all** of them
  navigate-only `.ep-go` rows, zero trip-action buttons anywhere in the
  strip, and clicking one left day count, wishlist, anchor and mode
  byte-identical. The Plan-mode unified bar, separately, still renders
  both actions ("Anchor here" / "+ Add to trip") for places and
  ("+ Wishlist" / "+ Day N") for courses — the split GOLF-72 asked for.
- **GOLF-75:** all four chips render inside GOLF-71's collapsed Filters
  dropdown above the slider. Clicking £71–150 set state/slider/readout to
  exactly 71–150; £151+ set 151 exactly (not 150 — slider step is 1);
  clicking the active chip cleared to "any price"; highlight tracked
  correctly throughout.
- **GOLF-74:** £90/person × 2 → day total £180, Costs "Stays" £180, line
  item annotated "(£90 × 2 sharing)", itinerary meta line "£90 × 2
  (sharing) = £180". Switching the room/person toggle mid-entry preserved
  a half-typed name and price (`tbAddStopCapture()` still wired).
- **GOLF-73:** `✎ Edit` present in the hotel row's ⋯ menu, absent from the
  golf row's (which shows "Move to" + Remove instead) — confirmed by real
  clicks. Edit swapped the row for the form **in place** (2 rows → 1 row +
  1 form, exactly one form on screen — the day-footer add form correctly
  suppressed by the `itemId` guard), seeded name/price/guests, "Save"
  label, and on save preserved the item's id, its position in the day, and
  its coordinates (name untouched). No `prompt()` anywhere.
- **GOLF-76:** empty Build state renders "＋ Add a day" + "Browse
  courses"; clicking created Day 1 with its Options/city picker open.
- **Drag-and-drop:** item reorder within a day, wishlist course → day, and
  whole-day reorder all performed and all mutated state correctly, with
  GOLF-71's visuals confirmed live — `tb-drag-src` lift on the source,
  `tb-drop-over` insertion line on the target, `.tb-dropzone` revealed
  during drag, `body.tb-dragging` cleared on dragend.
- **No "undefined"** across all 326 popups; **no horizontal overflow** at
  375px on Explore, Build, or Build with the edit form open (Guests input
  correctly pinned to 64px). **Zero JavaScript console errors.**
- Test trip/localStorage state cleared before finishing (project
  convention) — verified empty.

### TESTING.md updates

Beyond renumbering GOLF-71's check to 39, checks 37 and 38 were amended
where GOLF-71 changed *how* to perform them: Edit is now found in the ⋯
row menu (not beside a ✕), the golf row's day control is that menu's
"Move to" section (not an inline dropdown), GOLF-74's worked label is on
the row's meta line (price column shows the total), and GOLF-76's
"only Day 1's button shows" clause was retired since GOLF-71 removed the
per-day add button entirely.

### Risk flags / judgement calls

* **Edit moved into the overflow menu** rather than staying a visible
  inline button. This is one click deeper than GOLF-73 shipped. It follows
  the stakeholder's "GOLF-71 is the baseline" steer (GOLF-71 collapsed all
  row actions into that menu precisely to kill "small, finicky buttons"),
  but it is a discoverability trade worth a glance.
* **The sharing arithmetic is not in the price column.** Build-mode rows
  carry it only in a `title=` tooltip; the Itinerary tab shows it on the
  meta line. Deliberate, per the reversal above, but it means the
  Build-mode row alone shows a bare "£180" for a £90pp booking.
* The hotel-rail row (`.itin-hotel-price-md`) has no `white-space:nowrap`
  in GOLF-71's CSS, so a long sharing label wraps there. Acceptable
  (that's the hotel-filtered view where price is the point), not
  separately designed.
* **Keyboard nav on the shared search component could not be
  automation-tested**: `tbAttachSearch()` guards painting on
  `document.activeElement===input`, and the automated browser pane never
  reports focus, so results never painted for the day-city field under
  synthetic input. That code path is GOLF-71's, untouched by this merge,
  and the same component demonstrably works in the unified bar (which
  supplies its own `render`), so this is an automation limitation rather
  than an untested change — but it is the one GOLF-71 claim in check 39
  this merge did not independently re-confirm.
* Intermittent 502s from the external ORS proxy worker
  (`geofftheworker.stefand94.workers.dev`) were present throughout, both
  pre- and post-merge. Geocoding succeeded; the routing endpoint is
  flaky/rate-limited. Unrelated to the merge, but it means drive-time
  "live" values could not be exercised end-to-end.
* `map.flyTo()` does not complete in the automated pane (animation frames
  are throttled) — `setView` works, `flyTo` stalls. Confirmed **identical
  on pre-merge `main`**, so environmental, not a regression. GOLF-72's
  navigate-on-click was therefore verified by handler execution and trip-
  state invariance rather than by observing the map land on Islay.

## Phase 22 — Investigation + fix: unified search "won't find a town or region" (2026-08-29) — DONE

### Context

Stakeholder reported, right after the GOLF-71 merge: "Something is up with
the unified search. It wont let me search for a town or a region. It just
filters courses." Investigated directly rather than assumed a merge
regression, since three of the merge's conflict-resolved files
(`js/explore.js`, `js/trip-ui.js`, `js/trip-add.js`) are exactly the files
that own this code path.

### Finding: not a code bug — the external ORS geocoding endpoint is
returning 403

Traced every hop of both search surfaces (Explore's `#q` box → `js/explore.js`
`exploreSearchPlaces()`/`renderExplorePlaces()`; Plan/Build's unified bar →
`js/trip-ui.js` `tbAttachSearch()`/`tbGeocodeDebounced()` →
`js/trip-add.js` `tbUnifiedSearchResultsHTML()`) — every link in the chain is
present, correctly wired, and untouched in the way that matters by the merge.
Confirmed by testing the live Cloudflare Worker
(`https://geofftheworker.stefand94.workers.dev/`, the same one GOLF-45/56
deployed) directly:

- `POST {"mode":"geocode","text":"Edinburgh"}` → consistently
  `{"error":"ORS request failed","status":403}` for every place tried.
- `POST {"origin":[...],"destination":[...]}` (drive-time/routing, the
  *other* ORS product behind the same Worker/API key) → succeeds normally.

Same API key, two different ORS products (Directions vs. Geocoding) behind
one Worker (`scripts/cloudflare-worker/ors-proxy.js`) — one authenticates,
the other is rejected. This is the **reverse** of what Phase 21's merge
verification observed (geocoding worked, routing was flaky) — something
changed on the OpenRouteService account side between then and now, not in
this repo's code.

Why it read as "just filters courses" rather than an obvious error: `orsGeocode()`
(`js/ors.js`) degrades any fetch failure to `cb([])` — an empty result list,
indistinguishable in the UI from "no such place" — rather than surfacing an
error state. So Explore's `#place-results` box stays hidden and the unified
bar's "Towns & cities" group never renders, both looking exactly like
"place search doesn't exist," when what's actually happening is every
geocode call is failing silently.

### What this needs

1. **Primary, not something I can do:** the OpenRouteService account behind
   `ORS_API_KEY` (the encrypted secret on the stakeholder's Cloudflare
   Worker) needs its Geocoding product access restored — likely it needs
   separate enabling/renewal from Directions on the ORS dashboard, or its
   quota lapsed. **Stakeholder action needed**: log into
   openrouteservice.org's dashboard, check the key's enabled
   services/quota for Geocoding specifically (Directions is clearly still
   fine). Once that's fixed, no app code needs to change — the wiring is
   already correct end-to-end.
2. **Secondary, optional resilience fix, doable now regardless of #1:**
   `orsGeocode()`/`tbGeocodeDebounced()` currently can't distinguish "the
   service is down" from "no matches" — both silently show nothing. Add a
   distinct failure signal (e.g. `cb(undefined)` on a fetch/HTTP error vs.
   `cb([])` for a genuine empty result) and have
   `renderExplorePlaces()`/`tbUnifiedSearchResultsHTML()` show a small
   "Place search is temporarily unavailable" message in that case instead
   of rendering as if nothing was typed. Would have made today's outage
   self-evident instead of looking like a regression, and costs little.

### Decision (stakeholder, 2026-08-29)

Reported finding #1 — stakeholder will check the ORS dashboard themselves,
not something this session can do (their account). Stakeholder asked for
#2 (the resilience fix) to be implemented now.

### Implementation plan for #2

**Goal:** distinguish "the geocoding service failed" from "there are
genuinely no matches," and surface the former as a small, clear message
instead of rendering identically to an empty/untyped search box.

**`js/ors.js` — `orsGeocode(text,cb)`:**
- Currently: any fetch/non-OK-response error is caught and calls `cb(null)`;
  callers then normalize `null` to `[]` via `list||[]`, which is
  indistinguishable from a genuine zero-result response (which is *also*
  `[]` from ORS). Confirm exact current shape by reading the function
  before editing — Phase-22 investigation cites lines ~136-149.
- Change: keep `cb([])` for a real empty result set (ORS responded, no
  matches), but give the failure path (network error, non-OK status, JSON
  parse failure) a distinct signal — `cb(null)` staying reserved for
  exactly that failure case, with callers stopping their current
  `list||[]` normalization (which currently erases the distinction) and
  instead treating `null` as "search unavailable" and `[]` as "no
  matches."

**`js/trip-ui.js` — `tbGeocodeDebounced(key,text,cb,ms)`:**
- Currently normalizes `null`→`[]` before calling the caller's `cb`
  (per investigation, line ~48: `cb(list||[])`). Remove that
  normalization — pass through whatever `orsGeocode` returned (`null` on
  failure, `[]`/array on success) so callers can tell the two apart.

**Call sites — both need a "temporarily unavailable" render branch:**
- `js/explore.js`: `exploreSearchPlaces()`/`renderExplorePlaces()` — when
  the callback receives `null` (not `[]`), show a small message (e.g.
  "Place search is temporarily unavailable") in `#place-results` instead
  of leaving it `hidden` as it does today for both the "nothing typed" and
  "no matches" cases; keep the box hidden only for those two genuine-empty
  cases.
- `js/trip-ui.js`/`js/trip-add.js`: `tbAttachSearch()`'s `render` callback
  and `tbUnifiedSearchResultsHTML()` — same distinction: a `null` places
  result renders a small unavailable-message row in the "Towns & cities"
  slot instead of silently omitting that whole section; an empty array
  keeps today's behavior (no places section, or the existing "No places or
  bookable courses match…" copy when courses are also empty).

**Explicitly not changed:** the debounce timing, the stale-response guard
(`tbSearchQ.trim()!==q` bail), the course-search path (unaffected —
courses were never routed through `orsGeocode`), or anything about the ORS
routing/directions endpoints (confirmed healthy, out of scope).

**Verification:**
- `node scripts/check_js.js` and `node scripts/test_data.js` after the
  edit.
- In-browser: with the ORS geocoding endpoint still currently 403ing live,
  simply typing a place name in both Explore's search box and the Plan/
  Build unified bar should now show the "temporarily unavailable" message
  instead of silently nothing — this is directly testable right now
  without any stubbing, since the outage is real and current.
- Also verify the genuine no-match case still renders as before: search
  Explore's course box for a nonsense string that also geocodes to nothing
  (or stub `orsGeocode` to return `[]`) and confirm no false "unavailable"
  message appears.
- Confirm course search itself (unaffected path) still works normally
  throughout.
- Clear any test/localStorage state before finishing, per standing
  convention.

### Implementation — DONE

Shipped exactly as planned above, in `js/ors.js` (no change needed —
already correctly distinguished failure from empty), `js/trip-ui.js`
(`tbGeocodeDebounced()` now passes `undefined` through instead of
collapsing it to `[]`; `tbAttachSearch()`'s default `paint()` and the
unified search bar's `render()` callback both keep the distinction instead
of erasing it) and `js/trip-add.js`
(`tbUnifiedSearchResultsHTML()` renders an explicit "Place search is
temporarily unavailable" message under Towns & cities when
`tbUnifiedPlaceResults===undefined`), plus the equivalent in `js/explore.js`'s
`renderExplorePlaces()` for the Explore-mode strip.

Verified in-browser against the **real, still-live outage** (no stubbing
needed for the failure path): typing "Edinburgh" in Explore's search box
showed "Place search is temporarily unavailable." in `#place-results`;
typing "Newquay" in the Plan-mode unified bar showed the same message
under a "Towns & cities" heading, with the Golf courses section (Perranorth
etc.) rendering normally alongside it. Stubbing `orsGeocode` to return `[]`
(the genuine-no-match case) confirmed both surfaces fall back to their
original copy ("No matches" / "No places or bookable courses match…") with
no false "unavailable" message. `node scripts/check_js.js` and `node
scripts/test_data.js` both pass. No JS console errors (the 403/502s logged
are the expected network-level failures from the still-broken ORS endpoint,
not app bugs). `TESTING.md` check 40 documents the walkthrough. Test/
localStorage state cleared before finishing.

**Still outstanding, stakeholder action needed:** the root cause itself —
the ORS account's Geocoding product access — is unaffected by this fix and
still needs the stakeholder to check the OpenRouteService dashboard for the
key behind the Worker (`ORS_API_KEY`). This fix only makes that outage
visible and non-misleading in the UI instead of silently looking like a
broken feature; it doesn't restore geocoding itself.

### ⏰ Reminder for next session

**Stakeholder said they're tired and asked to be reminded to check the
OpenRouteService dashboard in the morning** (2026-08-29 evening) — the
Geocoding product on the key behind `geofftheworker.stefand94.workers.dev`
is 403ing while Directions on the same key still works; see the write-up
above. Surface this at the start of the next session if it hasn't come up
already.

## Phase 23 — Brainstorm: next steps and further features (2026-08-29 evening, not started)

No code changes tonight — stakeholder asked to brainstorm rather than
build. Captured here so it isn't lost, organized by theme, drawing on
what's already scoped-but-parked elsewhere in this file plus fresh ideas.
Nothing below is committed to; it's raw material for the stakeholder to
react to next session.

### Already parked elsewhere in this plan (not repeated in detail — just flagged as live options)
- **GOLF-34b** — real accommodation pricing/booking (Booking.com Affiliate,
  Amadeus, or Travelpayouts — Travelpayouts flagged as the leading option
  given its confirmed monetization path, but has an approval-wait).
- **Pillar 4, tiers 2–4** (Phase 11) — export/import a trip as a link or
  file (zero backend), magic-link cloud sync (small backend, no accounts),
  full accounts + real-time co-editing (Google-Docs-style). Currently on
  tier 1 (local-only, multi-trip). A natural "what's next" if the
  stakeholder wants to plan trips with other people rather than solo.
- **Google sign-in** — cheap only once tier 3/4 above exists; not worth
  doing in isolation.
- A **single-expanded-day Day-tab view** and **true hotel/city search**
  (vs. today's manual name+geocode entry) were both explicitly flagged as
  not-done in Phase 13/15 and never revisited.

### New ideas, not yet scoped anywhere

**Extending the course data (same pattern as GOLF-25/26 Scotland/Wales):**
- Northern Ireland / Republic of Ireland courses (Royal County Down,
  Royal Portrush, Ballybunion, Lahinch) — same DotGolf-platform trick may
  or may not apply (Ireland Golf's own club-finder would need checking),
  natural next geography given the England/Scotland/Wales pattern already
  built.
- Course photo galleries beyond the single club logo already pulled — a
  richer visual popup.
- Aggregated course reviews/ratings (from a source that allows it — needs
  its own research spike, same caution as any new external data source).

**Trip-planning depth:**
- ~~A packing list / pre-trip checklist per trip~~ — **scrapped**
  (stakeholder, 2026-08-29/30): out of scope, not revisited.
- ~~Weather forecast for the trip's dates~~ — **scrapped** (stakeholder,
  2026-08-29/30): out of scope, not revisited.
- ~~Actual-spend tracking vs. the existing cost estimate~~ — **scrapped**
  (stakeholder, 2026-08-29/30): out of scope, not revisited.
- **Group cost-splitting ("who owes what") — confirmed in scope, but
  explicitly sequenced after sharing** (stakeholder, 2026-08-29/30: "I
  like the group cost split thing. We can track who pays for what and net
  it off but this naturally only comes after sharing links etc."). Stays
  exactly where Phase 11's Pillar 4 already put it — not buildable until
  at least tier 2 (export/import a shareable link/file) exists, since
  there's no "group" without another person able to see the trip. No
  change to scope or design, just a confirmed priority: revisit this the
  moment any Pillar 4 tier ships.
- A shareable **read-only itinerary view** (print-friendly / PDF-ish) for
  a finished trip — separate from Pillar 4's live-editing tiers, more like
  "here's a nice document of the trip," could ship without any backend
  (a client-side print stylesheet) well before real sharing infrastructure.
- **New (2026-08-29/30): richer POI enrichment** — see GOLF-79 below,
  scoped this round in response to the stakeholder's whisky-distillery/
  castles ask.

**Platform/UX:**
- PWA basics (manifest + service worker) so the app can be added to a
  phone's home screen and the shell loads offline — the course data is
  already fully static, this would be a small, self-contained addition.
  **See the "PWA basics — what it actually takes" write-up in Phase 24
  below** for the stakeholder's follow-up question on effort/mobile
  requirements.
- Dark mode — **parked** (stakeholder, 2026-08-29/30): build later, driven
  off `prefers-color-scheme` (system setting) rather than an in-app
  toggle, when it's picked up.
- A short first-visit onboarding/tour highlighting the three modes
  (Explore/Plan/Build) — **parked** (stakeholder, 2026-08-29/30), same as
  dark mode.
- Calendar export (.ics) once real dates exist per day (GOLF-48) —
  **parked** (stakeholder, 2026-08-29/30), same as dark mode.

## Phase 24 — Ireland & South Africa course data, and a monetization cost estimate (2026-08-29)

### Context

Stakeholder confirmed several Phase 23 brainstorm items are out of scope for
now (trip sharing — parked until Google accounts land; group cost-splitting;
course reviews/ratings unless cheaply/legally sourceable from somewhere like
Top100Golf; a Played/Want-to-play list — parked as a future feature once
accounts exist) and asked for two concrete next steps instead: extend the
course data to **Ireland** and to **South Africa**, plus an elevator-pitch
cost estimate for turning the site into a monetizable product. Feasibility
for both data sources was researched this session (`WebSearch`/`WebFetch`,
not assumed) before scoping either ticket.

### This session's sequencing (stakeholder, 2026-08-30)

Explicit order confirmed: **(1) research the HNA South Africa site and
report back — done, see the rescoped GOLF-78 below; (2) implement Ireland
(GOLF-77) next; (3) then South Africa (GOLF-78), now that a real API is
confirmed rather than requiring manual curation.** The four research/answer
items below (POI enrichment, routing/search provider comparison, PWA
basics, dev/prod hosting) are informational this round — none block
GOLF-77/78 and none are being built yet.

### GOLF-77: Ireland course data — known-shape integration, same as GOLF-25/26

**Confirmed live**: `golfireland.ie`'s own find-a-club page footer reads
"Powered by DotGolf" — the identical white-label platform already integrated
three times over (England Golf, Scottish Golf, Wales Golf). The page exposes
the same kind of club-name/location/facility search UI as those three, so
this is presumed to be the same unauthenticated `POST /api/clubs/FindClubs`-shaped
endpoint on `golfireland.ie`'s own domain — to be confirmed by inspecting the
live request in-browser (the same first step GOLF-25 took for Scotland)
before writing the script, since the exact host/path wasn't visible from a
static fetch.

- **New script** `scripts/fetch_ireland_golf_clubs.py`, mechanically
  identical to `fetch_scottish_golf_clubs.py`/`fetch_england_golf_clubs.py` —
  same request shape, same output shape — pointed at Ireland's endpoint.
  `merge_club_details.py`/`merge_club_images.py` need no changes, same as
  every prior nation.
- **Course list sourcing**: the 2026 Irish Golfer Top 100 rankings
  ([irishgolfer.ie](https://irishgolfer.ie/top-100/2026/02/27/the-2026-irish-golfer-top-100-golf-courses-in-ireland-rankings/))
  plus a cross-check against [Top100GolfCourses.com's Ireland list](https://www.top100golfcourses.com/the-best-golf-courses-in-ireland)
  — same two-source cross-check convention as GOLF-23/25. Anchors: Royal
  County Down, Portrush, Ballybunion, Lahinch, Portmarnock, Royal Dornoch's
  Irish counterparts (Rosapenna, Old Head, Waterville, County Sligo). Curated
  subset, not a full enumeration — matches the England Top 100/Scotland/Wales
  precedent, final count set during sourcing rather than pre-committed.
- **New `data/courses-ireland.js`** (`C_IRELAND`), new `REGIONS` entries
  (e.g. a Causeway Coast/Antrim group, a South-West/Kerry-Clare links group,
  a Dublin/East Coast group — assigned by hand from real geography, same as
  every prior nation's regions), a `topIreland:1` flag + matching "Show only"
  chip.
- **Reused unchanged**: `compute_nearest_stations.py`/`merge_nearest_stations.py`
  — *caveat, flagged not assumed*: the underlying rail dataset
  (`davwheat/uk-railway-stations`) is GB-only, so Irish courses will need
  either a parallel Irish Rail station dataset (worth a 10-minute check for
  an equivalent open CSV) or — more likely, given Ireland's much sparser rail
  network relative to how remote most of these links courses are — simply
  ship with no `nearStation` field, exactly as the field already degrades
  gracefully for any course missing it today. Decide during implementation,
  not a blocker for starting.
- **Acceptance criteria**: mirrors GOLF-25/26 — `node scripts/test_data.js`
  passes with the new count; 3–5 sourced courses spot-checked against a real
  map; popups render with no "undefined"; new courses are reachable from the
  default view (not buried, per the GOLF-22 lesson already learned once).
- **Size**: M. **Depends on**: nothing — same low-risk shape as GOLF-25/26.

### GOLF-78: South Africa course data — RESCOPED (2026-08-30): a real API exists after all

**Superseded finding — GolfRSA was the wrong site.** The earlier check of
`golfrsa.com/our-clubs` (a static 7-club sponsored showcase) was correct as
far as it went, but the stakeholder pointed at a different, better site this
round: **Handicap Network Africa** (`handicaps.co.za/find-and-play`),
South African golf's actual handicapping body — the SA equivalent of England
Golf/Scottish Golf/Golf Ireland, not a marketing page. Investigated live
in-browser this session (not a static fetch — the page is Angular-templated
and renders nothing without JS), with real network traffic inspected.

**Short report:**
- Loading the page with a default (Gauteng-area) location immediately
  returned **"A total of 72 clubs found"**, each with a name, a straight-line
  distance ("23 KM" etc.), and a street address — a genuine live directory,
  not a placeholder.
- The live network traffic shows `POST https://www.handicaps.co.za/api/clubs/FindClubs`
  firing the search — **the exact same endpoint name** already integrated
  three times over for England Golf, Scottish Golf and Wales Golf, and
  presumed (pending live confirmation) for Golf Ireland in GOLF-77. This is
  strong evidence South Africa's directory runs on the same DotGolf
  white-label platform, or at minimum an API with an identical contract —
  either way, a known shape.
- Supporting endpoints on the same domain (`GetClubHierarchies`,
  `GetFacilityTypes`, `getPrograms`) also mirror the pattern seen on the
  other three nations' sites.
- Each club has a "View Details" page (not yet opened this session — next
  step, see below) that should carry the coordinates/phone/contact fields
  the merge pipeline expects, matching every other DotGolf-shaped nation.
- **Conclusion: it has the required data. Proceeding with it** — GOLF-78 is
  rescoped from "hand-curated, no API" to the same known-shape integration
  as GOLF-25/26/77, not a manual-sourcing job.

**Rescoped ticket**, mirroring GOLF-77 exactly:
- **Confirm the exact `FindClubs` request/response shape live** (search-text
  field name, and specifically whether the response includes
  `Latitude`/`Longitude` the way England/Scotland/Wales do, or whether
  coordinates only appear on the per-club "View Details" call — check that
  page before writing the script) — the same first step every prior nation
  took before scripting.
- **New script** `scripts/fetch_south_africa_golf_clubs.py`, mechanically
  identical to `fetch_scottish_golf_clubs.py`, pointed at
  `handicaps.co.za`. `merge_club_details.py`/`merge_club_images.py` need no
  changes if the response shape matches (to be confirmed, not assumed).
- **Course list sourcing**: two options, decide once the live API shape is
  confirmed — (a) query broadly by region/distance the way the site's own
  UI does (it already returned 72 clubs for one radius search around
  Gauteng alone, suggesting national coverage is large) and curate down to
  a notable subset the same way the England Top 100/Scotland/Wales lists
  were curated, or (b) go straight for the named anchor courses already
  identified via published rankings last round (The Links at Fancourt,
  Leopard Creek, St Francis Links, Durban Country Club, Royal Johannesburg
  & Kensington, Royal Cape, Pearl Valley, Arabella, Gary Player CC/Sun City,
  Glendower, Humewood) and look each one up by name against the API
  directly. (b) is very likely simpler and mirrors GOLF-25/26's approach
  most closely — final call during implementation.
- **New `data/courses-southafrica.js`** (`C_SOUTHAFRICA`), new `REGIONS`
  entries (Western Cape/Garden Route, KwaZulu-Natal, Gauteng, Eastern Cape),
  `topSouthAfrica:1` flag + chip — unchanged from the prior scoping.
- **`nearStation` still doesn't apply** — South Africa has no comparable
  passenger rail network; omit the field entirely rather than compute
  something misleading, same convention as before.
- **Acceptance criteria**: same as GOLF-25/26/77 — `node scripts/test_data.js`
  passes with the new count; 3–5 sourced courses spot-checked against a real
  map; popups render with no "undefined"; reachable from the default view.
- **Size**: M → likely **S–M now** (a real API materially de-risks this
  versus the hand-curation estimate). **Depends on**: nothing.

### Monetization cost estimate — elevator pitch (delivered in chat, not a ticket)

Answered directly for the stakeholder rather than filed as a ticket — no
code changes, a decision-support number. Grounded in the app's actual
architecture (confirmed in this file's own Phase 10/Hosting section): fully
static, already live on Cloudflare Pages (free tier), one small serverless
Worker already deployed for the ORS proxy (free tier, well under its request
cap at personal-project traffic), zero database, zero accounts today.

**Rough figures** (order-of-magnitude, not a quote):
- **Upfront, to go from "my project" to "a real product with a domain"**:
  a custom domain (~£10–15/yr) is the only mandatory new cost. Everything
  else needed to monetize — an affiliate account (Travelpayouts/Booking.com,
  free to register), a payment processor if ever selling something directly
  (Stripe, no upfront fee, ~2.9%+30p per transaction only when money moves)
  — costs £0 to set up. **Realistic upfront spend: under £50.**
- **Ongoing, at solo/early-traffic scale**: domain renewal (~£10–15/yr),
  Cloudflare Pages + Workers stay free well past any realistic early
  traffic level, ORS's free tier (2,500 requests/day) is nowhere close to
  being hit today. **Realistic running cost: £0–100/year**, almost entirely
  optional (a paid ORS tier or a paid accommodation API only becomes
  necessary if traffic genuinely outgrows the free tiers — a good problem).
- **What actually costs money as this scales**, in likely order of need:
  (1) a paid tier if ORS's free 2,500 req/day is ever exceeded (usage-based,
  cheap per request); (2) a real accommodation-booking integration
  (Travelpayouts is free but commission-based — costs nothing upfront,
  Booking.com's direct API needs a review that can take weeks); (3) if
  sharing/multi-user accounts are ever built (Phase 11's Pillar 4, tiers 3–4)
  a small always-on backend (Cloudflare Workers + KV, still cheap — tens of
  £/month at real usage, not hundreds).
- **The honest bottom line**: the infrastructure cost of turning this into
  a monetizable site is close to zero — a domain name is the only real
  expense — because the architecture was already built static-first and
  API-key-light. The actual cost of monetizing is **time**, not
  infrastructure: applying for/waiting on affiliate approvals, writing
  the actual booking/affiliate-link integration, and — the biggest
  unknown — getting real traffic to a site with no marketing budget yet.

### GOLF-79: Richer POI enrichment — castles, historic sites, distilleries (new, 2026-08-30)

Stakeholder's ask directly: *"How can we enrich the POI data? In Scotland I
have a list of whisky distilleries but there are lots of castles etc all
across England and Scotland."* Checked first whether a distillery list
already exists anywhere in this codebase — it doesn't (`grep` for
"whisky"/"distillery" across every `.js` file returns nothing) — so "I have
a list" refers to something the stakeholder holds separately, not existing
app data; this ticket is about a generic, queryable POI layer rather than
transcribing one list.

**This is a different thing from GOLF-46's existing "Show POIs" feature.**
GOLF-46 already queries ORS's `/pois` endpoint for fuel/restaurant/fast
food/hotel/guest house near an overnight stop — practical, not thematic.
What's being asked for here is **points of interest people would detour
for** — castles, distilleries, historic sites, viewpoints — surfaced near a
course or along a trip, which needs a different data source and a different
tag vocabulary.

**Recommended source: OpenStreetMap's Overpass API** — free, no API key,
no signup, matches this app's existing zero-key-where-possible philosophy
better than a second paid provider would:
- Query `historic=castle`, `craft=distillery` (the standard OSM tag for a
  whisky/gin distillery), plus a small curated set of other `tourism=*`/
  `historic=*` values (viewpoint, monument, ruins, museum) within a radius
  of a course or trip stop, using the `around` operator — the exact same
  query shape already researched this session.
- Coverage for exactly the two named examples is strong: Scotland's
  distilleries and castles/historic sites across GB are both well-mapped
  in OSM (they're popular, well-maintained tag categories).
- Cost/access: **free**, but Overpass has fair-use rate limits on its
  public instance — fine for on-demand user-triggered lookups (the same
  usage pattern as GOLF-46's existing POI toggle), not for bulk pre-fetch
  across all 300+ courses at once.
- Fits the existing architecture two ways, pick one during implementation:
  (a) **live, on-demand** — mirror GOLF-46 exactly: a `mode:'heritage-pois'`
  (or similar) branch on the existing Cloudflare Worker (`ors-proxy.js`)
  proxies to Overpass the same way it proxies to ORS, keeping the query
  server-side and cacheable; or (b) **pre-baked** — a one-off script (same
  `scripts/`-pipeline pattern as everything else) queries Overpass once per
  course/region and bakes a short curated list into the course data itself,
  avoiding any runtime dependency at all. (b) is more in keeping with this
  app's "fetch once, ship static" philosophy and is the better fit if the
  goal is "castles near this course" as a fixed fact; (a) is better if the
  goal is "what's nearby right now" the way GOLF-46 already works for an
  overnight stop. Needs a stakeholder steer on which framing matches the
  actual use case (course-level enrichment vs. trip-planning discovery)
  before implementation starts.
- **Acceptance criteria** (draft, to firm up once (a) vs (b) is decided):
  a course/stop with a nearby castle or distillery surfaces it (name +
  category, ideally a short OSM-sourced description); no request fired for
  a course/stop with genuinely nothing nearby (empty state, not an error);
  categories are curated (castle/distillery/historic/viewpoint), not every
  OSM tag dumped indiscriminately.
- **Size**: S–M depending on (a)/(b). **Depends on**: nothing structurally,
  but benefits from sitting next to GOLF-46's existing POI-toggle UI
  pattern rather than inventing a new one.

### Routing/search provider comparison — Google Maps vs. staying on OpenRouteService (research, 2026-08-30)

Stakeholder's question: *"What would the costing be to use google maps or
another provider instead of open maps? I'm thinking this becomes well
integrated with being able to search for things."* Researched this session,
not assumed:

- **Current state**: OpenRouteService (ORS) already powers driving
  directions/geocoding/basic POI search (GOLF-45/46/56), free tier **2,500
  requests/day**, proxied through the stakeholder's own Cloudflare Worker so
  the key never reaches the browser. This has been reliable in cost terms
  (genuinely free at this app's traffic) though it has had real-world
  reliability hiccups this month (Phase 22's Geocoding-403 incident,
  intermittent 502s noted in Phase 21) — a cost/reliability trade-off worth
  naming honestly.
- **Google Maps Platform, 2026 pricing** (confirmed via search against
  current docs — the old universal "$200/month free credit" was retired in
  March 2025): pricing is now per-API, no blanket free tier. Each API
  (Directions, Places, Geocoding) is billed individually, roughly **$2–$30
  per 1,000 requests** depending on which API and volume tier, with
  subscription bundles available (~$100/mo "Starter" up to ~$1,200/mo
  "Pro"). There is no meaningful free allowance comparable to ORS's 2,500/
  day at this app's current traffic level — **switching to Google outright
  would turn a currently-£0 cost line into a real recurring bill from day
  one**, scaling with usage.
- **Where Google genuinely wins**: Places API / Google Search-style
  "search for things" — restaurants, hotels, attractions with real photos,
  ratings, opening hours, live availability signals — is Google's actual
  strength and the thing ORS/Overpass can't match (Overpass gives OSM's
  crowd-sourced tags and names, not ratings/photos/hours). If "well
  integrated search" specifically means Google-quality place search results
  (not just routing), that's a Places API cost, separate from and on top of
  any routing decision.
- **Recommendation**: keep ORS for driving directions (no cost reason to
  move, and the reliability issues seen this month are more likely
  transient/account-side — see Phase 22's still-open ORS dashboard action
  item — than an argument for switching providers outright). If richer
  "search for things" is the actual goal, that's better framed as **which
  specific search experience** is wanted (a place search box with photos/
  ratings = Places API, a small cost; free-but-plainer POI discovery =
  Overpass, GOLF-79 above) rather than a wholesale provider swap — the two
  can coexist (ORS/Overpass for routing+free POI, a scoped Places API
  integration only for the specific search box that needs Google-quality
  results, gated on the stakeholder being comfortable with its per-request
  cost). Needs a concrete "what should typing in the search box return"
  answer from the stakeholder before scoping a ticket — this stays a
  research note, not yet a build.

### PWA basics — what it actually takes (research, 2026-08-30)

Stakeholder's question: *"It sounds like a low effort feature to create an
'App' but would require the website to be changed for mobile?"* Researched
this session, not assumed:

- **Two files, added on top of the existing site, not a rebuild**: a
  `manifest.json` (JSON: app name, icons at 192px and 512px, `start_url`,
  `display:"standalone"`) and a service-worker JS file registered from the
  page. Neither requires changing how the app is built or served today —
  "progressive enhancement," in the terms every source used: the site works
  exactly as it does now everywhere, and browsers that understand a
  manifest + service worker additionally offer "Add to Home Screen"/install.
- **Does NOT require the mobile layout to change.** This is the direct
  answer to the stakeholder's actual question: a PWA manifest/service worker
  is independent of responsive design — GOLF-19's existing mobile pass
  (375/390/428px breakpoints, already shipped) is what makes the *app*
  usable on a phone; the manifest/service worker is what makes it
  *installable* and *offline-capable*. You can ship one without the other in
  either direction. Since GOLF-19 already landed, the mobile-usability half
  of "make it feel like an app" is already done — PWA basics would only add
  the install/offline layer on top.
- **What it buys**: a home-screen icon, a standalone window (no browser
  chrome/address bar), and — since this app's course data is already fully
  static (Phase 10's "zero runtime API calls" property) — genuine offline
  browsing of the course list/map tiles-permitting after a first visit. The
  ORS-backed live features (drive times, geocoding, live POIs) would
  degrade gracefully offline the same way they already degrade when
  `ORS_PROXY_URL` fetches fail — no extra work needed there, that fallback
  already exists.
- **Genuine effort estimate**: small — a few hours, not a rebuild. Two new
  static files, one `<link rel="manifest">` tag, one `navigator.serviceWorker.register()`
  call, plus icon assets at the required sizes (an existing logo resized, if
  one exists, or a simple new one). No new build tooling needed — matches
  this app's zero-build-step convention.
- **Not scoped as a ticket yet** — this was an information request, not a
  build ask; ready to become a small ticket (e.g. GOLF-80) the moment the
  stakeholder wants it actually built.

### Hosting: does this need separate dev and prod links? (answered, 2026-08-30)

Stakeholder asked directly about
`https://stefand94.github.io/golf-map/london-golf-map-v5_1.html#plan`.
Checked the actual live setup rather than assuming (`gh api repos/.../pages`,
repo remotes/branches):

- **Confirmed**: the site is hosted on **GitHub Pages** (not Cloudflare
  Pages — that was this plan's earlier-session recommendation, and only the
  small ORS proxy Worker actually ended up on Cloudflare), serving directly
  from the `main` branch's root, auto-deployed on every push to `main`.
  There is currently **exactly one environment** — `main` *is* production,
  and it goes live the moment anything is pushed to it. No GitHub Actions
  workflow, no staging branch wired to a second URL.
- **This is exactly why so much recent work has been happening on separate
  branches** (`sidebar-redesign`, `trip-builder-item-timeline`,
  `modularization`) rather than `main` directly — those branches are already
  functioning as informal "dev," reviewed and merged into `main`/"prod" only
  once verified. That pattern is sound and already working; the open gap is
  that a feature branch has **no shareable live URL** of its own to test
  against on a phone or send to someone else before merging — only a local
  preview via `.claude/launch.json`.
- **Options, if a real dev link is wanted**:
  1. **GitHub Pages "preview" via a second repo/branch pointed at Pages** —
     GitHub Pages only serves one branch per repo natively; a second live
     URL would need either a second (throwaway) repo pointing at the feature
     branch, or switching Pages' source branch temporarily — clunky, not
     recommended.
  2. **Cloudflare Pages** (free, and already partially in this app's
     orbit via the Worker) — natively supports exactly this: every branch
     gets its own automatic preview URL (`<branch>.<project>.pages.dev`)
     alongside a production URL for `main`, with zero extra config beyond
     connecting the same GitHub repo. This is the standard "free dev+prod"
     answer for a static site and is a very close match to what's already
     described (aspirationally) elsewhere in this plan's earlier Cloudflare
     Pages hosting notes — worth actually adopting now that a genuine
     dev-link need has surfaced, rather than staying on GitHub Pages'
     single-branch model.
  3. **Do nothing, keep using local preview** — zero cost, already works,
     but no shareable link for phone-testing or stakeholder review mid-branch.
- **Recommendation**: option 2 (Cloudflare Pages, connected to the same
  GitHub repo) — free, gives every feature branch its own real URL
  automatically, and stays a fully static hosting model consistent with
  everything else in this app's architecture. Not scoped as a ticket yet;
  flagging as ready to set up whenever the stakeholder wants a real
  dev-link workflow instead of local-preview-only.

### Verification approach

- **GOLF-77/78**: `node scripts/test_data.js` after each merge; the existing
  `popupHTML()`-over-all-courses "undefined" sweep in-browser; spot-check
  coordinates for a sample of each nation's courses against a real map;
  confirm new courses are reachable from the default view/fit-to-results,
  not buried (per the GOLF-22 lesson).
- **GOLF-79**: once (a)/(b) is decided — confirm a known castle/distillery
  location returns a real result, confirm a course with nothing nearby
  degrades to an empty state rather than an error.
- Cost estimate, routing/search comparison, PWA write-up, and hosting
  answer need no separate verification — they're informational, not builds.

### Suggested prioritization lens for next session

Given how much has shipped in trip-planning depth over the last several
sessions (Phases 9–22), the biggest open gap is probably **sharing a trip
with someone else** (Pillar 4, still tier-1-only) — everything else above
is additive polish on a single-user experience that's already quite far
along. Worth explicitly asking the stakeholder whether "share with a
travel companion" is the next real priority, or whether they'd rather
keep deepening the solo planning experience (weather, packing lists,
actual-spend tracking) before opening up sharing.

## Phase 25 — Implementation round: Cloudflare Pages, Ireland, South Africa, live POIs (2026-08-30) — DONE

**Status correction (2026-09-02): this phase was marked "confirmed, not yet
started" but all four tickets actually shipped** — GOLF-80 (Cloudflare
Pages), GOLF-77 (Ireland), GOLF-78 (South Africa), and GOLF-79 (live
heritage POIs) are all live on `main`, confirmed against the real repo and
live deployments, not just this doc. This section was simply never updated
after the work landed. See [Phase 26](#phase-26) for the full reconciliation
and everything else that shipped in the gap between this phase and now.

### Context

Phase 24 was research-only (HNA South Africa report, Google/ORS cost
comparison, PWA basics, dev/prod hosting answer). The stakeholder reviewed
it and gave four concrete implementation instructions plus one bug they
want deferred:

> "Set up the Dev and Prod links. Do a full sweep of south african courses.
> Do the full Ireland Implmentation. Add in the POIs - use the API."

Three follow-up decisions confirmed via `AskUserQuestion` this session:

1. **"Fix the universal search"** = the Phase 22 ORS Geocoding 403.
   Stakeholder can't currently log into the OpenRouteService dashboard at
   all — "the log in sharing between it and heigit isn't working for some
   reason." **Explicitly parked** — "proceed with everything else and we
   can come back to this after my coffee." Not in this round's scope; the
   app-side resilience fix (Phase 22's "temporarily unavailable" messaging)
   is already shipped, so nothing is silently broken-looking in the
   meantime — this is purely waiting on the stakeholder regaining ORS
   account access.
2. **Dev/Prod links**: proceed with the recommended **Cloudflare Pages**
   setup (per-branch preview URLs + a `main` production URL). Confirmed
   this needs one stakeholder action I cannot do myself — connecting the
   GitHub repo to a new Cloudflare Pages project is done inside the
   Cloudflare dashboard (account-level action, same category as the ORS/
   RapidAPI signups already on file). My job is to prepare everything
   that doesn't require that click (docs, any config file Cloudflare Pages
   expects) and to verify the result once the stakeholder connects it.
3. **GOLF-79 POI enrichment**: confirmed **option (a) — live, on-demand**
   via the Overpass API, mirroring GOLF-46's existing "Show POIs" pattern
   exactly (a new `mode` branch on the already-deployed Cloudflare Worker,
   `ors-proxy.js`, cached client-side the same way).

### Sequencing for this round (revised, 2026-08-30: stakeholder wants to test as work lands)

**GOLF-80 (Cloudflare Pages dev/prod) → GOLF-77 (Ireland) → GOLF-78
(South Africa) → GOLF-79 (live POIs).** Reordered from the original plan
(which put hosting last) once the stakeholder pointed out they want to
actually test each change as it ships, not just at the very end.
GOLF-80's one stakeholder action (connecting the repo in the Cloudflare
dashboard — 2 minutes) is a single click with no dependency on any other
ticket, so doing it first means every subsequent feature branch
(GOLF-77/78/79) automatically gets its own live, shareable preview URL
the moment it's pushed — the stakeholder can test Ireland/South
Africa/POIs from a real browser or phone as each lands, instead of only
a local preview, and instead of everything landing invisibly until the
very end. Ireland/South Africa remain back-to-back after that (same
known-shape data pipeline, most efficient done together); POIs last
since it reuses the already-deployed Worker and is independent of the
new-nation data.

### GOLF-77: Ireland — execute as scoped in Phase 24

No changes to scope — implement exactly as written in Phase 24 above:
confirm the live `FindClubs`-shaped endpoint on `golfireland.ie` in-browser
first, `scripts/fetch_ireland_golf_clubs.py`, cross-checked course list
(Irish Golfer Top 100 + Top100GolfCourses.com), new `data/courses-ireland.js`
(`C_IRELAND`), new `REGIONS` entries, `topIreland:1` flag + chip,
`nearStation` decided live (Irish rail CSV if a good one exists, else
omitted). Verify via `node scripts/test_data.js`, coordinate spot-checks,
the `popupHTML()` "undefined" sweep, and default-view reachability
(GOLF-22 lesson).

### GOLF-78: South Africa — execute as rescoped in Phase 24

No changes to scope — implement exactly as written in Phase 24's rescoped
GOLF-78: confirm the live `handicaps.co.za` `FindClubs` request/response
shape (including whether `Latitude`/`Longitude` come back directly or need
the per-club "View Details" page), `scripts/fetch_south_africa_golf_clubs.py`,
course list sourced via option (b) — named anchor courses (Fancourt,
Leopard Creek, St Francis Links, Durban CC, Royal Johannesburg &
Kensington, Royal Cape, Pearl Valley, Arabella, Gary Player CC/Sun City,
Glendower, Humewood) looked up individually against the API, matching how
GOLF-25/26 were built. "Full sweep" (the stakeholder's phrasing) is read
as "cover South Africa properly with this curated list," not "enumerate
every club nationally" — flag to the stakeholder once the real API's
national coverage is seen live, in case they want the broader (a) option
instead once cost/effort is visible. New `data/courses-southafrica.js`
(`C_SOUTHAFRICA`), new `REGIONS` (Western Cape/Garden Route, KwaZulu-Natal,
Gauteng, Eastern Cape), `topSouthAfrica:1` flag + chip, no `nearStation`.
Same verification approach as GOLF-77.

### GOLF-79: Live POI enrichment (castles, historic sites, distilleries) via Overpass

Implements Phase 24's option (a) exactly:

- **Worker** (`scripts/cloudflare-worker/ors-proxy.js`): new
  `mode:'heritage-pois'` branch, alongside the existing `mode:'pois'`
  (GOLF-46) — a `handleHeritagePois()` that calls OpenStreetMap's Overpass
  API (`overpass-api.de/api/interpreter` or a documented mirror) with an
  `around` query for `historic=castle`, `craft=distillery`, plus a small
  curated set of `tourism=*`/`historic=*` values (viewpoint, monument,
  ruins, museum) within a radius of a given point, simplified down to
  `{pois:[{name,category,lat,lng}]}` — same response shape convention as
  the existing `handlePois()` so the app-side consumer code can be a close
  sibling, not a new pattern.
- **App side**: reuse GOLF-46's exact UI pattern — a toggle next to a trip
  stop (or, per this round's scope, also reachable from a course popup,
  to be confirmed during implementation which surfaces make most sense),
  cached in `localStorage` under its own key (e.g.
  `golfmap:heritagecache:v1`), silent-fail on error (consistent with
  GOLF-46/GOLF-56's degrade-gracefully convention — this is a "nice to
  have" layer, never a blocking one), never included in `fitBounds` so a
  castle marker can't zoom the map away from the actual trip/course.
- **Acceptance criteria**: a known castle or distillery (spot-checked
  against a real map, e.g. a Speyside course near a known distillery, a
  course near a known Scottish castle) returns a real result with a
  plausible name/category; a course/stop with nothing genuinely nearby
  shows an empty state, not an error; Overpass's fair-use rate limit is
  respected (on-demand only, no bulk pre-fetch loop anywhere in the code).
- **Depends on**: nothing structurally. Independent of GOLF-77/78's data
  work (applies equally to any nation's courses once shipped).

### GOLF-80: Cloudflare Pages dev/prod links

- **What I can do without the stakeholder**: confirm the repo has no
  Cloudflare-Pages-incompatible assumptions (no server-only build step —
  already true, this is a static site), write a short
  `docs/deploying.md` (or extend `scripts/README.md`) explaining the
  per-branch preview URL convention (`<branch>.<project>.pages.dev`) so
  it's documented once the project exists, and update this plan / any
  stakeholder-facing note with the exact steps for the one-time dashboard
  connection.
- **What needs the stakeholder** (account action, cannot be done on their
  behalf per this project's standing rules): log into
  dash.cloudflare.com → Pages → "Create a project" → "Connect to Git" →
  select the `golf-map` GitHub repo → build settings: no build command,
  output directory `/` (root) — since this is a fully static site with no
  build step, same as GitHub Pages' current config. Once connected,
  Cloudflare auto-detects and deploys `main` as production and every other
  branch as a preview automatically on push — no further per-branch setup
  needed.
- **After the stakeholder connects it**: verify the production URL serves
  the site correctly (spot-check a few pages/routes, confirm the ORS
  Worker integration still works cross-origin), verify at least one
  feature branch (e.g. `trip-builder-item-timeline`, still pending merge)
  gets its own live preview URL, and note both URLs back to the
  stakeholder. GitHub Pages can stay live in parallel initially (no need
  to tear it down same-day) — cut over to Cloudflare Pages as the
  canonical prod link once verified, not before.
- **Depends on**: the stakeholder performing the one dashboard-connection
  step above. Everything else in this ticket can proceed without them.

### Explicitly deferred this round

- **The ORS Geocoding 403 / "universal search"** — stakeholder is locked
  out of the OpenRouteService/HeiGIT login; nothing actionable on the app
  side beyond what Phase 22 already shipped (the "temporarily unavailable"
  messaging). Revisit once the stakeholder regains dashboard access.
- Merging the still-unmerged `sidebar-redesign`/`trip-builder-item-timeline`
  work into `main` is untouched by this round — GOLF-77/78/79 should land
  on whichever branch makes sense given that state (likely a fresh branch
  off `main`, confirmed as first step of implementation) and their merge
  timing is a separate decision from this round's four tickets.

### Verification approach

Per-ticket verification is listed under each ticket above; all four are
independently testable and independently mergeable — none blocks another
except in the stated sequencing order. Standing convention still applies:
`node scripts/test_data.js`, `node scripts/check_js.js`, the `popupHTML()`
"undefined" sweep, and clearing all test/trip state before ending the
session.

## Phase 26 — Reconciling this plan with reality (2026-09-02)

### Why this section exists

This file had drifted well behind `main`: Phase 25 was still marked
"confirmed, not yet started" while all four of its tickets were live, and
an entire additional round of work (14 more commits, several without any
corresponding entry here) had shipped in between with nothing recorded.
Verified directly against `git log`, the live data files, the deployed
Cloudflare Worker, and both live hosts before writing this — not assumed
from memory. Going forward, treat gaps between this doc and `git log
main` as the doc being stale, not the repo — check `git log` when in
doubt.

### Everything confirmed shipped since Phase 25, in commit order

- **GOLF-80 — PWA basics** (`b850881`, merged `99cc8b0`): `manifest.json`,
  `sw.js` (cache-first app shell), SVG icons, service-worker registration
  in `js/boot.js`, `docs/pwa.md`. **Note the ticket-number collision**:
  this is a *different* GOLF-80 from the one earlier in this plan
  (Cloudflare Pages dev/prod, also numbered GOLF-80) — two unrelated
  tickets ended up with the same number across sessions. Both are done;
  just don't assume "GOLF-80" uniquely identifies one of them if this
  file is searched later.
- **Mobile drag-and-drop + POI cleanup** (`9fca6c3`, merged `48f4162`):
  fixed mobile drag-and-drop, a coincident-map-marker bug, and general POI
  UI cleanup.
- **Ireland/SA multi-course estate audit** (`c3ae226`, `8abc117`, merged
  `3119e7a`): added missing sibling courses at 27/36+-hole estates for
  the newly-added nations, fixed a naming bug (Druids Heath losing its
  parent club name).
- **`docs/deploying.md`** (`be7ebfb`): documents the Cloudflare Pages
  per-branch preview URL convention from Phase 25's GOLF-80.
- **GOLF-77 — Ireland course data** (`b936b23`): shipped as 37 curated
  courses, grown to **43** by the sibling-course audit above. Confirmed
  live in `data/courses-ireland.js`, sourced via
  `scripts/fetch_ireland_golf_clubs.py` against Golf Ireland's public
  club-finder API (same DotGolf-platform shape as England/Scotland/Wales,
  confirmed as expected).
- **GOLF-78 — South Africa course data** (`f8222d3`): shipped as 19
  curated courses, grown to **23** by the same sibling-course audit.
  Confirmed live in `data/courses-southafrica.js`.
- **GOLF-79 — live heritage POI enrichment** (`8e01ebb`, plus mirror
  fixes `79d0493`/`94a0e8a`/`ff6d52e`): a `mode:'heritage-pois'` branch on
  the Cloudflare Worker queries OpenStreetMap's Overpass API (no key
  needed) for castles/distilleries/monuments/ruins/museums/viewpoints
  near a point — confirmed present in the deployed
  `scripts/cloudflare-worker/ors-proxy.js`. The mirror commits show some
  live flakiness with `overpass-api.de` was hit and worked around
  (settled back on that mirror after trying alternatives) — worth a
  glance if heritage POIs ever look unreliable again.
- **GOLF-1/2/3/6/back-btn** (`dddcae2`): currency correctness (the
  £-vs-Rand bug), a filter-pill reorder, wishlist UI tweaks, a masthead
  back-button.
- **GOLF-81 — 3-nation Explore gating + geocode boundary fix**
  (`0d59a4c`, merged `176ad5f`): Explore's course list is now gated
  behind 3 country pills (Great Britain / Ireland / South Africa) —
  nothing populates until one is picked. Fixed `rankNum()` silently
  flattening every non-London course's rank to 500. Widened the Worker's
  geocode boundary from GBR-only to `GBR,IRL,ZAF` so South
  Africa/Ireland place search can work at all — **the commit message
  says this needs a manual Worker redeploy to take effect live; not
  independently confirmed this session whether that redeploy happened**
  (the Worker's geocoding endpoint is currently 403ing for an unrelated
  reason — see below — so this couldn't be tested live). Also dropped
  the Trip Builder day card's collapsible "Options" block per stakeholder
  feedback ("it's confusing").
- **GOLF-79-partial/GOLF-3** (`de95171`): place-only-day POIs, "Add to
  trip" from a place, removed stale South-Africa rail references (SA has
  no comparable passenger rail — `nearStation` was already correctly
  omitted for it, this just cleaned up leftover mentions).
- **GOLF-82 — wishlist-only course adds** (`4fe0ed8`): reverted the
  GOLF-69-item-8 behavior (first course auto-creating Day 1) back to
  always landing in the wishlist, on the stakeholder's explicit
  instruction after real-world use — the auto-Day-1 convenience turned
  out to be the wrong default in practice. Also merged place actions
  down to one button per state ("Start a trip here" before a trip
  exists, "+ Add to trip" once one does).
- **Live SW redirect bug, first fix** (`04121c2`, `944fa50`, `e2981dd`):
  the "Response served by service worker has redirections" bug this
  session started with — see the fix write-up already covered
  conversationally; not otherwise logged in this plan file until now.
  Root cause: `cache.addAll()` in `sw.js`'s `install` handler silently
  followed Cloudflare's redirect on the `.html` precache URL and stored
  the poisoned redirected Response under that key, bypassing an earlier,
  narrower fix that only touched the `fetch` handler. Also fixed a
  £-vs-Rand currency bug in the Plan-mode wishlist.
- **GOLF-71/72–76 — sidebar redesign merge** (`17359a9`, plus `c1fb9f4`,
  `62065b7`): merged the long-unmerged `sidebar-redesign` branch
  (design-token system, one unified search component, sketch-accurate
  day cards, a real drag-and-drop fix) as the UI baseline, with
  GOLF-72–76 (Explore search made navigate-only, itinerary item editing,
  per-person hotel pricing, price-band filter chips) re-implemented on
  top of it rather than dropped. GOLF-76 separately fixed a Build-mode
  empty-trip dead end (no way to add a day/hotel from a bare "#trip"
  landing) reported live by the stakeholder.
- **This session — `sw.js` install-handler atomicity + root-path
  precache** (`67f2281`): two findings from an adversarial review of the
  redirect fix above — the install loop's `cache.put()` wasn't atomic
  the way `cache.addAll()` is (a persistently-failing precache URL could
  leave a partially-populated cache behind), and `'/'` itself was never
  precached (a narrow offline gap for a visitor who never happened to
  visit root online first). Both fixed, `CACHE_NAME` bumped to v5,
  verified live on GitHub Pages.

### Confirmed current data scale

`node scripts/test_data.js`: **392 courses total, 114 Top 100** —
London 123, England Top 100 114, Scotland 51, Wales 38, Ireland 43, South
Africa 23 (per-file entry counts; the 392/114 totals are the tool's own
authoritative numbers).

### Git/branch hygiene (verified 2026-09-02)

`main` is byte-identical to `origin/main` (`67f2281`) — nothing unpushed,
nothing unpulled. Six other local branches exist
(`explore-country-pills`, `ireland-sa-course-audit`, `journey-and-pairs`,
`mobile-dnd-poi-fixes`, `pwa-basics`,
`worktree-agent-a14fa9a30a410690f`) — **all fully merged into `main`,
zero commits ahead**, safe leftovers rather than pending work; worth a
`git branch -d` sweep at some point but nothing is stuck or at risk.
`journey-and-pairs` in particular has no corresponding entry anywhere in
this plan — its content is presumably covered by one of the merged
commits above (likely the sidebar-redesign/GOLF-71 line, given the
timing), but this wasn't independently traced this session; flag if its
name doesn't ring a bell and it's worth a closer look via `git log
journey-and-pairs`. Only one worktree exists, on `main`.

### The one confirmed-live outstanding blocker

**OpenRouteService Geocoding is still returning 403**, tested directly
against the live Worker this session
(`POST https://geofftheworker.stefand94.workers.dev/` with
`{"mode":"geocode",...}` → `{"error":"ORS request failed","status":403}`).
This is the same issue flagged at the end of Phase 22/25 — the
stakeholder was locked out of the OpenRouteService/HeiGIT account
dashboard and asked to be reminded to check it. **Still not resolved as
of this session.** Nothing on the app side can fix this — it degrades
gracefully (Phase 22's "temporarily unavailable" messaging) rather than
looking broken, but real place search across Explore and the Plan/Build
unified bar stays down until the stakeholder's ORS account access is
restored. This should be the first thing checked next session if it
hasn't come up already, and it's also why GOLF-81's `GBR,IRL,ZAF`
geocode-boundary widening (above) couldn't be verified live this round.

### Backlog / brainstormed-but-not-built, re-verified against the actual code this session

Spot-checked by grepping the real source rather than trusting Phase 23's
original list — all of the below are still genuinely absent as of
`67f2281`:

- **Trip sharing** — still local-only; no share link, export/import, or
  multi-user anything. The `#trip` URL hash (GOLF-41) is a
  same-browser bookmark/deep-link convenience only, not a sharing
  mechanism between people. Still the most likely "biggest remaining
  gap" now that solo planning is this deep — worth asking the
  stakeholder directly whether this is the next real priority.
- **Real accommodation pricing/booking** (Travelpayouts/Booking.com/
  Amadeus) — still only plain link-outs, no live pricing or booking
  flow anywhere in the code.
- **Dark mode** — no `prefers-color-scheme` anywhere in the stylesheet.
  Explicitly parked for later, driven by the OS setting rather than an
  in-app toggle when it's picked up.
- **Calendar export (.ics)** — not implemented.
- **First-visit onboarding tour** — not implemented.
- **Group cost-splitting** — confirmed in scope by the stakeholder but
  explicitly sequenced *after* trip sharing (no "group" without another
  person able to see the trip).
- Packing lists, weather forecasts, and actual-spend tracking were all
  explicitly **scrapped** by the stakeholder already (2026-08-29/30) —
  recorded as decided-against, not backlog.

### Suggested next steps

1. Stakeholder checks the OpenRouteService/HeiGIT dashboard (see above) —
   unblocks real place search and lets GOLF-81's boundary fix actually be
   verified live.
2. Ask directly whether trip sharing is the next priority, or whether to
   keep deepening the solo experience.
3. Optional housekeeping: delete the six fully-merged, zero-ahead local
   branches listed above.

## Phase 27 — Ireland & South Africa Top 100 broadening (2026-09-02) — DONE

### Context

Per the stakeholder's explicit instruction ("there are only about 100
courses in south africa worth having though... do all the top 100 courses
in SA"), broadened both nations' curated lists toward their national
Top 100 rankings, executed autonomously per the project's standing work
style. Ireland's target (also ~Top 100) was my own judgment call for
consistency with South Africa's explicit scope, not separately confirmed.

- **Ireland**: 43 → **83** courses (+40), diffed against the 2026 Irish
  Golfer Top 100 ranking.
- **South Africa**: 23 → **99** courses (+76), diffed against
  satop100courses.com's Top 100-by-name list.
- Sourced via the existing `fetch_ireland_golf_clubs.py`/
  `fetch_south_africa_golf_clubs.py` pipeline against
  `scripts/output/ireland_names_batch2.json`/`southafrica_names_batch2.json`.

### Data-quality issues found and fixed this round

- **South Africa's fuzzy name-matcher produced several silently-wrong
  high-confidence matches** (not flagged as failures — `details` was
  present, just for the wrong club): "CCJ Woodmead"→"PECANWOOD",
  "Emfuleni"→"MACCAUVLEI", "Blair Atholl"→"SIMOLA", "Elements"→"THE
  LINKS", "Wild Coast Country Club"→"NEWCASTLE COUNTRY CLUB". Caught only
  by manually eyeballing every `matched_name` vs `query`, not by the
  `details:None` check. Fixed via targeted retries and, for the two still
  wrong, a raw HTTP call to `GetClubHierarchies` to find the exact club
  name.
- **3 SA clubs had zero/null coordinates** in the API
  (`kingswood`/`olivewood`/`the-club-at-steyn-city`) — set manually via
  WebSearch. Also corrected a wrong assumption: Olivewood is in Chintsa,
  **Eastern Cape**, not KwaZulu-Natal.
- **2 Ireland lookups unresolvable via the API** (`golf-at-the-hawthorn`,
  `st-margaret-s`) — set manually via WebSearch. Also corrected a wrong
  initial guess: "Golf at The Hawthorn" is in Oranmore, Co. Galway, not
  Letterkenny.
- **Duplicate course name**: both new Killarney entries generated the
  identical literal club name — renamed to "Killarney (Killeen)" /
  "Killarney (Mahony's Point)", matching the existing parenthetical-suffix
  convention (Powerscourt East/West, etc.).

### Known limitations / judgment calls (not confirmed with stakeholder)

- **New-batch fee/architect/note fields are generic placeholders**
  (`band:"mid"`, flat `wd`/`we` estimate, `arch:"Unknown"`, `spec:"18"`,
  `note:""`, all `conf:"est"`) — unlike the original hand-researched
  entries. Flagged inline in both files' header comments. Revisit with
  real per-course research before trusting fee figures for the new
  courses specifically.
- **South Africa region mapping**: Free State and Northern Cape clubs
  both fell back to "Gauteng" (no dedicated `REGIONS` bucket exists for
  either) — a judgment call, not reviewed with the stakeholder.
- No `t100` ranking object added to the new batch (consistent with the
  precedent already set for sibling-course entries elsewhere).

### Verification performed

`node scripts/test_data.js` — OK, **508 courses (114 Top 100)**, all
data-integrity checks pass (`EXPECTED_TOTAL` updated 392→508).
`node scripts/check_js.js` — 15 modules parse and load correctly. Full
in-browser `popupHTML()` sweep across all 508 courses — zero
"undefined"/errors. Spot-checked 8 new coordinates (Leopard Creek,
Emfuleni, Kingswood, Olivewood, Steyn City, Hawthorn, St Margaret's, both
Killarneys) against real-world geography — all plausible. Country-flag
counts confirmed: `topIreland` 83, `topSouthAfrica` 99. No console errors
on load (one 404 seen was from a manual bad navigate against the local
Python preview server, not an app resource — all 24 real app files
loaded 200 OK). Default-view reachability relies on the pre-existing
GOLF-81 country-pill gating mechanism, unchanged by this data-only round.

No test/trip `localStorage` state was created this session (verification
was read-only against a fresh preview), so nothing needed clearing.

**Not yet done**: committing this work (large data-only change, arguably
consistent with prior nation-data rounds going straight to `main`, but
not yet decided/executed as of this write-up).

## Phase 28 — Investigating 4 stakeholder-reported bugs post-deploy (2026-09-02)

### Context

Stakeholder reported one piece of good news (geocoding quota restored,
search working) and 4 issues in one message, right after several SW
caching fixes (`944fa50`/`e2981dd`/`67f2281`) and GOLF-82 (wishlist-only
adds) had just landed on `main`. Each was investigated directly — live
browser reproduction of the exact reported steps against current `main`,
not just code reading — before concluding anything.

### Finding: bugs #1, #3, #4 do not reproduce against current `main`

All three were reproduced step-for-step through real UI functions
(`enterTripBuilder`/`enterBuildMode`, the header button, the pane's own
"← Explore" button, Discover → By region → clicking a course) and none
showed the reported failure:

- **#1 (Dufftown routing break)**: adding a mid-route stop after
  Inverness→Castle Stuart→Nairn→Royal Aberdeen kept computing/rendering
  drive legs correctly in both plausible readings of "add a stop along
  the way" (a day-level stop, and a place-anchored new day).
- **#3 (stuck "back to explore" button)**: `syncMastTripButton()` and
  every exit path (header button, the pane's own `#tb-exit`) correctly
  flip back to "Plan a trip" the moment `appMode` returns to `explore`.
- **#4 (region-discovery list clearing)**: clicking a course's name in
  the "By region" results calls `goToCourse()` (map.js:284), a pure
  map/popup function — it never touches `#tb-results`. Verified live:
  clicking a result left the results list's DOM byte-for-byte unchanged.

**Working theory, not confirmed with the stakeholder**: the stakeholder
was very likely testing an already-stale build cached by the service
worker — commits `944fa50`/`e2981dd`/`67f2281`, all landed *immediately*
before this report, exist specifically because `sw.js`'s cache-first
strategy was serving a broken cached copy of the app. `CACHE_NAME` was
bumped to `v5` as part of that fix, which forces every existing visitor
onto a fresh cache on next load — so a hard reload (or simply revisiting
now that those fixes are live) should resolve all three on its own.
Recommended next step: ask the stakeholder to retry all three after a
hard refresh, rather than continuing to hunt for a code bug that isn't
there.

### #2a (POI tag not centered) — real bug, fixed

`.tb-poi-row` used `display:flex;justify-content:space-between` across
3 bare children (name / tag / button) — `space-between` only truly
centers a middle child when the outer two are symmetric, and here a
variable-width name vs. a fixed-width "+" button meant the `.wt` tag
never actually landed centered. Fixed with CSS grid + explicit
per-child `grid-column`/`justify-self` assignments (same pattern
GOLF-69e used for itinerary rows), robust to the `.wt` tag being
conditionally absent when a POI has no category. Verified via computed
style (`justify-self:center`, correct `grid-column`). Committed as
`e815c4f`.

### #2b (POI curation quality) — investigated, options presented, not built

The existing GOLF-79 heritage-POI layer (`js/ors.js` + the Worker's
`heritage-pois` mode) already curates to 6 OSM tags — castle,
distillery, viewpoint, monument, ruins, museum — rather than dumping
every OSM tourism/historic tag. The stakeholder's dissatisfaction is
most plausibly OSM's own data quality within that curated set (unnamed
or trivial monuments/ruins, or coverage gaps), not the tag list itself.
Options for next steps, presented back to the stakeholder rather than
picked unilaterally:
1. **Filter out unnamed results** — OSM entries with no `name` tag are
   frequently low-value (a boundary marker, a nondescript ruin);
   dropping them is a one-line change to the Worker's response builder.
2. **Narrow the category set further** — drop `monument`/`ruins`
   specifically (the noisiest tags in practice) and keep
   castle/distillery/viewpoint/museum.
3. **Add a "why this matters" signal** — Wikipedia/Wikidata-linked OSM
   entries (`wikipedia=*`/`wikidata=*` tags) are a reliable proxy for
   "actually notable," and could be used to rank/filter.
Needs a stakeholder steer on which (if any) to build, since it's a
taste/quality judgment rather than a pure bug.

### Verification performed

`node scripts/check_js.js` (15 modules) and — no data-file changes this
round, so `node scripts/test_data.js` not re-run. Live browser
reproduction of all 4 reported issues against `main`, as described
above. Test/localStorage state cleared before finishing; local preview
server stopped.

### Follow-up for the stakeholder

1. Hard-refresh (or just revisit) and retry #1/#3/#4 — very likely
   already fixed by the SW cache-busting that landed just before this
   report.
2. Decide on a #2b curation option (or a different one) before it's
   built.
3. Still outstanding from Phase 26: the OpenRouteService dashboard login
   issue, blocking real Geocoding (place search) — unrelated to this
   round's reports, and heritage-POI lookups (Overpass-backed) are
   unaffected by it.

## Phase 29 — GOLF-83/83b/83c: heritage POIs redesigned wiki-first, then tightened, then wineries added (2026-09-02) — DONE, live

### Context

Follow-on from Phase 28's #2b (POI curation quality options presented, not
built). Stakeholder's direction: drop the fixed 6-tag category whitelist
entirely, drop unnamed results, build a wiki-derived list instead — three
rounds of live-verified iteration followed from there.

### GOLF-83: wiki-notability query replaces the 6-tag whitelist

`handleHeritagePois()` in `scripts/cloudflare-worker/ors-proxy.js` changed
from `nwr(around:...)[historic=castle]`/`[craft=distillery]`/etc. (6 fixed
tags) to `nwr(around:...)["wikipedia"]` + `["wikidata"]` — tag-presence
matching, pulling in anything OSM contributors thought worth a Wikipedia
link. Unnamed results dropped. `categoryFor()` broadened with more label
mappings and a "Heritage site" fallback for wiki-linked places matching
none of them. `HERITAGE_CACHE_KEY` bumped v1→v2.

### GOLF-83b: tightened after two live sanity checks found real noise

Live-tested against real points before/after shipping (not just read the
code): near Craigellachie, wiki-notability alone pulled in named rivers/
roads/rail lines. Near Johannesburg (stakeholder-reported), it pulled in
dozens of tagged suburbs, railway stations, schools, government offices
and courthouses — South Africa's OSM has a dense "sagns" administrative
import that wikidata-tags civic places, not just attractions. Fix: added
`isVisitablePlace()` — keep a result only if it ALSO carries a
tourism/historic/craft(distillery family)/certain natural feature/nature
reserve/lighthouse/place-of-worship tag, on top of the wiki-notability
gate. Verified against real fetched data: kept Museum Africa, Constitution
Hill, memorials, artworks, distilleries, a historic church; dropped every
suburb/station/school/office/court/stadium/square. `HERITAGE_CACHE_KEY`
bumped v2→v3.

### GOLF-83c: wine farms added (stakeholder wish, turned out cheap)

Stakeholder: "if I am in the Western Cape I'd love for it to list wine
farms... might be too much effort." Investigated before answering:
verified live around Stellenbosch that 14 real, well-tagged wineries
(Kleine Zalze, Lanzerac, Glenelly Estate, Morgenhof, etc.) carry **zero**
wikipedia/wikidata tags — the notability gate was silently excluding all
of them, the same root cause as GOLF-83b's civic-building noise, just in
the opposite direction (real POIs missing wiki links, rather than fake
ones having them). Fix: `craft=winery`/`craft=distillery`/`craft=brewery`/
`shop=wine` now queried unconditionally, not gated behind the
wiki-notability check — these are specific, unambiguous tags that don't
need a further "is this notable" filter. Added Winery/Brewery/Wine shop
category labels. `HERITAGE_CACHE_KEY` bumped v3→v4.

### Verification

Each of the three rounds was checked against **real, live Overpass data**
(direct Python scripts hitting `overpass-api.de`, and — after each of 3
stakeholder-performed Worker redeploys — direct `curl` against the live
deployed Worker at `https://geofftheworker.stefand94.workers.dev/`) before
being called done, not just read/reasoned about. Final confirmed-live
state: Craigellachie/Speyside returns only distilleries + a historic
church; Johannesburg returns only Museum Africa/Constitution Hill/
memorials/artworks/a historic church (no suburbs/stations/offices);
Stellenbosch returns 15 real wineries + a brewery + wine shops + the
existing historic/nature results. `node scripts/check_js.js` clean after
every round; no data-file changes (this is Worker/client-cache-key only).

### Commits

`07d081b` (GOLF-83), `961acef` (GOLF-83b), `deed6a9` (GOLF-83c), each
followed by an auto sw.js CACHE_NAME bump from the pre-push hook. All
pushed to `main` and redeployed to the live Worker by the stakeholder
(3 manual dashboard redeploys this round) — confirmed live after each.

### Open thread, not pursued

A true Wikidata-sitelinks notability *ranking* (vs. the current
presence/category filtering) was mentioned as a possible future
refinement if the category filter ever proves insufficient — not needed
this round, not built.

## Phase 30 — Explore mode retired; pin redesign, Wild Coast Sun fix, Nearby/place-search consolidation, nation-pill chrome fix (2026-09-04) — DONE

### Reconciling this doc with reality: Explore mode is gone

At some point after Phase 26 this plan stopped tracking reality again —
**Explore mode (the old map+filters+list landing view) has been removed
for good**, confirmed directly against `js/app-mode.js`'s own header
comment: not a toggleable default, not de-prioritized, just gone. There is
no `#explore` route, no masthead button, and no code path anywhere that
can set `appMode` to `'explore'`. Every non-shared mode is now a trip
mode: `'plan'` (search/discover/wishlist) or `'build'` (days/items/costs),
plus the separate read-only `'shared'` view from GOLF-86. `'plan'` is the
default landing (no hash); `'#trip'` still opens Build directly. This
plan's Phase 15/64 description of Explore/Plan/Build as three coequal
top-level modes is accordingly **stale** — treat it as historical record
of that round's decision, not current architecture. Exactly when/why
Explore was fully retired (vs. Phase 64's "three modes" framing) wasn't
independently re-derived this session; flag if it matters later.

The app's one page (`renderTripBuilder()`, `js/trip-ui.js`) now renders:
navbar → unified search bar → toolbar (trip menu, group-size stepper,
itinerary Filters, Clear/Share trip) → nation-pills row → a 3-tab pill row
(Discover / Itinerary / Costs) → tab content. Clicking Discover calls
`setAppMode('plan')`; Itinerary/Costs set `tbBuildTab` and call
`setAppMode('build')`.

### GOLF-90 (retroactively documented): nation filter pills

`tbNationPillsHTML()` reuses Explore's old `state.nation`/`NATIONS`/
`courseNation()` machinery (still living in `js/explore.js` even though
Explore's own rendering is gone — the utility functions outlived the mode
they were built for). `NATIONS=[['gb','Great Britain'],['ie','Ireland'],
['za','South Africa']]`. Filters: course search (`tbSearchResults()`,
`js/trip-add.js`), Discover's Nearby/By-region results
(`tbNationFilter()`, `js/trip-route.js`), and the wishlist's unscheduled
list. Deliberately does NOT filter Itinerary/Costs — those show the
trip's actual committed data, which can legitimately span multiple
nations. No commit/session this was originally scoped under was found;
recorded here for the first time as of this pass.

### GOLF-91/92/84/pin-redesign — DONE, committed `aaf008e`

Landed together after a discrepancy was caught at the top of this
session: a prior session had reported "nothing to commit" despite 8 files
of real, already-tested, uncommitted work sitting in the tree. Committed
as `aaf008e`:

- **Golf pin redesign**: new `golfPinSVG()` marker (blue map-pin badge,
  red flag on a pale pole, green "the green" ellipse) replaces the
  access-tier-coloured `flagSVG()` on the map itself — the most common
  tier (Pay & play) was yellow and read as "a tennis ball" against the
  basemap. Access tier stays colour-coded in the popup and filter
  chips/legend (still `flagSVG()`, unchanged).
- **GOLF-84**: fixed "Wild Coast Country Club" → "Wild Coast Sun Country
  Club" name + coordinates — was ~230km off, plotting near Durban instead
  of Mzamba Beach/Port Edward.
- **GOLF-91**: merged Discover's separate "Near a place" tab into
  "Nearby" — one scope, anchored to whichever (course or place) was set
  most recently (`js/trip-route.js`, `js/trip-add.js`).
- **GOLF-92**: Build-mode place search is now ringfenced to the active
  trip's own nation (`tbTripCountryCode()`, `js/trip-add.js`) instead of
  reading Explore's now-defunct filter-pill state.
- **Bonus fix**: Auto-schedule button visibility now keys off `tripSeq`
  (wishlist) rather than `tripDays`, so it appears as soon as 2+ courses
  are queued rather than only once days exist.

Verified in-browser: pin renders per spec incl. gold ranked ring; Wild
Coast Sun plots correctly near Port Edward; Nearby scope follows recency
across course/place adds; Build-mode place search stays within the trip's
own nation; Auto-schedule appears with 2 wishlist courses/0 days. `node
scripts/check_js.js`/`test_data.js` both pass. `TESTING.md` check 43
documents the Nearby-merge walkthrough.

### GOLF-93: nation pills moved to shared chrome — DONE, committed `0028d5d`

**Bug**: `tbNationPillsHTML()` was called only inside `tbPlanHTML()`
(Discover-tab-only content) — so the pills vanished the instant you
switched to Itinerary or Costs, contradicting the pane's own status as the
app's single page. Root cause: `tbPlanHTML(){return
tbNationPillsHTML()+tbDiscoverTabHTML()+...wishlist...}` only ever renders
under `!isBuild`.

**Fix**: moved the `tbNationPillsHTML()` call out of `tbPlanHTML()` and
into `renderTripBuilder()`'s persistent template, immediately above the
3-tab row — renders once, regardless of active tab. The pills' click
handler (`document.getElementById('tb-nation-pills')`, wired in
`renderTripBuilder()`'s delegated-listener block) needed no change, being
position-independent. Filtering scope unchanged (see GOLF-90 above).

Verified in-browser: pills visible and the South Africa selection stayed
active across Discover → Itinerary → Costs, confirmed via screenshot on
each tab. `node scripts/check_js.js` (16 modules) and
`node scripts/test_data.js` (557 courses, 114 Top 100) both pass.

## Phase 31 — GOLF-94: nation pills to the very top; automatic 1-day-per-course scheduling (2026-09-04) — DONE

### Context

Stakeholder: "Move the country selecting pills to the top. We seem to
have lost the auto-order functionality — instead can we automatically
make it 1 day per course and assign them in the auto order order. If a
user wants to insert a free day in between?" Plus a standing instruction:
always ask clarifying questions before implementing an ambiguous request
(saved as a new memory, `ask-clarifying-questions.md`).

Asked 4 clarifying questions via `AskUserQuestion`, all answered:
1. Pill placement → very top, above the navbar.
2. Trigger for auto-day-assignment → free text: courses can be added in
   any order to the wishlist on Discover, but the moment the user moves
   to Itinerary, it should add 1 course to each day and auto-order them
   by nearest neighbour.
3. Free-day handling on re-run → keep it in place, only touch golf days.
4. Re-run/reset behavior → full reset, rebuild every day from scratch.

### Diagnosis

Confirmed by direct code reading: the pre-existing "Auto schedule" button
only ever reordered the flat `tripSeq` cart array (`tripAutoOrder()`) — it
never touched `tripDays` at all. This was the exact gap behind "we seem to
have lost the auto-order functionality." Two genuinely different
behaviors were needed, since answers 2 and 4 describe different triggers
with different destructiveness:

1. **Automatic, lightweight, additive** — fires once on every transition
   into Build mode; takes only currently-unscheduled wishlist courses and
   appends one new day per course (nearest-neighbour order) after all
   existing days; never touches any existing day.
2. **Manual, explicit, destructive full-reset** — the existing "Auto
   schedule ▾" button, relabelled; rebuilds every `kind:'golf'` day from
   scratch (nearest-neighbour order over the trip's entire course set,
   scheduled + unscheduled), while `kind:'free'/'start'/'end'` days are
   never touched and keep their exact position in the sequence.

### Implementation

- **`js/trip-ui.js`**: moved `tbNationPillsHTML()` from just above the
  3-tab row to the very top of `renderTripBuilder()`'s template, before
  `.tb-navbar` — pills are now the pane's first child on every tab.
  Relabelled the "Auto schedule ▾" button/menu-item copy and tooltips to
  describe the new full-reset behavior.
- **`js/trip-route.js`**: rewrote `tripAutoOrder()` to walk the *original*
  `tripDays` array once, replacing each `kind:'golf'` day in place with a
  freshly-built one-course day off a nearest-neighbour-ordered queue (so a
  free day sandwiched between two golf days stays sandwiched) — any
  leftover courses are appended as new days at the end. Added
  `tripAutoScheduleUnscheduled()`: takes `tripUnscheduled()`, appends one
  new day per course (nearest-neighbour order) after every existing day,
  no-ops when the wishlist is empty, never reorders/rebuilds existing
  days.
- **`js/app-mode.js`**: `setAppMode()` now captures
  `enteringBuild = mode==='build' && appMode!=='build'` before reassigning
  `appMode`, and calls `tripAutoScheduleUnscheduled()` in that branch,
  before `renderTripBuilder()`. `setAppMode()` is the single choke point
  every route into Build passes through (tab clicks, the pane's own
  entry, cold-load bootstrap on `#trip`, and `popstate`), so this one
  wiring point covers every entry path.

### Verified in-browser

Fresh trip → `tbAddToWishlist()` × 2 with zero days → both landed in the
wishlist, zero days auto-created. `enterBuildMode()` → 2 days created, one
course each, wishlist empty. Re-entering Build with nothing new queued →
no duplicate days (still 2). Manually inserted a `kind:'free'` day between
the two golf days, added a 3rd wishlist course, re-entered Build → the
free day stayed at its exact original position, the new course appended
as a new day at the end — existing days untouched. Manual
`tripAutoOrder()` (full reset) → rebuilt both golf days from scratch in
nearest-neighbour order, free day's position preserved. Pill placement:
`#tb-nation-pills` confirmed as `#tb-pane`'s first child. No console
errors. `node scripts/check_js.js` (16 modules) and `node
scripts/test_data.js` (557 courses, 114 Top 100) both pass.
`TESTING.md` check 44 documents the walkthrough. Test/trip state cleared
via `tripStartFresh()` before finishing.

## Phase 32 — GOLF-95: prompt-based reorder suggestion instead of silent reorder (2026-09-04) — DONE

### Context

Stakeholder clarified the ask precisely (their own words): select 4
courses in Discover, move to Itinerary — they auto-schedule into 4 days
in the best order (GOLF-94, already shipped). Add a stop between day 2
and day 3, creating a detour. If the stop lands in the ideal spot, fine;
if it creates an inefficient route because of some other constraint (e.g.
picking that placement deliberately), the app must **never silently
reorder** — it must prompt, and a decline must stick.

### Implementation

- **`js/trip-route.js`**: `tripDayAnchorPoint(dayIdx)` (a day's first
  located stop), `tripLocatableDayIndices()`, `tripNearestNeighbourDayOrder(dayIdxs)`
  (greedy NN permutation, fixed start = first in current order),
  `tripSuggestedDayReorder()` (returns `{origIdxs,suggestedIdxs,sig}` or
  `null`, `sig` = current day-id sequence), `tripApplySuggestedDayReorder()`
  (walks `tripDays` once, replaces only locatable slots with the
  NN-ordered queue, clears `driveIn` only on days whose predecessor
  changed — mirrors GOLF-65's `tbDayMoveTo()` pattern — resets
  `tbReorderDismissedSig`, saves, re-renders), `tbDismissSuggestedDayReorder(sig)`
  (sets `tbReorderDismissedSig=sig`, re-renders).
- **`js/trip-model.js`**: new transient `let tbReorderDismissedSig=null`,
  added to the GOLF-60b reset convention (`tripSwitchTo`, `tripCreateNew`,
  `tripDuplicate`, `tripDelete`, `tripStartFresh`).
- **`js/editor.js`**: `wipeStoredState()` resets it too.
- **`js/trip-ui.js`**: `tbReorderSuggestionHTML()` — a dismissible banner
  reusing `.tb-day`/`.tb-btn` styling with an inline accent-border
  override, wired into `tripDayScheduleHTML()`.

The app never reorders on its own — GOLF-94's auto-scheduling of newly
added wishlist courses into new days is unchanged and still automatic;
this ticket only governs *rearranging existing days*, which now always
goes through the accept/decline banner.

### Verified end-to-end, live browser (this session)

Root-caused and fixed an unrelated blocker first: a poisoned browser
HTTP/V8 cache tied to the `localhost:8934` origin survived a full
teardown+restart on the same port — fixed by switching to a fresh port,
no code change (this project's own previously-documented gotcha,
recurring — see Phase 12/GOLF-87/Phase 31).

Confirmed: GOLF-94's 4-into-4-days auto-schedule still works; a
suboptimal splice (a `free` day inserted between two golf days,
off the nearest-neighbour-optimal spot) correctly surfaces the banner;
Accept reorders correctly (days move, `driveIn` cleared only where the
predecessor changed, banner disappears, `tbReorderDismissedSig` resets to
`null`); Decline hides the banner and it stays hidden across a re-render
of the *same* arrangement; changing the arrangement again (new `sig`)
re-surfaces the banner despite the earlier decline; an already-optimal
arrangement shows no banner at all; `tbReorderDismissedSig` resets on
`tripCreateNew()`/`tripStartFresh()` (spot-checked). Banner screenshot
confirmed acceptable with no new CSS class needed.

`node scripts/check_js.js` (16 modules) and `node scripts/test_data.js`
(557 courses, 114 Top 100) both pass — no data-file changes.
`TESTING.md` check 45 documents the walkthrough. Test/trip state cleared
via `tripStartFresh()` before finishing.

## Phase 33 — GOLF-96: "Add a stay" becomes a map-based hotel picker, with multi-night auto-spanning — DONE (app side); Worker redeploy pending

### Context

Stakeholder's ask, verbatim: on a given day, clicking "add a stay" should
zoom the map to that day's area and surface nearby hotels to pick from
(long-term: a real hotels-pricing API; not this round), and picking a
stay for N nights should automatically carry it onto the next N-1 days.
Also flagged that ORS is down again and asked whether OpenStreetMap could
replace it for this specific feature.

Confirmed by investigation: the app already has almost every supporting
piece except the two genuinely new ones (a hotel-search-by-location query,
and a multi-night concept). Reused, not rebuilt:
- `tripDayAddStop`/`tripDayUpdateStop`/`tripDayRemoveItem`
  ([js/trip-model.js:134-170](../../../Golf%20Map/js/trip-model.js)) — the
  hotel/POI item CRUD.
- The GOLF-79/83 heritage-POI pattern end-to-end — Worker mode
  `heritage-pois` ([scripts/cloudflare-worker/ors-proxy.js:263-441](../../../Golf%20Map/scripts/cloudflare-worker/ors-proxy.js))
  queries **OpenStreetMap Overpass, no API key needed**, cache/fetch
  wrapper `tbHeritageFor()` ([js/ors.js:270-293](../../../Golf%20Map/js/ors.js)),
  map drawing `tbDrawHeritage()`/`tbEmojiIcon()`
  ([js/trip-route.js:464-496](../../../Golf%20Map/js/trip-route.js)) — this
  is the exact template for the new hotel search, not a new pattern.
- `map.flyTo([lat,lng],13,{duration:.6})` — the established zoom-to-point
  idiom ([js/map.js:293](../../../Golf%20Map/js/map.js),
  [js/explore.js:232](../../../Golf%20Map/js/explore.js)).
- `tbAddStopFormHTML`/`tbAttachSearch` — the existing add-stay form and
  its geocode picker ([js/trip-model.js:245-270](../../../Golf%20Map/js/trip-model.js),
  [js/trip-ui.js:73-146](../../../Golf%20Map/js/trip-ui.js)) — kept as the
  final confirm step, not replaced.

**Answering the ORS question directly**: yes, Overpass replaces ORS for
this feature entirely. `handleHeritagePois()` already proves OSM carries
real hotel data — its own `TOURISM_EXCLUDE` set explicitly filters
`tourism=hotel/guest_house/hostel/motel/...` *out* of the heritage
results, meaning those tags are already confirmed present and queryable.
A sibling query that asks for exactly those tags, unconditionally (no
wiki-notability gate — mirroring how `craft=winery` is already queried
unconditionally at ors-proxy.js:303-306), gives real names/locations with
zero key/quota dependency. No live pricing comes from this — that's
explicitly the "long-term real hotels API" the stakeholder already flagged
as future work, unaffected by this round.

**Confirmed with the stakeholder**: multi-night stays auto-create new days
if they don't exist yet (a 1-night trip can grow to N days from a single
pick); hotel search uses Overpass only, no ORS fallback.

### Design

**1. Worker — new `mode:'hotels'`, and fix a real bug found along the way**

New `handleHotels()` in `ors-proxy.js`, sibling to `handleHeritagePois()`:
same Overpass mirror list (`OVERPASS_URLS`), same `nwr(around:...)` query
shape, but `["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]`
unconditionally — no wiki-notability filter (a real, ungated hotel doesn't
need a Wikipedia page to be worth showing). Reuses the same response shape
`{pois:[{name,category,lat,lng}]}` as `heritage-pois` so the app-side
consumer can be a near-clone.

**Bug fix, in scope because it currently blocks this feature too**: the
top-level `if(!env.ORS_API_KEY)` guard (ors-proxy.js:104) 500s *every*
mode, including the Overpass-only ones, whenever the ORS key is
missing/invalid — exactly the stakeholder's current "ORS is down" state.
Move that guard so it only applies to the modes that actually call ORS
(`pois`, `geocode`, the default `route`), letting `heritage-pois` and the
new `hotels` mode work independently of ORS's health. This directly fixes
"the app can't find hotels because ORS is down" for both the new feature
and the existing heritage-POI feature.

**2. Data model — `nights` and a shared `stayId` on hotel items**

Extend the hotel item shape (`js/trip-model.js`) with `nights:1` (default,
existing single-night hotels read as `nights:1` via the same
`validateTripEntry()`/`tripDayMigrateItems()` migration convention already
used for every prior item-shape change) and `stayId` (a shared id linking
every night's item to the same booking — `null` for a plain 1-night stay).

`tripDayAddStop(dayId,type,name,price,lat,lng,nights)`: when `type==='hotel'`
and `nights>1`, after adding the item to `dayId`, walks forward through the
next `nights-1` day slots **in trip order** — using existing days where
present, calling the existing day-creation path (`tripDayAdd()`-equivalent
insertion at that position) for any that don't exist yet — and adds a
matching hotel item (`stayId` shared, same name/price/lat/lng) to each.
`tripDayUpdateStop`/`tripDayRemoveItem` both get a `stayId`-aware variant:
editing or removing any night of a multi-night stay applies to every item
sharing that `stayId`, so the booking behaves as one unit rather than N
independent items that can drift apart. A day deleted mid-stay (GOLF-65
drag reorder, or explicit day removal) simply drops that night's item, per
the existing `tripDayRemove()` cleanup convention — documented as a known
edge case, not specially handled.

**3. UI — map-first hotel picker, replacing the old "open the form
immediately" flow**

`tbPromptHotel(dayId)` (`js/trip-model.js`) changes from "open the add-stop
form" to: zoom the map to the day's anchor point (reuse `tbPoiPoint(day)`
from `js/ors.js`, the same point `tbHeritageFor` already resolves to —
day's last golf course, else its place, else null) via
`map.flyTo([lat,lng],13,{duration:.6})` (calling `showMobileMap()` first on
mobile, matching `goToCourse()`), then opens a "Nearby hotels" panel
sourced from a new `tbHotelsFor(day)` in `js/ors.js` — a direct clone of
`tbHeritageFor()`'s cache/fetch/dedupe pattern
(`golfmap:hotelscache:v1` cache key, `hotelsPending` dedupe set), calling
the Worker's new `hotels` mode.

Hotels render two ways at once, both clickable into the same pick action:
- **List** (`tbHotelListHTML(day)`, mirrors `tbHeritageListHTML`): each
  candidate as a row with a "＋" action.
- **Map markers** (`tbDrawHotelCandidates()`, mirrors `tbDrawHeritage()`):
  🏨 emoji markers via the existing `tbEmojiIcon()`, visually distinguished
  from a day's *already-added* stay markers (e.g. an outline/opacity
  difference) so "candidate" vs. "already booked" is never ambiguous;
  excluded from `fitBounds` same as heritage markers.

Clicking a hotel (list row or map marker) doesn't add it immediately —
it pre-fills `tbAddStop.name/lat/lng` and opens the existing
`tbAddStopFormHTML` (unchanged geocode-search field, now pre-populated
rather than blank), which gains one new control: a **Nights** number
input (default 1, min 1). Confirming calls the extended
`tripDayAddStop(...,nights)`. A visitor can still type a hotel name
manually instead of picking a candidate — the map/list is a convenience
layer in front of the existing form, not a replacement for it, so nothing
about manual entry regresses.

**Explicitly not built this round**: any real pricing/availability data
(the stakeholder's own "long-term" framing — a real hotels API is future
work); editing individual nights of a multi-night stay independently
(the shared-`stayId` design deliberately treats it as one booking); a
"nights" concept on POI items (hotels only).

### Files to touch

- `scripts/cloudflare-worker/ors-proxy.js` — new `handleHotels()`, ORS-key
  guard relocated, needs the stakeholder to redeploy (same manual
  Cloudflare-dashboard step every prior Worker change has needed).
- `js/ors.js` — `tbHotelsFor()`, `hotelsPending`, cache key, `tbHotelPoint`
  reuse of `tbPoiPoint`.
- `js/trip-model.js` — `nights`/`stayId` on the hotel item shape,
  `tripDayAddStop`'s multi-night day-spanning logic, `stayId`-aware
  update/remove, `tbPromptHotel()`'s new zoom+panel behaviour, migration
  entries for the two new fields.
- `js/trip-route.js` — `tbDrawHotelCandidates()`.
- `js/trip-ui.js` — hotel candidate list markup, the new Nights input in
  `tbAddStopFormHTML`.

### Verification

- Worker: direct `curl` against the deployed Worker's `hotels` mode near a
  known town, confirm real hotel names/coordinates come back with **no**
  `ORS_API_KEY` dependency (test with the key temporarily blank/invalid to
  prove the Overpass-only path is unaffected — this directly proves the
  "replace ORS with OSM" fix).
- In-browser: click "Add a stay" on a day with a course — confirm the map
  flies to it and a real list + real 🏨 map markers of nearby hotels
  appear; click a map marker, confirm the add-stay form opens pre-filled
  with that hotel's name/coordinates; set Nights to 3 and confirm — confirm
  3 new/matched days each get a hotel item with the same `stayId`, new
  days auto-created if the trip didn't have them; edit or remove one
  night's item and confirm every night sharing that `stayId` follows;
  confirm manual (non-picked) hotel entry still works unchanged; confirm a
  day with no course/place shows a sensible empty state rather than an
  error.
- `node scripts/check_js.js` and `node scripts/test_data.js` (no data-file
  changes expected).
- Test/trip state cleared via `tripStartFresh()` before finishing, per
  standing convention.

### Implementation and verification — DONE (2026-09-04)

Implemented exactly as designed above: `handleHotels()` +
ORS-key-guard relocation in `scripts/cloudflare-worker/ors-proxy.js`;
`nights`/`stayId` on the hotel item shape, `tripDayAddStop()`'s
day-spanning/auto-day-creation, `stayId`-aware `tripDayUpdateStop()`/
`tripDayRemoveItem()` in `js/trip-model.js`; `tbHotelsFor()`/
`tbOpenHotelPicker()`/`tbCloseHotelPicker()`/`tbPickHotelCandidate()`/
`tbHotelPickerHTML()` in `js/ors.js`; `tbDrawHotelCandidates()` (wired
into `tbDrawMap()`) in `js/trip-route.js`; picker panel wired into the
day card in `js/trip-ui.js`; cleanup in `tripDayRemove()`/full-reset in
`js/trip-model.js`.

**Verified in-browser**, on a fresh port/tab (a stale-tab
`ReferenceError` for `tripAutoScheduleUnscheduled` on an earlier tab
turned out to be exactly that — a stale tab, not a real bug; confirmed
resolved on a clean tab with `document.scripts` showing all 16 modules
loading 200 OK): `tbPoiPoint(day)` correctly resolves a day's anchor
(course/place) and returns `null` for an empty day, so
`tbOpenHotelPicker()` falls back to the plain form exactly as designed;
`tbHotelsFor()`'s cache/fetch/dedupe cycle confirmed with a stubbed
Worker response (real deployed Worker still 403s on `mode:'hotels'` —
see below); picking a candidate pre-fills `tbAddStop` correctly;
`tripDayAddStop(...,nights:3)` auto-created 2 new days and added a
matching hotel item to each, all three sharing one `stayId`;
`tripDayUpdateStop()` with the new price cascaded to all 3 nights;
`tripDayRemoveItem()` removed the item from all 3 nights; manual (no
picker) hotel entry still adds a plain `stayId:null` single-night item;
loading/empty states in `tbHotelPickerHTML()` render correctly.
`node scripts/check_js.js` (16 modules) and `node scripts/test_data.js`
(557 courses, 114 Top 100) both pass. Test/trip state cleared via
`tripStartFresh()` before finishing.

**Confirmed live via direct `curl` against the deployed Worker**: the
existing `heritage-pois` mode (GOLF-83, already deployed) responds
correctly; the new `hotels` mode is **not yet live** — the deployed
Worker doesn't recognize `mode:'hotels'` yet and falls through to the
default directions-route handler ("origin and destination must both be
[lng,lat] number pairs"). **Stakeholder action still needed**: redeploy
`ors-proxy.js` via the Cloudflare dashboard (same manual step every
prior Worker change has needed) before real hotel search works live —
the app-side code gracefully shows "Looking for nearby hotels…" (never
an error) until that redeploy lands, then will pick up real Overpass
hotel data automatically with no further app-side change needed.

## Phase 34 — GOLF-97/98: banded green-fee schema, and hand-researched peak pricing for the Top 100 lists (2026-09-05, scoped)

### Context

Follow-on from this session's pricing-accuracy research spike. Findings,
already delivered to the stakeholder in chat:

- **BRS Golf's live tee-sheet API is real, unauthenticated, and genuinely
  granular** (exact per-slot/per-group-size pricing, confirmed against
  Trent Park and Royal Portrush) — but its own
  [Terms of Use](https://www.brsgolf.com/web/terms-of-use/) explicitly
  prohibit "any software robot, spider, crawler, or other data gathering
  or extraction tool... to access, acquire, copy, monitor, **scrape** or
  aggregate any information" from their platform. This rules out building
  any automated pipeline against it. **Decision: no BRS scraping is
  built.** A live-data source stays possible later only via a direct
  partnership/permission conversation with BRS Golf/GolfNow (itself a
  promising monetization angle, tracked separately, not part of this
  ticket) — not attempted here.
- **Prestigious/brochure-only clubs** (e.g. Sunningdale) have no live
  system at all — a single "indicative" published figure is the ceiling
  for these regardless of approach.
- **The real, actionable problem today**: `wd`/`we` are free-text strings
  (`"£17"`, `"From £60"`, `"£34–£140"`), regex-averaged by `extractFee()`
  — this silently understates real peak pricing exactly as the
  stakeholder found by spot-checking (a club's own "from £60" undersold
  its actual £90 Saturday-morning rate). Fixing this is legitimate,
  ToS-clean, hand/web-research work — the same method already used to
  build the England/Scotland/Wales/Ireland/South Africa Top 100 lists.

Two tickets: a data-model change (GOLF-97), and the research/data-entry
work it enables (GOLF-98). Scoped together since one is pointless without
the other, but independently implementable/verifiable.

### GOLF-97: banded green-fee schema

Replaces the free-text `wd`/`we` strings with a structured banded shape,
designed so a future live/partnered data source (BRS or otherwise) could
populate the exact same fields later without a second schema:

```js
fee: {
  weekday:        {min: 45, max: 45},   // single figure -> min===max
  weekend:        {min: 65, max: 90},   // the real spread, incl. true peak
  weekendTwilight:{min: 35, max: 35},   // optional, only when actually published
  confidence: 'published-range' | 'published-from-only' | 'estimated' | 'poa',
  lastVerified: '2026-09-05'            // ISO date, per-course
}
```

- `confidence` values, in decreasing reliability: `'published-range'` (the
  club states a real min–max, e.g. a weekday/weekend or seasonal table —
  the strongest static signal available), `'published-from-only'` (only a
  "from £X" figure exists — `max` is a researched real-world estimate, not
  the club's own number, and this is flagged as such), `'estimated'` (no
  published figure at all — a regional/tier-based placeholder, same
  spirit as the existing `conf:'est'` convention already used for
  newly-added Scotland/Ireland/SA batches), `'poa'` (members-only/ask-club
  — no numeric fee at all, `min`/`max` both `null`).
- **Backward-compatible migration, not a breaking rewrite**: keep the
  existing `wd`/`we` fields on every course untouched (`SCHEMA.md`
  already documents them; scripts, exports, and any other reader
  shouldn't need to change in this pass), and add the new `fee` object
  alongside as the *new* source of truth going forward. `extractFee()`
  gains a `fee`-shaped fast path (`fee.weekday`/`fee.weekend` when
  present) with the current regex-on-`wd`/`we` logic kept as the fallback
  for every course that hasn't been re-researched yet (GOLF-98 does that
  incrementally, not as a single big-bang migration). `feeFieldForDate()`
  (GOLF-48) gets the equivalent branch — a real weekend date should pull
  `fee.weekend.max` (the true peak) once present, not just re-run the old
  midpoint math.
- **Costs tab / Build mode**: once a course has real `fee` data,
  `tripItemPriceDetail()`/`tripCostLineItems()` can show a genuine range
  ("£65–£90") rather than a single blended number, with a small
  confidence indicator (e.g. a "researched" vs. "estimated" tag,
  mirroring the existing `conf:'est'` convention already surfaced
  elsewhere in course cards) — surfacing the accuracy level honestly
  rather than presenting every number as equally trustworthy.
- **Acceptance criteria**: a hand-built test course with a full `fee`
  object shows the correct weekday/weekend/twilight figures in both the
  popup and the Costs tab; a course with only the legacy `wd`/`we` fields
  behaves identically to today (proves the fallback path is truly
  non-breaking); `feeFieldForDate()` picks `fee.weekend.max` on a real
  Saturday/Sunday date when present; `node scripts/test_data.js` extended
  with a shape-check for `fee` wherever present (mirroring how every
  other optional sub-object, e.g. `courseStats`/`clubInfo`, is already
  validated); full `popupHTML()` sweep across all 557 courses stays clean
  (`fee`-less courses must render exactly as before).
- **Size**: S–M (one schema addition + two consumer functions, no data
  migration required to ship it). **Depends on**: nothing.

### GOLF-98: hand-researched peak pricing for the Top 100 lists

The actual data-quality fix, using the schema GOLF-97 adds. Scope
mirrors the stakeholder's original "start with the top 20 per
nation/location" framing, refined by this session's findings:

- **Priority order**: the six existing Top 100/notable lists — England
  Top 100 (114 courses), Scotland (100), Wales (38), Ireland (83), South
  Africa (99), London-catchment (123) — starting with each nation's
  top-ranked 20–30 courses (highest `t100`/notability, and any course the
  stakeholder personally flagged as wrong) rather than attempting all
  557 at once.
- **Per course, via `WebSearch`/`WebFetch` against the club's own site
  and, where relevant, published third-party write-ups** (same method as
  GOLF-23's cross-check and GOLF-77/78's course-list sourcing — no BRS
  Golf lookups, per the ToS finding above): capture a real weekday
  figure, a real weekend **range** (not just the advertised "from"
  figure — actively look for the actual top-end/peak rate the way the
  stakeholder's own spot-check did), a twilight rate only if the club
  publishes one, and set `confidence` honestly per the categories above.
  Where a club is members-only/POA, set `confidence:'poa'` rather than
  guessing.
- **A lightweight per-nation research script** (`scripts/research_fees_*.py`
  or a single `scripts/research_fees.py` taking a nation flag), following
  the existing fetch-then-merge pattern (`scripts/output/*.json`
  intermediate file, a separate merge step into `data/courses-*.js`) —
  *not* a fully automated scraper (no bulk unattended fetching against
  any club's live booking system), but a structured way to record each
  club's researched figures with a source URL and date, so the process
  is repeatable and auditable rather than one-off manual edits.
- **Acceptance criteria**: the first batch (a stakeholder-agreed nation,
  suggested England Top 100 first since it's the largest/most-used list)
  has real `fee` data for its top 20–30 courses, each with a real source
  URL recorded (in the intermediate JSON, not necessarily shipped to the
  browser) and a `lastVerified` date; spot-check 5 courses' new figures
  against their club websites directly to confirm accuracy; `node
  scripts/test_data.js` passes with the new `fee` objects; the Costs tab
  visibly shows a real range for at least one researched course in a
  live trip.
- **Size**: M, and open-ended by design — proceeds in batches (one
  nation/tier at a time) rather than a single big ticket, so value ships
  incrementally rather than gating on covering all 557 courses.
  **Depends on**: GOLF-97.

### Sequencing

GOLF-97 (schema) → GOLF-98, batch 1: England Top 100's top ~25 (largest,
most-visited list) → further batches by stakeholder priority (Scotland,
then Wales/Ireland/SA, or reordered on request) → the London-catchment
123, likely last since GOLF-98's batches are naturally prioritized by
"most likely to be booked/researched," which skews toward the ranked
Top 100-style lists over the original catchment set.

### Verification approach

- **GOLF-97**: the acceptance criteria above — legacy-course
  non-regression is the critical check, since this must not silently
  change any of the 557 courses' current displayed price.
- **GOLF-98**: spot-check researched figures directly against each
  club's own published pricing before shipping a batch; `node
  scripts/test_data.js` after each batch; clear any test/trip
  `localStorage` state before ending each session, per standing
  convention.
hotel data automatically with no further app-side change needed.

## Phase 35 — Backlog item: custom domain / production hosting (2026-09-07, not started)

### Context

Stakeholder asked about moving to a real domain. Current state: fully
static app, zero secrets in the browser (the one ORS/Overpass API key
lives only in the Cloudflare Worker's encrypted secret store), HTTPS
automatic on both live hosts (GitHub Pages + Cloudflare Pages, see
Phase 25/GOLF-80). A custom domain is close to a non-issue technically —
mostly DNS at the registrar — but a few things are worth tightening up
first:

1. **Pick one canonical host** before pointing a domain at anything —
   the app is currently live in two places (GitHub Pages + Cloudflare
   Pages). Recommend Cloudflare Pages as canonical (already supports
   per-branch previews, same account as the Worker), GitHub Pages
   retired or left dev-only.
2. **CORS on the Worker** — currently wide open (`*`), fine as-is for a
   domain move, just worth a spot-check once the domain is live.
3. **PWA manifest `start_url`/scope** (GOLF-80/PWA basics) — confirm not
   hardcoded to the current GitHub Pages path, or "Add to Home Screen"
   breaks on the new domain.
4. **Service worker** — new domain = new origin = fresh cache
   automatically, no migration needed; only affects anyone who already
   installed the PWA from the old URL (their install stays pointed at
   the old domain).
5. **Not a blocker, but should land around the same time**: the
   OpenRouteService Geocoding-403 account issue (Phase 26/28), so place
   search works day one for new visitors on the new domain.

**Stakeholder action needed, not something this session can do**: buying
the domain and pointing DNS at the chosen host is an account-level action
outside what can be done on the stakeholder's behalf. Ready to execute
the technical checklist above (manifest check, Worker CORS spot-check,
host consolidation) the moment the stakeholder has a domain and picks a
canonical host.

### Status: not started — backlog only.

## Phase 36 — GOLF-98 continuation: Haiku-agent fee research batches (2026-09-07, in progress)

Resuming the pricing job (GOLF-97 schema already live; GOLF-98 data-entry
already had 118/557 courses done). Dispatched 3 background Haiku agents
to research real green fees for the remaining 66 England Top 100 courses
(the highest-priority remaining batch per the existing Phase 34
sequencing), each returning a JSON array of `{n, fee:{...}}` objects
(not editing the file directly, to avoid concurrent-write conflicts) —
to be merged into `data/courses-top100.js` and verified
(`node scripts/test_data.js`, spot-check a few figures, `popupHTML()`
sweep) once all three report back. Further batches (Scotland 70
remaining, Ireland 63, South Africa 79, Wales 38, London 117) queued as
next-session or next-batch work once this round is merged and verified.
