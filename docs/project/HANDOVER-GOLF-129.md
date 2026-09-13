# Implementation Task — GOLF-129 (Beta launch readiness)

**Feature:** GOLF-129 — Gate the site for a private beta + add a tester-facing
limitations notice

## Objective

Get the app into a state the owner can safely hand to real test users: close
the "anyone on the internet can find this half-finished site" gap, and make
sure testers know what's still rough before they judge it.

This ticket has two parts that ship together but are otherwise independent:

1. **The gate** — this is not new work, it's **GOLF-35 Phase A** and
   **GOLF-102 Part 1**, which are already fully specified in
   `HANDOVER-GOLF-35.md`. Do exactly that spec (sections A1–A6 only). This
   document does not repeat it — go there for the implementation detail.
2. **The notice** — new, small, specified below: a "Beta" badge in the app
   header that opens a short list of known limitations.

## Context

- Confirmed 2026-09-13: the repo has **no** `_headers`, `robots.txt`, or
  `functions/` directory today. The live GitHub Pages site is fully public
  and indexable — this is the actual urgency behind this ticket, not a
  theoretical risk.
- The pre-go-live UX pass (GOLF-107 umbrella, GOLF-108–116) is done. The app
  itself is in reasonable shape for testers; the gap is purely "this
  shouldn't be publicly discoverable yet" plus "testers should know the
  known rough edges up front" rather than reporting them as bugs.
- **No feedback link or form** — the owner will contact testers directly
  and doesn't want an in-app feedback mechanism for this first batch
  (decided 2026-09-13). Don't add one.

## Requirements

### 1. Ship GOLF-35 Phase A + GOLF-102 Part 1

Follow `HANDOVER-GOLF-35.md` sections **A1 through A6** exactly:

- A1 — `functions/_middleware.js` password gate (Basic Auth, `dev` /
  `env.DEV_PASSWORD`, only active when `DEV_PASSWORD` is set — i.e. only on
  Preview).
- A2 — `_headers` (`X-Robots-Tag: noindex, nofollow`) + `robots.txt`
  (`Disallow: /`).
- A3 — Worker CORS allowlist in `scripts/cloudflare-worker/ors-proxy.js`
  (this is GOLF-102 Part 1).
- A4 — make PWA/asset URLs origin-agnostic.
- A5 — remove any GitHub-Pages-only cruft (e.g. a `CNAME` file).
- A6 — verify per that document's checklist.

**Do not** do Phase B (custom domain, rate limiting) — that's still blocked
on the owner buying a domain and is out of scope here.

### 2. Add a "Beta" notice for testers

A small, persistent affordance in the app header (Plan and Build modes
only — see Out of Scope) that a tester can open at any time to see what's
still rough. Look at the existing header/toolbar markup
(`js/trip-ui.js` `renderTripBuilder()`) and existing dropdown/modal patterns
already in the app (e.g. the trip menu) and reuse that pattern rather than
inventing a new UI primitive.

- A small "Beta" badge or text link, always visible in the header.
- Tapping/clicking it opens a short panel/modal with this copy (verbatim,
  owner-approved — light wording edits for house style are fine, the
  content is not):
  - Courses covered: Great Britain, Ireland, and South Africa only.
  - Green fees are confirmed for the highest-ranked ~130 courses; everywhere
    else is an estimate — check the "Confirmed" / "Estimate" label under
    the price.
  - Hotel pins come from OpenStreetMap and prices are entered manually —
    coverage is patchy, especially outside towns.
  - Trips are saved only in this browser (no account, no sync). Clearing
    browser data, or switching device, loses them.
- A close control. Dismissing the **panel** just closes it — the badge stays
  visible so a tester can reopen it any time. There is no "don't show this
  again"; nothing here should permanently hide the badge itself.
- No feedback link, no email address, no form — see Context.

## Acceptance Criteria

- [ ] Given a Cloudflare Pages preview deployment with `DEV_PASSWORD` set on
      the Preview environment, when a visitor opens the URL, then the
      browser prompts for Basic Auth (`dev` + the password) before any app
      content loads.
- [ ] Given the production deployment, when a visitor opens it, then no
      password is requested.
- [ ] Given any deployment, when a search crawler requests it, then the
      response carries `X-Robots-Tag: noindex` and `robots.txt` disallows
      all.
