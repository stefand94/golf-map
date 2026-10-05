/**
 * GOLF-45 / GOLF-50 / GOLF-55 / GOLF-56 / GOLF-142 / GOLF-156 — ORS
 * driving-time + route + geocoding + hotel proxy.
 *
 * Deploys: Cloudflare Workers Builds is connected to the GitHub repo and
 * builds on every push to main, but "built" is NOT "live" — on
 * 2026-09-20 three green builds in a row uploaded versions that were
 * never promoted, so production served pre-GOLF-164 code while every
 * check was green. Build root directory is EMPTY (not
 * scripts/cloudflare-worker, as this comment used to claim); the repo
 * root wrangler.jsonc points `main` at this file.
 * Never conclude a change is live from a green build or a 200 — curl the
 * X-Worker-Build header (GOLF-164) and compare it to
 * `python3 scripts/update_worker_build.py --print`.
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
 * the kinds of request below.
 *
 * GOLF-156: mode:'pois' (GOLF-46, live ORS POI lookup) and
 * mode:'heritage-pois' (GOLF-79, live Overpass heritage lookup) were
 * removed. GOLF-148 replaced both with a pre-baked, lazy-loaded dataset
 * shipped in data/pois-*.js, so nothing has called either mode since. The
 * ORS /pois endpoint is no longer used by this Worker at all; Overpass is
 * still used, but only by the two hotel modes below.
 *
 *   1. Driving time/distance/route (GOLF-45/GOLF-50, default — no "mode"
 *      field needed):
 *      POST {origin:[lng,lat], destination:[lng,lat]}
 *      -> {minutes, miles, route: [[lat,lng],...] | null}
 *
 *   2. Place search / geocoding (GOLF-56 — start/free/end day locations):
 *      POST {mode:'geocode', text:'Newquay'}
 *      -> {results:[{label, lat, lng}, ...]}
 *
 *   3. Nearby hotels/guest houses (GOLF-96 — Trip Builder's "Add a stay"
 *      map picker), Overpass-sourced, no ORS key needed:
 *      POST {mode:'hotels', point:[lng,lat], radius?:metres}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   4. Hotels within the current map viewport (GOLF-142 — ambient "Show
 *      hotels" browsing layer, distinct from #3's point-based picker),
 *      same Overpass source/shape, bbox instead of point+radius:
 *      POST {mode:'hotelsViewport', bbox:[south,west,north,east]}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   5. Feedback (GOLF-232 — the app's Feedback dialog), its own path:
 *      POST /feedback {text, build, mode, website}
 *      -> {ok:true}, and emails the text to the site owner (handleFeedback).
 *
 *   6. Usage counter (GOLF-235), its own paths:
 *      POST /count {e:'trip'|'share'|'open'}  (a sendBeacon) -> 204
 *      GET  /stats -> {days:[{day, trip, share, open}], totals:{...}}
 *
 * No logging of requests beyond Cloudflare's own standard request logs.
 * The state is GOLF-223's daily lookup counter (LookupQuota, below): a
 * count per visitor per day, keyed by a salted hash of the IP that is
 * thrown away with the day; and GOLF-235's daily usage totals, which hold
 * three numbers a day and nothing about who.
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
 *    (If you're re-pasting this file over an already-deployed Worker, no
 *    new secret or URL change is needed — ORS_API_KEY and the Worker's
 *    URL both stay exactly as they are.)
 */

import { DurableObject } from 'cloudflare:workers';

// GOLF-50: the /geojson variant returns the actual route geometry
// alongside the same duration/distance summary the plain endpoint gives —
// no extra request, no extra cost, just a different response shape.
// GOLF-154: directions moved to HeiGIT's host. The legacy
// api.openrouteservice.org path answers 403 for a key with quota to spare,
// and a *missing* key there answers 401 — so the key is recognised and
// refused, not unrecognised. The same route under
// api.heigit.org/openrouteservice/... is live (401 without a key, i.e. it
// exists and wants authorising). Isochrones and matrix moved with it.
// Revert this one constant if the theory is wrong; nothing else depends on it.
const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
// GOLF-176: max metres ORS may search from each end of a leg for a road.
const ROUTE_SNAP_RADIUS_M = 5000;
// Geocoding has NO equivalent path on the new host (404 there) and still
// answers 200 on the legacy host, so it stays put. (The ORS /pois endpoint
// was in the same boat; GOLF-156 removed it along with mode:'pois'.)
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
// Overpass, not ORS — a free, no-key OpenStreetMap query service. Added
// for GOLF-79's heritage lookup (removed by GOLF-156); now serves the
// GOLF-96/GOLF-142 hotel modes.
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
const OVERPASS_UA = 'golf-map/1.0 (+https://golftripper.uk; trip planner)';
// A leg between two golf courses rarely needs more than a couple hundred
// points to look like a real road at map zoom levels — cap it so the
// response (and what ends up cached in localStorage) stays small.
const ROUTE_MAX_POINTS = 150;

// GOLF-102 Part 1 / GOLF-35 Phase A3 — CORS allowlist. GOLF-35 Phase B
// added golftripper.uk (the live site). golf-map.pages.dev stays: its
// bare host now redirects to golftripper.uk, but branch previews still
// call this Worker.
const ALLOWED_ORIGINS = [
  'https://golftripper.uk',
  'https://www.golftripper.uk',
  'https://golf-map.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
];
// Preview deployments get a per-branch subdomain of the same project —
// *.golf-map.pages.dev — matched by suffix rather than enumerated.
const ALLOWED_ORIGIN_SUFFIX = '.golf-map.pages.dev';

