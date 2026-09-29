/* ============================================================
   js/poi.js — GOLF-148 step 3: "Things to see" along each day's route.

   Replaces GOLF-79's "Show POI's", which asked the Worker to run a live
   Overpass query round each overnight point (8–50s, 504s, DEC-016 fair-use
   exposure). Now the data is a pre-baked, ranked dataset (GOLF-148 steps
   1–2, scripts/fetch_pois.py) shipped as one lazy file per region, so the
   runtime is: load the region(s) a day touches → keep what's within a
   corridor of that day's route → rank → show the top 5, "show more" for a
   deeper slice. No network call beyond the one-off region file.

   Data contract (agreed with the data session, 2026-09-19):
   - data/pois-categories.js: POI_CATEGORIES = [{label, group}], group one
     of heritage/nature/coast/culture/drink. Switch on group, never label —
     categories get added over time and land in a group automatically.
   - data/pois-<region>.js: window.P_<REGION> = [[name, catIdx, lat, lng,
     score], ...]. Positional to keep the payload down; inflated here once
     so nothing else touches indices. `window.X=` so a double inject is
     harmless, but the loader dedupes concurrent requests anyway.
   - score: integer, higher is better, comparable across categories, NOT
     unique (~30% tie at their category baseline) — hence the distance
     tie-break in poiRank(), the one place a second signal would go.
   - Region files must never be added to sw.js PRECACHE_URLS (that would
     download all of them on install). Only pois-categories.js is small
     enough to precache; it's loaded lazily here too, so the page never
     depends on it existing.
   ============================================================ */

/* bb = [minLat, maxLat, minLng, maxLng], deliberately generous — loading
   one extra region near a border is cheap; missing one silently drops
   every sight on the far side of it. Ireland is the whole island (the
   data merges the Republic and Northern Ireland, same as courses-ireland.js). */
const POI_REGIONS={
  england:    {g:'P_ENGLAND',    bb:[49.8,55.9,-6.6,1.9]},
  scotland:   {g:'P_SCOTLAND',   bb:[54.5,61.0,-8.8,-0.6]},
  wales:      {g:'P_WALES',      bb:[51.3,53.5,-5.4,-2.6]},
  ireland:    {g:'P_IRELAND',    bb:[51.3,55.5,-10.8,-5.3]},
  southafrica:{g:'P_SOUTHAFRICA',bb:[-35.2,-22.0,16.0,33.1]},
};
const POI_GROUPS=[
  ['heritage','Heritage','🏰','#8A5A2B'],
  ['nature',  'Nature',  '🌲','#2F7D4F'],
  ['coast',   'Coast',   '🌊','#2B7BB9'],
  ['culture', 'Culture', '🏛','#7A4FA0'],
  ['drink',   'Drink',   '🥃','#B7791F'],
];
const POI_GROUP_BY_KEY=Object.fromEntries(POI_GROUPS.map(g=>[g[0],g]));
/* Corridor: within POI_ROUTE_KM of the day's driving, or POI_STOP_KM of
   one of its stops (a bit wider where you're actually spending time). */
const POI_ROUTE_KM=8, POI_STOP_KM=15;
const POI_TOP=5, POI_MORE=20;

/* Per-visitor UI state, not persisted (same as the old toggle). */
let tbPoiOn=new Set();       // dayIds with "Things to see" open
let tbPoiMore=new Set();     // dayIds showing the deeper tier
/* GOLF-188: the kinds the visitor has narrowed to. Empty = show every kind,
   so the list opens unfiltered and each tap narrows rather than hides. */
let tbPoiGroupsSel=new Set();
const poiGroupShown=g=>!tbPoiGroupsSel.size||tbPoiGroupsSel.has(g);

/* The old live-Overpass cache is dead weight now — free the quota. */
try{localStorage.removeItem('golfmap:heritagecache:v4');}catch(e){}

