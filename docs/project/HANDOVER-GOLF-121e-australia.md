# Handover — GOLF-121e: add Australia to the map

**Status:** PARKED — greenlit in principle by the owner 2026-09-09 ("I like
the look of the Australia results"), but deliberately **not started**. Pick
up when Australia rises above the other P2 work.
**For:** a coding agent (fresh Claude Code session, not a BA/PM one).
**Read first:** `CLAUDE.md`, `SCHEMA.md`, `HANDOVER-GOLF-121.md` (the
generic bulk-pull playbook — coord spot-checks, no-runtime-API rule,
merge-is-a-separate-step), and the SA precedents:
`data/courses-southafrica.js` header comment, `docs/project/GOLF-121a-notes.md`
(the ranking-merge method), and GOLF-121d in `BACKLOG.md` (the `zaRanked`
ringfence pattern).
**Branch:** `golf-121e-australia`, not `main`. Cloudflare preview before merge.
**Priority:** P2. Not a go-live blocker.

---

## What's already done (2026-09-09)

A research pull is complete and committed:

- **`docs/project/GOLF-121-australia-research.md`** — the reviewed Top 100
  table (rank, course, state, town) + distribution + multi-course-club
  notes + the "what's still needed" checklist. Owner has seen and approved
  the shape of this list.
- **`docs/project/GOLF-121-australia-sources.json`** — the raw agent
  output: Golf Australia Magazine 2026 Top 100 (full, the spine) + 6
  cross-checked entries from a paywalled Top100GolfCourses.com Oceania
  page. Use this as the seed name/rank/state/town list; do **not** re-run
  the research from scratch unless it's gone stale.

Nothing else exists: no `data/courses-australia.js`, no nation pill, no
`config.js` regions, no coordinates.

---

## Open decisions for the owner (resolve before coding)

1. **Second ranking source.** The research is effectively single-source
   (Golf Australia Magazine). SA unioned *two* independent rankings. Either
   (a) accept single-source for AU and document it as `conf:"est"`, or
   (b) get a second list first — a paid Top100GolfCourses.com account, or
   Australian Golf Digest's Top 100. Recommendation: (a) is fine for a v1
   — the GA Magazine list is the recognised authority — but flag it.
2. **Ringfence or full list?** SA shipped ~421 entries with only ~107
   shown (`zaRanked:1` gate). Australia has no bulk-pull bloat, so the
   simplest path is: add **only** the ~100 ranked courses, every one
   `auRanked:1` + `t100.au`. No hidden tier, no gate logic needed beyond
   what `courseNation()` already does. Confirm the owner doesn't also want
   the long tail of ~1,500 Australian clubs (they explicitly said GB &
   Ireland breadth is "enough for now", so almost certainly not).
3. **Nation pill = 4th nation.** Adds a 4th button to the GB / Ireland /
   South Africa row (`NATIONS` in `js/explore.js`, `renderNationPills()`,
   the equal-width grid from GOLF-114 already scales off `NATIONS.length`).
   Confirm the label — "Australia".

---

## Implementation outline (once decisions are in)

1. **Coordinates.** No verified DotGolf source for AU (that was GOLF-119,
   on hold — `golf.org.au` / GolfLink is the candidate host; probe it
   first). Fallback: OpenStreetMap Overpass, same as the SA coord-fix pass
   (`scripts/fetch_sa_golf_overpass.py` is the template — query
   `leisure=golf_course` per state bbox, fuzzy-match on name, spot-check
   every hit). ~100 courses is small enough to hand-verify each pin.
2. **`data/courses-australia.js`** — new `C_AUSTRALIA=[…]` array,
   `C.push(...C_AUSTRALIA)` at the end. Fields: `n`, `lat`, `lng`, `r`
   (state — see regions below), `a:"open"` (most AU top-100 are private
   but visitor-bookable; check per course), `wd`/`we` placeholders in
   **AUD** (`conf:"est"` — new currency, see below), `arch`/`spec`/`note`
   `"Unknown"`/generic unless researched, `topAustralia:1`, `auRanked:1`,
   `t100:{au:N}`, `site:""`. Match the SA file's header-comment style
   (provenance, what's real vs placeholder).
3. **Multi-course clubs** — list each course as its own entry sharing the
   club's coords (Royal Melbourne West/East, Barnbougle Dunes/Lost Farm,
   The National ×3, Peninsula Kingswood ×2, Moonah Links ×2, The Grange
   ×2, Joondalup ×2). Note the 13th Beach / Thirteenth Beach "Beach #31"
   vs "Creek #55" quirk — two real courses, one club, source spells the
   club two ways; use one club spelling.
4. **`data/config.js`** — append AU states to `REGIONS`: Victoria, New
   South Wales, Queensland, Western Australia, Tasmania, South Australia,
   ACT. (7 regions; distribution in the research doc.)
5. **`js/explore.js`** — `courseNation()` gets an `au` branch
   (`c.topAustralia?'au':…`); add `['au','Australia']` to `NATIONS`.
   `courseShownOnMap()` needs no change if every AU entry is `auRanked:1`
   (nothing to hide). If a hidden tier is added later, mirror the SA
   `za` clause.
6. **`js/map.js`** — `rankChips()` / `bestRankBadge()` / `courseTooltipHTML()`
   / `rankNum()` (`js/util.js`) all enumerate nation rank keys — add `au`
   to each, same treatment as `za`.
7. **Currency (AUD).** The map already handles multi-currency (£ GB, €/£
   Ireland, R South Africa). Trace how `R` was threaded in for SA
   (`data/config.js`, any `CURRENCY`/symbol map, fee parsing in
   `js/util.js` `feeNum()` / cost rollups in `js/trip-ui.js`) and add
   `A$` the same way. This is the fiddliest part — SA's R handling is the
   reference.
8. **`SCHEMA.md`** — document `topAustralia:1`, `auRanked:1`, `t100.au`
   (same wording pattern as the GOLF-121d `zaRanked` / `t100.za` entries).
9. **`sw.js`** — `scripts/update_sw_cache_version.py` (new precached data
   file). Pre-push hook enforces it.
10. **`data/config.js` / PWA** — check `manifest`/precache lists include
    the new file.

## Verify before push

```bash
node scripts/test_data.js    # course counts + integrity
node scripts/check_js.js     # parse + load order
```
In-browser: Australia pill filters to ~100 pins, all `auRanked`; other
nations unaffected; no console errors; no "undefined"/"NaN" in popups;
AUD renders with the right symbol in cards, popups and the Costs tab;
clear test `localStorage` before finishing.

## Docs to update on completion

`BACKLOG.md` (GOLF-121e → DONE + Recently-completed line), `SCHEMA.md`,
`data/courses-australia.js` header, and add a short "Australia pass" section
to `GOLF-121a-notes.md` or a new `GOLF-121e-notes.md` with the final
`t100.au` provenance table.
