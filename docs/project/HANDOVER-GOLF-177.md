# Implementation Task

**Feature:** GOLF-177: Fix two club phone numbers that ring an artisans' mobile
**Status:** READY (owner 2026-09-23). Queued after GOLF-178; GOLF-179 follows it.
**Priority:** P2

## Objective

Two Top 100 course popups give an artisans' section member's personal mobile as the club phone. A visitor ringing to book gets a private individual. Replace both numbers with the club office's number.

## The two records (`data/courses-top100.js`)

| Course | Ships today (wrong) | Expected club number (unverified lead) |
| --- | --- | --- |
| Ashridge | `07946 158647` | `01442 842244` |
| Royal Cinque Ports | `07808835932` | `01304 374007` |

## Requirements

1. **Verify each replacement number on the club's own website** (`ashridgegolfclub.ltd.uk`, `royalcinqueports.com`) before writing it. The numbers in the right-hand column are leads only. Report the URL of the page each number came from.
2. Change **only** `clubInfo.phone` on those two records, patching in place (GOLF-163). Don't rebuild or re-order the array. Don't touch any other field or record.
3. If a club's site shows a different number, or several (e.g. office vs pro shop), don't guess. Report back and the BA will decide.

## Acceptance criteria

- [ ] Both records show the verified club office number, with a source URL reported for each.
- [ ] The diff to `data/courses-top100.js` is exactly two changed lines.
- [ ] Both course popups show the new number in the browser, with no console errors.
- [ ] `test_data.js`, `check_js.js`, `test_course_ids.js`, `test_fee_v2.js` and `test_currency.js` all pass.
- [ ] BA sign-off before commit.

## Out of scope

- Any other course's contact details. The scope check on 2026-09-22 found only these two.
- Re-running any fetch or merge script. GOLF-162 is parked and its files must not be run, committed or reverted.

## Constraints

- Do not touch the owner's browser localStorage.
- Stage only your own file (`data/courses-top100.js`). The parked GOLF-162 files are still uncommitted in the tree.

> The coding agent should inspect the existing codebase and follow established project patterns before introducing new architecture.
