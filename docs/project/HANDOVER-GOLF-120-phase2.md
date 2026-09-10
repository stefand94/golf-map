# Handover — GOLF-120 Phase 2: `feeV2` code + data merge

**For:** a coding agent (fresh Claude Code session in this repo, not BA/PM).
**Date:** 2026-09-10
**Type:** app code + `SCHEMA.md` + a data merge. Ships to `main` incrementally
(one branch per step, verified, merged — see "Push aggressively to main"
memory; this one is big enough to branch first per step).
**Priority:** P1. Unblocks GOLF-98 (which resumes *as* the v2 re-research
programme once this lands).
**Read first:**
- `docs/project/GOLF-120-schema-v2-proposal.md` — the locked `feeV2` schema,
  the §3 "highest applicable" derivation rule, and the owner decisions box in
  §5 (Q1–Q7 all answered). **This handover implements exactly that doc — if
  anything here contradicts it, the proposal wins.**
- `docs/project/GOLF-120-fees-batch1.json` — the 126-course research payload
  to merge (staged, never merged yet).
- `docs/project/GOLF-120-schema-v2-proposal.md` §"Batch-1 review notes" — the
  entries that need a human eye before they go into `data/*.js`.
- `SCHEMA.md` lines 39–41 (`wd`/`we`/`fee`/`conf`), `js/trip-geo.js` lines
  125–294 (the fee helpers), `CLAUDE.md` verification checklist.

---

## Executive summary — where the data is at

**Capture:** the `feeV2` shape is locked (flat `rate` records; optional
`season → day → timeBand → holes` axes; optional `cart` + `playerType`;
per-object `currency`/`source`/`lastVerified`/`confidence`; `isFrom` for
"from £X"). One research batch is done — **126 courses = the top ~30% by
ranking of England Top 100 (34), Scotland (30), Ireland (25), Wales (12),
South Africa (25)** — sitting in `GOLF-120-fees-batch1.json`: **86
`published-rates`, 25 `estimated`, 15 `poa`**, 50 of them genuinely
multi-season. **Nothing is in `data/*.js` yet and no app code reads
`feeV2`.** The rest of the England Top 100 (ranks 35–114) is a scheduled
"batch 2" — reminder routine `trig_01KjZDrrJ3wYrk8EQ3nf26Z9` fires Tue
2026-09-16. Scotland/Ireland/Wales/SA past the top 30%, plus London and the
~322 SA bulk placeholders, are un-started.

**Display:** today the app shows only the **legacy free-text `wd`/`we`
strings** (`popupHTML()` `.fees` block, `courseTooltipHTML()`) and the
**GOLF-97 v1 `fee:{}` object** where present (England Top 100 only) via
`feeRangeFor()`/`feeNumberFor()`/`feeNumberForDate()`/`feeRangeForDate()`.
The Costs tab renders a v1 range + a confidence tag (`FEE_CONF_TAG` in
`js/trip-ui.js`). **No seasonal / time-band / "Up to £X" / "from £X" /
mandatory-buggy rendering exists.** Phase 2 builds all of it.

**Net:** schema + rule are signed off; ~23% of the ranked courses have real
structured data captured but unmerged; the app can't read or show any of it
yet. Phase 2 = wire the reader, wire the display, merge batch 1, update the
schema doc + tests.

---

## Step 1 — `feeV2` reader in `js/trip-geo.js` (branch, verify, merge)

Add `feeV2` as the **first** source in the fee-resolution chain, ahead of the
v1 `fee` object, ahead of the `wd`/`we` regex. No behaviour change for any
course without a `feeV2` key.

### 1a. New internal resolver

```
feeV2Pick(i, {field, date, time}) -> { amount, label, confidence, isFrom, upTo, cart } | null
```

- `field` is `'wd'|'we'` (existing caller vocabulary).
- Implements the §3 derivation rule exactly:
  - **No `date`** → rule A: candidate filter (visitor/absent playerType,
    holes 18/absent, timeBand anytime/absent), consider all seasons, `day ∈
    {weekday,any}` for `wd` / `{weekend,friday,any}` for `we`. `amount` =
    `max(amountMax ?? amount)`. `min` for a range = `min(amount)` over the
    same set.
  - **`date`, no `time`** → rule B: pick the season whose `months` contains
    the month (else `name:"all"`, else fall back to A); `day` = weekend iff
    Sat/Sun (**no** bank-holiday list — owner Q4), friday-rate iff Friday and
    present; timeBand anytime/absent.
  - **`date` + `time`** → rule C: choose the timeBand whose window contains
    the time using `bandStart` cutoffs, `anytime` as fallback.
