/* ============================================================
   js/hotel-layer.js — GOLF-142: ambient "Show hotels" map layer.

   A live per-viewport Overpass query (Worker mode:'hotelsViewport',
   scripts/cloudflare-worker/ors-proxy.js), distinct from GOLF-96's
   point-based "add a stay" picker (js/ors.js's tbHotelsFor() /
   js/trip-route.js's tbDrawHotelCandidates()), which this file does not
   touch — that picker's own Worker mode ('hotels') is untouched too.

   Off by default, not persisted (a browsing-mode preference, not trip
   data — GOLF-142 requirement 5), matching tbShowNearby's precedent in
   js/trip-ui.js and GOLF-207's POI layer in js/poi.js.

   Loaded as a plain <script> (not a module) after js/map.js (needs the
   global `map`) and js/ors.js (needs `ORS_PROXY_URL`, `esc`), before
   js/trip-ui.js (renders the toggle control and wires its click
   handler to tbToggleHotelLayer()).
   ============================================================ */

let tbHotelLayerOn=false;

/* GOLF-108's railWeight()/stnRadius() zoom-step pattern (js/map.js:89-90)
   applied here: below this zoom a viewport bbox query would (a) be
   pointless — too zoomed out for individual hotel pins to read against
   everything else on the map — and (b) risk a large-area Overpass query,
   which the fair-use constraint in CLAUDE.md/DEC-016 flags as worth
   staying conservative about. 13 was picked by testing in-browser
   against both a dense city (central London) and a remote links course
   (Machrihanish): at 13 a single screen already covers roughly a whole
   town — wide enough to be useful, not so wide the result set turns into
   clutter or a heavy query. The Worker also defensively caps the bbox
   span server-side (MAX_SPAN_DEG) so a stale/bad client can't bypass
   this and ask for an entire region in one request. */
const HOTEL_LAYER_MIN_ZOOM=13;

/* Re-fetch debounce on pan/zoom — matches GOLF-131's nearby-courses
   listener (js/trip-route.js:676, 300ms), which already tuned this exact
   rapid-pan/zoom tradeoff for this app; kept in step rather than picking
   a new number for a very similar live-viewport-redraw feature. Doubly
   relevant here given Overpass's fair-use limits (see CLAUDE.md/DEC-016) —
   this interval intentionally isn't tightened further. */
const HOTEL_LAYER_DEBOUNCE_MS=300;

const hotelLayerGroup=L.layerGroup();
let _hotelLayerTimer=null;
/* Last-rendered POI list, so tbHotelLayerRefreshTint() can redraw with an
   up-to-date yellow/white circle the instant the trip changes, without
   spending another Overpass call just to recheck colours. */
let _hotelLayerLastPois=[];
/* GOLF-144: monotonic sequence stamped on each fetch. Two guards use it:

   _hotelLayerSeq       — id of the most recently *started* fetch.
   _hotelLayerDrawnSeq  — id of the most recently *rendered* response.

   The original GOLF-142 rule was strict equality (drop anything whose token
   isn't the current one), which is correct but far too eager against a slow
   upstream: measured live, an Overpass viewport query takes ~17s, so any pan
   during those 17s threw the result away and restarted the wait. In practice
   the race was never won and pins never appeared. Now a late response is
   still drawn as long as (a) nothing newer has already been drawn, and
   (b) the area it covers still overlaps what the user is looking at — see
   tbHotelLayerFetch(). Ordering is preserved without discarding useful work.
   The "toggled off mid-fetch must not render afterward" case from the
   handover doc is covered explicitly by the tbHotelLayerOn check instead. */
let _hotelLayerSeq=0;
let _hotelLayerDrawnSeq=0;
/* How many requests are currently in flight, so the spinner stays up while
   any of them could still deliver, and only clears when none can. */
let _hotelLayerInflight=0;

/* Hard ceiling on a single Overpass round-trip. Above this we stop waiting
   and say so rather than spinning forever — the upstream returned a 521 on
   one of three live attempts during GOLF-144 triage, and a hung fetch is
   indistinguishable from the silent failure this ticket exists to remove. */
const HOTEL_LAYER_TIMEOUT_MS=25000;

