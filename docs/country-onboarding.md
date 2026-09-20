# Adding a new country to the map

A runbook for GOLF-157 and anything after it. Written from what GOLF-119
actually found doing this for New Zealand and Australia, so the worked
examples are real rather than illustrative.

---

## Step 0 — Check the source's terms before you write any fetch code

This is step zero and not step three because it is the step that can
**cancel the whole country**. Writing the fetcher first and reading the
terms afterwards means, in the bad case, throwing the fetcher away; it
also means you have already hit a host you had no right to hit.

The rule this project runs on, established under GOLF-97/98 (BRS Golf) and
not negotiable:

> **Never write a scraper against a site whose terms of service forbid it.**
> If a source's ToS forbids automated access, that *is* the finding.
> "We may not use this" is a valid and useful result.

For each source, in this order:

1. **`robots.txt`.** Read it. Note that an empty file (0 bytes) means
   nothing is disallowed, and a 404 means there is no file — these are not
   the same as a `Disallow: /`. Distinguish rules aimed at training
   crawlers (`ClaudeBot`, `GPTBot`) from rules aimed at user-initiated
   fetches (`Claude-User`, `ChatGPT-User`) — they are frequently different
   and it is easy to overstate a block that does not apply.
2. **The terms page.** If the footer has no terms link, probe the usual
   paths (`/terms`, `/terms-and-conditions`, `/terms-of-use`, `/legal`,
   `/copyright`, `/disclaimer`) before concluding there is none.
3. **Search the terms for the clauses that actually matter**, not just the
   word "copyright": `scrape`, `bot`, `automated`, `crawl`, `spider`,
   `retrieval system`, `republish`, `redistribute`, `derivative`,
   `commercial`, `personal use`, `database`.
4. **Record what you found, verbatim, with the clause number.** A
   paraphrase is not auditable six months later.

Three outcomes, and only three:

| Finding | What it means | Do |
|---|---|---|
| Explicit anti-automation clause | Hard bar | **Stop.** Record it. Find another source. |
| Republication / "retrieval system" clause | Depends what you publish | Fetch may be fine, *publishing the field* may not. Escalate before building. |
| No terms page at all | Not a bar — but **not permission either** | Proceed, attribute, and expect this to be revisited |

Two traps worth naming, because both have already caught this project:

- **"No terms page" is not consent.** Several sources with no terms still
  block non-browser clients at the edge (406/403). That block is itself a
  statement of intent. Record it and respect it.
- **Edge blocking is a finding, not an obstacle.** If a host 403s every
  non-browser request, that is the answer. Do not route around it, do not
  defeat a bot challenge, do not "just use a browser instead" to get the
  same bulk data you were refused over HTTP.

### Two sources, two separate questions

A country needs **two** things, and they almost never come from the same
organisation or carry the same terms:

- **The club list** — usually the national governing body. Facts:
  name, coordinates, holes, website. Weak copyright position (facts are
  not copyrightable), so the main constraint is the body's own terms.
- **The ranking** — usually a magazine or a specialist site. This is
  *selection and arrangement*, which **is** protected, and the "it's only
  facts" argument does not transfer to it.

Do step 0 separately for each. Getting a clean club list tells you nothing
about whether you may publish a ranking position next to it.

And note a third possibility, which is what **DEC-023** settled for
England and Scotland: where a body's terms bar republication but the
*facts* are available elsewhere, use the governing body's list purely as
an **index of which clubs exist** and take the published coordinates from
**OpenStreetMap** (ODbL — attribution required). The project already runs
an OSM correction pass, built in GOLF-121a, so this is usually the
cheapest way past a republication clause. It does **not** help with a
ranking, which has no equivalent free source.

---

## Step 1 — The worked example of a country that fails at step 0: Australia

Australia is the reason this document opens the way it does. It fails at
step zero, **twice, for two unrelated reasons**, and neither is visible
from the data:

**The club list.** Golf Australia (`golf.org.au` → `golf.com.au`) runs the
same DotGolf platform as England, Scotland, Wales, Ireland, South Africa
and New Zealand. The endpoint exists. It returns 1841 venues. It would
have taken about twenty minutes. But:

- ToS **§6.2(c)** forbids "scraping tools, bots, or other automated
  methods".
- Cloudflare 403s every non-browser request site-wide, including static
  pages.
- And, separately, `Latitude` is `null` on every single row — so even
  granting permission, the bulk response does not contain the one field
  the map needs.

