/* GOLF-146: unit test for the Worker's Overpass edge cache.

   Run with:  node scripts/test_worker_cache.mjs

   The Worker is a .js ES module and this repo has no package.json (so no
   "type":"module"), which means node won't import it directly. The test
   copies it to a .mjs in the OS temp dir and imports that — no build step,
   consistent with the repo's zero-tooling convention. Overpass and the
   Cache API are both stubbed, so this runs offline and asserts caching
   behaviour rather than live upstream behaviour.
*/
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const WORKER_SRC = new URL('./cloudflare-worker/ors-proxy.js', import.meta.url);
const tmp = join(mkdtempSync(join(tmpdir(), 'golfworker-')), 'worker.mjs');
/* GOLF-223: the Worker imports DurableObject from 'cloudflare:workers', a
   module only the Workers runtime has. Swap it for a stand-in base class;
   nothing here exercises the Durable Object itself. */
writeFileSync(tmp, readFileSync(WORKER_SRC, 'utf8').replace(
  "import { DurableObject } from 'cloudflare:workers';",
  'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'));

let overpassCalls = 0;
let overpassStatus = 200;
let lastQuery = '';
/* GOLF-147: which mirrors were hit, in order, and with what headers — the
   hedging tests assert on call *fan-out*, not just the count. */
let calledUrls = [];
let lastHeaders = null;
/* Per-mirror overrides, keyed by a substring of the mirror URL:
   { 'overpass-api.de': { delayMs: 9000, status: 504 } }. Empty = all fast. */
let mirrorBehaviour = {};

/* GOLF-149: when set, fetch returns an ORS directions response instead of an
   Overpass one, so the routing path can be exercised in the same harness. */
let orsRouteStub = null;

/* GOLF-234: the Esri key self-check's fetches (a streets tile, and since
   GOLF-244 the vector style). esriStub(url) returns the Response Esri would
   give (or throws, for "unreachable"). */
let esriCalls = [];
const esriRefuse = () => new Response('{"error":{"code":498,"message":"Token Invalid."}}',
  { status: 401, headers: { 'Content-Type': 'application/json' } });
