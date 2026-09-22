# Handover — GOLF-169: a course's currency comes from the course, not from its fee text

**For:** a coding agent. **Date:** 2026-09-22. **Priority:** P2, but it is a
**blocker for GOLF-157 (AU/NZ)** and must land *before* any AU/NZ fee data is
merged. Merge first and the file looks right while the UI prices Australian
golf in pounds — a plausible wrong number, which is the worst failure shape.

**Read first:** `SCHEMA.md` line 45 (`feeV2.currency`), `DECISIONS.md` DEC-026,
`CLAUDE.md` verification checklist.

## The defect, verified in place 2026-09-22

`courseCurrency(i)` (`js/util.js:198`) calls `feeCurrencySym()`
(`js/util.js:191`), which **regex-matches the green-fee free text** for `€`,
`£`, `R` and **falls back to `£`**. There is no nation→currency map in the app.
It works today only because all three shipped nations use one of those symbols.

**Adding `$` does not fix it.** AUD and NZD share the symbol, so a sniffer
cannot tell them apart. The information is not in the string.

## The part that is easy to miss — find it before you design the fix

`moneyBucketAdd/Fmt/Scale/Count` (`js/trip-geo.js:437-456`) key every bucket by
**the symbol itself**, and `moneyBucketFmt` prints the key straight back out as
the symbol (`` `${c}${amount}` ``). So a `$` from Australia and a `$` from New
Zealand land in **the same bucket and silently add together** — the exact
failure DEC-026 exists to prevent, one layer below where GOLF-174 fixed it.

Fixing `courseCurrency()` alone therefore does **not** close this ticket. The
bucket key has to become something that distinguishes AUD from NZD, with the
symbol derived for display. That is the substance of the job; how you do it is
yours.

## What is already in your favour

- **`feeV2.currency` already exists** on every researched course — a real
  currency code (`GBP`/`EUR`/`ZAR`), populated across all six nation files as of
  GOLF-171. That is the authoritative source where it is present.
- **`courseNation(i)`** (`js/explore.js:23`) already classifies every course,
  and `NATIONS` (`js/explore.js:31`) is the list. It is the natural fallback for
  legacy `wd`/`we`-only records.
- **DEC-026 already answers the product question**, so do not re-open it: mixed
  currencies are shown as mixed, everywhere, and the app never converts. Two
  dollar nations in one trip render as two separate figures, exactly as
  `£160 · €75` does today.

Recommended shape — `feeV2.currency` first, `courseNation()` second, present
behaviour last — but the mechanism is the Developer's call. This ticket owns the
requirement.

## Acceptance criteria

- [ ] **No visible change for GB, Ireland or South Africa.** This is the main
      risk: 879 courses render today and must render identically after. Check
      the map popup, the Discover list, day headers, the Costs tab, the trip
      summary pill and a `#share=` link.
- [ ] A course whose nation uses a dollar renders its own nation's currency, in
      fees, day totals and the trip total — not `£`.
- [ ] A trip spanning two dollar nations shows them as two separate figures and
      never sums them into one. **Add a check for this**; it is the regression
      this ticket exists to prevent and nothing in the app exercises it yet.
- [ ] A course with no `feeV2` still prices correctly from its nation.
- [ ] `node scripts/test_data.js` (879 courses), `check_js.js`,
      `test_course_ids.js`, `test_fee_v2.js` all pass.

## Out of scope

- Adding AU/NZ course data (GOLF-157, parked).
- Any currency conversion, ever (DEC-026).
- Re-researching fees.

## Constraints

- Zero build step, global scope, fixed `<script>` order — see `CLAUDE.md`.
- Stage files **by name**; never `git commit -a`, other sessions share this repo.
- Do **not** call `tripStartFresh()` or clear `localStorage` — the owner's real
  trip data is live in that browser.

> Inspect the existing code and follow the established patterns before
> introducing new structure.
