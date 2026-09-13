# Implementation Task — GOLF-132 (Clear every visitor's trip on every deploy)

**Feature:** GOLF-132 — Wipe saved trip state for every visitor on every
deploy, not just the owner's own testing.

## Objective

Right now a visitor's trip (`trips`/`activeTripId` in `localStorage`)
persists indefinitely across visits. The owner wants every deploy to
`main` to force a clean slate for everyone — including real testers —
so stale/leftover state (from either real use or a coding session's own
testing directly against production) never quietly lingers.

## Context

- Trigger: a coding session testing GOLF-130 against the live production
  URL left a stray trip behind in the owner's own browser, and it kept
  reappearing on reopen. See `docs/project/BACKLOG.md` "always clear
  test state before ending a session" — that convention exists for
  exactly this, and got missed this time.
- This is now a **deliberate, recorded product decision**, not a
  one-off cleanup — see **DEC-011** in `docs/project/DECISIONS.md`. Read
  it before implementing: two safer alternatives (owner-only auto-clear;
  a non-destructive "app updated" notice instead of deleting data) were
  raised directly with the owner and explicitly rejected. **Do not
  substitute either of those** — the owner wants every visitor's data
  gone on every deploy, confirmed after the trade-off was spelled out.
- `sw.js`'s `CACHE_NAME` is already a content hash of every precached
  file (`js/*.js`, `data/*.js`, the HTML shell — see
  `scripts/update_sw_cache_version.py`'s docstring) and already changes
  automatically on essentially any real deploy, code or data. This is
  very likely your cheapest, already-correct "has the app changed since
  last visit" signal — see Implementation Guidance before building a
  second, separate versioning mechanism.
- `tripStartFresh()` (`js/trip-model.js`) already contains the exact
  reset logic this needs (rebuild `trips` to one empty default trip,
  `saveState()`) — reuse it or its core, minus the `confirm()` dialog
  and the `render()`/`setAppMode()` calls that assume a running app; this
  needs to fire once at boot, before the normal state-load/render path.

## Requirements

1. On app load, determine whether the current deploy differs from the
   deploy the visitor last had loaded. Persist whatever identifier you
   use for "last known deploy" in `localStorage` alongside the trip data.
2. If it differs (or no prior identifier is stored — including a
   visitor's very first load after this ships): clear all saved trip
   state (same effect as `tripStartFresh()`'s reset, no confirmation
   dialog — this must be silent and automatic) **before** the app
   renders any existing trip, then store the new identifier so the same
   deploy doesn't re-clear on the visitor's next load.
3. If it matches: do nothing — trips persist exactly as they do today.
4. If the app cannot determine the current deploy identifier for any
   reason (e.g. a fetch fails), **fail closed — do not clear.** Losing
   data on a false positive is worse than occasionally missing a real
   version change.
5. Update the Beta-notice panel copy (`tbBetaBadgeHTML()`, `js/trip-ui.js`,
   shipped in GOLF-129) — the existing bullet "Trips are saved only in
   this browser (no account, no sync)" is no longer the whole picture.
   Add a short clause that an app update also resets saved trips. Keep
   it brief and match the existing bullet's tone; this is a wording
   addition, not a rewrite of the other three bullets.

## Acceptance Criteria

- [ ] Given a visitor with a saved trip, when a new deploy ships (any
      precached file changes) and they reload, then their trip state is
      gone and the app shows the same empty state as a first-time visit
      — no confirmation prompt, no error.
- [ ] Given a visitor with a saved trip, when they reload **without** a
      new deploy having shipped since their last visit, then their trip
      is unchanged.
- [ ] Given the very first load after this feature itself ships, every
      existing visitor's trip is cleared once (expected, not a bug —
      this ships as a deploy like any other).
- [ ] Given the app cannot read the current deploy identifier (e.g.
      offline on first load, fetch failure), then existing trip data is
      left untouched rather than cleared.
- [ ] The Beta panel now mentions that an app update resets saved trips,
      alongside the existing "this browser only" bullet.
- [ ] `node scripts/test_data.js` and `node scripts/check_js.js` pass.
- [ ] No regression to `tripStartFresh()` itself (the manual "Start
      fresh" trip-menu action) — this feature is a separate, automatic
      trigger, not a replacement for it.

## Edge Cases

- PWA installed app: GOLF-122 already made navigation network-first, so
  a returning installed-app visitor gets the fresh shell on their next
  online load same as a browser tab — the version check should behave
  identically there, no special-casing needed.
- A visitor who is mid-edit (has the app open in a background/inactive
  tab) when a deploy ships: only clear on an actual load/reload of the
  app, never retroactively against an already-open session that hasn't
  reloaded.
- Don't clear anything else that might live in `localStorage` beyond
  trip state (if there is any) unless it's part of the existing
  `tripStartFresh()` reset already — keep this scoped to trips.

## Dependencies

- DEC-011 (the product decision this implements — read it first).
- Builds on GOLF-129's Beta-notice panel (copy addition).

## Out of Scope

- Any migration of old trip data forward across a deploy — this is a
  hard clear, not a schema migration. (GOLF-98/GOLF-120's `feeV2` work
  already handles data-file versioning separately; unrelated.)
- A visible "your trip was reset because the app updated" notice — the
  owner confirmed a silent clear, not a notice (see DEC-011's rejected
  alternatives).
- Per-visitor opt-out or a "keep my trip anyway" control.

## Constraints

- No build step, no framework, no bundler — same as always.
- Don't build a second, independent version-tracking mechanism if
  `sw.js`'s existing `CACHE_NAME` (already auto-maintained by
  `scripts/update_sw_cache_version.py`) can be read/reused for this —
  avoid two sources of truth for "what deploy is this."

## Implementation Guidance

- `CACHE_NAME` is a `const` scoped inside `sw.js` (a separate worker
  script, not in the page's own global scope) — the page can't read it
  directly by just referencing a variable. Two reasonable ways to get at
  it without inventing a new versioning scheme: have the page fetch
  `sw.js` itself and read the constant out of it (simple, but an extra
  network request, and needs a sensible fallback per requirement 4 above
  if that fetch fails); or extend `scripts/update_sw_cache_version.py`
  to also stamp the same hash into one small page-visible location (e.g.
  a tiny existing/new script the HTML already loads) so both stay in
  lockstep automatically, same as `sw.js` does today, with no runtime
  fetch needed. Either is acceptable — pick whichever fits the existing
  boot sequence (`js/boot.js`) more cleanly.
- This needs to run and complete *before* `js/boot.js`'s normal
  state-restore path reads `trips` out of `localStorage` — sequence it
  early.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

## Definition of Done

- All acceptance criteria above pass.
- Existing manual "Start fresh" behaviour unaffected.
- `node scripts/test_data.js` + `node scripts/check_js.js` pass.
- Whoever closes this ticket updates `BACKLOG.md` (GOLF-132 →
  COMPLETE) and confirms the Beta-panel copy change reads well.
- No known blocking issues remain.