const esriAll = (url) => url.includes('/styles/')
  ? new Response('{"version":8,"layers":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  : new Response('png', { status: 200, headers: { 'Content-Type': 'image/png' } });
let esriStub = esriAll;

/* GOLF-279: ORS /pois, the hotel modes' first source. orsPoisStub(body)
   returns the Response; every call's parsed body is kept in orsPoisCalls. */
let orsPoisCalls = [];
let orsPoisStub = null;

globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/pois')) {
    const body = JSON.parse(opts.body);
    orsPoisCalls.push({ body, auth: opts.headers?.Authorization });
    return orsPoisStub(body);
  }
  if (String(url).includes('arcgis.com')) {
    esriCalls.push({ url: String(url), headers: opts?.headers || {} });
    return esriStub(String(url));
  }
  if (orsRouteStub) return new Response(JSON.stringify(orsRouteStub), {
    status: 200, headers: { 'Content-Type': 'application/json', 'X-RateLimit-Limit': '2000' },
  });
  overpassCalls++;
  calledUrls.push(String(url));
  lastHeaders = opts?.headers || null;
  lastQuery = decodeURIComponent(String(opts?.body || '')).replace(/^data=/, '');
  for (const [frag, b] of Object.entries(mirrorBehaviour)) {
    if (!String(url).includes(frag)) continue;
    if (b.delayMs) {
      await new Promise((r) => setTimeout(r, b.delayMs));
      // A hedged-away attempt is aborted; honour that so the test sees the
      // same "loser never resolves usefully" behaviour the real Worker does.
      if (opts?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    if (b.status && b.status !== 200) {
      if (b.times !== undefined && b.times-- <= 0) continue; // GOLF-279: refuse only the first N calls
      return new Response('mirror boom', { status: b.status });
    }
  }
  if (overpassStatus !== 200) {
    return new Response('upstream boom', { status: overpassStatus });
  }
  return new Response(JSON.stringify({
    elements: [
      { type: 'node', id: 1, lat: 56.3423, lon: -2.8021, tags: { name: 'Haar', tourism: 'guest_house' } },
      { type: 'node', id: 2, lat: 56.3425, lon: -2.7981, tags: { name: 'Annandale', tourism: 'guest_house' } },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// Minimal Cache API stand-in: keyed on the synthetic GET url.
const store = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const hit = store.get(req.url);
      return hit ? new Response(hit, { status: 200 }) : undefined;
    },
    async put(req, res) { store.set(req.url, await res.text()); },
  },
};

const { default: worker, LookupQuota } = await import(pathToFileURL(tmp).href);
const ctx = { waitUntil: (p) => p };

const call = (body, origin = 'https://golf-map.pages.dev') =>
  worker.fetch(new Request('https://w.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  }), {}, ctx);

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

// ── 1. cold call hits Overpass
overpassCalls = 0;
let r = await call({ mode: 'hotelsViewport', bbox: [56.3184, -2.8271, 56.3612, -2.7756] });
let j = await r.clone().json();
check('cold call returns pois', r.status === 200 && j.pois?.length === 2, `status=${r.status} n=${j.pois?.length}`);
check('cold call is a MISS', r.headers.get('X-POI-Cache') === null, `hdr=${r.headers.get('X-POI-Cache')}`);
check('cold call queried Overpass once', overpassCalls === 1, `calls=${overpassCalls}`);
check('Overpass asked for the SNAPPED cell', /56\.31,-2\.83,56\.37,-2\.77/.test(lastQuery.replace(/\s/g, '')),
  lastQuery.replace(/\s+/g, ' ').match(/nwr\([^)]*\)/)?.[0] || 'n/a');

// ── 2. identical call is served from cache
overpassCalls = 0;
r = await call({ mode: 'hotelsViewport', bbox: [56.3184, -2.8271, 56.3612, -2.7756] });
j = await r.clone().json();
check('repeat call is a HIT', r.headers.get('X-POI-Cache') === 'HIT', `hdr=${r.headers.get('X-POI-Cache')}`);
check('repeat call did NOT touch Overpass', overpassCalls === 0, `calls=${overpassCalls}`);
check('repeat call has identical pois', j.pois?.length === 2, `n=${j.pois?.length}`);

// ── 3. a small pan inside the same grid cell still hits
overpassCalls = 0;
r = await call({ mode: 'hotelsViewport', bbox: [56.3190, -2.8265, 56.3618, -2.7750] });
check('small pan within cell is a HIT', r.headers.get('X-POI-Cache') === 'HIT', `hdr=${r.headers.get('X-POI-Cache')}`);
check('small pan did NOT touch Overpass', overpassCalls === 0, `calls=${overpassCalls}`);

// ── 4. moving to a different cell misses
overpassCalls = 0;
r = await call({ mode: 'hotelsViewport', bbox: [55.9000, -3.2000, 55.9400, -3.1500] });
check('different area is a MISS', r.headers.get('X-POI-Cache') === null, `hdr=${r.headers.get('X-POI-Cache')}`);
check('different area queried Overpass', overpassCalls === 1, `calls=${overpassCalls}`);

// ── 5. CORS is recomputed per caller, never served from cache
r = await call({ mode: 'hotelsViewport', bbox: [56.3184, -2.8271, 56.3612, -2.7756] }, 'https://evil.example');
check('HIT recomputes CORS for a disallowed origin',
  r.headers.get('X-POI-Cache') === 'HIT' && r.headers.get('Access-Control-Allow-Origin') === 'null',
  `cache=${r.headers.get('X-POI-Cache')} acao=${r.headers.get('Access-Control-Allow-Origin')}`);
r = await call({ mode: 'hotelsViewport', bbox: [56.3184, -2.8271, 56.3612, -2.7756] }, 'https://golf-map.pages.dev');
check('HIT reflects an allowed origin correctly',
  r.headers.get('Access-Control-Allow-Origin') === 'https://golf-map.pages.dev',
  `acao=${r.headers.get('Access-Control-Allow-Origin')}`);

// ── 6. an upstream failure must never be cached
/* GOLF-156 removed mode:'heritage-pois', which this case used to exercise;
   the hotels picker is the same Overpass + edge-cache path. Its own point
   (Glasgow) so nothing cached above or below can mask the result. */
overpassStatus = 521;
overpassCalls = 0;
r = await call({ mode: 'hotels', point: [-4.2518, 55.8642], radius: 3000 });
check('upstream failure returns an error', r.status === 502, `status=${r.status}`);
overpassCalls = 0;
r = await call({ mode: 'hotels', point: [-4.2518, 55.8642], radius: 3000 });
check('failure was NOT cached (retried upstream)', overpassCalls >= 1 && r.headers.get('X-POI-Cache') === null,
  `calls=${overpassCalls} hdr=${r.headers.get('X-POI-Cache')}`);
overpassStatus = 200;

// ── 7. the hotels picker caches on its own key
overpassCalls = 0;
await call({ mode: 'hotels', point: [-2.8021, 56.3423], radius: 3000 });
r = await call({ mode: 'hotels', point: [-2.8021, 56.3423], radius: 3000 });
check('hotels (picker) caches', r.headers.get('X-POI-Cache') === 'HIT', `hdr=${r.headers.get('X-POI-Cache')}`);

// ── 8. a different radius must be a different key
overpassCalls = 0;
r = await call({ mode: 'hotels', point: [-2.8021, 56.3423], radius: 1500 });
check('different radius is a MISS', r.headers.get('X-POI-Cache') === null && overpassCalls === 1,
  `hdr=${r.headers.get('X-POI-Cache')} calls=${overpassCalls}`);

// ── 9. a malformed bbox still 400s rather than being cached
r = await call({ mode: 'hotelsViewport', bbox: [1, 2] });
check('malformed bbox still 400s', r.status === 400, `status=${r.status}`);

/* ── GOLF-147: mirror ordering, User-Agent, and hedged fallback.
   Each case uses a fresh bbox so the GOLF-146 cache can't serve it. */

// 10. the fast mirror is primary, and identifies itself
calledUrls = []; mirrorBehaviour = {};
await call({ mode: 'hotelsViewport', bbox: [51.26, 1.31, 51.31, 1.37] });
check('the fast mirror (kumi) is tried first', /overpass\.kumi\.systems/.test(calledUrls[0] || ''), `first=${calledUrls[0]}`);
check('sends a User-Agent (else overpass-api.de 406s)',
  /golf-map/.test(String(lastHeaders?.['User-Agent'] || '')), `ua=${lastHeaders?.['User-Agent']}`);

// 11. a healthy primary must NOT fan out to the second mirror
calledUrls = []; overpassCalls = 0;
await call({ mode: 'hotelsViewport', bbox: [53.40, -3.05, 53.45, -2.99] });
check('fast primary does not hedge (1 upstream call)', overpassCalls === 1, `calls=${overpassCalls} urls=${calledUrls.length}`);

// 12. a primary that fails outright should hedge at once, not wait out the delay
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass.kumi.systems': { status: 504 } };
let t0 = Date.now();
r = await call({ mode: 'hotelsViewport', bbox: [55.60, -4.60, 55.65, -4.54] });
j = await r.clone().json();
check('fast-failing primary falls back to mirror 2',
  r.status === 200 && j.pois?.length === 2 && calledUrls.length === 2,
  `status=${r.status} n=${j.pois?.length} urls=${calledUrls.length}`);
check('fast failure does not wait out the hedge delay', Date.now() - t0 < 2000, `${Date.now() - t0}ms`);

// 13. a *slow* primary is hedged, and the quicker mirror's answer wins
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass.kumi.systems': { delayMs: 60000 } };
t0 = Date.now();
r = await call({ mode: 'hotelsViewport', bbox: [57.47, -1.80, 57.52, -1.74] });
j = await r.clone().json();
const elapsed = Date.now() - t0;
check('slow primary is hedged onto mirror 2', calledUrls.length === 2, `urls=${calledUrls.length}`);
check('hedge returns the fallback answer', r.status === 200 && j.pois?.length === 2,
  `status=${r.status} n=${j.pois?.length}`);
check('hedge resolves in ~the hedge delay, not the slow mirror',
  elapsed >= 2000 && elapsed < 12000, `${elapsed}ms`);
mirrorBehaviour = {};

// 14. both mirrors down is still a clean 502, not a hang
calledUrls = [];
mirrorBehaviour = { 'overpass': { status: 504 } };
r = await call({ mode: 'hotelsViewport', bbox: [50.40, -4.20, 50.45, -4.14] });
check('all mirrors failing returns 502', r.status === 502, `status=${r.status}`);
mirrorBehaviour = {};

// 15. GOLF-279: the first three mirrors refuse at once; the fourth answers.
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass.kumi.systems': { status: 500 }, 'private.coffee': { status: 500 }, 'overpass-api.de': { status: 504 } };
t0 = Date.now();
r = await call({ mode: 'hotelsViewport', bbox: [52.40, -1.95, 52.45, -1.89] });
j = await r.clone().json();
check('walks the list on fast failures until one answers',
  r.status === 200 && j.pois?.length === 2 && calledUrls.length === 4 && Date.now() - t0 < 2000,
  `status=${r.status} urls=${calledUrls.length} ${Date.now() - t0}ms`);

// 16. GOLF-279: a mirror that refuses once and then answers is retried on the second pass.
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass.kumi.systems': { status: 500, times: 1 }, 'private.coffee': { status: 500 }, 'overpass-api.de': { status: 504 }, 'maps.mail.ru': { status: 504 } };
r = await call({ mode: 'hotelsViewport', bbox: [54.55, -5.95, 54.60, -5.89] });
j = await r.clone().json();
check('second pass retries the first mirror', r.status === 200 && calledUrls.length === 5, `status=${r.status} urls=${calledUrls.length}`);
mirrorBehaviour = {};

// 17. GOLF-279: everything down is bounded at two passes (8 calls), then 502.
calledUrls = [];
mirrorBehaviour = { 'overpass': { status: 504 }, 'maps.mail.ru': { status: 504 } };
r = await call({ mode: 'hotelsViewport', bbox: [51.10, -2.70, 51.15, -2.64] });
check('all mirrors failing: 502 after exactly two passes', r.status === 502 && calledUrls.length === 8, `status=${r.status} urls=${calledUrls.length}`);
mirrorBehaviour = {};

/* ── GOLF-279: hotels come from ORS /pois first, Overpass only as fallback.

   ORS is asked along a buffered zig-zag LineString (no area check there,
   unlike a bbox). The stub answers with, per row of the line, a hotel at
   the row's middle and a guest house beside it, a hostel at its west end,
   plus a restaurant and an unnamed hotel that must both be dropped. */
const orsEnv = { ORS_API_KEY: 'test-key' };
const callEnv = (body, env) => worker.fetch(new Request('https://w.test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://golf-map.pages.dev' },
  body: JSON.stringify(body),
}), env, ctx);
const feat = (id, lng, lat, catId, catName, name) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { osm_id: id, osm_type: 1, category_ids: { [catId]: { category_name: catName } }, osm_tags: name ? { name } : {} },
});
let featId = 0;
const orsPoisOk = (body) => {
  const c = body.geometry.geojson.coordinates;
  const features = [];
  for (let k = 0; k + 1 < c.length; k += 2) {
    const [[x1, y], [x2]] = [c[k], c[k + 1]];
    const w = Math.min(x1, x2), cx = (x1 + x2) / 2, n = ++featId * 10;
    features.push(
      feat(n + 1, cx, y, 108, 'hotel', `Hotel ${n}`),
      feat(n + 2, cx + 0.001, y, 106, 'guest_house', `GH ${n}`),
      feat(n + 3, w + 0.0001, y, 107, 'hostel', `Hostel ${n}`),
      feat(n + 4, cx, y, 570, 'restaurant', 'Not a hotel'),
      feat(n + 5, cx, y, 108, 'hotel', null)); // unnamed: dropped like Overpass's
  }
  return new Response(JSON.stringify({ type: 'FeatureCollection', features }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};
// Web Mercator length, as openpoiservice measures it against its 500 km cap.
const mercLen = (coords) => {
  const R = 6378137, rad = Math.PI / 180;
  const xy = ([lng, lat]) => [R * lng * rad, R * Math.log(Math.tan(Math.PI / 4 + lat * rad / 2))];
  let m = 0;
  for (let k = 1; k < coords.length; k++) { const a = xy(coords[k - 1]), b = xy(coords[k]); m += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return m;
};
const rowLats = (c) => [...new Set(c.map((p) => p[1]))].sort((a, b) => a - b);

// 18. a viewport is answered by ORS in one call, with Overpass untouched
orsPoisStub = orsPoisOk; orsPoisCalls = []; overpassCalls = 0;
r = await callEnv({ mode: 'hotelsViewport', bbox: [56.31, -2.86, 56.36, -2.76] }, orsEnv);
j = await r.clone().json();
check('ORS: viewport answered by ORS', r.status === 200 && r.headers.get('X-Hotel-Source') === 'ors' && overpassCalls === 0,
  `status=${r.status} src=${r.headers.get('X-Hotel-Source')} overpass=${overpassCalls}`);
const g = orsPoisCalls[0]?.body.geometry;
check('ORS: one call, a LineString with a buffer ≤ 2000 m and no bbox',
  orsPoisCalls.length === 1 && g.geojson.type === 'LineString' && g.buffer > 0 && g.buffer <= 2000 && !g.bbox,
  `calls=${orsPoisCalls.length} geom=${JSON.stringify(g)?.slice(0, 120)}`);
{
  // Rows cover the whole box: first and last within a buffer of the edges,
  // neighbours closer than two buffers, every row spanning west to east.
  const c = g.geojson.coordinates, lats = rowLats(c), m = (d) => d * 111320;
  const gaps = lats.slice(1).map((v, k) => m(v - lats[k]));
  check('ORS: the line sweeps the whole viewport',
    m(lats[0] - 56.31) < g.buffer && m(56.36 - lats[lats.length - 1]) < g.buffer && gaps.every((x) => x < 2 * g.buffer)
    && Math.min(...c.map((p) => p[0])) <= -2.86 && Math.max(...c.map((p) => p[0])) >= -2.76,
    `rows=${lats.length} gaps=${gaps.map((x) => x.toFixed(0)).join(',')}`);
}
check('ORS: sends the key and ≤5 accommodation category ids',
  orsPoisCalls.every((c) => c.auth === 'test-key' && c.body.filters.category_ids.length <= 5 && c.body.filters.category_ids.includes(108)),
  JSON.stringify(orsPoisCalls[0]?.body.filters));
check('ORS: restaurants and unnamed places dropped, labels mapped',
  j.pois.length > 0 && j.pois.every((p) => ['Hotel', 'Guest house', 'Hostel'].includes(p.category) && p.name && p.name !== 'Not a hotel'),
  JSON.stringify(j.pois.slice(0, 3)));
check('ORS: only pins inside the viewport, nearest the centre first',
  j.pois.every((p) => p.lat >= 56.31 && p.lat <= 56.36 && p.lng >= -2.86 && p.lng <= -2.76)
  && j.pois[0].category !== 'Hostel', `first=${JSON.stringify(j.pois[0])}`);
check('ORS: response keeps the {name,category,lat,lng} shape',
  j.pois.every((p) => Object.keys(p).sort().join() === 'category,lat,lng,name'), Object.keys(j.pois[0] || {}).join());

// 19. the biggest viewport the Worker allows (0.6°, at Shetland's latitude)
//     still goes to ORS, split into lines that each fit ORS's 500 km cap
orsPoisCalls = []; overpassCalls = 0;
r = await callEnv({ mode: 'hotelsViewport', bbox: [60.0, -1.6, 60.59, -1.01] }, orsEnv);
check('ORS: the largest viewport fits in ≤3 lines, each under 500 km (Mercator)',
  r.headers.get('X-Hotel-Source') === 'ors' && orsPoisCalls.length >= 2 && orsPoisCalls.length <= 3
  && orsPoisCalls.every((c) => mercLen(c.body.geometry.geojson.coordinates) < 500000),
  `src=${r.headers.get('X-Hotel-Source')} why=${r.headers.get('X-Hotel-ORS')} calls=${orsPoisCalls.length} km=${orsPoisCalls.map((c) => (mercLen(c.body.geometry.geojson.coordinates) / 1000).toFixed(0)).join(',')}`);

// 20. ORS failing falls back to Overpass, not to an error
orsPoisStub = () => new Response('{"error":"quota"}', { status: 429 }); overpassCalls = 0;
r = await callEnv({ mode: 'hotelsViewport', bbox: [53.30, -6.35, 53.34, -6.27] }, orsEnv);
j = await r.clone().json();
check('ORS: an ORS failure falls back to Overpass',
  r.status === 200 && r.headers.get('X-Hotel-Source') === 'overpass' && overpassCalls === 1 && j.pois.length === 2,
  `status=${r.status} src=${r.headers.get('X-Hotel-Source')} overpass=${overpassCalls}`);
check('ORS: the fallback says why ORS was passed over', /^429 /.test(r.headers.get('X-Hotel-ORS') || ''),
  `hdr=${r.headers.get('X-Hotel-ORS')}`);

// 21. one of several lines failing means Overpass for the whole viewport, never half a map
let nth = 0;
orsPoisStub = (b) => (nth++ === 1 ? new Response('boom', { status: 500 }) : orsPoisOk(b)); overpassCalls = 0;
r = await callEnv({ mode: 'hotelsViewport', bbox: [59.0, -3.3, 59.59, -2.71] }, orsEnv);
check('ORS: a partial ORS answer is not used', r.status === 200 && r.headers.get('X-Hotel-Source') === 'overpass' && nth >= 2,
  `src=${r.headers.get('X-Hotel-Source')} orsCalls=${nth}`);

// 22. the day's hotel picker (point + 3 km) is one ORS call, filtered to the circle
orsPoisStub = orsPoisOk; orsPoisCalls = []; overpassCalls = 0;
r = await callEnv({ mode: 'hotels', point: [-6.2601, 53.3491], radius: 3000 }, orsEnv);
j = await r.clone().json();
check('ORS: hotel picker answered by ORS in one call',
  r.status === 200 && r.headers.get('X-Hotel-Source') === 'ors' && orsPoisCalls.length === 1 && overpassCalls === 0 && j.pois.length > 0,
  `src=${r.headers.get('X-Hotel-Source')} why=${r.headers.get('X-Hotel-ORS')} calls=${orsPoisCalls.length} n=${j.pois?.length}`);
check('ORS: picker results all within the radius',
  j.pois.every((p) => Math.hypot((p.lat - 53.3491) * 111320, (p.lng + 6.2601) * 111320 * Math.cos(53.3491 * Math.PI / 180)) <= 3000),
  JSON.stringify(j.pois.slice(0, 2)));

// 23. without a key it is Overpass, as before
orsPoisCalls = []; overpassCalls = 0;
r = await callEnv({ mode: 'hotels', point: [-3.19, 55.95], radius: 3000 }, {});
check('ORS: no key means Overpass, no ORS call', r.headers.get('X-Hotel-Source') === 'overpass' && orsPoisCalls.length === 0,
  `src=${r.headers.get('X-Hotel-Source')} calls=${orsPoisCalls.length}`);
orsPoisStub = null;

/* ── GOLF-149: the routing success path.

   This is the regression that motivated the test. json()'s signature is
   (obj, status, request), and GOLF-129 passed `request` in the status slot
   on handleRoute's *success* return — so every route that ORS actually
   answered threw while building the Response, surfacing as a Cloudflare
   1101. The error paths all passed a status, so they kept working, and the
   Worker looked healthy on every other mode. Routing was dead in production
   until GOLF-149 and nothing caught it, so it gets a test. */
orsRouteStub = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { summary: { duration: 3600, distance: 70000 } },
    geometry: {
      type: 'LineString',
      // Deliberately over ROUTE_MAX_POINTS so simplifyRoute() runs too.
      coordinates: Array.from({ length: 5000 }, (_, i) => [-3.18 - i * 0.0002, 55.95 - i * 0.00002]),
    },
  }],
};
r = await worker.fetch(new Request('https://w.test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://golf-map.pages.dev' },
  body: JSON.stringify({ origin: [-3.1883, 55.9533], destination: [-4.2518, 55.8642] }),
}), { ORS_API_KEY: 'test-key' }, ctx);
j = await r.clone().json();
check('a successful route returns 200 (not a 1101 crash)', r.status === 200, `status=${r.status}`);
check('route carries duration and distance',
  Math.round(j.minutes) === 60 && Math.round(j.miles) === 43,
  `minutes=${j.minutes} miles=${j.miles}`);
