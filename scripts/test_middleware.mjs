/* GOLF-35B: unit test for functions/_middleware.js's host redirects.

   Run with:  node scripts/test_middleware.mjs

   Same no-package.json trick as test_worker_cache.mjs: copy the module to a
   .mjs in the OS temp dir and import that. Checks that the bare
   golf-map.pages.dev and www.golftripper.uk 301 to the same path + query on
   golftripper.uk, and that golftripper.uk itself and every branch preview
   pass straight through.
*/
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const SRC = new URL('../functions/_middleware.js', import.meta.url);
const tmp = join(mkdtempSync(join(tmpdir(), 'golfmw-')), 'mw.mjs');
writeFileSync(tmp, readFileSync(SRC, 'utf8'));
const { onRequest } = await import(pathToFileURL(tmp).href);

const PASSED = new Response('app');
const run = (url, env = {}) => onRequest({ request: new Request(url), env, next: async () => PASSED });

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

async function redirects(from, to) {
  const r = await run(from);
  check(`${from} -> ${to}`, r.status === 301 && r.headers.get('Location') === to,
    `status=${r.status} location=${r.headers.get('Location')}`);
}
async function passes(url, env) {
  const r = await run(url, env);
  check(`${url} is not redirected`, r === PASSED, `status=${r.status} location=${r.headers.get('Location')}`);
}

await redirects('https://golf-map.pages.dev/', 'https://golftripper.uk/');
await redirects('https://golf-map.pages.dev/london-golf-map-v5_1?x=1', 'https://golftripper.uk/london-golf-map-v5_1?x=1');
await redirects('https://golf-map.pages.dev/sw.js', 'https://golftripper.uk/sw.js');
await redirects('https://www.golftripper.uk/london-golf-map-v5_1', 'https://golftripper.uk/london-golf-map-v5_1');
await passes('https://golftripper.uk/london-golf-map-v5_1');
await passes('https://golf-150-ui.golf-map.pages.dev/');
await passes('https://a0fe66f9.golf-map.pages.dev/london-golf-map-v5_1');
await passes('http://localhost:8788/');

// The redirect runs before the (dormant) preview password gate, and the
// gate still works on a preview when DEV_PASSWORD is set.
const gated = await run('https://golf-150-ui.golf-map.pages.dev/', { DEV_PASSWORD: 'x' });
check('preview password gate still applies when set', gated.status === 401, `status=${gated.status}`);

let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.pass ? '' : '   <- ' + t.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
