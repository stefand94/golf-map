# Handover: BA/PM session, 2026-10-01 (session 9)

## Prompt for the new BA session (paste first)

> You are the BA/PM on Golf Map (Golf Tripper). Use the `golf-ba-pm` skill. Stefan is the product owner.
>
> **You own the backlog; every other session is a dev.** You do not write code or scripts. You own requirements, the backlog, decisions, the board and sign-off, and you check outcomes yourself in the in-app browser. Only you mint GOLF/DEC IDs.
>
> Read `CLAUDE.md`, `docs/project/`, then this file. For standing constraints, see `HANDOVER-2026-09-29-ba-session-8.md`, `HANDOVER-2026-09-24-ba-session-7.md` and `HANDOVER-2026-09-22-ba-session-4.md`. Keep replies to Stefan short and in plain English. Describe tickets in words, not bare IDs.

## Where things stand

`main` @ `f418a25`, live build **`b78ccc3562`** on `golftripper.uk`.
`mobile-sheet` is retired (DEC-034). All work now branches from `main` and
devs push straight to it.

This session took Stefan's second round of phone feedback, plus two
deploy bugs it surfaced. Everything below is **DONE and released** except
the drag fix:

| Ticket | What | State |
| --- | --- | --- |
| GOLF-215 | Phone drag: swipe scrolls, press-and-hold on ⠿ picks up (500 ms, Stefan wants the pause), auto-scroll at a controlled pace near the edges | **REVIEW, waiting on Stefan's iPhone** |
| GOLF-216 | Discover: a searched town or POI becomes its own day, with a "Goes: after Day N" chooser | DONE |
| GOLF-217 | "Add a stay" shows hotels on the map, plus "Search this area" | DONE |
| GOLF-218 | A hotel added from a day's picker goes on that day, not Day 1 | DONE |
| GOLF-219 | Costs: "Other" starts collapsed | DONE |
| GOLF-220 | Old/new code mix after a deploy (edge cached `.js` for 4 h). Fixed in the middleware with an `X-Build` header; a stale `?v=` gets `no-store` | DONE |
| GOLF-212 | Desktop map thought it was wider than it was, so fits landed off-centre | DONE |
| GOLF-210, 211, 213, 214, 205 | Switchover broken load, hotel picker alignment, cost pill, clean `/` address, stamp hook | DONE (see BACKLOG) |

## The one live item: GOLF-215 (drag and drop on a phone)

Stefan reported that drops snapped back to where they started, with a blue
highlight at the top of the target card. Gavin fixed it in two passes:

1. **Build `b87506aa6c`.** The lifted card sat under the finger, so it
   swallowed the drop. There was also a self-drop guard that ran after the
   item had already been removed.
2. **Build `b78ccc3562`.** iOS's own drag raced the shim. This fix:
   - turns that off with `-webkit-user-drag:none` on touch screens;
   - tracks each touch by its identifier;
   - re-checks the target at touchend;
   - on touchcancel, drops onto the last good target.

The BA checked both builds with synthetic touches at 375 wide (shortlist → day
and day → day). Both passed. **But the iOS race can only be proven on a real
iPhone**, and no Xcode is available here.

**Next step:** wait for Stefan's result. He has been told to close and reopen
the Safari tab first.
- **If it works:** mark 215 DONE and update the board.
- **If it fails:** ask him whether the blue highlight still follows his finger.
  Send that answer and his exact steps (which card, from where, to where) to Gavin.

## Waiting on Stefan (still open, carried)

1. **Mixed GB+Ireland trips.** Should the shortlist show both countries' courses
   instead of the "N more from other countries" note? Small change.
2. **Nearby radius: 60 or 65 miles?** At 65, a Holyhead ferry stop reaches the
   Dublin courses, which are 62 miles away. It's one constant, but the change
   widens Nearby everywhere.
3. **Shared links hide unscheduled shortlist courses.** Is that intended?
4. **"Drive 0 min"** shows for a second night at the same hotel. There's also
   the Duke's vs OSM "Craigtoun Course" name question.
5. **iPhone checks:** whether the input-zoom fix holds (200), and whether an
   installed home-screen copy picks up new builds (220).

## Board

The board is at https://claude.ai/artifact/StWh629BKonxmrENCjrGNP and is now at
**v41**. Its sync stamp says `main @ e10453d`, so it doesn't show the latest
215 state. Update it once 215 resolves. The source was the scratchpad file
`board/scorecard.html` (the SEED array). If the scratchpad is gone, rebuild
from `Artifact read`.

## Devs (all on standby)

| Dev | Session id | This session |
| --- | --- | --- |
| Gavin | `local_3fca3136-2b4f-471f-b478-dcfd6237af76` | 215 (touch drag), 219 |
| Barry | `local_3c95b823-1f47-4259-9cc3-6d118e96600e` | 217/218, 211, 212, 213 |
| Geoff | `local_dba50868-33bc-4648-8f08-41ee64dae220` | 216, 210, 205, 214, 220 |

- After about 10 cross-session messages without Stefan typing, sends get
  paused. Batch your messages.
- Devs sometimes send notes that cross with yours. Check the build a report
  names before reacting to it.

## How checks were done

- **Is the new build live?** Run `curl -sI https://golftripper.uk/ | grep -i x-build`.
  Don't load the site until it shows the new build. Twice, an early load got the
  old build because the edge hadn't updated yet.
- **In the pane:** unregister service workers and clear caches, then reload until
  `APP_VERSION` matches. A new `APP_VERSION` wipes localStorage once (DEC-011).
- **Useful globals:** `tbPickNation`, `tbAddToWishlist`,
  `tripAutoScheduleUnscheduled`, `setAppMode('build')`, `tbOpenHotelPicker(dayId)`,
  `tbCloseHotelPicker`, `tbTouch` (the drag shim's state), `C[i].n`,
  `tripDays[].items`.
- **Courses:** Royal Portrush 375, Royal County Down 376, Castle Stuart 246,
  Nairn 255.
- **Phone tests:** `resize_window` 375×812. Scroll the target into view before
  synthetic touches. Read element rects, not screenshot pixels: screenshots
  are scaled from 1024 to 800 wide. That misreading once made the BA
  wrongly report a button as off-screen, and it was corrected in BACKLOG.
- **End:** `tripStartFresh(); localStorage.clear()`, then reset the window to desktop.

## Repo hygiene

- The main checkout has uncommitted dev files: the GOLF-162 DotGolf scripts
  (`scripts/fetch_*_golf_clubs.py`, `scripts/fetch_dotgolf_clubs.py`,
  `scripts/diff_dotgolf_rewrite.py`), plus `scripts/README.md`,
  `docs/country-onboarding.md` and `.claude/launch.json`. **Don't commit them.**
- Commit BA files by path only. Use `git pull --rebase --autostash`, and check
  `git log origin/main..HEAD` before pushing.
- Never check out `a43d9e8` or `f692e96`. Never force-push.

## Lessons

- **"It works in the test" isn't proof for touch on iOS.** Synthetic touches
  pass while Safari's native drag still interferes. Say plainly which checks
  only Stefan's phone can do.
- **Deploy timing causes false failures.** Confirm the `x-build` header before
  any live check.
- **Owner's direct asks to devs:** Stefan sometimes briefs a dev directly
  (213, the 211 follow-up). Mint the ID afterwards and record it. Don't block
  the work.