**The ranking.** The AU Top 100 spine is Golf Australia Magazine,
published by nextmedia, whose terms (§3.2/3.3) claim copyright in the
"selection, coordination, arrangement and enhancement" of its content and
forbid copying, redistributing, publishing or displaying it. That is the
exact shape of a Top 100 list.

Two different organisations, two different bars, one country. Had the
fetcher been written first, all of it would have been wasted work — and
the ToS breach would already have happened by the time anyone read §6.2(c).

**Contrast: New Zealand passes.** Same platform, no auth, no key, no
`robots.txt`, no bot protection, 424 clubs with coordinates on all of
them, and a domestic ranking (NZ Golf Magazine's Top 40) with no terms
page at all. The difference between the two countries was fifteen minutes
of reading, not anything about the data.

Full detail for both, with clause numbers and probe results, is in
`docs/project/GOLF-119-coverage-audit.md` §3 and §9.

---

## Step 2 — Fetch once, to a JSON intermediate

Established project pattern; do not deviate from it.

1. One script under `scripts/`, run **once**, writing raw JSON to
   `scripts/output/` (which is gitignored).
2. **Never** have a fetch script write `data/courses-*.js` directly. The
   intermediate is what gets reviewed, diffed and re-merged when the merge
   turns out to be wrong — and it means a mistake costs a re-merge rather
   than a re-fetch.
3. Be gentle: a handful of requests, spaced. If a bulk endpoint exists,
   use it — one request for 424 clubs is kinder than 424 requests for one
   club each. (All four existing GB/Ireland scripts still go name-by-name
   unnecessarily; see GOLF-119 §1.)
4. If large-batch research is needed, background agents return **JSON
   only** and never edit data files — this avoids concurrent-write
   conflicts. Merge by hand or with a small script afterwards.

Per **DEC-024**, `data/courses-*.js` and `scripts/fetch_*` have a single
owner. Check who that is before writing either.

---

## Step 3 — Patch in place. Never rebuild the array, never re-mint an id

**This is the one that can break saved user data, and it is not obvious
from reading the data files.**

Since GOLF-163 (shipped 2026-09-20) a course's identity is its **`id`** —
a slug of the name plus four hex characters, e.g. `royal-birkdale-8c21` —
and **not** its position in `C[]`. That id is **frozen on creation and
never re-derived**: it is data, not a function of the name and
coordinates. GOLF-161 moves coordinates and a future pass may correct
names; neither may change identity.

Runtime code still speaks indices — `TRIP`, `tripSeq`, `tripDays[].items[].i`
and `EDITS` keys are all indices, and none of that changed. The
translation to ids happens only at the two boundaries where a reference
**outlives the array**: `localStorage` (encoded by `saveState()`, decoded
by `loadStoredState()`) and `#share=` links (golf items carry `c:"<id>"`
instead of `i:<index>`). Both accept the old numeric form for ever,
resolved through the frozen `COURSE_IDS_V1` table in
`data/course-ids.js`. See `js/course-id.js` and SCHEMA.md.

**What that does and does not buy you.** A reorder no longer silently
rewrites someone's saved trip or an already-issued share link — that was
R-10, and GOLF-163 closed it. What remains is narrow, and it is absolute:

1. **Never regenerate `data/course-ids.js`.** It is not a description of
   the current ordering and is not meant to track it. It is the only
   record of what an index *meant* in every link and saved trip created
   before ids shipped. Regenerate it after a reorder and those links
   decode to the wrong courses — silently, which is the exact failure the
   table exists to prevent. It must never lose entries.
2. **Never re-mint an id for an existing course.**
   `scripts/add_course_ids.py` preserves any id it finds and mints only
   for records that have none. Keep that property. Re-deriving ids from
   the name and coordinates would reissue new identities for courses
   whose names or coordinates have since been corrected — breaking every
   stored reference even though nothing was reordered.
3. **Patch records in place; never rebuild the array from a source
   list.** This is the rule in CLAUDE.md and it is the one a merge script
   is most likely to violate by accident, because rebuilding is the
   natural way to write one. A rebuild re-indexes *and* drops ids.
4. **Appending is still the safe operation**, and removing is still
   unsafe — a dropped record takes its id with it, and every reference to
   it, legacy or current, now resolves to nothing.

Rules for a merge, then:

1. New country → **new file**, `data/courses-<country>.js`, appended to
   the load order, ids minted once by `scripts/add_course_ids.py`. This
   is inherently safe and is why adding a country is cheap while
   re-sourcing an existing one is not. New courses have no legacy index
   to resolve, so they need no entry in the frozen table.
2. Re-sourcing fields on an **existing** country → change values **in
   place**, in the `merge_course_stats.py` line-by-line style. Record
   count, array order and every `id` unchanged.
3. A course that fails to match the new source **keeps its existing
   coordinate and is flagged, never removed**.
4. Carry structured fee data (`feeV2`, GOLF-97/98/120) across untouched.
   The 184 records carrying hand-researched `fee:{}` are **not
   re-derivable from any API** — DotGolf carries no green fees at all.
   The only way to destroy that work is to scope a re-sourcing job as a
   rebuild, which is why it is never described as a "redo".

Acceptance criterion for any merge touching an existing file: **record
count, order and ids unchanged**; `node scripts/test_data.js` reports the
same totals as before; `node scripts/test_course_ids.js` passes.

---

## Step 4 — Decide what shows on the map, separately from what is ranked

A bulk pull returns every affiliated club, which is far more than belongs
on a trip-planning map. South Africa's pull returned 447; 107 carrying
`zaRanked:1` are shown, and `courseShownOnMap()` (`js/explore.js`)
ringfences the rest. The other 314 stay in the data file, recoverable,
ready for a future "show all" toggle. That is the pattern to copy.

But **do not assume ranking is the right inclusion rule for every
country** — check that the country actually has a ranking deep enough to
carry it. New Zealand is the counter-example: 424 clubs, and the largest
ranking we may lawfully use is **40**. A 40-pin country is a thin map.
Where the ranking is too shallow, use a non-ranking inclusion rule (e.g.
all 18-hole clubs) and let the `*Ranked:1` flag mark only the ranked
subset — decoupling "on the map" from "ranked".

Deciding this *before* the merge is much cheaper than after, because
changing the inclusion rule later means editing records in place under the
step-3 rules rather than just choosing a different filter.

---

## Step 5 — Verify

```bash
node scripts/test_data.js        # data-file integrity + course counts
node scripts/check_js.js         # modules parse + HTML load order
node scripts/test_course_ids.js  # ids unique, array order unmoved
```

`test_data.js` checks data-file integrity and course counts — read the
counts, don't just check it exits 0. `check_js.js` confirms all modules
parse and the HTML load order matches, which is what catches a new data
file added to the directory but not to `london-golf-map-v5_1.html`.

`test_course_ids.js` is the step-3 regression test and the one that
matters most here: it asserts ids are unique and, in the test that
actually earns its keep, **deliberately reverses `C[]` and checks that
references written against the original order still resolve to the
original courses**. If a merge script has rebuilt the array or re-minted
ids, this is what catches it.

Then in-browser: console errors, and `undefined` in rendered popups.
`TESTING.md` is the short checklist.

Known data gotchas worth a pre-merge check, all of them real:

- **Bad coordinates.** NZ had two (`The Green Pinnacle` at latitude
  −83.05, i.e. Antarctica; `The Morgans – Pauatahanui` sign-flipped to
  +41.08). Sanity-check every coordinate against the country's bounding
  box before merging — one course in Antarctica ruins the map's auto-zoom.
- **Nulls in bulk rows that are populated in per-club rows.** NZ bulk rows
  have `RegionName` null, `NoOfHoles` 0 and `Website` empty.
- **Names differing between endpoints.** Join on the numeric club id, never
  on the name. Fuzzy name matching has already mis-picked "Royal Co Down
  Ladies GC" (30205) over the real Royal County Down (30204).
- **Famous courses simply absent** from a national directory, because they
  are not affiliated — Swinley Forest, Castle Stuart and Old Head are all
  missing. Absence from the governing body's list is not evidence the
  course does not exist.

---

## Quick reference: what GOLF-119 found

| Country | Club list | Ranking | Status |
|---|---|---|---|
| England, Scotland, Wales, Ireland, South Africa | DotGolf, bulk | shipped | live |
| **New Zealand** | **DotGolf, 424 w/ coords, clean** | **NZ Golf Mag Top 40, no terms page** | **go** |
| **Australia** | **ToS §6.2(c) + no coords** | **nextmedia, arrangement copyright** | **blocked** |
| USA, Canada, Europe, Asia | no DotGolf tenant — all bespoke | — | per-country work |

Detail, clause numbers and probe method: `docs/project/GOLF-119-coverage-audit.md`.
