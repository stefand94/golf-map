#!/usr/bin/env node
/**
 * GOLF-224 / DEC-037 — saved state survives a release, migrates forward,
 * and degrades one piece at a time. No browser needed.
 *
 * Loads data/*.js, js/util.js, js/course-id.js, js/app-version.js, js/trip-model.js,
 * js/state.js (and js/trip-share.js for the share-link check) into a vm
 * sandbox the same way scripts/test_trip.js does, with a fake localStorage
 * in place — so loadStoredState() runs for real, at its own top level, as
 * it does in the browser.
 *
 * What it locks down:
 *  1. A release (a different APP_VERSION) no longer wipes anything — this
 *     is the regression that GOLF-132/DEC-011 deliberately caused and
 *     DEC-037 reversed.
 *  2. Nothing is written to localStorage merely by loading.
 *  3. A pre-GOLF-163 payload (bare course indices) and a pre-GOLF-42
 *     payload (flat trip/tripSeq/tripDays) still load.
 *  4. One unreadable stored section costs that section only: the trips
 *     still load, and nothing reaches console.error.
 *  5. A wholly unreadable payload still leaves a loadable app.
 *  6. An old index-form and a new id-form share link decode identically.
 *  7. GOLF-235's usage flags persist, count once, and stay out of share links.
 *
 * Run: node scripts/test_state_persist.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'data/config.js', 'data/stations.js', 'data/courses-london.js',
  'data/courses-top100.js', 'data/courses-scotland.js', 'data/courses-wales.js',
  'data/courses-ireland.js', 'data/courses-southafrica.js',
  'data/course-ids.js', 'js/util.js', 'js/course-id.js', 'js/app-version.js',
  'js/trip-model.js', 'js/state.js', 'js/trip-share.js',
];
const SRC = {};
for (const f of FILES) SRC[f] = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^(const|let) /gm, 'var ');

const failures = [];
const fail = (m) => failures.push(m);
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

/* A fake localStorage, plus captured console output — a warn is allowed
   (the visitor can do nothing about a corrupt value), an error is not. */
