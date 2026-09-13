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

1. **England Top 100, remaining 80 courses without `feeV2`** ("batch 2") —
   **DONE, merged to `main` 2026-09-13.** All 114 England Top 100 courses
   now have `feeV2` (34 from batch-1, 80 from this pass). 7 background
   Haiku agents (~11-12 courses each) researched in parallel; merged
   additively into `data/courses-top100.js` by exact course name (existing
   `fee`/`wd`/`we` untouched). `test_data.js` (879 courses) + `check_js.js`
   pass.
   - Same aggregator-confidence QC as SA pass: any course whose only
     source was a third-party aggregator (golfshake.com, litenews.co.uk)
     had `confidence` downgraded from the agent's self-reported
     `published-rates` to `estimated` (or `published-from-only` where all
     rates were already `isFrom:true`) before merge, with a `notes` line
     disclosing the secondary source. Woburn's three courses
     (Marquess/Duke's/Duchess) currently share one club-wide aggregator
     figure pending a per-course card — flagged in their `notes`.
   - 4 schema-conformance fixes made during merge: West Hill and
     Broadstone's Monday-specific rate folded into `day:"weekday"` (schema
     has no Monday-specific enum value); Little Aston's separate
     weekday/Sunday rates (identical amounts) collapsed to one
     `day:"any"` entry; Bude & North Cornwall's non-standard 11-hole rate
     dropped (schema's `holes` enum is only `18`/`9`/`"day"`), noted in
     `notes` instead.
   - Flagged private/members-only clubs correctly returned `poa` with no
     invented rate: Centurion, Bearwood Lakes, Wentworth (both courses),
     JCB, Berkhamsted, Prestbury.
2. Scotland / Ireland / Wales beyond the top ~30%.
3. London catchment (`data/courses-london.js` — 0 done).
4. **South Africa's remaining `zaRanked` courses — DONE, merged to `main`
   `5f0878a` 2026-09-13** (bundled with GOLF-127/GOLF-132 on branch
   `golf-127-132-sa-fees`). Scope decided with the owner: of SA's 421
   courses, 108 are `zaRanked:1` (the only ones that ever show on the map
   today — `courseShownOnMap()`, GOLF-121d); 25 already had `feeV2` from
   batch-1; the remaining **82 `zaRanked` courses with no `feeV2`** were
   this pass. The other 314 non-ranked bulk-placeholder courses (from
   GOLF-121a's full national pull) remain explicitly **out of scope** —
   owner confirmed 2026-09-13, invisible on the map until a future "show
   all" toggle ships. Revisit passes 2 and this note if/when that toggle
   is built.
   - Dev independently re-derived the live count (107 `zaRanked`, 25 with
     `feeV2` already → 82 needed — matched the estimate exactly), ran 6
     background Haiku agents (~14 courses each), merged additively into
     `data/courses-southafrica.js` by course name (existing `wd`/`we`/`fee`
     untouched). Thin-source courses marked `estimated`/`poa` rather than
     guessed, same convention as batch-1. `test_data.js` (879 courses) +
     `check_js.js` pass; popup sweep clean.
   - **Owner spot-check (2026-09-13) caught 2 false POAs** the research
     agent gave up on because the real rate was hiding behind an
     image-only fee table (Modderfontein) or a binary PDF (Centurion) it
     couldn't read as text — both now have real published rates
     (R475/R620 and R495/R625 respectively). Owner also hand-verified 5
     more of the true-POA courses directly: **Houghton** R1,500,
     **Royal Johannesburg & Kensington (East)** R500 (flagged in the data
     as unusually low for the club's tier, worth a future re-check),
     **Randpark (Firethorn)** and **(Bushwillow)** R760 each, **Eagle
     Canyon** R500. **Millvale Golf Course** and **The River Club** are
     confirmed genuinely private (members/invited-guests only) —
     reclassified `a:"open"`→`a:"application"` so they're correctly
     excluded from bookable-course discovery, not just left with an
     unresolved fee. Lesson for future batches: an agent-reported `poa`
     means "no rate found by the agent," not "no rate exists" — image
     tables and PDFs are common false negatives, worth a light manual
     pass on `poa` results before trusting them.
   - **Still flagged for a human re-check** (owner, not urgent): 4 courses
     had non-schema day values in the raw research (specific weekdays /
     Saturday-only specials) folded into the day/weekend/friday/any enum,
     nuance kept in `notes` — **Killarney Country Club, Milnerton Golf
     Club, Wild Coast Sun Country Club, Silver Lakes Golf & Wildlife
     Estate.**

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

