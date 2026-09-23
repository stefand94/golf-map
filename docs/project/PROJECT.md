# Golf Map — project summary

_Living doc. Maintained via the `golf-ba-pm` skill. Keep it short._

## What it is

A solo-built, **zero-backend static web app** for planning golf trips around
Great Britain, Ireland and South Africa. Two modes in one pane:

- **Plan** (`#`, default) — search / discover courses, build a wishlist.
- **Build** (`#trip`) — arrange courses across days, estimate drive time and
  cost, add hotels and heritage POIs.
- **Shared** (`#share=…`) — read-only view of a trip someone shared.

## Users

One persona: an enthusiast planning a multi-day golf road trip for a small
group. No accounts — each visitor's trips/corrections/filters live only in
their own browser `localStorage` (`golfmap:v1`).

## Architecture (the hard constraints every requirement is scoped against)

- Static site, **no build step, no framework**. Plain ordered `<script src>`
  tags; globals, not modules (inline `onclick=` handlers depend on it).
- **No database, no server** except one stateless Cloudflare Worker
  (`scripts/cloudflare-worker/ors-proxy.js`) that proxies OpenRouteService
  (directions / geocoding) and OSM Overpass (POIs, hotels) to keep API keys
  server-side.
- All course data is **pre-fetched offline** into `data/*.js` and hand-merged
  — zero runtime API calls for course data. 557 courses (114 England Top 100).
- Hosted on **Cloudflare Pages**, live at **golftripper.uk** (GOLF-35
  Phase B; auto-deploys from `main`; per-branch previews stay on
  `<branch>.golf-map.pages.dev`, and the bare pages.dev address redirects to
  golftripper.uk). The Worker is at `api.golftripper.uk`. GitHub Pages is
  retired (DEC-006, switched off 2026-09-20). See `docs/deploying.md`.
- Link-only for now: blanket `noindex`/`robots.txt` (GOLF-35 Phase A,
  shipped 2026-09-13) — not search-indexed, but no password gate either
  (owner decision: the small, directly-contacted beta tester group makes
  that unnecessary for now).

## Current phase

**Beta**, as of 2026-09-13 (GOLF-129) — the app is link-only-hosted and
carries an in-app "Beta" badge/panel for testers; owner is now deciding
who to send the (static) production URL to. Alongside that: incremental
data-quality work (GOLF-98 real green-fee entry) plus small UX tickets.
No large rewrite in flight. See `IN_PROGRESS.md` / `BACKLOG.md`.

## Reference

- `CLAUDE.md` — engineering guide · `SCHEMA.md` — data fields ·
  `TESTING.md` — verification · `.claude/plans/history/2026-H1-archive.md` —
  full Phase 1–36 history (grep by ticket number).