/* ── Loading ─────────────────────────────────────────────── */
const poiData={};        // region -> inflated [{id,name,label,group,lat,lng,score}]
const poiStatus={};      // region -> 'loading' | 'ready' | 'missing'
const poiPending={};     // region -> Promise (dedupes concurrent requests)
let poiCatsPromise=null;
/* GOLF-210: same ?v=<build> stamp as the page's own script tags, so a
   returning visitor's 4-hour HTTP cache can't hand back last deploy's copy
   and sw.js matches pois-categories.js to its precached entry. */
const POI_BUILD=typeof APP_VERSION==='string'?APP_VERSION.slice(APP_VERSION.lastIndexOf('-')+1):'';
function poiLoadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src=POI_BUILD?src+'?v='+POI_BUILD:src;s.async=true;
    s.onload=()=>res();
    s.onerror=()=>{s.remove();rej(new Error('failed to load '+src));};
    document.head.appendChild(s);
  });
}
function poiEnsureCategories(){
  if(typeof POI_CATEGORIES!=='undefined')return Promise.resolve();
  if(!poiCatsPromise)poiCatsPromise=poiLoadScript('data/pois-categories.js')
    .catch(e=>{poiCatsPromise=null;throw e;});
  return poiCatsPromise;
}
function poiInflate(region,raw){
  const cats=typeof POI_CATEGORIES!=='undefined'?POI_CATEGORIES:[];
  const out=[];
  (raw||[]).forEach((r,k)=>{
    if(!Array.isArray(r)||typeof r[2]!=='number'||typeof r[3]!=='number')return;
    const cat=cats[r[1]]||{};
    out.push({id:region+':'+k,name:String(r[0]||''),label:cat.label||'Sight',
      group:POI_GROUP_BY_KEY[cat.group]?cat.group:'culture',
      lat:r[2],lng:r[3],score:Number(r[4])||0});
  });
  return out;
}
/* Resolves once the region is usable; a missing file (the dataset hasn't
   shipped for that region yet) is recorded once and not retried this
   session, so a render loop can't hammer a 404. */
function poiEnsureRegion(region){
  if(poiStatus[region]==='ready'||poiStatus[region]==='missing')return Promise.resolve();
  if(poiPending[region])return poiPending[region];
  const def=POI_REGIONS[region];
  poiStatus[region]='loading';
  poiPending[region]=poiEnsureCategories()
    .then(()=>window[def.g]?null:poiLoadScript(`data/pois-${region}.js`))
    .then(()=>{
      poiData[region]=poiInflate(region,window[def.g]);
      window[def.g]=null; // the inflated copy is the only one we need
      poiStatus[region]='ready';
    })
    .catch(()=>{poiStatus[region]='missing';})
    .finally(()=>{delete poiPending[region];});
  return poiPending[region];
}
function poiRegionsForBox(b){
  return Object.keys(POI_REGIONS).filter(r=>{
    const [a0,a1,o0,o1]=POI_REGIONS[r].bb;
    return !(b.maxLat<a0||b.minLat>a1||b.maxLng<o0||b.minLng>o1);
  });
}

/* ── Geometry ────────────────────────────────────────────── */
/* Local equirectangular projection (km) — plenty accurate at the tens-of-
   km scale a corridor works at, and far cheaper than haversine per
   segment when a real road route has hundreds of points. */
function poiProj(lat0){
  const kx=111.32*Math.cos(lat0*Math.PI/180),ky=110.57;
  return(lat,lng)=>[lng*kx,lat*ky];
}
function poiSegDist(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
  let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;
  t=Math.max(0,Math.min(1,t));
  const x=a[0]+t*dx-p[0],y=a[1]+t*dy-p[1];
  return Math.sqrt(x*x+y*y);
}
/* A day's geometry: its located stops, plus the driving into and through
   it — the leg from the previous day's last stop (that's the drive you do
   *on* this day) and each leg between this day's stops. Real road
   geometry where it's cached (orsLegRoute), straight line otherwise. */
