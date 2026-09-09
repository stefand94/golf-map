# Handover — GOLF-121: bulk DotGolf course pull, per country

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM one).
**Date:** 2026-09-09
**Read first:** `CLAUDE.md`, `SCHEMA.md` (course object fields — esp. `n`,
`lat`/`lng`, `r`, `a`, `wd`/`we`, `fee`, `conf`, `arch`, `spec`, `note`,
`site`, `clubInfo`, `topSouthAfrica`/`topScot`/… flags, `t100`), the
header comment in `data/courses-southafrica.js`, and
`scripts/README.md` (the `fetch_*_golf_clubs.py` section + the
"NoOfHoles is unreliable" and "always spot-check for `0.0,0.0`
coordinates" gotchas).
**Branch:** one branch per sub-task (e.g. `golf-121a-sa-full`), not
`main`. Push for a Cloudflare preview before merge.
**Priority:** P2. Not a go-live blocker, but 121a (South Africa) is
wanted first — that's where the owner's main testers are.

**Verify before every push:**
```bash
node scripts/test_data.js    # course counts + data-file integrity
node scripts/check_js.js     # all js/*.js parse + load order
```
Plus an in-browser pass via `./scripts/serve.sh`: no console errors, no
literal "undefined"/"NaN" in any course popup or card, SA nation pill
still filters correctly, new courses cluster and render pins.

---

## Background — what "the DotGolf endpoint" is

The national handicapping bodies run a shared white-label club-finder
platform ("DotGolf"). We already use it, name-driven, for six data sets:

| Nation | Body / host | Script | API shape |
| --- | --- | --- | --- |
| England | England Golf | `fetch_england_golf_clubs.py` | `GetClubsByName` → `GetClubDetails` |
| Scotland | Scottish Golf | `fetch_scottish_golf_clubs.py` | same |
| Wales | Wales Golf | `fetch_wales_golf_clubs.py` | same |
| Ireland | Golf Ireland | `fetch_ireland_golf_clubs.py` | same |
| South Africa | Handicap Network Africa (`handicaps.co.za`) | `fetch_south_africa_golf_clubs.py` | `GetClubHierarchies {}` (all clubs, no coords) → `FindClubs {clubId}` (full record incl. coords) |

Each script takes a `--names-file` (`{key: "Club name"}` JSON) and writes
`scripts/output/<nation>_golf_clubs.json` (gitignored). Merging that
output into `data/courses-*.js` is a **separate, manual step** — a bad
fetch can never silently corrupt the live map. The shipped page makes
**zero runtime API calls**; every course is a static literal.

**The API returns coordinates, phone, website, `TeeBookingUrl`,
`MembershipUrl`, amenities — but NO green fees, architect, or
description.** Those stay hand-curated. `NoOfHoles` exists but is
documented-unreliable (has shown "9" for known 18-hole championship
courses) — never trust it without a cross-check.

---

## The problem this ticket solves

Every `data/courses-*.js` file is a **curated subset**, not a complete
national list:

| File | Entries now | Approx. national total (DotGolf) |
| --- | --- | --- |
| `courses-southafrica.js` | 99 | ~449 clubs (`GetClubHierarchies` last run) |
| `courses-top100.js` (England) | 114 | ~2,000+ clubs |
| `courses-scotland.js` | 51 | ~550 clubs |
| `courses-wales.js` | 38 | ~180 clubs |
| `courses-ireland.js` | 37 | 382 clubs |

Two linked gaps:

1. **Breadth** — a user searching "near me" outside the curated set finds
   nothing, even where a real course exists.
2. **Completeness at multi-course clubs** — a 36-/54-hole estate
   (Fancourt, Gary Player CC/Sun City, Mount Edgecombe already fixed in
   SA; many more elsewhere) often carries only one of its courses. DotGolf
   is **club-level, not course-level**, so it can't fully solve this on
   its own.

---

## Sub-task 121a — South Africa full pass  ← DO THIS FIRST

**Goal:** grow `data/courses-southafrica.js` from the 99 curated entries
to a near-complete list of every real, playable South African golf club
DotGolf knows about (~449 nationally, minus driving ranges / defunct /
9-hole par-3 novelty entries — see filtering below).

### Step 1 — make the SA script able to pull everything

`fetch_south_africa_golf_clubs.py` is currently name-driven (`difflib`
match against `GetClubHierarchies` for each requested name). Add a mode
that skips the names file and iterates **every** club from
`GetClubHierarchies`, calling `FindClubs {clubId}` for each:

```bash
python3 scripts/fetch_south_africa_golf_clubs.py --all \
    --out scripts/output/south_africa_golf_clubs_all.json
```

- Keep the existing `--names-file` mode untouched (other tooling and the
  other nations' parity depend on it).
- Be polite to the API: `time.sleep(~0.3s)` between `FindClubs` calls,
  resumable (skip `clubId`s already in the out file so a re-run continues
  after a failure), print progress.
- Output shape stays identical to the current file (`{clubs: {key:
  {query, club_id, matched_name, details}}}`) so no merge-script changes
  are forced. Use the `ClubID` as the key in `--all` mode.

### Step 2 — filter the raw list down to real courses

`GetClubHierarchies` includes ranges, academies, defunct clubs and
`Latitude:0.0,Longitude:0.0` junk. Before merging, drop:

- Any record with missing / `0.0,0.0` / off-continent coordinates
  (spot-check every survivor's coords on a map — this is the lesson from
  the Newport/Gailes/Royal Co Down bugs in `scripts/README.md`).
- Obvious non-courses by name: "Driving Range", "Golf Academy",
  "Pitch and Putt", "Par 3" novelty venues, "Putt-Putt". Keep genuine
  9-hole clubs (flag them, see below) — drop only non-golf/º practice-only.
- Exact duplicates of an existing curated entry (match on name with
  trailing "(The Links)"/"(East)"/etc. qualifier stripped, then on
  coords within ~200 m). **Do not** overwrite a curated entry's
  hand-researched `fee`/`arch`/`note` — if a club is already in the file,
  leave it; only append the ones that are missing.

### Step 3 — shape the new entries

Each appended course object needs, at minimum:

```js
{ n:"<Club name>", lat:<num>, lng:<num>,
  r:"<one of the SA REGIONS in data/config.js>",   // map by RegionName / coords
  a:"open",                                        // assume public-access unless clearly private
  wd:"R650", we:"R750", conf:"est",                // generic placeholder — NOT researched
  arch:"Unknown", spec:"18", note:"",
  clubInfo:{ phone:"<from FindClubs>" },
  site:"<Website from FindClubs, or ''>",
  topSouthAfrica:1 }                               // nation-gating flag; NO t100 rank for non-ranked clubs
```

- **No `fee:{…}` object** on the bulk entries — the structured fee shape
  is GOLF-120's job. Leave the legacy `wd`/`we` as an honest generic
  placeholder and `conf:"est"`. Add a file-header note (like the existing
  one) recording that the 2026-09 bulk batch's fee/arch/note are
  placeholders.
- `spec:"18"` unless `NoOfHoles` **and** a quick name/website check agree
  it's a 9-hole club → `spec:"9"` + add a `holes:9` marker in `note` or a
  `nine:1`-style flag (check SCHEMA / existing entries for the current
  convention; if none exists, put "9-hole" in `note` and raise it as a
  follow-up rather than inventing a field).
- Region: SA REGIONS are `Western Cape & Garden Route`, `KwaZulu-Natal`,
  `Gauteng`, `Eastern Cape`, `Mpumalanga & Kruger`, `North West` (see
  `data/config.js`). Map from `RegionName` where possible, else by
  coordinates. If a club falls outside all six (Free State, Limpopo,
  Northern Cape, North West border areas), **raise it** — the owner needs
  to decide whether to add a region. Don't silently jam it into the
  nearest one.

### Step 4 — merge, verify, update counts

- Append to `C_SOUTHAFRICA` in `data/courses-southafrica.js`, one course
  per line, same formatting as the existing entries.
- Update `SCHEMA.md` line for `C_SOUTHAFRICA` (currently says "19 curated"
  — already stale at 99; set it to the new count).
- Update `scripts/test_data.js` if it asserts a hard SA course count.
- Re-run both check scripts + the in-browser pass.

### 121a acceptance criteria
- [ ] `data/courses-southafrica.js` contains every DotGolf-listed SA club
      with valid coordinates that passes the Step 2 filter, plus the
      existing 99 (curated entries unchanged — `fee`/`arch`/`note`
      preserved).
- [ ] Every new entry has a real lat/lng (no `0,0`), a valid SA `r`
      region (or the club was escalated to the owner), `topSouthAfrica:1`,
      `conf:"est"`, and a phone/`site` where DotGolf supplied one.
- [ ] No new entry carries a fabricated `t100.za` rank or a `fee:{…}`
      object.
- [ ] Multi-course estates: where DotGolf exposes sibling courses, all
      are present; where it doesn't, the gap is listed in the PR for a
      later course-level pass (don't hand-invent siblings here).
- [ ] `node scripts/test_data.js` + `node scripts/check_js.js` pass;
      in-browser SA filter works, pins/clusters render, no console errors.
- [ ] The `--names-file` mode of the script still works unchanged.
- [ ] PR states the before/after SA course count and lists every club
      escalated to the owner (region gaps, ambiguous access, suspected
      non-courses kept in case).
- [ ] Test/scratch `localStorage` cleared before finishing.

---

## Sub-task 121b — UK & Ireland: curation strategy (WRITE-UP, NOT A BULK MERGE)

**Do not run a blind full pass on England / Scotland / Wales / Ireland.**
England alone is 2,000+ clubs; an undifferentiated dump would swamp the
map, bury the Top-100 courses a trip-planner actually wants, and commit us
to maintaining thousands of placeholder fee rows.

After 121a and GOLF-119 (coverage audit) are done, produce a short
**written recommendation** (`docs/project/GOLF-121b-uk-ireland-strategy.md`,
proposal only, like GOLF-101/117) answering:

- **What's the right inclusion bar per nation?** Options to weigh:
  Top-100/ranked lists only (status quo); ranked + every "notable"
  visitor-accessible club; everything with a `TeeBookingUrl` (i.e.
  clubs that actually sell visitor tee times); a distance-from-curated
  threshold ("fill gaps > 40 mi from any existing course"); tiered
  rendering (curated = full pin, bulk = faint dot until zoomed/clicked).
- **How to keep it maintainable** given no green fees come from the API
  and GOLF-120 wants rich fee data — do bulk entries stay `wd`/`we`
  placeholder + `conf:"est"` forever, or is there a "verified" vs
  "listing-only" visible distinction?
- **Multi-course clubs** — is a club-website / Top100GolfCourses
  cross-check pass worth scripting, or hand-done for the ranked clubs only?
- **Rough entry-count and effort estimate** per nation for the
  recommended bar, so the owner can green-light nation by nation as token
  budget allows.

Deliverable is the doc + a recommendation. No data-file changes in 121b.

---

## Sub-task 121c+ — per-nation bulk pulls (LATER, one ticket/branch each)

Once 121b's bar is signed off, each nation is its own branch
(`golf-121c-ireland`, …), same mechanics as 121a but with the agreed
inclusion filter. Ireland (382 clubs, one clean `FindClubs`-style list) is
the natural second after SA; England last (biggest, needs the tightest
filter). Not in scope for this handover beyond noting the sequence.

---

## Out of scope (all sub-tasks)
- Green-fee research / the `fee:{…}` v2 schema — that's **GOLF-120**, and
  it gates the remaining green-fee work. Bulk entries get honest
  placeholders only.
- Course images / logos (separate pipeline, own ticket).
- `nearStation` / rail data for non-GB nations.
- Inventing sibling courses for multi-course clubs that DotGolf doesn't
  itself list — record the gap, don't fabricate.
- Any change to how pins/clusters render (unless 121b's tiered-rendering
  idea is picked up — that would be its own ticket).

## Definition of done (121a)
- SA file grown per the acceptance criteria; curated entries untouched.
- SA fetch script has a working, resumable `--all` mode; `--names-file`
  mode unchanged.
- Both check scripts pass; in-browser SA pass clean.
- `SCHEMA.md` + any hard count in `test_data.js` updated.
- PR notes before/after counts, the filter rules actually applied, and
  every club escalated to the owner.
- Test `localStorage` cleared.

> Inspect the existing codebase and follow established project patterns
> (plain ordered non-module scripts, globals, one course per line in the
> data files, stdlib-only Python, fetch-once → JSON → manual merge) before
> introducing anything new.
