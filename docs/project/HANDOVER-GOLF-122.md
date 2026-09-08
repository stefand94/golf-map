# Handover — GOLF-122: stale content after deploy (service-worker update lag)

**For:** a coding agent (fresh Claude Code session in this repo, not a BA/PM one).
**Date:** 2026-09-08
**Read first:** `CLAUDE.md`, `docs/pwa.md`, then `sw.js` in full (its
header comment documents the v3/v4/v5 redirect fixes you must not
regress).
**Branch:** `golf-122-sw-networkfirst`, not `main`. Push for a Cloudflare
preview.
**Size:** S. **Priority:** P1 — pre-go-live hygiene.

**Verify before push:**
```bash
node scripts/check_js.js
node scripts/test_data.js
```

---

## Problem

`https://golf-map.pages.dev/london-golf-map-v5_1` serves the *previous*
deploy until the page is reloaded twice. Cloudflare Pages is fine (it
purges its edge cache on every deploy) — the cause is `sw.js`.

The `fetch` handler is **cache-first for everything same-origin**,
including the HTML navigation. So on each visit after a deploy: the old
service worker serves the cached (stale) shell instantly; the new `sw.js`
+ `CACHE_NAME` install in the background and only control the *next*
load. The `CACHE_NAME` bump (done automatically by the pre-push hook)
already evicts the old cache correctly — the issue is purely *when* fresh
HTML reaches an open tab.

## Fix — network-first for navigations only

In `sw.js`'s `fetch` handler, split the strategy:

- **Navigation requests** (`req.mode === 'navigate'`, i.e. the HTML
  documents — `./` and `./london-golf-map-v5_1`): **network-first**.
  Try `fetch(req)`; on success, run the existing redirect-cleanup
  (rebuild a clean `Response` when `res.redirected` — the v4/v5 logic is
  already in this handler, reuse it), write a copy to `CACHE_NAME`, and
  return it. On network failure, fall back to `caches.match(req)`, then
  to `caches.match('./london-golf-map-v5_1')`.
- **Everything else** (`js/*.js`, `data/*.js`, images, manifest):
  **unchanged — cache-first.** These are the files that make repeat/offline
  loads instant, and they already get a fresh `CACHE_NAME` whenever their
  content changes, so cache-first is correct for them.

Keep `self.skipWaiting()` (install) and `self.clients.claim()` (activate)
as they are.

### Must not regress
- The redirect handling: Cloudflare Pages serves the extensionless URL
  via an internal redirect; a `redirected` Response reaching the cache or
  satisfying a navigation throws `ERR_FAILED` /
  "Response served by service worker has redirections". The clean-rebuild
  must still run on the network-first path.
- Offline: with the network unreachable, both `./` and
  `./london-golf-map-v5_1` must still render from cache.
- Non-same-origin / non-GET requests still pass straight through (ORS
  Worker, map tiles, Google Fonts) — that early `return` stays.

### Out of scope
- No "new version available" toast, no auto-reload on `controllerchange`
  (a forced reload can interrupt an in-progress trip edit). Network-first
  on the HTML is enough to kill the perceived staleness. Note it as a
  possible future enhancement if you like, don't build it.
- No change to the precache list or the pre-push `CACHE_NAME` hook.

## Acceptance criteria
- [ ] Deploy a visible change to the preview; open an already-visited
      tab and do **one** normal reload → the change is visible (no
      double-reload, no DevTools "Update on reload").
- [ ] With DevTools offline, both `/` and `/london-golf-map-v5_1` still
      load from cache and the app renders.
- [ ] First load on a fresh browser profile works — no `ERR_FAILED`, no
      "redirections" console error.
- [ ] `js/*.js` and `data/*.js` still load with the network throttled/off
      (cache-first retained).
- [ ] `CACHE_NAME` bumped (the hook does this on push; confirm it changed).
- [ ] `check_js.js` passes.

## Definition of done
- Network-first navigation in `sw.js`; everything else cache-first.
- Redirect-cleanup and offline fallback both still work.
- Acceptance criteria checked on the Cloudflare preview URL specifically
  (this bug only reproduces against a real deploy, not `./scripts/serve.sh`).
- Test/scratch `localStorage` and any registered dev service worker
  cleared before you finish.

> Inspect the existing codebase and follow established project patterns
> before introducing anything new.
