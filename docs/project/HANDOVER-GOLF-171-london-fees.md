# Handover — GOLF-171: `feeV2` green fees, London batch (the last one)

**For:** the research agents (wave A/B) and the coding agent who merges.
**Date:** 2026-09-22
**Type:** data research + a single in-place merge into `data/courses-london.js`.
**Priority:** P2. Finishes the GOLF-98 → GOLF-120 `feeV2` programme.
**Read first:** `SCHEMA.md` line 45 (`feeV2`), `docs/project/GOLF-120-schema-v2-proposal.md`
(the locked schema + §3 derivation rule — if anything here contradicts it, the
proposal wins), `docs/project/HANDOVER-GOLF-120-phase2.md` (how batches 1–3 ran).

---

## State of the data (measured 2026-09-22, from the file, not from a ticket row)

`data/courses-london.js` holds **123 courses. 0 have `feeV2`.** Every other
nation file is done: England Top 100 (114), Scotland/Wales/Ireland (220),
South Africa's `zaRanked` set. London is the last gap.

Split by what is already recorded in the legacy `wd`/`we` free text:

| Wave | Courses | What they look like now |
| --- | --- | --- |
| **A** | **74** | A real number in `wd` and/or `we` (e.g. `£55`). 33 carry a `site` URL. |
| **B** | **49** | No number at all — `Ask club`, `Members only`, `Restricted`, `Closed to visitors`. Only 2 carry a `site` URL. |

Wave B is the expensive half: there is no figure to verify, so each course
needs a rate found from scratch. **Do not assume all 49 are genuinely private.**
Several are public/municipal pay-and-play (Addington Court, High Elms,
Lullingstone Park, Birchwood Park, Silvermere, Woolston Manor) that certainly
publish rates — `Ask club` there is stale placeholder data, not a finding.
Equally, several are genuinely members-only (Royal Mid-Surrey, Porters Park,
Hartsbourne, Wildernesse) and must come back as `poa`.

## The rule that governs wave B (and the whole job)

**Never invent or interpolate a price.** If no rate the club itself publishes
can be found, return `confidence:"poa"` with `seasons:[]`. "No price" is a
correct, useful answer; a plausible-looking guess is a defect that reaches a
visitor's trip total. Same for a club that is closed to visitors.

Confidence ladder, self-applied and not optimistic:

- `published-rates` — the club's own rate card, copied.
- `published-from-only` — the club only quotes "from £X" (`isFrom:true`).
- `estimated` — figure came from an aggregator or press piece, not the club.
  The UI badges these, so downgrade to it honestly.
- `poa` — no bookable visitor rate found. `seasons` **must** be `[]`.

## Output contract (research agents)

Each agent gets a chunk file of courses (`id`, `n`, `wd`, `we`, `conf`, `site`,
`r`) and writes **one JSON file to the scratchpad. No agent edits any file in
the repo.** This is the GOLF-163 / concurrent-write rule: the course array is
identity-bearing and must be patched in place by a single merging session.

```json
[ { "id": "<the id from the input, copied verbatim>",
    "n":  "<the name from the input, copied verbatim>",
    "feeV2": { "currency":"GBP", "source":"<url actually read>",
               "lastVerified":"2026-09-22", "confidence":"published-rates",
               "notes":"<optional, short: visitor restrictions, what's included>",
               "seasons":[ { "name":"peak", "months":[5,6,7,8,9],
                             "rates":[ {"day":"weekday","holes":18,"amount":55} ] } ] } } ]
```

Enum discipline (this is where earlier batches lost time):

- `day` ∈ `weekday` | `weekend` | `friday` | `any` — nothing else.
- `holes` ∈ `18` | `9` | `"day"`.
- `timeBand` ∈ `anytime` | `morning` | `afternoon` | `twilight` | `super-twilight`,
  with `bandStart:"HH:MM"` when a cutoff is published.
- `months` are numbers 1–12. One undated rate card → a single season named
  `"all"` with no `months`.
- A compulsory buggy is **not** part of the green fee — use the `cart`
  side-channel (`{status:'mandatory', amount, per}`); the app gives it its own
  Costs line.
- `id` is the join key. Copy it; never re-order, re-key or invent one.

## Merge step (coding agent, one session, after all chunks return)

1. Read every `golf171-*.result.json` from the scratchpad.
2. Patch `data/courses-london.js` **in place, by `id`** — add the `feeV2` key to
   the existing record. Never rebuild the array from a list: rebuilding
   re-indexes and silently rewrites already-shared trip links (GOLF-163,
   `data/course-ids.js` is frozen).
3. Watch the **last entry in the array** — batch 3 needed two manual fixes there
   because the final record has no trailing comma.
4. Leave `wd`/`we` untouched. `feeV2` is tier 1 and the legacy strings stay as
   the tier-3 fallback.
5. Verify: `node scripts/test_data.js` (expect 879 courses), `node scripts/check_js.js`,
   `node scripts/test_course_ids.js`, `node scripts/test_fee_v2.js`.
6. Spot-check in the browser: a wave-A course, a `poa` wave-B course and a
   course with a mandatory buggy, in the map popup and the Costs tab. No
   `undefined`, no console errors.
7. Stage `data/courses-london.js` **by name** — never `git commit -a`; other
   sessions work in this repo.

## Acceptance criteria

- [ ] All 123 London courses carry a `feeV2` object.
- [ ] Every `poa` entry has `seasons: []`, and every non-`poa` entry has at
      least one rate with a real `amount`.
- [ ] Every `feeV2` has a `source` URL that was actually read.
- [ ] `confidence` is `published-rates` only where the club's own rate card was
      the source.
- [ ] Course count stays 879 and array order is unmoved (`test_course_ids.js`).
- [ ] The four check scripts pass clean.

## Out of scope

- Re-researching any other nation file.
- Touching `wd`/`we`, `fee` (v1, frozen) or `conf`.
- Any UI change — the `feeV2` reader and display shipped in GOLF-120 Phase 2.

## Why no worktrees

Asked and answered: the research fans out, the writing does not. Nine agents
editing `data/courses-london.js` in nine worktrees would mean nine merges of one
120 KB single-line-per-course file, against a rule that forbids rebuilding the
array. Research in parallel → JSON → one merging session is the pattern batches
1–3 used, and it is the reason batch 3 needed only two manual fixes.