function poiDayGeometry(dayIdx){
  const stops=tripDayStops(dayIdx);
  if(!stops.length)return null;
  let prev=null;
  for(let k=dayIdx-1;k>=0&&!prev;k--)prev=tripDayLastStop(k);
  const chain=prev?[prev,...stops]:stops;
  const lines=[];
  for(let k=1;k<chain.length;k++){
    const a=chain[k-1],b=chain[k];
    const route=(typeof orsLegRoute==='function')?orsLegRoute(a,b):null;
    lines.push(route&&route.length?route:[[a.lat,a.lng],[b.lat,b.lng]]);
  }
  return{stops:stops.map(s=>[s.lat,s.lng]),lines,sig:chain.map(s=>s.lat.toFixed(4)+','+s.lng.toFixed(4)).join(';')+'|'+lines.map(l=>l.length).join(',')};
}

/* ── Ranking ─────────────────────────────────────────────── */
/* The one ranking function. score desc; ties (common — ~30% of records
   sit exactly on their category baseline) broken by distance from the
   route, then name, so the order is stable and meaningful rather than
   alphabetical. A second signal (designation, pageviews) slots in here. */
function poiRank(a,b){
  return(b.score-a.score)||(a.dist-b.dist)||a.name.localeCompare(b.name);
}
const poiDayMemo=new Map();
/* {status:'none'|'loading'|'missing'|'ready', items:[...ranked, each with
   .dist km]} — every sight in the corridor, all groups, ranked. Group
   filtering and the top-N slice happen at display time so toggling a
   chip doesn't recompute geometry. */
function poiForDay(dayIdx){
  const geo=poiDayGeometry(dayIdx);
  if(!geo)return{status:'none',items:[]};
  const pts=geo.stops.concat(...geo.lines);
  const pad=POI_STOP_KM/111;
  const box={minLat:Infinity,maxLat:-Infinity,minLng:Infinity,maxLng:-Infinity};
  pts.forEach(([la,lo])=>{box.minLat=Math.min(box.minLat,la);box.maxLat=Math.max(box.maxLat,la);box.minLng=Math.min(box.minLng,lo);box.maxLng=Math.max(box.maxLng,lo);});
  const lngPad=pad/Math.max(.2,Math.cos(((box.minLat+box.maxLat)/2)*Math.PI/180));
  box.minLat-=pad;box.maxLat+=pad;box.minLng-=lngPad;box.maxLng+=lngPad;
  const regions=poiRegionsForBox(box);
  if(!regions.length)return{status:'missing',items:[]};
  const notReady=regions.filter(r=>poiStatus[r]!=='ready'&&poiStatus[r]!=='missing');
  if(notReady.length){
    Promise.all(notReady.map(poiEnsureRegion)).then(()=>{
      if(typeof tripBuilderOn!=='undefined'&&tripBuilderOn){renderTripBuilder();tbDrawMap(false);}
    });
    return{status:'loading',items:[]};
  }
  const ready=regions.filter(r=>poiStatus[r]==='ready');
  if(!ready.length)return{status:'missing',items:[]};
  const key=ready.join(',')+'|'+geo.sig;
  if(poiDayMemo.has(key))return poiDayMemo.get(key);
  const P=poiProj((box.minLat+box.maxLat)/2);
  const stopsP=geo.stops.map(([la,lo])=>P(la,lo));
  const linesP=geo.lines.map(l=>l.map(([la,lo])=>P(la,lo)));
  const items=[];
  ready.forEach(r=>poiData[r].forEach(p=>{
    if(p.lat<box.minLat||p.lat>box.maxLat||p.lng<box.minLng||p.lng>box.maxLng)return;
    const q=P(p.lat,p.lng);
    let dStop=Infinity,dRoute=Infinity;
    stopsP.forEach(s=>{const d=Math.hypot(q[0]-s[0],q[1]-s[1]);if(d<dStop)dStop=d;});
    linesP.forEach(l=>{for(let k=1;k<l.length;k++){const d=poiSegDist(q,l[k-1],l[k]);if(d<dRoute)dRoute=d;}});
    if(dStop<=POI_STOP_KM||dRoute<=POI_ROUTE_KM)items.push(Object.assign({},p,{dist:Math.min(dStop,dRoute)}));
  }));
  items.sort(poiRank);
  const res={status:'ready',items};
  if(poiDayMemo.size>50)poiDayMemo.clear();
  poiDayMemo.set(key,res);
  return res;
}
function poiVisibleForDay(d){
  const idx=tripDays.indexOf(d);
  const r=poiForDay(idx);
  const filtered=r.items.filter(p=>poiGroupShown(p.group));
  const n=tbPoiMore.has(d.id)?POI_MORE:POI_TOP;
  const items=filtered.slice(0,n);
  items.forEach(p=>poiById.set(p.id,p)); // what the list's + buttons and the pins resolve ids against
  return{status:r.status,total:filtered.length,items};
}