// Known limitation: this only blocks browser calls from other web pages —
// a direct script/curl request carries no Origin header at all and isn't
// affected by CORS either way. That gap is what the GOLF-102 Part 2
// rate-limiting rule on api.golftripper.uk covers (docs/deploying.md).
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
      headers: {
        'Content-Type': 'application/json',
        'X-POI-Cache': 'HIT',
        /* GOLF-164: on the cache-hit path too, and taken from the constant
           rather than the cached response — a body served from cache was
           stored by an older build, but the Worker answering right now is
           this one, and "which code is running" is what the header means. */
        'X-Worker-Build': WORKER_BUILD,
        ...corsHeaders(request),
      },
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
async function overpassFetch(query, urls = OVERPASS_URLS) {
  const payload = 'data=' + encodeURIComponent(query);
  const controllers = [];
  let lastError = { error: 'could not reach Overpass', status: 502 };

  const attempt = (i) => {
    const ctl = new AbortController();
    controllers.push(ctl);
    const timer = setTimeout(() => ctl.abort(), OVERPASS_ATTEMPT_TIMEOUT_MS);
    return (async () => {
      try {
        const res = await fetch(urls[i], {
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

  for (let i = 1; i < urls.length; i++) live.push(attempt(i));
  const won = await firstTruthy(live);
  // Free the losing sockets; the winner has already been fully read.
  for (const c of controllers) { try { c.abort(); } catch (e) { /* already settled */ } }
  return won ? { data: won } : { error: lastError };
}

/* ── GOLF-223: daily cap on ORS lookups (directions + geocoding).

   The api.golftripper.uk rate-limiting rule (100 requests / 10 s per IP)
   stops a flood but not a slow drip: a script staying under it can still
   drain the ORS daily quota and take routing and place search down for
   everyone (R-7). So every ORS-backed call is counted per UTC day, twice:

   - per visitor, well above real use. A cold 10-day trip load is ~30
     route calls; place search is debounced and cached per session.
   - for the whole site, just under ORS's own daily quota. Once that is
     reached the Worker stops calling ORS until the day rolls over, so the
     last few hundred lookups are never the ones ORS itself refuses.

   Over either limit the Worker answers 429 and makes no upstream call. The
   app already treats any non-200 as "no answer": drives fall back to the
   dotted straight line and place search says it is unavailable.

   The Overpass hotel modes are not counted: they are keyless, edge-cached
   (GOLF-146) and draw on no quota of ours.

   Storage is one SQLite-backed Durable Object rather than KV: KV is
   eventually consistent (two edges could both let the 1,900th call
   through) and the free plan allows only 1,000 KV writes a day, fewer than
   the lookups being counted. A single instance serialises every count, so
   the check-and-increment is atomic, and at this traffic one object is
   nowhere near busy. Declared in wrangler.jsonc, so a git deploy creates
   it; nothing to set up in the dashboard.

   If the object can't be reached the call is let through (logged), not
   refused: a counter outage shouldn't take routing down with it, and the
   per-10-second rule still caps the damage. */
const QUOTA_LIMITS = {
  // ORS standard plan: directions 2,000/day, geocode autocomplete
  // 1,000/day, each its own quota. Check the ORS dashboard if they change.
  directions: { visitor: 300, site: 1900 },
  geocode: { visitor: 200, site: 950 },
};

/* A visitor is an IP. An IPv6 user can rotate through a whole /64 without
   trying, so v6 addresses count by their /64 prefix. */
function visitorKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export class LookupQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counts (day TEXT, who TEXT, kind TEXT, n INTEGER, PRIMARY KEY (day, who, kind))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS health (id INTEGER PRIMARY KEY, at INTEGER, result TEXT)');
    // GOLF-235: daily totals only — never a visitor, trip or IP column.
    this.sql.exec('CREATE TABLE IF NOT EXISTS usage (day TEXT, event TEXT, n INTEGER, PRIMARY KEY (day, event))');
    this.prunedFor = null;
    this.healthRun = null;
    this.usageDay = null; // GOLF-235: the per-visitor cap, memory only (see handleCount)
    this.usageSalt = null;
    this.usageSeen = new Map();
  }

  /* GOLF-235: adds one `event` to today's total unless today's site
     ceiling or this visitor's in-memory ceiling is reached. */
  async count(event, visitor, limits) {
    const day = new Date().toISOString().slice(0, 10);
    if (this.usageDay !== day) {
      this.usageDay = day;
      this.usageSalt = crypto.getRandomValues(new Uint8Array(16)).join('.');
      this.usageSeen = new Map();
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.usageSalt + visitor));
    const key = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('') + event;
    const mine = this.usageSeen.get(key) || 0;
    if (mine >= limits.visitor) return { ok: false, scope: 'visitor' };
    const total = this.sql.exec('SELECT n FROM usage WHERE day = ? AND event = ?', day, event).toArray()[0]?.n || 0;
    if (total >= limits.site) return { ok: false, scope: 'site' };
    this.sql.exec('INSERT INTO usage (day, event, n) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1', day, event);
    this.usageSeen.set(key, mine + 1);
    return { ok: true };
  }

  /* GOLF-235: the stored rows for the last `days` days, oldest first. */
  async stats(days) {
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    return this.sql.exec('SELECT day, event, n FROM usage WHERE day >= ? ORDER BY day, event', from).toArray();
  }

  /* GOLF-229: the last health result if it is younger than HEALTH_TTL_MS,
     else a fresh run. One object for the whole Worker, so however many
     edges or callers ask, there is at most one run per TTL; callers that
     arrive mid-run share it rather than starting another. */
  async health(local) {
    const row = this.sql.exec('SELECT at, result FROM health WHERE id = 1').toArray()[0];
    // Test-only, and only for a local request (see testUrl).
    const ttl = local && this.env.TEST_HEALTH_TTL_MS ? Number(this.env.TEST_HEALTH_TTL_MS) : HEALTH_TTL_MS;
    if (row && Date.now() - row.at < ttl) {
      return { ...JSON.parse(row.result), cached: true, ageSeconds: Math.round((Date.now() - row.at) / 1000) };
    }
    if (!this.healthRun) {
      this.healthRun = runHealthChecks(this.env, local, row ? JSON.parse(row.result) : null)
        .then((result) => {
          this.sql.exec('INSERT OR REPLACE INTO health (id, at, result) VALUES (1, ?, ?)', Date.now(), JSON.stringify(result));
          return result;
        })
        .finally(() => { this.healthRun = null; });
    }
    return { ...(await this.healthRun), cached: false, ageSeconds: 0 };
  }

  /* Counts one `kind` lookup for `visitor` today, unless that would break
     a limit. Returns { ok:true } or { ok:false, scope:'visitor'|'site' }.
     `limits` is passed in, so a test run can shrink them. */
  async take(kind, visitor, limits) {
    const day = new Date().toISOString().slice(0, 10);
    if (this.prunedFor !== day) {
      // Yesterday's counts and salt are no use to anyone; drop them.
      this.sql.exec('DELETE FROM counts WHERE day <> ?', day);
      this.sql.exec('DELETE FROM salts WHERE day <> ?', day);
      this.prunedFor = day;
    }
    // A fresh random salt per day: the stored key can't be reversed to an
    // IP by trying every IPv4 address, and nothing links two days.
    let salt = this.sql.exec('SELECT salt FROM salts WHERE day = ?', day).toArray()[0]?.salt;
    if (!salt) {
      salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      this.sql.exec('INSERT INTO salts (day, salt) VALUES (?, ?)', day, salt);
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + visitor));
    const who = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const count = (w) =>
      this.sql.exec('SELECT n FROM counts WHERE day = ? AND who = ? AND kind = ?', day, w, kind).toArray()[0]?.n || 0;
    if (count('*') >= limits.site) return { ok: false, scope: 'site' };
    if (count(who) >= limits.visitor) return { ok: false, scope: 'visitor' };
    const bump = 'INSERT INTO counts (day, who, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, who, kind) DO UPDATE SET n = n + 1';
    this.sql.exec(bump, day, '*', kind);
    this.sql.exec(bump, day, who, kind);
    return { ok: true };
  }
}

/* Returns a 429 Response if this lookup is over a daily limit, else null
   (go ahead). Call it after the request is validated and immediately
   before the upstream fetch, so only calls that would reach ORS count. */
async function quotaGate(kind, env, request) {
  if (!env.LOOKUP_QUOTA) return null; // binding missing (e.g. a manual paste deploy): no cap
  const limits = { ...QUOTA_LIMITS[kind] };
  // Test-only overrides (`wrangler dev --var`); production uses the table above.
  if (env.QUOTA_TEST_VISITOR) limits.visitor = Number(env.QUOTA_TEST_VISITOR);
  if (env.QUOTA_TEST_SITE) limits.site = Number(env.QUOTA_TEST_SITE);
  let verdict;
  try {
    const stub = env.LOOKUP_QUOTA.get(env.LOOKUP_QUOTA.idFromName('global'));
    verdict = await stub.take(kind, visitorKey(request.headers.get('CF-Connecting-IP')), limits);
  } catch (e) {
    console.log(`GOLF-223 quota check failed, letting ${kind} through: ${e}`);
    return null;
  }
  if (verdict.ok) return null;
  const now = new Date();
  const resets = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const res = json({
    error: verdict.scope === 'site'
      ? 'daily lookup limit reached for the whole site; try again after midnight UTC'
      : 'daily lookup limit reached for this connection; try again after midnight UTC',
    limit: verdict.scope,
    kind,
    resets: resets.toISOString(),
  }, 429, request);
  res.headers.set('Retry-After', String(Math.ceil((resets - now) / 1000)));
  return res;
}

/* ── GOLF-232: the Feedback dialog's POST /feedback.

   Emails the visitor's text to the site owner with the subject exactly
   "Golftripper feedback", through Email Routing's send_email binding
   (EMAIL, declared in wrangler.jsonc with no restriction attribute). An
   unrestricted binding may send to any *verified destination address* on
   the account, chosen at runtime, and such sends are free on every plan
   (developers.cloudflare.com/email-service/configuration/send-bindings,
   checked 2026-10-04). So the recipient is the FEEDBACK_TO secret, set by
   Stefan in the dashboard: his address is never in this repo, in
   wrangler.jsonc, or in anything the browser loads.

   Plain text only: the body goes in `text`, never `html`, so markup typed
   in the box arrives as the characters typed. The email carries the text,
   the app build, the page mode and the time; not the IP, not the trip.

   Capped through the GOLF-223 LookupQuota object, as its own `kind`: 5 a
   day per visitor, 100 a day for the site. Unlike the ORS gate this fails
   closed: if the counter can't be reached nothing is sent, because an
   uncounted email path is a spam relay into Stefan's inbox. The app keeps
   the visitor's text on any failure, so they lose nothing by retrying.

   The honeypot (`website`, a field no person sees) is answered with the
   same {ok:true} as a real send, so a bot learns nothing, and is neither
   counted nor sent. A browser from another site is refused outright: CORS
   would only hide the answer from it, not stop the email. */
const FEEDBACK_LIMITS = { visitor: 5, site: 100 };
const FEEDBACK_MAX_CHARS = 2000;
const FEEDBACK_FROM = { email: 'feedback@golftripper.uk', name: 'Golftripper' };
const FEEDBACK_SUBJECT = 'Golftripper feedback';
const FEEDBACK_MODES = ['plan', 'build', 'shared'];

async function handleFeedback(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405, request);
  if (!isAllowedOrigin(request.headers.get('Origin'))) {
    return json({ error: 'feedback is only accepted from the Golftripper site' }, 403, request);
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: 'message too long' }, 413, request);
    body = JSON.parse(raw);
  } catch (e) {
    return json({ error: 'invalid JSON body' }, 400, request);
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid JSON body' }, 400, request);
  if (body.website) return json({ ok: true }, 200, request); // honeypot: drop silently
  if (typeof body.text !== 'string') return json({ error: 'text must be a string' }, 400, request);
  const text = body.text.trim();
  if (!text) return json({ error: 'message is empty' }, 400, request);
  if (text.length > FEEDBACK_MAX_CHARS) {
    return json({ error: `message is over ${FEEDBACK_MAX_CHARS} characters` }, 400, request);
  }
  if (!env.EMAIL || !env.FEEDBACK_TO) {
    console.log(`GOLF-232 feedback not configured: EMAIL binding ${env.EMAIL ? 'ok' : 'missing'}, FEEDBACK_TO ${env.FEEDBACK_TO ? 'set' : 'missing'}`);
    return json({ error: 'feedback is not set up yet' }, 503, request);
  }
  if (!env.LOOKUP_QUOTA) return json({ error: 'feedback is not set up yet' }, 503, request);

  let verdict;
  try {
    const stub = env.LOOKUP_QUOTA.get(env.LOOKUP_QUOTA.idFromName('global'));
    verdict = await stub.take('feedback', visitorKey(request.headers.get('CF-Connecting-IP')), FEEDBACK_LIMITS);
  } catch (e) {
    console.log(`GOLF-232 feedback quota check failed, not sending: ${e}`);
    return json({ error: 'could not send right now; try again later' }, 503, request);
  }
  if (!verdict.ok) {
    const now = new Date();
    const resets = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const res = json({
      error: verdict.scope === 'site'
        ? 'daily feedback limit reached for the whole site; try again after midnight UTC'
        : 'daily feedback limit reached for this connection; try again after midnight UTC',
      limit: verdict.scope,
      resets: resets.toISOString(),
    }, 429, request);
    res.headers.set('Retry-After', String(Math.ceil((resets - now) / 1000)));
    return res;
  }

  const build = typeof body.build === 'string' && /^[\w.-]{1,64}$/.test(body.build) ? body.build : 'unknown';
  const mode = FEEDBACK_MODES.includes(body.mode) ? body.mode : 'unknown';
  try {
    await env.EMAIL.send({
      to: env.FEEDBACK_TO,
      from: FEEDBACK_FROM,
      subject: FEEDBACK_SUBJECT,
      text: `${text}\n\n--\nBuild: ${build}\nMode: ${mode}\nSent: ${new Date().toISOString()}\n`,
    });
  } catch (e) {
    // e.code is e.g. E_SENDER_NOT_VERIFIED (Email Routing not enabled on
    // golftripper.uk) or a destination that isn't verified yet.
    console.log(`GOLF-232 feedback send failed: ${e && e.code} ${e && e.message}`);
    return json({ error: 'could not send right now; try again later' }, 502, request);
  }
  return json({ ok: true }, 200, request);
}

