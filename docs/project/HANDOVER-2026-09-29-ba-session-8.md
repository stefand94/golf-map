# Handover: BA/PM session, 2026-09-29 (session 8)

## Prompt for the new BA session (paste first)

> You are the BA/PM on Golf Map (Golf Tripper). Use the `golf-ba-pm` skill. Stefan is the product owner.
>
> **You own the backlog; every other session is a dev.** You do not write code or scripts. You own requirements, the backlog, decisions, the board and sign-off, and you check outcomes yourself in the in-app browser. Only you mint GOLF/DEC IDs.
>
> Read `CLAUDE.md`, `docs/project/`, then this file. For standing constraints, see `HANDOVER-2026-09-24-ba-session-7.md` and `HANDOVER-2026-09-22-ba-session-4.md`. Keep replies to Stefan short and in plain English.

## Where things stand

**The big release is live.** `main` @ `7e724b1` (Geoff's `--no-ff` merge of
`mobile-sheet` @ `7ed61a6`), build `golfmap-shell-v5-ce08cfc109`, on
`golftripper.uk`. The BA checked it live at 375×812 and on desktop. The DEC-011 trip wipe
happened as expected. The BA docs after the release are `c29304b`.

The release carries, all marked **DONE 2026-09-29, released** in BACKLOG:
- GOLF-185a–e: mobile redesign (map-first, bottom sheet, tab bar, compact course card, country card, ⓘ credits, fee in search results);
- GOLF-186, 187, 188, 190–194, 197: release UX pass from session 7;
- GOLF-198: 5 London/Top 100 duplicates hidden via `dupOf`. Shown count 565 → 560; CLAUDE.md updated;
- GOLF-199: integration merge;
- GOLF-200: iOS input zoom, 16 px floor;
- GOLF-201: Brora card closing, fixed via `mapHoldCamera`;
- GOLF-202: Auto schedule overflow;
- GOLF-203: Costs "Other" category, custom costs with per-person/group, carried in share links as `oth`;
- GOLF-204: country before search. Phone via 185c; desktop via 208;
- GOLF-206: Mark played/Want to play no longer jump the map;
- GOLF-207: Itinerary pills Hotels / Courses / POIs replace the second filter icon. New viewport POI layer, pins from zoom 9, cap 60, lazy region files;
- GOLF-208: desktop order is name → countries (all tabs) → tabs → search → Filters · Show hotels · Show POIs. Group size and £ total are now only in Itinerary;
- GOLF-209: small version. Nearby goes by distance and ignores the country, so NI courses show near Stranraer; place search spans GB+IE on mixed trips; day stops count as anchors.

Specs: `GOLF-199-204-phone-feedback.md`, `GOLF-185-mobile-redesign.md`
(amendments section), `GOLF-207-209-map-pills-and-country.md`. Decisions:
DEC-032, DEC-033.

## Stefan's next step

He wants to **use the live site and "take it from there"**. Expect a new round
of feedback. Handle it the same way: ask the few questions that matter, write
tickets with AC into a spec file, hand off in parallel, check each report yourself,
and release on his go-ahead.

He hasn't done the iPhone check of the zoom fix and course card yet. Now that it's live, he can do it there.

## Waiting on Stefan

1. **Shortlist on mixed trips:** should a GB+IE trip's Discover shortlist show both
   countries' courses, rather than the "N more from other countries" note? Geoff sized this
   as part of 209. It's small.
2. **Nearby radius 60 → 65 mi?** A Holyhead ferry stop then reaches Dublin courses,
   which are 62 mi away. It's one constant, but it widens Nearby everywhere.
3. **GOLF-210 priority:** returning visitors can get one broken load right after a
   deploy. The old service worker runs old JS against new HTML, and a reload heals it. Logged P3.
   Ask whether it should be fixed before the next release.
4. **Carried from session 7 (check BACKLOG before asking again):** shared links
   hide unscheduled shortlist courses; Duke's vs OSM "Craigtoun Course" name; a
   second night at the same hotel shows "Drive 0 min".

## Open backlog worth knowing

