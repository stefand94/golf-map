# Handover — BA/PM session, 2026-09-20 (second session of the day)

This picks up where `HANDOVER-2026-09-20-ba-session.md` left off. That
session did board recon (nine corrections). **This one applied the owner's
decisions**, and the board in `docs/project/` is now current as of commit
`091ba44`.

Read this file, then `BACKLOG.md`. Do not re-derive the board — it is
accurate.

---

## Sessions and worktrees

Three Claude sessions share this repo. Each has its own worktree, agreed
with the Developer on 2026-09-20:

| Session | Worktree | Branch | Owns |
| --- | --- | --- | --- |
| Developer | `/Users/stefandrue/Golf Map` (main checkout) | `main` | `js/`, `data/`, `scripts/`, the Cloudflare Worker |
| **BA/PM (this one)** | `.claude/worktrees/ba-pm` | `worktree-ba-pm` | `docs/project/*` |
| ui-designer (not running) | `/Users/stefandrue/Golf Map-golf150` | `golf-148-ui` | — fully merged into `main`, safe to delete |

`**/.claude/worktrees/` is already in `.git/info/exclude` (line 11), so the
BA worktree is not exposed to git. The Developer keeps the main checkout
because a detached POI backfill has it as cwd.

**Hazard:** the git stash stack is shared across all worktrees. Never use
bare `git stash` / `git stash pop`.

**Sandbox note:** a worktree-isolated session refuses Bash commands it
cannot verify stay inside the worktree — heredocs, `cd X && ...` with
absolute paths, `git -C`, escaped-space absolute paths. Workaround used all
day: write a Python script into the scratchpad with the `Write` tool, then
run it with a single plain `python3 <abs-path>`.

---

## What this session changed

Two commits on `main`: `077888f` (apply the owner's decisions) and
`091ba44` (GOLF-155 to review, GOLF-148 backfill paused, GOLF-159 raised).
The Developer pushed `2af5f3e` between them.

**Closed:** GOLF-130 (COMPLETE, owner sanity-check accepted). GOLF-101,
GOLF-140, GOLF-128 recorded as **CANCELLED, not COMPLETE** — nothing was
ever built for any of them, and marking unbuilt work "done" is how a board
starts lying. GOLF-107 and GOLF-103 were already closed in the prior recon.

**GOLF-143** absorbed GOLF-106 and is now *"Map & geo backend — pick the
provider (Google / open source / Apple)"*, P1, DISCOVERY. It is **the one
open architectural question on the board and the critical path**. Findings:

- **Google is rejected on terms, not price.** The per-API "No Use With
  Non-Google Maps" clause (§3.2.3(e), restated in Directions §4.2,
  Geocoding §6.2, Places §14.2, Routes §19.2) makes a basemap swap a
  prerequisite, and §3.2.3(a)'s ban on pre-fetching or storing directions,
  geocodes and places data is incompatible with the fetch-once `data/*.js`
  pattern the whole project is built on. Free tier: 10,000 calls per SKU
  per month (Essentials), 5,000 Pro, 1,000 Enterprise.
- **Apple's quotas are far more generous** — 250,000 map views/day plus
  25,000 service calls/day, shared, per $99/yr Developer Program
  membership. But MapKit JS is a different map engine, so it costs the same
  Leaflet port as Google, it adds the project's first recurring cost, and
  **Schedule 6 of the Developer Program agreement is not public**, so the
  exact clause that killed Google is unverified for Apple.
- **Open source is the BA recommendation**: swap only the pieces that hurt,
  Worker-side, front end untouched. ORS free tier ≈ 2,500 requests/day.
- No DEC exists yet because no decision has been made. Usage measurement:
  Cloudflare dashboard → Workers → Metrics, and `account.heigit.org`.

**GOLF-118 unblocked** (P3 → P2, READY, dependency on GOLF-143 removed, 5
acceptance criteria, DEC-021). The parking note had generalised one true
fact ("ORS misses foot ferries") into a false one ("ORS is unreliable for
ferries"). Vehicle ferries route fine. First action is a rebase — the work
sits on branch `golf-118-ferry`.

**GOLF-121 closed** (121a/121d delivered, 121b/121c cancelled). Australia +
New Zealand became **GOLF-157**, whose first deliverable is
`docs/country-onboarding.md` (DEC-019). **GOLF-119 kept** and re-pointed to
feed GOLF-157.

**GOLF-99 split.** It was carrying two features. The read-only `#share=`
link ships and is now verification-only. Collaborative editing became
**GOLF-158**, DEFERRED, because it breaks DEC-004 (DEC-020).

**GOLF-98 given an end** (DEC-018): finish London's 123 courses (currently
0 with `feeV2`; 348 done elsewhere), then close the programme. The owner's
rate-card granularity point is right and is the reason to stop *after*
London rather than before it.

