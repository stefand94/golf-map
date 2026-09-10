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
const files = ['data/config.js', 'data/stations.js', 'data/courses-london.js', 'data/courses-top100.js', 'data/courses-scotland.js', 'data/courses-wales.js', 'data/courses-ireland.js', 'data/courses-southafrica.js'];

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
const EXPECTED_TOTAL = 879; // 2026-09-09 GOLF-121a: 557 + 322 net SA (99->421: +321 DotGolf, +5 OSM re-adds, -5 society aliases, +Randpark Bushwillow)
if (C.length !== EXPECTED_TOTAL) {
  fail(`C.length is ${C.length}, expected ${EXPECTED_TOTAL} — update EXPECTED_TOTAL in this script if a course was deliberately added/removed`);
}
if (C_TOP100.length !== 114) fail(`C_TOP100.length is ${C_TOP100.length}, expected 114`);
if (C_SCOTLAND.length !== 100) fail(`C_SCOTLAND.length is ${C_SCOTLAND.length}, expected 100`);
if (C_WALES.length !== 38) fail(`C_WALES.length is ${C_WALES.length}, expected 38`);

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

  // London-catchment-only: every C entry (non-Top100, non-Scotland, non-Wales, non-Ireland) should have stn/walk/book per SCHEMA.md
  if (!c.top100 && !c.topScot && !c.topWales && !c.topIreland && !c.topSouthAfrica) {
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
  // GOLF-97: banded green-fee schema — additive, optional. When present,
  // shape must be {weekday,weekend,weekendTwilight?,confidence,lastVerified}
  // with each band a {min,max} pair (numbers or null, for 'poa' courses).
  if (c.fee) {
    const fee = c.fee;
    const validConf = ['published-range', 'published-from-only', 'estimated', 'poa'];
    if (fee.confidence !== undefined && !validConf.includes(fee.confidence)) {
      fail(`${label}: fee.confidence "${fee.confidence}" not one of ${validConf.join(', ')}`);
    }
    if (fee.lastVerified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fee.lastVerified)) {
      fail(`${label}: fee.lastVerified "${fee.lastVerified}" is not an ISO date (YYYY-MM-DD)`);
    }
    ['weekday', 'weekend', 'weekendTwilight'].forEach(k => {
      const band = fee[k];
      if (band === undefined) return;
      if (typeof band !== 'object' || band === null) { fail(`${label}: fee.${k} is not an object`); return; }
      ['min', 'max'].forEach(mk => {
        const v = band[mk];
        if (v !== null && v !== undefined && typeof v !== 'number') {
          fail(`${label}: fee.${k}.${mk} is not numeric or null`);
        }
      });
    });
  }
  // GOLF-120: granular green-fee schema v2 — additive, optional. See
  // docs/project/GOLF-120-schema-v2-proposal.md §2 for the full shape.
  if (c.feeV2) {
    const fv = c.feeV2;
    const CUR = ['GBP', 'EUR', 'ZAR', 'USD'];
    const CONF = ['published-rates', 'published-from-only', 'estimated', 'poa'];
    const DAY = ['weekday', 'weekend', 'friday', 'any'];
    const BAND = ['anytime', 'morning', 'afternoon', 'twilight', 'super-twilight'];
    const CART = ['included', 'mandatory', 'extra'];
    if (!CUR.includes(fv.currency)) fail(`${label}: feeV2.currency "${fv.currency}" not one of ${CUR.join(', ')}`);
    if (!CONF.includes(fv.confidence)) fail(`${label}: feeV2.confidence "${fv.confidence}" not one of ${CONF.join(', ')}`);
    if (fv.lastVerified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fv.lastVerified)) {
      fail(`${label}: feeV2.lastVerified "${fv.lastVerified}" is not an ISO date`);
    }
    if (!Array.isArray(fv.seasons)) fail(`${label}: feeV2.seasons is not an array`);
    else if (fv.confidence === 'poa' && fv.seasons.length) fail(`${label}: feeV2 is 'poa' but carries ${fv.seasons.length} season(s) — expected []`);
    else {
      fv.seasons.forEach((s, si) => {
        if (!s || typeof s !== 'object') { fail(`${label}: feeV2.seasons[${si}] not an object`); return; }
        if (typeof s.name !== 'string') fail(`${label}: feeV2.seasons[${si}].name missing`);
        if (s.months !== undefined && (!Array.isArray(s.months) || s.months.some(m => !(m >= 1 && m <= 12)))) {
          fail(`${label}: feeV2.seasons[${si}].months must be 1–12 integers`);
        }
        if (!Array.isArray(s.rates) || !s.rates.length) { fail(`${label}: feeV2.seasons[${si}].rates missing/empty`); return; }
        s.rates.forEach((r, ri) => {
          const at = `feeV2.seasons[${si}].rates[${ri}]`;
          if (typeof r.amount !== 'number') fail(`${label}: ${at}.amount is not numeric`);
          if (r.amountMax !== undefined && typeof r.amountMax !== 'number') fail(`${label}: ${at}.amountMax is not numeric`);
          if (!DAY.includes(r.day)) fail(`${label}: ${at}.day "${r.day}" not one of ${DAY.join(', ')}`);
          if (r.timeBand !== undefined && !BAND.includes(r.timeBand)) fail(`${label}: ${at}.timeBand "${r.timeBand}" invalid`);
          if (r.bandStart !== undefined && !/^\d{1,2}:\d{2}$/.test(r.bandStart)) fail(`${label}: ${at}.bandStart "${r.bandStart}" not HH:MM`);
          if (r.holes !== undefined && ![18, 9, 'day'].includes(r.holes)) fail(`${label}: ${at}.holes "${r.holes}" invalid`);
        });
      });
    }
    if (fv.cart !== undefined) {
      if (!fv.cart || !CART.includes(fv.cart.status)) fail(`${label}: feeV2.cart.status "${fv.cart && fv.cart.status}" not one of ${CART.join(', ')}`);
      if (fv.cart && fv.cart.amount !== undefined && typeof fv.cart.amount !== 'number') fail(`${label}: feeV2.cart.amount is not numeric`);
    }
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
