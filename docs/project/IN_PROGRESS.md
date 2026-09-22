# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## In flight — two dev sessions, dispatched 2026-09-22

| Ticket | Session | Scope |
| --- | --- | --- |
| **GOLF-170(a)** | Developer | `tripDayTotal()` (`js/trip-ui.js:207`) returns a currency bucket instead of a scalar; `tbDaySumHTML` (line 244) renders it via the existing `moneyBucketFmt()`. One caller only. **(b) explicitly excluded** — see below. Front-end only, no Worker deploy needed. |
| **GOLF-156** | Developer 2 | Delete the orphaned `heritage-pois` + `pois` Worker modes and their handlers (~223 lines). **Worker change — must re-stamp `WORKER_BUILD`, push, then verify the live `X-Worker-Build` matches `update_worker_build.py --print`.** A green build check is not a deploy. |

Both were told: do not touch the owner's `localStorage`, do not use bare
`git stash` (shared across worktrees), and run all three check scripts.
Dev 2 was told to stay out of `trip-ui.js`/`trip-geo.js` while Dev is in them.

**Report which session finishes first** — the owner will assess token usage
off that before deciding whether to run the GOLF-171 sample batch.

## Waiting on the owner (as of 2026-09-22)

1. **GOLF-170(b) — needed before Dev can continue.** The owner asked for (b)
   to follow (a), but (b) is a product decision that has not been made and the
   row requires it recorded before the code changes. **The question:** does the
   headline "Trip total" show `£320 · €150` like the breakdown directly above
   it, or stay primary-currency-only with the existing disclosure hint?
   `grand=grandBuckets[primaryCur]` (`js/trip-geo.js:544`). **BA recommendation:
   show both** — a total that silently omits a line item visible directly above
   it costs trust in every other figure on the page.
2. **GOLF-171 (London fees)** — whether to run a small sample batch first, to be
   decided after seeing the two dev sessions' token cost. Verified 2026-09-22:
   123 records, 0 `feeV2`, 102 `conf:"est"`, **49 with no number at all** in
   `wd`/`we` — those 49 are the expensive ones.
3. **A domain** — unblocks GOLF-35 Phase B and GOLF-102 Part 2. Three questions
   still unanswered: which registrar (**must be a Cloudflare zone or GOLF-102
   Part 2 stays blocked**), whether buying it implies coming off `noindex`, and
   whether any tester has the PWA installed.
4. **GOLF-165 / DEC-011** — should a deploy still wipe every visitor's trips?
5. **When `noindex` / `Disallow: /` comes off** (GOLF-129) — and note DEC-022
   says a public launch re-opens the Top 100 rankings question (GOLF-160, R-11)
   *before* it ships.

## Also queued

- **Rebuild the project board as a pinnable artifact**, after the devs report.
  Agreed shape: page + small database so rows update without republishing, and
  **each row records how its status was verified** (code read / curl / inherited
  from a row). The previous board was 56 commits stale and wrong about GOLF-143
  (closed by DEC-025), GOLF-118, GOLF-148, GOLF-155 and GOLF-99, and was missing
  GOLF-159 through GOLF-171 entirely.

## Recently corrected on the board (2026-09-22)

- **GOLF-155 is COMPLETE** — verified in code, not inferred: `logUpstreamFailure()`
  (`ors-proxy.js:1115`) wired into all three call sites, `2af5f3e` on `main`, live.
  It had been queued for Dev 2 off a stale board before this was checked.
- **GOLF-171** created — the London fee batch had been tracked under a blank ID
  and marked "DECISION PENDING" when DEC-018 had already decided it.
- **GOLF-157 deliverable 2 parked**, **GOLF-159 re-pointed** to depend on it.

## Standing constraints that survive any handover

- **A git push does not prove a Worker deploy.** Auto-promotion was fixed
  on 2026-09-20 (`06df67a`) and now works, but a green Cloudflare build is
  still not a deploy — it silently failed that way three times in a row.
  Verify with the one-line curl in `docs/deploying.md`.
- **DEC-024** — the Developer session is the sole writer of
  `data/courses-*.js` and `scripts/fetch_*`. Daniel the Dev owns the
  source/terms question and writes docs only.
- **Never re-mint a course `id`, never rebuild a `data/courses-*.js`
  array from a source list.** Rebuilding re-indexes, and an already-shared
  link then renders a different trip with no error.
- **Never fetch from `golf.com.au`** (ToS §6.2(c)), and read a source's
  terms before writing any fetch code — Step 0 of
  `docs/country-onboarding.md`.
- **The BA/PM must not send the permission emails** on GOLF-160. Those are
  the owner's.
- **API keys:** never ask for, see, or commit one. The owner sets them as
  Worker dashboard secrets himself.
- **Clear trip/test `localStorage`** before ending any session that
  touched the live app — **but wait for the owner to say so.** Standing
  instruction, 2026-09-20: *"dont clear immediately i will tell you to."*
  He keeps a live trip loaded between sessions to look at. Ask, or wait to
  be told; do not clear on your own initiative at the end of a turn.
