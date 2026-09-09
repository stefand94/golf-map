# Handover — GOLF-119: DotGolf club-finder API — geographic coverage audit

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM one).
**Date:** 2026-09-09
**Type:** desk research → a written note. **No app code, no data-file
changes.** One throwaway probe script at most.
**Read first:** `CLAUDE.md`, `scripts/README.md` (the
`fetch_*_golf_clubs.py` sections — they record exactly how each nation's
endpoint was confirmed and where the shapes differ), and
`HANDOVER-GOLF-121.md` (this audit feeds the per-nation bulk pulls).
**Sequence:** do this **after GOLF-121a** (the South Africa full pass).
121a will teach you the `GetClubHierarchies`/`FindClubs` "pull everything"
pattern first-hand — apply that knowledge here.
**Priority:** P2, XS effort. Not a go-live blocker.

---

## Why

We use the DotGolf white-label club-finder API, name-driven, for England,
Scotland, Wales, Ireland and (a location/radius variant) South Africa —
see the table in `HANDOVER-GOLF-121.md`. The owner believes **New Zealand
and Australia run the same platform**. Before we plan any geographic
expansion (GOLF-121c+, and eventually US/Europe), we need a clear map of
which national bodies expose this API, in what shape, and whether a
**bulk list** (not just name search) is possible.

---

## Deliverable

`docs/project/GOLF-119-coverage-audit.md` — a short written note
(proposal/reference style, like GOLF-101/117). It must contain:

### 1. Confirmed-live table (the five we already use)
For England / Scotland / Wales / Ireland / South Africa, restate from
`scripts/README.md` + a quick live re-check:
- Body name + API base URL.
- Which endpoints respond (`GetClubsByName`, `GetClubDetails`,
  `GetClubHierarchies`, `FindClubs`, `GetClubHierarchies`+`FindClubs`).
- Whether a **full national list without a name** is obtainable
  (`GetClubHierarchies {}` → all clubs; or an unfiltered `FindClubs`),
  and the approx. club count it returns.
- What fields come back (coords, phone, website, `TeeBookingUrl`,
  `MembershipUrl`, amenities, `NoOfHoles`) — and confirm still **no green
  fees** anywhere.

### 2. New Zealand + Australia
- **NZ:** check `golf.co.nz` (New Zealand Golf) — inspect its
  find-a-club / course-finder page's network traffic (Browser tool) for a
  DotGolf-shaped endpoint. Try the known paths (`/api/clubs/GetClubsByName`,
  `/api/clubs/GetClubHierarchies`, `/api/clubs/FindClubs`) against the
  site's own API host.
- **Australia:** check `golf.org.au` and the **GolfLink** system
  (`golflink.com.au` — Golf Australia's handicap/club system, the most
  likely DotGolf tenant). Same probe.
- For each: does it run DotGolf? Same endpoint names? Bulk list available?
  Approx. club count? Coordinates present? Any auth/CORS/rate-limit
  obstacle that would block a `scripts/fetch_*_golf_clubs.py` clone?
- If it is **not** DotGolf, say what it is instead (custom API, static
  page, third-party map embed) and whether it's still scrape-once-able
  under the project's rules (public JSON endpoint, no ToS bar — cf. the
  BRS Golf finding in GOLF-98).

### 3. One-line verdict per other candidate geography
- **United States:** GHIN / USGA / GolfNow — different system, note the
  likely data source and that it's a separate investigation.
- **Continental Europe:** is there a pan-European equivalent, or is it
  per-country (Golf España, FFGolf, DGV…)? One line each for the big
  golfing markets (Spain, Portugal, France, Germany, Sweden).
- **Rest of world** worth a line: UAE, Thailand, Mauritius (common golf
  travel destinations).

### 4. Recommendation
- Which geographies are "cheap next steps" (DotGolf, bulk list, coords) —
  rank them.
- Which need their own research ticket before they're viable.
- Feed the ranked list straight into `HANDOVER-GOLF-121.md` §121c.

---

## Method notes / constraints
- Use the **Browser tool** to inspect each national body's own
  course-finder page network calls — that's how every prior nation was
  confirmed (`scripts/README.md` documents this per nation).
- A tiny throwaway probe script under `scripts/output/` (gitignored) is
  fine for hitting candidate endpoints; **do not** add a real
  `fetch_*_golf_clubs.py` for a new nation in this ticket — that's
  GOLF-121c work once the bar is set.
- Stdlib-only Python if you do write a probe.
- Respect ToS: we only use public, unauthenticated JSON endpoints that a
  site's own front-end calls; if a candidate needs an API key,
  registration, or its ToS forbids automated access, that's a finding —
  record it, don't work around it.
- No changes to `data/*.js`, `js/*.js`, or any shipped file.

## Definition of done
- `docs/project/GOLF-119-coverage-audit.md` exists with sections 1–4
  filled in.
- NZ and Australia each have a definite yes/no on DotGolf + bulk-list
  availability, with the evidence (endpoint URL + observed response
  shape / club count, or the reason it failed).
- The recommendation ranks the viable next geographies and is usable as
  input to GOLF-121c.
- `docs/project/BACKLOG.md` GOLF-119 row moved to COMPLETE with a
  one-line findings summary; add a "Recently completed" line.
- Any throwaway probe script left under `scripts/output/` (gitignored) or
  deleted — not committed to `scripts/`.

> This is a research task. The output is a document the owner and the
> next coding agent can act on — not code.