/* ── Trip helpers ────────────────────────────────────────── */
/* "Already in the trip" = a stop with the same name within ~300m — the
   same looseness GOLF-145's hotel pins use, since a stop's coords can be
   rounded or come from a different source. */
function poiInTrip(p){
  return tripDays.some(d=>tripDayItems(d).some(it=>it.type==='poi'&&it.name===p.name.slice(0,80)&&
    (it.lat==null||haversineMiles(it.lat,it.lng,p.lat,p.lng)<0.2))
    // GOLF-216: or it's a day of its own
    ||d.placeLat!=null&&d.place===p.name.slice(0,80)&&haversineMiles(d.placeLat,d.placeLng,p.lat,p.lng)<0.2);
}
let poiById=new Map();
function poiAddToDay(id,dayId){
  const p=poiById.get(id);if(!p)return;
  const d=tripDays.find(x=>x.id===dayId);if(!d)return;
  const it=tripDayAddStop(dayId,'poi',p.name,null,p.lat,p.lng);
  if(!it)return;
  if(typeof map!=='undefined')map.closePopup();
  renderTripBuilder();tbDrawMap(false);
  if(typeof mapFitDay==='function')mapFitDay(dayId); // GOLF-191 (AC 2): keep the new stop and the rest of its day in view
  if(typeof tbToast==='function')tbToast(`Added <b>${esc(p.name)}</b> to Day ${tripDays.indexOf(d)+1}`,[
    {label:'Undo',fn:()=>{tripDayRemoveItem(dayId,it.id);renderTripBuilder();tbDrawMap(false);}}]);
}
/* GOLF-216: the card's select holds either a day id (a stop on that day)
   or "new:<pos>" — a whole day located at the POI, which is the same thing
   as picking a town from search, so it goes through tbAddPlaceToTrip
   (toast, Undo, Nearby re-scope and all). */
function poiAddFromPopup(id){
  const sel=document.getElementById('poi-pop-day');
  const v=sel?sel.value:'';
  if(v.startsWith('new:')){
    const p=poiById.get(id);if(!p)return;
    tbAddPlaceToTrip(p.lat,p.lng,p.name,v.slice(4));
    return;
  }
  const dayId=Number(v);
  if(v!==''&&isFinite(dayId))poiAddToDay(id,dayId);
}
function tbTogglePois(dayId){
  if(tbPoiOn.has(dayId)){tbPoiOn.delete(dayId);tbPoiMore.delete(dayId);}else tbPoiOn.add(dayId);
  renderTripBuilder();tbDrawMap(false);
}
function tbPoiToggleMore(dayId){
  if(tbPoiMore.has(dayId))tbPoiMore.delete(dayId);else tbPoiMore.add(dayId);
  renderTripBuilder();tbDrawMap(false);
}
function tbPoiToggleGroup(g){
  if(tbPoiGroupsSel.has(g))tbPoiGroupsSel.delete(g);else tbPoiGroupsSel.add(g);
  renderTripBuilder();tbDrawMap(false);
}
function tbPoiClearGroups(){
  tbPoiGroupsSel.clear();
  renderTripBuilder();tbDrawMap(false);
}
function poiFocus(id){
  if(typeof map==='undefined'||!poiMarkers.has(id))return;
  /* On a phone the map is hidden behind the list: reveal it without the
     usual trip re-fit, then centre once it has a real size. */
  const open=()=>{const m=poiMarkers.get(id);if(!m)return;
    map.invalidateSize();
    map.setView(m.getLatLng(),Math.max(map.getZoom(),12),{animate:false});m.openPopup();};
  if(window.innerWidth<=900&&typeof showMobileMap==='function'){showMobileMap(true);setTimeout(open,30);}
  else open();
}
const poiMiles=km=>{const mi=km*0.621371;return mi<0.5?'close by':mi<10?`${mi.toFixed(1)} mi from route`:`${Math.round(mi)} mi from route`;};

