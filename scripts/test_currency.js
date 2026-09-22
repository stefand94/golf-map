#!/usr/bin/env node
/* ============================================================
   scripts/test_currency.js — unit tests for GOLF-169: a course's
   currency comes from the course (feeV2.currency / courseNation()),
   never sniffed-and-guessed from fee text alone, and money buckets
   key on the currency CODE so two dollar nations never silently sum.

   Lifts courseCurrency()/curSym()/CURRENCY_SYMS (js/util.js) and
   moneyBucketAdd/Fmt/Scale/Count (js/trip-geo.js) out by name/brace-
   matching, same technique as scripts/test_fee_v2.js, and evals them
   against a synthetic C — no browser globals needed. AU/NZ course data
   doesn't exist yet (GOLF-157, parked) so the two-dollar-nation case is
   proven with synthetic feeV2.currency:'AUD'/'NZD' fixtures here rather
   than fake entries in data/*.js.

   Run: node scripts/test_currency.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UTIL_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'util.js'), 'utf8');
const GEO_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'trip-geo.js'), 'utf8');

function grabFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
function grabConst(src, name) {
  const re = new RegExp('const ' + name + '\\s*=.*?;', 's');
  const m = src.match(re);
  if (!m) throw new Error('const not found: ' + name);
  return m[0];
}

const sandbox = {};
sandbox.C = [];
sandbox.EDITS = {};
vm.createContext(sandbox);

// courseNation() (js/explore.js) is intentionally NOT loaded here — the
// point of tier 3 (legacy text sniff) is to cover courses on a nation
// courseCurrency() can't see. Tests that need a nation exercise it via a
// hand-rolled stand-in, same lazy-binding contract courseCurrency() uses
// in the real app (courseNation loads after util.js but is only called
// at render time).
vm.runInContext([
  grabConst(UTIL_SRC, 'CURRENCY_SYMS'),
  grabFn(UTIL_SRC, 'curSym'),
  grabConst(UTIL_SRC, 'NATION_CURRENCY'),
  grabFn(UTIL_SRC, 'feeCurrencyCodeFromText'),
  grabFn(UTIL_SRC, 'V'),
].join('\n'), sandbox, { filename: 'util-currency-slice' });
vm.runInContext(grabFn(UTIL_SRC, 'courseCurrency'), sandbox, { filename: 'util-courseCurrency' });
vm.runInContext([
  grabFn(GEO_SRC, 'moneyBucketAdd'),
  grabFn(GEO_SRC, 'moneyBucketFmt'),
  grabFn(GEO_SRC, 'moneyBucketScale'),
  grabFn(GEO_SRC, 'moneyBucketCount'),
].join('\n'), sandbox, { filename: 'trip-geo-money-slice' });

const { courseCurrency, curSym, moneyBucketAdd, moneyBucketFmt, moneyBucketCount, moneyBucketScale } = sandbox;

let pass = 0, fail = 0;
function ok(label, cond, got) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + label + (got !== undefined ? '  (got ' + JSON.stringify(got) + ')' : '')); }
}

/* ---- fixtures --------------------------------------------------------
   0: GB course, no feeV2 at all — courseNation() isn't loaded in this
      sandbox (see note above), so this exercises tier 3, the legacy
      wd/we text sniff, exactly as a real no-feeV2 GB course would if
      courseNation() somehow couldn't place it either.
   1: feeV2.currency is authoritative even when the free text looks
      like a different currency (a stale/wrong wd string must not win).
   2: Republic of Ireland, feeV2.currency:'EUR'.
   3: South Africa, feeV2.currency:'ZAR'.
   4: synthetic Australia (GOLF-157 not yet merged) — feeV2.currency:'AUD'.
   5: synthetic New Zealand — feeV2.currency:'NZD'. Same "$" symbol as #4.
------------------------------------------------------------------- */
sandbox.C = [
  /* 0 */ { n: 'LegacyGB', wd: '£45', we: '£55' },
  /* 1 */ { n: 'StaleTextClub', wd: '$999 (old website text)', we: '$999',
            feeV2: { currency: 'GBP', confidence: 'published-rates', seasons: [] } },
  /* 2 */ { n: 'RepublicLinks', wd: '€80', we: '€95',
            feeV2: { currency: 'EUR', confidence: 'published-rates', seasons: [] } },
  /* 3 */ { n: 'JoburgClub', wd: 'R650', we: 'R650',
            feeV2: { currency: 'ZAR', confidence: 'published-rates', seasons: [] } },
  /* 4 */ { n: 'SydneyLinks (synthetic, GOLF-157 not merged)', wd: '$100', we: '$120',
            feeV2: { currency: 'AUD', confidence: 'published-rates', seasons: [] } },
  /* 5 */ { n: 'AucklandDunes (synthetic, GOLF-157 not merged)', wd: '$150', we: '$170',
            feeV2: { currency: 'NZD', confidence: 'published-rates', seasons: [] } },
];

