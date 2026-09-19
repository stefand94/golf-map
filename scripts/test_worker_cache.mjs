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
writeFileSync(tmp, readFileSync(WORKER_SRC, 'utf8'));

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

globalThis.fetch = async (url, opts) => {
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
    if (b.status && b.status !== 200) return new Response('mirror boom', { status: b.status });
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

const worker = (await import(pathToFileURL(tmp).href)).default;
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
overpassStatus = 521;
overpassCalls = 0;
r = await call({ mode: 'heritage-pois', point: [-2.8021, 56.3423], radius: 3000 });
check('upstream failure returns an error', r.status === 502, `status=${r.status}`);
overpassCalls = 0;
r = await call({ mode: 'heritage-pois', point: [-2.8021, 56.3423], radius: 3000 });
check('failure was NOT cached (retried upstream)', overpassCalls >= 1 && r.headers.get('X-POI-Cache') === null,
  `calls=${overpassCalls} hdr=${r.headers.get('X-POI-Cache')}`);
overpassStatus = 200;

// ── 7. heritage + hotels modes cache on their own keys
overpassCalls = 0;
await call({ mode: 'heritage-pois', point: [-2.8021, 56.3423], radius: 3000 });
const afterFirst = overpassCalls;
r = await call({ mode: 'heritage-pois', point: [-2.8021, 56.3423], radius: 3000 });
check('heritage-pois caches', r.headers.get('X-POI-Cache') === 'HIT' && overpassCalls === afterFirst,
  `hdr=${r.headers.get('X-POI-Cache')} calls=${overpassCalls}`);
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
check('overpass-api.de is tried first', /overpass-api\.de/.test(calledUrls[0] || ''), `first=${calledUrls[0]}`);
check('sends a User-Agent (else overpass-api.de 406s)',
  /golf-map/.test(String(lastHeaders?.['User-Agent'] || '')), `ua=${lastHeaders?.['User-Agent']}`);

// 11. a healthy primary must NOT fan out to the second mirror
calledUrls = []; overpassCalls = 0;
await call({ mode: 'hotelsViewport', bbox: [53.40, -3.05, 53.45, -2.99] });
check('fast primary does not hedge (1 upstream call)', overpassCalls === 1, `calls=${overpassCalls} urls=${calledUrls.length}`);

// 12. a primary that fails outright should hedge at once, not wait out the delay
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass-api.de': { status: 504 } };
let t0 = Date.now();
r = await call({ mode: 'hotelsViewport', bbox: [55.60, -4.60, 55.65, -4.54] });
j = await r.clone().json();
check('fast-failing primary falls back to mirror 2',
  r.status === 200 && j.pois?.length === 2 && calledUrls.length === 2,
  `status=${r.status} n=${j.pois?.length} urls=${calledUrls.length}`);
check('fast failure does not wait out the hedge delay', Date.now() - t0 < 2000, `${Date.now() - t0}ms`);

// 13. a *slow* primary is hedged, and the quicker mirror's answer wins
calledUrls = []; overpassCalls = 0;
mirrorBehaviour = { 'overpass-api.de': { delayMs: 60000 } };
t0 = Date.now();
r = await call({ mode: 'hotelsViewport', bbox: [57.47, -1.80, 57.52, -1.74] });
j = await r.clone().json();
const elapsed = Date.now() - t0;
check('slow primary is hedged onto mirror 2', calledUrls.length === 2, `urls=${calledUrls.length}`);
check('hedge returns the fallback answer', r.status === 200 && j.pois?.length === 2,
  `status=${r.status} n=${j.pois?.length}`);
check('hedge resolves in ~the hedge delay, not the slow mirror',
  elapsed >= 3500 && elapsed < 12000, `${elapsed}ms`);
mirrorBehaviour = {};

// 14. both mirrors down is still a clean 502, not a hang
calledUrls = [];
mirrorBehaviour = { 'overpass': { status: 504 } };
r = await call({ mode: 'hotelsViewport', bbox: [50.40, -4.20, 50.45, -4.14] });
check('all mirrors failing returns 502', r.status === 502, `status=${r.status}`);
mirrorBehaviour = {};

let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.pass ? '' : '   <- ' + t.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
