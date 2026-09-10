#!/usr/bin/env node
/* ============================================================
   scripts/test_fee_v2.js — unit tests for the GOLF-120 feeV2
   resolution helpers in js/trip-geo.js.

   These helpers are plain functions of C[i].feeV2 / .fee / .wd /
   .we, so the test lifts just those function bodies out of
   js/trip-geo.js (by name, brace-matched) and evals them against
   a synthetic C — no browser globals (L, map, …) needed.

   Run: node scripts/test_fee_v2.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'trip-geo.js'), 'utf8');

function grab(name) {
  const start = SRC.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let depth = 0, i = SRC.indexOf('{', start);
  for (let j = i; j < SRC.length; j++) {
    const ch = SRC[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return SRC.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

const NEEDED = [
  'extractFee', 'feeFieldForDate', 'feeV2HM', 'feeV2Candidates', 'feeV2Pick',
  'feeCartFor', 'feeLabelFrom', 'feeRangeForLegacy', 'feeRangeForCtx', 'feeRangeFor',
  'feeNumberFor', 'feeNumberForDate', 'feeRangeForDate',
];

const sandbox = {};
sandbox.C = [];
sandbox.V = (i, f) => sandbox.C[i][f];
vm.createContext(sandbox);
vm.runInContext(NEEDED.map(grab).join('\n'), sandbox, { filename: 'trip-geo-fee-slice' });

const { feeRangeFor, feeNumberFor, feeNumberForDate, feeRangeForDate, feeCartFor, feeLabelFrom } = sandbox;

let pass = 0, fail = 0;
function ok(label, cond, got) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + label + (got !== undefined ? '  (got ' + JSON.stringify(got) + ')' : '')); }
}
function near(a, b) { return a != null && Math.abs(a - b) < 1e-6; }

/* ---- fixtures -------------------------------------------------------- */
sandbox.C = [
  // 0 — minimal: one all-season, flat weekday + weekend
  { n: 'Parkstone', wd: '£95', we: '£120', feeV2: {
      currency: 'GBP', confidence: 'published-rates', seasons: [
        { name: 'all', rates: [
          { day: 'weekday', amount: 95 },
          { day: 'weekend', amount: 120 } ] } ] } },
  // 1 — 3-season, weekday only priced in low season -> weekend reuses weekday
  { n: 'SeasonalLinks', wd: '£120', we: '£140', feeV2: {
      currency: 'GBP', confidence: 'published-rates', seasons: [
        { name: 'high', months: [5,6,7,8,9], rates: [
          { day: 'weekday', amount: 260 }, { day: 'weekend', amount: 300 },
          { day: 'weekday', timeBand: 'twilight', bandStart: '16:00', amount: 150 } ] },
        { name: 'shoulder', months: [4,10], rates: [
          { day: 'weekday', amount: 185 }, { day: 'weekend', amount: 210 } ] },
        { name: 'winter', months: [11,12,1,2,3], rates: [
          { day: 'any', amount: 95 } ] } ] } },
  // 2 — "from" headline
  { n: 'FromOnly', wd: '£400', we: '£420', feeV2: {
      currency: 'GBP', confidence: 'published-from-only', seasons: [
        { name: 'all', rates: [
          { day: 'weekday', amount: 400, isFrom: true },
          { day: 'weekend', amount: 420, isFrom: true } ] } ] } },
  // 3 — mandatory buggy
  { n: 'CartClub', wd: 'R980', we: 'R980', feeV2: {
      currency: 'ZAR', confidence: 'published-rates',
      cart: { status: 'mandatory', amount: 650, per: 'cart' },
      seasons: [ { name: 'all', rates: [ { day: 'any', amount: 980 } ] } ] } },
  // 4 — poa
  { n: 'MembersOnly', wd: '£200', we: '£200', feeV2: {
      currency: 'GBP', confidence: 'poa', seasons: [] } },
  // 5 — no feeV2 at all: legacy wd/we only
  { n: 'LegacyOnly', wd: '£70', we: '£90' },
  // 6 — no feeV2, but a GOLF-97 v1 fee object
  { n: 'V1Only', wd: '£100', we: '£100', fee: {
      weekday: { min: 120, max: 160 }, weekend: { min: 160, max: 200 }, confidence: 'published-range' } },
  // 7 — published club range on a single rate (min!==max, one rate)
  { n: 'RangeClub', wd: '£150', we: '£195', feeV2: {
      currency: 'GBP', confidence: 'published-rates', seasons: [
        { name: 'all', rates: [
          { day: 'weekday', amount: 150, amountMax: 195 },
          { day: 'weekend', amount: 175, amountMax: 225 } ] } ] } },
  // 8 — every rate is a "from" floor across seasons (Celtic Manor shape)
  { n: 'FromRange', wd: '£82', we: '£107', feeV2: {
      currency: 'GBP', confidence: 'published-rates', seasons: [
        { name: 'shoulder', months: [10,11], rates: [
          { day: 'weekday', amount: 82, isFrom: true },
          { day: 'weekend', amount: 107, isFrom: true } ] },
        { name: 'winter', months: [12], rates: [
          { day: 'weekday', amount: 102, isFrom: true },
          { day: 'weekend', amount: 112, isFrom: true } ] } ] } },
];