/* ── GOLF-147: client-side viewport cache.

   GOLF-146 put a cache at the edge, which removed the Overpass round trip
   but still leaves every pan paying a full request to the Worker before a
   single pin can be drawn. Panning back to a town you just looked at is the
   single most common interaction in this layer and it should cost nothing
   at all, so the browser keeps its own copy too.

   The grid MUST stay in step with POI_CACHE_GRID in
   scripts/cloudflare-worker/ors-proxy.js. Snapping here rather than sending
   the raw viewport does double duty: it gives this cache a key that survives
   sub-cell panning, and it means every client looking at the same town sends
   the Worker a byte-identical bbox, so they all collide on one edge-cache
   entry instead of each minting their own. Snapping outward (floor the
   south/west corner, ceil the north/east) keeps the cached area a superset
   of what was asked for, so a hit is never missing pins at the edges.

   In-memory only, deliberately: this is browsing state, not trip data, and
   CLAUDE.md reserves localStorage for the latter. A reload starting cold is
   fine — the edge cache still makes that fast. */
const HOTEL_CACHE_GRID=0.01;
const HOTEL_CACHE_MAX=60; // ~60 viewports; bounded so a long pan can't grow forever
const _hotelCache=new Map();

function tbHotelSnapBbox(bb){
  const g=HOTEL_CACHE_GRID;
  return [Math.floor(bb[0]/g)*g,Math.floor(bb[1]/g)*g,
          Math.ceil(bb[2]/g)*g,Math.ceil(bb[3]/g)*g].map(v=>Number(v.toFixed(4)));
}

function tbHotelCacheGet(key){
  if(!_hotelCache.has(key))return null;
  // Re-insert so the Map's insertion order doubles as LRU recency.
  const v=_hotelCache.get(key);
  _hotelCache.delete(key);_hotelCache.set(key,v);
  return v;
}

/* Must match `out center N` in the Worker's handleHotelsViewport(). */
const HOTEL_RESULT_CAP=80;

/* A viewport that sits entirely inside one we've already fetched needs no
   request of its own — zooming in, and any window/pane resize at the same
   zoom, both land here. Extra pins outside the current view are harmless
   (Leaflet simply draws them off-screen) and mean the next zoom-out is
   instant too.

   The truncation guard is the important part: Overpass caps the result set,
   so a capped-out answer for a wide area may have dropped pins that a
   query for a smaller area inside it would have returned. Reusing a
   saturated entry would therefore silently show fewer hotels the further
   you zoom in — exactly backwards. Those entries are skipped and re-fetched.

   Linear scan, bounded by HOTEL_CACHE_MAX (60) and only on a miss. */
function tbHotelCacheCovering(bbox){
  for(const [k,v] of _hotelCache){
    if(v.length>=HOTEL_RESULT_CAP)continue;
    const c=k.split(',').map(Number);
    if(c[0]<=bbox[0]&&c[1]<=bbox[1]&&c[2]>=bbox[2]&&c[3]>=bbox[3])return v;
  }
  return null;
}

function tbHotelCachePut(key,pois){
  _hotelCache.delete(key);
  _hotelCache.set(key,pois);
  while(_hotelCache.size>HOTEL_CACHE_MAX)_hotelCache.delete(_hotelCache.keys().next().value);
}

function tbHotelLayerClear(){
  hotelLayerGroup.clearLayers();
  _hotelLayerLastPois=[];
  if(map.hasLayer(hotelLayerGroup))map.removeLayer(hotelLayerGroup);
}

/* ── GOLF-144: visible state for a layer that can legitimately draw nothing.

   Every no-pins outcome below used to be silent, which is why "Show hotels"
   read as dead: the button went active, and the map never changed whether
   you were zoomed too far out, waiting on a 17-second query, or hitting an
   upstream that was down. One pill, appended to the Leaflet container so it
   tracks the map rather than the pane, says which of those is happening. */
