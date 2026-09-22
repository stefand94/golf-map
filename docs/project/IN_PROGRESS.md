# In progress

_Features a coding agent is actively implementing. Move here from BACKLOG.md
when work starts; move to "Recently completed" in BACKLOG.md when done and
verified._

## In flight

### GOLF-169 — currency from the course, not from its fee text

Brief: `HANDOVER-GOLF-169-currency.md`. Dispatched 2026-09-22. Blocks GOLF-157
(AU/NZ) and must land before any AU/NZ fee data is merged.

Two parts, and the second is the one the original row missed: `courseCurrency()`
regex-matches the fee string, **and** the money buckets are keyed by the symbol,
so two dollar nations would silently sum into one total. `feeV2.currency` is
populated everywhere as of GOLF-171; DEC-026 already settles what a mixed total
does.

**Acceptance:** GB/Ireland/South Africa render identically to today (the main
risk — 879 courses); a dollar nation renders its own currency; a two-dollar-nation
trip never sums; all four check scripts pass.

## In review

Nothing.

## Waiting on the owner

See `HANDOVER-2026-09-22-ba-session-4.md` §"Waiting on the owner".