/* ── Pane ────────────────────────────────────────────────── */
function tbPoiLinkHTML(d){
  if(!tripDayStops(tripDays.indexOf(d)).length)return'';
  const on=tbPoiOn.has(d.id);
  return` · <a href="#" class="linkbtn" onclick="event.preventDefault();tbTogglePois(${d.id})">${on?'Hide things to see':'Things to see'}</a>`;
}
function tbPoiListHTML(d){
  if(!tbPoiOn.has(d.id))return'';
  const v=poiVisibleForDay(d);
  const chips=`<div class="tb-sight-chips" role="group" aria-label="Kinds of places"><button type="button" class="tb-sight-chip" aria-pressed="${!tbPoiGroupsSel.size}" onclick="tbPoiClearGroups()">All</button>${POI_GROUPS.map(([k,l,ic])=>
    `<button type="button" class="tb-sight-chip" aria-pressed="${tbPoiGroupsSel.has(k)}" onclick="tbPoiToggleGroup('${k}')"><span aria-hidden="true">${ic}</span>${l}</button>`).join('')}</div>`;
  let body;
  if(v.status==='loading')body=`<p class="hint tb-sight-note">Finding things to see…</p>`;
  else if(v.status==='missing'||v.status==='none')body=`<p class="hint tb-sight-note">Sights aren't available for this area yet.</p>`;
  else if(!v.items.length)body=`<p class="hint tb-sight-note">Nothing notable within ${Math.round(POI_ROUTE_KM*0.621)} miles of this day's route${tbPoiGroupsSel.size?' for these kinds of place':''}.</p>`;
  else{
    body=v.items.map(p=>{
      const g=POI_GROUP_BY_KEY[p.group];
      const added=poiInTrip(p);
      return`<div class="tb-sight-row">
        <span class="tb-sight-ico" style="--poi-c:${g[3]}">${g[2]}</span>
        <div class="tb-sight-main"><a href="#" class="tb-sight-name" onclick="event.preventDefault();poiFocus('${p.id}')">${esc(p.name)}</a>
          <div class="cart-region">${esc(p.label)} · ${poiMiles(p.dist)}</div></div>
        ${added?`<span class="tb-sight-added" title="Already in your trip">✓</span>`
          :`<button type="button" class="tb-btn is-sm is-icon" title="Add to Day ${tripDays.indexOf(d)+1}" aria-label="Add ${esc(p.name)} to Day ${tripDays.indexOf(d)+1}" onclick="poiAddToDay('${p.id}',${d.id})">＋</button>`}
      </div>`;}).join('');
    const more=v.total>POI_TOP
      ?`<button type="button" class="tb-btn is-sm is-quiet tb-sight-more" onclick="tbPoiToggleMore(${d.id})">${tbPoiMore.has(d.id)?'Show fewer':`Show more (${Math.min(v.total,POI_MORE)-POI_TOP})`}</button>`:'';
    body+=more;
  }
  const showChips=v.status!=='missing'&&v.status!=='none'; // filters mean nothing without data
  return`<div class="tb-sights">${showChips?chips:''}${body}</div>`;
}