let _hotelStatusEl=null;
function tbHotelStatusEl(){
  if(_hotelStatusEl)return _hotelStatusEl;
  _hotelStatusEl=document.createElement('div');
  _hotelStatusEl.className='hotel-status';
  _hotelStatusEl.id='hotel-status';
  /* Announced politely: the pin count changing is a background update, not
     something that should interrupt whatever a screen reader is reading. */
  _hotelStatusEl.setAttribute('role','status');
  _hotelStatusEl.setAttribute('aria-live','polite');
  _hotelStatusEl.hidden=true;
  map.getContainer().appendChild(_hotelStatusEl);
  return _hotelStatusEl;
}
/* GOLF-217: px from the map's top edge to the first free row. On a phone
   the search bar floats over the top of the map, and a pill at top:12px
   sat underneath it where nobody could read it. */
function tbMapTopInset(){
  if(typeof mobIsPhone==='function'&&mobIsPhone()&&typeof mobSheetTops==='function'){
    const t=mobSheetTops().topBar-map.getContainer().getBoundingClientRect().top;
    return Math.max(12,Math.round(t)+8);
  }
  return 12;
}

/* kind: 'loading' | 'info' | 'error' | null (null hides the pill). */
function tbHotelLayerStatus(kind,text){
  const el=tbHotelStatusEl();
  if(!kind){el.hidden=true;el.textContent='';return;}
  el.hidden=false;
  el.style.top=tbMapTopInset()+'px';
  el.classList.toggle('is-error',kind==='error');
  // esc() the message even though every caller passes a literal — keeps the
  // one innerHTML in this file safe if a future caller ever interpolates.
  el.innerHTML=(kind==='loading'?'<span class="spin"></span>':'')+`<span>${esc(text)}</span>`;
}

/* Matches a viewport POI against the current trip's already-added stays.
   GOLF-96's picker (js/ors.js tbPickHotelCandidate()) writes a hotel
   item's lat/lng straight from the Overpass node it was picked from, so
   an exact (epsilon-guarded for float noise) match against that same
   node's coordinates here is reliable — no separate id to carry through. */
const HOTEL_MATCH_EPS=1e-5;
function tbHotelInTrip(p){
  return tripDays.some(d=>(d.items||[]).some(it=>
    it.type==='hotel'&&typeof it.lat==='number'&&typeof it.lng==='number'&&
    Math.abs(it.lat-p.lat)<HOTEL_MATCH_EPS&&Math.abs(it.lng-p.lng)<HOTEL_MATCH_EPS));
}

const HOTEL_LAYER_ICON_SIZE=22;
function hotelLayerIcon(tint){
  const size=HOTEL_LAYER_ICON_SIZE,h=size*1.5;
  return L.divIcon({className:'',html:hotelPinSVG(size,{tint}),
    iconSize:[size,h],iconAnchor:[size*0.5,h],popupAnchor:[0,-h+2],tooltipAnchor:[0,-h+2]});
}

/* ── GOLF-145: popup that turns a browsed pin into an itinerary stay.

   GOLF-96's picker starts from a day ("add a stay" on day N, then choose
   from nearby hotels), so its dayId is implied by where you clicked. This
   layer is the other direction — you're browsing the map and find somewhere
   you like — so the day has to be chosen here. Hence the <select>: it's the
   one fact the pin itself can't supply, and guessing it (first empty day,
   say) silently attaches stays to the wrong day when days are filled out of
   order. Nights default to 1 and price is left blank; both are editable on
   the itinerary row afterward via tripDayUpdateStop(), so the popup stays a
   one-click action rather than a second form. */
function tbHotelPopupHTML(idx){
  const p=_hotelLayerLastPois[idx];
  if(!p)return'';
  const head=`<div class="hotel-pop-name">🏨 ${esc(p.name)}</div>`+
    (p.category?`<div class="hotel-pop-cat">${esc(p.category)}</div>`:'');
  if(tbHotelInTrip(p))
    return `<div class="hotel-pop">${head}<p class="hotel-pop-note">✓ Already in your trip</p></div>`;
  if(!tripDays.length)
    return `<div class="hotel-pop">${head}<p class="hotel-pop-note">Add a day to your trip first, then pick a hotel.</p></div>`;
  /* GOLF-218: "Add a stay" on Day N is the visitor saying which day they
     are shopping for, so a pin picked while that picker is open starts on
     Day N (still changeable). With no picker open it starts on Day 1. */
  const want=typeof tbHotelPickerFor!=='undefined'?tbHotelPickerFor:null;
  const opts=tripDays.map((d,i)=>{
    const place=d.place?' — '+esc(d.place):'';
    return `<option value="${d.id}"${d.id===want?' selected':''}>Day ${i+1}${place}</option>`;
  }).join('');
  return `<div class="hotel-pop">${head}
    <label class="hotel-pop-row"><span>Add to</span>
      <select id="hotel-pop-day" class="hotel-pop-select">${opts}</select></label>
    <button type="button" class="tb-btn is-primary is-sm hotel-pop-add"
      onclick="tbHotelLayerAddToDay(${idx})">＋ Add to trip</button></div>`;
}