check('route geometry is simplified and [lat,lng]',
  Array.isArray(j.route) && j.route.length <= 151 && j.route[0][0] === 55.95,
  `n=${j.route?.length} first=${JSON.stringify(j.route?.[0])}`);
check('route response still carries CORS',
  r.headers.get('Access-Control-Allow-Origin') === 'https://golf-map.pages.dev',
  `acao=${r.headers.get('Access-Control-Allow-Origin')}`);
check('route relays ORS\'s own X-RateLimit-Limit (GOLF-251)',
  r.headers.get('X-ORS-RateLimit-Limit') === '2000', `hdr=${r.headers.get('X-ORS-RateLimit-Limit')}`);

/* GOLF-251: the site-wide per-minute guard. The pacing lives in
   LookupQuota.take(); its SQL is stubbed to "nothing counted yet" so only
   the per-minute rule can bite, and the clock is driven by hand. */
const realNow = Date.now;
let clock = Date.UTC(2026, 9, 15, 12, 0, 0);
Date.now = () => clock;
const noSql = { exec: () => ({ toArray: () => [] }) };
let q = new LookupQuota({ storage: { sql: noSql } }, {});
const lim = { visitor: 1e9, site: 1e9, minute: 36 };
const takeN = async (n, who = '1.2.3.4') => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await q.take('directions', who, lim));
  return out;
};
let v = await takeN(28);
check('per-minute: a lone cold 10-day load (28 legs) is never held or refused',
  v.every((x) => x.ok && x.waitMs === 0), JSON.stringify(v.filter((x) => !x.ok || x.waitMs)));
