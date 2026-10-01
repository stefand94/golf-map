# Dev briefs, 2026-10-01: three devs in parallel

Owner: Stefan. BA: the BA/PM session (it mints every GOLF/DEC ID; tell it before you push anything that isn't yours).
Paste **"Standing rules"** plus **your own section** into a fresh dev session.

| Dev | Tickets | Touches |
| --- | --- | --- |
| **Geoff** | GOLF-223 → GOLF-221 → GOLF-222 | Worker (`scripts/cloudflare-worker/`), `_headers`, `robots.txt`, `functions/_middleware.js` |
| **Gavin** | GOLF-224 | `js/state.js` (`tbDeployVersionChanged()` and its caller), trip load and migration |
| **Barry** | GOLF-225, GOLF-227, GOLF-162 clean-up | `js/map.js` `popupHTML()`, a small privacy note, the main checkout's stray files |

These three areas don't overlap. If you find you need a file in another dev's column, tell the BA first.

---

## Standing rules (every dev, read first)

- Read `CLAUDE.md` and your ticket's row in `docs/project/BACKLOG.md`. Product questions go to the BA, not guesses.
- **Work in your own worktree, branched from `main`.** The main checkout has uncommitted files that aren't yours. Only Barry touches those, for GOLF-162.
- **Pushing:** run the three check scripts (`test_data.js`, `check_js.js`, `test_course_ids.js`). Then `git pull --rebase --autostash`, check `git log origin/main..HEAD` is only your commits, and push. Three of you are pushing to `main` today, so a hook-stamped `sw.js` `CACHE_NAME` may conflict. Take `main`'s side and let the post-commit hook re-stamp. Never force-push. Never check out `a43d9e8` or `f692e96`.
- **"Deployed" means seen at the provider, not a green check.** Pages: `curl -s -D - -o /dev/null https://golftripper.uk/ | grep -i x-build` (a GET; `curl -I` doesn't show it). Worker: the `X-Worker-Build` header. Don't load the site to check until the header shows your build. Twice, an early load got the old one.
- **Local preview serves stale code.** Use `/index.html`, unregister the app's service worker and clear its caches after edits, and reload until `APP_VERSION` matches. `tripStartFresh()` needs `confirm` stubbed.
- **A hidden pane renders no frames.** ResizeObserver and rAF never fire there, so call layout syncs directly when testing.
- **No real iOS here.** Say plainly which checks only Stefan's iPhone can do; synthetic touches aren't proof.
- **Verify against what ships, not against the old code path.** A diff against the old path only proves the two agree.
- **API keys:** never ask for, read or commit one. Stefan adds secrets in the Worker dashboard himself. The Worker's domain and settings live in `wrangler.jsonc`; dashboard toggles get reverted by git deploys.
- **Course data:** identity is `id`, not array position. Never rebuild a `data/courses-*.js` array; `data/course-ids.js` is frozen.
- **Finish:** run `tripStartFresh(); localStorage.clear()` in any browser you used and reset the window size. Report back to the BA with commit, build hash, what you verified and how, and anything only Stefan can check.

---

## Geoff: GOLF-223, then GOLF-221, then GOLF-222

### GOLF-223: daily cap on route and place lookups (first)
**Why:** the 100-requests-per-10-seconds rule stops floods, but not a slow drip that drains the ORS daily quota (R-7). It's also the owner's "if it can't cope, shut it off".
1. Add a per-visitor daily limit on ORS-backed calls (directions and geocoding), well above real use. A cold 10-day trip load is about 30 calls.
2. Add an overall daily cut-off just under the ORS daily quota. Once it's reached, the Worker refuses ORS calls until the quota resets.
3. Leave the Overpass modes (hotels, POIs) out unless you find a reason; they aren't ORS-quota'd.

**AC**
- [ ] Over either limit, the Worker returns a clear error and makes no upstream call.
- [ ] The app degrades as it does today: dotted straight-line drives, and "temporarily unavailable" for place search. No broken UI, no "undefined".
- [ ] A normal 10-day trip never hits the limit.
- [ ] Live `X-Worker-Build` matches your commit.

If you need a KV namespace or Durable Object you can't create, give Stefan exact dashboard steps. Pick the storage; that's your call. **Remember: 401 = key unrecognised, 403 = recognised and refused.**

### GOLF-221: open to search engines (only after 223 is live)
1. Production `golftripper.uk` loses the `X-Robots-Tag: noindex, nofollow` header, and `robots.txt` allows crawling.
2. Preview URLs (`<branch>.golf-map.pages.dev`) **stay noindex**. The bare pages.dev host already 301s.
3. **The tester-limitations notice stays** (owner).

**AC:** curl of `golftripper.uk/` shows no noindex, `robots.txt` allows `/`, and a branch preview still sends noindex.

### GOLF-222: traffic monitoring
Stefan enables Cloudflare Web Analytics (Pages → Metrics → Enable); it's injected on the next deploy. Check that the beacon loads on live, isn't blocked or cached wrongly by `sw.js` or `_middleware.js` (remember GOLF-220's `?v=`/`X-Build` rules), and adds no console errors. Tell Barry what it collects, for the privacy note.

---

## Gavin: GOLF-224, trips survive releases (DEC-037, supersedes DEC-011)

**Why:** today every deploy wipes every visitor's saved trips (`tbDeployVersionChanged()` in `js/state.js`). That's fine for testers but not for the public. GOLF-163 already made saved trips migratable.

**Requirements**
1. Saved trips, the active trip, the shortlist and the visitor's settings survive a new release.
2. Trips saved in an older format are migrated forward on load, using the existing GOLF-163 index→id path (`js/course-id.js`).
3. Only data that genuinely can't be read is cleared. Clear that piece only, not everything, and the app must still load.
4. **Keep the deploy freshness machinery** (GOLF-196, 210, 220: cache clearing, `?v=` refetch, one reload). Only the *data wipe* goes.
5. Share links (`#share=`) behave exactly as now.

**AC**
- [ ] Build a trip, simulate a new `APP_VERSION`, reload: the trip is unchanged (days, items, hotels, costs, shortlist).
- [ ] A pre-GOLF-163 index-based saved trip loads correctly.
- [ ] Corrupt one stored value by hand: the app loads, the rest survives, and there are no console errors.
- [ ] Old and new share links still render the same trip.
- [ ] One release after this ships, Stefan's real trip survives on his phone. **Only Stefan can confirm this.**

**Watch:** DEC-011 started because dev test data kept reappearing in Stefan's browser. Without the wipe, **clearing your test state at the end of every session is now mandatory**, not tidy-up. Also check `js/mobile-sheet.js:78`, which leans on the wipe.

---

## Barry: GOLF-225, GOLF-227, GOLF-162 clean-up

### GOLF-225: remove photos from the popup cards
In `popupHTML()` (`js/map.js` ~455), stop rendering the course photo and its credit line. **Club logos stay.** Leave the `photo` fields in the data files.
**AC:** no photo on any course popup, desktop or 375 wide; the logo still shows where there is one; no gap where the photo was; the shared view is checked too.

### GOLF-227: short privacy note
A few plain lines, reachable from the app (your call where, but findable on a phone):
- Trips are saved only in your own browser. There are no accounts and no cookies.
- Route and place searches go through our server to OpenRouteService / OpenStreetMap; they see the places searched, not who you are.
- Cloudflare Web Analytics counts visits anonymously, with no cookies. Get the exact wording of what it collects from Geoff.
- A contact line: **OPEN QUESTION, waiting on Stefan.** Build it with the line left out, and tell the BA when you're ready for it.

### GOLF-162: delete the DotGolf rewrite (cancelled)
This is in the **main checkout**. Discard the uncommitted edits to `scripts/fetch_{england,ireland,scottish,wales}_golf_clubs.py`, `scripts/README.md` and `docs/country-onboarding.md`, and delete the untracked `scripts/fetch_dotgolf_clubs.py` and `scripts/diff_dotgolf_rewrite.py`. **Look at `.claude/launch.json` first.** It may be unrelated, so ask before discarding it.
