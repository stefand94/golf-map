# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## In flight

### GOLF-175 — delete the dead cost code

Dispatched 2026-09-22, straight after GOLF-169 landed in the same file.
`tripCostSummary()` and `tripCostEstimateByDay()` have no callers and still
compute a single-currency grand total — the exact thing DEC-026 removed.

**Acceptance:** both gone, nothing deleted that is still referenced (including
inline `onclick=` handlers — this site runs on global scope), Costs tab renders
identically, all five check scripts pass.

## In review

Nothing.

## Waiting on the owner

See `HANDOVER-2026-09-22-ba-session-4.md` §"Waiting on the owner".
