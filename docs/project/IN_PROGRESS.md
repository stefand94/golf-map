# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## GOLF-98 — Real green-fee data entry (ongoing data job)

**Status:** PAUSED pending GOLF-120 v2 schema sign-off · **Priority:** P2

> 2026-09-10: `fee` v1 continuation is on hold. GOLF-120 Phase 1 proposal
> (`docs/project/GOLF-120-schema-v2-proposal.md`) + a 126-course batch-1
> research pass (`GOLF-120-fees-batch1.json`) are done and awaiting owner
> sign-off. Once the `feeV2` shape is locked, GOLF-98 resumes *as* the v2
> re-research programme (Top 100 included). Everything below describes the
> superseded v1 flow.

Migrate course green fees from legacy free-text `wd`/`we` strings to the
structured `fee:{weekday,weekend,weekendTwilight?,confidence,lastVerified}`
object (schema = GOLF-97, already live).

- Furthest-along file: `data/courses-top100.js`.
- Pattern: background Haiku agents each research a batch and return a JSON
  array of `{n, fee:{…}}` — they **never edit data files** (avoids
  concurrent-write conflicts). Merge by hand / small script, then verify:
  `node scripts/test_data.js`, spot-check figures, `popupHTML()` sweep.
- Batch order: England Top 100 (in progress) → Scotland → Ireland →
  South Africa → Wales → London.

**Acceptance:** every targeted course has a well-formed `fee` object that
passes `test_data.js`; no popup renders `undefined`; sampled figures match a
real published rate with `lastVerified` set.

## GOLF-96 — Map-based hotel picker ("Add a stay")

**Status:** REVIEW (app code shipped) · **Priority:** P2

App side done. **Blocked on:** manual redeploy of the Cloudflare Worker's
`hotels` mode via the Cloudflare dashboard before it works live. Verify with
a direct `curl` against the Worker.
