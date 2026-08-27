#!/usr/bin/env node
/**
 * GOLF-17: static data-integrity checks — no browser needed. Loads
 * data/*.js the same way the shipped page does (plain global-scope
 * scripts, via Node's vm module — not eval/require, so this can't
 * accidentally pick up npm-style module semantics the files don't use)
 * and asserts against the real parsed objects rather than regexing text,
 * so nested fields (t100, nearStation, clubInfo, courseStats) are checked
 * properly.
 *
 * Run: node scripts/test_data.js
 * Exits non-zero (and prints every failure) if anything's wrong.
 *
 * Extend this whenever a new data field or invariant ships — see the
 * checklist comment at the bottom for what's NOT covered here (that's
 * TESTING.md's job, run via the Browser tool against a real page).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const files = ['data/config.js', 'data/stations.js', 'data/courses-london.js', 'data/courses-top100.js', 'data/courses-scotland.js', 'data/courses-wales.js'];

const sandbox = {};
vm.createContext(sandbox);
for (const f of files) {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // vm's top-level `const`/`let` live in a separate lexical environment and
  // don't attach to the sandbox object — swap to `var` (safe here: these
  // files are always flat top-level declarations, no block scoping to lose)
  // so C/C_TOP100/etc. actually land on `sandbox` where we can read them.
  code = code.replace(/^(const|let) /gm, 'var ');
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error(`FAIL: ${f} does not parse — ${e.message}`);
    process.exit(1);
  }
}

const { C, C_TOP100, C_SCOTLAND, C_WALES, R, ISOLATED, REGIONS, ACCESS, BANDS } = sandbox;
const failures = [];
const fail = (msg) => failures.push(msg);

// ---- shape sanity ----
if (!Array.isArray(C) || !Array.isArray(C_TOP100) || !Array.isArray(C_SCOTLAND) || !Array.isArray(C_WALES)) {
  console.error('FAIL: C, C_TOP100, C_SCOTLAND, or C_WALES is not an array — data files did not populate expected globals');
  process.exit(1);
}
const EXPECTED_TOTAL = 295;
if (C.length !== EXPECTED_TOTAL) {
  fail(`C.length is ${C.length}, expected ${EXPECTED_TOTAL} — update EXPECTED_TOTAL in this script if a course was deliberately added/removed`);
}
if (C_TOP100.length !== 100) fail(`C_TOP100.length is ${C_TOP100.length}, expected 100`);
if (C_SCOTLAND.length !== 44) fail(`C_SCOTLAND.length is ${C_SCOTLAND.length}, expected 44`);
if (C_WALES.length !== 28) fail(`C_WALES.length is ${C_WALES.length}, expected 28`);

// ---- known station names, for stn/nearStation validation ----
const stationNames = new Set();
Object.values(R).forEach(stations => stations.forEach(s => stationNames.add(s[0])));
ISOLATED.forEach(s => stationNames.add(s[0]));

const UNIVERSAL_FIELDS = ['n', 'lat', 'lng', 'r', 'a', 'band', 'wd', 'we', 'conf', 'arch', 'spec', 'note', 'site'];

C.forEach((c, i) => {
  const label = `C[${i}] (${c.n || '?'})`;
  UNIVERSAL_FIELDS.forEach(f => {
    if (c[f] === undefined) fail(`${label}: missing required field "${f}"`);
  });
  if (typeof c.lat !== 'number' || typeof c.lng !== 'number') fail(`${label}: lat/lng not numeric`);
  if (!REGIONS.includes(c.r)) fail(`${label}: region "${c.r}" not in REGIONS`);
  if (!ACCESS[c.a]) fail(`${label}: access tier "${c.a}" not in ACCESS`);
  if (c.band !== 'na' && !BANDS[c.band]) fail(`${label}: band "${c.band}" not in BANDS and not "na"`);

  // London-catchment-only: every C entry (non-Top100, non-Scotland, non-Wales) should have stn/walk/book per SCHEMA.md
  if (!c.top100 && !c.topScot && !c.topWales) {
    if (c.stn === undefined) fail(`${label}: London-catchment entry missing "stn"`);
    else if (!stationNames.has(c.stn)) fail(`${label}: stn "${c.stn}" does not match any known station in R/ISOLATED`);
    if (c.walk === undefined) fail(`${label}: London-catchment entry missing "walk"`);
  }

  if (c.nearStation) {
    const ns = c.nearStation;
    if (typeof ns.n !== 'string' || typeof ns.lat !== 'number' || typeof ns.lng !== 'number' || typeof ns.mi !== 'number') {
      fail(`${label}: malformed nearStation ${JSON.stringify(ns)}`);
    }
  }
  if (c.clubInfo) {
    const ci = c.clubInfo;
    const allowed = ['phone', 'membership', 'teeBooking', 'blurb'];
    Object.keys(ci).forEach(k => { if (!allowed.includes(k)) fail(`${label}: clubInfo has unexpected key "${k}"`); });
  }
  if (c.courseStats) {
    const cs = c.courseStats;
    ['par', 'slope', 'rating'].forEach(k => {
      if (cs[k] !== undefined && typeof cs[k] !== 'number') fail(`${label}: courseStats.${k} is not numeric`);
    });
  }
  if (c.logo && !fs.existsSync(path.join(ROOT, c.logo))) {
    fail(`${label}: logo path "${c.logo}" does not exist on disk`);
  }
});

// ---- duplicate detection (name+coords) ----
const seen = new Map();
C.forEach((c, i) => {
  const key = `${c.n}|${c.lat}|${c.lng}`;
  if (seen.has(key)) fail(`Duplicate entry: "${c.n}" at C[${seen.get(key)}] and C[${i}]`);
  else seen.set(key, i);
});

// ---- report ----
if (failures.length) {
  console.error(`\n${failures.length} data integrity failure(s):\n`);
  failures.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log(`OK — ${C.length} courses (${C_TOP100.length} Top 100) pass all data-integrity checks.`);
}

/* NOT covered here — needs a real browser, see TESTING.md:
   - console errors on load
   - the "no undefined in any popupHTML(i)" sweep
   - localStorage persistence round-trip
   - filter/chip/search behavior
   - Trip Planning / Course Handicap calculator UI flows
   Add a new check above whenever a new *data field or invariant* ships;
   add a new manual step to TESTING.md whenever a new *interactive feature*
   ships. */