v = await takeN(8, '5.6.7.8');
check('per-minute: the 36th call in a minute still goes at once', v.every((x) => x.ok && x.waitMs === 0));
clock += 1000;
v = await takeN(1, '5.6.7.8');
check('per-minute: the 37th, 59 s from a free slot, is refused with a retry time',
  !v[0].ok && v[0].scope === 'minute' && v[0].retryMs === 59000, JSON.stringify(v[0]));
clock += 49000; // 50 s after the burst: the next slot is 10 s off
v = await takeN(2, '5.6.7.8');
check('per-minute: a slot within 15 s is queued, not refused',
  v.every((x) => x.ok) && v[0].waitMs === 10000 && v[1].waitMs === 10000, JSON.stringify(v));
clock += 60000;
v = await takeN(1);
check('per-minute: the window slides on', v[0].ok && v[0].waitMs === 0, JSON.stringify(v[0]));

// Two visitors loading cold trips at the same moment: 56 legs.
q = new LookupQuota({ storage: { sql: noSql } }, {});
v = await takeN(56);
const sent = v.filter((x) => x.ok).length;
check('per-minute: two simultaneous 28-leg loads send 36 now, refuse 20',
  sent === 36 && v.filter((x) => x.scope === 'minute').length === 20, `sent=${sent}`);

