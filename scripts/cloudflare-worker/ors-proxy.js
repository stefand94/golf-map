/**
 * GOLF-45 / GOLF-46 / GOLF-50 / GOLF-55 / GOLF-56 / GOLF-142 — ORS
 * driving-time + route + POI + geocoding + hotel proxy, auto-deployed via
 * Cloudflare's Git integration (build root directory:
 * scripts/cloudflare-worker).
 * ORS_API_KEY is set under the Build's own "Variables and secrets"
 * section and needs a fresh build to bind — it doesn't apply
 * retroactively to a running deployment.
 *
 * A stateless Cloudflare Worker that stands between the golf map (a fully
 * static page with no backend of its own) and OpenRouteService. It exists
 * for exactly one reason: calling ORS straight from the browser would put
 * the ORS API key in the page's own JS, where anyone could copy it and
 * burn the free 2,500-req/day quota. This Worker holds the key
 * server-side (as an encrypted secret, never in this file) and forwards
 * three kinds of request:
 *
 *   1. Driving time/distance/route (GOLF-45/GOLF-50, default — no "mode"
 *      field needed):
 *      POST {origin:[lng,lat], destination:[lng,lat]}
 *      -> {minutes, miles, route: [[lat,lng],...] | null}
 *
 *   2. Nearby points of interest (GOLF-46):
 *      POST {mode:'pois', point:[lng,lat], radius?:metres, categories?:[id,...]}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   3. Place search / geocoding (GOLF-56 — start/free/end day locations):
 *      POST {mode:'geocode', text:'Newquay'}
 *      -> {results:[{label, lat, lng}, ...]}
 *
 *   4. Heritage points of interest — castles, distilleries, historic
 *      sites (GOLF-79 — a thematic sibling of mode:'pois' above, sourced
 *      from OpenStreetMap's Overpass API instead of ORS since Overpass
 *      already indexes exactly these tags for free, no key needed):
 *      POST {mode:'heritage-pois', point:[lng,lat], radius?:metres}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   5. Nearby hotels/guest houses (GOLF-96 — Trip Builder's "Add a stay"
 *      map picker), also Overpass-sourced, no ORS key needed:
 *      POST {mode:'hotels', point:[lng,lat], radius?:metres}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   6. Hotels within the current map viewport (GOLF-142 — ambient "Show
 *      hotels" browsing layer, distinct from #5's point-based picker),
 *      same Overpass source/shape, bbox instead of point+radius:
 *      POST {mode:'hotelsViewport', bbox:[south,west,north,east]}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 * No database, no state, no logging of requests beyond Cloudflare's own
 * standard request logs — a pure pass-through either way.
 *
 * --- Deploy steps (Cloudflare dashboard, no CLI needed) ---
 * 1. dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker.
 * 2. Give it any name (e.g. "golf-map-ors-proxy") -> Deploy the default
 *    starter, then click "Edit code".
 * 3. Delete the starter code and paste in this entire file. Save/Deploy.
 * 4. Worker -> Settings -> Variables and Secrets -> Add:
 *      Name:  ORS_API_KEY
 *      Value: <your OpenRouteService API key>
 *      Type:  Secret (encrypted) — NOT a plain-text variable.
 *    Save/Deploy again so the Worker picks it up.
 * 5. Copy the Worker's *.workers.dev URL (shown on the Worker's overview
 *    page) and send it back — it goes into ORS_PROXY_URL in
 *    london-golf-map-v5_1.html, nothing else needs to change on your end.
 *    (If you're re-pasting this file to add GOLF-46 support to an
 *    already-deployed Worker, no new secret or URL change is needed —
 *    ORS_API_KEY and the Worker's URL both stay exactly as they are.)
 */

// GOLF-50: the /geojson variant returns the actual route geometry
// alongside the same duration/distance summary the plain endpoint gives —
// no extra request, no extra cost, just a different response shape.
const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const ORS_POIS_URL = 'https://api.openrouteservice.org/pois';
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
// GOLF-79: Overpass, not ORS — a free, no-key OpenStreetMap query service.
//
// GOLF-147 correction: this list used to be the other way round, on the
// documented theory that overpass-api.de "blocks Cloudflare Worker egress
// IPs" because every call from inside the Worker failed while the identical
// call from a laptop succeeded. That diagnosis was wrong. The real cause is
// the User-Agent: overpass-api.de answers 406 Not Acceptable to a request
// that doesn't send one, and Workers' fetch() sends no User-Agent by
// default — which is also why a plain `curl`/urllib call (equally
// UA-less) reproduces the same 406 from an ordinary machine. It was never
// about the IP. Sending OVERPASS_UA below fixes it outright.
//
// That matters because the two mirrors are not interchangeable on speed.
// Measured 2026-09-19 over four real viewports (St Andrews, Edinburgh,
// Sandwich, Cape Town):
//
//     overpass-api.de   median  2.85s   max  9.73s
//     maps.mail.ru      median 13.38s   max 47.75s
//
// so the Worker had been pinned to the slow mirror for the whole life of
// the feature. overpass-api.de is primary now, with maps.mail.ru kept as
// fallback (it does return correct data, just slowly). overpass.osm.ch was
// tried historically and returned stale/broken data — do not re-add it;
// overpass.kumi.systems and overpass.private.coffee were tested here and
// both timed out past 70s.
//
// Both mirrors still 504 under load, so overpassFetch() below hedges across
// this list rather than walking it strictly serially.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
// Overpass instances ask callers to identify themselves, and overpass-api.de
// hard-rejects (406) anyone who doesn't. Contact URL included per the
// OSM API usage-policy convention.
const OVERPASS_UA = 'golf-map/1.0 (+https://golf-map.pages.dev; trip planner)';
// A leg between two golf courses rarely needs more than a couple hundred
// points to look like a real road at map zoom levels — cap it so the
// response (and what ends up cached in localStorage) stays small.
const ROUTE_MAX_POINTS = 150;

