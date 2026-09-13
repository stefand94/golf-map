# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## GOLF-98 — Green-fee data entry, `feeV2` re-research programme

**Status:** ACTIVE (v2 code + batch 1 shipped; batches 2+ = data) · **Priority:** P2

> 2026-09-10: GOLF-120 Phase 2 is on `main` — the `feeV2` reader/derivation
> (`js/trip-geo.js`), the display wiring (popup / tooltip / Explore / Costs /
> itinerary), and the 126-course batch-1 merge into all five `data/*.js`
> files. The popup fee-display redesign (single/two-box, prominent amount,
> "Confirmed"/"Estimate" sub-label) also shipped 2026-09-10 — DONE, in
> BACKLOG.md. GOLF-98 now *is* the ongoing `feeV2` re-research: fill in the
> rest (data + number verification), same fetch-once → JSON → scripted-merge
> pattern, targeting `feeV2`. **The remaining GOLF-120 work is entirely
> data/number accuracy — no more code is planned.**

Remaining passes, in order:

1. **England Top 100 ranks 35–114** ("batch 2") — reminder routine
   `trig_01KjZDrrJ3wYrk8EQ3nf26Z9` fires Tue 2026-09-16 22:00 London (just
   before the weekly usage-limit reset), owner decides whether to run.
2. Scotland / Ireland / Wales beyond the top ~30%.
3. London catchment (`data/courses-london.js` — 0 done).
4. **South Africa's remaining `zaRanked` courses — REVIEW, implemented on
   branch `golf-127-132-sa-fees` 2026-09-13** (bundled with GOLF-127/
   GOLF-132, see BACKLOG.md), pushed, not merged, awaiting owner test.
   Scope decided with the owner: of SA's 421 courses, 108 are
   `zaRanked:1` (the only ones that ever show on the map today —
   `courseShownOnMap()`, GOLF-121d); 25 already have `feeV2` from batch-1;
   the remaining **82 `zaRanked` courses with no `feeV2`** are this pass.
   The other 314 non-ranked bulk-placeholder courses (from GOLF-121a's
   full national pull) are explicitly **out of scope for now** — owner
   confirmed 2026-09-13, invisible on the map until a future "show all"
   toggle ships, not worth researching today. Revisit passes 2 and this
   note if/when that toggle is built.
   - **Done:** dev independently re-derived the live count (107 `zaRanked`,
     25 with `feeV2` already → 82 needed — matched the estimate exactly),
     ran 6 background Haiku agents (~14 courses each), merged additively
     into `data/courses-southafrica.js` by course name (existing
     `wd`/`we`/`fee` untouched). Thin-source courses marked `estimated`/
     `poa` rather than guessed, same convention as batch-1. All 82 now
     have real `feeV2`; `test_data.js` (879 courses) + `check_js.js` pass;
     popup sweep clean.
   - **Flagged for a human re-check** (owner, not urgent, doesn't block
     testing): 4 courses had non-schema day values in the raw research
     (specific weekdays / Saturday-only specials) folded into the
     day/weekend/friday/any enum, nuance kept in `notes` —
     **Killarney Country Club, Milnerton Golf Club, Wild Coast Sun
     Country Club, Silver Lakes Golf & Wildlife Estate.**

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

**Number-verification plan:** `docs/project/GOLF-120-fee-testing-plan.md`
— sampling order (estimated GB → estimated IE → known-suspect list →
10 % of published → poa), per-course procedure, regression checks, and
the standing >12-month re-verification rule. Known-suspect entries to
fix first: Royal Porthcawl / Nefyn / Celtic Manor (weekend < weekday),
Mount Edgecombe (R260 low), St Enodoc / Erinvale (null headline),
Fancourt (raw vs derived mismatch), Notts / Sherwood Forest (403 → poa).

