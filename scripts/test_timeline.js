#!/usr/bin/env node
/* GOLF-153: the computed-time engine (js/timeline.js).
 *
 * The engine is the part of detailed mode that can be wrong silently —
 * a block an hour off still looks like a tidy calendar. So it is tested
 * on its own, with drive times handed in as fixed numbers rather than
 * taken from the routing cache.
 *
 * The centrepiece is the owner's own worked example from the GOLF-153
 * backlog row, built end to end. If that stops computing, detailed mode
 * is wrong no matter what the screen looks like. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/timeline.js'), 'utf8'), ctx);
const run = expr => vm.runInContext(expr, ctx);

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return;
  failures++;
  console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`);
}
function ok(name, cond, detail) {
  if (cond) return;
  failures++;
  console.log(`  FAIL ${name}${detail ? '\n       ' + detail : ''}`);
}

/* Drive legs are handed in, so the arithmetic is the only thing on
 * trial. Keyed by the pair of item ids. */
const drives = {};
ctx.driveFn = (a, b) => drives[a.id + '>' + b.id] || 0;
const compute = (items, opts) => {
  ctx.__items = items;
  ctx.__opts = opts || null;
  return run('tlComputeDay(__items, driveFn, __opts)');
};
/* The way the app itself computes a day: the inbound flight is derived
 * from the whole trip, never passed in by hand. `days` is the trip;
 * `idx` is the day to compute. */
const computeTrip = (days, idx) => {
  ctx.__days = days;
  const id = run('tlInboundFlightId(__days)');
  return compute(days[idx || 0].items, { inboundFlightId: id });
};
const inboundOf = days => { ctx.__days = days; return run('tlInboundFlightId(__days)'); };
const at = mins => run(`tlFormatTime(${mins})`);

// ── 1. Time parsing ───────────────────────────────────────────────────
check('parse 09:40', run('tlParseTime("09:40")'), 9 * 60 + 40);
check('parse 9:40 (no leading zero)', run('tlParseTime("9:40")'), 9 * 60 + 40);
check('parse 00:00', run('tlParseTime("00:00")'), 0);
check('parse 23:59', run('tlParseTime("23:59")'), 23 * 60 + 59);
check('reject 24:00', run('tlParseTime("24:00")'), null);
check('reject 12:60', run('tlParseTime("12:60")'), null);
check('reject junk', run('tlParseTime("lunchtime")'), null);
check('reject number', run('tlParseTime(940)'), null);
check('reject empty', run('tlParseTime("")'), null);
check('format 755', run('tlFormatTime(755)'), '12:35');
check('format past midnight counts up', run('tlFormatTime(25 * 60)'), '25:00');

// ── 2. Defaults (DEC-039) ─────────────────────────────────────────────
check('golf default 5h', run('tlDurationFor({type:"golf"})'), 300);
check('poi default 90', run('tlDurationFor({type:"poi"})'), 90);
check('hotel is a marker', run('tlDurationFor({type:"hotel"})'), 0);
check('flight is a marker', run('tlDurationFor({type:"flight"})'), 0);
check('explicit duration wins', run('tlDurationFor({type:"golf",durationMins:200})'), 200);
check('duration clamped to a day', run('tlDurationFor({type:"golf",durationMins:99999})'), 1440);
check('negative duration ignored', run('tlDurationFor({type:"golf",durationMins:-30})'), 300);
check('junk duration ignored', run('tlDurationFor({type:"golf",durationMins:"long"})'), 300);

// Arrival buffers (DEC-039 as revised 2026-10-05).
check('golf buffer default 45', run('tlBufferFor({type:"golf"})'), 45);
check('flight buffer default 120', run('tlBufferFor({type:"flight"})'), 120);
check('a hotel has nothing to be early for', run('tlBufferFor({type:"hotel"})'), 0);
check('nor does a POI', run('tlBufferFor({type:"poi"})'), 0);
check('nor does a note', run('tlBufferFor({type:"note"})'), 0);
check('explicit buffer wins', run('tlBufferFor({type:"golf",bufferMins:20})'), 20);
check('zero buffer is a real answer, not a default',
      run('tlBufferFor({type:"golf",bufferMins:0})'), 0);
