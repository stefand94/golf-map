# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## Nothing is actively being built (as of 2026-09-20)

Both coding sessions reported clear and **nothing is waiting on either of
them.** Everything that was in flight through 2026-09-19/20 has landed on
`main` and been verified:

| Was in flight | Landed | Verified by |
| --- | --- | --- |
| GOLF-163 stable course ids | `144d4ae` | `test_course_ids.js` — 879 distinct ids, order matches baseline |
| GOLF-164 Worker build marker | `49711cb` | `X-Worker-Build` present live |
| GOLF-161 OSM coordinates | `fd9732b` | 282 coords moved, ids untouched, all suites green |
| GOLF-118 ferry legs | `d77764d` | `X-Worker-Build: 79b92ca9b7` live |
| GOLF-148 POIs (incl. the DEC-017 relabel) | `69d1e4b` + `6466bd7` | 27,436 records; `pois-southafrica.js` byte-identical |
| GOLF-157 deliverable 1 (runbook) | `0254b10` | `docs/country-onboarding.md`, Steps 0–6 |

**The queue is empty by design, not by accident.** The owner's stated
intent on 2026-09-20 was to *"wrap things up and potentially get a domain
sorted out soon"*, so work was deliberately converged rather than extended.
Do not start something new to fill the gap — read **§ "What the owner
actually needs next"** in `HANDOVER-2026-09-20-ba-session-3.md` first.

## The only things that move the project forward now are the owner's

None of these are blocked on a developer; all four are decisions or
purchases only he can make. They are listed with the reasoning in the
handover doc.

1. **GOLF-170(b)** — is a trip total that silently excludes non-primary
   currencies acceptable, given it is disclosed by a hint line? (170(a),
   the day-header cross-currency sum, is a plain defect and needs no
   decision.)
2. **GOLF-165 / DEC-011** — should a deploy still wipe every visitor's
   saved trips now that migration exists?
3. **A domain** — unblocks GOLF-35 Phase B and GOLF-102 Part 2.
4. **When `noindex` / `Disallow: /` comes off** (GOLF-129).

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