/* Commits straight to the day rather than prefilling tbAddStop the way
   tbPickHotelCandidate() does: the popup has already collected the only
   thing that form would ask for that the pin doesn't know (the day), so a
   confirm step here would be a second click for no extra information. The
   pin flipping white->yellow via render()'s tbHotelLayerRefreshTint() hook
   is the confirmation. */
function tbHotelLayerAddToDay(idx){
  const p=_hotelLayerLastPois[idx];
  if(!p)return;
  const sel=document.getElementById('hotel-pop-day');
  const dayId=sel?Number(sel.value):NaN;
  if(!isFinite(dayId))return;
  /* GOLF-197: the same swap rule as the picker list (tbAddHotelCandidate,
     js/ors.js). Only that path had it, so "Change" followed by picking a
     hotel off the map added a second hotel to the day instead of
     replacing the first — against DEC-028 186(b), and the source of the
     day-with-two-hotels report. tripDayUpdateStop() carries the change
     across every night of a multi-night booking. */
  const d=tripDays.find(x=>x.id===dayId);
  const cur=d&&typeof tripDayStay==='function'?tripDayStay(d):null;
  if(cur){
    if(!tripDayUpdateStop(dayId,cur.id,{name:p.name,price:cur.price,lat:p.lat,lng:p.lng}))return;
  }else if(!tripDayAddStop(dayId,'hotel',p.name,null,p.lat,p.lng,1))return;
  /* Picking off the map is also an answer to an open picker — added or
     swapped alike (GOLF-218 d: the day context ends here, so a later
     toolbar browse doesn't silently target this day). */
  if(typeof tbHotelPickerFor!=='undefined'&&tbHotelPickerFor===dayId){
    tbHotelPickerFor=null;
    if(typeof tbAddStop!=='undefined'&&tbAddStop&&tbAddStop.dayId===dayId&&tbAddStop.type==='hotel')tbAddStop=null;
  }
  map.closePopup();
  render(); // repaints the itinerary and re-tints this pin yellow
  if(typeof mapFitDay==='function')mapFitDay(dayId); // GOLF-191 (AC 2): keep the new stop and the rest of its day in view
}

function tbHotelLayerRender(pois){
  _hotelLayerLastPois=pois;
  hotelLayerGroup.clearLayers();
  /* GOLF-217: while the picker is open its numbered pins already mark the
     day's own hotels; a second, plain pin under each would just be noise. */
  const numbered=_hotelSearchFor!=null&&typeof tbHotelCandidates==='function'
    ?(tbHotelCandidates(tripDays.find(d=>d.id===_hotelSearchFor)||{})||[]):[];
  pois.forEach((p,idx)=>{
    if(numbered.some(c=>Math.abs(c.lat-p.lat)<HOTEL_MATCH_EPS&&Math.abs(c.lng-p.lng)<HOTEL_MATCH_EPS))return;
    // p.name/p.category come straight from Overpass — escape both, same
    // as tbDrawPois()/tbDrawHotelCandidates() already do.
    L.marker([p.lat,p.lng],{icon:hotelLayerIcon(tbHotelInTrip(p))})
      .bindTooltip(p.category?`🏨 ${esc(p.name)} — ${esc(p.category)}`:`🏨 ${esc(p.name)}`,{direction:'top'})
      /* Built on open, not up front: the day list and the already-in-trip
         state both go stale as soon as the trip changes, and rebuilding 37
         popups on every render would be wasted work when at most one is
         ever on screen. */
      .bindPopup(()=>tbHotelPopupHTML(idx),{minWidth:210,closeButton:true})
      .addTo(hotelLayerGroup);
  });
  if(!map.hasLayer(hotelLayerGroup))hotelLayerGroup.addTo(map);
}