check('buffer clamped to a day', run('tlBufferFor({type:"flight",bufferMins:99999})'), 1440);
check('negative buffer ignored', run('tlBufferFor({type:"golf",bufferMins:-10})'), 45);
check('junk buffer ignored', run('tlBufferFor({type:"golf",bufferMins:"early"})'), 45);

// ── 3. THE OWNER'S WORKED EXAMPLE (GOLF-153 backlog row) ──────────────
// "Depart 9:40 LCY (BA942) → arrive Inverness 10:55 → 5 min drive →
//  12:24 tee off Cabot Highlands (£350) → drive to Dufftown →
//  stay Dufftown Inn"
{
  drives['fl>golf'] = 5;    // Inverness airport → Cabot Highlands
  drives['golf>hotel'] = 55; // Cabot Highlands → Dufftown (not in the chain)
  /* Computed as the app does it, through the derived inbound rule —
   * this flight is the first thing in the trip that is in the chain,
   * so it is the one that brings you, and it is arrival-only. */
  const rows = computeTrip([{ items: [
    { id: 'fl', type: 'flight', flightNo: 'BA942', fromCode: 'LCY', toCode: 'INV',
      depart: '09:40', arrive: '10:55', lat: 57.5425, lng: -4.0475 },
    { id: 'golf', type: 'golf', i: 0, time: '12:24' },
    { id: 'hotel', type: 'hotel', name: 'Dufftown Inn', nights: 1, stayId: 's1' }
  ] }]);

  check('example: three rows', rows.length, 3);
  check('example: flight anchored on ARRIVAL 10:55', at(rows[0].startMins), '10:55');
  check('example: flight draws no block', rows[0].durationMins, 0);
  ok('example: flight is a marker', rows[0].marker === true);
  check('example: 5 min drive runs into the tee', rows[1].driveMins, 5);
  check('example: tee time honoured at 12:24', at(rows[1].startMins), '12:24');
  ok('example: tee time is the visitor\'s, not derived', rows[1].fixed === true);
  check('example: round ends 17:24 (5h)', at(rows[1].endMins), '17:24');
  check('example: be at the course by 11:39 (45 min before)',
        at(rows[1].readyMins), '11:39');
  check('example: the buffer rides on the row', rows[1].bufferMins, 45);
  ok('example: no conflict — lands 11:00, due 11:39', rows[1].conflict === null,
     'the drive lands at 11:00, so there is 39 min spare on the buffer');
  // The hotel is a strip, outside the chain: check-in marker, pushes nothing.
  check('example: hotel check-in defaults to 15:00', at(rows[2].startMins), '15:00');
  check('example: hotel consumes no time', rows[2].durationMins, 0);
  ok('example: hotel is a marker', rows[2].marker === true);
}

// ── 4. A fixed time pushes everything after it ────────────────────────
{
  drives['a>b'] = 30;
  const early = compute([
    { id: 'a', type: 'golf', i: 0, time: '08:00' },
    { id: 'b', type: 'poi', name: 'Distillery' }
  ]);
  check('round 08:00 → ends 13:00', at(early[0].endMins), '13:00');
  check('POI flows: +30 min drive → 13:30', at(early[1].startMins), '13:30');
  check('POI ends 15:00 (90 min)', at(early[1].endMins), '15:00');

  // Move the tee time two hours later; everything after must move with it.
  const later = compute([
    { id: 'a', type: 'golf', i: 0, time: '10:00' },
    { id: 'b', type: 'poi', name: 'Distillery' }
  ]);
  check('tee +2h pushes the POI to 15:30', at(later[1].startMins), '15:30');
  ok('the pushed item is still derived, not fixed', later[1].fixed === false);
  check('a derived start has no buffer to be early for', later[1].bufferMins, 0);
  check('so being "ready" for it is simply starting it',
        later[1].readyMins, later[1].startMins);
}

