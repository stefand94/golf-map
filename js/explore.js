/* ============================================================
   js/explore.js — the Explore page: filter chips, the fee-range
   control, place + course search, sorting/filtering/fuzzy matching,
   the nearest-to-trip list, and render().

   Loaded as a plain <script> (not a module) in the fixed order
   listed in index.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* GOLF-81: which of the three nations a course belongs to, derived from
   the existing topIreland/topSouthAfrica flags rather than a new field —
   every course without either flag is Great Britain (England/Scotland/
   Wales, which already share one map and one set of regions). */
function courseNation(i){const c=C[i];return c.topIreland?'ie':c.topSouthAfrica?'za':'gb'}
/* GOLF-121d: the South Africa map is ringfenced to the top-100 (the union
   of satop100courses.com's "Top 100 by ranking" and Top100GolfCourses.com's
   South Africa list). GOLF-121a's bulk pull left ~320 extra SA clubs in
   data/courses-southafrica.js — they stay in the file (recoverable, and
   ready for a future "show all" toggle) but only entries carrying
   `zaRanked:1` surface on the map. Non-ZA nations are unaffected. */
/* GOLF-198: `dupOf` marks the redundant half of a course that was in the
   data twice — never shown, its references resolve to the kept record
   (js/course-id.js). Everything that lists courses funnels through here. */
function courseShownOnMap(i){return!C[i].dupOf&&!(courseNation(i)==='za'&&!C[i].zaRanked);}
const NATIONS=[['gb','Great Britain'],['ie','Ireland'],['za','South Africa']];
/* GOLF-69 (item 2): the green-fee range control. Bounds come from the data
   itself (rounded out to a tidy £25) rather than a hardcoded ceiling, so
   the slider still spans the real spread if the dataset grows a pricier
   course later. A thumb parked at either extreme means "no bound on this
   end" (state stays null) — otherwise dragging max to the top would
   silently exclude every unpriced course. */
/* Scaled to the 95th percentile, not the absolute maximum: one £1,150
   championship green fee would otherwise squash every ordinary course into
   the leftmost 10% of the track, where a £10 difference is sub-pixel. The
   top of the slider therefore means "and up" (the bound goes null), so
   nothing is ever hidden by the scale — the readout shows "£N+" to say so.
   Typing a number above the top of the scale in the max box lands on that
   same unbounded top: broader than asked for, never narrower, so it can't
   silently hide a course that matched. */
const FEE_SLIDER_MAX=(()=>{
  const fees=C.map((c,i)=>feeNum(i)).filter(f=>f<9999).sort((a,b)=>a-b);
  if(!fees.length)return 300;
  return Math.max(50,Math.ceil(fees[Math.floor(fees.length*0.95)]/25)*25);
})();
/* GOLF-75: the four fixed price bands are back — as quick-select shortcuts
   ON TOP of the range slider, not as a second filter system. Ranges are the
   original BANDS definitions from data/config.js (≤£30 / £31–70 / £71–150 /
   £151+), and clicking one simply calls feeRangeSet() with that range, so
   there is exactly one underlying piece of filter state (feeMin/feeMax) and
   the slider and chips can never disagree. A chip highlights when the
   current range is exactly its range; dragging the slider off it clears the
   highlight. state.price stays unused — the old Set-based band filtering is
   deliberately not resurrected. */
const FEE_BANDS=[
  ['low','≤ £30',null,30],
  ['mid','£31–70',31,70],
  ['high','£71–150',71,150],
  ['premium','£151+',151,null]
];
/* Compare against the SAME normalisation feeRangeSet() applies (0 -> null at
   the bottom, the slider ceiling -> null at the top) so "is this band active?"
   asks the question in the stored vocabulary, not the chip's. */
function feeBandNorm(lo,hi){
  const l=lo==null?0:lo,h=hi==null?FEE_SLIDER_MAX:Math.min(hi,FEE_SLIDER_MAX);
  return[l<=0?null:l,h>=FEE_SLIDER_MAX?null:h];
}
function feeBandActive(lo,hi){
  const[nl,nh]=feeBandNorm(lo,hi);
  return state.feeMin===nl&&state.feeMax===nh;
}
function feeBandApply(key){
  const b=FEE_BANDS.find(x=>x[0]===key);if(!b)return;
  const[,,lo,hi]=b;
  // Clicking the already-active band clears back to "any price".
  if(feeBandActive(lo,hi)){feeRangeSet(0,FEE_SLIDER_MAX);return;}
  feeRangeSet(lo==null?0:lo,hi==null?FEE_SLIDER_MAX:hi);
}
/* Takes the two raw numbers, keeps them in order, and normalises an
   at-the-extreme value back to null ("unbounded"). */