- **GOLF-210** (P3 IDEA): the switchover broken load above. Fix candidates are null-guards on
  boot, or the SW serving HTML and JS from one cache version.
- **GOLF-205** (P3 IDEA): the pre-push hook commits the CACHE_NAME bump after the push,
  and it caused real damage this session. Gavin's hook committed a bump mid-rebase, so
  `a43d9e8` and `f692e96` on `mobile-sheet` contain conflict markers, and the app won't boot on them.
  Fixed forward at `7ed61a6`, not rewritten. **Never check out or cherry-pick
  those two SHAs.** Consider raising 205's priority.
- GOLF-189 (ready-made lists) and GOLF-195 (first-visit hint) were waiting for 185 and are now unblocked.
- GOLF-180 go-public gate: item 9 (mobile redesign merged) is now met.

## Sessions (all on standby)

| Dev | Session id | Notes |
| --- | --- | --- |
| Gavin | `local_3fca3136-2b4f-471f-b478-dcfd6237af76` | Did 203, 207. Worktree `.claude/worktrees/lucid-lumiere-1c4943`. **Told to hold pushes to `mobile-sheet` during the release. Tell him it's clear.** |
| Barry | `local_3c95b823-1f47-4259-9cc3-6d118e96600e` | Did 185a–e, 201, 208. Strong on layout; reports thoroughly. |
| Geoff | `local_dba50868-33bc-4648-8f08-41ee64dae220` | Did 199, 200, 202, 206, 198, 209 and the release merge. Worktree `../Golf Map-199`. |

- Message devs with `SendMessage` using the session id. **After about 10 messages without Stefan typing,
  the app pauses cross-session sends** until he writes. Batch messages, and tell him if one is held.
- `mobile-sheet` still exists. New work should branch from `main` now; decide
  whether to keep `mobile-sheet` as a release branch or retire it.
- The main checkout has uncommitted dev changes: the GOLF-162 scripts and Geoff's
  `geoff-199` entry in `.claude/launch.json`. **Don't commit them.** Commit BA files by
  path. `git pull --rebase --autostash` works safely around them.

## Board

The board artifact (https://claude.ai/artifact/StWh629BKonxmrENCjrGNP, source is the
scratchpad `board/scorecard.html`, SEED array) is **still v33**. It has none of
GOLF-199–210 and doesn't show the release. Update it first thing. The scratchpad may be
gone, so rebuild from the published artifact (`Artifact read`) if needed.

## How checks were done this session

- **Build tell:**
  1. Fetch `/sw.js?x=<now>` with `{cache:'reload'}` and read CACHE_NAME.
  2. Unregister service workers and delete caches.
  3. Reload until `APP_VERSION` matches.
  A new APP_VERSION wipes localStorage once (DEC-011); that's not a bug.
- **Useful globals:**
  - `tbPickNation('gb')`, `toggleTrip(i)`, `tripAutoScheduleUnscheduled()`, `setAppMode('build')`
  - `goToCourse(i)`, which opens a card the way a visitor does
  - `tbPoiLayerSet(on)`, `mapHoldCamera`, `tripEncodeShareURL()`
  - `tripStartFresh(); localStorage.clear()` at the end
- **Useful courses:** Castle Stuart 246, Royal Dornoch 239, Nairn 255, Brora 259, Sunningdale (Old) 124. POI pins are `L.CircleMarker`s.
- Phone: `resize_window` 375×812, then reset to desktop. If the pane is hidden,
  screenshots time out, so use JS/`read_page` instead.

## Lessons from this session

- **Check each report yourself, on the path a visitor takes.** Two of Barry's 185b
  items failed the first check: a toast hidden behind the search, and an add from Itinerary jumping to
  Discover. Both were quick fixes.
- **Size before building when the owner says "only if small".** Geoff's 209 sizing
  report made the go/no-go easy and kept the scope tight.
- **Parallel devs in one file need an explicit order.** 207 and 208 shared the
  toolbar block. "Barry lands the layout first, Gavin wires pills after" worked
  with no conflict.
- **A dev hook committing mid-rebase can poison history.** Fix forward, and never
  force-push without Stefan.