- [ ] Given a request to the Worker from an origin not on the allowlist,
      then `Access-Control-Allow-Origin` is `null`, not `*`.
- [ ] Given the deployed app on its real origin, routing / geocoding / POIs
      / hotels all still work through the Worker.
- [ ] Given Plan or Build mode on any screen size, a "Beta" badge is visible
      in the header without overlapping or squeezing existing controls
      (check at 360px, per the GOLF-114 layout work).
- [ ] Given a tester taps/clicks the badge, the limitations panel opens with
      the four points above, and can be closed and reopened freely.
- [ ] Given the `#share=…` read-only view, the beta badge/panel does **not**
      appear there.
- [ ] `node scripts/test_data.js` and `node scripts/check_js.js` pass.
- [ ] No API key or secret appears in any client-served file or network
      payload.

## Edge Cases

- Same edge cases as `HANDOVER-GOLF-35.md` Phase A (static assets must still
  serve through `_middleware.js`; preview-subdomain CORS suffix matching;
  PWA installed from an old origin keeps its own service worker — don't try
  to migrate it).
- The beta badge must not collide with the mobile map/list toggle or the
  nation-pill row on a 360px viewport.
- If a tester has the app installed as a PWA before the gate ships, the next
  load should behave the same as any other returning visitor — no special
  handling needed, this isn't a breaking change to app data.

## Dependencies

- None blocking. Independent of the domain purchase (that's Phase B, out of
  scope here).

## Out of Scope

- GOLF-35 Phase B / GOLF-102 Part 2 (custom domain, rate limiting) — still
  blocked on the owner buying a domain.
- Any feedback link, form, or email address in the app (owner will contact
  testers directly, 2026-09-13).
- The badge/panel on the shared-trip view (`#share=…`) — that page is opened
  by people a tester shares a trip with, not the testers themselves; keep it
  out of scope to avoid touching `trip-share.js` layout for this pass.
- Onboarding tour, tutorial, or any first-run experience beyond the badge.
- Analytics or usage tracking of testers.

## Constraints

- No build step, no framework, no bundler — same as always.
- Reuse an existing dropdown/modal pattern already in the codebase for the
  limitations panel rather than adding a new one.
- Follow `HANDOVER-GOLF-35.md`'s constraints for the gate/CORS work
  (secrets stay server-side, existing comment style in `ors-proxy.js`).

## Implementation Guidance

- The beta badge/panel is a small, self-contained addition — a few lines of
  markup in the header render function, a toggle function, and (if you want
  the panel's open/closed state to persist across reloads — optional, not
  required by acceptance criteria) a `localStorage` key. Don't build a
  general-purpose modal system for this.
- Everything else in this ticket is `HANDOVER-GOLF-35.md` A1–A6 verbatim —
  don't re-derive it, just implement it.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

## Product-owner tasks

- ~~O1 — Set `DEV_PASSWORD`~~ — **decided 2026-09-13: not needed for this
  beta.** Owner's testers are a small known group contacted directly, not
  the general public, so link-only + `noindex` (already shipped) is
  judged sufficient protection on its own. `DEV_PASSWORD` stays unset;
  the gate code in `functions/_middleware.js` is a no-op in that state
  (`env.DEV_PASSWORD` unset → `next()` on every request) and needs no
  removal — it's simply dormant until/unless a future beta wants it.
  Testers get the **production URL** (`https://golf-map.pages.dev`, or
  the custom domain once Phase B lands) directly — no password, and no
  per-branch preview URL to re-share, since `main`'s deploy always lands
  at the same address.
- **O2** — Sanity-check the beta panel's wording on the production URL
  before the link goes to any real tester. Confirmation, not an open
  design review — the four bullet points are locked.
- **O3** — Decide who gets the beta URL and when to send it. This ticket
  doesn't need to know that; it just needs the app link-only and the
  panel accurate.

## Definition of Done

- All acceptance criteria above pass.
- Existing app functionality (routing, geocoding, hotels, PWA install)
  unaffected.
- `node scripts/test_data.js` + `node scripts/check_js.js` pass.
- Whoever closes this ticket updates: `RISKS.md` R-7 (CORS allowlist now
  live — note rate limiting, Part 2, is still pending the custom domain),
  `BACKLOG.md` (GOLF-129, GOLF-35, GOLF-102 → COMPLETE/DONE as applicable),
  `IN_PROGRESS.md` if it was moved there during build.
- No known blocking issues remain.
