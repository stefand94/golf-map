/* Golf Tripper — marker SVG proposals: reference implementation.
   NOT wired into the app. Plain non-module script: every function is a
   global, matching how js/*.js are loaded. Each returns an SVG string that
   is byte-for-byte the same as the matching static file in markers/ and
   clusters/ (those files were emitted from these functions).

   Teardrop family: every pin shares one 40x60 viewBox (2:3, the same
   proportions as pinShapeSVG() in js/util.js) and one path. Render it at
   22x33 (regular) or 30x45 (ranked / shortlist / in-trip). The tip sits at
   y≈59 of 60, so iconAnchor = [w/2, h-1]. */

var GT_PIN_PATH = 'M20 57.6C-1 33.8 2.5 23.3 2.5 19.8A17.5 17.5 0 1 1 37.5 19.8C37.5 23.3 41 33.8 20 57.6Z';
var GT_HEAD = { x: 20, y: 19.8 };            // centre of the pin's round head
var GT_FONT = 'Space Grotesk, Manrope, system-ui, sans-serif';
var GT_INK = '#1B2733';
var GT_GOLD = '#E6B400';
var GT_COURSE = { body: '#1F7A4D', outline: '#155C39' };
var GT_DAY_COLORS = ['#C2410C', '#7C3AED', '#0E7490', '#BE185D', '#A16207', '#4338CA', '#4D7C0F', '#9F1239'];
var GT_POI = { heritage: '#8A5A2B', nature: '#2F7D4F', coast: '#2B7BB9', culture: '#7A4FA0', drink: '#B7791F' };

/* Darken a #RRGGBB by mixing toward black — gives each body colour its
   own outline, the way #155C39 outlines #1F7A4D. */
function gtShade(hex, amt) {
  var n = parseInt(hex.slice(1), 16), k = 1 - (amt == null ? 0.28 : amt);
  var c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) {
    return ('0' + Math.round(v * k).toString(16)).slice(-2);
  });
  return ('#' + c.join('')).toUpperCase();
}

/* Pin chassis: white under-rim (reads on satellite), then the body with a
   darker outline. `inner` is the glyph markup, `extra` badges on top. */
function gtPinShell(w, body, outline, inner, extra) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + (w * 1.5) + '" viewBox="0 0 40 60">' +
    '<path d="' + GT_PIN_PATH + '" fill="#FFF" stroke="#FFF" stroke-width="4.4" stroke-linejoin="round"/>' +
    '<path d="' + GT_PIN_PATH + '" fill="' + body + '" stroke="' + outline + '" stroke-width="2" stroke-linejoin="round"/>' +
    (inner || '') + (extra || '') + '</svg>';
}

/* White golf flag, centred on the head. */
function gtFlag() {
  return '<ellipse cx="16.4" cy="28.4" rx="4" ry="1.3" fill="#FFF" opacity=".55"/>' +
    '<path d="M16.4 28V11" stroke="#FFF" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M16.4 11L27 15.6 16.4 20.2Z" fill="#FFF"/>';
}

/* Badges: an ink disc with a white rim, so they read on ANY pin fill.
   Right shoulder = ranked star. Left shoulder = played tick OR want heart
   (played wins if both are somehow set — they are mutually exclusive in
   meaning). */