// ── 5. Conflicts: warn, never silently move ───────────────────────────
{
  drives['g1>g2'] = 60;
  const rows = compute([
    { id: 'g1', type: 'golf', i: 0, time: '09:00' },   // ends 14:00
    { id: 'g2', type: 'golf', i: 1, time: '12:24' }    // + 60 min drive = 15:00
  ]);
  ok('a missed fixed time is flagged', rows[1].conflict !== null);
  check('conflict reports the real arrival', at(rows[1].conflict.arriveMins), '15:00');
  check('conflict reports the fixed time', at(rows[1].conflict.fixedMins), '12:24');
  check('conflict reports what it was due by', at(rows[1].conflict.dueMins), '11:39');
  check('THE FIXED TIME IS NOT MOVED', at(rows[1].startMins), '12:24');
  ok('it is still marked fixed', rows[1].fixed === true);
}
{
  /* DEC-039, the point of the buffer: the drive has to land by the
     BUFFER, not by the tee time. Landing at 14:00 for a 14:30 tee is
     half an hour early and still late — you were due at 13:45. */
  drives['g1>g2'] = 60;
  const items = [
    { id: 'g1', type: 'golf', i: 0, time: '09:00', durationMins: 240 }, // ends 13:00
    { id: 'g2', type: 'golf', i: 1, time: '14:30' }                     // +60 = 14:00
  ];
  const rows = compute(items);
  ok('landing after the buffer is a conflict, even before the tee time',
     rows[1].conflict !== null, 'due 13:45, lands 14:00');
  check('and it says when you were due', at(rows[1].conflict.dueMins), '13:45');

  // Exactly on the buffer is not a conflict.
  items[1].time = '14:45';
  const onTime = compute(items);
  ok('arriving exactly on the buffer is no conflict', onTime[1].conflict === null);
  check('"arrive by" is the tee minus the buffer', at(onTime[1].readyMins), '14:00');

  // A visitor who edits the buffer away gets the old tee-time deadline.
  items[1].time = '14:00';
  items[1].bufferMins = 0;
  const noBuf = compute(items);
  ok('a zero buffer means the tee time itself is the deadline',
     noBuf[1].conflict === null);
  check('and nothing is drawn in front of the block', noBuf[1].bufferMins, 0);
}

// ── 6. The first item can never be "late" ─────────────────────────────
{
  const rows = compute([{ id: 'g', type: 'golf', i: 0, time: '06:30' }]);
  check('a 06:30 first tee is simply 06:30', at(rows[0].startMins), '06:30');
  ok('nothing precedes it, so no conflict', rows[0].conflict === null);
  check('no drive into the first item', rows[0].driveMins, 0);
}

// ── 7. A day with no fixed times at all still has a clock ─────────────
{
  drives['g>p'] = 20;
  const rows = compute([
    { id: 'g', type: 'golf', i: 0 },
    { id: 'p', type: 'poi', name: 'Castle' }
  ]);
  check('day anchors at 09:00', at(rows[0].startMins), '09:00');
  check('then flows: 14:00 + 20 min drive', at(rows[1].startMins), '14:20');
  ok('neither time is fixed', rows[0].fixed === false && rows[1].fixed === false);
}

// ── 8. A hotel never pushes the next item ─────────────────────────────
{
  drives['g>p'] = 10;
  const withHotel = compute([
    { id: 'g', type: 'golf', i: 0, time: '09:00' },
    { id: 'h', type: 'hotel', name: 'Inn', nights: 1 },
    { id: 'p', type: 'poi', name: 'Castle' }
  ]);
  const without = compute([
    { id: 'g', type: 'golf', i: 0, time: '09:00' },
    { id: 'p', type: 'poi', name: 'Castle' }
  ]);
  check('the POI lands identically with a hotel in between',
        at(withHotel[2].startMins), at(without[1].startMins));
  check('hotel does not absorb the drive', withHotel[2].driveMins, 10);
}
{
  // An explicit check-in is honoured, and still pushes nothing.
  const rows = compute([
    { id: 'h', type: 'hotel', name: 'Inn', nights: 1, time: '18:30' },
    { id: 'p', type: 'poi', name: 'Bar' }
  ]);
  check('typed check-in honoured', at(rows[0].startMins), '18:30');
  check('the POI still starts the day at 09:00', at(rows[1].startMins), '09:00');
}