/* ---- rule A (no date) --------------------------------------------------- */
let r = feeRangeFor(0, 'wd');
ok('minimal wd = 95 flat', r && r.min === 95 && r.max === 95 && !r.upTo && !r.isFrom, r);
r = feeRangeFor(0, 'we');
ok('minimal we = 120 flat', r && r.min === 120 && r.max === 120, r);

r = feeRangeFor(1, 'wd');
ok('seasonal wd range 95..260', r && r.min === 95 && r.max === 260, r);
ok('seasonal wd is a derived ceiling (upTo)', r && r.upTo === true, r);
r = feeRangeFor(1, 'we');
ok('seasonal we range 95..300 (winter "any" counts)', r && r.min === 95 && r.max === 300, r);

r = feeRangeFor(2, 'we');
ok('from-only we keeps isFrom, not upTo', r && r.min === 420 && r.max === 420 && r.isFrom === true && r.upTo === false, r);

r = feeRangeFor(4, 'wd');
ok('poa -> min/max null, confidence poa', r && r.min == null && r.max == null && r.confidence === 'poa', r);
ok('poa -> feeNumberFor null', feeNumberFor(4, 'wd') == null, feeNumberFor(4, 'wd'));

r = feeRangeFor(5, 'wd');
ok('legacy-only wd = 70', r && r.min === 70 && r.max === 70 && r.confidence == null, r);
r = feeRangeFor(6, 'we');
ok('v1 fee we = 160..200', r && r.min === 160 && r.max === 200 && r.confidence === 'published-range', r);

r = feeRangeFor(7, 'wd');
ok('single published range 150..195, one rate -> not upTo', r && r.min === 150 && r.max === 195 && r.upTo === false, r);

r = feeRangeFor(8, 'wd');
ok('from-range keeps isFrom (min 82), not upTo', r && r.min === 82 && r.isFrom === true && r.upTo === false, r);
ok('from-range label = "from £82"', feeLabelFrom(feeRangeFor(8, 'wd'), '£') === 'from £82', feeLabelFrom(feeRangeFor(8, 'wd'), '£'));
ok('seasonal ceiling label = "Up to £260"', feeLabelFrom(feeRangeFor(1, 'wd'), '£') === 'Up to £260', feeLabelFrom(feeRangeFor(1, 'wd'), '£'));
ok('poa label = "POA"', feeLabelFrom(feeRangeFor(4, 'wd'), '£') === 'POA', feeLabelFrom(feeRangeFor(4, 'wd'), '£'));
ok('flat label = "£95"', feeLabelFrom(feeRangeFor(0, 'wd'), '£') === '£95', feeLabelFrom(feeRangeFor(0, 'wd'), '£'));
ok('published range label = "£150–£195"', feeLabelFrom(feeRangeFor(7, 'wd'), '£') === '£150–£195', feeLabelFrom(feeRangeFor(7, 'wd'), '£'));

/* ---- rule B (specific date) ------------------------------------------ */
// July Saturday -> high season weekend peak = 300
ok('date: Jul Sat -> 300 peak', near(feeNumberForDate(1, '2026-07-04'), 300), feeNumberForDate(1, '2026-07-04'));
// February Wednesday -> winter "any" = 95
ok('date: Feb Wed -> 95', near(feeNumberForDate(1, '2026-02-04'), 95), feeNumberForDate(1, '2026-02-04'));
// October Saturday -> shoulder weekend = 210
ok('date: Oct Sat -> 210', near(feeNumberForDate(1, '2026-10-03'), 210), feeNumberForDate(1, '2026-10-03'));
let d = feeRangeForDate(1, '2026-07-04');
ok('feeRangeForDate Jul Sat used=300', d && d.used === 300 && d.confidence === 'published-rates', d);

/* ---- cart ---------------------------------------------------------------- */
let cart = feeCartFor(3);
ok('feeCartFor mandatory R650/cart', cart && cart.status === 'mandatory' && cart.amount === 650, cart);
ok('feeCartFor null for non-cart course', feeCartFor(0) == null, feeCartFor(0));

/* ---- no regression for a course with neither structured object -------- */
ok('legacy feeNumberForDate weekend midpoint', near(feeNumberForDate(5, '2026-07-04'), 90), feeNumberForDate(5, '2026-07-04'));

console.log((fail ? 'FAIL' : 'ok') + ' — test_fee_v2: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