/* ── Map ─────────────────────────────────────────────────── */
let poiMarkers=new Map();
function poiPopupHTML(id,defaultDayId){
  const p=poiById.get(id);if(!p)return'';
  const g=POI_GROUP_BY_KEY[p.group];
  const head=`<div class="hotel-pop-name"><span aria-hidden="true" style="margin-right:5px">${g[2]}</span>${esc(p.name)}</div><div class="hotel-pop-cat">${esc(p.label)}</div>`;
  if(poiInTrip(p))return`<div class="hotel-pop">${head}<p class="hotel-pop-note">✓ Already in your trip</p></div>`;
  const days=tripDays.map((d,i)=>`<option value="${d.id}"${d.id===defaultDayId?' selected':''}>${tripDayChoiceLabel(i)}</option>`).join('');
  const opts=tripDays.length
    ?`<optgroup label="A stop on">${days}</optgroup><optgroup label="Its own day">${tripDayPosOptionsHTML().replace(/value="(\d+)"/g,'value="new:$1"').replace(/ selected/g,'')}</optgroup>`
    :`<option value="new:0">New day (Day 1)</option>`;
  return`<div class="hotel-pop">${head}
    <label class="hotel-pop-row"><span>Add to</span><select id="poi-pop-day" class="hotel-pop-select">${opts}</select></label>
    <button type="button" class="tb-btn is-primary is-sm hotel-pop-add" onclick="poiAddFromPopup('${p.id}')">＋ Add to trip</button></div>`;
}
/* Called from tbDrawMap() into tripLayer (cleared on every redraw).
   Excluded from fitBounds, like the old heritage markers — a sight off to
   one side shouldn't zoom the map away from the route. */
function tbDrawPois(){
  poiMarkers=new Map();
  tripDays.forEach(d=>{
    if(!tbPoiOn.has(d.id))return;
    const v=poiVisibleForDay(d);
    v.items.forEach(p=>{
      if(poiMarkers.has(p.id))return; // shown by an earlier day already
      poiById.set(p.id,p);
      const g=POI_GROUP_BY_KEY[p.group];
      const added=poiInTrip(p);
      const m=L.circleMarker([p.lat,p.lng],{radius:7,color:g[3],weight:2,fillColor:added?g[3]:'#fff',fillOpacity:.95})
        .bindTooltip(`${g[2]} ${esc(p.name)} — ${esc(p.label)}`,{direction:'top'})
        .bindPopup(()=>poiPopupHTML(p.id,d.id),{minWidth:210,closeButton:true})
        .addTo(tripLayer);
      poiMarkers.set(p.id,m);
    });
  });
  /* GOLF-207: the viewport layer skips anything poiMarkers already holds,
     so it has to redraw whenever this set changes — opening a day's
     "Things to see" must not leave the same sight pinned twice. Cheap:
     re-renders from the last scan, no reload and no re-scan. */
  if(tbPoiLayerOn)tbPoiLayerRender();
}

/* ── Viewport layer (GOLF-207) ───────────────────────────── */
/* A second way to see the same dataset: instead of a corridor round one
   day's route, every sight in whatever the map is currently showing.
   Follows pan/zoom like GOLF-142's hotel layer (js/hotel-layer.js), whose
   structure this mirrors deliberately — same debounce, same status pill,
   same "off means clear and say nothing". The one real difference is that
   there is no network: the region files are already lazy-loaded by
   poiEnsureRegion(), so a refresh is pure local work and needs none of
   hotel-layer's in-flight sequencing, timeout or viewport cache. */

let tbPoiLayerOn=false;

/* Zoom gate. Hotels use 13 because an Overpass query over a wide bbox is
   genuinely expensive; here the only cost is clutter, so this can be far
   wider — and it has to be, because sights are sparse and spread out in a
   way hotels are not. At 9 a screen covers roughly the area a trip drives
   in a day or two, which is the view someone planning a trip is actually
   looking at. Below it the whole of England is on screen (~13k records)
   and any capped selection would be arbitrary, so we say so instead. */
