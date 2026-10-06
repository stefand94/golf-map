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
   and only fall back to cache (then to the './' shell — GOLF-214 moved
   the app there from './london-golf-map-v5_1') when offline. Scripts, data, images,
   manifest and icons are unchanged — still cache-first, since they get
   a fresh CACHE_NAME whenever their content changes and that's what
   keeps repeat/offline loads instant. */
const CACHE_NAME = 'golfmap-shell-v5-6f3f6a2e71';

/* GOLF-147: hotel-layer.js (GOLF-142) and trip-share.js were both added to the
   page's <script> list without ever being added here, so the SW precached
   neither — they were re-fetched from the network on every load and were
   simply missing offline. Nothing intentional about the omission, just a list
   that didn't get updated. scripts/check_js.js now asserts this array and the
   HTML's script tags agree, so the next new module can't repeat it.

   GOLF-148: './data/pois-categories.js' is here but the per-region
   './data/pois-*.js' files deliberately are NOT — precaching them would pull
   every region (~450KB gzipped) on install and defeat the lazy load. The
   category list is 1KB and js/poi.js cannot render a chip without it, so it
   is precached and stays cache-first; the region files are network-first in
   the fetch handler (see isPoiRegionData).

   Keep entries as plain quoted strings with no inline comments:
   scripts/update_sw_cache_version.py parses this array textually. */
