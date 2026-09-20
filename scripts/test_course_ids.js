#!/usr/bin/env node
/**
 * GOLF-163: course identity must not move.
 *
 * WHAT THIS PROTECTS
 *
 * A share link is a URL already in someone else's hands. It names courses,
 * and if what it names changes, the link silently renders a different trip —
 * no error, no warning. Every other reference (TRIP, tripDays, EDITS,
 * PLAYED, WANT) lives in the visitor's own browser and gets migrated on
 * load; the link cannot be.
 *
 * So the invariant is: an old reference resolves to the same COURSE, for
 * ever — whatever happens to array order afterwards.
 *
 * The strongest check here is the last one. It does not ask whether the
 * current code re-indexes; it shuffles C[] deliberately and asserts that a
 * legacy index written before the shuffle still resolves to the course it
 * originally named. That is the guarantee, tested rather than reasoned
 * about — which matters because the "nothing re-indexes" property is a
 * property of how today's merge scripts are written, not of the data, and
 * GOLF-161/162 are about to write new ones.
 *
 * Run: node scripts/test_course_ids.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = [
  'data/config.js', 'data/stations.js', 'data/courses-london.js',
  'data/courses-top100.js', 'data/courses-scotland.js', 'data/courses-wales.js',
  'data/courses-ireland.js', 'data/courses-southafrica.js', 'data/course-ids.js',
];

function load(files, extra) {
  const sandbox = Object.assign({ console, Date, Math, JSON, Map, Set }, extra || {});
  vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^(const|let) /gm, 'var ');
    try {
      vm.runInContext(code, sandbox, { filename: f });
    } catch (e) {
      console.error(`FAIL: ${f} does not load — ${e.message}`);
      process.exit(1);
    }
  }
  return sandbox;
}

const failures = [];
const fail = (m) => failures.push(m);
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    fail(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

const s = load(DATA.concat(['js/course-id.js']));
const { C, COURSE_IDS_V1 } = s;

// ---- 1. every course is identified, uniquely ----
const missing = [];
C.forEach((c, i) => { if (typeof c.id !== 'string' || !c.id) missing.push(`C[${i}] (${c.n})`); });
if (missing.length) fail(`${missing.length} course(s) have no id: ${missing.slice(0, 5).join(', ')}`);
const distinct = new Set(C.map(c => c.id));
if (distinct.size !== C.length)
  fail(`${C.length - distinct.size} duplicate id(s) — an id must name exactly one course`);

// ---- 2. order and identity match the committed baseline ----
// This is the criterion GOLF-161/162 have to satisfy: a re-source may change
// coordinates, never length and never which course sits at which index.
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/course-order-baseline.json'), 'utf8'));
if (C.length !== baseline.count) {
  fail(`C.length is ${C.length}, baseline says ${baseline.count} — if a course was deliberately `
     + 'added or removed, regenerate scripts/course-order-baseline.json and say so in the commit message');
} else {
  let moved = 0;
  C.forEach((c, i) => {
    const [id, n] = baseline.courses[i];
    if (c.id !== id || c.n !== n) {
      if (moved < 5) fail(`C[${i}] is now ${c.n} (${c.id}), baseline has ${n} (${id}) — the array re-indexed`);
      moved++;
    }
  });
  if (moved > 5) fail(`...and ${moved - 5} more records out of position`);
}

// ---- 3. the frozen table describes the ordering it was frozen at ----
if (COURSE_IDS_V1.length !== baseline.count)
  fail(`COURSE_IDS_V1 has ${COURSE_IDS_V1.length} entries, expected ${baseline.count}`);
const tableWrong = COURSE_IDS_V1.filter((id, i) => id !== (baseline.courses[i] || [])[0]).length;
if (tableWrong) fail(`${tableWrong} entries in data/course-ids.js disagree with the baseline — that file `
                   + 'is frozen and must never be regenerated; see the comment at the top of it');

// ---- 4. references round-trip ----
const [a, b, c] = [0, 400, C.length - 1];
[a, b, c].forEach(i => {
  eq(`courseRefDecode(courseRefEncode(${i}))`, s.courseRefDecode(s.courseRefEncode(i)), i);
  eq(`legacy index ${i}`, s.courseIndexFromLegacy(i), i);
});
eq('an unknown id resolves to null', s.courseRefDecode('no-such-course-0000'), null);
eq('a non-reference resolves to null', s.courseRefDecode({}), null);
eq('a negative index resolves to null', s.courseRefDecode(-1), null);

// ---- 5. a saved trip survives the encode/decode boundary ----
const entry = {
  name: 'Test', trip: [a, b], tripSeq: [b, a], tripLastAdded: b, tbAnchor: a,
  tripDays: [{ id: 1, kind: 'golf', items: [
    { id: 'x1', type: 'golf', i: a },
    { id: 'x2', type: 'hotel', name: 'Somewhere', price: 90 },
    { id: 'x3', type: 'golf', i: b },
  ] }],
};
const encoded = s.courseEncodeTripEntry(entry);
eq('encoded trip carries ids', encoded.trip, [C[a].id, C[b].id]);
eq('encoded golf item carries an id', encoded.tripDays[0].items[0].i, C[a].id);
eq('a hotel item is untouched', encoded.tripDays[0].items[1], entry.tripDays[0].items[1]);
const back = s.courseDecodeTripEntry(encoded);
eq('trip round-trips', back.trip, entry.trip);
eq('tripSeq round-trips', back.tripSeq, entry.tripSeq);
eq('tripLastAdded round-trips', back.tripLastAdded, entry.tripLastAdded);
eq('items round-trip', back.tripDays[0].items, entry.tripDays[0].items);

// The pre-GOLF-163 shape, which is what every existing visitor has stored.
const legacy = s.courseDecodeTripEntry(entry);
eq('a legacy (numeric) saved trip still decodes', legacy.trip, entry.trip);

// EDITS is keyed by reference, and its two key forms must stay distinguishable.
eq('keyed edits round-trip',
   s.courseDecodeKeyed(s.courseEncodeKeyed({ [a]: { wd: '£10' } })), { [a]: { wd: '£10' } });
eq('a legacy numeric key still decodes', s.courseDecodeKeyed({ [String(b)]: { we: '£20' } }), { [b]: { we: '£20' } });

// ---- 6. THE ONE THAT MATTERS: identity survives a reorder ----
// Reverse C[] — a change far more violent than any re-pull would make — and
// check that references written against the ORIGINAL order still name the
// original courses.
const names = C.map(x => x.n);
const shuffled = load(DATA, {}); // fresh copy of the data
shuffled.C.reverse();
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-id.js'), 'utf8')
  .replace(/^(const|let) /gm, 'var '), shuffled, { filename: 'js/course-id.js (reordered)' });

[a, b, c, 1, 500, 878].forEach(i => {
  const still = shuffled.courseIndexFromLegacy(i);
  if (still === null) { fail(`after a reorder, legacy index ${i} resolves to nothing`); return; }
  if (shuffled.C[still].n !== names[i])
    fail(`after a reorder, legacy index ${i} resolves to "${shuffled.C[still].n}" — it originally meant "${names[i]}"`);
  if (still === i && C.length > 1 && i !== (C.length - 1) / 2)
    fail(`after a reversal, legacy index ${i} still maps to ${i} — the test is not exercising what it claims`);
});
// And an id written today still finds its course after the same reorder.
const idOfB = C[b].id;
const foundB = shuffled.courseRefDecode(idOfB);
if (foundB === null || shuffled.C[foundB].n !== names[b])
  fail(`after a reorder, id "${idOfB}" no longer resolves to "${names[b]}"`);

// ---- 7. share links: both forms decode, old ones keep working ----
// The whole point of the ticket. A link made yesterday carries `i:<index>`;
// one made today carries `c:"<id>"`. Both must land on the same course.
const share = load(DATA.concat(['js/course-id.js', 'js/trip-model.js', 'js/trip-share.js']),
                   { decodeURIComponent, encodeURIComponent });
const linkFor = (items, seq) => '#share=' + encodeURIComponent(JSON.stringify({
  v: 1, gs: 2, nm: 'Test', seq,
  days: [{ id: 1, kind: 'golf', items }],
}));

const oldLink = share.tripDecodeSharePayload(linkFor([{ id: 'g1', type: 'golf', i: b }], [a, b]));
const newLink = share.tripDecodeSharePayload(linkFor([{ id: 'g1', type: 'golf', c: C[b].id }], [C[a].id, C[b].id]));
if (!oldLink) fail('a pre-GOLF-163 share link (numeric i) no longer decodes at all');
if (!newLink) fail('a GOLF-163 share link (id) does not decode');
if (oldLink && newLink) {
  eq('old and new share links agree on seq', oldLink.seq, newLink.seq);
  eq('old and new share links agree on the golf item', oldLink.days[0].items, newLink.days[0].items);
  const first = oldLink.days[0].items[0];
  if (!first) fail('a pre-GOLF-163 link\'s golf item was dropped — legacy index decoding is gone');
  else eq('the decoded item points at the right course', first.i, b);
}
// A link naming a course that no longer exists drops that item rather than
// rendering the wrong one — the failure mode this ticket is about.
const gone = share.tripDecodeSharePayload(linkFor([{ id: 'g1', type: 'golf', c: 'deleted-course-0000' }], ['deleted-course-0000']));
if (!gone) fail('a link naming a removed course should still decode, minus that course');
else {
  eq('a removed course drops out of seq', gone.seq, []);
  eq('a removed course drops out of the day', gone.days[0].items, []);
}
// tripBuildSharePayload() must emit the id form, or none of the above helps.
const shareSrc = fs.readFileSync(path.join(ROOT, 'js/trip-share.js'), 'utf8');
if (!/c:courseRefEncode\(it\.i\)/.test(shareSrc))
  fail('tripBuildSharePayload() is not emitting course ids — new links would still carry indices');

if (failures.length) {
  console.error(`test_course_ids: ${failures.length} failure(s)\n`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`test_course_ids: OK — ${C.length} courses, ${distinct.size} distinct ids, order matches `
          + 'the baseline, and both reference forms survive a full array reversal.');