function gtBadge(side, glyph) {
  var cx = side === 'left' ? 8.4 : 31.6, cy = 8.4;
  return '<g transform="translate(' + cx + ' ' + cy + ')">' +
    '<circle r="6.9" fill="' + GT_INK + '" stroke="#FFF" stroke-width="1.4"/>' + glyph + '</g>';
}
function gtStarGlyph() {
  return '<path d="M0-4.6L1.2-1.6 4.4-1.4 1.9.6 2.7 3.7 0 2 -2.7 3.7 -1.9.6 -4.4-1.4 -1.2-1.6Z" fill="' + GT_GOLD + '"/>';
}
function gtTickGlyph() {
  return '<path d="M-3.2.2L-1 2.4 3.3-2.1" fill="none" stroke="#FFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
}
function gtHeartGlyph() {
  return '<path d="M0 3.6C-1.2 2.6-4 .7-4-1.4-4-2.9-2.9-3.8-1.8-3.8-.9-3.8-.3-3.3 0-2.6.3-3.3.9-3.8 1.8-3.8 2.9-3.8 4-2.9 4-1.4 4 .7 1.2 2.6 0 3.6Z" fill="#FB7185"/>';
}
function gtBadges(o) {
  var s = '';
  if (o.ranked) s += gtBadge('right', gtStarGlyph());
  if (o.played) s += gtBadge('left', gtTickGlyph());
  else if (o.want) s += gtBadge('left', gtHeartGlyph());
  return s;
}

/* Course pin. Size defaults: 30 if ranked/shortlisted, else 22. */
function gtCoursePinSVG(o) {
  o = o || {};
  var w = o.size || (o.ranked || o.shortlist ? 30 : 22);
  var ring = o.shortlist ? '<circle cx="20" cy="19.8" r="12.2" fill="none" stroke="#FFF" stroke-width="2.6"/>' : '';
  return gtPinShell(w, GT_COURSE.body, GT_COURSE.outline, ring + gtFlag(), gtBadges(o));
}

/* Scheduled trip course: day colour body, white day number in place of the
   flag. `color` defaults to the day palette (cycles after 8). opts may
   carry ranked/played/want for badges, and size (default 30). */
function gtDayPinSVG(n, color, opts) {
  opts = opts || {};
  color = color || GT_DAY_COLORS[(n - 1) % GT_DAY_COLORS.length];
  var label = String(n), fs = label.length > 1 ? 15.5 : 19;
  var text = '<text x="20" y="' + (19.8 + fs * 0.36).toFixed(1) + '" fill="#FFF" font-family="' + GT_FONT +
    '" font-weight="700" font-size="' + fs + '" text-anchor="middle">' + label + '</text>';
  return gtPinShell(opts.size || 30, color, gtShade(color), text, gtBadges(opts));
}

/* Trip stops that aren't golf: 'stay' (bed), 'see' (camera), 'place'
   (searched place, dot). Unscheduled colour defaults: stay/see slate
   #3E4C5A, place navy accent #2E5C8A; pass a day colour once scheduled. */
function gtStopPinSVG(kind, color, size) {
  var glyph;
  if (kind === 'stay') {
    color = color || '#3E4C5A';
    glyph = '<path d="M11.5 14.5V26.5M11.5 23.2H28.5M28.5 19.6V26.5" fill="none" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/>' +
      '<rect x="13.4" y="17" width="5" height="3.6" rx="1.2" fill="#FFF"/>' +
      '<path d="M20 17.2H26.3A2.2 2.2 0 0 1 28.5 19.4V21.4H20Z" fill="#FFF"/>';
  } else if (kind === 'see') {
    color = color || '#3E4C5A';
    glyph = '<path d="M16.3 15.2L17.8 12.6H22.2L23.7 15.2Z" fill="#FFF"/>' +
      '<rect x="10.8" y="15" width="18.4" height="12" rx="2.6" fill="#FFF"/>' +
      '<circle cx="20" cy="21" r="3.9" fill="' + color + '"/>' +
      '<circle cx="20" cy="21" r="1.7" fill="#FFF"/>';
  } else {
    color = color || '#2E5C8A';
    glyph = '<circle cx="20" cy="19.8" r="6" fill="#FFF"/>';
  }
  return gtPinShell(size || 22, color, gtShade(color), glyph, '');
}

/* Trip start / end: a round disc, NOT a teardrop (keeps GOLF-243's intent
   that "where the trip begins" is a different kind of thing), but in the
   family's rim + outline language. 24x24, anchor centre [12,12]. */
