# GOLF-120 — green-fee (`feeV2`) number-verification plan

**Status:** active
**Owner:** Stefan
**Created:** 2026-09-10
**Context:** Phase 2 shipped 126 courses of structured `feeV2` data (merge
`f612044`). Confidence in the *numbers* is not yet high — 86 published,
25 estimated, 15 POA, plus several known-suspect entries. This is the
plan to work through them and raise confidence tier by tier.

---

## 1. What we are checking

For each course carrying `feeV2`, confirm against the club's own
published rates (website / booking engine):

1. **Headline is right** — the derived label shown in the popup
   (`£X` / `£X–£Y` / `Up to £X` / `from £X` / `POA`) matches what a
   visitor would actually pay in peak season.
2. **Weekday vs weekend** — not transposed; weekend ≥ weekday unless the
   club genuinely prices it the other way (rare — see §4).
3. **Season months** — `seasons[].months` matches the club's published
   season boundaries, not a guess.
4. **Currency** — GBP / EUR / ZAR as appropriate.
5. **Time bands** — twilight / afternoon rates captured where the club
   publishes them, with a plausible `bandStart`.
6. **Cart** — `cart.status` correct; `mandatory` only where the club
   truly forbids walking (mostly SA parkland).
7. **`confidence`** — `published-rates` only where a real published rate
   was seen; otherwise `estimated` or `poa`.
8. **`lastVerified`** — set to the date the rate was actually checked.

## 2. Sampling / prioritisation

Work in this order — highest user-visible impact first:

| Pass | Scope | Why first |
|------|-------|-----------|
| A | The **15 `estimated` GB Top-100** courses | Shown with an "Estimate" tag today; each is a guess. |
| B | The **~10 EUR (Ireland) `estimated`/low-confidence** entries | Second-most-viewed nation. |
| C | The **known-suspect list** (§4) | Already flagged, quick wins. |
| D | Re-confirm a **random 10 %** of the `published-rates` set | Catch transcription errors in the "trusted" tier. |
| E | The **15 `poa`** entries | Confirm they really are members-only / society-only and not just a 403 at research time (Notts, Sherwood Forest were transient 403s). |

Track progress as a checklist in `docs/project/IN_PROGRESS.md` under
GOLF-98 (the ongoing re-research programme), one line per course.

## 3. Per-course procedure

1. Open the club's green-fee / visitor page (use the "Green fees" or
   "Club website" link already in the popup).
2. Read off: peak-season visitor 18-hole weekday rate, weekend rate,
   any twilight rate + its start time, season date ranges, whether a
   cart is compulsory.
3. Compare with the popup. If it matches → bump `lastVerified` to today,
   set `confidence:'published-rates'` if it was `estimated`.
4. If it does not match → correct the `feeV2` object in the relevant
   `data/courses-*.js` file (additive edit, never touch `wd`/`we`/`fee`).
5. Re-run `node scripts/test_data.js` and the in-browser popup sweep
   (§5) before committing.
6. Commit per nation-batch, not per course, with a one-line summary of
   how many were corrected vs confirmed.

## 4. Known-suspect entries (fix in pass C)

| Course | Issue flagged at merge |
|--------|------------------------|
| Royal Porthcawl | weekend headline **lower** than weekday ("Up to £275" wd vs "£165" we) — verify which is right |
| Celtic Manor (Twenty Ten) | weekend `from £107` < a plausible peak; confirm the "from" is real |
| Nefyn & District | weekend < weekday, same pattern |
| Mount Edgecombe | ZAR rate (R260) looks too low for the course |
| St Enodoc | derives a null headline for the default player type — check `playerType` scoping |
| Erinvale | same null-headline issue |
| Fancourt | popup title (raw `we` "R2,950") vs derived "R5000" — reconcile which is the real visitor rate |
| Nottinghamshire (Hollinwell), Sherwood Forest | marked `poa` only because research hit a transient 403 — retry, likely have published visitor rates |

## 5. Regression checks (run every batch)

```bash
node scripts/test_data.js    # feeV2 shape + enum validation
node scripts/check_js.js     # module parse + load order
node scripts/test_fee_v2.js  # resolver unit tests (rules A/B, labels, cart)
```

In-browser (preview or live), for the courses touched this batch:

- Open each popup — no `undefined` / `NaN` in the fee block.
- Headline label matches the club's published peak rate.
- Two boxes iff weekday ≠ weekend; single "Green fee" box otherwise.
- "Confirmed" shows for `published-rates`, "Estimate" for `estimated`,
  no sub-label for `poa`.
- Cross-check the Costs tab: the green-fee line for a scheduled round of
  that course uses the same number, and any compulsory buggy is its own
  "Compulsory buggy — <course>" line, not folded in.

## 6. Cadence

- **Batches 2+** (England ranks 35–114): reminder routine
  `trig_01KjZDrrJ3wYrk8EQ3nf26Z9` fires Tue 2026-09-16 22:00 London.
- **Standing re-verification:** any `feeV2` whose `lastVerified` is more
  than 12 months old is due a re-check (green fees move yearly, usually
  each spring). Add a yearly reminder once the initial passes are done.
