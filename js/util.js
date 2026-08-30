/* ============================================================
   js/util.js — shared primitives used across the whole app: the
   golf-flag marker SVG, the derived station index (STN/STN_LINES),
   National Rail badge/roundel helpers, rail spline smoothing,
   architect tagging, the EDITS correction overlay and the
   played/want lists.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
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
/* Currency correctness: every course's wd/we fee text already carries its
   own correct national symbol at data-entry time (£ for GB/NI, € for the
   Republic of Ireland, R for South Africa) — so rather than maintaining a
   second region→currency map that can drift from the data, the symbol is
   read straight back out of that text. Falls back to £ (by far the most
   common case) when neither fee field has a recognisable symbol. */
function feeCurrencySym(s){
  if(!s)return null;
  if(/€/.test(s))return'€';
  if(/£/.test(s))return'£';
  if(/(^|\s)R\s?\d/.test(s))return'R';
  return null;
}
function courseCurrency(i){
  return feeCurrencySym(V(i,'wd'))||feeCurrencySym(V(i,'we'))||'£';
}
function editCount(){return Object.keys(EDITS).filter(isEdited).length}

/* GOLF-15: two distinct personal lists, not one generic "favourites" set.
   Marking a course played clears it from "want to play" — the two are
   mutually exclusive per course, played takes precedence. */
const PLAYED=new Set(),WANT=new Set();
function togglePlayed(i){if(PLAYED.has(i))PLAYED.delete(i);else{PLAYED.add(i);WANT.delete(i)}saveState();render();}
function toggleWant(i){if(WANT.has(i))WANT.delete(i);else{WANT.add(i);PLAYED.delete(i)}saveState();render();}

/* GOLF-70: these four course metrics lived beside the Explore filters until
   the split, but they are read from three different modules — popupHTML()
   (js/map.js) calls distMiles() while it builds the marker popups at load
   time, and FEE_SLIDER_MAX (js/explore.js) calls feeNum() from a top-level
   IIFE. They are pure functions of C/EDITS/HOME, so they belong here, ahead
   of every reader. Unchanged otherwise. */
function feeNum(i){const m=String(V(i,'wd')).match(/\d+(\.\d+)?/);return m?parseFloat(m[0]):9999}
function distOut(i){const dy=C[i].lat-HOME[0],dx=(C[i].lng-HOME[1])*Math.cos(HOME[0]*Math.PI/180);return Math.hypot(dy,dx)}
/* GOLF-16: distOut() is in degrees (used internally for sorting); miles
   at ~69 mi/degree latitude is accurate enough for a labelled "as the
   crow flies" stat, not for anything requiring real precision. */
function distMiles(i){return Math.round(distOut(i)*69)}
function rankNum(i){const t=C[i].t100;if(!t)return 9999;if(typeof t.gl==='number')return t.gl;if(t.gbi)return t.gbi/20;return 500}