// ── 9. Flights (DEC-039 as revised 2026-10-05) ────────────────────────
/* The inbound flight is arrival-only; every other flight is planned in
 * full. Which one is inbound is DERIVED — no flag, no stored field —
 * from the first item in the trip that is in the chain. */
{
  // The BA's three cases for the derivation, each one a whole trip.
  const flight = { id: 'f1', type: 'flight', toCode: 'INV', depart: '09:40', arrive: '10:55' };
  check('inbound: Day 1 is the flight alone',
        inboundOf([{ items: [flight] }, { items: [{ id: 'g', type: 'golf', i: 0 }] }]), 'f1');
  check('inbound: a hotel before the flight does not count',
        inboundOf([{ items: [
          { id: 'h', type: 'hotel', name: 'Airport Inn' },
          flight] }]), 'f1',
        'a hotel is outside the chain, so the flight is still first');
  check('inbound: the only flight in the trip, after a round, is NOT inbound',
        inboundOf([{ items: [{ id: 'g', type: 'golf', i: 0 }, flight] }]), null,
        'you drove to that one, so it is planned in full');
  check('inbound: a trip with no flight at all',
        inboundOf([{ items: [{ id: 'g', type: 'golf', i: 0 }] }]), null);
  check('inbound: an empty trip', inboundOf([]), null);
}
{
  /* The inbound flight: a marker at its landing, no block, no buffer.
     A cross-zone flight is exactly why it is not drawn depart→arrive. */
  const rows = computeTrip([{ items: [
    { id: 'f', type: 'flight', flightNo: 'BA6392', fromCode: 'LHR', toCode: 'CPT',
      depart: '22:10', arrive: '11:35' } // crosses a night AND two time zones
  ] }]);
  check('inbound flight anchored on arrival', at(rows[0].startMins), '11:35');
  check('inbound flight draws no block', rows[0].durationMins, 0);
  check('inbound flight draws no check-in buffer', rows[0].bufferMins, 0);
  ok('so a cross-zone flight can never draw backwards', rows[0].endMins >= rows[0].startMins,
     'depart 22:10 > arrive 11:35 would be negative if we drew depart→arrive');
}
{
  /* A flight you fly OUT on: drive → check-in → the flight itself →
     the arrival. The round ends at 13:00, the drive to the airport is
     20 minutes, and check-in is two hours before a 16:00 departure, so
     you have to be there by 14:00 — which you make with an hour spare. */
  drives['g>f'] = 20;
  const rows = computeTrip([{ items: [
    { id: 'g', type: 'golf', i: 0, time: '08:00' },          // ends 13:00
    { id: 'f', type: 'flight', fromCode: 'INV', toCode: 'LCY',
      depart: '16:00', arrive: '17:30' }
  ] }]);
  check('a departure flight is anchored on its DEPARTURE', at(rows[1].startMins), '16:00');
  check('and runs to its arrival', at(rows[1].endMins), '17:30');
  check('so it is a block, not a marker', rows[1].durationMins, 90);
  ok('and not a marker', rows[1].marker === false);
  check('check-in is 120 minutes by default', rows[1].bufferMins, 120);
  check('so you have to be at the airport by 14:00', at(rows[1].readyMins), '14:00');
  check('the drive to the airport runs into it', rows[1].driveMins, 20);
  ok('and 13:20 beats a 14:00 check-in', rows[1].conflict === null);
}
{
  // Miss the check-in and it is a conflict, said against the check-in
  // time and not against the departure.
  drives['g>f'] = 90;
  const rows = computeTrip([{ items: [
    { id: 'g', type: 'golf', i: 0, time: '09:00' },          // ends 14:00
    { id: 'f', type: 'flight', toCode: 'LCY', depart: '16:00', arrive: '17:30' }
  ] }]);
  ok('arriving after check-in is a conflict', rows[1].conflict !== null);
  check('due at the check-in time', at(rows[1].conflict.dueMins), '14:00');
  check('arriving at 15:30', at(rows[1].conflict.arriveMins), '15:30');
}
{
  // The check-in buffer is editable, like the golf one.
  drives['g>f'] = 20;
  const rows = computeTrip([{ items: [
    { id: 'g', type: 'golf', i: 0, time: '08:00' },
    { id: 'f', type: 'flight', toCode: 'LCY', depart: '16:00', arrive: '17:30', bufferMins: 45 }
  ] }]);
  check('an edited check-in buffer is honoured', rows[1].bufferMins, 45);
  check('so you are due at 15:15', at(rows[1].readyMins), '15:15');
}
{
  // A departure flight missing one of its two times has no honest
  // length, so it stays a marker rather than drawing a guess.
  const rows = computeTrip([{ items: [
    { id: 'g', type: 'golf', i: 0, time: '08:00' },
    { id: 'f', type: 'flight', toCode: 'LCY', depart: '16:00' }
  ] }]);
  check('a one-time flight draws no block', rows[1].durationMins, 0);
  check('but is still anchored on its departure', at(rows[1].startMins), '16:00');
}
{
  // A flight with an unparseable arrival falls back into the flow rather
  // than poisoning every time after it.
  const rows = compute([
    { id: 'f', type: 'flight', arrive: 'tea time' },
    { id: 'g', type: 'golf', i: 0 }
  ]);
  ok('junk arrival is not fixed', rows[0].fixed === false);
  ok('and the day still computes', Number.isFinite(rows[1].startMins));
}

