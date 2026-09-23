# Implementation Task

**Feature:** GOLF-178: Costs card toggle between per person and total
**Status:** READY (owner approved 2026-09-23). The owner is assigning a dev.
**Priority:** P2

## Objective

Each cost on the Costs card should show one figure, per person or total, and the viewer should be able to switch between the two. Today every amount shows its total with a smaller "£x pp" figure underneath. On a mixed-currency trip that becomes "£1470 · €1520" with "£368 · €380 pp" below it. The owner finds this cluttered.

## Context

- The markup is shared between the live Costs tab and the read-only `#share=` view. This is deliberate (GOLF-174): the two must not drift apart again.
- GOLF-100 rejected a second column because it would overflow a 360px sidebar. That constraint still holds, and it is why this is a toggle.
- Every line is priced for the whole party, so per person means the line total divided by the group size. The share payload already carries the group size (`gs`).
- DEC-026 applies: with more than one currency, every figure stays per currency and nothing is converted.

## Step 0: before any change

Screenshot the current Costs card for a group of 4 in two cases: a single-currency trip and a GBP + EUR trip. Include one at phone width. Send the screenshots to the BA. This is the "before" we judge the change against.

## Requirements

1. When the group size is above 1, the Costs card has a two-option control: **Per person | Total**.
2. **Per person is selected when the card opens**, both in the live app and in the shared view.
3. The selected mode applies to every figure on the card: the trip total, each category (Golf, Stays, Stops, Fuel) and every line inside a category. Each of these shows **one** figure only.
4. The trip total also shows the other mode's figure in smaller text, labelled so it can't be misread. For example, "£368 per person · £1470 total" in per-person mode, and "£1470 total · £368 per person" in total mode. A screenshot of either view must never let a per-person figure pass as the total, or the other way round.
5. The current mode is stated in words on the card, not by the control's highlighting alone.
6. When the group size is 1, there is no control and the card shows single figures, as it does today.
7. The shared view gets the same control and behaves the same way. It stays read-only in every other respect.
8. Mixed currencies follow DEC-026 in both modes. Per person is worked out per currency, e.g. "£368 · €380 per person".

## Acceptance criteria

- [ ] Given a 4-person trip, when I open Costs, it is in Per person mode and every amount on the card is a per-person figure, with no second figure beneath any line.
- [ ] When I choose Total, every amount becomes the whole-party figure, and the trip total still shows the per-person figure in small, labelled text.
- [ ] Switching back and forth does not change any underlying price. Total mode matches today's totals exactly.
- [ ] On a 1-person trip there is no control, and the figures match today's.
- [ ] A shared link to a 4-person trip opens in Per person, the control works, and the figures match the sender's in both modes.
- [ ] On a GBP + EUR trip, both modes keep the currencies separate, with no converted or combined number.
- [ ] Changing the group size updates the figures in whichever mode is selected.
- [ ] Toggling the fuel checkbox updates the Fuel row and the totals in both modes.
- [ ] At 360px width, nothing overflows or wraps awkwardly in either mode, including on the mixed-currency trip.
- [ ] There are no console errors and no "undefined" or "NaN" anywhere on the card, in the live app or the shared view.
- [ ] `test_data.js`, `check_js.js`, `test_course_ids.js`, `test_fee_v2.js` and `test_currency.js` all pass.
- [ ] Send before and after screenshots, and confirm with the BA before the change goes live.

## Edge cases

- **Rounding:** per-person lines are rounded one at a time, so they may not add up exactly to the per-person trip total. The trip total must be worked out from the full trip total. The lines must not be summed to get it. Today's behaviour is the same, so a difference of a pound or two between the lines and the total is acceptable.
- **Category with nothing in it:** keep "Nothing here yet." with no figure.
- **Lines with no price yet:** these must not show as £0 or NaN in either mode.

## Out of scope

- Day totals in the Itinerary tab headers, and any other cost figure outside the Costs card.
- Remembering the choice between visits. The card always opens on Per person. This is the BA's assumption, the same as the other view toggles in the app. Raise it if it feels wrong in testing.
- Per-person splits that aren't even (e.g. a non-golfer who pays for the stay only).
- Any change to how prices are calculated.

## Constraints

- Zero-build, global-scope scripts. The live Costs tab and the shared view must keep sharing one rendering path.
- Do not touch the owner's browser localStorage. His trip data is live. Test in a separate profile or the in-app browser.
- Commit only after the BA has signed off the screenshots.
- **The working tree contains another ticket's uncommitted files: GOLF-162, which is parked** (`scripts/fetch_*_golf_clubs.py`, `scripts/fetch_dotgolf_clubs.py`, `scripts/diff_dotgolf_rewrite.py`, `scripts/README.md`, `docs/country-onboarding.md`). Do not commit, delete or revert them. Stage only your own files; never use `git add -A` or `git commit -a`.

## Definition of done

All acceptance criteria are met, the existing cost behaviour is unchanged in Total mode, all five scripts pass, and the owner has seen the after screenshots.

> The coding agent should inspect the existing codebase and follow established project patterns before introducing new architecture.