/* ── GOLF-235: usage counter — proof for the top100 licence pitch.

   Three daily totals (UTC day): trips reaching 2+ days ('trip'), share
   links created ('share') and share links opened in the shared view
   ('open'). The app sends each one as a fire-and-forget sendBeacon, at
   most once per trip (or per link, for an open) — that dedupe lives in
   the visitor's own localStorage, so nothing here needs to know which
   trip or visitor it was. The request carries the event name and nothing
   else; the stored row is (day, event, n).

   Abuse cap, because inflated counts would sink the very proof they are
   for: a site-wide ceiling per event per day, plus a per-visitor ceiling
   kept only in the Durable Object's memory (a salted IP hash with a salt
   that also lives only in memory). Nothing about a visitor is written to
   storage. The cost is that the per-visitor cap forgets when the object
   is evicted after a quiet spell, so it stops bursts, not a patient
   script; the site ceiling bounds that.

   Every answer to POST /count is a bare 204, accepted or capped alike:
   a beacon never reads it, and a script learns nothing from it. GET
   /stats is open: totals only, the same numbers the pitch will quote. */
const COUNT_EVENTS = ['trip', 'share', 'open'];
const COUNT_LIMITS = {
  trip: { visitor: 10, site: 5000 },
  share: { visitor: 10, site: 5000 },
  open: { visitor: 30, site: 20000 },
};
const STATS_DAYS = 120;
const COUNT_ORIGIN = 'https://golftripper.uk';

