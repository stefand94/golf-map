/* GOLF-277: unit test for the Worker's short-share store (POST/GET /share).

   Run with:  node scripts/test_share.mjs

   Same copy-to-temp trick as test_worker_cache.mjs. KV and the Durable Object are stubs.
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


const { default: worker } = await import(pathToFileURL(tmp).href);
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const kv = new Map(); let puts = 0;
const SHARES = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { puts++; kv.set(k, v); } };
let counted = [], quotaOk = true;
const LOOKUP_QUOTA = { idFromName: () => 'x', get: () => ({ count: async (e, v, l) => { counted.push([e, l]); return quotaOk ? { ok: true } : { ok: false, scope: 'visitor' }; } }) };
const env = { SHARES, LOOKUP_QUOTA };
const ORIGIN = 'https://golftripper.uk';
const trip = { v: 1, gs: 4, nm: 'Fife', seq: ['a'], days: [{ id: 1, kind: 'golf', items: [] }] };
const post = (body, o = {}, e = env) => worker.fetch(new Request('https://api.golftripper.uk/share', { method: 'POST', headers: { Origin: ORIGIN, ...(o.h || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e, { waitUntil() {} });
const get = (id, e = env) => worker.fetch(new Request('https://api.golftripper.uk/share/' + id, { headers: { Origin: ORIGIN } }), e, { waitUntil() {} });

const r1 = await post({ p: trip, m: { n: 'Fife', d: '1 day · X' } });
const { id } = await r1.json();
check('save answers a 9-char id', r1.status === 200 && /^[a-z2-7]{9}$/.test(id), id);
check('save wrote once and counted once', puts === 1 && counted.length === 1 && counted[0][0] === 'shsave', `${puts}/${counted.length}`);
const r2 = await post({ p: trip, m: { n: 'Fife', d: '1 day · X' } });
check('same trip again: same id, no second write, no quota spent', (await r2.json()).id === id && puts === 1 && counted.length === 1, `${puts}`);
const g = await get(id);
const rec = await g.json();
check('GET returns the stored record', g.status === 200 && rec.p.nm === 'Fife' && rec.m.d === '1 day · X', JSON.stringify(rec).slice(0, 80));
check('GET carries CORS for the site', g.headers.get('Access-Control-Allow-Origin') === ORIGIN, String(g.headers.get('Access-Control-Allow-Origin')));
check('GET unknown id is 404', (await get('aaaaaaaaa')).status === 404, '');
check('GET malformed id is 404', (await get('..%2Fx')).status === 404, '');
check('a different trip gets a different id', (await (await post({ p: { ...trip, gs: 2 }, m: {} })).json()).id !== id, '');
check('not a trip: 400', (await post({ p: { v: 1 } })).status === 400, '');
check('not JSON: 400', (await post('{nope')).status === 400, '');
check('too many days: 400', (await post({ p: { ...trip, days: Array(31).fill({ items: [] }) } })).status === 400, '');
check('oversize: 413', (await post({ p: trip, m: { n: 'x'.repeat(130000) } })).status === 413, '');
check('foreign origin: 403', (await post({ p: trip }, { h: { Origin: 'https://evil.example' } })).status === 403, '');
const before = puts; quotaOk = false;
const lim = await post({ p: { ...trip, gs: 9 }, m: {} });
check('over the save limit: 429 and nothing written', lim.status === 429 && puts === before, String(lim.status));
quotaOk = true;
check('no KV binding: 503 (the app falls back to the long link)', (await post({ p: trip }, {}, {})).status === 503, '');
const stats = await worker.fetch(new Request('https://api.golftripper.uk/stats'), { LOOKUP_QUOTA: { idFromName: () => 'x', get: () => ({ stats: async () => [{ day: '2026-10-17', event: 'shsave', n: 3 }, { day: '2026-10-17', event: 'share', n: 1 }] }) } }, {});
const sj = await stats.json();
check('/stats ignores the limiter row', sj.totals.share === 1 && !('shsave' in sj.totals) && !Number.isNaN(sj.totals.share), JSON.stringify(sj.totals));

let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.pass ? '' : '   <- ' + t.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
