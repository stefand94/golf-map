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
  'js/timeline.js', 'js/trip-model.js', 'js/state.js', 'js/trip-share.js',
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
  b.sandbox.location = { hostname: 'golftripper.uk' }; // GOLF-241: production only
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
/* GOLF-241: local and preview pages never count. */
for (const host of ['127.0.0.1', 'localhost', 'main.golf-map.pages.dev', 'www.golftripper.uk']) {
  const dev = boot({}, BUILD_A);
  const devSent = withBeacons(dev);
  dev.sandbox.location = { hostname: host };
  dev.sandbox.tripDays = [{ id: 1, kind: 'golf', items: [] }, { id: 2, kind: 'free', items: [] }];
  dev.sandbox.saveState();
  dev.sandbox.usageShareOpened('#share=dev');
  eq(`usage: ${host} sends nothing`, devSent, []);
}
const offline = boot({}, BUILD_A);
offline.sandbox.navigator = { sendBeacon: () => { throw new Error('down'); } };
offline.sandbox.ORS_PROXY_URL = 'https://worker.test/';
offline.sandbox.usageShareOpened('#share=x');
eq('usage: a failing beacon logs nothing', [offline.errors, offline.warns], [[], []]);

// ── GOLF-153: detailed-mode times ─────────────────────────────────────
// Three things the brief asks for by name — fields survive a release, an
// old trip loads with no times, and a corrupt time is dropped not fatal —
// plus the one that is easiest to break without noticing: a trip with no
// times must still encode byte-for-byte as it did before detailed mode.
{
  const t = boot({}, BUILD_A);
  writeRichTrip(t.sandbox);
  // Put a fixed time on the golf item, a duration on the POI, and a flight.
  const d0 = t.sandbox.tripDays[0];
  d0.items[0].time = '12:24';
  d0.items[2].durationMins = 45;
  d0.items.unshift({ id: 'a0', type: 'flight', flightNo: 'BA942', fromCode: 'LCY',
                     toCode: 'INV', depart: '09:40', arrive: '10:55',
                     lat: 57.5425, lng: -4.0475, price: 120 });
  t.sandbox.saveState();
  const stored = t.store['golfmap:v1'];

  // ... survives a release.
  const rel = boot({ 'golfmap:v1': stored }, 'golfmap-shell-v5-deadbeef99');
  const it = (n) => ((rel.sandbox.tripDays[0] || {}).items || [])[n] || {};
  eq('GOLF-153: tee time survives a release', it(1).time, '12:24');
  eq('GOLF-153: duration survives a release', it(3).durationMins, 45);
  eq('GOLF-153: flight type survives', it(0).type, 'flight');
  eq('GOLF-153: flight number survives', it(0).flightNo, 'BA942');
  eq('GOLF-153: flight arrival survives', it(0).arrive, '10:55');
  eq('GOLF-153: the arrival airport stays a located stop',
     [it(0).lat, it(0).lng], [57.5425, -4.0475]);
  eq('GOLF-153: the flight is routable, so it gets a drive leg',
     !!rel.sandbox.tripItemPoint(it(0)), true);

  // ... a corrupt time costs the field, not the item.
  const bad = JSON.parse(stored);
  const bd = bad.trips[bad.activeTripId].tripDays[0];
  bd.items[1].time = '99:99';
  bd.items[3].durationMins = 'ages';
  bd.items[0].arrive = { not: 'a time' };
  const cr = boot({ 'golfmap:v1': JSON.stringify(bad) }, 'golfmap-shell-v5-deadbeef99');
  const ci = (n) => ((cr.sandbox.tripDays[0] || {}).items || [])[n] || {};
  eq('GOLF-153: a corrupt time is dropped', ci(1).time, undefined);
  eq('GOLF-153: ...but the item survives', ci(1).type, 'golf');
  eq('GOLF-153: a corrupt duration is dropped', ci(3).durationMins, undefined);
  eq('GOLF-153: ...but that item survives too', ci(3).name, 'Castle ruins');
  eq('GOLF-153: a corrupt arrival is dropped', ci(0).arrive, undefined);
  eq('GOLF-153: ...and the flight is still there', ci(0).flightNo, 'BA942');
  eq('GOLF-153: nothing was logged as an error', cr.errors, []);

  // ... a time is stored canonically, so a re-save is a no-op.
  const loose = JSON.parse(stored);
  loose.trips[loose.activeTripId].tripDays[0].items[1].time = '9:05';
  const canon = boot({ 'golfmap:v1': JSON.stringify(loose) }, BUILD_A);
  eq('GOLF-153: "9:05" is stored as "09:05"',
     ((canon.sandbox.tripDays[0] || {}).items || [])[1].time, '09:05');
}
{
  // An OLD trip — no times anywhere — must load with no times, and a
  // load→save cycle must not change what it holds. This is the
  // regression that would quietly rewrite every trip already in a
  // visitor's browser the first time they opened the new build.
  // `modified` is a wall-clock stamp, and saveState() writes day keys in
  // the whitelist's order rather than the order they happened to be in
  // memory, so compare sorted-key content, not raw bytes.
  const canon = j => {
    const walk = v => Array.isArray(v) ? v.map(walk)
      : (v && typeof v === 'object')
        ? Object.keys(v).sort().reduce((o, k) => (o[k] = k === 'modified' ? 0 : walk(v[k]), o), {})
        : v;
    return JSON.stringify(walk(JSON.parse(j)));
  };
  const o = boot({}, BUILD_A);
  writeRichTrip(o.sandbox);
  const before = o.store['golfmap:v1'];
  eq('GOLF-153: detailed mode added no keys to an untimed trip',
     /"time":|"durationMins":|"bufferMins":|"note":|"flight"|"note"/.test(before), false);

  const re = boot({ 'golfmap:v1': before }, BUILD_A);
  re.sandbox.saveState();
  const after = re.store['golfmap:v1'];
  eq('GOLF-153: a load→save cycle leaves an untimed trip unchanged',
     canon(after), canon(before));
  const items = (re.sandbox.tripDays[0] || {}).items || [];
  eq('GOLF-153: an old trip loads with no times',
     items.filter(x => 'time' in x || 'durationMins' in x).length, 0);

  // ...and a second cycle is byte-for-byte stable, so nothing drifts.
  const re2 = boot({ 'golfmap:v1': after }, BUILD_A);
  re2.sandbox.saveState();
  eq('GOLF-153: a second cycle is byte-identical',
     re2.store['golfmap:v1'].replace(/"modified":\d+/g, '0'),
     after.replace(/"modified":\d+/g, '0'));
}
{
  // Share payload: unchanged for an untimed trip, carries the new fields
  // only when set, and survives the round trip.
  const a = boot({}, BUILD_A);
  writeRichTrip(a.sandbox);
  const plain = JSON.stringify(a.sandbox.tripBuildSharePayload());
  eq('GOLF-153: an untimed share payload gains no keys',
     /"t":|"dm":|"bf":|"nt":|"dt":|"flight"|"note"/.test(plain), false);

  a.sandbox.tripDays[0].items[0].time = '12:24';
  a.sandbox.tripDays[0].items[0].durationMins = 240;
  const timed = a.sandbox.tripBuildSharePayload();
  const decoded = a.sandbox.tripDecodeSharePayload(
    '#share=' + encodeURIComponent(JSON.stringify(timed)));
  const di = decoded.days[0].items[0];
  eq('GOLF-153: share round-trips the tee time', di.time, '12:24');
  eq('GOLF-153: share round-trips the duration', di.durationMins, 240);

  // A hostile time off the URL is dropped, not fatal.
  const nasty = JSON.parse(JSON.stringify(timed));
  nasty.days[0].items[0].t = '<script>';
  nasty.days[0].items[0].dm = 1e9;
  const safe = a.sandbox.tripDecodeSharePayload(
    '#share=' + encodeURIComponent(JSON.stringify(nasty)));
  eq('GOLF-153: a hostile share time is dropped', safe.days[0].items[0].time, undefined);
  eq('GOLF-153: an absurd share duration is clamped',
     safe.days[0].items[0].durationMins, 1440);
}

