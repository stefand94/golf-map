/* GOLF-35B: unit test for functions/_middleware.js's host redirects.

   Run with:  node scripts/test_middleware.mjs

   Same no-package.json trick as test_worker_cache.mjs: copy the module to a
   .mjs in the OS temp dir and import that. Checks that the bare
   golf-map.pages.dev and www.golftripper.uk 301 to the same path + query on
   golftripper.uk, that golftripper.uk itself and every branch preview pass
   straight through, (GOLF-214) that the old /london-golf-map-v5_1
   address 301s to / on every host, (GOLF-220) the X-Build / ?v= rules, and
   (GOLF-221) that only production is indexable.
*/
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const SRC = new URL('../functions/_middleware.js', import.meta.url);
const tmp = join(mkdtempSync(join(tmpdir(), 'golfmw-')), 'mw.mjs');
writeFileSync(tmp, readFileSync(SRC, 'utf8'));
const { onRequest } = await import(pathToFileURL(tmp).href);

/* GOLF-220 made the middleware read this deployment's build from
   env.ASSETS (js/app-version.js) and re-wrap every response with X-Build,
   so the harness needs an ASSETS stub, and a passed-through response is a
   copy of next()'s, not the same object. next() makes a fresh Response per
   call because a body stream can only be wrapped once. */
const BUILD = 'abc123def0';
const ASSETS = { fetch: async () => new Response(`const APP_VERSION='golfmap-shell-v5-${BUILD}';`) };
const run = (url, env = {}) => onRequest({
  request: new Request(url), env: { ASSETS, ...env },
  next: async () => new Response('app', { headers: { 'Content-Type': 'text/html' } }),
});

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

async function redirects(from, to) {
  const r = await run(from);
  check(`${from} -> ${to}`, r.status === 301 && r.headers.get('Location') === to,
    `status=${r.status} location=${r.headers.get('Location')}`);
}
async function passes(url, env) {
  const r = await run(url, env);
  const body = r.status === 200 ? await r.text() : '';
  check(`${url} is not redirected`, r.status === 200 && body === 'app' && !r.headers.get('Location'),
    `status=${r.status} location=${r.headers.get('Location')}`);
}

await redirects('https://golf-map.pages.dev/', 'https://golftripper.uk/');
await redirects('https://golf-map.pages.dev/sw.js', 'https://golftripper.uk/sw.js');
await redirects('https://www.golftripper.uk/js/map.js?v=1', 'https://golftripper.uk/js/map.js?v=1');
await passes('https://golftripper.uk/');
await passes('https://golf-150-ui.golf-map.pages.dev/');
await passes('http://localhost:8788/');

// GOLF-214: the old app address lands on / on the same host, query kept
// (the hash never reaches the server; the browser carries it over). An old
// address on an old host goes straight to the clean URL in one hop.
await redirects('https://golftripper.uk/london-golf-map-v5_1', 'https://golftripper.uk/');
await redirects('https://golftripper.uk/london-golf-map-v5_1.html', 'https://golftripper.uk/');
await redirects('https://golftripper.uk/london-golf-map-v5_1?x=1', 'https://golftripper.uk/?x=1');
await redirects('https://golf-map.pages.dev/london-golf-map-v5_1?x=1', 'https://golftripper.uk/?x=1');
await redirects('https://www.golftripper.uk/london-golf-map-v5_1.html', 'https://golftripper.uk/');
await redirects('https://a0fe66f9.golf-map.pages.dev/london-golf-map-v5_1', 'https://a0fe66f9.golf-map.pages.dev/');
await redirects('https://golf-150-ui.golf-map.pages.dev/london-golf-map-v5_1.html', 'https://golf-150-ui.golf-map.pages.dev/');
await passes('https://golftripper.uk/london-golf-map-v5_1/extra');

// The redirect runs before the (dormant) preview password gate, and the
// gate still works on a preview when DEV_PASSWORD is set.
const gated = await run('https://golf-150-ui.golf-map.pages.dev/', { DEV_PASSWORD: 'x' });
check('preview password gate still applies when set', gated.status === 401, `status=${gated.status}`);

// GOLF-220: every passed-through GET says which build served it, and a
// ?v= for another build is served no-store so neither cache keeps it.
const own = await run(`https://golftripper.uk/js/map.js?v=${BUILD}`);
check('X-Build on a passed-through response', own.headers.get('X-Build') === BUILD, `x-build=${own.headers.get('X-Build')}`);
check('?v= of this build stays cacheable', own.headers.get('Cache-Control') !== 'no-store', `cache-control=${own.headers.get('Cache-Control')}`);
const other = await run('https://golftripper.uk/js/map.js?v=0000000000');
check('?v= of another build is no-store', other.headers.get('Cache-Control') === 'no-store', `cache-control=${other.headers.get('Cache-Control')}`);

// GOLF-221: production is indexable; anything else (branch previews) is
// noindex, with a Disallow robots.txt. Redirects carry no header either way.
const prod = await run('https://golftripper.uk/');
check('production has no X-Robots-Tag', prod.headers.get('X-Robots-Tag') === null, `x-robots-tag=${prod.headers.get('X-Robots-Tag')}`);
const prodRobots = await run('https://golftripper.uk/robots.txt');
check('production robots.txt is the static file', (await prodRobots.text()) === 'app', 'middleware answered it itself');
const prev = await run('https://golf-150-ui.golf-map.pages.dev/');
check('preview is noindex', prev.headers.get('X-Robots-Tag') === 'noindex, nofollow', `x-robots-tag=${prev.headers.get('X-Robots-Tag')}`);
const prevRobots = await run('https://golf-150-ui.golf-map.pages.dev/robots.txt');
const prevRobotsBody = await prevRobots.text();
check('preview robots.txt disallows everything', /Disallow: \/\n/.test(prevRobotsBody) && prevRobots.headers.get('X-Robots-Tag') === 'noindex, nofollow',
  `body=${JSON.stringify(prevRobotsBody)}`);
check('gated preview 401 is noindex too', gated.headers.get('X-Robots-Tag') === 'noindex, nofollow', `x-robots-tag=${gated.headers.get('X-Robots-Tag')}`);
const bareRobots = await run('https://golf-map.pages.dev/robots.txt');
check('bare pages.dev robots.txt still 301s to production', bareRobots.status === 301 && bareRobots.headers.get('Location') === 'https://golftripper.uk/robots.txt',
  `status=${bareRobots.status} location=${bareRobots.headers.get('Location')}`);

let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.pass ? '' : '   <- ' + t.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