// GOLF-102 Part 1 / GOLF-35 Phase A3 — CORS allowlist. Kept as one
// clearly-labelled const so adding the real custom domain in Phase B is a
// one-line edit (see the marker below).
const ALLOWED_ORIGINS = [
  'https://golf-map.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
  // Phase B: add the real domain here, e.g. 'https://golftripplanner.com'
];
// Preview deployments get a per-branch subdomain of the same project —
// *.golf-map.pages.dev — matched by suffix rather than enumerated.
const ALLOWED_ORIGIN_SUFFIX = '.golf-map.pages.dev';

// Known limitation: this only blocks browser calls from other web pages —
// a direct script/curl request carries no Origin header at all and isn't
// affected by CORS either way. That gap is what Phase B rate limiting
// (GOLF-102 Part 2, once the Worker is on the custom domain) covers.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ':'))) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(ALLOWED_ORIGIN_SUFFIX);
  } catch (e) {
    return false;
  }
}

/* ── GOLF-146: edge cache for the Overpass-backed modes.

   Measured live on 2026-09-19, a single `hotelsViewport` query took 17.0s,
   another timed out past 45s, and a third came back 502 (Overpass 521).
   Nothing client-side can make that feel live (see GOLF-144), but almost
   every real request is for somewhere already looked at — panning back over
   a town, reopening a trip, a second visitor looking at the same course — so
   the same Overpass answer gets paid for again and again.

   Uses the Cache API (`caches.default`) rather than KV: it's free, it's
   edge-local so a hit costs no round trip at all, and this data is pure
   derived cache with no correctness requirement — a miss just means the
   slow path, exactly as today. It also cuts call volume against Overpass,
   which DEC-016's fair-use constraint makes a goal in its own right.

   Two things this deliberately does NOT do: it doesn't cache ORS routing
   or geocoding (those are keyed by exact coordinates, so hit rates would be
   near zero and ORS's own terms are a separate question), and it never
   caches a non-200 — an Overpass 521 must not be remembered for a day. */
const POI_CACHE_TTL_S = 86400; // 24h — hotels/POIs move on a scale of years

/* Cache API keys on a Request, and a POST body isn't part of that key, so
   every mode builds a synthetic GET URL standing in for its parameters.
   The hostname is never resolved — it exists only to make a valid URL. */
function poiCacheKey(mode, parts) {
  const u = new URL('https://poi-cache.invalid/' + encodeURIComponent(mode));
  u.searchParams.set('k', parts.join(','));
  return new Request(u.toString(), { method: 'GET' });
}

/* Snapping a viewport to a fixed grid is what makes this worth having: an
   un-snapped bbox changes on every pixel of pan, so each request would be a
   unique key and the hit rate would be ~0. Snapping *outward* (floor the
   south/west corner, ceil the north/east) means the cached area always fully
   covers the area asked for, so a hit is never missing pins at the edges —
   and any pan within one grid cell is a guaranteed hit. GRID of 0.01° is
   roughly 1.1km, comfortably finer than the ~5km viewport the client's zoom
   gate allows, and adds at most 0.02° to a span (irrelevant against
   handleHotelsViewport's 0.6° cap). */
const POI_CACHE_GRID = 0.01;
function snapBboxOut([south, west, north, east]) {
  const g = POI_CACHE_GRID;
  return [
    Math.floor(south / g) * g,
    Math.floor(west / g) * g,
    Math.ceil(north / g) * g,
    Math.ceil(east / g) * g,
  ].map((n) => Number(n.toFixed(4)));
}

/* Wraps a handler that returns a Response. On a hit the stored body is
   re-wrapped with *freshly computed* CORS headers — the cached entry is
   stored without them on purpose, because Access-Control-Allow-Origin
   reflects the calling origin and serving one visitor's origin to another
   from cache would be a real bug. */
