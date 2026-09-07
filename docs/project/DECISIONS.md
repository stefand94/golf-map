# Product decisions

_Stable IDs `DEC-nnn`. Record: decision · context · alternatives · reason ·
date · affected features. Newest first. Full rationale for older calls lives
in `.claude/plans/history/2026-H1-archive.md` — grep by ticket._

## DEC-006 — Cloudflare Pages is the canonical host; dev instance is password-gated

- **Decision:** consolidate hosting onto **Cloudflare Pages** (retire GitHub
  Pages once a custom domain is confirmed stable). The live site goes on a
  custom domain the product owner buys (leaning Cloudflare Registrar). All
  deployments stay **link-only / `noindex`** for now. Preview deployments
  get a **shared-password gate** via a `functions/_middleware.js` Basic-Auth
  check, keyed off a `DEV_PASSWORD` env var set on the **Preview**
  environment only. The ORS proxy Worker gets a **CORS allowlist** now and
  **rate limiting** once it sits on the custom domain.
- **Context:** product owner wants a real URL to share plus a hidden place
  to build/test, and is very keen that no API keys/secrets leak.
- **Alternatives:** keep GitHub Pages canonical (two hosts, no easy dev
  lock); Cloudflare Access / per-user SSO for the dev gate (heavier than
  needed); leave Worker CORS open (quota-abuse risk once public).
- **Reason:** one platform already in use, free preview URLs, at-cost
  domains, and a minimal no-build password gate. Secrets are already
  server-side only (`ORS_API_KEY` in the Worker) — this work keeps it that
  way and closes the CORS/abuse gap.
- **Date:** 2026-09-07 · **Affects:** GOLF-35, GOLF-102, `docs/deploying.md`,
  `ors-proxy.js`, PWA manifest/`sw.js`.

## DEC-005 — Trip sharing v1 ships as a throwaway demo

- **Decision:** the first shareable-trip feature (GOLF-99) is an explicitly
  disposable v1 to get a demo out; it will be rebuilt properly later.
- **Context:** stakeholder wants something shareable now; a robust design
  needs server-side state the app deliberately doesn't have.
- **Alternatives:** wait for a real backend; URL-encoded state only.
- **Reason:** demo value now outweighs throwaway cost.
- **Date:** 2026-09-02 · **Affects:** GOLF-99, GOLF-100.

## DEC-004 — No backend; all state in localStorage

- **Decision:** the app stays a static site with zero persistence layer;
  the only server is the stateless ORS proxy Worker.
- **Alternatives:** add accounts + a database for cross-device trips.
- **Reason:** keeps hosting free and the project solo-maintainable; every
  feature is scoped to fit this.
- **Affects:** everything.

## DEC-003 — Course data is pre-fetched, never fetched at runtime

- **Decision:** all course data is researched offline and hand-merged into
  `data/*.js`; the browser makes zero API calls for course data.
- **Reason:** no API keys in the browser, no rate limits, works offline,
  fast. **Never write a scraper against a site whose ToS forbids it** (the
  GOLF-97/98 BRS Golf finding).
- **Affects:** all data-entry work.

## DEC-002 — Explore mode retired

- **Decision:** the standalone Explore page was removed; its search/filter
  role folded into Plan mode's unified search and nation pills.
- **Date:** 2026-09-04 · **Affects:** `js/app-mode.js`, navigation.

## DEC-001 — Green fees use a banded structured object

- **Decision:** migrate free-text `wd`/`we` to
  `fee:{weekday,weekend,weekendTwilight?,confidence,lastVerified}`.
- **Reason:** enables real fee ranges, filtering, and confidence tracking.
- **Date:** 2026-09-05 (GOLF-97) · **Affects:** GOLF-98, cost model.