// Invariant under a random drip: no 60 s window ever holds more than 36 sends.
q = new LookupQuota({ storage: { sql: noSql } }, {});
const sends = [];
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 3000; i++) {
  clock += Math.floor(rnd() * 3000);
  const burst = rnd() < 0.05 ? 30 : 1;
  for (let b = 0; b < burst; b++) {
    const x = await q.take('directions', 'v' + i, lim);
    if (x.ok) sends.push(clock + x.waitMs);
  }
}
sends.sort((a, b) => a - b);
let worst = 0;
for (let i = 0, k = 0; i < sends.length; i++) {
  while (sends[k] <= sends[i] - 60000) k++;
  worst = Math.max(worst, i - k + 1);
}
check('per-minute: no 60 s window ever exceeds 36 upstream sends', worst <= 36 && sends.length > 1000,
  `worst=${worst} sent=${sends.length}`);
check('per-minute: geocode is paced separately from directions', (await q.take('geocode', 'x', lim)).ok);
Date.now = realNow;

const routeWith = (quota) => worker.fetch(new Request('https://w.test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://golftripper.uk' },
  body: JSON.stringify({ origin: [-3.1883, 55.9533], destination: [-4.2518, 55.8642] }),
}), { ORS_API_KEY: 'test-key', LOOKUP_QUOTA: { idFromName: () => 'g', get: () => quota } }, ctx);
r = await routeWith({ take: async () => ({ ok: false, scope: 'minute', retryMs: 4200 }) });
j = await r.clone().json();
check('per-minute refusal: 429, Retry-After rounded up, limit:"minute", CORS kept',
  r.status === 429 && r.headers.get('Retry-After') === '5' && j.limit === 'minute'
  && r.headers.get('Access-Control-Allow-Origin') === 'https://golftripper.uk',
  `status=${r.status} ra=${r.headers.get('Retry-After')} limit=${j.limit}`);
