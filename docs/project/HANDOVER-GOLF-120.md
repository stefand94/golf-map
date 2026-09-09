# Handover — GOLF-120 (Phase 1): green-fee schema v2 — design proposal

**For:** a coding/research agent (fresh Claude Code session in this repo,
not a BA/PM one). Safe to run largely unattended.
**Date:** 2026-09-09
**Type:** research + a written spec. **Phase 1 only — NO code, NO
data-file changes, NO re-research of course fees yet.** The deliverable is
a proposal the owner signs off before any of that starts.
**Priority:** P1. This gates the entire remaining green-fee programme
(GOLF-98 continuation + all per-nation fee work is paused until the v2
schema is locked).
**Read first:** `CLAUDE.md`, `SCHEMA.md` (the `fee` / `wd` / `we` / `conf`
rows — lines ~39–41), `data/courses-top100.js` (the England Top 100 is the
furthest-along `fee:{}` migration — read a dozen real entries), the
GOLF-120 row in `BACKLOG.md`, and grep the archive
(`.claude/plans/history/2026-H1-archive.md`) for `GOLF-97` and `GOLF-98`
for why the current shape was chosen and the BRS Golf ToS finding.

---

## Why

The owner's spot-checks (2026-09-08) show the current `fee:{weekday,
weekend, weekendTwilight?, confidence, lastVerified}` values are often
inaccurate — a single weekday/weekend min–max hides the real structure of
club pricing and tends to understate peak rates. Before re-researching
557+ courses (expensive, manual), we want a richer **source** structure
that captures how green fees actually vary, and a rule for collapsing it
to the single figure the UI shows today.

The forward-looking goal is per-tee-time planning / booking, so the schema
should be able to answer "what does a round here cost *on this date, at
this time*" — even if the UI doesn't use all of it yet.

---

## Deliverable

`docs/project/GOLF-120-schema-v2-proposal.md` — a written proposal
(reference/proposal style, like GOLF-101 / GOLF-117). It must contain:

### 1. What varies (evidence-based)
Survey how green fees are really structured, using **real published rate
cards** — sample ~12–15 courses spread across England, Scotland, Ireland,
Wales and South Africa, and across tiers (a premium links, a mid-market
parkland, a municipal). For each, note which of these axes it actually
uses:
- **Season** — high / shoulder / winter (and the month ranges; they
  differ by course and hemisphere — SA is inverted).
- **Day** — weekday vs weekend/bank holiday; sometimes specific days
  (Friday priced as weekend, Monday special).
- **Time bands** — morning / afternoon / twilight / super-twilight, with
  the cutoff times.
- **Round length** — 18 vs 9 holes; day tickets; replay rate.
- **Player type** — visitor, guest of a member, society/group, county
  card, affiliated-club discount.
- **Cart/buggy** — included / mandatory / extra, and whether it's ever
  bundled into the headline price.
- Anything else that shows up (online-booking discount, resort-guest
  rate, winter mats surcharge).

Include the raw sampled figures in an appendix so the owner can sanity-check.

### 2. Proposed v2 schema
A concrete shape (JSON example, fully worked, for 2–3 of the sampled
courses — at least one simple and one complex). Address:
- **How the axes nest.** e.g. `seasons[] → { name, months, rates[] }`,
  each rate `{ day, timeBand, holes, playerType, amount, currency }`. Keep
  it as flat/regular as the data allows — every optional level is a
  research burden ×557 and a rendering branch.
- **Currency** — courses already mix GBP / EUR / ZAR. Carry it explicitly.
- **Partial data.** Most courses will only ever have a headline weekday +
  weekend figure. The schema must represent "that's all we know" cleanly,
  not force empty season/time structure. Propose the minimal valid
  `fee` — probably a single default rate with everything else absent.
- **Confidence & provenance** — keep/evolve `confidence` +
  `lastVerified`; consider per-rate vs per-object. Add a `source` URL?
- **"Highest applicable" derivation.** Specify the exact rule the UI uses
  to pick the one displayed figure from the structure (the owner's words:
  "displayed figure derived as highest applicable"). Define it for: no
  date context (browsing), a specific date, a specific date+time. Note
  where it plugs into `feeRangeFor()` / `feeNumberFor()` /
  `feeNumberForDate()` in `js/trip-geo.js` — **describe**, don't change.

### 3. Migration & effort
- How v1 `fee:{}` objects (England Top 100, ~114 done) map to v2 — lossless
  upgrade, or do they need re-research too? (Owner's stated assumption:
  re-research everything, including the Top 100 — confirm or push back.)
- Keep legacy free-text `wd`/`we` untouched as the ultimate fallback, as
  now (`SCHEMA.md` line 39) — confirm.
- Rough order-of-magnitude effort for the re-research pass: per-course
  time × course count, via the established fetch-once → JSON intermediate
  → manual/scripted merge pattern (background Haiku batch agents returning
  JSON, never editing data files — see `CLAUDE.md` and
  `docs/project/data-entry-workflow` memory). **Not scraping** — BRS Golf
  ToS forbids it (GOLF-98 finding).
- A phased sequence (which nations first; whether to ship the schema +
  England Top 100 re-research first and backfill the rest per-nation).

### 4. Open questions for the owner
List every decision that needs an owner call before Phase 2 starts —
especially anything that trades research cost against granularity.

### 5. Recommendation
One clear recommended schema (not three equal options) with the reasoning,
plus the two or three things you'd cut if effort has to come down.

---

## Constraints / method

- **No changes to any shipped file** — `data/*.js`, `js/*.js`, `*.html`,
  `SCHEMA.md` all untouched this phase. Output is one new doc under
  `docs/project/`.
- Use published club rate cards / official course sites for the survey.
  Public pages only; if a source's ToS bars automated access, note it and
  move on (don't work around it).
- A throwaway scratch script (under the session scratchpad, not
  committed) is fine for collating sampled figures.
- Keep the schema as simple as the real data permits. The failure mode
  here is a beautiful schema that makes the 557-course re-research
  twice as slow.

## Definition of Done

- `docs/project/GOLF-120-schema-v2-proposal.md` exists with sections 1–5.
- The sampled evidence (≥12 courses, real figures, source URLs) is in an
  appendix.
- Section 2 has at least one fully worked complex example and one minimal
  example.
- The "highest applicable" derivation rule is stated precisely enough to
  implement without further product input.
- `BACKLOG.md` GOLF-120 row updated: status → "Phase 1 proposal ready,
  awaiting owner sign-off"; add a "Recently completed" line for the
  proposal.
- No shipped files changed; no scratch scripts committed.

> This is a spec task. The next step after owner sign-off is a separate
> handover for the schema change + the re-research programme — do not
> start either here.