// ── 10. Grid range covers only the hours in use ───────────────────────
{
  drives['g>p'] = 30;
  const rows = compute([
    { id: 'g', type: 'golf', i: 0, time: '09:00' },
    { id: 'p', type: 'poi', name: 'Castle' }
  ]);
  const range = run('tlDayRange(' + JSON.stringify(rows) + ')');
  check('grid starts at 08:00 — the 08:15 arrival buffer is drawn too',
        range.startHour, 8);
  check('grid ends at 16:00 (15:50 rounded out)', range.endHour, 16);
}
check('empty day has no range', run('tlDayRange([])'), null);
check('null is survivable', run('tlDayRange(null)'), null);

// ── 11. The three hand-typed kinds (DEC-039, owner review) ───────────
/* A train, a drive-from and an activity. The {type:'note'} gap item that
 * used to be tested here is gone — a note is a field on a block now — and
 * this is pre-release, so there is nothing to migrate. */
{
  drives['a>p'] = 10;
  const rows = compute([
    { id: 'a', type: 'activity', name: 'Boat trip', time: '10:00' },
    { id: 'p', type: 'poi', name: 'Castle' }
  ]);
  check('an activity is an hour by default', rows[0].durationMins, 60);
  check('it starts when it says it does', at(rows[0].startMins), '10:00');
  check('and what follows it follows it', at(rows[1].startMins), '11:10',
        '11:00 plus the 10-minute drive');
  ok('an activity is not a marker', rows[0].marker === false);
}
{
  const rows = compute([
    { id: 't', type: 'train', name: 'Penzance', fromName: 'London Paddington',
      depart: '09:06', arrive: '14:12' },
    { id: 'g', type: 'golf', i: 0 }
  ]);
  check('a train is anchored on its departure', at(rows[0].startMins), '09:06');
  ok('and that counts as a time the visitor set', rows[0].fixed === true);
  check('its length is the gap between its own two times', rows[0].durationMins, 306);
  check('so the round starts when it pulls in', at(rows[1].startMins), '14:12');
  check('a train with one time is a marker', 
        compute([{ id: 't', type: 'train', name: 'Truro', depart: '09:06' }])[0].durationMins, 0);
  check('and a train that arrives before it leaves, too',
        compute([{ id: 't', type: 'train', name: 'Truro', depart: '14:00', arrive: '09:06' }])[0].durationMins, 0);
  /* The reason a train is never routed and never fuelled is that it has
   * no coordinates to route BETWEEN — not a type check in trip-route.js.
   * Section 13 below proves the routing half of that; this is the half
   * the engine is responsible for. */
  ok('a train carries no location to route from',
     !('lat' in rows[0].item) && !('lng' in rows[0].item));
}
{
  drives['s>g'] = 35;
  const rows = compute([
    { id: 's', type: 'drivefrom', name: 'Truro', time: '08:00', lat: 50.26, lng: -5.05 },
    { id: 'g', type: 'golf', i: 0 }
  ]);
  check('a drive-from takes no time of its own', rows[0].durationMins, 0);
  ok('it is a marker', rows[0].marker === true);
  check('it is where you set off from', at(rows[0].startMins), '08:00');
  check('and the drive out of it is timed', at(rows[1].startMins), '08:35');
}