async function withPoiCache(key, request, ctx, handler) {
  const cache = caches.default;
  let hit = null;
  try {
    hit = await cache.match(key);
  } catch (e) {
    hit = null; // cache unavailable is never fatal — fall through to the slow path
  }
  if (hit) {
    return new Response(hit.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-POI-Cache': 'HIT', ...corsHeaders(request) },
    });
  }
  const res = await handler();
  if (res.status === 200) {
    try {
      const body = await res.clone().text();
      const store = new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${POI_CACHE_TTL_S}`,
        },
      });
      // waitUntil so the caller isn't held up by the write; falls back to
      // awaiting it when no ctx is available (e.g. a unit test harness).
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cache.put(key, store));
      else await cache.put(key, store);
    } catch (e) {
      /* a failed cache write must never fail the request */
    }
  }
  return res;
}

/* ── GOLF-147: one hedged Overpass call, shared by all three POI modes.

   This replaces three byte-identical copies of a strictly serial retry
   loop. That loop gave the first mirror *unlimited* time and only tried
   the second once the first had failed outright — so it had no answer at
   all to the case that actually dominates here, which isn't "mirror 1
   failed" but "mirror 1 is simply very slow". Measured, the same query
   against the same mirror ranged from 8s to a 50s gateway timeout; the
   run-to-run variance is far larger than any difference between query
   shapes, which is why this ticket doesn't touch the queries themselves.

   So: fire the primary immediately, and if it hasn't answered within
   OVERPASS_HEDGE_AFTER_MS, race the next mirror *alongside* it rather
   than replacing it. First usable response wins and the losers are
   aborted. A second request only ever goes out when the first is already
   slow, so the steady state stays one-call-per-miss — DEC-016's fair-use
   constraint makes "always race every mirror" the wrong default even
   though it would shave a little more off the tail. */
const OVERPASS_HEDGE_AFTER_MS = 4000;
/* Hard ceiling per attempt. The queries carry [timeout:20] themselves, but
   that governs Overpass's own execution budget, not a mirror that accepts
   the connection and then never replies — which is exactly the 70s+ hang
   two candidate mirrors exhibited during testing. */
const OVERPASS_ATTEMPT_TIMEOUT_MS = 25000;

/* Resolves to the first truthy value among `promises`, or null if they all
   resolve falsy. (Promise.any is close but rejects-on-all and would need
   every attempt to throw; these attempts deliberately never reject.) */
function firstTruthy(promises) {
  return new Promise((resolve) => {
    let remaining = promises.length;
    if (!remaining) return resolve(null);
    let done = false;
    for (const p of promises) {
      p.then((v) => {
        if (done) return;
        if (v) { done = true; resolve(v); }
        else if (--remaining === 0) { done = true; resolve(null); }
      });
    }
  });
}

/* Returns { data } on success or { error: {error, status} } on failure —
   never throws, so callers keep the same shape as the old loop's lastError. */
async function overpassFetch(query) {
  const payload = 'data=' + encodeURIComponent(query);
  const controllers = [];
  let lastError = { error: 'could not reach Overpass', status: 502 };

  const attempt = (i) => {
    const ctl = new AbortController();
    controllers.push(ctl);
    const timer = setTimeout(() => ctl.abort(), OVERPASS_ATTEMPT_TIMEOUT_MS);
    return (async () => {
      try {
        const res = await fetch(OVERPASS_URLS[i], {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Non-negotiable: without this overpass-api.de 406s instantly.
            'User-Agent': OVERPASS_UA,
          },
          body: payload,
          signal: ctl.signal,
        });
        if (!res.ok) {
          lastError = { error: 'Overpass request failed', status: res.status };
          return null;
        }
        const data = await res.json();
        // An Overpass-side timeout can come back 200 with a `remark` and no
        // element list, so a missing elements array counts as a failure and
        // lets the other mirror win rather than caching an empty answer.
        if (!data || !Array.isArray(data.elements)) {
          lastError = { error: 'Overpass returned no result set', status: 502 };
          return null;
        }
        return data;
      } catch (e) {
        lastError = {
          error: e && e.name === 'AbortError' ? 'Overpass timed out' : 'could not reach Overpass',
          status: 502,
        };
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
  };

  const live = [attempt(0)];
  let hedgeTimer = null;
  const hedgeGate = new Promise((r) => { hedgeTimer = setTimeout(r, OVERPASS_HEDGE_AFTER_MS); });
  // Settles early either way: on data (return it) or on a fast failure
  // (falsy -> hedge immediately rather than sitting out the full delay).
  const early = await Promise.race([live[0], hedgeGate.then(() => undefined)]);
  clearTimeout(hedgeTimer);
  if (early) return { data: early };

  for (let i = 1; i < OVERPASS_URLS.length; i++) live.push(attempt(i));
  const won = await firstTruthy(live);
  // Free the losing sockets; the winner has already been fully read.
  for (const c of controllers) { try { c.abort(); } catch (e) { /* already settled */ } }
  return won ? { data: won } : { error: lastError };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, request);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid JSON body' }, 400, request);
    }

    /* GOLF-146: the three Overpass modes below go through withPoiCache().
       Their cache keys round the anchor point to 3dp (~110m) — these are
       anchored to a day's chosen place or a picker click, so they're already
       effectively discrete and a fine grid still hits; the viewport mode
       needs the coarser snapped grid instead (see snapBboxOut). */
    if (body && body.mode === 'heritage-pois') {
      // GOLF-96: Overpass-only modes need no ORS_API_KEY at all — moved
      // this branch (and 'hotels' below) ahead of the ORS_API_KEY guard so
      // they keep working even when the ORS account/key is down, which has
      // happened for real more than once (see plan Phase 22/25/33).
      if (isCoord(body.point)) {
        const key = poiCacheKey('heritage-pois', [
          body.point[0].toFixed(3), body.point[1].toFixed(3),
          Math.round(typeof body.radius === 'number' ? body.radius : 3000),
        ]);
        return withPoiCache(key, request, ctx, () => handleHeritagePois(body, request));
      }
      return handleHeritagePois(body, request); // let the handler own the 400
    }
    if (body && body.mode === 'hotels') {
      if (isCoord(body.point)) {
        const key = poiCacheKey('hotels', [
          body.point[0].toFixed(3), body.point[1].toFixed(3),
          Math.round(typeof body.radius === 'number' ? body.radius : 3000),
        ]);
        return withPoiCache(key, request, ctx, () => handleHotels(body, request));
      }
      return handleHotels(body, request);
    }
    if (body && body.mode === 'hotelsViewport') {
      // GOLF-142: viewport-bbox sibling of handleHotels() above, for the
      // ambient "Show hotels" map layer (distinct from GOLF-96's
      // point+radius "add a stay" picker, which is left untouched).
      const bbox = body && body.bbox;
      const validBbox = Array.isArray(bbox) && bbox.length === 4 &&
        bbox.every((n) => typeof n === 'number' && !Number.isNaN(n));
      if (validBbox) {
        let [s, w, n, e] = bbox;
        if (s > n) [s, n] = [n, s];
        if (w > e) [w, e] = [e, w];
        const snapped = snapBboxOut([s, w, n, e]);
        // Overpass is asked for the *snapped* cell, not the raw viewport, so
        // what lands in the cache genuinely covers every request that maps to
        // this key — otherwise a later pan inside the cell would get a hit
        // that's short a few pins along one edge.
        const key = poiCacheKey('hotelsViewport', snapped.map((v) => v.toFixed(2)));
        return withPoiCache(key, request, ctx, () =>
          handleHotelsViewport({ ...body, bbox: snapped }, request));
      }
      return handleHotelsViewport(body, request); // let the handler own the 400
    }

    if (!env.ORS_API_KEY) {
      return json({ error: 'ORS_API_KEY secret is not configured on this Worker' }, 500, request);
    }

    if (body && body.mode === 'pois') {
      return handlePois(body, env, request);
    }
    if (body && body.mode === 'geocode') {
      return handleGeocode(body, env, request);
    }
    return handleRoute(body, env, request);
  },
};

async function handleRoute(body, env, request) {
  const { origin, destination } = body || {};
  if (!isCoord(origin) || !isCoord(destination)) {
    return json({ error: 'origin and destination must both be [lng, lat] number pairs' }, 400, request);
  }

  let orsRes;
  try {
    orsRes = await fetch(ORS_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coordinates: [origin, destination] }),
    });
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502, request);
  }

  if (!orsRes.ok) {
    // Common cases: 403 bad/expired key, 429 quota exceeded, 404 no
    // route found between the two points. Pass the status through
    // untranslated so the caller can decide how to fall back.
    return json({ error: 'ORS request failed', status: orsRes.status }, 502, request);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502, request);
  }

  // GOLF-50: the /geojson endpoint wraps the route in a FeatureCollection
  // instead of the plain endpoint's { routes: [...] } shape.
  const feature = data && Array.isArray(data.features) && data.features[0];
  const summary = feature && feature.properties && feature.properties.summary;
  if (!summary) {
    return json({ error: 'no route found' }, 502, request);
  }

  const coords = feature.geometry && feature.geometry.type === 'LineString' ? feature.geometry.coordinates : null;
  return json({
    minutes: summary.duration / 60,
    miles: summary.distance / 1609.344,
    // [lat, lng] pairs (flipped from GeoJSON's [lng, lat]) so the client
    // can feed this straight to Leaflet without any conversion.
    route: coords ? simplifyRoute(coords.map((c) => [c[1], c[0]])) : null,
    // GOLF-149: the 200 is NOT optional here. json()'s signature is
    // (obj, status, request), and GOLF-129 added `request` to this call in
    // the *status* position — so every successful route tried to build a
    // Response with a Request object as its status and threw, surfacing as
    // a Cloudflare 1101. Only the error paths above (which pass a status)
    // still worked, which is why routing failed silently and completely
    // while every other mode looked healthy.
  }, 200, request);
}

function simplifyRoute(points) {
  if (points.length <= ROUTE_MAX_POINTS) return points;
  const step = points.length / ROUTE_MAX_POINTS;
  const out = [];
  for (let i = 0; i < ROUTE_MAX_POINTS; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

async function handlePois(body, env, request) {
  const { point } = body || {};
  if (!isCoord(point)) {
    return json({ error: 'point must be a [lng, lat] number pair' }, 400, request);
  }
  // Clamp the buffer so a bad client value can't turn into a huge/slow
  // ORS query — 200m to 5km, defaulting to 1.5km (a sensible "near this
  // overnight stop" radius for food/fuel/accommodation).
  const rawRadius = typeof body.radius === 'number' ? body.radius : 1500;
  const radius = Math.min(5000, Math.max(200, rawRadius));

  const orsBody = {
    request: 'pois',
    geometry: {
      geojson: { type: 'Point', coordinates: point },
      buffer: radius,
    },
    limit: 30,
  };
  if (Array.isArray(body.categories) && body.categories.length) {
    // ORS caps category_ids at 5 entries per request (confirmed against
    // the live API — a 6th causes a 400) — defensively cap here too so a
    // future client-side change can't silently start 400ing.
    orsBody.filters = { category_ids: body.categories.slice(0, 5) };
  }

  let orsRes;
  try {
    orsRes = await fetch(ORS_POIS_URL, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orsBody),
    });
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502, request);
  }

  if (!orsRes.ok) {
    return json({ error: 'ORS request failed', status: orsRes.status }, 502, request);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502, request);
  }

  const features = Array.isArray(data && data.features) ? data.features : [];
  const pois = features
    .map((f) => {
      const props = (f && f.properties) || {};
      const osm = props.osm_tags || {};
      const coords = f && f.geometry && f.geometry.coordinates;
      // ORS's category_ids on a feature is keyed by id -> {category_name,...};
      // just take whichever comes first for a simple one-line label.
      const catEntry = props.category_ids && Object.values(props.category_ids)[0];
      return {
        name: osm.name || osm.brand || 'Unnamed',
        category: (catEntry && catEntry.category_name) || null,
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      };
    })
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');

  return json({ pois }, 200, request);
}

// GOLF-79: castles, distilleries, and a small curated set of other
// historic/tourism points near a given spot — a thematic sibling of
// handlePois() above (fuel/food/lodging), sourced from Overpass instead of
// ORS since Overpass already tags exactly these things for free.
async function handleHeritagePois(body, request) {
  const { point } = body || {};
  if (!isCoord(point)) {
    return json({ error: 'point must be a [lng, lat] number pair' }, 400, request);
  }
  // Same clamp policy as handlePois(): 200m to 5km, defaulting to 3km — a
  // castle or distillery is worth a slightly wider net than "food near
  // tonight's stop" since these are detour-worthy, not walk-to.
  const rawRadius = typeof body.radius === 'number' ? body.radius : 3000;
  const radius = Math.min(5000, Math.max(200, rawRadius));
  const [lng, lat] = point;

  // 2026-09-02 redesign: dropped the fixed 6-tag category whitelist in
  // favour of a notability-driven query — anything OSM contributors
  // thought worth linking to Wikipedia/Wikidata, rather than only the
  // handful of tags we happened to enumerate. `nwr(around:...)["wikipedia"]`
  // and `["wikidata"]` match on tag *presence* regardless of value (no `=`),
  // so this pulls in castles/distilleries/monuments/museums exactly as
  // before plus everything else with a real Wikipedia/Wikidata link
  // (historic houses, notable bridges, nature reserves, etc.) — the same
  // "worth a detour" bar, just sourced from notability instead of a
  // hand-picked tag list. `out center` collapses a way/relation to a
  // single representative point. Explicitly unnamed results are dropped
  // below in the response-shaping step, not here, since Overpass QL can't
  // easily express "has no name tag" as a query-time filter alongside this.
  // 2026-09-02, second addition: wine farms (and, for the same reason,
  // small distilleries/breweries) are almost never Wikipedia/Wikidata
  // linked in OSM even when they're real, well-tagged businesses —
  // verified live around Stellenbosch: 14 real wineries (Kleine Zalze,
  // Lanzerac, Glenelly Estate, Morgenhof, etc.), zero of them carrying a
  // wikipedia/wikidata tag, so the notability gate above silently dropped
  // all of them. Rather than requiring notability for these specific,
  // narrow, unambiguous tags, they're queried unconditionally — a place
  // tagged craft=winery/distillery/brewery or shop=wine IS the thing we
  // want, no further notability check needed to trust it.
  const query = `
[out:json][timeout:20];
(
  nwr(around:${radius},${lat},${lng})["wikipedia"];
  nwr(around:${radius},${lat},${lng})["wikidata"];
  nwr(around:${radius},${lat},${lng})["craft"="winery"];
  nwr(around:${radius},${lat},${lng})["craft"="distillery"];
  nwr(around:${radius},${lat},${lng})["craft"="brewery"];
  nwr(around:${radius},${lat},${lng})["shop"="wine"];
);
out center 80;
`.trim();

  // Hedged across the mirror list — see overpassFetch(). A transient
  // all-mirrors-down failure still surfaces as "nothing found" to the
  // visitor, same as any other POI fetch failure.
  const op = await overpassFetch(query);
  if (op.error) return json(op.error, 502, request);
  const data = op.data;

  // Best-effort friendly label, still derived from whatever historic/
  // tourism/craft/etc. tags a result happens to carry — the tag list is no
  // longer the *filter* (wikipedia/wikidata presence is), but a result that
  // does carry one of these common tags still gets a nicer label than the
  // raw OSM value. Falls through to a generic "Heritage site" rather than
  // null for the (very common) case of a wiki-linked place with no tag in
  // this list — e.g. a historic house tagged `historic=yes`, a nature
  // reserve, a notable bridge.
  const CATEGORY_LABELS = {
    'historic=castle': 'Castle',
    'craft=distillery': 'Distillery',
    'tourism=viewpoint': 'Viewpoint',
    'historic=monument': 'Monument',
    'historic=ruins': 'Ruins',
    'tourism=museum': 'Museum',
    'historic=memorial': 'Memorial',
    'historic=archaeological_site': 'Archaeological site',
    'historic=manor': 'Manor house',
    'historic=church': 'Historic church',
    'amenity=place_of_worship': 'Place of worship',
    'tourism=attraction': 'Attraction',
    'tourism=artwork': 'Artwork',
    'leisure=nature_reserve': 'Nature reserve',
    'natural=peak': 'Peak',
    'craft=winery': 'Winery',
    'craft=brewery': 'Brewery',
    'shop=wine': 'Wine shop',
  };
  function categoryFor(tags) {
    if (!tags) return 'Heritage site';
    for (const key in CATEGORY_LABELS) {
      const [k, v] = key.split('=');
      if (tags[k] === v) return CATEGORY_LABELS[key];
    }
    return 'Heritage site';
  }

  // 2026-09-02, tightened after two live sanity checks: wikipedia/wikidata
  // presence alone is a *notability* signal, not a *"this is a visitable
  // place"* signal — a live query near Craigellachie also returned named
  // rivers, roads and rail lines, and a live query in central Johannesburg
  // returned dozens of tagged suburbs, railway stations, schools,
  // government offices and courthouses (South Africa's OSM data has a
  // dense "sagns" import that wikidata-tags administrative places and
  // civic buildings, not just tourist attractions — confirmed by
  // inspecting real API output, not assumed). Notability alone can't tell
  // "Aberlour Distillery" from "Constitutional Court of South Africa" —
  // both are real, wiki-linked, named places. The fix is to combine the
  // wiki-notability query above (for recall — it catches anything
  // deemed notable, not just our 6 old guessed tags) with a second,
  // category-based filter here (for precision): keep a result only if it
  // ALSO carries a tag family that actually describes a visitable
  // place — tourism/historic/craft(distillery-family)/certain natural
  // features/nature reserves/lighthouses/places of worship — which
  // structurally excludes railway stations, roads, rivers, suburbs,
  // squares, schools, universities, offices, government buildings and
  // courthouses regardless of how well-linked their Wikipedia article is.
  const TOURISM_EXCLUDE = new Set(['hotel', 'guest_house', 'hostel', 'motel', 'camp_site', 'caravan_site', 'information']);
  const CRAFT_INCLUDE = new Set(['distillery', 'brewery', 'winery']);
  const NATURAL_INCLUDE = new Set(['peak', 'waterfall', 'cave_entrance', 'cliff', 'arch']);
  function isVisitablePlace(tags) {
    if (tags.tourism && !TOURISM_EXCLUDE.has(tags.tourism)) return true;
    if (tags.historic) return true;
    if (tags.craft && CRAFT_INCLUDE.has(tags.craft)) return true;
    if (tags.natural && NATURAL_INCLUDE.has(tags.natural)) return true;
    if (tags.leisure === 'nature_reserve') return true;
    if (tags.man_made === 'lighthouse') return true;
    if (tags.amenity === 'place_of_worship') return true;
    if (tags.shop === 'wine') return true;
    return false;
  }

  const elements = Array.isArray(data && data.elements) ? data.elements : [];
  const pois = elements
    .filter((el) => isVisitablePlace(el.tags || {}))
    .map((el) => {
      const tags = el.tags || {};
      // A node has lat/lon directly; a way/relation only has them via
      // `out center`'s synthesized `center` field.
      const elLat = typeof el.lat === 'number' ? el.lat : el.center && el.center.lat;
      const elLng = typeof el.lon === 'number' ? el.lon : el.center && el.center.lon;
      return {
        name: tags.name || null,
        category: categoryFor(tags),
        wikipedia: tags.wikipedia || null,
        lat: typeof elLat === 'number' ? elLat : null,
        lng: typeof elLng === 'number' ? elLng : null,
      };
    })
    // 2026-09-02: drop unnamed results — a bare "Heritage site" pin with no
    // name is noise, not a detour-worthy suggestion (stakeholder request).
    .filter((p) => p.name && typeof p.lat === 'number' && typeof p.lng === 'number')
    .slice(0, 40);

  return json({ pois }, 200, request);
}

// GOLF-96: nearby hotels/guest houses for the "Add a stay" picker — a
// direct sibling of handleHeritagePois() above, same Overpass mirrors, same
// response shape, but querying tourism accommodation tags unconditionally
// (no wiki-notability gate — a real, ungated hotel doesn't need a
// Wikipedia page to be worth showing, same reasoning already applied to
// craft=winery/distillery/brewery above).
async function handleHotels(body, request) {
  const { point } = body || {};
  if (!isCoord(point)) {
    return json({ error: 'point must be a [lng, lat] number pair' }, 400, request);
  }
  const rawRadius = typeof body.radius === 'number' ? body.radius : 3000;
  const radius = Math.min(5000, Math.max(200, rawRadius));
  const [lng, lat] = point;

  const query = `
[out:json][timeout:20];
(
  nwr(around:${radius},${lat},${lng})["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"];
);
out center 60;
`.trim();

  const op = await overpassFetch(query);
  if (op.error) return json(op.error, 502, request);
  const data = op.data;

  const HOTEL_CATEGORY_LABELS = {
    hotel: 'Hotel',
    guest_house: 'Guest house',
    hostel: 'Hostel',
    apartment: 'Apartment',
    motel: 'Motel',
  };

  const elements = Array.isArray(data && data.elements) ? data.elements : [];
  const pois = elements
    .map((el) => {
      const tags = el.tags || {};
      const elLat = typeof el.lat === 'number' ? el.lat : el.center && el.center.lat;
      const elLng = typeof el.lon === 'number' ? el.lon : el.center && el.center.lon;
      return {
        name: tags.name || null,
        category: HOTEL_CATEGORY_LABELS[tags.tourism] || 'Hotel',
        lat: typeof elLat === 'number' ? elLat : null,
        lng: typeof elLng === 'number' ? elLng : null,
      };
    })
    .filter((p) => p.name && typeof p.lat === 'number' && typeof p.lng === 'number')
    .slice(0, 40);

  return json({ pois }, 200, request);
}

// GOLF-142: hotels within the currently-visible map viewport, for the
// ambient "Show hotels" layer. A direct sibling of handleHotels() above —
// same Overpass mirrors, same response shape, same unconditional
// accommodation-tag query — but bbox-based instead of point+radius, since
// the client already has a Leaflet viewport rather than a single point.
// Kept as its own mode/function (not an overload of 'hotels') so GOLF-96's
// "add a stay" picker is guaranteed untouched.
async function handleHotelsViewport(body, request) {
  const bbox = body && body.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => typeof n !== 'number' || Number.isNaN(n))) {
    return json({ error: 'bbox must be [south, west, north, east] numbers' }, 400, request);
  }
  let [south, west, north, east] = bbox;
  if (south > north) [south, north] = [north, south];
  if (west > east) [west, east] = [east, west];

  // Fair-use guard (see CLAUDE.md / DEC-016 constraints): the client
  // zoom-gates before ever calling this, but defensively cap the query
  // area server-side too, so a stale/bad client can't ask Overpass for
  // hotels across an entire country in one request. ~0.5 degrees of
  // latitude is roughly a large metro area, well above what the client's
  // zoom threshold should ever send.
  const MAX_SPAN_DEG = 0.6;
  if (north - south > MAX_SPAN_DEG || east - west > MAX_SPAN_DEG) {
    return json({ error: 'viewport too large for a hotel query' }, 400, request);
  }

  const query = `
[out:json][timeout:20];
(
  nwr(${south},${west},${north},${east})["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"];
);
out center 80;
`.trim();

  const op = await overpassFetch(query);
  if (op.error) return json(op.error, 502, request);
  const data = op.data;

  const HOTEL_CATEGORY_LABELS = {
    hotel: 'Hotel',
    guest_house: 'Guest house',
    hostel: 'Hostel',
    apartment: 'Apartment',
    motel: 'Motel',
  };

  const elements = Array.isArray(data && data.elements) ? data.elements : [];
  const pois = elements
    .map((el) => {
      const tags = el.tags || {};
      const elLat = typeof el.lat === 'number' ? el.lat : el.center && el.center.lat;
      const elLng = typeof el.lon === 'number' ? el.lon : el.center && el.center.lon;
      return {
        name: tags.name || null,
        category: HOTEL_CATEGORY_LABELS[tags.tourism] || 'Hotel',
        lat: typeof elLat === 'number' ? elLat : null,
        lng: typeof elLng === 'number' ? elLng : null,
      };
    })
    .filter((p) => p.name && typeof p.lat === 'number' && typeof p.lng === 'number')
    .slice(0, 80);

  return json({ pois }, 200, request);
}

// GOLF-56: place search for start/free/end day locations. ORS's geocoder
// takes its key as a query param (not the Authorization header the
// directions/POI endpoints use — a real, confirmed difference between
// those two parts of the ORS API, not an oversight). Boundary was fixed to
// GBR only, which silently broke South Africa (and Ireland) city search
// once GOLF-77/78 added those nations' courses — a bare "Newquay" still
// shouldn't have to compete with a same-named place abroad, but the
// boundary now needs to cover every nation this app has course data for,
// not just the original one. Update this list whenever a new nation's
// course data ships.
const GEOCODE_COUNTRIES = 'GBR,IRL,ZAF';
// GOLF-84: an optional per-request `country` (one of the three above)
// ringfences results to a single nation — the app sends this when a
// visitor has a specific nation selected (Explore's GB/Ireland/South
// Africa pill), so a bare "Newcastle" search doesn't surface Newcastle
// upon Tyne while browsing South Africa. Anything not exactly one of the
// three known codes falls back to the full unrestricted list rather than
// risk silently scoping to an unrecognised/malformed value.
async function handleGeocode(body, env, request) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return json({ results: [] }, 200, request);
  }
  const requestedCountry = typeof body.country === 'string' ? body.country.trim().toUpperCase() : '';
  // "Ireland" in this app means the island (courses-ireland.js and the
  // nation pill both include Northern Ireland), but ORS's IRL is the
  // Republic only — so Belfast/Portrush/Newcastle Co. Down never came
  // back. island:'ireland' widens to IRL+GBR inside a box round the island,
  // then drops any GB result that isn't in Northern Ireland (the box
  // clips the tip of Kintyre). An old client never sends it; an old
  // Worker ignores it and stays Republic-only.
  const island = body.island === 'ireland' && requestedCountry === 'IRL';
  const boundaryCountry = island
    ? 'IRL,GBR'
    : GEOCODE_COUNTRIES.split(',').includes(requestedCountry)
      ? requestedCountry
      : GEOCODE_COUNTRIES;

  const url = new URL(ORS_GEOCODE_URL);
  url.searchParams.set('api_key', env.ORS_API_KEY);
  url.searchParams.set('text', text.slice(0, 200));
  url.searchParams.set('boundary.country', boundaryCountry);
  url.searchParams.set('size', island ? '10' : '6');
  if (island) {
    url.searchParams.set('boundary.rect.min_lat', '51.3');
    url.searchParams.set('boundary.rect.max_lat', '55.5');
    url.searchParams.set('boundary.rect.min_lon', '-10.8');
    url.searchParams.set('boundary.rect.max_lon', '-5.3');
  }
  // GOLF-150 (S1): the main search bar asks for towns/regions only
  // (layers:'coarse') — without it, "Carnoustie" returned the town's high
  // school, library and football club as "towns & cities". Opt-in, so the
  // add-a-stop location box (where a venue IS the point) is unchanged.
  // Allowlisted: anything else is ignored rather than forwarded.
  if (body.layers === 'coarse') url.searchParams.set('layers', 'coarse');

  let orsRes;
  try {
    orsRes = await fetch(url.toString());
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502, request);
  }

  if (!orsRes.ok) {
    return json({ error: 'ORS request failed', status: orsRes.status }, 502, request);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502, request);
  }

  const features = Array.isArray(data && data.features) ? data.features : [];
  const results = features
    .map((f) => {
      const props = (f && f.properties) || {};
      const coords = f && f.geometry && f.geometry.coordinates;
      return {
        label: props.label || props.name || 'Unknown place',
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      };
    })
    .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number')
    .filter((r) => !island || !/United Kingdom$/.test(r.label) || /Northern Ireland/.test(r.label))
    .slice(0, 6);

  return json({ results }, 200, request);
}

function isCoord(v) {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function corsHeaders(request) {
  // GOLF-102 Part 1 / GOLF-35 Phase A3: reflect the caller's Origin back
  // only if it's on ALLOWED_ORIGINS — an open '*' let any web page on the
  // internet call this Worker (and burn its shared ORS quota) using a
  // visitor's browser, no key required since the key never leaves the
  // server anyway. `null` (not the omitted header) makes the denial
  // explicit and matches what a browser actually enforces client-side.
  const origin = request && request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