- **`label`** (owner Q5): `'from £X'` when the winning rate has
  `isFrom:true` && no `amountMax`; `'Up to £X'` when the winning figure is a
  *derived ceiling* (max across >1 candidate rate); plain `'£X'` for a lone
  published rate. Return the symbol from the course's currency
  (`courseCurrency(i)` stays the source of truth for the symbol; assert it
  matches `feeV2.currency` in a dev-only console warn).
- **`cart`**: pass through `feeV2.cart` unchanged for the Costs step.
- `poa` (or `seasons:[]`) → return `null` **but** surface `confidence:'poa'`
  to callers that show a tag (mirror how v1 `poa` behaves today).

### 1b. Splice into the existing helpers

| Helper | Change |
|---|---|
| `feeRangeFor(i,field)` | try `feeV2Pick(i,{field})` first → `{min,max,confidence,isFrom,upTo}`; unchanged v1 + `wd/we` fallbacks after. |
| `feeNumberFor(i,field)` | unchanged (averages `feeRangeFor`). |
| `feeNumberForDate(i,dateStr)` | the "`C[i].fee` present → return `r.max`" special-case now fires for `feeV2` too; thread `date` into the resolver so rule B applies. Cleanest: introduce `feeRangeForCtx(i,field,{date,time})` and have both date helpers call it. |
| `feeRangeForDate(i,dateStr)` | same; also return `isFrom`/`upTo` so the Costs tab can print the right label. |
| `feeFieldForDate(dateStr)` | **unchanged** — already Sat/Sun-only, which is what Q4 wants. |
| `extractFee()` | untouched. |

### 1c. Tests
`node scripts/test_data.js` + `node scripts/check_js.js` must stay green.
Add a small unit block (or a `scripts/test_fee_v2.js`) covering: a minimal
2-rate course, a 3-season course (rule A max & min), a "from" course, a
mandatory-cart course, a `poa` course, and rule B on a known in-season
Saturday vs an off-season Wednesday.

---

## Step 2 — display (branch, verify, merge)

Everything reads through the Step 1 helpers — **no component touches
`C[i].feeV2` directly.**

1. **`js/map.js` `popupHTML()`** — the `.fees` block: when a `feeV2`
   headline exists, render `Weekday: <label>` / `Weekend: <label>` from the
   resolver (`£X` / `from £X` / `Up to £X`), with the confidence pill. Keep
   the raw `wd`/`we` string as a muted secondary line / title attr for
   courses with no `feeV2`. If the course is `poa`, show the existing
   members-only treatment.
2. **`js/map.js` `courseTooltipHTML()`** — swap `V(i,'wd')` for the resolver
   headline (fall back to `V(i,'wd')`).
3. **`js/util.js` `feeNum(i)`** — prefer the `feeV2` weekday headline number,
   fall back to today's `wd` regex. This feeds the Explore fee-range slider
   bounds (`js/explore.js:80`), the fee filter (`:314`) and the fee sort
   (`:472-473`) — all keep working, now on real numbers.
4. **`js/trip-ui.js`** — `FEE_CONF_TAG` (line 300) gains `'published-rates'`
   (label e.g. "researched") and keeps `'published-range'` as an alias for
   back-compat with any un-migrated v1 object. `feeRangeLabel()` (line 298)
   learns the `upTo`/`isFrom` cases so a scheduled golf item can read
   "Up to £300 · researched".
5. **Costs tab — mandatory buggy (owner Q6):** in `tripCostLineItems()`
   (`js/trip-ui.js` ~330–357), when a scheduled/unscheduled golf item's
   resolver result carries `cart.status === 'mandatory'`, push a **separate**
   line item — `{label:"Compulsory buggy", cat:"Golf", amount: cart.amount *
   (cart.per==='person'? guests : 1), cur, day}` — never fold it into the
   green-fee figure. `moneyBucketAdd`/`tripDayCurrency` already bucket by
   currency, so it totals correctly.
6. **Itinerary** — a small "buggy compulsory" tag on the day/course row
   (mirror the GOLF-118 ferry-tag pattern if that's landed, else a plain
   `<span class="wt">`).
7. **`js/trip-route.js:46` / `js/trip-add.js:242`** — no code change needed
   (they call `feeNumberFor`, which now sees `feeV2`), but re-check the
   coverage counter (`covered++`) still means "we have a real number".