// ── 11b. The drive in from last night's hotel ─────────────────────────
/* DEC-039's owner review: last night's hotel is the first point of the
 * day's chain, so the morning drive from it is drawn and timed. The
 * number is handed in (the app takes it from tripDayLegs(), which already
 * measures it for the list view) and it never produces a conflict —
 * nothing fixed precedes it, so there is no departure it could be late
 * against. */
{
  const items = [{ id: 'g', type: 'golf', i: 0, time: '10:00' }];
  const plain = compute(items);
  check('without it the first block has no drive', plain[0].driveMins, 0);
  const withDrive = compute(items, { inboundDriveMins: 40 });
  check('with it, the drive is on the first block', withDrive[0].driveMins, 40);
  check('and the tee time is untouched', at(withDrive[0].startMins), '10:00');
  ok('a drive in from a hotel is never a conflict', withDrive[0].conflict === null,
     'there is no fixed departure from a hotel to be late from');
  check('a nonsense value is ignored',
        compute(items, { inboundDriveMins: 'soon' })[0].driveMins, 0);
  check('and a negative one', compute(items, { inboundDriveMins: -30 })[0].driveMins, 0);
  drives['g>p'] = 12;
  check('it only ever applies to the FIRST block',
        compute([{ id: 'g', type: 'golf', i: 0, time: '10:00' },
                 { id: 'p', type: 'poi', name: 'Castle' }],
                { inboundDriveMins: 40 })[1].driveMins, 12,
        'the second block gets its own leg, not the one in from the hotel');
}

// ── 11c. The drag snap ────────────────────────────────────────────────
/* Five minutes (DEC-039, owner review). The snapping itself is in
 * js/timeline-ui.js, which needs a DOM; the constant it snaps to is
 * here, and a change to it is the kind that would go unnoticed. */
check('blocks snap to five minutes', run('TL_SNAP_MINS'), 5);

// ── 12. Degenerate input never throws ─────────────────────────────────
check('no items', compute([]).length, 0);
check('null items', run('tlComputeDay(null, driveFn).length'), 0);
ok('a null item in the list does not throw',
   (() => { try { compute([null, { id: 'g', type: 'golf', i: 0 }]); return true; }
            catch (e) { return false; } })());
ok('a missing driveFn is survivable',
   (() => { try { run('tlComputeDay([{id:"a",type:"golf"},{id:"b",type:"poi"}], null)'); return true; }
            catch (e) { return false; } })());

