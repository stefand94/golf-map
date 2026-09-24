# Handover: BA/PM session, 2026-09-23 → 24

## Prompt for the new BA session (paste first)

> You are the BA/PM on Golf Map (Golf Tripper). Use the `golf-ba-pm` skill. Stefan is the product owner.
>
> **You do not write code.** Developer sessions do. You own requirements, the backlog, decisions, the board and sign-off, and you check outcomes yourself in the in-app browser. You may run the existing check scripts, but you must not write new ones.
>
> Read `CLAUDE.md`, `docs/project/`, this file, and then `HANDOVER-2026-09-22-ba-session-4.md` for the standing constraints. Keep replies to Stefan short and in plain English.

This picks up from `HANDOVER-2026-09-23-ba-session-5.md`. `docs/project/` is current, so read it rather than working it out again.

## What happened

| Ticket | Outcome |
| --- | --- |
| GOLF-35B + GOLF-102 P2 | **Done.** golftripper.uk is live. pages.dev and www 301 there, keeping the path and `#share=`. The Worker is on `api.golftripper.uk` with a CORS allowlist and `Max-Age` 7200. Rate-limit rule: 100 req/10 s per IP, 10 s block; burst-tested. workers.dev and Worker preview URLs are off (404). Build `7b99f36f8f`. noindex stays. Stefan checked it himself |
| GOLF-181 | **Done** (`5b62ab9`). Dead heritage-pois Worker tests retargeted |
| GOLF-180 | **Parked checklist** of everything to settle before going public. The UI-review session has since added items to it |
| GOLF-182 | **Live** (`12346e7`). One hotel = one map icon, including A→B→A, on the build and shared maps |
| GOLF-183 | **Live** (`8b00be5`). Audit of all 565 visible courses: `GOLF-183-coordinate-audit.md`. 11 of 13 approved courses re-pinned from OSM (Sun City etc.). Olivewood has no OSM feature and stays a placeholder. The Duke's wasn't actually off |
| GOLF-184 | **Live** (`22f3a99`). The mobile map no longer opens at street zoom. Nation pills fit their courses |
| GOLF-196 | **Done.** Dev 2 fixed it (`7e9ce10`, precache with `cache:'reload'`); my stuck browser self-healed on the next load |

182, 183 and 184 shipped in one push on Stefan's go-ahead, as build `f3562f3c76` (one trip wipe). I verified them locally at mobile width. On the live site, curl confirms the new files are served. After GOLF-196's fix, the live browser check passed too.

## Deploys and the service worker (GOLF-196, fixed)

Before `7e9ce10`, returning visitors who had loaded the site in the previous 4 h could get a new SW filled with old files. That is fixed now. Still, after any deploy, confirm `APP_VERSION` in the browser against `curl https://golftripper.uk/js/app-version.js` before judging a live check.

## Waiting on Stefan

2. Olivewood (1 dp placeholder, no OSM feature): does he want a follow-up ticket using the club's own site?
3. Optional: OSM calls the Duke's "Craigtoun Course". Is our course name stale?

## Sessions

- **Mobile redesign briefing** (`uds:/tmp/cc-socks/98223.sock`) owns **GOLF-185a → b → c → e** on branch `mobile-sheet` (previews allowed, no push to main). Review gates: the BA verifies each piece; Stefan reviews on a phone after 185a and once before the single merge. (The old Developer session has ended.)
- **Dev 2** (`uds:/tmp/cc-socks/69292.sock`), worktree `.claude/worktrees/lucid-lumiere-1c4943`, branch `claude/lucid-lumiere-1c4943`. Did 182/183/184/196. **Now assigned (2026-09-24): GOLF-190 → 193 → 186 → 187 → 185d → 188 → 191 (desktop half) → 192 → 194**, on its own branch, previews allowed, no push to main. I cherry-picked its commits onto `main` and pushed from the main checkout. The branch itself has since been merged with origin/main by the other BA session.
- **A second BA/UI-review session** is running (Stefan started it after finding mobile "doesn't work"). It logged GOLF-185 (mobile redesign, DEC-027, R-12) and GOLF-186–195 (`GOLF-185-mobile-redesign.md`, `GOLF-186-release-ux-pass.md`), and it **commits in this same checkout**. At handover, local `main` had its unpushed merge commit `4de45ed`. Agree with Stefan which BA owns what, so the two don't both allocate IDs or push each other's commits. Check the highest `GOLF-nnn` across all `docs/project/*.md` before minting one.
- If a session has gone, write the handoff into `docs/project/` and tell Stefan.

## The board

**https://claude.ai/artifact/StWh629BKonxmrENCjrGNP** (version 30, stamped `main @ 1df9f26`). **It is stale:** it doesn't show 182/183/184 live, 196, or the other session's 185–195.
- `read` it, edit the `SEED` array, update the sync stamp and republish to the same URL. The db store is empty.

## Lessons from this session

- **Don't trust a live browser check after a deploy (GOLF-196).** My tab reported the old `APP_VERSION` even after the new SW activated, and even after a hard reload. Confirm with curl first.
- **Shipping from a dev worktree:** check `git log HEAD..origin/main` on the branch. Someone else may have pushed. I cherry-picked onto an up-to-date `main` rather than rewriting the dev's branch, ran the 3 check scripts, then pushed. The pre-push hook adds and pushes the CACHE_NAME bump commit; confirm with `git log origin/main..HEAD` afterwards.
- **Push by ref** (`git push origin <sha>:main`) to ship one commit without the others waiting in the shared checkout.
- **Local DNS caches NXDOMAIN for 30 min.** For a new hostname, use `dig @1.1.1.1` or `curl --resolve` rather than waiting.
- **Preview ports:** 8934 and 8935 are usually taken by other sessions. Dev 2 serves its worktree on 8937. Check which directory a server is serving before trusting it.
