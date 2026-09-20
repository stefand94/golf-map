# Handover — BA/PM session, 2026-09-20 (third session of the day)

Picks up from `HANDOVER-2026-09-20-ba-session-2.md`. That session applied
the owner's decisions. **This one closed the work out.** The board in
`docs/project/` is current — read it, do not re-derive it.

**One-line state: nothing is in flight, nothing is blocked on a developer,
and four things are waiting on the owner.**

---

## 1. What closed in this session

| Ticket | Outcome |
| --- | --- |
| GOLF-118 ferry legs | **COMPLETE and live.** Merged `d77764d`; Worker verified live |
| GOLF-148 POIs | **COMPLETE.** `69d1e4b` + `6466bd7` — the DEC-017 English relabel was the last piece |
| GOLF-157 deliverable 1 | **COMPLETE.** `docs/country-onboarding.md` (`0254b10`) |
| GOLF-164 | Root cause of the Worker deploy failures found and recorded |
| GOLF-168 | **CANCELLED** — owner's call, working as designed |
| GOLF-166 | Settled as latent, P3, no observable effect |
| GOLF-169 | **RAISED** — currency is sniffed from the fee string |
| GOLF-170 | **RAISED** — day header sums across currencies |

## 2. What the owner actually needs next

**Do not open new work to fill the empty queue.** The owner's stated intent
on 2026-09-20 was to *"wrap things up and potentially get a domain sorted
out soon"*, and he twice pushed back on being sidetracked. The queue is
empty on purpose.

Four items, all his, none blocked on a developer:

1. **A domain.** Unblocks GOLF-35 Phase B and GOLF-102 Part 2. This is the
   critical path for everything labelled "pre-go-live".
2. **GOLF-170(b)** — is a headline trip total that silently *excludes*
   non-primary-currency items acceptable, given it is disclosed by a hint
   line underneath? (170(a) is a plain defect and needs no decision.)
3. **GOLF-165 / DEC-011** — should a deploy still wipe every visitor's
   saved trips, now that id migration exists and makes the blunt wipe
   unnecessary?
4. **When `noindex` / `Disallow: /` comes off** (GOLF-129).

If he asks "what next?", the answer is the domain, and the honest
supporting point is that GOLF-169/170 are both small and can be done
whenever — they do not gate a launch, they gate *Australia*.

## 3. Two defects raised this session, and why they are separate

Both were found by reading code rather than reasoning about it. They look
like one topic and are not.

- **GOLF-169** — `courseCurrency()` (`js/util.js:198`) infers the currency
  by regex-matching the green-fee *string* for `EUR`/`GBP`/`ZAR` symbols
  and **defaults to GBP**. Any dollar nation renders every price in the app
  as pounds. Widening the regex cannot fix it, because AUD and NZD share
  `$`. **Must land before AU/NZ fee data is merged**, not after — merge
  first and the data looks right in the file and wrong on screen.
- **GOLF-170** — pre-dates all of that. (a) `tripDayTotal()`
  (`js/trip-ui.js:207`) is a flat reduce with no currency awareness, so a
  GB+Ireland border-crossing day renders a cross-currency sum labelled with
  the majority currency. (b) `grand=grandBuckets[primaryCur]`
  (`js/trip-geo.js:544`) *excludes* non-primary items from the headline
  total and per-person figure — right arithmetic, incomplete total.

The trip-level bucket model itself (`moneyBucketAdd`/`moneyBucketFmt`) is
**sound** and neither ticket is a regression of it. Do not scope it in.

## 4. The Cloudflare Worker deploy story — now settled, still verify

Three distinct silent failures, in order: (1) Git integration not firing at
all; (2) **built but never promoted** — three consecutive green builds
uploaded versions production never served, so it ran pre-GOLF-164 code
behind three green checks; (3) a wrong build-root comment that sent two
sessions looking in the wrong place.

Fixed `06df67a`; auto-promotion verified working (`X-Worker-Build` moved
unaided to `79b92ca9b7`). **The verify rule does not relax** — a green
build is not a deploy. One curl, in `docs/deploying.md`.

## 5. The methodological lesson, four instances in one day

Every one of these was a *cheap, plausible, confidently-wrong* signal
standing in for the expensive check that actually answers the question:

| Cheap signal | What it said | Truth |
| --- | --- | --- |
| 564 diff lines containing `id:` | ids were re-minted | 337 id *values* byte-identical; records are single-line, so any edit rewrites the `id:` too |
| A 406 from a guessed URL | satop100courses blocks bots | robots.txt is allow-all; it serves 200 to bare curl |
| "Golf Digest" on an NZ Top 50 | US Golf Digest owns it | *Australian* Golf Digest (CMMA) — different company, different terms |
| "presumably sums them today" | mixed-currency totals were broken | Trip model was *better* than assumed; the day header was *worse* |

**Read the context, never the count.** Two of these were caught only
because someone re-checked their own finished work against the ticket
rather than against their memory of it.

## 6. Sessions, worktrees and hazards

Unchanged from session 2, except the ui-designer worktree
(`golf-148-ui`) is fully merged and safe to delete.

- **The git stash stack is shared across worktrees.** Never use bare
  `git stash` / `git stash pop` when another session may be mid-work.
- **DEC-024** — the Developer session is the sole writer of
  `data/courses-*.js` and `scripts/fetch_*`.
- **`docs/deploying.md` had uncommitted working-tree edits** at the time
  of writing, authored by the Developer session. If it looks half-finished,
  that is why — check with them before editing it.

## 7. Known trap for a future reader: the GOLF-158 ID collision

Commit `69d1e4b` is titled *"GOLF-158: relabel POIs to name:en"*, and
several session notes mention a "GOLF-158 Overpass block window".
**That work is GOLF-148.** GOLF-158 is, and has only ever been,
collaborative trips — deferred, no code. The commit message is on `main`
and shared, so it cannot be rewritten; the correction lives on the
GOLF-158 backlog row instead. Anyone grepping history for GOLF-158 will
land on POI work that is not that ticket.

## 8. Standing constraints

- The BA/PM **must not send the GOLF-160 permission emails.** Owner's.
- Never ask for, see, or commit an **API key** — he sets them as Worker
  dashboard secrets himself.
- Never **re-mint a course `id`** or rebuild a `data/courses-*.js` array
  from a source list. Rebuilding re-indexes and silently breaks every
  already-shared link.
- Never fetch from **`golf.com.au`** (ToS §6.2(c)). Read a source's terms
  before writing fetch code — Step 0 of `docs/country-onboarding.md`.
- **Do not clear the owner's trip/test `localStorage` unprompted.** New
  instruction 2026-09-20: *"dont clear immediately i will tell you to."*
  He keeps a live trip loaded between sessions. Offer; wait to be told.
- **Push aggressively to `main`.** No PR review needed for docs.
- **Ask before implementing anything ambiguous.**