const POI_LAYER_MIN_ZOOM=9;

/* How many pins one view may draw. At the minimum zoom a view holds
   roughly a thousand candidates, so a cap is what keeps this readable
   rather than a wall of circles; ranked by poiRank(), so what survives
   the cap is the highest-scoring sights, not an arbitrary slice. Zoom in
   and the candidate count falls below the cap, so everything shows. */
const POI_LAYER_CAP=60;

/* In step with HOTEL_LAYER_DEBOUNCE_MS / GOLF-131's nearby-courses
   listener — one pan should feel the same whichever layers are on. */
const POI_LAYER_DEBOUNCE_MS=300;

const poiLayerGroup=L.layerGroup();
let _poiLayerTimer=null;
/* Last ranked in-view set, kept so tbDrawPois() can re-render the layer
   (to drop a pin that just entered the trip, or one a day's "Things to
   see" list now owns) without redoing the scan. Held a little deeper than
   the cap so those removals don't leave the view short. */
let _poiLayerCandidates=[];

let _poiStatusEl=null;
function poiLayerStatusEl(){
  if(_poiStatusEl)return _poiStatusEl;
  _poiStatusEl=document.createElement('div');
  /* Reuses .hotel-status's styling; .poi-status only moves it down a row
     so the two pills stack when both layers are on. */
  _poiStatusEl.className='hotel-status poi-status';
  _poiStatusEl.id='poi-status';
  _poiStatusEl.setAttribute('role','status');
  _poiStatusEl.setAttribute('aria-live','polite');
  _poiStatusEl.hidden=true;
  map.getContainer().appendChild(_poiStatusEl);
  return _poiStatusEl;
}
/* kind: 'loading' | 'info' | null (null hides it). No 'error' case —
   a missing region file is recorded once by poiEnsureRegion() and simply
   contributes nothing, exactly as it does in the day pane. */
function tbPoiLayerStatus(kind,text){
  const el=poiLayerStatusEl();
  if(!kind){el.hidden=true;el.textContent='';return;}
  el.hidden=false;
  el.innerHTML=(kind==='loading'?'<span class="spin"></span>':'')+`<span>${esc(text)}</span>`;
}

function tbPoiLayerClear(){
  poiLayerGroup.clearLayers();
  _poiLayerCandidates=[];
  if(map.hasLayer(poiLayerGroup))map.removeLayer(poiLayerGroup);
}

/* Draws from _poiLayerCandidates, skipping anything the map already shows
   by another route: a sight that's in the trip is drawn as a stop, and one
   in an open day's "Things to see" is drawn by tbDrawPois(). Filtering at
   draw time rather than scan time is what lets tbDrawPois() call straight
   back in here after it has rebuilt poiMarkers. */
function tbPoiLayerRender(){
  poiLayerGroup.clearLayers();
  if(!tbPoiLayerOn)return;
  let n=0;
  for(const p of _poiLayerCandidates){
    if(n>=POI_LAYER_CAP)break;
    if(poiMarkers.has(p.id)||poiInTrip(p))continue;
    poiById.set(p.id,p);
    const g=POI_GROUP_BY_KEY[p.group];
    L.circleMarker([p.lat,p.lng],{radius:6,color:g[3],weight:2,fillColor:'#fff',fillOpacity:.95})
      .bindTooltip(`${g[2]} ${esc(p.name)} — ${esc(p.label)}`,{direction:'top'})
      /* Built on open, like the hotel layer's: the day list and trip
         membership both go stale the moment the trip changes. */
      .bindPopup(()=>poiPopupHTML(p.id,poiLayerNearestDayId(p)),{minWidth:210,closeButton:true})
      .addTo(poiLayerGroup);
    n++;
  }
  if(!map.hasLayer(poiLayerGroup))poiLayerGroup.addTo(map);
  tbPoiLayerStatus(n?null:'info','No places to see in this view');
}