r = await routeWith({ take: async () => { throw new Error('object down'); } });
check('per-minute: a counter error fails open (route still answered)', r.status === 200, `status=${r.status}`);
const tq = realNow();
r = await routeWith({ take: async () => ({ ok: true, waitMs: 120 }) });
check('per-minute: a queued call waits its slot, then is answered',
  r.status === 200 && realNow() - tq >= 115, `status=${r.status} ms=${realNow() - tq}`);
orsRouteStub = null;

/* GOLF-35B / GOLF-102 P2: the live domain is allowed, a stranger isn't, and a
   preflight carries Max-Age so the browser doesn't re-send one per POST (each
   preflight counts against the api.golftripper.uk rate-limiting rule). */
const preflight = (origin) => worker.fetch(new Request('https://w.test', {
  method: 'OPTIONS', headers: { Origin: origin },
}), {}, ctx);
r = await preflight('https://golftripper.uk');
check('golftripper.uk is on the CORS allowlist',
  r.headers.get('Access-Control-Allow-Origin') === 'https://golftripper.uk',
  `acao=${r.headers.get('Access-Control-Allow-Origin')}`);
check('preflight carries Access-Control-Max-Age',
  r.headers.get('Access-Control-Max-Age') === '7200',
  `max-age=${r.headers.get('Access-Control-Max-Age')}`);