---

## Step 3 — merge `GOLF-120-fees-batch1.json` into `data/*.js`

- Match each payload object to a course by `n` **within the right file**
  (England Top 100 → `courses-top100.js`, etc. — the JSON does not carry the
  region, derive it from the batch letter mapping in
  `scratchpad`/proposal Appendix A, or just match by unique name across all
  five files and assert exactly one hit).
- Write a `feeV2:{…}` key on each matched course, **beside** the existing
  `fee`/`wd`/`we` (do not delete or edit those — additive, per SCHEMA.md).
- **Before writing**, apply the "Batch-1 review notes": re-verify the 25
  `estimated` against the club site or leave them flagged; retry Notts &
  Sherwood Forest (transient 403 at research time); sanity-check the
  weekend-below-weekday cases (Royal Porthcawl, Celtic Manor, Nefyn) and
  Mount Edgecombe's suspiciously low figure; confirm St Enodoc / Erinvale
  get a sensible headline from the resolver (they currently derive `null`).
- Use a small merge script (scratch, **not committed** — CLAUDE.md data-entry
  rule). Prettier/format to match the surrounding file style (single-line
  objects, same key order idiom).
- `node scripts/test_data.js` after each file. Add `feeV2` well-formedness
  to `test_data.js`: valid `currency` enum, `confidence` enum, `seasons` is
  an array, every rate has a numeric `amount` and a valid `day`, `poa` ⟹
  `seasons:[]`.
- Merge order: England Top 100 → Scotland → Ireland → Wales → South Africa.
  One commit per file so a bad match is easy to revert.

---

## Step 4 — `SCHEMA.md` + docs

- New `feeV2` row after the `fee` row (line 40). Document the shape, the
  four confidence values (`published-rates` / `published-from-only` /
  `estimated` / `poa`), the derivation labels (`£X` / `from £X` /
  `Up to £X`), and that it's read via the same
  `feeRangeFor()`/`feeNumberFor()`/`feeNumberForDate()`/`feeRangeForDate()`
  helpers.
- Mark the v1 `fee` row **legacy / frozen** — no new `fee` objects; existing
  ones stay as a fallback tier until re-researched.
- `SCHEMA.md` line 39: confirm `wd`/`we` stay as the ultimate fallback
  (unchanged).
- `docs/project/BACKLOG.md` GOLF-120 row → status "Phase 2 shipped
  (helpers + display + batch-1 merge); batches 2+ = GOLF-98 continuation".
  Move the GOLF-98 row in `IN_PROGRESS.md` back to active, re-scoped as the
  v2 re-research programme.
- Add a "Recently completed" line.

---

## Constraints / method

- The §3 derivation rule and the §5 owner decisions are **fixed** — do not
  re-open them. If real data exposes a genuine gap, note it in the proposal's
  own "open" area and ask; don't guess.
- Additive only: `wd`/`we` and v1 `fee` are never edited or removed.
- No scrapers; published club pages only (BRS Golf ToS — GOLF-98 finding).
- Scratch merge/verify scripts stay in the session scratchpad, uncommitted.
- Clear any trip/test `localStorage` state before ending the session
  (`tripStartFresh()`), per the handoff memory.

## Definition of Done

- `feeV2` is the first tier in the fee-resolution chain; a course with a
  `feeV2` key shows its derived headline (`£X` / `from £X` / `Up to £X`) +
  confidence pill in the popup, tooltip, Explore list and Costs tab.
- A mandatory-buggy course shows a **separate** "Compulsory buggy" line in
  the Costs breakdown and a tag in the itinerary.
- Date-aware costing uses the in-season / correct-day rate (rule B); Sat/Sun
  only, no BH list.
- `GOLF-120-fees-batch1.json` is merged into all five `data/*.js` files,
  additive, with the review-note entries checked.
- `node scripts/test_data.js` + `node scripts/check_js.js` green;
  `test_data.js` validates `feeV2`.
- No `undefined` in any rendered popup/card/cost line; a course with no
  `feeV2` renders exactly as it does today.
- `SCHEMA.md`, `BACKLOG.md`, `IN_PROGRESS.md` updated; scratch scripts not
  committed.

> After this lands, the next work is pure data: batch 2 (England 35–114, via
> the Tue reminder) then Scotland/Ireland/Wales/SA beyond the top 30%, then
> London — all as GOLF-98, same Haiku-batch → JSON → merge pattern, now
> targeting `feeV2`.
