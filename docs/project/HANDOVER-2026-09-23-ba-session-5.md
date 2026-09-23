# Handover: BA/PM session, 2026-09-23

## Prompt for the new BA session (paste first)

> You are the BA/PM on Golf Map (Golf Tripper). Use the `golf-ba-pm` skill. Stefan is the product owner.
>
> **You do not write code.** A separate developer session does. You own requirements, the backlog, decisions, the board and sign-off, and you check outcomes yourself in the in-app browser. You may run the existing check scripts, but you must not write new ones.
>
> Read `CLAUDE.md`, `docs/project/`, this file, and then `HANDOVER-2026-09-22-ba-session-4.md` for the standing constraints. Keep replies to Stefan short and in plain English.

This picks up from `HANDOVER-2026-09-22-ba-session-4.md`. The board in `docs/project/` is current as of this commit, so read it rather than working it out again.

## What happened today

| Ticket | Outcome |
| --- | --- |
| GOLF-178 | **Done.** Costs card has a Per person / Total toggle. Currencies are joined with " + " (DEC-026 amended) |
| GOLF-177 | **Done** (`7facf2e`). Ashridge and Royal Cinque Ports show the club office phone. BA-verified on the clubs' sites and in the live popups |
| GOLF-179 | **Done** (`1ae18d9`, build `a0fe66f9f9`). Hotel and POI icons move clear of course pins, with a leader line. Live map only; the shared map is a separate design and is unchanged. BA-verified live. It went live before Stefan's go-ahead (see the first lesson below); Stefan confirmed "keep" afterwards |
| GOLF-166 | Cancelled (not an issue) |
| GOLF-162 | **Parked** by the owner, because he's worried it brings in bad data. Its files are still uncommitted in the tree and must not be committed, run or reverted |
| GOLF-165 | **Closed.** Keep the every-deploy trip wipe (DEC-011) until there's a login, probably Google (noted on GOLF-104) |
| golftripper.uk | Bought via Cloudflare. It stays private (`noindex` stays). `main` goes on golftripper.uk and golf-map.pages.dev is kept for branch previews. Handed to the dev as `HANDOVER-GOLF-35B.md` |

## In progress

- **GOLF-35 Phase B + GOLF-102 Part 2 (domain launch):** the dev has it. They'll send Stefan the dashboard steps one at a time.
  - Your job is to sign off the plan. Then check on the live domain:
    - redirects, including that previews are *not* redirected;
    - an old `#share=` link still opening the right trip;
    - the Worker running on `api.golftripper.uk`;
    - the rate-limit threshold being sized from real use.
  - After that, relay Stefan's go-ahead to push.

## Waiting on Stefan

1. A stop with no price yet makes the Costs card's Stops row read "£0". Is that fine, or should it say "TBC"? (Asked; no answer yet.)
2. When `noindex` comes off (GOLF-129 / DEC-022). Not yet: the link is private.

## The dev session

The dev is reached with `SendMessage` to the name "Developer", currently at `uds:/tmp/cc-socks/52737.sock`. If that session has gone, write the handoff into `docs/project/` and tell Stefan.

## The board

**https://claude.ai/artifact/StWh629BKonxmrENCjrGNP**
- Local source: this session's scratchpad `board/scorecard.html`. From a new session, `read` the artifact first, then edit and republish to the same URL.
- Rows live in the `SEED` array in the page. The db store is empty.
- Update the sync stamp every time you republish.

## Lessons from today

- **The BA and the dev share one checkout.** A BA docs push also ships any dev commit that's waiting, and this sent 179 live early.
  - Before any push, run `git log --oneline origin/main..HEAD`. If anything besides your own docs commits is listed, don't push.
- **Say "commit, don't push" explicitly in every dev message** until Stefan says go. One loosely worded message sent 177 live early.
- **Every deploy clears trips on the next page load (DEC-011).** That includes your own test trips. Also, a tab opened before a deploy runs the old code until it's reloaded.
  - One live check looked like a 179 failure for exactly this reason. Reload and confirm `APP_VERSION` before you judge anything.
- **`tripStartFresh()` asks for confirmation**, and under automation that dialog returns false, so nothing is cleared. To clear only your own test trip in the in-app browser, stub `window.confirm` for that single call.
- **Stefan asks for proof, not a report.** Rebuild the scenario yourself (for example the Portrush trip: Royal Portrush, Portrush Atlantic Hotel and Dunluce Castle) and measure.

## Standing constraints

These are unchanged; the full wording is in the earlier handovers.
- Don't clear Stefan's own `localStorage`.
- Never ask for, see or commit an API key.
- Nothing is pushed to `main` without Stefan's go-ahead.
- Don't open new work unless Stefan asks.
- Don't commit, run or revert the GOLF-162 files.
- Never re-mint a course `id` or rebuild a `data/courses-*.js` array.
- Tell devs to stage files by name.
