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
/* Bumped on every toggle-off and every fetch kick-off; a fetch whose
   token no longer matches when it resolves is stale (toggled off, or the
   viewport moved again before this one returned) and its response is
   dropped rather than drawn — covers the "switch off mid-fetch must not
   render pins afterward" edge case from the handover doc. */
let _hotelLayerToken=0;

function tbHotelLayerClear(){
  hotelLayerGroup.clearLayers();
  if(map.hasLayer(hotelLayerGroup))map.removeLayer(hotelLayerGroup);
}

function tbHotelLayerRender(pois){
  hotelLayerGroup.clearLayers();
  pois.forEach(p=>{
    // p.name/p.category come straight from Overpass — escape both, same
    // as tbDrawHeritage()/tbDrawHotelCandidates() already do.
    L.circleMarker([p.lat,p.lng],{radius:6,color:'#0d47a1',weight:2,fillColor:'#fff',fillOpacity:.9})
      .bindTooltip(p.category?`🏨 ${esc(p.name)} — ${esc(p.category)}`:`🏨 ${esc(p.name)}`,{direction:'top'})
      .addTo(hotelLayerGroup);
  });
  if(!map.hasLayer(hotelLayerGroup))hotelLayerGroup.addTo(map);
}

function tbHotelLayerFetch(){
  if(!tbHotelLayerOn||!ORS_PROXY_URL)return;
  if(map.getZoom()<HOTEL_LAYER_MIN_ZOOM){tbHotelLayerClear();return;}
  const b=map.getBounds();
  const bbox=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()];
  const token=++_hotelLayerToken;
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'hotelsViewport',bbox})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(token!==_hotelLayerToken)return; // stale: toggled off, or moved again meanwhile
      if(!tbHotelLayerOn)return;
      if(data&&Array.isArray(data.pois))tbHotelLayerRender(data.pois);
    })
    .catch(()=>{ /* silent — matches tbHeritageFor()/tbHotelsFor()'s no-retry, fail-quiet contract */ });
}

function tbToggleHotelLayer(){
  tbHotelLayerOn=!tbHotelLayerOn;
  if(!tbHotelLayerOn){
    _hotelLayerToken++; // invalidate any in-flight fetch so it can't render after the fact
    clearTimeout(_hotelLayerTimer);
    tbHotelLayerClear();
  }else{
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
