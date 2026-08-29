#!/usr/bin/env node
/* ============================================================
   scripts/check_js.js — syntax-checks the app's JS.

   Replaces the old "extract the inline <script> block out of the
   HTML and run node --check on it" step: since GOLF-70 the app's
   JS lives in js/*.js, loaded as plain <script src> tags in a
   fixed order (see london-golf-map-v5_1.html).

   Checks, in order:
     1. every js/*.js file parses (node --check equivalent);
     2. the HTML still lists every js/*.js file exactly once, in
        the load order this script knows about — a new module that
        is never added to the HTML, or one left in the HTML after
        being deleted, is caught here rather than in the browser;
     3. the concatenation of all modules in load order parses as
        one script, which is what the browser effectively evaluates
        (catches a duplicate top-level const/let across two files).

   Usage: node scripts/check_js.js
   Exits non-zero with a readable list on any failure.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'london-golf-map-v5_1.html');
const JSDIR = path.join(ROOT, 'js');

const failures = [];

// The load order the page uses. Kept here deliberately rather than
// derived from the HTML, so that a module reordered in the HTML by
// accident is a visible diff in this file too.
const ORDER = [
  'util.js',
  'trip-model.js',
  'state.js',
  // handicap.js is only function declarations, but it must precede map.js:
  // map.js builds every course popup at load time and popupHTML() embeds
  // calcHTML() from here.
  'handicap.js',
  'map.js',
  'trip-geo.js',
  'trip-route.js',
  'trip-add.js',
  'ors.js',
  'trip-ui.js',
  'app-mode.js',
  'explore.js',
  'editor.js',
  'boot.js',
];

function parses(src, label) {
  try {
    new vm.Script(src, { filename: label });
    return true;
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    return false;
  }
}

// 1. every module parses on its own
const onDisk = fs.readdirSync(JSDIR).filter(f => f.endsWith('.js')).sort();
const sources = {};
for (const f of onDisk) {
  const src = fs.readFileSync(path.join(JSDIR, f), 'utf8');
  sources[f] = src;
  parses(src, `js/${f}`);
}

// 2. the HTML lists exactly the modules we know about, in order
const html = fs.readFileSync(HTML, 'utf8');
const listed = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
const missingFromHtml = ORDER.filter(f => !listed.includes(f));
const extraInHtml = listed.filter(f => !ORDER.includes(f));
const notOnDisk = ORDER.filter(f => !onDisk.includes(f));
const notListed = onDisk.filter(f => !ORDER.includes(f));
if (missingFromHtml.length) failures.push(`not loaded by the HTML: ${missingFromHtml.join(', ')}`);
if (extraInHtml.length) failures.push(`loaded by the HTML but unknown here: ${extraInHtml.join(', ')}`);
if (notOnDisk.length) failures.push(`listed in ORDER but missing from js/: ${notOnDisk.join(', ')}`);
if (notListed.length) failures.push(`present in js/ but missing from ORDER: ${notListed.join(', ')}`);
if (listed.length === ORDER.length && listed.join(',') !== ORDER.join(',')) {
  failures.push(`HTML load order differs from ORDER:\n  html: ${listed.join(' ')}\n  here: ${ORDER.join(' ')}`);
}

// 3. the whole thing parses as one script, as the browser sees it
const combined = ORDER.filter(f => sources[f]).map(f => sources[f]).join('\n');
parses(combined, 'js/* (concatenated in load order)');

if (failures.length) {
  console.error(`check_js: ${failures.length} problem(s)\n`);
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`check_js: OK — ${ORDER.length} modules parse individually and together, HTML load order matches.`);
