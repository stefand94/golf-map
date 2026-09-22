# Handover — BA/PM session, 2026-09-22

Picks up from `HANDOVER-2026-09-20-ba-session-3.md`. The board in
`docs/project/` is current as of this commit — read it, don't re-derive it.

**How the owner wants you to talk to him: short, plain English.** He said
so directly. Lead with the answer. Detail goes in `docs/project/`, not chat.

## What happened today

| Ticket | Outcome |
| --- | --- |
| GOLF-170(a) | Done (`0e35241`). Day header shows `£414 · €1000`, not `£1414` |
| GOLF-156 | Done (`dbd7c12`). Dead POI modes removed from the Worker |
| GOLF-172 (P0) | Done. Directions were down since GOLF-118 shipped on 20 Sep: `extra_info` value was `'waytypes'`, should be `'waytype'`. Ferry detection kept and proven live (Arran leg: `hasFerry true`) |
| GOLF-173 | **REVIEW.** Hotel currency now follows the hotel's location, using the nearest course — see below |
| GOLF-174 | **REVIEW.** Built (`acbbb81`) in a separate session the owner started. Mixed currencies shown as mixed everywhere (DEC-026). Absorbs GOLF-170(b) |
| DEC-026 | Owner: show mixed currencies as mixed everywhere; the app never converts |

The Worker now returns the upstream error body (API keys redacted), so the
next outage explains itself without a trip to the Cloudflare dashboard.

## Needs checking first

- **GOLF-174** landed (`acbbb81`) at the end of this session, built in the
  owner's own session — **not yet checked by the BA.** Before marking it
  COMPLETE, open the app and check: a single-currency trip looks exactly
  as it did before; no figure anywhere puts `£` on a sum of mixed
  currencies; the primary-currency hint line is gone.
  - One part of DEC-026 was inferred, not stated: **per person = divide
    each currency separately** (`£692 · €760 per person`). Confirm with
    the owner.
  - Dev evidence since this was written: all five check scripts pass and
    the dev session checked mixed, single-currency, empty and shared
    (375px) trips in a browser. The owner said he'd check the live site
    himself — that plus the per-person answer is what's left.
  - Two side findings from that session are now GOLF-175 (dead cost code)
    and GOLF-176 (Worker 502s).

## Waiting on the owner

1. **GOLF-173 sign-off.** There's no coordinate→country lookup in the app,
   so a stay takes the currency of its nearest course. This gets Northern
   Ireland right (£), but a stay within a few miles of the border can land
   on the wrong side — Newry comes out in €. Is that acceptable? (BA view: yes.)
2. **GOLF-171 (London fees)** — does he want a small sample batch first?
   He was going to judge that from the dev sessions' token cost. Today's
   figures: 75k (170a), 99k (156), 96k (172), 109k (173).
3. **Domain** — unblocks GOLF-35 Phase B and GOLF-102 Part 2. Still open:
   which registrar (it must be a Cloudflare zone), does buying it mean
   coming off `noindex`, and has any tester installed the PWA.
4. **GOLF-165 / DEC-011** — should a deploy still wipe every visitor's trips?
5. **When `noindex` comes off** (GOLF-129). Decide this together with the
   domain. DEC-022 says the Top 100 rankings question (GOLF-160) has to be
   settled again before any public launch.

## The board artifact

**https://claude.ai/artifact/StWh629BKonxmrENCjrGNP** — the owner's pinnable
board. The page itself holds the data, so to change a row you edit the page
and republish it to the same URL (read it first with `Artifact` action
`read`). The `db` capability is declared but never seeded; the page ignores
it while it's empty. The table's last column says whether a row was checked
directly or just copied from another row — keep that honest. Current as of `136e552`. Update
the sync stamp every time you republish.

## Lessons from today

- **A matching build hash only tells you which code is live, not whether
  that code works.** GOLF-118 was signed off on a hash match and had never
  worked. Test the actual feature with a real request.
- **Check a dev's report yourself before passing it on.** Today that caught
  nothing wrong, but it's the rule.
- **Don't let two sessions work the same files.** A `git commit -a` in the
  GOLF-172 session picked up GOLF-173's edits, so git history now credits that
  work to the wrong ticket (`55f44b1`). Tell devs to stage the files they
  changed by name.
- **Don't leave the queue empty while you wait for an owner decision.** The owner
  noticed no devs were working before I did.

## Standing constraints (unchanged — full wording in session-3 handover §"Standing constraints")

Don't clear the owner's `localStorage` until he says so · never ask for or
commit an API key · don't send the GOLF-160 permission emails · never re-mint
a course `id` or rebuild a `data/courses-*.js` array · never fetch from
`golf.com.au` · no bare `git stash` · DEC-024: only the Developer writes
`data/courses-*.js` and `scripts/fetch_*` · push straight to `main` · ask
before building anything ambiguous.