async function handleCount(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405, request);
  // GOLF-241: production only. Previews and localhost are allowed
  // origins everywhere else, but their testing must never reach the stats.
  if (request.headers.get('Origin') !== COUNT_ORIGIN) return countDone(request, 403);
  let event;
  try {
    const raw = await request.text();
    if (raw.length > 200) return countDone(request, 413);
    event = JSON.parse(raw).e;
  } catch (e) {
    return countDone(request, 400);
  }
  if (!COUNT_EVENTS.includes(event)) return countDone(request, 400);
  if (!env.LOOKUP_QUOTA) return countDone(request, 503);
  try {
    const stub = env.LOOKUP_QUOTA.get(env.LOOKUP_QUOTA.idFromName('global'));
    await stub.count(event, visitorKey(request.headers.get('CF-Connecting-IP')), COUNT_LIMITS[event]);
  } catch (e) {
    console.log(`GOLF-235 count failed for ${event}: ${e}`);
  }
  return countDone(request, 204);
}

function countDone(request, status) {
  return new Response(null, { status, headers: { 'X-Worker-Build': WORKER_BUILD, ...corsHeaders(request) } });
}

async function handleStats(request, env) {
  if (request.method !== 'GET') return json({ error: 'GET only' }, 405, request);
  if (!env.LOOKUP_QUOTA) return json({ error: 'stats are not set up' }, 503, request);
  let rows;
  try {
    rows = await env.LOOKUP_QUOTA.get(env.LOOKUP_QUOTA.idFromName('global')).stats(STATS_DAYS);
  } catch (e) {
    console.log(`GOLF-235 stats read failed: ${e}`);
    return json({ error: 'stats unavailable right now' }, 503, request);
  }
  const byDay = new Map();
  const totals = { trip: 0, share: 0, open: 0 };
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, trip: 0, share: 0, open: 0 });
    byDay.get(r.day)[r.event] = r.n;
    totals[r.event] += r.n;
  }
  const res = json({ days: [...byDay.values()], totals, since: rows[0]?.day || null }, 200, request);
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/* ── GOLF-229: health endpoint for an external uptime monitor.

   All three past outages (GOLF-154, 172, 176) were found by a person
   noticing. GET /health makes one small real call to each upstream this
   Worker depends on, through the same handlers visitors use, and answers
   200 {status:'ok'} or 503 {status:'failing', failing:[...]} naming the
   broken part with its upstream reason (GOLF-155/172), so the alert email
   already says what broke. HEAD gets the same status with no body, since
   some monitors use it.

   Cost: the result is kept for HEALTH_TTL_MS in the LookupQuota object,
   so however often /health is hit, by the monitor or anyone else, there
   are at most 48 runs a day: 48 of 2,000 directions (2.4%) and 48 of 1,000
   geocodes (4.8%). The probes skip the GOLF-223 counters (uncounted), so
   they never take a visitor's allowance; the site cut-offs already sit
   50+ below each ORS quota, which covers them.

   /health/test-alert always answers 503 and calls nothing: point the
   monitor at it once to prove the alert email arrives. */
