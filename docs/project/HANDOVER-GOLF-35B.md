# Implementation Task

**Feature:** GOLF-35 Phase B + GOLF-102 Part 2: launch golftripper.uk
**Status:** IN PROGRESS. Plan signed off by the BA 2026-09-23: redirects in `functions/_middleware.js`, domains added before the push
**Priority:** P2

## Prompt for the dev session (paste first)

> You are a senior web developer working on Golf Map (Golf Tripper), a zero-build static website hosted on Cloudflare Pages, with one Cloudflare Worker as its only server. You write and ship the code. A separate BA session owns requirements and sign-off, and Stefan, the product owner, gives the final go-ahead.
>
> Work in plain HTML/CSS/JS with global scripts and no framework or bundler, and follow the patterns already in the repo. Read `CLAUDE.md` first, then this handover.
>
> Test everything in the in-app browser against the real thing: a green build check or a matching hash is not proof. Never touch Stefan's own browser storage. Never ask for, look at or commit an API key. Stage only the files you changed, by name.
>
> Commit only after BA sign-off, and push only when the BA relays Stefan's go-ahead. Keep your reports short and in plain English.

## Objective

Make **golftripper.uk** the live site, and keep **golf-map.pages.dev** for work in progress (branch previews). The site stays private: it's shared by link only and hidden from search engines.

## Decisions already made (owner, 2026-09-23; don't re-open them)

| Question | Answer |
| --- | --- |
| Public or hidden? | **Hidden.** The link is shared privately. `noindex` and `robots.txt Disallow` stay exactly as they are. |
| Registrar | **Cloudflare**, so the domain is already a zone on Stefan's account and no nameserver changes are needed. |
| Where does `main` go? | **golftripper.uk.** The bare golf-map.pages.dev address redirects there. |
| Branch previews | Keep working at `<branch>.golf-map.pages.dev`, with **no redirect**. |
| Saved trips | **No migration.** DEC-011 (every deploy clears trips) stays until accounts exist (GOLF-104). |
| Preview password (`DEV_PASSWORD`) | Stays unset. The site isn't public, so the reason for leaving it off still holds. |

## Requirements

1. **golftripper.uk** serves the `main` build over HTTPS. `www.golftripper.uk` redirects to it (one direction, applied consistently).
2. **The bare `golf-map.pages.dev`** permanently redirects to the same path on golftripper.uk. Preview subdomains (`<branch>.golf-map.pages.dev`) are **not** redirected. Note: `pages.dev` isn't in Stefan's zone, so a zone-level rule on golftripper.uk won't catch it.
3. **Old share links keep working.** A `golf-map.pages.dev/...#share=...` link opens the same shared trip on golftripper.uk, with the hash intact.
4. **The Worker accepts golftripper.uk.** Add it (and `www`) to `ALLOWED_ORIGINS` in `scripts/cloudflare-worker/ors-proxy.js`. Keep `golf-map.pages.dev` and its previews on the list, because previews still call the Worker.
5. **The Worker moves to `api.golftripper.uk`,** and `ORS_PROXY_URL` in `js/ors.js` points there. **Once that's verified, the `workers.dev` address is switched off** (BA 2026-09-23); otherwise scripts could bypass the rate limit by calling it directly. This is the final step, after the burst test.
6. **Rate limiting (GOLF-102 Part 2):** one Cloudflare rate-limiting rule on `api.golftripper.uk`, blocking a single IP that sends too many requests.
   - Size the threshold from real use. Load a 10-day trip, change days around, open hotels, and count the Worker calls it makes. A normal planner must never hit the limit.
   - Give Stefan the exact values to type in, and record them in `docs/deploying.md`.
7. **PWA:** the app installs from golftripper.uk. `manifest.json` already uses relative paths, so confirm that's enough. Existing installs from pages.dev can be left as they are; don't attempt a cross-origin takeover.
8. **Docs:** update the live URL in `CLAUDE.md`, `docs/deploying.md`, `docs/project/PROJECT.md` and any README that names golf-map.pages.dev as production.

## Stefan's dashboard steps

Stefan does the clicking; you give him exact, numbered steps in plain English. Expect these:
- Add `golftripper.uk` and `www.golftripper.uk` as custom domains on the golf-map Pages project.
- Add `api.golftripper.uk` as a custom domain on the Worker.
- Set up whatever redirects the golf-map.pages.dev → golftripper.uk rule needs.
- Create the rate-limiting rule.

Send him one step at a time and wait for his "done" before checking the result. **Never ask him for an API key or token.**

## Acceptance criteria

- [ ] `https://golftripper.uk` loads the live app with a valid certificate and no password prompt, and the response still carries `X-Robots-Tag: noindex`.
- [ ] `www.golftripper.uk` and `https://golf-map.pages.dev/<any path>` both land on the matching golftripper.uk address.
- [ ] A preview URL (`<branch>.golf-map.pages.dev`) still loads the branch build and is **not** redirected, and its routing works through `api.golftripper.uk`.
- [ ] A returning visitor, whose browser has the old service worker from golf-map.pages.dev, ends up on golftripper.uk within one reload, with no broken or blank page.
- [ ] Once the address is switched off, `workers.dev` no longer answers.
- [ ] An old `golf-map.pages.dev/#share=...` link opens the same trip on golftripper.uk.
- [ ] On golftripper.uk, driving routes, place search, hotel search and heritage stops all work through `api.golftripper.uk`. Check `X-Worker-Build` to confirm the new Worker build is live.
- [ ] The Worker answers a request from an origin that isn't on the allowlist with `Access-Control-Allow-Origin: null`.
- [ ] A scripted burst over the threshold from one IP gets blocked, and access recovers after the block window. A normal 10-day trip session never triggers it.
- [ ] The app installs as a PWA from golftripper.uk.
- [ ] There are no console errors, and no API key appears in any served file or request.
- [ ] `test_data.js`, `check_js.js`, `test_course_ids.js`, `test_fee_v2.js` and `test_currency.js` all pass.

## Edge cases

- **Place search:** ORS geocoding can 403 intermittently. That's an account-side issue, not a hosting fault.
- **Trips on the new domain:** the first visit to golftripper.uk starts with an empty trip. That's expected.
- **Branch names:** preview names containing unusual characters are sanitised by Cloudflare. The CORS suffix match already covers them.

## Out of scope

- Removing `noindex` or going public. That re-opens DEC-022 and GOLF-160.
- Accounts or login (GOLF-104).
- Password-protecting previews.
- Analytics.

## Constraints

- **The working tree contains GOLF-162's uncommitted files, which are parked:** `scripts/fetch_*_golf_clubs.py`, `scripts/fetch_dotgolf_clubs.py`, `scripts/diff_dotgolf_rewrite.py`, `scripts/README.md` and `docs/country-onboarding.md`. Don't commit, run or revert them.
- A push to `main` deploys both the site and (if `ors-proxy.js` changed) the Worker. Push only on the relayed go-ahead.
- Background: `HANDOVER-GOLF-35.md` has the Phase A history. Its Phase B section is out of date: GitHub Pages is already retired, and the Worker now deploys from git.

## Definition of done

All acceptance criteria are met and Stefan has opened golftripper.uk himself. The BA has also checked it on the live domain.

> The coding agent should inspect the existing codebase and follow established project patterns before introducing new architecture.