// ── 13. A flight is two points, and the pair between them is FLOWN ────
/* The engine above knows nothing about routing. This section loads the
 * real js/trip-route.js beside it, with the handful of globals it needs
 * stubbed, and asserts the three things a flown leg must never do:
 * reach ORS, enter the fuel total, or be drawn on the map. */
{
  const rs = { console, Date, Math, JSON,
    // trip-route.js touches these at load time only.
    map: { on() {}, off() {} }, L: {}, document: { addEventListener() {} },
    // The bits of the model it reads.
    C: [{ lat: 57.47, lng: -4.45, n: 'Castle Stuart' }],
    tripDayItems: d => (d && d.items) || [],
    tripItemName: it => (it && (it.name || 'Course')) || '',
    tripItemPoint: it => {
      if (!it) return null;
      if (it.type === 'golf') return { lat: 57.47, lng: -4.45 };
      return (typeof it.lat === 'number' && typeof it.lng === 'number')
        ? { lat: it.lat, lng: it.lng } : null;
    },
    tripSeq: [], tripUnscheduled: () => [],
    haversineMiles: (a, b, c, d) => Math.abs(a - c) * 69 + Math.abs(b - d) * 40,
    DRIVE_INEFFICIENCY: 1.2, DRIVE_AVG_MPH: 45,
    // ORS is "configured", so a leg that is allowed to consult it will.
    ORS_PROXY_URL: 'https://example.invalid',
    orsLegKey: (a, b) => `${a.lat},${a.lng}>${b.lat},${b.lng}`,
    orsCacheLoad: () => ({}),
  };
  let orsAsked = [];
  rs.orsEnsureLeg = (key) => { orsAsked.push(key); };
  vm.createContext(rs);
  for (const f of ['js/timeline.js', 'js/trip-route.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8')
      .replace(/^(const|let) /gm, 'var '), rs, { filename: f });
  }

  // Day 1: land at Inverness (inbound). Day 2: play, then fly home from
  // Inverness to London City.
  rs.tripDays = [
    { id: 1, items: [
      { id: 'in', type: 'flight', name: 'Inverness (INV)', toCode: 'INV',
        arrive: '10:55', lat: 57.5425, lng: -4.0475,
        fromCode: 'LCY', fromLat: 51.5053, fromLng: 0.0553 } ] },
    { id: 2, items: [
      { id: 'g', type: 'golf', i: 0, time: '09:00' },
      { id: 'out', type: 'flight', name: 'London City (LCY)', toCode: 'LCY',
        depart: '16:00', arrive: '17:30', lat: 51.5053, lng: 0.0553,
        fromCode: 'INV', fromLat: 57.5425, fromLng: -4.0475 } ] },
  ];

  const d1 = rs.tripDayStops(0), d2 = rs.tripDayStops(1);
  check('the inbound flight stays ONE point', d1.length, 1);
  check('and that point is where it lands', [d1[0].lat, d1[0].lng], [57.5425, -4.0475]);
  ok('the inbound flight is not flown-marked', !d1[0].flown,
     'nothing precedes it, so there is no leg into it to exempt');

  check('a flight you fly out on is TWO points', d2.length, 3);  // golf + depart + arrive
  check('the first is the departure airport', [d2[1].lat, d2[1].lng], [57.5425, -4.0475]);
  check('and it is the depart part', d2[1].legPart, 'depart');
  check('the second is where it lands', [d2[2].lat, d2[2].lng], [51.5053, 0.0553]);
  check('and it is the arrive part', d2[2].legPart, 'arrive');
  ok('only the arrival is marked flown', d2[2].flown === true && !d2[1].flown,
     'the leg INTO the arrival is the one that was flown');

  // The drive to the airport is a real road leg and does consult ORS.
  orsAsked = [];
  const road = rs.tripLegEstimate(d2[0], d2[1]);
  ok('the drive to the airport is still a road leg', road.miles > 0);
  ok('and it does ask ORS', orsAsked.length === 1);

  // The flown pair is not.
  orsAsked = [];
  const air = rs.tripLegEstimate(d2[1], d2[2]);
  check('a flown leg is zero minutes', air.minutes, 0);
  check('a flown leg is zero miles', air.miles, 0);
  ok('a flown leg is marked as flown', air.flown === true);
  check('a flown leg NEVER reaches ORS', orsAsked, []);

  // ...and so it is not in the fuel total either. The whole trip's
  // mileage must equal the road legs alone.
  rs.tripStopChainInvalidate();
  const total = rs.tripTotalDriveMiles();
  const chain = rs.tripStopChain();
  let roadOnly = 0;
  for (let k = 1; k < chain.length; k++) {
    if (chain[k].flown) continue;
    roadOnly += rs.tripLegEstimate(chain[k - 1], chain[k]).miles;
  }
  ok('the flown leg is not in the fuel total', Math.abs(total - roadOnly) < 1e-9,
     `total ${total} vs road-only ${roadOnly}`);
  ok('and the road legs are actually non-zero', roadOnly > 0,
     'otherwise the assertion above passes for the wrong reason');

  // Editing the departure airport has to invalidate the cached chain,
  // or the second point would go on being computed from stale data.
  const sigBefore = rs.tripStopChainSig();
  rs.tripDays[1].items[1].fromLat = 55.95;
  ok('changing the departure airport changes the chain signature',
     rs.tripStopChainSig() !== sigBefore);

  // ── 13b. A train breaks the chain the way a flown leg does ─────────
  /* DEC-039 (owner review). A train has no coordinates, so it is not a
   * stop — but a stop that is merely ABSENT lets the chain close over
   * it, and an Edinburgh hotel followed by a train to Inverness became
   * an Edinburgh→Inverness car drive: costed, fuelled and drawn across
   * Scotland. The stop after a train is marked flown instead. */
  rs.tripDays = [
    { id: 1, items: [
      { id: 'h', type: 'hotel', name: 'Edinburgh hotel', lat: 55.9533, lng: -3.1883 },
      { id: 't', type: 'train', name: 'Inverness', fromName: 'Edinburgh Waverley',
        depart: '08:40', arrive: '12:15' } ] },
    { id: 2, items: [
      { id: 'g', type: 'golf', i: 0, time: '14:00' } ] },
  ];
  rs.tripStopChainInvalidate();
  const t1 = rs.tripDayStops(0), t2 = rs.tripDayStops(1);
  check('a train is not a stop', t1.length, 1);
  check('and the day after it has its own', t2.length, 1);
  ok('the first stop after the train is flown', t2[0].flown === true,
     'that is what stops the chain closing over the train');
  ok('and is marked as a rail break, not an air one', t2[0].railed === true);

  orsAsked = [];
  const rail = rs.tripLegEstimate(t1[0], t2[0]);
  check('so the leg across the train is zero minutes', rail.minutes, 0);
  check('and zero miles, so it is not in the fuel', rail.miles, 0);
  check('and it never reaches ORS', orsAsked, []);

  rs.tripStopChainInvalidate();
  ok('the whole trip drives nothing at all', rs.tripTotalDriveMiles() === 0,
     'Edinburgh to Inverness was the only pair, and it was taken by train');

  // The break lasts exactly one leg: drive on from where the train left
  // you and that IS a drive.
  rs.tripDays[1].items.push({ id: 'p', type: 'poi', name: 'Castle', lat: 57.6, lng: -4.1 });
  rs.tripStopChainInvalidate();
  const t2b = rs.tripDayStops(1);
  ok('the stop after that one is driven to normally', !t2b[1].flown);
  ok('and it does ask ORS', (() => { orsAsked = []; rs.tripLegEstimate(t2b[0], t2b[1]);
     return orsAsked.length === 1; })());

  // A day's own place is a stop too, so the break has to survive it —
  // otherwise the drive reappears as "Edinburgh hotel → Inverness".
  rs.tripDays[1].placeLat = 57.4778; rs.tripDays[1].placeLng = -4.2247;
  rs.tripDays[1].place = 'Inverness';
  rs.tripStopChainInvalidate();
  const t2c = rs.tripDayStops(1);
  check('the day place leads the day', t2c[0].type, 'place');
  ok('and IT is the stop the train exempts', t2c[0].flown === true);
  ok('while the round after it is driven to', !t2c[1].flown);

  // The same thing within one day, which is the commoner shape: breakfast
  // in Edinburgh, train up, tee off at Castle Stuart that afternoon.
  rs.tripDays = [
    { id: 1, items: [
      { id: 'h', type: 'hotel', name: 'Edinburgh hotel', lat: 55.9533, lng: -3.1883 },
      { id: 't', type: 'train', name: 'Inverness', fromName: 'Edinburgh Waverley',
        depart: '08:40', arrive: '12:15' },
      { id: 'g', type: 'golf', i: 0, time: '14:00' } ] },
  ];
  rs.tripStopChainInvalidate();
  const one = rs.tripDayStops(0);
  check('a one-day train trip has two stops, not three', one.length, 2);
  ok('and the round after the train is flown', one[1].flown === true,
     'within a single day the break is carried by the item walk itself');
  orsAsked = [];
  check('zero miles within the day too', rs.tripLegEstimate(one[0], one[1]).miles, 0);
  check('and still no ORS call', orsAsked, []);
  ok('and nothing in the fuel', rs.tripTotalDriveMiles() === 0);
}

if (failures) {
  console.log(`\ntest_timeline: ${failures} failure(s).`);
  process.exit(1);
}
console.log('test_timeline: OK — times compute, fixed times push and never move, ' +
            'the drive is judged against the arrival buffer and not the tee time, ' +
            'hotels and drive-froms stay markers, trains and flights are as ' +
            'long as their own two times, and the owner\'s worked ' +
            'example builds end to end.');
