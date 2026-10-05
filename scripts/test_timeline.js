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
const compute = items => {
  ctx.__items = items;
  return run('tlComputeDay(__items, driveFn)');
};
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
check('golf default 4h30', run('tlDurationFor({type:"golf"})'), 270);
check('poi default 90', run('tlDurationFor({type:"poi"})'), 90);
check('hotel is a marker', run('tlDurationFor({type:"hotel"})'), 0);
check('flight is a marker', run('tlDurationFor({type:"flight"})'), 0);
check('explicit duration wins', run('tlDurationFor({type:"golf",durationMins:200})'), 200);
check('duration clamped to a day', run('tlDurationFor({type:"golf",durationMins:99999})'), 1440);
check('negative duration ignored', run('tlDurationFor({type:"golf",durationMins:-30})'), 270);
check('junk duration ignored', run('tlDurationFor({type:"golf",durationMins:"long"})'), 270);

// ── 3. THE OWNER'S WORKED EXAMPLE (GOLF-153 backlog row) ──────────────
// "Depart 9:40 LCY (BA942) → arrive Inverness 10:55 → 5 min drive →
//  12:24 tee off Cabot Highlands (£350) → drive to Dufftown →
//  stay Dufftown Inn"
{
  drives['fl>golf'] = 5;    // Inverness airport → Cabot Highlands
  drives['golf>hotel'] = 55; // Cabot Highlands → Dufftown (not in the chain)
  const rows = compute([
    { id: 'fl', type: 'flight', flightNo: 'BA942', fromCode: 'LCY', toCode: 'INV',
      depart: '09:40', arrive: '10:55', lat: 57.5425, lng: -4.0475 },
    { id: 'golf', type: 'golf', i: 0, time: '12:24' },
    { id: 'hotel', type: 'hotel', name: 'Dufftown Inn', nights: 1, stayId: 's1' }
  ]);

  check('example: three rows', rows.length, 3);
  check('example: flight anchored on ARRIVAL 10:55', at(rows[0].startMins), '10:55');
  check('example: flight draws no block', rows[0].durationMins, 0);
  ok('example: flight is a marker', rows[0].marker === true);
  check('example: 5 min drive runs into the tee', rows[1].driveMins, 5);
  check('example: tee time honoured at 12:24', at(rows[1].startMins), '12:24');
  ok('example: tee time is the visitor\'s, not derived', rows[1].fixed === true);
  check('example: round ends 16:54 (4h30)', at(rows[1].endMins), '16:54');
  ok('example: no conflict — 11:00 arrival, 12:24 tee', rows[1].conflict === null,
     'the drive lands at 11:00, so there is 1h24 spare');
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
  check('round 08:00 → ends 12:30', at(early[0].endMins), '12:30');
  check('POI flows: +30 min drive → 13:00', at(early[1].startMins), '13:00');
  check('POI ends 14:30 (90 min)', at(early[1].endMins), '14:30');

  // Move the tee time two hours later; everything after must move with it.
  const later = compute([
    { id: 'a', type: 'golf', i: 0, time: '10:00' },
    { id: 'b', type: 'poi', name: 'Distillery' }
  ]);
  check('tee +2h pushes the POI to 15:00', at(later[1].startMins), '15:00');
  ok('the pushed item is still derived, not fixed', later[1].fixed === false);
}

// ── 5. Conflicts: warn, never silently move ───────────────────────────
{
  drives['g1>g2'] = 60;
  const rows = compute([
    { id: 'g1', type: 'golf', i: 0, time: '09:00' },   // ends 13:30
    { id: 'g2', type: 'golf', i: 1, time: '12:24' }    // + 60 min drive = 14:30
  ]);
  ok('a missed fixed time is flagged', rows[1].conflict !== null);
  check('conflict reports the real arrival', at(rows[1].conflict.arriveMins), '14:30');
  check('conflict reports the fixed time', at(rows[1].conflict.fixedMins), '12:24');
  check('THE FIXED TIME IS NOT MOVED', at(rows[1].startMins), '12:24');
  ok('it is still marked fixed', rows[1].fixed === true);
}
{
  // Exactly on time is not a conflict.
  drives['g1>g2'] = 60;
  const rows = compute([
    { id: 'g1', type: 'golf', i: 0, time: '09:00', durationMins: 240 }, // ends 13:00
    { id: 'g2', type: 'golf', i: 1, time: '14:00' }                     // +60 = 14:00
  ]);
  ok('arriving exactly on time is no conflict', rows[1].conflict === null);
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
  check('then flows: 13:30 + 20 min drive', at(rows[1].startMins), '13:50');
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

// ── 9. Flights: arrival only, departure never drawn ───────────────────
{
  const rows = compute([
    { id: 'f', type: 'flight', flightNo: 'BA6392', fromCode: 'LHR', toCode: 'CPT',
      depart: '22:10', arrive: '11:35' } // crosses a night AND two time zones
  ]);
  check('anchored on arrival', at(rows[0].startMins), '11:35');
  check('no block drawn', rows[0].durationMins, 0);
  ok('so a cross-zone flight can never draw backwards', rows[0].endMins >= rows[0].startMins,
     'depart 22:10 > arrive 11:35 would be negative if we drew depart→arrive');
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
  check('grid starts at 09:00', range.startHour, 9);
  check('grid ends at 16:00 (15:30 rounded out)', range.endHour, 16);
}
check('empty day has no range', run('tlDayRange([])'), null);
check('null is survivable', run('tlDayRange(null)'), null);

// ── 11. Degenerate input never throws ─────────────────────────────────
check('no items', compute([]).length, 0);
check('null items', run('tlComputeDay(null, driveFn).length'), 0);
ok('a null item in the list does not throw',
   (() => { try { compute([null, { id: 'g', type: 'golf', i: 0 }]); return true; }
            catch (e) { return false; } })());
ok('a missing driveFn is survivable',
   (() => { try { run('tlComputeDay([{id:"a",type:"golf"},{id:"b",type:"poi"}], null)'); return true; }
            catch (e) { return false; } })());

if (failures) {
  console.log(`\ntest_timeline: ${failures} failure(s).`);
  process.exit(1);
}
console.log('test_timeline: OK — times compute, fixed times push and never move, ' +
            'hotels and flights stay markers, and the owner\'s worked example builds end to end.');