const HEALTH_TTL_MS = 30 * 60 * 1000;
const HEALTH_PROBE_TIMEOUT_MS = 20000;

/* Local-only upstream overrides, for testing the health endpoint (and
   anything else) in `wrangler dev` against a mock. Honoured only when the
   request itself is to localhost, so a variable set by mistake in the
   dashboard can never send the ORS key to another host in production. */
function isLocal(request) {
  const host = request ? new URL(request.url).hostname : '';
  return host === 'localhost' || host === '127.0.0.1';
}
function testUrl(name, env, request) {
  return (isLocal(request) && env && env['TEST_URL_' + name.toUpperCase()]) || null;
}

/* Parts allowed one failed run before they count as failing. Public
   Overpass 504s under load on both mirrors (see overpassFetch), so one
   miss is weather, not an outage, and would only teach Stefan to ignore
   the email. ORS has never flaked like that; a failure there alerts at
   once. */
const HEALTH_TOLERATE_ONE_MISS = ['overpass'];

async function runHealthChecks(env, local, previous) {
  // A stand-in request: the handlers read its URL (test overrides) and its
  // headers (CORS), and nothing else.
  const req = new Request(local ? 'http://localhost/health' : 'https://api.golftripper.uk/health');
  const probe = async (call, looksRight) => {
    const t0 = Date.now();
    let timer;
    try {
      const res = await Promise.race([
        call(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), HEALTH_PROBE_TIMEOUT_MS); }),
      ]);
      let data = null;
      try { data = await res.json(); } catch (e) { /* reported below */ }
      const ms = Date.now() - t0;
      if (res.status === 200 && data && looksRight(data)) return { ok: true, ms };
      return {
        ok: false, ms, status: res.status,
        error: (data && data.error) || (res.status === 200 ? 'answered, but not with what a visitor would need' : 'request failed'),
        ...(data && data.status ? { upstreamStatus: data.status } : {}),
        ...(data && data.upstream ? { upstream: String(data.upstream).slice(0, 300) } : {}),
      };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
    }
  };
  const missingKey = { ok: false, error: 'ORS_API_KEY secret is not configured on this Worker' };
  const [directions, geocode, overpass] = await Promise.all([
    // St Andrews to Carnoustie: a leg the app routes for real.
    env.ORS_API_KEY ? probe(
      () => handleRoute({ origin: [-2.803, 56.343], destination: [-2.731, 56.499] }, env, req, { uncounted: true }),
      (d) => typeof d.minutes === 'number' && d.minutes > 0) : missingKey,
    env.ORS_API_KEY ? probe(
      () => handleGeocode({ mode: 'geocode', text: 'St Andrews', layers: 'coarse' }, env, req, { uncounted: true }),
      (d) => Array.isArray(d.results) && d.results.length > 0) : missingKey,
    // Hotels near the Old Course; a 200 with a list is healthy even if a
    // quiet day's list were empty. Not through withPoiCache: a cached
    // answer would say nothing about Overpass now.
    probe(
      () => handleHotels({ mode: 'hotels', point: [-2.8, 56.343], radius: 800 }, req, env),
      (d) => Array.isArray(d.pois)),
  ]);
  const checks = { directions, geocode, overpass };
  for (const k of HEALTH_TOLERATE_ONE_MISS) {
    const before = previous && previous.checks && previous.checks[k];
    if (!checks[k].ok && !(before && before.ok === false)) checks[k].tolerated = true;
  }
  const failing = Object.keys(checks).filter((k) => !checks[k].ok && !checks[k].tolerated);
  const warnings = Object.keys(checks).filter((k) => checks[k].tolerated);
  return {
    status: failing.length ? 'failing' : 'ok', failing,
    ...(warnings.length ? { warnings } : {}),
    checks, checkedAt: new Date().toISOString(),
  };
}