/* Called from render()'s single hook point (js/explore.js) on every trip
   mutation, so a hotel's circle flips white<->yellow the instant it's
   added to/removed from the trip, without waiting for the next pan/zoom
   to re-fetch. Redraws from the cached last fetch — no network call. */
function tbHotelLayerRefreshTint(){
  tbHotelSearchSync(); // GOLF-217: render() is also where a picker closes
  if(!tbHotelLayerLive()||!_hotelLayerLastPois.length)return;
  tbHotelLayerRender(_hotelLayerLastPois);
}

function tbHotelLayerFetch(){
  if(!tbHotelLayerLive())return;
  if(!ORS_PROXY_URL){tbHotelLayerStatus('error','Hotels unavailable');return;}
  /* Below the min zoom, say so instead of clearing in silence. This is the
     single most common way the layer looked broken: the app opens at zoom 5,
     so switching hotels on from the default view did nothing at all and gave
     no reason why. The threshold itself is unchanged (see HOTEL_LAYER_MIN_ZOOM) —
     widening it would only make an already-slow Overpass query slower. */
  if(map.getZoom()<tbHotelMinZoom()){
    tbHotelLayerClear();
    tbHotelLayerStatus('info','Zoom in to see hotels');
    return;
  }
  const reqBounds=map.getBounds();
  const bbox=tbHotelSnapBbox([reqBounds.getSouth(),reqBounds.getWest(),
                              reqBounds.getNorth(),reqBounds.getEast()]);
  const cacheKey=bbox.join(',');

  /* Served from memory: no request, no spinner, no perceptible delay. Still
     takes a sequence number and marks it drawn, so an older request that is
     somehow still in flight can't come back and paint over this. */
  const cached=tbHotelCacheGet(cacheKey)||tbHotelCacheCovering(bbox);
  if(cached){
    _hotelLayerDrawnSeq=++_hotelLayerSeq;
    tbHotelLayerRender(cached);
    tbHotelLayerStatus(cached.length?null:'info','No hotels found here');
    tbHotelSearchLoaded(bbox);
    return;
  }

  const seq=++_hotelLayerSeq;

  _hotelLayerInflight++;
  tbHotelLayerStatus('loading','Finding hotels…');
  tbHotelSearchBtn(null);

  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),HOTEL_LAYER_TIMEOUT_MS);

  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'hotelsViewport',bbox}),signal:ctl.signal})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(!data||!Array.isArray(data.pois))return;
      /* Cached before the draw guards, not after: a response can be correct
         for its cell and still not worth drawing right now (the user moved
         on). Throwing it away would mean re-fetching it the moment they pan
         back — which is exactly the case this cache exists for. */
      tbHotelCachePut(cacheKey,data.pois);
      if(!tbHotelLayerLive())return;             // switched off (or picker closed) while in flight
      if(seq<=_hotelLayerDrawnSeq)return;        // a newer response already drew
      if(map.getZoom()<tbHotelMinZoom())return; // zoomed back out meanwhile
      /* The GOLF-142 rule dropped this response the moment the viewport moved
         at all. Against a ~17s upstream that discarded nearly every result.
         Overlap is the question that actually matters: if any part of the area
         we asked about is still on screen, these pins are worth drawing. */
      if(!map.getBounds().intersects(reqBounds))return;
      _hotelLayerDrawnSeq=seq;
      tbHotelLayerRender(data.pois);
      tbHotelLayerStatus(data.pois.length?null:'info','No hotels found here');
      tbHotelSearchLoaded(bbox);
    })
    .catch(err=>{
      /* Deliberately louder than tbHotelsFor()'s fail-quiet
         contract: those decorate a map the user is already looking at, whereas
         this layer's entire output is the pins, so swallowing the error leaves
         nothing on screen and no explanation. Still no retry — Overpass's
         fair-use limits (CLAUDE.md/DEC-016) make a retry storm the wrong
         response to an upstream that is already struggling. */
      if(!tbHotelLayerLive()||seq<=_hotelLayerDrawnSeq)return;
      if(_hotelLayerInflight>1)return; // another attempt may still succeed
      tbHotelLayerStatus('error',err&&err.name==='AbortError'
        ?'Hotels are taking too long — try again'
        :'Couldn’t load hotels right now');
    })
    .finally(()=>{
      clearTimeout(timer);
      _hotelLayerInflight--;
      /* GOLF-217: after a failure, bring "Search this area" back so they can
         try again (keeping the error pill); after a success it stays hidden. */
      if(_hotelLayerInflight===0)tbHotelSearchCheck(true);
      // Clear a lingering spinner only once nothing else could still resolve.
      if(_hotelLayerInflight===0&&_hotelStatusEl&&!_hotelStatusEl.hidden
         &&_hotelStatusEl.querySelector('.spin'))tbHotelLayerStatus(null);
    });
}