// ---- courseCurrency() resolution -------------------------------------
ok('no-feeV2 GB course resolves to a code, not a bare symbol',
  courseCurrency(0) === 'GBP', courseCurrency(0));
ok('feeV2.currency wins over stale/misleading free text',
  courseCurrency(1) === 'GBP', courseCurrency(1));
ok('Republic of Ireland resolves to EUR', courseCurrency(2) === 'EUR', courseCurrency(2));
ok('South Africa resolves to ZAR', courseCurrency(3) === 'ZAR', courseCurrency(3));
ok('synthetic AU course resolves to AUD', courseCurrency(4) === 'AUD', courseCurrency(4));
ok('synthetic NZ course resolves to NZD', courseCurrency(5) === 'NZD', courseCurrency(5));

// ---- curSym() : display symbol, never the bucket key ------------------
ok("curSym('GBP') === '£'", curSym('GBP') === '£');
ok("curSym('EUR') === '€'", curSym('EUR') === '€');
ok("curSym('ZAR') === 'R'", curSym('ZAR') === 'R');
ok("curSym('AUD') === '$'", curSym('AUD') === '$');
ok("curSym('NZD') === '$'", curSym('NZD') === '$');
ok('AUD and NZD share a display symbol (the whole reason codes must differ)',
  curSym('AUD') === curSym('NZD'));

// ---- the regression this ticket exists to prevent ---------------------
// Two dollar nations in one trip: bucket by courseCurrency() (a code), the
// way js/trip-geo.js's fee/cost totals do. AUD and NZD must NOT collapse
// into one '$' bucket and sum.
(function two_dollar_nations_do_not_sum() {
  const buckets = {};
  moneyBucketAdd(buckets, courseCurrency(4), 100); // AUD 100
  moneyBucketAdd(buckets, courseCurrency(5), 150); // NZD 150
  ok('two distinct buckets exist (AUD and NZD kept apart)',
    moneyBucketCount(buckets) === 2, buckets);
  ok('AUD bucket holds exactly 100, not summed with NZD',
    buckets.AUD === 100, buckets);
  ok('NZD bucket holds exactly 150, not summed with AUD',
    buckets.NZD === 150, buckets);
  const fmt = moneyBucketFmt(buckets);
  ok('formats as two separate "$" figures, never a combined "$250"',
    fmt === '$100 · $150' || fmt === '$150 · $100', fmt);
  ok('never renders the wrong-arithmetic combined figure',
    !fmt.includes('$250'), fmt);
})();

// A single-currency case is unaffected (sanity check against regression
// in the bucket helpers themselves, not just the AUD/NZD case).
(function single_currency_unaffected() {
  const buckets = {};
  moneyBucketAdd(buckets, courseCurrency(0), 45); // GBP
  moneyBucketAdd(buckets, courseCurrency(1), 55); // GBP
  ok('one bucket, summed normally within the same currency',
    moneyBucketCount(buckets) === 1 && buckets.GBP === 100, buckets);
  ok('formats as a single figure', moneyBucketFmt(buckets) === '£100', moneyBucketFmt(buckets));
})();

console.log(`${fail ? 'FAIL' : 'ok'} — test_currency: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