r = await preflight('https://some-branch.golf-map.pages.dev');
check('previews stay on the CORS allowlist',
  r.headers.get('Access-Control-Allow-Origin') === 'https://some-branch.golf-map.pages.dev',
  `acao=${r.headers.get('Access-Control-Allow-Origin')}`);
r = await preflight('https://golftripper.uk.evil.example');
check('a look-alike origin is refused',
  r.headers.get('Access-Control-Allow-Origin') === 'null',
  `acao=${r.headers.get('Access-Control-Allow-Origin')}`);

/* GOLF-234 (1): the Esri key goes to production only, is never cached, and
   its absence is a clean {key:null}, not an error the page has to handle. */
const esriKey = (origin, env) => worker.fetch(new Request('https://w.test/esri-key', {
  headers: origin ? { Origin: origin } : {},
}), env, ctx);
const KEYED = { ESRI_MAP: 'test-esri-key' };
r = await esriKey('https://golftripper.uk', KEYED);
j = await r.json();
const j0 = j;
check('esri-key: production gets the key, uncached',
  j.key === 'test-esri-key' && r.headers.get('Cache-Control') === 'no-store',
  `key=${j.key} cc=${r.headers.get('Cache-Control')}`);
for (const o of ['https://some-branch.golf-map.pages.dev', 'http://localhost:8080',
  'https://golftripper.uk.evil.example', 'https://www.golftripper.uk', null]) {
  r = await esriKey(o, KEYED);
  j = await r.json();
  check(`esri-key: ${o || 'no Origin'} gets none`, r.status === 200 && j.key === null, `status=${r.status} key=${j.key}`);
}
r = await esriKey('https://golftripper.uk', {});
j = await r.json();
check('esri-key: no secret set means key null', r.status === 200 && j.key === null, `key=${j.key}`);

