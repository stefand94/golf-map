# Dev briefs: GOLF-221, 222, 223, 225 and the GOLF-162 clean-up (2026-10-01)

Branch from `main`, push to `main`. Run the three check scripts. Report build hashes back to the BA.

## 1. GOLF-223: daily cap on route and place lookups (do first)
**Why:** the 100-per-10s rule stops floods, not a slow drip that drains the ORS daily quota. Also the owner's "if it can't cope, shut it off".
**Requirements**
1. A per-visitor daily limit on ORS-backed calls (directions and geocoding), well above real use. A cold 10-day trip load is about 30 calls.
2. An overall daily cut-off just under the ORS daily quota. Once it's reached, the Worker refuses ORS calls until the quota resets.
3. Overpass modes (hotels, POIs) are not ORS-quota'd. Leave them alone unless you find a reason not to.
**AC**
- [ ] Over either limit, the Worker returns a clear error and makes no upstream call.
- [ ] The app degrades as it does today: dotted straight lines for drives, and "temporarily unavailable" for place search. No broken UI, no "undefined".
- [ ] Normal use of a 10-day trip never hits the limit.
- [ ] Verify the live `X-Worker-Build` header, not the green check.
**Note:** if this needs a KV namespace or a Durable Object that you can't create, give Stefan the exact dashboard steps. Never ask for or handle API keys.

## 2. GOLF-221: open to search engines (after 223 is live)
1. Remove the blanket `X-Robots-Tag: noindex, nofollow` from production.
2. Change `robots.txt` to allow crawling.
3. Preview URLs (`<branch>.golf-map.pages.dev`) and the bare pages.dev host should stay `noindex`.
4. The tester-limitations notice **stays**.
**AC:** curl of `golftripper.uk/` shows no noindex; `robots.txt` allows `/`; a preview URL still sends noindex.

## 3. GOLF-222: traffic monitoring
Stefan turns on Web Analytics: Pages project → Metrics → Enable. It's injected on the next deploy. Dev then checks that the beacon loads on live, is not blocked by `sw.js` or `_middleware.js`, and adds no console errors.

## 4. GOLF-225: remove photos from the popup cards
In `popupHTML()` (`js/map.js` ~455), stop rendering the course photo and its credit line. Club logos stay. Leave the `photo` fields in the data files.
**AC:** no photo on any course popup, desktop or phone; the logo still shows where there is one; no layout gap where the photo was.

## 5. GOLF-162: delete the DotGolf rewrite (cancelled)
Discard the uncommitted rewrite in the main checkout: the edits to `scripts/fetch_{england,ireland,scottish,wales}_golf_clubs.py`, `scripts/README.md` and `docs/country-onboarding.md`, plus the untracked `scripts/fetch_dotgolf_clubs.py` and `scripts/diff_dotgolf_rewrite.py`. **Check `.claude/launch.json` first.** It may be unrelated, so don't discard it blindly.