async function handleHealth(path, request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'GET or HEAD only' }, 405, request);
  }
  let result;
  if (path === '/health/test-alert') {
    result = { status: 'failing', failing: ['test-alert'], note: 'GOLF-229 test alert: this URL always fails, on purpose. Point the monitor back at /health.' };
  } else if (!env.LOOKUP_QUOTA) {
    // No cache object, no run: an uncached /health would let anyone spend
    // ORS quota by reloading it.
    result = { status: 'failing', failing: ['health-cache'], error: 'LOOKUP_QUOTA binding missing, health checks not run' };
  } else {
    try {
      result = await env.LOOKUP_QUOTA.get(env.LOOKUP_QUOTA.idFromName('global')).health(isLocal(request));
    } catch (e) {
      result = { status: 'failing', failing: ['health-cache'], error: `health run failed: ${e}` };
    }
  }
  const status = result.status === 'ok' ? 200 : 503;
  const res = request.method === 'HEAD' ? new Response(null, { status, headers: { 'X-Worker-Build': WORKER_BUILD } }) : json(result, status, request);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/health' || path === '/health/test-alert') {
      return handleHealth(path, request, env);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'X-Worker-Build': WORKER_BUILD, ...corsHeaders(request) } });
    }
    if (path === '/feedback') {
      return handleFeedback(request, env);
    }
    if (path === '/count') return handleCount(request, env);
    if (path === '/stats') return handleStats(request, env);
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, request);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid JSON body' }, 400, request);
    }

    /* GOLF-146: the two Overpass modes below go through withPoiCache().
       'hotels' rounds its anchor point to 3dp (~110m) — it's anchored to a
       day's chosen place or a picker click, so it's already effectively
       discrete and a fine grid still hits; the viewport mode needs the
       coarser snapped grid instead (see snapBboxOut). */
    if (body && body.mode === 'hotels') {
      // GOLF-96: Overpass-only modes need no ORS_API_KEY at all — this
      // branch (and 'hotelsViewport' below) sits ahead of the ORS_API_KEY
      // guard so they keep working even when the ORS account/key is down,
      // which has happened for real more than once (see plan Phase
      // 22/25/33).
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

    if (body && body.mode === 'geocode') {
      return handleGeocode(body, env, request);
    }
    return handleRoute(body, env, request);
  },
};

async function handleRoute(body, env, request, { uncounted = false } = {}) {
  const { origin, destination } = body || {};
  if (!isCoord(origin) || !isCoord(destination)) {
    return json({ error: 'origin and destination must both be [lng, lat] number pairs' }, 400, request);
  }
  const refused = uncounted ? null : await quotaGate('directions', env, request);
  if (refused) return refused;

  let orsRes;
  try {
    orsRes = await fetch(testUrl('directions', env, request) || ORS_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      // GOLF-118: extra_info makes ORS return a per-segment way-type
      // breakdown so we can spot a ferry crossing folded into a driving-car
      // route. No extra request, no cost change — just a richer response body.
      //
      // GOLF-172: this said 'waytypes' (plural) and that is what took
      // directions down completely. ORS answers the whole request
      // 400 / code 2003 "Parameter 'extra_info' has incorrect value of
      // 'waytypes'" — one bad enum value fails the route, it is not ignored.
      // The request enum is SINGULAR 'waytype'; the *response* nests it
      // under extras.waytypes (plural), which is where the confusion came
      // from. See EXTRAS_WAYTYPE_KEYS in extractFerry, which reads either.
      //
      // GOLF-176: radiuses widens ORS's search for a road to snap each end
      // to. The default is 350 m, and course coordinates are course
      // centroids — often further than that from any road (Dunaverty,
      // Royal Troon, Turnberry) — so ORS refused the whole leg with
      // 404 / code 2010 "Could not find routable point". 5 km covers any
      // course pin while staying well short of snapping across to another
      // island. A point already near a road snaps exactly as before.
      body: JSON.stringify({
        coordinates: [origin, destination],
        radiuses: [ROUTE_SNAP_RADIUS_M, ROUTE_SNAP_RADIUS_M],
        extra_info: ['waytype'],
      }),
    });
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502, request);
  }

  if (!orsRes.ok) {
    // Common cases: 403 bad/expired key, 429 quota exceeded, 404 no
    // route found between the two points. Pass the status through
    // untranslated so the caller can decide how to fall back.
    const upstream = await logUpstreamFailure('directions', orsRes);
    return json({ error: 'ORS request failed', status: orsRes.status, upstream }, 502, request);
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
  // GeoJSON is [lng, lat]; flip to [lat, lng] so the client feeds it
  // straight to Leaflet without any conversion.
  const latlng = coords ? coords.map((c) => [c[1], c[0]]) : null;

  const minutes = summary.duration / 60;
  const ferry = extractFerry(feature, latlng, minutes);

  return json({
    minutes,
    miles: summary.distance / 1609.344,
    // [lat, lng] pairs (flipped from GeoJSON's [lng, lat]) so the client
    // can feed this straight to Leaflet without any conversion.
    route: latlng ? simplifyRoute(latlng) : null,
    // GOLF-118 — all four fields absent-safe: an older client ignores
    // them, and this Worker returns hasFerry:false for a pure-road leg or
    // any response whose extras don't parse.
    hasFerry: ferry.hasFerry,
    ferryMinutes: ferry.ferryMinutes,
    ferryMiles: ferry.ferryMiles,
    // Ordered road/ferry pieces of the route. Road pieces carry the real
    // ORS geometry (simplified); each ferry piece is just its two port
    // endpoints, so the client can draw the crossing as one straight line
    // between ports instead of ORS's long over-water/near-shore polyline.
    // null when the leg has no ferry — the client falls back to `route`.
    routeParts: ferry.routeParts,
    // GOLF-149: the 200 is NOT optional here. json()'s signature is
    // (obj, status, request), and GOLF-129 added `request` to this call in
    // the *status* position — so every successful route tried to build a
    // Response with a Request object as its status and threw, surfacing as
    // a Cloudflare 1101. Only the error paths above (which pass a status)
    // still worked, which is why routing failed silently and completely
    // while every other mode looked healthy. This branch predates that fix
    // and had re-introduced the bug in the rebase; kept explicitly.
  }, 200, request);
}

