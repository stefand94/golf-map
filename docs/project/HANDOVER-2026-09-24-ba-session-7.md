# Handover: BA/PM session, 2026-09-24 (session 7)

## Prompt for the new BA session (paste first)

> You are the BA/PM on Golf Map (Golf Tripper). Use the `golf-ba-pm` skill. Stefan is the product owner.
>
> **You own the backlog; every other session is a dev.** You do not write code, and you do not write new scripts. You own requirements, the backlog, decisions, the board and sign-off, and you check outcomes yourself in the in-app browser. Only you mint GOLF/DEC IDs.
>
> Read `CLAUDE.md`, `docs/project/`, this file, then `HANDOVER-2026-09-24-ba-session-6.md` and `HANDOVER-2026-09-22-ba-session-4.md` for the standing constraints. Keep replies to Stefan short and in plain English.

## Where the release stands

**Nothing from the release UX pass is live.** It all ships together, in one merge to `main`, once GOLF-185 (the mobile redesign) is complete. That merge wipes trips (DEC-011), so it happens once, on Stefan's go-ahead.

| Ticket | What | Branch | State |
| --- | --- | --- | --- |
| 185a | Mobile: full-screen map + bottom sheet + tab bar | `mobile-sheet` @ 82fe2fd | BA-checked. **Stefan has phone feedback (bugs + changes), not yet sent.** |
| 185b, c, e | Rest of the mobile redesign | `mobile-sheet` | **On hold** until Stefan's 185a list arrives. Sheet-level fixes first, then 185b |
| 190 | Trip = shortlist + itinerary wording | `golf-190-shortlist` | REVIEW, BA-checked |
| 193 | Costs consistent everywhere, estimates "~" | `golf-190-shortlist` | REVIEW, BA-checked. DEC-028 |
| 186 | One hotel picker, one tap to add | `golf-190-shortlist` | REVIEW, BA-checked. DEC-028 |
| 187 | Search: one ranked list, towns group courses | `golf-190-shortlist` | REVIEW, BA-checked desktop + phone. DEC-029 |
| 185d | Filters behind an icon | `golf-190-shortlist` | REVIEW, BA-checked. DEC-029 |
| 191 desktop | Map follows the trip | `golf-190-shortlist` | REVIEW, BA-checked. The phone half goes with 185b |
| 192 | Nearby says how far | `golf-190-shortlist` | REVIEW, BA-checked desktop + phone (64e06d1, build 6e9befa40e). DEC-030 |
| 194 | Small polish (remove → Undo, group size into trip menu) | `golf-190-shortlist` | REVIEW, BA-checked on 2d1e1736bd |
| 188 | Things to see: all shown, tap to narrow | `golf-188-things-to-see` (new, cut from `golf-190-shortlist`) | REVIEW, BA-checked; owner happy. Merged into `golf-190-shortlist` (build 2d1e1736bd), re-checked |
| 197 | Hotel shows twice on a golf day; "Change" adds a second hotel (from 186) | `golf-190-shortlist` @ 33255fe | **Gavin reports done** (21c4fa1, build bc35b50ff1, preview deployed). BA check not yet done: see "Next for the BA". DEC-031. Blocks the release merge until checked |
| 198 | Hadley Wood in the data twice | — | IDEA |
| 189, 195 | Ready-made lists; first-visit hint | — | IDEA; wait for 185 |

## Sessions

- **Gavin The Dev** (was "Dev 2"): works in `.claude/worktrees/lucid-lumiere-1c4943` on `golf-190-shortlist`. Reports ticket by ticket, with judgement calls listed.
- **Barry The Dev** (was "Mobile redesign briefing"): **a new session**, restarted 2026-09-24. He owns `mobile-sheet` (185a–e) and now 188 on its own branch. His old session closed mid-day, so check `ListAgents` before assuming he's there.
- Both have been told: don't mint IDs, don't edit `docs/project/`, never push to `main`, tell the BA before anything touches `main`.

## Merge plan (not started; needs Stefan)