/* GOLF-234 self-check: the key is handed out only if Esri accepts it, the
   check carries the key in a header (never the URL), and the verdict is
   cached so it isn't re-asked on every page load. GOLF-244: the vector
   style is checked alongside, and reported as `vector`. */
check('esri-key: production gets vector:true when the style is served', j0.vector === true, `vector=${j0.vector}`);
check('esri-key: checked once (tile + style), key in a header and never in the URL',
  esriCalls.length === 2 && esriCalls.every((c) => !c.url.includes('test-esri-key')
    && c.headers['X-Esri-Authorization'] === 'Bearer test-esri-key'
    && c.headers.Referer === 'https://golftripper.uk/'),
  `calls=${esriCalls.length}`);
check('esri-key: other origins never trigger a check', esriCalls.length === 2, `calls=${esriCalls.length}`);
await esriKey('https://golftripper.uk', KEYED);
check('esri-key: verdict cached, no second check', esriCalls.length === 2, `calls=${esriCalls.length}`);

esriStub = esriRefuse;
r = await esriKey('https://golftripper.uk', { ESRI_MAP: 'dead-key' });
j = await r.json();
check('esri-key: a key Esri refuses is not handed out', j.key === null && j.vector === false && esriCalls.length === 4,
  `key=${j.key} calls=${esriCalls.length}`);
esriStub = () => new Response('{"error":{"code":200}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
r = await esriKey('https://golftripper.uk', { ESRI_MAP: 'json-200-key' });
j = await r.json();
check('esri-key: a tile 200 that is not an image counts as refused', j.key === null, `key=${j.key}`);
esriStub = (url) => url.includes('/styles/') ? esriRefuse() : esriAll(url);
r = await esriKey('https://golftripper.uk', { ESRI_MAP: 'raster-only-key' });
j = await r.json();
check('esri-key: tiles but no style privilege gives the key with vector:false',
  j.key === 'raster-only-key' && j.vector === false, `key=${j.key} vector=${j.vector}`);
esriStub = () => { throw new Error('unreachable'); };
r = await esriKey('https://golftripper.uk', { ESRI_MAP: 'offline-key' });
j = await r.json();
check('esri-key: Esri unreachable means key null, still a clean 200', r.status === 200 && j.key === null,
  `status=${r.status} key=${j.key}`);
esriStub = esriAll;
const before = esriCalls.length;
r = await esriKey('https://golftripper.uk', { ESRI_MAP: 'dead-key' });
j = await r.json();
check('esri-key: a refused verdict is cached too', j.key === null && esriCalls.length === before,
  `key=${j.key} calls=${esriCalls.length - before}`);

let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.pass ? '' : '   <- ' + t.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