function gtEndpointSVG(isEnd) {
  var glyph = isEnd
    ? '<path d="M8.4 6.2V17.8" stroke="#FFF" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="9.2" y="6.6" width="7.2" height="4.8" fill="#FFF"/>' +
      '<path d="M9.2 6.6H11.6V9H9.2ZM14 6.6H16.4V9H14ZM11.6 9H14V11.4H11.6Z" fill="' + GT_INK + '"/>'
    : '<path d="M9.8 7.6V16.4L16.8 12Z" fill="#FFF" stroke="#FFF" stroke-width="1.2" stroke-linejoin="round"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10.4" fill="' + GT_INK + '" stroke="#FFF" stroke-width="2"/>' + glyph + '</svg>';
}

/* POI category markers: filled 20x20 disc, white rim, white glyph. */
var GT_POI_GLYPHS = {
  heritage: '<path d="M6 15.2V7.4H7.8V9H9.3V7.4H10.7V9H12.2V7.4H14V15.2H11.4V12.6A1.4 1.4 0 0 0 8.6 12.6V15.2Z" fill="#FFF"/>',
  nature: '<path d="M10 4.6L13.6 9.2H12L14.6 12.8H11V15.4H9V12.8H5.4L8 9.2H6.4Z" fill="#FFF"/>',
  coast: '<path d="M5 8.6C6.1 7.4 7.2 7.4 8.3 8.6S10.5 9.8 11.6 8.6 13.8 7.4 14.9 8.6M5 12.4C6.1 11.2 7.2 11.2 8.3 12.4S10.5 13.6 11.6 12.4 13.8 11.2 14.9 12.4" fill="none" stroke="#FFF" stroke-width="1.6" stroke-linecap="round"/>',
  culture: '<path d="M10 4.8L15 7.6H5Z" fill="#FFF"/><path d="M6.2 8.4H7.8V13.4H6.2ZM9.2 8.4H10.8V13.4H9.2ZM12.2 8.4H13.8V13.4H12.2ZM5 14H15V15.4H5Z" fill="#FFF"/>',
  drink: '<path d="M6.3 5.8H13.7L12.8 14.8H7.2Z" fill="none" stroke="#FFF" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.9 10.4H13.1L12.7 14.8H7.3Z" fill="#FFF"/>'
};
function gtPoiSVG(cat) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
    '<circle cx="10" cy="10" r="8.8" fill="' + GT_POI[cat] + '" stroke="#FFF" stroke-width="1.5"/>' +
    GT_POI_GLYPHS[cat] + '</svg>';
}

/* Cluster disc. size 30 / 36 / 44 (pick by count: <10, <50, else).
   Soft green halo + solid disc with white rim; gold dot (upper right)
   when the cluster contains a trip course. Anchor centre. */
function gtClusterSize(count) { return count < 10 ? 30 : count < 50 ? 36 : 44; }
function gtClusterSVG(count, size, hasTrip) {
  size = size || gtClusterSize(count);
  var h = size / 2, r = h - 3.5, fs = size === 30 ? 12 : size === 36 ? 13 : 14;
  var dot = '';
  if (hasTrip) {
    var d = (h + r * 0.707).toFixed(1), u = (h - r * 0.707).toFixed(1);
    dot = '<circle cx="' + d + '" cy="' + u + '" r="' + (size / 7).toFixed(1) + '" fill="' + GT_GOLD + '" stroke="#FFF" stroke-width="1.5"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + h + '" cy="' + h + '" r="' + h + '" fill="' + GT_COURSE.body + '" opacity=".28"/>' +
    '<circle cx="' + h + '" cy="' + h + '" r="' + r + '" fill="' + GT_COURSE.body + '" stroke="#FFF" stroke-width="2"/>' +
    '<text x="' + h + '" y="' + (h + fs * 0.36).toFixed(1) + '" fill="#FFF" font-family="' + GT_FONT +
    '" font-weight="700" font-size="' + fs + '" text-anchor="middle">' + count + '</text>' + dot + '</svg>';
}