Three branches have to come together: `golf-190-shortlist`, `golf-188-things-to-see` (cut from it) and `mobile-sheet`. `mobile-sheet` and `golf-190-shortlist` both change `js/trip-ui.js`, `js/map.js` and `london-golf-map-v5_1.html` heavily. Expect a real merge. Give it to one dev, then **re-check these after the merge**:
- the 186 hotel picker on a phone (the old layout jumped to the map);
- the 187 phone tap-to-card fix, which keys off the old `mob-list` class;
- 185d's breakpoint (max-width 900px) and its hiding of `.mob-toggle`, which 185a removed;
- that trip fits use `mapFitTrip`/`mapFitDay`/`mapHoldCamera` (js/map.js) with `animate:false`. An animated fit gets swallowed.

## Waiting on Stefan

1. His 185a phone list. Split it into sheet-level fixes (Barry, before 185b) and cosmetic ones (batched).
2. **Shared trips hide the shortlist:** unscheduled courses don't appear in a shared link. Should they? Could matter for GOLF-180.
3. Still open (minor): OSM calls the Duke's "Craigtoun Course". Is our course name stale?
5. Settled today: 192 per DEC-030; Hadley Wood logged as 198; "My trip" as the default name is fine; Olivewood is left as is.

## Next for the BA

1. **Check GOLF-197** on `golf-190-shortlist.golf-map.pages.dev/london-golf-map-v5_1` (reload until `APP_VERSION` = `golfmap-shell-v5-bc35b50ff1`). Test these paths on a 1-night and a 2-night stay:
   - pick from the list;
   - pick from a map pin;
   - Change, then pick from the list;
   - Change, then pick from a map pin.

   Also check:
   - the full name wraps at desktop and at 375px;
   - later nights show "Night N of M";
   - an empty box still shows on a golf day with no hotel;
   - Costs and the shared view are unchanged.

   If it passes, move 197 to REVIEW and update the board.
2. **Gavin's three judgement calls, all acceptable in my view; tell Stefan:**
   - the hotel name is bold;
   - the "Stay" label is dropped (the 🏨 icon and the controls say it);
   - the controls don't start a row drag.
3. **Gavin's aside:** a second night at the same hotel shows "Drive 0 min". This predates 197. Ask Stefan whether to ticket it; the likely fix is to hide the leg.

## Other work this session

- **CCO executive summary:** a Claude Docs doc, https://claude.ai/code/artifact/13b3475f-4e42-4d8c-99e7-78c48de0b330. Stefan also has it as a `.md` to share. It covers features, coverage, stack and costs, eight revenue lines, commercial constraints (ranking licences, "no revenue" permissions, Esri tiles, routing quota, no accounts) and six questions for the analysis. The cost figures marked "approx." are from memory and are not verified.
- **Board:** updated to v32 (sync `main @ 4cc3160`, release branch `a96db38`). It now needs 197's status.

## Docs state

- DEC-028 (Dev 2's 193/186 calls) and DEC-029 (Gavin's 187/185d calls) were recorded. 193 has also superseded GOLF-178's Costs-tab reset.
- `docs/deploying.md` now says to load twice after a deploy. The first load can come from the browser's own HTTP cache. Previews routinely took 2–3 reloads to show the new APP_VERSION today.
- DEC-030 (192: "long drive" at 90 min; straight-line estimates) and DEC-031 (197: one hotel row, Change always replaces) are recorded.
- The board artifact (https://claude.ai/artifact/StWh629BKonxmrENCjrGNP) is current up to 197 going READY.

## Lessons from this session

- **Check each dev report yourself.** Three of six "done" reports failed a BA check: 187 on phones, 185d's area scoping, and 191's hotel-picker fit. Each was a quick fix once found.
- **Test the path the visitor takes, not the function.** 191's `mapFitDay()` worked when called directly; a later async redraw undid it on the real add path.
- **Build-version tell:** after a preview deploy, reload until `APP_VERSION` equals the `sw.js` CACHE_NAME fetched with `{cache:'reload'}`.
- **Sessions can vanish.** Barry's closed without notice; a message to a stale socket fails with ENOENT. Tell Stefan, and hand the work to someone else if he doesn't return.