// GOLF-118 — way-type code 9 is "Ferry" in the ORS way-type enum.
const WAYTYPE_FERRY = 9;
// GOLF-172 — the response key does not match the request enum value: ORS
// asks for extra_info:['waytype'] and answers with extras.waytypes. Read
// both rather than betting on which, so a future host that normalises them
// either way keeps ferry detection working instead of silently returning
// hasFerry:false for every crossing.
const EXTRAS_WAYTYPE_KEYS = ['waytypes', 'waytype'];
// CalMac vehicle-ferry service speed sits around 15–20 mph; 18 is the
// midpoint. Only used for the ferryMinutes fallback (see below).
const FERRY_FALLBACK_MPH = 18;

// Pulls the ferry picture out of an ORS directions feature. Fully
// defensive: any missing/malformed piece yields
// {hasFerry:false, ferryMinutes:0, ferryMiles:0, routeParts:null}.
function extractFerry(feature, latlng, minutes) {
  const none = { hasFerry: false, ferryMinutes: 0, ferryMiles: 0, routeParts: null };
  const props = feature && feature.properties;
  const extras = props && props.extras;
  const wt = extras && EXTRAS_WAYTYPE_KEYS.map((k) => extras[k]).find(Boolean);
  const values = wt && Array.isArray(wt.values) ? wt.values : null;
  if (!values || !latlng || latlng.length < 2) return none;

  // [fromIdx, toIdx] index ranges (into the coordinate array) that are
  // ferry, in route order, adjacent ranges merged.
  const ranges = [];
  values
    .filter((v) => Array.isArray(v) && v.length >= 3 && v[2] === WAYTYPE_FERRY)
    .map((v) => [v[0], v[1]])
    .sort((a, b) => a[0] - b[0])
    .forEach(([f, t]) => {
      const last = ranges[ranges.length - 1];
      if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t);
      else ranges.push([f, t]);
    });
  if (!ranges.length) return none;

  // ferryMiles from the way-type summary when present (its distances are
  // authoritative), else summed from the geometry of each ferry range.
  const summary = wt.summary && Array.isArray(wt.summary) ? wt.summary : null;
  const ferrySummary = summary && summary.find((s) => s && s.value === WAYTYPE_FERRY);
  let ferryMiles =
    ferrySummary && typeof ferrySummary.distance === 'number'
      ? ferrySummary.distance / 1609.344
      : ranges.reduce((mi, [f, t]) => mi + rangeMiles(latlng, f, t), 0);
  ferryMiles = Math.round(ferryMiles * 10) / 10;

  // ferryMinutes: preferred path maps the ferry index ranges onto ORS's
  // per-step durations and sums the overlap. Fallback (flagged in the PR):
  // ferryMiles ÷ an assumed ferry speed. Either way, clamp below `minutes`
  // so the drive remainder can't go negative.
  let ferryMinutes = stepDurationMinutes(props, ranges);
  if (ferryMinutes == null) ferryMinutes = (ferryMiles / FERRY_FALLBACK_MPH) * 60;
  ferryMinutes = Math.min(Math.round(ferryMinutes), Math.max(0, Math.floor(minutes) - 1));

  // Split the whole coordinate array into ordered road / ferry pieces.
  const parts = [];
  let cursor = 0;
  const lastIdx = latlng.length - 1;
  ranges.forEach(([f, t]) => {
    const from = Math.max(0, Math.min(f, lastIdx));
    const to = Math.max(0, Math.min(t, lastIdx));
    if (from > cursor) parts.push({ ferry: false, pts: simplifyRoute(latlng.slice(cursor, from + 1)) });
    parts.push({ ferry: true, pts: [latlng[from], latlng[to]] });
    cursor = to;
  });
  if (cursor < lastIdx) parts.push({ ferry: false, pts: simplifyRoute(latlng.slice(cursor)) });

  return { hasFerry: true, ferryMinutes, ferryMiles, routeParts: parts };
}

function rangeMiles(latlng, from, to) {
  let m = 0;
  for (let i = Math.max(1, from + 1); i <= to && i < latlng.length; i++) {
    m += haversineMiles(latlng[i - 1], latlng[i]);
  }
  return m;
}

function haversineMiles(a, b) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Sum ORS step durations whose way-point index range overlaps a ferry
// range. Returns null (→ caller uses the distance fallback) if the
// segment/step shape isn't what we expect.
function stepDurationMinutes(props, ferryRanges) {
  const segments = props && Array.isArray(props.segments) ? props.segments : null;
  if (!segments) return null;
  let seconds = 0;
  let sawStep = false;
  for (const seg of segments) {
    const steps = seg && Array.isArray(seg.steps) ? seg.steps : [];
    for (const st of steps) {
      const wp = st && Array.isArray(st.way_points) ? st.way_points : null;
      if (!wp || wp.length < 2 || typeof st.duration !== 'number') continue;
      sawStep = true;
      const overlaps = ferryRanges.some(([f, t]) => wp[0] < t && wp[1] > f);
      if (overlaps) seconds += st.duration;
    }
  }
  if (!sawStep) return null;
  return seconds / 60;
}