function boot(initial, appVersion) {
  const store = Object.assign({}, initial || {});
  const warns = [], errors = [];
  const sandbox = {
    Date, Math, JSON,
    console: {
      log: () => {},
      warn: (...a) => warns.push(a.map(String).join(' ')),
      error: (...a) => errors.push(a.map(String).join(' ')),
    },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
  vm.createContext(sandbox);
  for (const f of FILES) {
    /* The version the page "shipped with" is overridden between
       app-version.js and state.js — the same order the browser sees. */
    /* A module that throws on the way in is a failure, not a reason to stop:
       loadStoredState() runs at state.js's own top level, so "the app still
       loads" means exactly "this does not throw". Recording it and carrying
       on keeps the rest of the report readable. */
    try { vm.runInContext(SRC[f], sandbox, { filename: f }); }
    catch (e) { fail(`${f} threw while loading (the app would not finish loading): ${e.message}`); }
    if (f === 'js/app-version.js' && appVersion) {
      sandbox.APP_VERSION = appVersion;
      vm.runInContext('APP_VERSION', sandbox);
    }
  }
  return { sandbox, store, warns, errors };
}

/* A sandbox booted on empty storage is the brand-new-visitor path; the
   globals it leaves behind are what a cold load starts from. */
const base = boot({});
const BUILD_A = base.sandbox.APP_VERSION;
const courses = Object.keys(base.sandbox.C).map(Number)
  .filter(i => base.sandbox.C[i] && base.sandbox.courseFollowDupOf(i) === i).slice(0, 3);
if (courses.length < 3) { console.error('FAIL: need 3 non-duplicate courses in C'); process.exit(1); }
const [c0, c1, c2] = courses;

/* ---------- a real saved payload, written by the real saveState() ---------- */
function writeRichTrip(s) {
  s.TRIP.clear(); [c0, c1, c2].forEach(i => s.TRIP.add(i));
  s.tripSeq = [c2, c0, c1];
  s.tripLastAdded = c1;
  s.tbAnchor = c0;
  s.tripDayNextId = 3;
  s.groupSize = 5;
  s.tripCustom = [{ id: 'cc1', label: 'Ferry', amount: 90, per: 'group', cur: 'GBP' }];
  s.tripDays = [
    { id: 1, kind: 'golf', place: 'St Andrews', placeLat: 56.34, placeLng: -2.81,
      date: '2026-05-04', driveIn: 45,
      items: [
        { id: 'a1', type: 'golf', i: c0 },
        { id: 'a2', type: 'hotel', name: 'Rusacks', price: 180, lat: 56.34, lng: -2.8, nights: 2, stayId: 's1' },
        { id: 'a3', type: 'poi', name: 'Castle ruins', price: 12, lat: 56.34, lng: -2.79 },
      ] },
    { id: 2, kind: 'free', place: null, placeLat: null, placeLng: null, date: null, driveIn: null,
      items: [{ id: 'b1', type: 'golf', i: c1 }, { id: 'b2', type: 'golf', i: c2 }] },
  ];
  s.activeTripId = 'mine';
  s.trips = { mine: { name: 'Scotland 2026', created: 111, modified: 222 } };
  s.PLAYED.add(c0); s.WANT.add(c2);
  s.state.nation = 'gb';
  s.state.access.add('public');
  s.state.feeMin = 50; s.state.feeMax = 400;
  s.saveState();
}
writeRichTrip(base.sandbox);
const SAVED = base.store['golfmap:v1'];
if (!SAVED) { console.error('FAIL: saveState() wrote nothing'); process.exit(1); }

/* A returning visitor's stored state. The retired DEC-011 key is included
   deliberately: a real browser that has been here before carries it, and
   including it makes the "same build" load below a genuine returning visit
   rather than a first-ever one — which is what makes the new-release
   comparison that follows meaningful. Nothing reads the key any more. */
const RETURNING = { 'golfmap:v1': SAVED, 'golfmap:deployversion': BUILD_A };

/* What the saved trip looks like when reloaded by the SAME build. */
const same = boot(RETURNING, BUILD_A);
const reloaded = {
  trips: same.sandbox.trips, activeTripId: same.sandbox.activeTripId,
  tripDays: same.sandbox.tripDays, tripSeq: same.sandbox.tripSeq,
  trip: [...same.sandbox.TRIP].sort((a, b) => a - b),
  played: [...same.sandbox.PLAYED], want: [...same.sandbox.WANT],
  groupSize: same.sandbox.groupSize, tripCustom: same.sandbox.tripCustom,
  nation: same.sandbox.state.nation, access: [...same.sandbox.state.access],
  feeMin: same.sandbox.state.feeMin, feeMax: same.sandbox.state.feeMax,
};
eq('same build: trip name', reloaded.trips.mine && reloaded.trips.mine.name, 'Scotland 2026');
eq('same build: active trip', reloaded.activeTripId, 'mine');
eq('same build: days restored', reloaded.tripDays.length, 2);
eq('same build: courses restored', reloaded.trip, [c0, c1, c2].sort((a, b) => a - b));
eq('same build: group size', reloaded.groupSize, 5);
eq('same build: no console error', same.errors, []);

/* ---------- 1. a new release changes nothing ---------- */
const next = boot(RETURNING, 'golfmap-shell-v5-deadbeef99');
if (next.sandbox.APP_VERSION === BUILD_A) fail('the new-release case did not actually change APP_VERSION');
const after = {
  trips: next.sandbox.trips, activeTripId: next.sandbox.activeTripId,
  tripDays: next.sandbox.tripDays, tripSeq: next.sandbox.tripSeq,
  trip: [...next.sandbox.TRIP].sort((a, b) => a - b),
  played: [...next.sandbox.PLAYED], want: [...next.sandbox.WANT],
  groupSize: next.sandbox.groupSize, tripCustom: next.sandbox.tripCustom,
  nation: next.sandbox.state.nation, access: [...next.sandbox.state.access],
  feeMin: next.sandbox.state.feeMin, feeMax: next.sandbox.state.feeMax,
};
eq('new release: whole restored state is identical to the same-build load', after, reloaded);
eq('new release: trip is not empty', after.tripDays.length > 0 && after.trip.length, 3);
eq('new release: shortlist survives', after.want, [c2]);
eq('new release: played survives', after.played, [c0]);
eq('new release: settings survive', [after.nation, after.access, after.feeMin, after.feeMax],
  ['gb', ['public'], 50, 400]);
eq('new release: no console error', next.errors, []);

/* ---------- 2. loading writes nothing ---------- */
eq('load writes no new key to localStorage', Object.keys(next.store).sort(),
  ['golfmap:deployversion', 'golfmap:v1']);
eq('load leaves the stored payload byte-identical', next.store['golfmap:v1'], SAVED);
eq('load does not restamp the retired deploy-version key', next.store['golfmap:deployversion'], BUILD_A);

/* ---------- 3a. pre-GOLF-163: bare indices, current multi-trip shape ---------- */
const preIds = boot({ 'golfmap:v1': JSON.stringify({
  trips: { old: { name: 'Pre-163', trip: [c0, c1], tripSeq: [c1, c0], groupSize: 4,
    tripDays: [{ id: 1, kind: 'golf', items: [{ id: 'x1', type: 'golf', i: c0 },
      { id: 'x2', type: 'hotel', name: 'Old Inn', price: 100 }] },
      { id: 2, kind: 'golf', items: [{ id: 'x3', type: 'golf', i: c1 }] }] } },
  activeTripId: 'old', played: [c1], want: [c0],
}) }, 'golfmap-shell-v5-deadbeef99');
eq('pre-163: trip loaded', [...preIds.sandbox.TRIP].sort((a, b) => a - b), [c0, c1].sort((a, b) => a - b));
eq('pre-163: order kept', preIds.sandbox.tripSeq, [c1, c0]);
eq('pre-163: both days loaded', preIds.sandbox.tripDays.length, 2);
const preItem = (d, n) => ((preIds.sandbox.tripDays[d] || {}).items || [])[n] || {};
eq('pre-163: day 1 golf item resolves to the same course', preItem(0, 0).i, c0);
eq('pre-163: day 1 hotel kept', preItem(0, 1).name, 'Old Inn');
eq('pre-163: day 2 golf item resolves', preItem(1, 0).i, c1);
eq('pre-163: group size', preIds.sandbox.groupSize, 4);
eq('pre-163: played/want', [[...preIds.sandbox.PLAYED], [...preIds.sandbox.WANT]], [[c1], [c0]]);
eq('pre-163: no console error', preIds.errors, []);

/* ---------- 3b. pre-GOLF-42: the flat single-trip shape ---------- */
const preTrips = boot({ 'golfmap:v1': JSON.stringify({
  trip: [c0, c2], tripSeq: [c2, c0],
  tripDays: [{ id: 1, kind: 'golf', courses: [c0] }, { id: 2, kind: 'golf', courses: [c2] }],
}) }, 'golfmap-shell-v5-deadbeef99');
eq('pre-42: wrapped into one trip', Object.keys(preTrips.sandbox.trips), ['default']);
eq('pre-42: active', preTrips.sandbox.activeTripId, 'default');
eq('pre-42: courses', [...preTrips.sandbox.TRIP].sort((a, b) => a - b), [c0, c2].sort((a, b) => a - b));
eq('pre-42: pre-63 day shape migrated to items',
  preTrips.sandbox.tripDays.map(d => (d.items || []).map(it => it.i)), [[c0], [c2]]);
eq('pre-42: no console error', preTrips.errors, []);

/* ---------- 4. one unreadable section costs that section only ---------- */
const good = JSON.parse(SAVED);
const corrupt = Object.assign({}, good, {
  played: 'not-an-array',                 // hand-edited to a string: used to throw
  edits: 'not-an-object',
  filters: { access: 'not-an-array', region: ['surrey'], feeMin: 50, feeMax: 400 },
});
const partly = boot({ 'golfmap:v1': JSON.stringify(corrupt) }, 'golfmap-shell-v5-deadbeef99');
eq('corrupt section: trips still load', partly.sandbox.trips.mine && partly.sandbox.trips.mine.name, 'Scotland 2026');
eq('corrupt section: days still load', partly.sandbox.tripDays.length, 2);
eq('corrupt section: courses still load', [...partly.sandbox.TRIP].sort((a, b) => a - b), [c0, c1, c2].sort((a, b) => a - b));
eq('corrupt section: want list (a good section) survives', [...partly.sandbox.WANT], [c2]);
eq('corrupt section: the bad played list is simply empty', [...partly.sandbox.PLAYED], []);
eq('corrupt section: nothing reached console.error', partly.errors, []);
if (!partly.warns.length) fail('corrupt section: expected a console.warn naming the dropped section');
if (!partly.warns.some(w => /played/.test(w))) fail('corrupt section: the warning should name the played list');
eq('corrupt section: the stored payload is left alone', partly.store['golfmap:v1'], JSON.stringify(corrupt));
/* GOLF-224: an unreadable chip group must not take the rest of the filter
   block with it — one bad list costs that list. */
eq('corrupt filter: the bad chip group is empty', [...partly.sandbox.state.access], []);
eq('corrupt filter: a good chip group beside it survives', [...partly.sandbox.state.region], ['surrey']);
eq('corrupt filter: the fee range beside it survives',
  [partly.sandbox.state.feeMin, partly.sandbox.state.feeMax], [50, 400]);
eq('corrupt filter: the saved nation beside it survives', partly.sandbox.state.nation, 'gb');
eq('corrupt filter: the saved sort beside it survives', partly.sandbox.state.sort, 'name');

/* one trip of two unreadable: the other still loads */
const twoTrips = boot({ 'golfmap:v1': JSON.stringify({
  trips: { mine: good.trips.mine, broken: null }, activeTripId: 'mine',
}) }, 'golfmap-shell-v5-deadbeef99');
eq('one bad trip: the good one loads', Object.keys(twoTrips.sandbox.trips), ['mine']);
eq('one bad trip: its days load', twoTrips.sandbox.tripDays.length, 2);
eq('one bad trip: no console error', twoTrips.errors, []);

/* ---------- 5. a wholly unreadable payload ---------- */
const junk = boot({ 'golfmap:v1': '{not json at all' }, 'golfmap-shell-v5-deadbeef99');
eq('junk payload: app still loads with an empty trip', junk.sandbox.tripDays, []);
eq('junk payload: nothing reached console.error', junk.errors, []);
if (!junk.warns.length) fail('junk payload: expected a console.warn');
eq('junk payload: the unreadable key is reset', junk.store['golfmap:v1'], undefined);
/* the double-stringified shape the old quota-retry bug could leave */
const strPayload = boot({ 'golfmap:v1': JSON.stringify(SAVED) }, 'golfmap-shell-v5-deadbeef99');
eq('string payload: app still loads', strPayload.sandbox.tripDays, []);
eq('string payload: nothing reached console.error', strPayload.errors, []);

/* ---------- 6. share links: old index form and new id form agree ---------- */
const sh = boot({}, BUILD_A);
writeRichTrip(sh.sandbox);
const payload = sh.sandbox.tripBuildSharePayload();
const idHash = '#share=' + encodeURIComponent(JSON.stringify(payload));
/* the pre-GOLF-163 form of the same link: every course reference as a bare index */
const oldPayload = JSON.parse(JSON.stringify(payload));
const toIndex = (ref) => (typeof ref === 'string' ? sh.sandbox.COURSE_INDEX_BY_ID.get(ref) : ref);
oldPayload.seq = oldPayload.seq.map(toIndex);
oldPayload.days.forEach(d => (d.items || []).forEach(it => {
  if (it.type !== 'golf') return;
  if (it.c !== undefined) it.c = toIndex(it.c); else it.i = toIndex(it.i);
}));
const newDec = sh.sandbox.tripDecodeSharePayload(idHash);
const oldDec = sh.sandbox.tripDecodeSharePayload('#share=' + encodeURIComponent(JSON.stringify(oldPayload)));
if (!newDec) fail('share: the id-form link did not decode');
if (!oldDec) fail('share: the index-form link did not decode');
if (newDec && oldDec) {
  eq('share: both forms decode to the same seq', oldDec.seq, newDec.seq);
  eq('share: both forms decode to the same days', oldDec.days, newDec.days);
  eq('share: the shared trip has the courses', newDec.seq.slice().sort((a, b) => a - b), [c0, c1, c2].sort((a, b) => a - b));
}
eq('share: decoding writes nothing to localStorage', Object.keys(sh.store).sort(), ['golfmap:v1']);

/* ---------- 7. GOLF-235: usage flags persist, count once, stay out of share links ---------- */
function withBeacons(b) {
  const sent = [];
  b.sandbox.navigator = { sendBeacon: (url, body) => { sent.push(JSON.parse(body).e); return true; } };
  b.sandbox.ORS_PROXY_URL = 'https://worker.test/';
  return sent;
}
const savedTrip = JSON.parse(SAVED).trips.mine;
eq('usage: a 2-day trip is saved as counted', savedTrip.counted, { trip: 1, share: 0 });
eq('usage: the flag survives a release', next.sandbox.trips.mine.counted, { trip: 1, share: 0 });

const fresh = boot({}, BUILD_A);
const freshSent = withBeacons(fresh);
fresh.sandbox.tripDays = [{ id: 1, kind: 'golf', items: [] }];
fresh.sandbox.saveState();
eq('usage: 1 day sends nothing', freshSent, []);
fresh.sandbox.tripDays.push({ id: 2, kind: 'free', items: [] });
fresh.sandbox.saveState(); fresh.sandbox.saveState();
eq('usage: reaching 2 days sends one trip, once', freshSent, ['trip']);
const freshAgain = boot(Object.assign({}, fresh.store), BUILD_A);
const againSent = withBeacons(freshAgain);
freshAgain.sandbox.saveState();
eq('usage: a reload does not count it again', againSent, []);

const legacy = JSON.parse(SAVED); delete legacy.trips.mine.counted;
const old = boot({ 'golfmap:v1': JSON.stringify(legacy) }, BUILD_A);
const oldSent = withBeacons(old);
old.sandbox.saveState();
eq('usage: a pre-counter 2-day trip is marked, not counted', [old.sandbox.trips.mine.counted, oldSent], [{ trip: 1, share: 0 }, []]);

const shPayload = JSON.stringify(sh.sandbox.tripBuildSharePayload());
delete sh.sandbox.trips.mine.counted;
eq('usage: the share payload does not change with the flags', JSON.stringify(sh.sandbox.tripBuildSharePayload()), shPayload);
if (shPayload.includes('counted')) fail('usage: the flags leaked into the share payload');

const opener = boot({}, BUILD_A);
const openSent = withBeacons(opener);
opener.sandbox.usageShareOpened('#share=abc'); opener.sandbox.usageShareOpened('#share=abc');
opener.sandbox.usageLinkFirstSeen('#share=mine'); opener.sandbox.usageShareOpened('#share=mine');
eq('usage: an open counts once per link, and never for your own link', openSent, ['open']);
const offline = boot({}, BUILD_A);
offline.sandbox.navigator = { sendBeacon: () => { throw new Error('down'); } };
offline.sandbox.ORS_PROXY_URL = 'https://worker.test/';
offline.sandbox.usageShareOpened('#share=x');
eq('usage: a failing beacon logs nothing', [offline.errors, offline.warns], [[], []]);

if (failures.length) {
  console.error(`test_state_persist: ${failures.length} failure(s)\n`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('test_state_persist: OK — trips survive a release, old formats migrate, one bad value costs one value, share links agree, usage counts once.');