function tbToggleHotelLayer(){
  tbHotelLayerOn=!tbHotelLayerOn;
  if(!tbHotelLayerOn){
    clearTimeout(_hotelLayerTimer);
    tbHotelLayerClear();
    tbHotelLayerStatus(null);
    /* Any fetch still in flight sees tbHotelLayerOn===false when it resolves
       and drops itself, so nothing can draw after the layer is switched off. */
  }else{
    _hotelLayerDrawnSeq=0; // a fresh switch-on should accept the next response
    tbHotelLayerFetch();
  }
}

/* GOLF-131's debounced moveend/zoomend pattern (js/trip-route.js:676),
   applied to this layer instead of the nearby-courses set. A no-op
   whenever the layer is off, so this never fires a request whose result
   would just be discarded. */
map.on('moveend zoomend',()=>{
  if(!tbHotelLayerOn){tbHotelSearchCheck();return;} // GOLF-217: a tap fetches, a pan never does
  clearTimeout(_hotelLayerTimer);
  _hotelLayerTimer=setTimeout(tbHotelLayerFetch,HOTEL_LAYER_DEBOUNCE_MS);
});

/* ── GOLF-217: "Search this area" while the Add-a-stay picker is open.

   Two sources on purpose. The picker's numbered list (js/ors.js,
   tbHotelCandidates) is "hotels near this day", sorted by distance, and its
   numbers only mean something for that one area. This layer is "hotels in
   the view you are looking at". While the picker is open it reuses this
   layer's fetch, cache, pins and add-to-day popup (which GOLF-218 points
   at the picker's day), but only ever fetches on a tap: DEC-016 fair use.
   The toolbar toggle's own pan-to-refetch is unchanged (out of scope).

   _hotelSearchFor is the dayId the search belongs to, mirrored from
   tbHotelPickerFor by tbHotelSearchSync() rather than set by each of the
   half-dozen paths that open or close the picker, so none can be missed.
   _hotelSearchAreas are the areas already loaded for it: the day's own
   circle (the picker's list) plus every area searched since. */
let _hotelSearchFor=null;
/* One zoom step wider than the toolbar layer's 13: on a phone the picker
   frames the day at 12, and a search there is a single tap rather than
   "zoom in first". A phone view at 12 spans ~0.13°, well inside the
   Worker's 0.6° MAX_SPAN_DEG. The toolbar layer keeps 13 (out of scope). */
const HOTEL_SEARCH_MIN_ZOOM=12;
function tbHotelMinZoom(){return tbHotelLayerOn||_hotelSearchFor==null?HOTEL_LAYER_MIN_ZOOM:HOTEL_SEARCH_MIN_ZOOM;}
let _hotelSearchAreas=[];
/* How much of the view one loaded area must cover before the button is
   pointless. Not 100%: the picker frames its circle with padding, so the
   view is always a little bigger than what the list loaded. */
const HOTEL_SEARCH_COVERED=0.6;

function tbHotelLayerLive(){return tbHotelLayerOn||_hotelSearchFor!=null;}

