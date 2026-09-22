# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## In flight

### GOLF-171 — `feeV2` green fees, London (the last batch)

Brief: `HANDOVER-GOLF-171-london-fees.md`. Dispatched 2026-09-22.

- **Wave A** — 74 courses that already have a number in `wd`/`we` to verify. 5 agents.
- **Wave B** — the 49 with no figure at all ("Ask club" / "Members only"). 4 agents.
- Research fans out; writing does not. Agents return JSON to the scratchpad and
  touch no repo file. One merging session patches `data/courses-london.js`
  **in place by `id`** (GOLF-163 — never rebuild the array).

**Acceptance:** all 123 London courses carry a `feeV2`; every `poa` entry has
`seasons:[]`; every other entry has a real `amount` and a `source` URL that was
actually read; `test_data.js` still counts 879 and `test_course_ids.js` passes.

## In review

Nothing.

## Waiting on the owner

See `HANDOVER-2026-09-22-ba-session-4.md` §"Waiting on the owner".
