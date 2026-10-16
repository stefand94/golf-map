/* ============================================================
   js/util.js — shared primitives used across the whole app: the
   golf-flag marker SVG, the derived station index (STN/STN_LINES),
   National Rail badge/roundel helpers, rail spline smoothing,
   architect tagging, the EDITS correction overlay and the
   played/want lists.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in index.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* Golf-flag marker: pole + triangular pennant + a small base ellipse
   standing in for the hole. Ranked courses get a thicker pole and a
   thin gold ring at the base instead of just being bigger. */
function flagSVG(colour,pole,size,ring){
  const w=size,h=size*1.3;
  const poleW=ring?2.4:1.6, poleX=w*0.28;
  const flagPts=`${poleX},${h*0.06} ${w*0.92},${h*0.24} ${poleX},${h*0.42}`;
  const strokeCol = colour==='#FFFFFF' ? '#9AA39C' : 'rgba(0,0,0,.18)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <ellipse cx="${poleX}" cy="${h*0.93}" rx="${w*0.24}" ry="${h*0.055}" fill="${pole}" opacity=".22"/>
    ${ring?`<circle cx="${poleX}" cy="${h*0.93}" r="${w*0.30}" fill="none" stroke="#E6B400" stroke-width="1.6"/>`:''}
    <line x1="${poleX}" y1="${h*0.05}" x2="${poleX}" y2="${h*0.95}" stroke="${pole}" stroke-width="${poleW}" stroke-linecap="round"/>
    <polygon points="${flagPts}" fill="${colour}" stroke="${strokeCol}" stroke-width="1"/>
  </svg>`;
}

/* GOLF-254 (B2): the marker family. Teardrop pins share one 40x60 viewBox
   (gtPinShell); courses are green, scheduled trip courses take their day's
   colour with the day number, and state rides on badges (ranked star, played
   tick, want heart) instead of fill changes. Stay/see/place pins, trip
   start/end discs, POI discs and cluster discs come from the same file.
   Source of truth for the shapes: design/svg-proposals/templates.js. */
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

/* HTML escaping. Lived in js/editor.js (the last module in load order)
   while only the corrections form used it; every module that interpolates
   a user- or network-supplied string into innerHTML needs it, so it lives
   here in the first module instead. `'` is escaped too — a single-quoted
   attribute is common enough in this codebase's inline handlers that
   leaving it out is a real hole. */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;')}
/* Anything interpolated into an href= goes through this first: a saved
   correction or an imported/shared payload can carry a `javascript:` (or
   `data:`) URL, which esc() alone does nothing about. Only http(s), mailto,
   site-absolute, in-page, and bare same-origin relative paths (e.g.
   data/*.js's relative paths, which never carry a leading slash)
   survive; everything else becomes '#'. The relative-path pattern has no
   ':' in it, so a disguised scheme like "javascript:alert(1)" still can't
   sneak through. The result is still esc()'d by the caller for the
   attribute quoting. */
function escUrl(s){
  const v=String(s==null?'':s).trim();
  if(/^(https?:|mailto:|\/|#)/i.test(v))return v;
  return /^[\w.-]+(\/[\w.-]+)*$/.test(v)?v:'#';
}

const STN={},STN_LINES={};
Object.entries(R).forEach(([rk,arr])=>arr.forEach(([n,la,ln])=>{
  (STN_LINES[n]=STN_LINES[n]||new Set()).add(ROUTE_LINE[rk]);
  if(!STN[n])STN[n]={n,lat:la,lng:ln,l:ROUTE_LINE[rk]};
}));
ISOLATED.forEach(([n,la,ln,lk])=>{ if(!STN[n]){STN[n]={n,lat:la,lng:ln,l:lk};(STN_LINES[n]=STN_LINES[n]||new Set()).add(lk);} });
const isIX=n=>STN_LINES[n].size>1||MANUAL_IX.includes(n);

/* GOLF: a small "NR" badge next to a station when it's reached by National
   Rail, not the TfL network (Tube/Overground/Elizabeth/DLR) — those are the
   lines a Tube-only Oyster/contactless cap doesn't cover. Overground and
   Elizabeth line run partly on National Rail infrastructure but are TfL
   fare-zone/TfL-operated services, so they count as TfL here; every other
   entry in LINES (Thameslink, Great Northern, Chiltern, Southern,
   Southeastern, South Western, WCML) is a train-operating-company service —
   plus every nationwide GOLF-10 nearStation lookup, which by construction
   is always National Rail (it's a GB-wide station dataset, not a TfL one). */
const TFL_LINES=new Set(['met','jub','nor','pic','cen','dis','eli','ovg']);
function nrBadge(lineKey){
  if(lineKey!==undefined&&TFL_LINES.has(lineKey))return'';
  return ' <span title="National Rail service — not on the TfL network/Oyster cap" style="font-family:var(--font-mono);font-size:9px;background:#B5121B;color:#fff;padding:1.5px 5px;border-radius:3px;font-weight:600;letter-spacing:.03em">NR</span>';
}
/* GOLF: a small icon marker approximating the National Rail double-arrow
   roundel, placed directly at a station's coordinates — distinct from
   nrBadge() (which is text/CSS, used in labels/tooltips/popups) because
   this needs to be a real map marker, positioned exactly on the station,
   for the "nearest station" link line drawn on course selection. */
function nrRoundelIcon(size){
  size=size||24;
  return L.divIcon({className:'',iconSize:[size,size],iconAnchor:[size/2,size/2],html:
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
      <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="3" fill="#fff" stroke="#B5121B" stroke-width="1.5"/>
      <polygon points="2,6.5 9,6.5 9,3.5 17,10 9,16.5 9,13.5 2,13.5 2,11 7.5,11 7.5,9 2,9" fill="#B5121B"/>
    </svg>`});
}
function nrStationMarker(lat,lng,size){
  size=size||24;
  return L.marker([lat,lng],{interactive:true,icon:nrRoundelIcon(size)}).bindTooltip('National Rail station',{direction:'top',offset:[0,-size/2]});
}

function spline(pts,seg=14){
  if(pts.length<3)return pts;
  const p=[pts[0],...pts,pts[pts.length-1]],out=[];
  for(let i=1;i<p.length-2;i++){
    const[p0,p1,p2,p3]=[p[i-1],p[i],p[i+1],p[i+2]];
    for(let t=0;t<seg;t++){const s=t/seg,s2=s*s,s3=s2*s;
      out.push([.5*((2*p1[0])+(-p0[0]+p2[0])*s+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*s2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*s3),
                .5*((2*p1[1])+(-p0[1]+p2[1])*s+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*s2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*s3)]);}
  }
  out.push(pts[pts.length-1]);return out;
}

/* architect tagging derived from the design credit */
function archTags(s){
  const t=s.toLowerCase(),out=new Set();
  if(/colt/.test(t))out.add("colt");
  if(/braid/.test(t))out.add("braid");
  if(/mackenzie/.test(t)&&!/mackenzie ross|tom mackenzie|mackenzie\s*(&|and)\s*ebert/.test(t))out.add("mackenzie");
  if(/abercromby/.test(t))out.add("abercromby");
  if(/taylor/.test(t))out.add("taylor");
  if(/hawtree/.test(t))out.add("hawtree");
  if(/vardon/.test(t))out.add("vardon");
  if(/park jr|willie park/.test(t))out.add("park");
  if(/fowler/.test(t))out.add("fowler");
  if(/ballesteros|nicklaus|phillips|ebert|jacobs|benz|mcevoy|williams|swan/.test(t))out.add("modern");
  return out;
}

const EDITS={};
function V(i,f){return(EDITS[i]&&EDITS[i][f]!==undefined)?EDITS[i][f]:C[i][f]}
function isEdited(i){return !!EDITS[i]&&Object.keys(EDITS[i]).length>0}
/* GOLF-169: courseCurrency(i) now returns a real currency CODE
   ('GBP'/'EUR'/'ZAR'/'USD'/'AUD'/'NZD'...), never a symbol — that's the
   whole point of the ticket. A symbol alone can't tell AUD from NZD (both
   "$"), so anything that needs to bucket money by currency (js/trip-geo.js
   moneyBucket*) must key on this code, and anything that needs to *show*
   a symbol converts the code via curSym() at the point of display.
   Resolution order, most to least authoritative:
     1. feeV2.currency — a real code, populated on every researched course
        as of GOLF-171 (GOLF-120/171).
     2. courseNation(i) (js/explore.js, loads after this file but only
        called here at render time, same lazy-binding idiom as feeNum()/
        feeRangeFor below) — gb→GBP, ie→EUR, za→ZAR. Good enough for any
        course that has no feeV2 yet, with one known miss: a Northern
        Ireland course (nation 'ie', prices in £) with no feeV2 would get
        EUR here — caught by tier 3 below, which is exactly why that tier
        stays in the chain instead of being retired.
     3. The pre-GOLF-169 behaviour — sniff £/€/R out of the wd/we free
        text — kept as the final fallback for any course tier 1+2 can't
        place correctly (the NI case above).
     4. GBP, same default as before this ticket. */
const CURRENCY_SYMS={GBP:'£',EUR:'€',ZAR:'R',USD:'$',AUD:'$',NZD:'$'};
function curSym(code){return CURRENCY_SYMS[code]||code||'£';}
const NATION_CURRENCY={gb:'GBP',ie:'EUR',za:'ZAR'};
function feeCurrencyCodeFromText(s){
  if(!s)return null;
  if(/€/.test(s))return'EUR';
  if(/£/.test(s))return'GBP';
  if(/(^|\s)R\s?\d/.test(s))return'ZAR';
  return null;
}
function courseCurrency(i){
  const fv=V(i,'feeV2');
  if(fv&&fv.currency)return fv.currency;
  if(typeof courseNation==='function'){
    const n=courseNation(i);
    if(n&&NATION_CURRENCY[n])return NATION_CURRENCY[n];
  }
  return feeCurrencyCodeFromText(V(i,'wd'))||feeCurrencyCodeFromText(V(i,'we'))||'GBP';
}
/* GOLF-253 (B1): the one place money becomes text — whole units, en-GB
   thousands separator ("£3,690"). `cur` is a currency code. Every price in the app goes through here. */
function fmtMoney(v,cur='GBP'){
  if(v==null||!Number.isFinite(+v))return'—';
  return curSym(cur)+Math.round(+v).toLocaleString('en-GB');
}
/* The ceiling of a course's published green fee — the upper of the weekday
   and weekend figures. null when neither carries a number. This is the one
   source field every surface reads, so a course shows the same price in
   search, popup, shortlist and costs. */
function feeUpper(i){
  if(typeof feeRangeFor!=='function')return null;
  let m=null;
  ['wd','we'].forEach(f=>{const r=feeRangeFor(i,f);if(r&&r.max!=null&&(m==null||r.max>m))m=r.max;});
  return m;
}
/* "Up to £X" / "Price on request" / "No published fee" — plain text, caller escapes. */
function fmtGreenFee(i){
  const u=feeUpper(i);
  if(u!=null)return'Up to '+fmtMoney(u,courseCurrency(i));
  const poa=['wd','we'].some(f=>{
    const r=typeof feeRangeFor==='function'?feeRangeFor(i,f):null;
    return(r&&r.confidence==='poa')||/\b(poa|on request)\b/i.test(String(V(i,f)||''));
  });
  return poa?'Price on request':'No published fee';
}
function editCount(){return Object.keys(EDITS).filter(isEdited).length}

/* GOLF-15: two distinct personal lists, not one generic "favourites" set.
   Marking a course played clears it from "want to play" — the two are
   mutually exclusive per course, played takes precedence. */
const PLAYED=new Set(),WANT=new Set();
/* GOLF-206: both are buttons on a course's card, and neither changes the
   trip — but render() redraws the trip layer with a fit, which flew the
   camera back to the trip and took the card with it. Hold the camera, as
   adding to the trip already does (GOLF-191/185b). */
function togglePlayed(i){if(PLAYED.has(i))PLAYED.delete(i);else{PLAYED.add(i);WANT.delete(i)}saveState();mapHoldCamera(render);}
function toggleWant(i){if(WANT.has(i))WANT.delete(i);else{WANT.add(i);PLAYED.delete(i)}saveState();mapHoldCamera(render);}

/* GOLF-70: these course metrics lived beside the Explore filters until the
   split, but they are read from several modules — FEE_SLIDER_MAX
   (js/explore.js) calls feeNum() from a top-level IIFE, and the "distance"
   sort calls distOut(). They are pure functions of C/EDITS, so they
   belong here, ahead of every reader. Unchanged otherwise. */
/* GOLF-120: prefer the structured feeV2 weekday figure (its low end — the
   "from" number a visitor sorts/filters on) when the course carries one;
   fall back to the first number in the legacy wd string. feeRangeFor is
   defined later (js/trip-geo.js) but every feeNum() call fires at
   render/interaction time, well after all modules have loaded. */
function feeNum(i){
  if(typeof feeRangeFor==='function'&&C[i]&&C[i].feeV2){
    const r=feeRangeFor(i,'wd');
    if(r&&r.min!=null)return r.min;
  }
  const m=String(V(i,'wd')).match(/\d+(\.\d+)?/);return m?parseFloat(m[0]):9999;
}
/* distOut() is in degrees — only used internally to rank courses by
   straight-line distance from distOrigin() for the "distance" sort. GOLF-123
   removed the user-facing "X mi from home, as the crow flies" row from the
   card and popup (a raw great-circle figure from a hard-coded home point
   was meaningless), so there is no longer a distMiles() miles conversion. */
/* GOLF-254: measured from the trip's start point when it has one, else the
   map centre (there is no fixed "home" any more). */
function distOrigin(){
  const p=typeof tripEndpointPoint==='function'&&typeof tripStart!=='undefined'?tripEndpointPoint(tripStart):null;
  if(p)return[p.lat,p.lng];
  const c=typeof map!=='undefined'&&map.getCenter?map.getCenter():null;
  return c?[c.lat,c.lng]:[54.5,-3];
}
function distOut(i,o){o=o||distOrigin();const dy=C[i].lat-o[0],dx=(C[i].lng-o[1])*Math.cos(o[0]*Math.PI/180);return Math.hypot(dy,dx)}
// GOLF-160 (DEC-038): "Sort: top courses first". Was rankNum(), ordering by
// the t100 positions (GOLF-81); those are top100golfcourses.com's and are
// gone from the data, so notable courses come first and the caller
// tiebreaks by name.
function notableFirst(a,b){return(C[b].notable?1:0)-(C[a].notable?1:0)}