/* Which day a pin's "Add to" starts on. A pane pin knows its day; a
   viewport pin doesn't belong to one, so it offers the day that already
   goes nearest it — which is nearly always the day you'd want a detour on.
   The select still lists every day, so this is only a starting point.
   Computed per popup-open, so it costs nothing until a pin is clicked. */
function poiLayerNearestDayId(p){
  if(!tripDays.length)return null;
  let best=tripDays[0].id,bestD=Infinity;
  tripDays.forEach((d,i)=>{
    const geo=poiDayGeometry(i);
    if(!geo)return;
    geo.stops.concat(...geo.lines).forEach(([la,lo])=>{
      const dd=haversineMiles(p.lat,p.lng,la,lo);
      if(dd<bestD){bestD=dd;best=d.id;}
    });
  });
  return best;
}

function tbPoiLayerRefresh(){
  if(!tbPoiLayerOn)return;
  if(map.getZoom()<POI_LAYER_MIN_ZOOM){
    tbPoiLayerClear();
    tbPoiLayerStatus('info','Zoom in to see places of interest');
    return;
  }
  const b=map.getBounds();
  const box={minLat:b.getSouth(),maxLat:b.getNorth(),minLng:b.getWest(),maxLng:b.getEast()};
  const regions=poiRegionsForBox(box);
  const notReady=regions.filter(r=>poiStatus[r]!=='ready'&&poiStatus[r]!=='missing');
  if(notReady.length){
    tbPoiLayerStatus('loading','Finding places to see…');
    /* Each region re-enters this function when it lands. poiEnsureRegion()
       dedupes concurrent requests and never retries a missing file, so this
       can't loop: the second pass sees every region settled. */
    notReady.forEach(r=>poiEnsureRegion(r).then(()=>{if(tbPoiLayerOn)tbPoiLayerRefresh();}));
    return;
  }
  /* poiRank()'s tie-break wants a distance. A corridor measures from the
     route; a viewport has no route, so it measures from the middle of the
     view — which puts what you're looking at ahead of what's at the edge
     when scores tie. */
  const c=map.getCenter(),pr=poiProj(c.lat);
  const [cx,cy]=pr(c.lat,c.lng);
  const out=[];
  regions.filter(r=>poiStatus[r]==='ready').forEach(r=>poiData[r].forEach(p=>{
    if(p.lat<box.minLat||p.lat>box.maxLat||p.lng<box.minLng||p.lng>box.maxLng)return;
    const q=pr(p.lat,p.lng),dx=q[0]-cx,dy=q[1]-cy;
    out.push(Object.assign({},p,{dist:Math.sqrt(dx*dx+dy*dy)}));
  }));
  out.sort(poiRank);
  /* Kept deeper than the cap so the draw-time filtering below (trip stops,
     pane pins) can drop entries without thinning the view. */
  _poiLayerCandidates=out.slice(0,POI_LAYER_CAP*3);
  tbPoiLayerRender();
}

/* The one global toggle. Agreed with the Discover-pane work (GOLF-208) as
   the single entry point, so a pill in either toolbar can drive the layer
   without either side reaching into the other's state. */
function tbPoiLayerSet(on){
  on=!!on;
  if(on===tbPoiLayerOn)return;
  tbPoiLayerOn=on;
  if(!tbPoiLayerOn){
    clearTimeout(_poiLayerTimer);
    tbPoiLayerClear();
    tbPoiLayerStatus(null);
  }else{
    tbPoiLayerRefresh();
  }
  /* Repaints whichever pills are on screen (Itinerary's and Discover's) so
     both show the same state, whichever one was clicked. */
  if(typeof renderTripBuilder==='function')renderTripBuilder();
}
function tbTogglePoiLayer(){tbPoiLayerSet(!tbPoiLayerOn);}

map.on('moveend zoomend',()=>{
  if(!tbPoiLayerOn)return;
  clearTimeout(_poiLayerTimer);
  _poiLayerTimer=setTimeout(tbPoiLayerRefresh,POI_LAYER_DEBOUNCE_MS);
});
