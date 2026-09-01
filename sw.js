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
   handler's caching logic changes (see v3's fix below) — clients that
   already cached a bad response under the old name need a fresh cache
   to fall back to, since cache-first means the old entry would
   otherwise be served forever regardless of code changes. */
const CACHE_NAME = 'golfmap-shell-v3';

const PRECACHE_URLS = [
  './london-golf-map-v5_1.html',
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
      .then((cache) => cache.addAll(PRECACHE_URLS))
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GETs — everything else (the ORS Worker,
  // Leaflet tiles, Google Fonts) passes straight through to the
  // network exactly as if this service worker didn't exist.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Chrome refuses to let a service worker satisfy a *navigation*
        // request with a Response whose `redirected` flag is true — it
        // throws "Response served by service worker has redirections".
        // Cloudflare Pages serves this app's clean/extensionless URL
        // (e.g. /london-golf-map-v5_1) via an internal redirect to the
        // real .html file, so a plain `fetch(req)` here picks up that
        // flag on first load. Rebuild a clean Response with the same
        // body/status/headers but no redirect history — everything else
        // (scripts, data, images) is unaffected by this restriction and
        // uses res as-is.
        //
        // v3 fix: this rebuild MUST happen before the opportunistic
        // cache-write below, not after. v2 cached `res` itself (the
        // still-redirected response) here, then returned the cleaned
        // version only for that one response — every later visit hit
        // caches.match(req) above and got the *cached, still-redirected*
        // copy back directly, permanently bypassing this fix. Cache
        // whatever we're about to return, never the raw fetch result.
        const finalRes = (req.mode === 'navigate' && res.redirected)
          ? res.blob().then((body) => new Response(body, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            }))
          : Promise.resolve(res);

        return finalRes.then((out) => {
          // Opportunistically cache anything same-origin and OK that
          // wasn't in the precache list (e.g. a data file added later
          // without a service-worker update) so it's available offline
          // on the next visit too.
          if (out && out.ok) {
            const copy = out.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return out;
        });
      }).catch(() => cached);
    })
  );
});
