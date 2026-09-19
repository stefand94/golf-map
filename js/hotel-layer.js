/* ============================================================
   js/hotel-layer.js — GOLF-142: ambient "Show hotels" map layer.

   A live per-viewport Overpass query (Worker mode:'hotelsViewport',
   scripts/cloudflare-worker/ors-proxy.js), distinct from GOLF-96's
   point-based "add a stay" picker (js/ors.js's tbHotelsFor() /
   js/trip-route.js's tbDrawHotelCandidates()), which this file does not
   touch — that picker's own Worker mode ('hotels') is untouched too.

   Off by default, not persisted (a browsing-mode preference, not trip
   data — GOLF-142 requirement 5), matching tbShowNearby/tbDriveToggle's
   precedent in js/trip-ui.js.

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

/* kind: 'loading' | 'info' | 'error' | null (null hides the pill). */
function tbHotelLayerStatus(kind,text){
  const el=tbHotelStatusEl();
  if(!kind){el.hidden=true;el.textContent='';return;}
  el.hidden=false;
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
  const opts=tripDays.map((d,i)=>{
    const place=d.place?' — '+esc(d.place):'';
    return `<option value="${d.id}">Day ${i+1}${place}</option>`;
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
  if(!tripDayAddStop(dayId,'hotel',p.name,null,p.lat,p.lng,1))return;
  map.closePopup();
  render(); // repaints the itinerary and re-tints this pin yellow
}

function tbHotelLayerRender(pois){
  _hotelLayerLastPois=pois;
  hotelLayerGroup.clearLayers();
  pois.forEach((p,idx)=>{
    // p.name/p.category come straight from Overpass — escape both, same
    // as tbDrawHeritage()/tbDrawHotelCandidates() already do.
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
  if(!tbHotelLayerOn||!_hotelLayerLastPois.length)return;
  tbHotelLayerRender(_hotelLayerLastPois);
}

function tbHotelLayerFetch(){
  if(!tbHotelLayerOn)return;
  if(!ORS_PROXY_URL){tbHotelLayerStatus('error','Hotels unavailable');return;}
  /* Below the min zoom, say so instead of clearing in silence. This is the
     single most common way the layer looked broken: the app opens at zoom 5,
     so switching hotels on from the default view did nothing at all and gave
     no reason why. The threshold itself is unchanged (see HOTEL_LAYER_MIN_ZOOM) —
     widening it would only make an already-slow Overpass query slower. */
  if(map.getZoom()<HOTEL_LAYER_MIN_ZOOM){
    tbHotelLayerClear();
    tbHotelLayerStatus('info','Zoom in to see hotels');
    return;
  }
  const reqBounds=map.getBounds();
  const bbox=[reqBounds.getSouth(),reqBounds.getWest(),reqBounds.getNorth(),reqBounds.getEast()];
  const seq=++_hotelLayerSeq;

  _hotelLayerInflight++;
  tbHotelLayerStatus('loading','Finding hotels…');

  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),HOTEL_LAYER_TIMEOUT_MS);

  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'hotelsViewport',bbox}),signal:ctl.signal})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(!tbHotelLayerOn)return;                 // switched off while in flight
      if(seq<=_hotelLayerDrawnSeq)return;        // a newer response already drew
      if(map.getZoom()<HOTEL_LAYER_MIN_ZOOM)return; // zoomed back out meanwhile
      /* The GOLF-142 rule dropped this response the moment the viewport moved
         at all. Against a ~17s upstream that discarded nearly every result.
         Overlap is the question that actually matters: if any part of the area
         we asked about is still on screen, these pins are worth drawing. */
      if(!map.getBounds().intersects(reqBounds))return;
      if(!data||!Array.isArray(data.pois))return;
      _hotelLayerDrawnSeq=seq;
      tbHotelLayerRender(data.pois);
      tbHotelLayerStatus(data.pois.length?null:'info','No hotels found here');
    })
    .catch(err=>{
      /* Deliberately louder than tbHeritageFor()/tbHotelsFor()'s fail-quiet
         contract: those decorate a map the user is already looking at, whereas
         this layer's entire output is the pins, so swallowing the error leaves
         nothing on screen and no explanation. Still no retry — Overpass's
         fair-use limits (CLAUDE.md/DEC-016) make a retry storm the wrong
         response to an upstream that is already struggling. */
      if(!tbHotelLayerOn||seq<=_hotelLayerDrawnSeq)return;
      if(_hotelLayerInflight>1)return; // another attempt may still succeed
      tbHotelLayerStatus('error',err&&err.name==='AbortError'
        ?'Hotels are taking too long — try again'
        :'Couldn’t load hotels right now');
    })
    .finally(()=>{
      clearTimeout(timer);
      _hotelLayerInflight--;
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
  if(!tbHotelLayerOn)return;
  clearTimeout(_hotelLayerTimer);
  _hotelLayerTimer=setTimeout(tbHotelLayerFetch,HOTEL_LAYER_DEBOUNCE_MS);
});
