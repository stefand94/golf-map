/* ============================================================
   sw.js — GOLF-80/PWA basics: minimal service worker giving the
   app an installable icon and offline access to the shell + course
   data it already ships as static files. No build step, no
   framework — plain JS, matching every other file in this repo.

   Strategy: cache-first for the static app shell (HTML/js/data/css
   deps), so a repeat visit (or an offline one) loads instantly from
   cache; anything not in the precache list (the ORS proxy, map
   tiles, Google Fonts) falls through to the network untouched — this
   app's live features already degrade gracefully when a fetch fails
   (see ORS_PROXY_URL's empty-string default), so no special offline
   handling is needed for them here.

   Bump CACHE_NAME whenever the precache list changes — the install
   step below writes a fresh cache under the new name and activate
   deletes every other golfmap-shell-* cache, so a version bump is
   also how stale entries get evicted. Also bump it any time the fetch
   handler's caching logic changes (see v3/v4's fixes below) — clients
   that already cached a bad response under the old name need a fresh
   cache to fall back to, since cache-first means the old entry would
   otherwise be served forever regardless of code changes.

   v4 fix (redirect bug, take two — confirmed live via curl + a real
   browser's cache, not assumed): Cloudflare Pages redirects
   /london-golf-map-v5_1.html (308) to the extensionless
   /london-golf-map-v5_1 — the OPPOSITE direction an earlier version of
   this comment claimed. PRECACHE_URLS used to list the .html path, so
   `install`'s cache.addAll() fetched it, silently followed that
   redirect, and stored the REDIRECTED Response under the .html cache
   key — cache.addAll() is a separate browser-internal mechanism that
   never runs through the `fetch` handler below, so v3's redirect-
   cleanup logic never touched it. Every navigation to the .html URL
   (which is exactly what index.html's meta-refresh sends every root
   visitor to, and what manifest.json's start_url used to send an
   installed PWA to) then hit `caches.match(req)` at the very top of
   the fetch handler and got that poisoned entry back directly —
   `net::ERR_FAILED`, reproduced live. Two fixes, both applied: (1)
   PRECACHE_URLS below now lists the canonical redirect-free
   extensionless URL, and (2) `install` no longer uses cache.addAll —
   it fetches each precache URL itself and rebuilds a clean Response
   whenever one comes back redirected, exactly like the fetch handler
   already did, so this whole bug class can't recur even if a future
   entry accidentally points at a URL that redirects. index.html and
   manifest.json were also pointed at the extensionless URL directly,
   so the redirect is avoided on the primary path entirely rather than
   merely cleaned up after the fact.

   v5 fix (adversarial review findings, both confirmed real): (1)
   `install`'s per-URL loop used to call cache.put() inside each fetch's
   own .then(), independently — so a single persistently-failing
   PRECACHE_URLS entry (e.g. a 404) still let every OTHER url that
   resolved first get durably written into the new cache before
   Promise.all rejected and install aborted, leaving a partially-
   populated cache behind while this SW never activated. cache.addAll()
   itself is atomic (all-or-nothing) — the loop below now matches that:
   every URL is fetched and cleaned first, and cache.put() only runs
   once ALL of them have already succeeded. (2) './' (the app's actual
   root landing page — index.html's redirect stub) was never in
   PRECACHE_URLS, so a visitor who installs the SW but never happens to
   visit '/' while online (e.g. always arrives via a bookmark straight
   to /london-golf-map-v5_1) then goes offline and navigates to '/' hit
   a raw network error instead of a graceful offline fallback. Added
   below.

   v6 fix (GOLF-122, stale-after-deploy): the fetch handler was
   cache-first for *everything* same-origin, including the HTML
   navigation — so after a deploy the old SW served the stale shell
   instantly and the new CACHE_NAME only took effect on the *next*
   load, making every deploy look like it needed a double-reload.
   Navigation requests (req.mode === 'navigate') are now network-first:
   try the network, run the same redirect-cleanup, refresh the cache,
   and only fall back to cache (then to the canonical
   './london-golf-map-v5_1' shell) when offline. Scripts, data, images,
   manifest and icons are unchanged — still cache-first, since they get
   a fresh CACHE_NAME whenever their content changes and that's what
   keeps repeat/offline loads instant. */
