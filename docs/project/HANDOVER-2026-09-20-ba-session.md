# Handover — BA/PM session, 2026-09-20

Written at the end of a board-recon session. Everything below is on `main`
(`6a0b9f5`) and pushed. Two check scripts pass. Nothing is half-finished.

---

## What happened, in one paragraph

Production driving directions had been dead since the 19th (GOLF-154). The
recorded theory was a spent quota; it was wrong. OpenRouteService has moved
its v2 services to HeiGIT's host, and the fix was one URL constant. Separately,
the GOLF-148 POI dataset landed from another session, three product decisions
were taken to unblock its UI (DEC-017), and a board recon produced nine
corrections to the project record, all now applied.

---

## 1. GOLF-154 — routing outage, RESOLVED

**Root cause:** ORS moved v2 services to
`api.heigit.org/openrouteservice/v2/...`. The legacy
`api.openrouteservice.org` host began refusing the token for **directions
only**. Fixed by repointing `ORS_DIRECTIONS_URL` in
`scripts/cloudflare-worker/ors-proxy.js` (`e69fb0f`). Owner redeployed the
Worker by hand; verified live (London→Leeds, 223 min / 195.8 mi).

**The diagnostic rule worth keeping:** a *missing* key on ORS answers **401**;
our valid key answered **403**. 401 = unrecognised, 403 = recognised and
refused. That single distinction ruled out both a bad key and a spent quota,
and it was available on day one. Check it before theorising.

**Still live:** geocoding and `/pois` did **not** move — both 404 on the new
host, and geocoding still answers 200 on the legacy one. There is no announced
home for them. **The same outage can recur on place search**, and the app
degrades silently when it does. Owner has been asked to check whether the
legacy host has a retirement date. This is the top unresolved thread.

---

## 2. GOLF-148 — POI dataset shipped, UI is next

Dataset is on `main` (`d58e8a3`): 27,439 sights across five lazy region files
plus `pois-categories.js`, ~450KB gzipped, one region per visitor. Verified
independently in this session — counts, sort order, category indices, group
names, malformed-row count all check out.

**DEC-017 settled the three open product questions** (owner, 2026-09-20):

1. **Labels:** `name:en` where it exists, OSM `name` otherwise.
2. **Scoping:** per-leg — the corridor between today's stops, not whole-trip.
3. **Counts:** 3 sights per day, expanding to 10.

**Two consequences a new session must not mistake for bugs:**

- A day with **no drive shows no sights**. That is the chosen behaviour, not a
  defect. A near-the-stop radius fallback was offered and declined. If it reads
  badly in testing, raise it — do not add the fallback unilaterally.
- The English label for the Welsh park is **"Eryri National Park", not
  "Snowdonia"**. OSM's own `name:en` is Eryri. No label source produces
  "Snowdonia"; only a hand-kept override list would, and the owner has
  **deferred that** (see §5). DEC-017's original note recorded this cost
  backwards and was corrected in `0134d4c`.

**In flight elsewhere:** the developer session is running
`scripts/backfill_names.py` (~72 Overpass id queries, ~20 min) to fetch the
`name:en` tags, which were never saved. It preserves the original as
`name_local` per record so the decision stays reversible. When it lands,
re-verify counts and spot-check Welsh rows.

**UI ownership:** the dev session has deliberately not touched `js/poi.js` or
any UI file. The UI stage is unblocked and unstarted.

---

## 3. Nine board corrections — applied (`6a0b9f5`)

| # | Change |
| --- | --- |
| 1 | **GOLF-107 CLOSED** — all ten children plus the GOLF-100 addition were done; it was a phantom P1. |
| 2 | **GOLF-103 CLOSED** — superseded by the GOLF-142…147 chain; its residue folded into GOLF-143. |
| 3 | **GOLF-106 merged into GOLF-143** — they had deadlocked: 143 was blocked on a basemap decision and 106 *was* that decision. |
| 4 | **GOLF-118 re-stated BLOCKED** (dep GOLF-143) — it read READY with no deps but is implemented on a branch and parked. |
| 5 | **GOLF-155 added, P1** — the Worker discards the upstream error body. GOLF-154 priced it at a day of downtime. |
| 6 | **GOLF-156 added, P2** — GOLF-148 orphaned the Worker's ORS `pois` + `heritage-pois` modes. Delete before GOLF-143 pays to port them. |
| 7 | **GOLF-99 → NEEDS VERIFICATION** — a `#share=` view already ships; this may be a mostly-done P1. |
| 8 | **GOLF-101 premise flagged** — written when images were broken sitewide; GOLF-134 fixed that. |
| 9 | **Two documented facts fixed** — see below. |

**Fact fix 9, in detail** (the owner supplied the explanation):
`CLAUDE.md` said 557 courses; `test_data.js` reports 879. Neither was a
"shown" count. **879 are in the data files, 565 are visible on the map.** The
gap is GOLF-121d: GOLF-121a's bulk South Africa pull added ~320 clubs, and
`courseShownOnMap()` ringfences South Africa to the 107 carrying `zaRanked:1`.
557 was the *pre-GOLF-121a total* and only resembled 565 by coincidence.

**Risk R-1 was rewritten** — it blamed intermittent *geocoding* 403s, but
geocoding is the service that kept working. The real risk is a single
free-tier dependency with no fallback and silent failure.

---

## 4. Open questions put to the owner, not yet answered

- **R-4 (no backend, localStorage-only)** — the owner asked whether this early
  decision still holds. An assessment was given; no decision taken. If revived,
  it is GOLF-104 (direction paper), which is DISCOVERY and sequenced
  post-go-live.
- **Data-collection policy** — the owner asked whether fetches still follow
  "collect as much as possible, prune later." **They do not**, for POIs:
  `fetch_pois.py` applies a `KEEP_TAGS` allowlist at collect time
  (line ~633), so the saved JSON is already pruned. That allowlist has been
  widened reactively three times, each time after a re-fetch that a wider
  original would have avoided — the `historic=church` cathedral bug cost two,
  `name:en` cost the third. The *course* pipeline does the opposite
  (`england_golf_clubs.json` is 35MB of unpruned response). The two pipelines
  disagree and nobody decided that. Worth a DEC if the owner wants it settled.

---

## 5. Deferred by the owner

- **"Snowdonia" override list** — a hand-kept map of renamed landmarks.
  Judged not worthwhile for now. Revisit only if a tester asks where Snowdonia
  went. `name_local` in the POI records keeps this reversible.

---

## 6. Standing facts a new session should not rediscover

- **A git push does NOT deploy the Cloudflare Worker.** It must be redeployed
  by hand. Verify live before concluding anything about Worker behaviour.
- **Claude never sees the ORS API key.** The owner sets it as a Worker secret.
- **Two worktrees push to `main`, which auto-deploys.** Pull before committing;
  this checkout had diverged once already this session.
- Verification gate: `node scripts/test_data.js` and `node scripts/check_js.js`.
  `check_js.js` now parses `sw.js` too and rejects undeclared identifiers.

---

## 7. Recommended next step

**Verify GOLF-99.** It is the cheapest P1 on the board — a `#share=` view
already ships, and a short verification pass either closes it or produces a
real gap list. Everything else that is P1 is either blocked on an owner
decision (GOLF-143) or already moving (GOLF-148's UI, owned by the dev
session).

A live project dashboard summarising all of the above is published as an
Artifact; ask the owner for the link.
