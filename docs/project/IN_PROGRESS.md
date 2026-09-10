# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## GOLF-98 — Green-fee data entry, `feeV2` re-research programme

**Status:** ACTIVE (v2 code + batch 1 shipped; batches 2+ = data) · **Priority:** P2

> 2026-09-10: GOLF-120 Phase 2 is on `main` — the `feeV2` reader/derivation
> (`js/trip-geo.js`), the display wiring (popup / tooltip / Explore / Costs /
> itinerary), and the 126-course batch-1 merge into all five `data/*.js`
> files. GOLF-98 now *is* the ongoing `feeV2` re-research: fill in the rest,
> same fetch-once → JSON → scripted-merge pattern, targeting `feeV2`.

Remaining passes, in order:

1. **England Top 100 ranks 35–114** ("batch 2") — reminder routine
   `trig_01KjZDrrJ3wYrk8EQ3nf26Z9` fires Tue 2026-09-16 22:00 London (just
   before the weekly usage-limit reset), owner decides whether to run.
2. Scotland / Ireland / Wales / South Africa beyond the top ~30%.
3. London catchment (`data/courses-london.js` — 0 done).
4. The ~322 South Africa bulk placeholders.

- Pattern: background Haiku agents each research a batch and return a JSON
  array of `{n, feeV2:{…}}` — they **never edit data files**. Merge with a
  scratch script (see the GOLF-120 Phase 2 handover), then verify:
  `node scripts/test_data.js` (now validates `feeV2`), `node scripts/check_js.js`,
  `popupHTML()` sweep.
- Batch-1 review-note carry-overs still worth a look: 25 `estimated` entries
  shipped UI-badged rather than club-verified; Notts / Sherwood Forest are
  `poa` after a transient 403 (retry); Mount Edgecombe R260 flagged low.

**Acceptance (per pass):** every targeted course has a well-formed `feeV2`
object that passes `test_data.js`; no popup renders `undefined`; sampled
figures match a real published rate with `lastVerified` set.

## GOLF-96 — Map-based hotel picker ("Add a stay")

**Status:** REVIEW (app code shipped) · **Priority:** P2

App side done. **Blocked on:** manual redeploy of the Cloudflare Worker's
`hotels` mode via the Cloudflare dashboard before it works live. Verify with
a direct `curl` against the Worker.