const CACHE_NAME = 'golfmap-shell-v5-41ea663de0';

const PRECACHE_URLS = [
  './',
  './london-golf-map-v5_1',
  './manifest.json',
  './images/icon.svg',
  './images/icon-maskable.svg',
  './js/util.js',
  './js/trip-model.js',
  './js/state.js',
  './js/map.js',
  './js/trip-geo.js',
  './js/trip-route.js',
  './js/trip-add.js',
  './js/ors.js',
  './js/trip-ui.js',
  './js/app-mode.js',
  './js/handicap.js',
  './js/explore.js',
  './js/editor.js',
  './js/touch-dnd.js',
  './js/boot.js',
  './data/config.js',
  './data/stations.js',
  './data/rail-geometry.js',
  './data/courses-london.js',
  './data/courses-top100.js',
  './data/courses-scotland.js',
  './data/courses-wales.js',
  './data/courses-ireland.js',
  './data/courses-southafrica.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) =>
        fetch(url).then((res) => {
          // Match cache.addAll()'s fail-fast behavior: a broken precache
          // URL should fail install loudly (the browser retries later),
          // not silently ship a shell missing one of its own files.
          if (!res.ok) throw new Error(`Precache fetch failed for ${url}: ${res.status}`);
          // See the v4 note up top: never let a redirected Response reach
          // the cache under a precache key, regardless of which URL or
          // why it redirected — caches.match() doesn't care what request
          // mode *created* the entry, only what's stored under that key,
          // so a redirected entry here is a landmine for any later
          // navigation that happens to match it.
          const clean = res.redirected
            ? res.blob().then((body) => new Response(body, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
              }))
            : Promise.resolve(res);
          // v5 fix: return the {url,out} pair instead of writing to the
          // cache here — see the v5 note up top. Writing only happens
          // below, once every fetch in this Promise.all has already
          // resolved, so a failure anywhere leaves the cache untouched
          // rather than partially populated.
          return clean.then((out) => ({ url, out }));
        })
      ))
        .then((entries) => Promise.all(entries.map(({ url, out }) => cache.put(url, out)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('golfmap-shell-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Rebuild a clean, redirect-free Response with the same body/status/
// headers. Chrome refuses to let a service worker satisfy a *navigation*
// request with a Response whose `redirected` flag is true ("Response
// served by service worker has redirections"), and a redirected Response
// reaching the cache is a landmine for any later navigation that matches
// it. Cloudflare Pages serves this app's clean/extensionless URL (e.g.
// /london-golf-map-v5_1) via an internal redirect, so fetch(req) picks
// up that flag on first load. Scripts/data/images are unaffected by the
// restriction, but running them through this is harmless.
function stripRedirect(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then((body) => new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  }));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GETs — everything else (the ORS Worker,
  // Leaflet tiles, Google Fonts) passes straight through to the
  // network exactly as if this service worker didn't exist.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // GOLF-122: network-first for navigation requests (the HTML documents —
  // './' and './london-golf-map-v5_1') so a single reload after a deploy
  // shows fresh content. Cache-first served the stale shell instantly and
  // the new version only took effect on the *next* load, so every deploy
  // looked like it needed a double-reload. Everything else stays
  // cache-first below — those files get a fresh CACHE_NAME whenever their
  // content changes, so cache-first is both correct and what keeps
  // repeat/offline loads instant.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => stripRedirect(res).then((out) => {
          if (out && out.ok) {
            const copy = out.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return out;
        }))
        // Offline: fall back to this request's cached copy, then to the
        // canonical shell so any in-app URL still renders.
        .catch(() => caches.match(req)
          .then((hit) => hit || caches.match('./london-golf-map-v5_1')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => stripRedirect(res).then((out) => {
        // Opportunistically cache anything same-origin and OK that
        // wasn't in the precache list (e.g. a data file added later
        // without a service-worker update) so it's available offline
        // on the next visit too.
        if (out && out.ok) {
          const copy = out.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return out;
      })).catch(() => cached);
    })
  );
});