const PRECACHE_URLS = [
  './',
  './manifest.json',
  './images/icon.svg',
  './images/icon-maskable.svg',
  './js/app-version.js',
  './js/util.js',
  './js/course-id.js',
  './js/affiliate.js',
  './js/timeline.js',
  './js/timeline-ui.js',
  './js/trip-model.js',
  './js/state.js',
  './js/map.js',
  './js/trip-geo.js',
  './js/trip-route.js',
  './js/trip-add.js',
  './js/ors.js',
  './js/hotel-layer.js',
  './js/poi.js',
  './js/trip-ui.js',
  './js/app-mode.js',
  './js/mobile-sheet.js',
  './js/trip-share.js',
  './js/handicap.js',
  './js/explore.js',
  './js/course-filters.js',
  './js/editor.js',
  './js/touch-dnd.js',
  './js/boot.js',
  './data/config.js',
  './data/pois-categories.js',
  './data/stations.js',
  './data/rail-geometry.js',
  './data/airports.js',
  './data/rail-stations.js',
  './data/courses-london.js',
  './data/courses-top100.js',
  './data/courses-scotland.js',
  './data/courses-wales.js',
  './data/courses-ireland.js',
  './data/courses-southafrica.js',
  './data/course-ids.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) =>
        // cache:'reload' — the shell files ship with
        // `cache-control: public, max-age=14400`, so a bare fetch() here is
        // answered from the browser's own HTTP cache. On the deploy that
        // fixed GOLF-184 that produced the worst possible outcome: a cache
        // bucket correctly named with the NEW CACHE_NAME, populated entirely
        // with PRE-deploy bytes. Nothing ever repairs it, because the name
        // only changes on the next deploy. Going to the network for every
        // precache entry is the whole point of an install triggered by a
        // content hash.
        fetch(url, { cache: 'reload' }).then((res) => {
          // Match cache.addAll()'s fail-fast behavior: a broken precache
          // URL should fail install loudly (the browser retries later),
          // not silently ship a shell missing one of its own files.
          if (!res.ok) throw new Error(`Precache fetch failed for ${url}: ${res.status}`);
          // GOLF-220: cache:'reload' gets past the browser's HTTP cache but
          // not the edge, which can hold the previous deployment's bytes
          // (functions/_middleware.js). Every response now says which
          // build it came from; another build's copy fails the install and
          // the browser retries later. No header (local dev, or a response
          // from before GOLF-220) is taken on trust, as before.
          if (!sameBuild(res)) throw new Error(`Precache got build ${res.headers.get('X-Build')} for ${url}, want ${BUILD}`);
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
// it. Cloudflare Pages answers some URLs with a redirect of its own (e.g.
// /index.html -> /, and since GOLF-214 the old /london-golf-map-v5_1 ->
// /), so fetch(req) can pick up that flag. Scripts/data/images are unaffected by the
// restriction, but running them through this is harmless.
function stripRedirect(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then((body) => new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  }));
}

/* GOLF-210: index.html asks for every local script as `?v=<build>`, the
   last segment of CACHE_NAME (scripts/update_sw_cache_version.py stamps
   both). Precache entries are stored without the query, so a request for
   this worker's own build is answered from the precache by its bare path.
   A request for a DIFFERENT build (new HTML reached us before this worker
   was replaced) goes to the network and is never cached here: serving this
   cache's copy is exactly the old-JS-on-new-HTML mix the stamp prevents.
   Worker versions from before GOLF-210 match the full URL, miss, and fetch
   the right build too, which is what makes the change safe to roll out. */
const BUILD = CACHE_NAME.slice(CACHE_NAME.lastIndexOf('-') + 1);
function sameBuild(res) {
  const b = res.headers.get('X-Build');
  return !b || b === BUILD;
}

// GOLF-214: the app moved from /london-golf-map-v5_1 to /. The server 301s
// the old address, but answering it here as well keeps that working
// offline, e.g. for a PWA installed with the old start_url. The browser
// keeps the #trip / #share= hash across the redirect.
const LEGACY_APP_PATH = /\/london-golf-map-v5_1(\.html)?$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GETs — everything else (the ORS Worker,
  // Leaflet tiles, Google Fonts) passes straight through to the
  // network exactly as if this service worker didn't exist.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && LEGACY_APP_PATH.test(url.pathname)) {
    event.respondWith(Response.redirect(new URL('./', self.location).href + url.search, 301));
    return;
  }

  // The cache key: the URL without its ?v= stamp (see BUILD above).
  const reqBuild = url.searchParams.get('v');
  url.searchParams.delete('v');
  const key = url.href;
  const ownBuild = !reqBuild || reqBuild === BUILD;

  // GOLF-122: network-first for navigation requests (the HTML document)
  // so a single reload after a deploy shows fresh content. Cache-first
  // served the stale shell instantly and the new version only took effect
  // on the *next* load, so every deploy looked like it needed a
  // double-reload. Everything else stays cache-first below — those files
  // get a fresh CACHE_NAME whenever their content changes, so cache-first
  // is both correct and what keeps repeat/offline loads instant.
  // GOLF-148: the POI dataset (data/pois-*.js) is deliberately NOT in
  // PRECACHE_URLS — precaching would download every region (~450KB gz) on
  // install, defeating the lazy load. It also can't be cache-first: its
  // content changes without CACHE_NAME changing (CACHE_NAME only tracks
  // precached files), so a returning visitor would keep stale sights
  // forever. Network-first (a cheap 304 when unchanged), cache as the
  // offline fallback.
  // pois-categories.js is deliberately NOT matched here — it IS precached, so
  // it follows the normal cache-first path and refreshes when CACHE_NAME bumps,
  // exactly like the course data. Only the lazy region files are network-first.
  const isPoiRegionData = /\/data\/pois-(?!categories\.js$)[a-z]+\.js$/.test(url.pathname);
  if (req.mode === 'navigate' || isPoiRegionData) {
    event.respondWith(
      fetch(req)
        .then((res) => stripRedirect(res).then((out) => {
          if (out && out.ok && sameBuild(out)) {
            const copy = out.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
          }
          return out;
        }))
        // Offline: fall back to this request's cached copy, then to the
        // app shell so any in-app URL still renders.
        .catch(() => caches.match(key)
          .then((hit) => hit || (isPoiRegionData ? Response.error() : caches.match('./'))))
    );
    return;
  }

  event.respondWith(
    (ownBuild ? caches.match(key) : Promise.resolve(undefined)).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => stripRedirect(res).then((out) => {
        // Opportunistically cache anything same-origin and OK that
        // wasn't in the precache list (e.g. a data file added later
        // without a service-worker update) so it's available offline
        // on the next visit too — but only for this worker's own build.
        if (ownBuild && out && out.ok && sameBuild(out)) {
          const copy = out.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
        }
        return out;
      // Offline and asked for another build: this cache's copy is the only
      // one there is. The page's build check (index.html) notices the
      // mismatch and recovers once it is back online.
      })).catch(() => caches.match(key));
    })
  );
});