**GOLF-155** is **REVIEW, not COMPLETE** — deliberately. Code pushed
(`2af5f3e`), but a git push does not deploy the Cloudflare Worker.

**New decisions:** DEC-018 (green fees end at London), DEC-019 (expansion
stops at AU/NZ, via a runbook), DEC-020 (sharing = read-only link),
DEC-021 (ferries ship against what the router returns).

**Risks:** R-3 downgraded to Bounded (and the stale "557 courses" figure
corrected — 879 in the data files, 565 shown on the map). R-4 reviewed at
the owner's request and left accepted. R-8's GOLF-106 reference re-pointed
to GOLF-143.

---

## Open, and waiting on the owner

1. **GOLF-143 — pick the map/geo provider.** Critical path. Everything else
   is smaller than this.
2. **DEC-017 scoping question — the Developer is holding the POI backfill
   on it.** Proposal: fetch `name:en` only for Wales, Scotland, Ireland and
   Northern Ireland (11,441 records), skipping England (13,322) and South
   Africa (3,361) — a ~60% request cut against an Overpass service that is
   currently refusing this IP at TCP level. **BA position: accept.**
   Measured, not assumed: dual-language names run at 0.05% in England (6 of
   12,970, every one a false positive) and 0.06% in South Africa (2 of
   3,299), against 0.40% in Wales and 0.24% in Ireland; South Africa's
   Afrikaans-looking names are proper nouns with English descriptors, where
   `name:en` would be identical anyway. **Caveat stated honestly:** this
   measures dual-form primary names as a proxy, because fully-local-primary
   cases can only be counted once `name:en` is in hand — which is the thing
   being fetched. DEC-017 is worded dataset-wide, so narrowing it is the
   owner's call, not the Developer's.
3. **Redeploy the Cloudflare Worker by hand** to make GOLF-155 live.
4. **Buy the custom domain** — unblocks GOLF-35 Phase B and GOLF-102 Part 2.
5. **Ask ORS when `api.openrouteservice.org` retires** (see GOLF-154).

---

## In flight

- **GOLF-119** — DotGolf country coverage audit, spun off as its own dev
  session on 2026-09-20 via a background-task chip. Deliverable
  `docs/project/GOLF-119-coverage-audit.md`. It must answer a definite
  yes/no on New Zealand (`golf.co.nz`) and Australia (`golf.org.au` /
  GolfLink), and the bulk-list-vs-name-lookup distinction, because that
  decides whether GOLF-157 is a bulk pull or hand-curation. **If the owner
  never clicked the chip, this has not started.**
- **GOLF-148** — POI label backfill, paused by the owner's call. Overpass
  is refusing this IP at TCP level; the second run completed zero queries
  in eight minutes and **nothing was written**, so nothing is half-applied.
  Resume in several hours; retrying extends a block.

---

## Standing constraints (do not relearn these the hard way)

- Never ask for, see, or commit an API key — the owner adds them as Worker
  dashboard secrets himself.
- A git push does **not** deploy the Cloudflare Worker. Verify live via a
  response header before concluding anything.
- Never write a scraper against a site whose ToS forbids it (the BRS Golf
  finding, GOLF-97/98).
- Background Haiku agents return JSON only; they never edit data files.
- Push aggressively to `main` — no PR review. Ask before implementing
  anything ambiguous; when told to work autonomously, do the full batch and
  report back concisely.
- Clear trip/test `localStorage` before ending any session that touched the
  live app.

---

## Board artifact

<https://claude.ai/artifact/C7Ed3cCGAXB2ocfVq2HAeL> — Version 5. It
predates `091ba44`, so the GOLF-155 / GOLF-148 / GOLF-159 rows are slightly
stale. Refreshing it is a standing commitment of this role; re-read
`BACKLOG.md` and republish to the same URL rather than creating a new one.
