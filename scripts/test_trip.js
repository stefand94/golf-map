#!/usr/bin/env node
/**
 * Trip save->load round-trip checks — no browser needed.
 *
 * Loads data/*.js, js/trip-model.js and js/state.js into a vm sandbox the
 * same way scripts/test_data.js does (plain global-scope scripts, `const`/
 * `let` rewritten to `var` so the declarations land on the sandbox object),
 * then asserts that a snapshot written by tripSnapshotActive() survives
 * validateTripEntry() with every field intact.
 *
 * The bug this locks down: validateTripEntry() is a whitelist, so any field
 * tripSnapshotActive() writes but it forgets to copy is silently dropped on
 * every reload. groupSize was exactly that (it reset to 2 each load).
 *
 * Run: node scripts/test_trip.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const files = [
  'data/config.js', 'data/stations.js', 'data/courses-london.js',
  'data/courses-top100.js', 'data/courses-scotland.js', 'data/courses-wales.js',
  'data/courses-ireland.js', 'data/courses-southafrica.js',
  'js/trip-model.js', 'js/state.js',
];

// js/state.js runs loadStoredState() at load; with no localStorage in the
// sandbox that throws inside its own try/catch and returns, which is exactly
// the "brand-new visitor" path. Everything else it touches at top level is
// plain data.
const sandbox = { console, Date, Math, JSON };
vm.createContext(sandbox);
for (const f of files) {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  code = code.replace(/^(const|let) /gm, 'var ');
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error(`FAIL: ${f} does not load — ${e.message}`);
    process.exit(1);
  }
}

const failures = [];
const fail = (m) => failures.push(m);
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

// ---- build a rich live trip through the real globals ----
const courseIds = Object.keys(sandbox.C).map(Number).filter(i => sandbox.C[i]).slice(0, 3);
if (courseIds.length < 3) { console.error('FAIL: need at least 3 courses in C'); process.exit(1); }
const [c0, c1, c2] = courseIds;

sandbox.TRIP.clear();
[c0, c1, c2].forEach(i => sandbox.TRIP.add(i));
sandbox.tripSeq = [c2, c0, c1];
sandbox.tripLastAdded = c1;
sandbox.tbAnchor = c0;
sandbox.tripDayNextId = 3;
sandbox.groupSize = 5;                      // the field the bug dropped
sandbox.tripDays = [
  { id: 1, kind: 'golf', place: 'St Andrews', placeLat: 56.34, placeLng: -2.81,
    date: '2026-05-04', driveIn: 45,
    items: [
      { id: 'a1', type: 'golf', i: c0 },
      { id: 'a2', type: 'hotel', name: 'Rusacks', price: 180, lat: 56.34, lng: -2.8, nights: 2, stayId: 's1' },
      { id: 'a3', type: 'poi', name: 'Castle ruins', price: 12, lat: 56.34, lng: -2.79 },
    ] },
  { id: 2, kind: 'free', place: null, placeLat: null, placeLng: null,
    date: null, driveIn: null,
    items: [{ id: 'b1', type: 'golf', i: c1 }, { id: 'b2', type: 'golf', i: c2 }] },
];

sandbox.activeTripId = 'default';
sandbox.trips = { default: { name: 'Scotland 2026', created: 111, modified: 222 } };
sandbox.tripSnapshotActive();
const snap = sandbox.trips.default;

// ---- round trip ----
const out = sandbox.validateTripEntry(JSON.parse(JSON.stringify(snap)));

eq('name', out.name, snap.name);
eq('created', out.created, snap.created);
eq('trip', out.trip.slice().sort(), snap.trip.slice().sort());
eq('tripSeq', out.tripSeq, snap.tripSeq);
eq('tripLastAdded', out.tripLastAdded, snap.tripLastAdded);
eq('tbAnchor', out.tbAnchor, snap.tbAnchor);
eq('tripDayNextId', out.tripDayNextId, snap.tripDayNextId);
eq('groupSize', out.groupSize, snap.groupSize);

// every day, field by field, including the full item list
if (out.tripDays.length !== snap.tripDays.length) {
  fail(`tripDays length: got ${out.tripDays.length}, expected ${snap.tripDays.length}`);
} else {
  snap.tripDays.forEach((d, n) => {
    const o = out.tripDays[n];
    ['id', 'kind', 'place', 'placeLat', 'placeLng', 'date', 'driveIn'].forEach(k =>
      eq(`day ${n}.${k}`, o[k], d[k]));
    eq(`day ${n}.items`, o.items, d.items);
  });
}

// no snapshot field is silently dropped by the whitelist
Object.keys(snap).forEach(k => {
  if (k === 'modified') return; // stamped fresh on load when absent, by design
  if (!(k in out)) fail(`validateTripEntry() drops the snapshot field "${k}"`);
});

// ---- groupSize validation edges ----
const gs = (v) => sandbox.validateTripEntry({ groupSize: v }).groupSize;
eq('groupSize default (absent)', gs(undefined), 2);
eq('groupSize clamp low', gs(0), 1);
eq('groupSize clamp high', gs(99), 16);
eq('groupSize rounds', gs(3.4), 3);
eq('groupSize rejects NaN', gs(NaN), 2);
eq('groupSize rejects Infinity', gs(Infinity), 2);
eq('groupSize rejects string', gs('4'), 2);

if (failures.length) {
  console.error(`test_trip: ${failures.length} failure(s)\n`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('test_trip: OK — trip snapshot survives validateTripEntry() with every field intact.');