function tbHotelSearchSync(){
  const want=typeof tbHotelPickerFor!=='undefined'?tbHotelPickerFor:null;
  if(want===_hotelSearchFor)return;
  const was=_hotelSearchFor;
  _hotelSearchFor=want;
  _hotelSearchAreas=[];
  /* Closing (or moving to another day) puts the pins back as they were:
     the toolbar layer, if it was on, keeps its own pins and status. */
  if(was!=null&&!tbHotelLayerOn){tbHotelLayerClear();tbHotelLayerStatus(null);}
  if(want!=null){
    const d=tripDays.find(x=>x.id===want);
    const pt=d&&typeof tbPoiPoint==='function'?tbPoiPoint(d):null;
    if(pt&&typeof HOTELS_RADIUS_M!=='undefined')_hotelSearchAreas.push(L.latLng(pt.lat,pt.lng).toBounds(HOTELS_RADIUS_M*2));
  }
  tbHotelSearchCheck();
}

function tbHotelSearchLoaded(bbox){
  if(_hotelSearchFor==null)return;
  _hotelSearchAreas.push(L.latLngBounds([bbox[0],bbox[1]],[bbox[2],bbox[3]]));
  tbHotelSearchBtn(null);
}

function tbBoundsCoverFrac(area,view){
  const s=Math.max(area.getSouth(),view.getSouth()),n=Math.min(area.getNorth(),view.getNorth());
  const w=Math.max(area.getWest(),view.getWest()),e=Math.min(area.getEast(),view.getEast());
  if(n<=s||e<=w)return 0;
  return((n-s)*(e-w))/((view.getNorth()-view.getSouth())*(view.getEast()-view.getWest()));
}

/* Decides, after every move, whether the view needs the button. Never
   fetches from the network; an area already in memory is drawn for free. */
function tbHotelSearchCheck(keepStatus){
  if(_hotelSearchFor==null||tbHotelLayerOn){tbHotelSearchBtn(null);return;}
  if(_hotelLayerInflight>0)return; // the spinner is already saying it
  const v=map.getBounds();
  if(_hotelSearchAreas.some(a=>tbBoundsCoverFrac(a,v)>=HOTEL_SEARCH_COVERED)){tbHotelSearchBtn(null);return;}
  /* Moved on from an area that had none: that message no longer applies. */
  if(!keepStatus&&_hotelStatusEl&&!_hotelStatusEl.hidden&&!_hotelStatusEl.querySelector('.spin'))tbHotelLayerStatus(null);
  if(map.getZoom()<tbHotelMinZoom()){tbHotelSearchBtn('zoom');return;}
  const bbox=tbHotelSnapBbox([v.getSouth(),v.getWest(),v.getNorth(),v.getEast()]);
  if(tbHotelCacheGet(bbox.join(','))||tbHotelCacheCovering(bbox)){tbHotelLayerFetch();return;}
  tbHotelSearchBtn('search');
}

function tbHotelSearchHere(){
  if(_hotelSearchFor==null||map.getZoom()<tbHotelMinZoom())return;
  tbHotelLayerFetch();
}

let _hotelSearchBtnEl=null;
/* kind: 'search' | 'zoom' | null (hidden). Sits one row under the status
   pill, above Leaflet's panes and below its controls, like the pill. */
function tbHotelSearchBtn(kind){
  if(!kind){if(_hotelSearchBtnEl)_hotelSearchBtnEl.hidden=true;return;}
  if(!_hotelSearchBtnEl){
    _hotelSearchBtnEl=document.createElement('button');
    _hotelSearchBtnEl.type='button';
    _hotelSearchBtnEl.className='hotel-search-btn';
    _hotelSearchBtnEl.addEventListener('click',tbHotelSearchHere);
    /* Leaflet would otherwise read the tap as a map click/drag start. */
    L.DomEvent.disableClickPropagation(_hotelSearchBtnEl);
    map.getContainer().appendChild(_hotelSearchBtnEl);
  }
  const el=_hotelSearchBtnEl;
  el.hidden=false;
  el.style.top=(tbMapTopInset()+40)+'px';
  el.disabled=kind==='zoom';
  el.textContent=kind==='zoom'?'Zoom in to search for hotels':'🏨 Search this area';
}