{
  /* DEC-039 as revised 2026-10-05: an editable arrival buffer on the two
     types that have one, and notes attached to an item, to a day, and to
     a gap. All optional, all dropped rather than fatal when corrupt. */
  const t = boot({}, BUILD_A);
  writeRichTrip(t.sandbox);
  const d0 = t.sandbox.tripDays[0];
  d0.items[0].time = '10:00';
  d0.items[0].bufferMins = 30;
  d0.items[0].note = '  ask about buggy hire  ';
  d0.items[2].bufferMins = 90;   // a POI has nothing to be early for
  d0.note = 'pack for rain';
  d0.items.push({ id: 'n1', type: 'note', text: 'book the Mull ferry' });
  d0.items.push({ id: 'n2', type: 'note', text: '   ' }); // empty: not an item
  t.sandbox.saveState();
  const stored = t.store['golfmap:v1'];

  const rl = boot({ 'golfmap:v1': stored }, 'golfmap-shell-v5-deadbeef99');
  const day = rl.sandbox.tripDays[0] || {};
  const items = day.items || [];
  const note = items.find(x => x.type === 'note') || {};
  eq('GOLF-153: a golf arrival buffer survives a release', items[0].bufferMins, 30);
  eq('GOLF-153: an item note survives, trimmed', items[0].note, 'ask about buggy hire');
  eq('GOLF-153: a POI gets no buffer', items[2].bufferMins, undefined);
  eq('GOLF-153: a day note survives a release', day.note, 'pack for rain');
  eq('GOLF-153: a gap note survives as an item of its own', note.text, 'book the Mull ferry');
  eq('GOLF-153: an empty gap note is not an item',
     items.filter(x => x.type === 'note').length, 1);
  eq('GOLF-153: a note is not a routing stop', rl.sandbox.tripItemPoint(note), null);

  // Corrupt values cost the value, never the item (GOLF-224).
  const bad = JSON.parse(stored);
  const bd = bad.trips[bad.activeTripId].tripDays[0];
  bd.items[0].bufferMins = 'early';
  bd.items[0].note = { not: 'a string' };
  bd.note = 42;
  bd.items[3].text = '';
  const cr = boot({ 'golfmap:v1': JSON.stringify(bad) }, BUILD_A);
  const cd = cr.sandbox.tripDays[0] || {};
  const ci = cd.items || [];
  eq('GOLF-153: a corrupt buffer is dropped', ci[0].bufferMins, undefined);
  eq('GOLF-153: a corrupt note is dropped', ci[0].note, undefined);
  eq('GOLF-153: ...but the round survives both', ci[0].type, 'golf');
  eq('GOLF-153: a corrupt day note is dropped', cd.note, undefined);
  eq('GOLF-153: an emptied gap note drops the whole item',
     ci.filter(x => x.type === 'note').length, 0);
  eq('GOLF-153: nothing was logged as an error', cr.errors, []);

  // The cap is enforced on the way in, because a note travels in a URL.
  const long = JSON.parse(stored);
  const ld = long.trips[long.activeTripId].tripDays[0];
  ld.items[0].note = 'x'.repeat(900);
  ld.note = 'y'.repeat(900);
  const lr = boot({ 'golfmap:v1': JSON.stringify(long) }, BUILD_A);
  eq('GOLF-153: an over-long item note is capped at 500',
     (lr.sandbox.tripDays[0].items[0].note || '').length, 500);
  eq('GOLF-153: so is an over-long day note',
     (lr.sandbox.tripDays[0].note || '').length, 500);

  // Share: the new fields ride along only when set, and round-trip.
  const payload = rl.sandbox.tripBuildSharePayload();
  const dec = rl.sandbox.tripDecodeSharePayload(
    '#share=' + encodeURIComponent(JSON.stringify(payload)));
  const dd = dec.days[0];
  const dnote = dd.items.find(x => x.type === 'note') || {};
  eq('GOLF-153: share round-trips the buffer', dd.items[0].bufferMins, 30);
  eq('GOLF-153: share round-trips an item note', dd.items[0].note, 'ask about buggy hire');
  eq('GOLF-153: share round-trips the day note', dd.note, 'pack for rain');
  eq('GOLF-153: share round-trips a gap note', dnote.text, 'book the Mull ferry');

  // Hostile input off the hash: clamped and kept verbatim for esc() to
  // handle at render time — never unescaped here, never re-interpreted.
  const nasty = JSON.parse(JSON.stringify(payload));
  nasty.days[0].items[0].bf = 1e9;
  nasty.days[0].items[0].nt = '<img src=x onerror=alert(1)>';
  nasty.days[0].nt = 'z'.repeat(2000);
  const safe = rl.sandbox.tripDecodeSharePayload(
    '#share=' + encodeURIComponent(JSON.stringify(nasty)));
  eq('GOLF-153: an absurd share buffer is clamped',
     safe.days[0].items[0].bufferMins, 1440);
  eq('GOLF-153: a hostile note is carried verbatim, for esc() to render',
     safe.days[0].items[0].note, '<img src=x onerror=alert(1)>');
  eq('GOLF-153: an over-long shared day note is capped',
     (safe.days[0].note || '').length, 500);
}

if (failures.length) {
  console.error(`test_state_persist: ${failures.length} failure(s)\n`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('test_state_persist: OK — trips survive a release, old formats migrate, one bad value costs one value, share links agree, usage counts once, and only in production.');