function simplifyRoute(points) {
  if (points.length <= ROUTE_MAX_POINTS) return points;
  const step = points.length / ROUTE_MAX_POINTS;
  const out = [];
  for (let i = 0; i < ROUTE_MAX_POINTS; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

// GOLF-96: nearby hotels/guest houses for the "Add a stay" picker,
// sourced from Overpass (see overpassFetch), querying tourism
// accommodation tags unconditionally — a real, ungated hotel doesn't need
// a Wikipedia page to be worth showing. (It used to be described as a
// sibling of handleHeritagePois(); that handler went with GOLF-156.)
async function handleHotels(body, request, env = {}) {
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

  const overpassTest = testUrl('overpass', env, request);
  const op = await overpassFetch(query, overpassTest ? [overpassTest] : OVERPASS_URLS);
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
async function handleGeocode(body, env, request, { uncounted = false } = {}) {
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

  const url = new URL(testUrl('geocode', env, request) || ORS_GEOCODE_URL);
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

  const refused = uncounted ? null : await quotaGate('geocode', env, request);
  if (refused) return refused;

  let orsRes;
  try {
    orsRes = await fetch(url.toString());
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502, request);
  }

  if (!orsRes.ok) {
    // Label only — never the URL: it carries api_key= in its query string.
    const upstream = await logUpstreamFailure('geocode', orsRes);
    return json({ error: 'ORS request failed', status: orsRes.status, upstream }, 502, request);
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

/* GOLF-155: an upstream failure used to be thrown away. Every !ok branch
   returned the bare status and discarded the response body — the one part
   that says *why* — so from the outside a 403 meaning "quota exhausted" and
   a 403 meaning "invalid key" looked identical, which is exactly the
   ambiguity that made GOLF-154's directions outage slow to diagnose.

   GOLF-172: logging it was not enough. The body only reached Cloudflare's
   dashboard, which nobody debugging from a terminal can read, so a total
   directions outage still presented as an opaque `{"error":"ORS request
   failed","status":400}` — the *reason* existed and was unreachable. It is
   now returned to the caller as `upstream` as well as logged.

   GOLF-155's reason for withholding it was real and is handled rather than
   dropped: ORS error bodies are free text from a third party and may quote
   back the request that produced them, and the geocode request carries
   `api_key=` in its query string (see handleGeocode), so an echoed body is
   a plausible route for a key fragment to reach the browser. redactKey()
   below strips any api_key/Authorization-looking value before the body
   leaves this function — so the same redacted string is what gets logged
   *and* what gets returned. This still takes a caller-supplied static label
   rather than the request URL: logging that URL would write the key into
   the Worker's own logs.

   Truncated because neither Workers logs nor an error response are payload
   storage. Reading the body consumes the stream, which is safe here — every
   caller is on its way to discarding the response. */
const UPSTREAM_LOG_LIMIT = 1000;

/* Defence in depth for the echo path above. Catches `api_key=...` in a
   quoted URL/query string and a bearer-ish token after an Authorization
   label, in both JSON and plain-text bodies. Deliberately greedy about what
   counts as a key character and deliberately cheap — a false positive just
   redacts something harmless out of a diagnostic string. */
function redactKey(s) {
  return String(s)
    // GOLF-229: `"?` after the name too, so a JSON body's "api_key":"…"
    // is caught as well as a query string's api_key=…; it wasn't before.
    .replace(/(api_key"?\s*[=:]\s*"?)[^&"'\s,}]+/gi, '$1<redacted>')
    .replace(/(authorization"?\s*[=:]\s*"?)(?:bearer\s+)?[^&"'\s,}]+/gi, '$1<redacted>');
}

/* Returns the clipped, redacted upstream body so the caller can put it in
   its own response. Never throws and always returns a string. */
async function logUpstreamFailure(label, orsRes) {
  let body;
  try {
    body = await orsRes.text();
  } catch (e) {
    // Never let diagnostics break the error path: the caller still has a
    // 502 to return, and a failure to read the body is not worth a throw.
    body = `<body unreadable: ${e}>`;
  }
  const clipped = body.length > UPSTREAM_LOG_LIMIT
    ? `${body.slice(0, UPSTREAM_LOG_LIMIT)}… [${body.length} bytes total]`
    : body;
  const safe = redactKey(clipped);
  console.log(`ORS ${label} failed: HTTP ${orsRes.status} ${orsRes.statusText} — ${safe}`);
  return safe;
}

/* GOLF-164: which build of this file is actually running?
 *
 * Twice now (GOLF-149, GOLF-155) a Worker change has been impossible to
 * confirm from outside. A change that only touches logging or an error path
 * is externally identical to the old code — a 200 is equally consistent with
 * both — and the only header we emitted was X-POI-Cache. Confirming a deploy
 * meant the Cloudflare dashboard or `wrangler tail` during a forced failure,
 * both of which only the owner can do, so "is it live?" was answered by
 * trust rather than evidence.
 *
 * This is a content hash of this file, stamped by
 * scripts/update_worker_build.py (the line below is rewritten in place; the
 * hash deliberately excludes that line, which would otherwise be circular).
 * A hash of the source answers the question directly — "is THIS code live?"
 * — where a commit sha would only say which commit was deployed from.
 *
 * To check, from anywhere (a HEAD gets the 405 path, which carries it, so
 * this costs no upstream quota):
 *   curl -sI https://api.golftripper.uk/ | grep -i x-worker-build
 *   python3 scripts/update_worker_build.py --print
 * Same value, the deployed Worker is this source. Different, it is not.
 */
const WORKER_BUILD = '69dc3e8022';

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Build': WORKER_BUILD,
      ...corsHeaders(request),
    },
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
    // GOLF-102 Part 2: every POST here is a JSON body, so it needs a
    // preflight, and without a max-age the browser re-sends one for almost
    // every call. That doubles the request count against the rate-limiting
    // rule on api.golftripper.uk. 7200 is Chrome's cap.
    'Access-Control-Max-Age': '7200',
    'Vary': 'Origin',
  };
}