function feeRangeSet(lo,hi){
  lo=Math.max(0,Math.min(FEE_SLIDER_MAX,isFinite(lo)?lo:0));
  hi=Math.max(0,Math.min(FEE_SLIDER_MAX,isFinite(hi)?hi:FEE_SLIDER_MAX));
  if(lo>hi){const t=lo;lo=hi;hi=t;}
  state.feeMin=lo<=0?null:lo;
  state.feeMax=hi>=FEE_SLIDER_MAX?null:hi;
  saveState();render();
}
/* GOLF-84: map the selected Explore country pill onto the Worker's
   ISO3 geocode-boundary vocabulary, so a place search made while
   browsing e.g. South Africa doesn't surface a same-named GB/Ireland
   place (the reported "Newcastle" collision). No pill selected -> no
   country -> unrestricted, matching pre-GOLF-84 behavior. */
function exploreCountryCode(){
  return state.nation==='gb'?'GBR':state.nation==='ie'?'IRL':state.nation==='za'?'ZAF':null;
}
/* GOLF-84: a pan or zoom fires moveend/zoomend in bursts, and saveState()
   serialises the whole state blob to localStorage each time. The view is
   only a convenience to restore, so coalesce the writes. */
/* GOLF-184: don't persist a view the map was never really showing. While
   #map is display:none on mobile its Leaflet size is {x:375, y:0}, and any
   camera move computed against that box is meaningless — saving it made
   the bad zoom outlive the page load. mapHasSize() is always true on
   desktop and once the mobile map has been revealed, so normal pans and
   zooms are saved exactly as before. */
let _viewSaveTimer=null;
map.on('moveend zoomend',()=>{
  if(typeof mapHasSize==='function'&&!mapHasSize())return;
  clearTimeout(_viewSaveTimer);
  _viewSaveTimer=setTimeout(saveState,400);
});
/* GOLF-70: feeNum/distOut/notableFirst moved to js/util.js — they are shared
   course metrics, not Explore-only ones, and js/util.js is evaluated ahead
   of every reader. See the note at the top of js/util.js. */
/* GOLF-185d: the filter predicates on their own — everything passes()
   asks EXCEPT the nation gate and this page's own search box. Split out
   so the map (passes), the Discover lists (tbNationFilter) and the
   unified search (tbCourseOfferable) all ask one question, which is the
   "the map and the lists always agree" acceptance criterion. */
function courseFilterPasses(i){const c=C[i];
  if(state.access.size&&!state.access.has(V(i,'a')))return false;
  /* GOLF-69 (item 2): the four fixed BANDS chips became a real min/max
     range. A course whose weekday fee doesn't parse to a number (feeNum
     returns its 9999 sentinel — "POA", "members only", blank) can't be
     compared against a range, so it passes while the range is untouched
     and drops out the moment a bound is set. Stating a price ceiling and
     still being shown unpriced courses would be the more surprising
     behaviour of the two. */
  if(state.feeMin!=null||state.feeMax!=null){
    const f=feeNum(i);
    if(f>=9999)return false;
    if(state.feeMin!=null&&f<state.feeMin)return false;
    if(state.feeMax!=null&&f>state.feeMax)return false;
  }
  if(state.region.size&&!state.region.has(c.r))return false;
  if(state.arch.size){const tags=archTags(V(i,'arch'));if(![...state.arch].some(a=>tags.has(a)))return false}
  if(state.flag.has('ranked')&&!ranked(i))return false;
  if(state.flag.has('weekend')&&/members only|closed|restricted/i.test(V(i,'we')))return false;
  if(state.flag.has('walk')&&!/walk|minute/i.test(V(i,'walk')))return false;
  if(state.flag.has('winter')&&!c.winter)return false;
  if(state.flag.has('sweep')&&!c.sweep)return false;
  if(state.flag.has('top100')&&!c.top100)return false;
  if(state.flag.has('topScot')&&!c.topScot)return false;
  if(state.flag.has('topWales')&&!c.topWales)return false;
  if(state.flag.has('topIreland')&&!c.topIreland)return false;
  if(state.flag.has('topSouthAfrica')&&!c.topSouthAfrica)return false;
  if(state.flag.has('edited')&&!isEdited(i))return false;
  if(state.flag.has('played')&&!PLAYED.has(i))return false;
  if(state.flag.has('want')&&!WANT.has(i))return false;
  return true}
function passes(i){
  // GOLF-81: nothing passes — map and list both stay empty — until a
  // country pill has been picked.
  if(!state.nation||courseNation(i)!==state.nation)return false;
  if(!courseShownOnMap(i))return false; // GOLF-121d: SA ringfenced to the top-100
  if(!courseFilterPasses(i))return false;
  return true}

/* GOLF-20: exact substring match stays the primary, fast path (unchanged
   behavior for anyone typing something that actually appears verbatim).
   Fuzzy only kicks in as a fallback so a typo doesn't return zero results
   — checked word-by-word against the searchable text, not as one long
   Levenshtein diff against the whole blob, so "Sunningdle" still finds
   "Sunningdale" inside a longer name/note without needing the whole
   string to nearly match. */
function levenshtein(a,b){
  const m=a.length,n=b.length;
  if(!m)return n;if(!n)return m;
  let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j]=a[i-1]===b[j-1]?prev[j-1]:1+Math.min(prev[j-1],prev[j],cur[j-1]);
    }
    prev=cur;
  }
  return prev[n];
}
function searchMatches(i,q){
  const c=C[i],s=V(i,'stn')||'';
  const text=(V(i,'n')+' '+c.r+' '+V(i,'arch')+' '+V(i,'note')+' '+V(i,'walk')+' '+s).toLowerCase();
  if(text.includes(q))return true;
  if(q.length<3)return false; // too short for fuzzy to mean anything, avoid noisy matches
  const threshold=q.length<=5?1:2;
  return text.split(/\W+/).some(word=>word.length>=q.length-threshold&&levenshtein(q,word)<=threshold);
}
/* Pin-click callers (map.js, trip-geo.js, trip-route.js) still call this; the
   Explore card list it used to highlight is gone (GOLF-252). */
function highlight(i){}

function render(){
  const openCourse=mapOpenCourse(); // GOLF-201: both layer rebuilds below close it
  /* GOLF-31: single hook point — every existing render() call site
     (filter chips, played/want/trip toggles, corrections save, reset,
     wipeStoredState) keeps the Trip Builder pane and the mast's cart-count
     badge in sync for free. */
  /* The masthead's #trip-badge (and its "Plan a trip" button) were removed
     along with Explore mode — there's no button left to badge. Guard the
     lookup rather than deleting it outright, so this doesn't throw and
     abort render() if that DOM ever comes back. */
  const tripBadgeEl=document.getElementById('trip-badge');
  if(tripBadgeEl)tripBadgeEl.textContent=TRIP.size?String(TRIP.size):'';
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
  tbHotelLayerRefreshTint(); // GOLF-142: flip a hotel pin white<->yellow the instant trip membership changes
  layer.clearLayers();
  /* Map-clutter fix: with all 326 course markers still clustering
     underneath it, the Trip Builder route got lost in whichever dense
     area (usually London) happened to be on screen, regardless of where
     the trip actually was. The pane already replaces the filter/course
     list entirely — the full marker layer is redundant screen noise
     while it's open, so skip populating it and let tripLayer (the
     cart/discovery markers) be the only thing on the map. Filters/list
     stay untouched underneath, ready the moment Trip Builder exits.
     Bug fix (2026-09-01): that decluttering used to apply unconditionally,
     so the instant a trip's last course was removed (nothing left in
     TRIP/tripDays, and no anchor for Discover to suggest around) the map
     went completely blank — no cart route, no discovery dots, and no
     course layer either. Only skip the full layer when tbDrawMap() above
     actually put something on tripLayer to declutter for; an empty trip
     falls through and shows the normal filtered course layer instead of
     nothing. */
  /* GOLF-108: Discover (Plan mode) always shows the full filtered course
     layer, trip or no trip — the "what golf is near here" value must not
     vanish the moment a trip exists. Build mode keeps the 2026-09-01
     declutter: the Itinerary tab draws only a bounded "nearby" set on
     tripLayer (tbDrawMap(), gated by the "Nearby courses" toggle) and the
     Costs tab draws just the route. The bgCoursePins pane (js/map.js)
     keeps the route/stop markers on top in Discover. */
  if(tripBuilderOn&&appMode!=='plan'&&tripLayer.getLayers().length){mapReopenCourse(openCourse);return;}
  let shown=C.map((c,i)=>i).filter(passes);
  const SORT_ORIGIN=distOrigin();
  const S_={region:(a,b)=>REGIONS.indexOf(C[a].r)-REGIONS.indexOf(C[b].r)||feeNum(a)-feeNum(b),
    fee:(a,b)=>feeNum(a)-feeNum(b),rank:(a,b)=>notableFirst(a,b)||V(a,'n').localeCompare(V(b,'n')),
    dist:(a,b)=>distOut(a,SORT_ORIGIN)-distOut(b,SORT_ORIGIN),name:(a,b)=>V(a,'n').localeCompare(V(b,'n'))};
  shown.sort(S_[state.sort]);
  // The popup/tooltip content is bound lazily (function form, js/map.js),
  // so it is regenerated from current state on every open — there is
  // nothing to pre-set here. The icon still has to be refreshed: pinFor()
  // depends on the filter/ranking state this render just recomputed.
  shown.forEach(i=>{
    /* GOLF-122: a course tbDrawMap() already drew on tripLayer (trip stop,
       discovery candidate or anchor) must not also be added to the
       background cluster layer — that's the "two pins, one course"
       report. tripDrawnCourses is rebuilt by the tbDrawMap() call above. */
    if(tripBuilderOn&&typeof tripDrawnCourses!=='undefined'&&tripDrawnCourses.has(i))return;
    markers.get(i).setIcon(pinFor(i));layer.addLayer(markers.get(i));
  });
  /* One exception to the above: an *already open* popup does need a nudge.
     togglePlayed()/toggleWant()/toggleTrip() and saveEdit() are all
     reachable from inside an open popup and all call render(), and the
     popup's own buttons/badges have to change under the click. update()
     re-runs the bound content function, so the open popup redraws from
     current state — exactly what the old blanket setPopupContent() loop
     achieved for all 557 markers, now done for the one that needs it. */
  mapReopenCourse(openCourse);
  refreshOpenCoursePopup();
}
