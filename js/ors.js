/* ============================================================
   js/ors.js — the straight-line drive-time heuristic plus the
   OpenRouteService proxy layer (leg times, route geometry, geocoding,
   POI lookup) and their caches. Inert when ORS_PROXY_URL is empty.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* GOLF-43: zero-API drive-time default — haversine distance (already used
   elsewhere for anchor-radius discovery) between the previous day's last
   course and this day's first course, x a routing-inefficiency factor
   (real roads aren't straight lines — 1.3 is a standard rule-of-thumb
   correction) / an assumed average UK A-road/motorway-blend speed,
   rounded to the nearest 5 minutes. This is only ever a *default* shown
   via the drive-time input's placeholder — the moment a visitor types a
   real number, tripDaySetDriveIn() stores it as-is and this estimate is
   never shown again for that day (the placeholder vanishes for free,
   standard input behaviour). Superseded by GOLF-45's real ORS-backed
   estimate once that's built; kept as its fallback even then. */
const DRIVE_INEFFICIENCY=1.3,DRIVE_AVG_MPH=38;
/* Straight-line-derived leg distance, independent of whatever the visitor
   types into the drive-time input — GOLF-44's fuel estimate needs the
   physical distance regardless of anyone's time guess, so this is the
   shared source of truth for both that and the time estimate below. */
function tripDayLegMiles(dayIdx){
  const a=tripDayLastStop(dayIdx-1),b=tripDayFirstStop(dayIdx);
  if(!a||!b)return null;
  return haversineMiles(a.lat,a.lng,b.lat,b.lng)*DRIVE_INEFFICIENCY;
}
function tripDayAutoEstimate(dayIdx){
  const miles=tripDayLegMiles(dayIdx);
  if(miles==null)return null;
  return Math.max(5,Math.round((miles/DRIVE_AVG_MPH*60)/5)*5);
}
/* GOLF-45: real driving time/distance via OpenRouteService, called
   through a small stateless Cloudflare Worker proxy — see
   scripts/cloudflare-worker/. The ORS key lives only in the Worker's
   encrypted secret store; it never appears in this file or in any
   request this page makes. ORS_PROXY_URL empty ('') means "not
   configured yet" — every call below then returns null immediately and
   every caller already falls back to the GOLF-43 heuristic, so this is
   safe to leave blank indefinitely. */
const ORS_PROXY_URL='https://api.golftripper.uk/'; // GOLF-35B: the Worker's custom domain (was geofftheworker.stefand94.workers.dev)
/* GOLF-50: v2 — the cached shape gained a route field. Bumping the key
   (rather than reusing v1) means any leg cached against the pre-GOLF-50
   Worker deploy (route missing from the response entirely) can't get
   stuck permanently believing "no geometry available" — v1 entries are
   simply abandoned, a fresh v2 cache starts empty and refetches as
   needed, same one-time cost as any other cache-key bump would have. */
/* GOLF-118: v3 — the cached shape gained hasFerry/ferryMinutes/ferryMiles/
   routeParts. Bumped (rather than tolerating missing fields on v2 entries)
   because orsLegRoute() short-circuits on any entry that already has a
   `route` key, so a v2 entry would never re-fetch to pick up ferry data —
   it'd silently show a ferry crossing as a plain drive forever. A clean v3
   cache refetches lazily, same one-time cost as the GOLF-50 v1->v2 bump. */
const ORS_CACHE_KEY='golfmap:legcache:v3';
/* GOLF-63: legs are now computed per item rather than per day boundary, so
   this is read once per leg in loops that got an order of magnitude longer
   — memoised in-memory (invalidated by our own writes, the only writer) so
   a multi-stop trip doesn't JSON.parse localStorage dozens of times per
   render. Behaviour is otherwise identical. */
let orsCacheMemo=null;
function orsCacheLoad(){
  if(orsCacheMemo)return orsCacheMemo;
  try{orsCacheMemo=JSON.parse(localStorage.getItem(ORS_CACHE_KEY)||'{}');}catch(e){orsCacheMemo={};}
  return orsCacheMemo;
}
/* GOLF (architecture review): all three localStorage caches below grew
   without any bound — every leg, every heritage-POI point and every
   hotel-POI point ever fetched stayed forever, so a heavy user eventually
   filled their origin's storage quota and every subsequent write (this
   app's own saveState() included) started failing.

   Each entry carries a `ts` stamped at write time; this keeps the newest
   `cap` entries and drops the rest. Recency-of-write, not of read — a
   read hit deliberately doesn't write anything back, since touching
   localStorage on every cache lookup is exactly the cost these caches
   exist to avoid. Entries with no ts (written before this shipped) sort
   as oldest and are evicted first. Returns the same object when it's
   already within cap, so the common case allocates nothing. */
function orsCacheTrim(c,cap){
  const keys=Object.keys(c);
  if(keys.length<=cap)return c;
  keys.sort((a,b)=>((c[b]&&c[b].ts)||0)-((c[a]&&c[a].ts)||0));
  const out={};
  keys.slice(0,cap).forEach(k=>{out[k]=c[k];});
  return out;
}
const ORS_LEG_CACHE_CAP=150, ORS_POI_CACHE_CAP=100;
function orsCacheSave(c){
  const t=orsCacheTrim(c,ORS_LEG_CACHE_CAP);
  orsCacheMemo=t;
  try{localStorage.setItem(ORS_CACHE_KEY,JSON.stringify(t));}catch(e){}
}
/* GOLF-56: keyed off plain {lat,lng} points rather than course indices,
   so a leg touching a searched place (which has no course index) works
   identically to a leg between two courses. */
function orsLegKey(a,b){return a.lat.toFixed(4)+','+a.lng.toFixed(4)+'>'+b.lat.toFixed(4)+','+b.lng.toFixed(4);}
let orsPending=new Set();
/* GOLF-50/GOLF-56: shared fetch+cache logic for a single leg — both
   tripDayRealEstimate() (drive time) and orsLegRoute() (route geometry)
   read/write the same cache entry under the same key, so whichever one
   asks first fires the single fetch that satisfies both; orsPending
   guards against a duplicate in-flight request for the same leg. a/b are
   plain {lat,lng} points (a course or a searched place, either way). */
/* GOLF-176: a leg the Worker couldn't route (e.g. ORS 2010, no road near a
   pin) used to be refetched on every render, since only successes are
   cached. Remember failures in memory for a while instead — the dotted
   straight-line fallback stays, and the leg is retried after the backoff
   or on the next page load (in memory only, so a transient 429/outage
   never sticks). */
const ORS_FAIL_RETRY_MS=10*60*1000;
const orsFailedAt=new Map();
function orsEnsureLeg(key,a,b){
  if(orsPending.has(key))return;
  const failedAt=orsFailedAt.get(key);
  if(failedAt&&Date.now()-failedAt<ORS_FAIL_RETRY_MS)return;
  orsPending.add(key);
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({origin:[a.lng,a.lat],destination:[b.lng,b.lat]})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(data&&typeof data.minutes==='number'){
        const c=orsCacheLoad();
        c[key]={minutes:Math.round(data.minutes),miles:data.miles!=null?Math.round(data.miles*10)/10:null,
          route:Array.isArray(data.route)?data.route:null,
          /* GOLF-118 — every reader treats a missing key as "no ferry": a
             pre-v3 entry, or a leg resolved against an older Worker deploy,
             simply has hasFerry undefined (falsy) and the ferry tag/split
             never shows for it until it re-resolves. */
          hasFerry:!!data.hasFerry,
          ferryMinutes:typeof data.ferryMinutes==='number'?Math.round(data.ferryMinutes):0,
          ferryMiles:typeof data.ferryMiles==='number'?Math.round(data.ferryMiles*10)/10:0,
          routeParts:Array.isArray(data.routeParts)?data.routeParts:null,
          ts:Date.now()};
        orsCacheSave(c);
        orsFailedAt.delete(key);
        if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else if(TRIP.size){tripDrawCart(false);}
      }else{orsFailedAt.set(key,Date.now());}
    })
    .catch(()=>{ /* silent — heuristic/straight-line fallback stays in place */
      orsFailedAt.set(key,Date.now());
    })
    .finally(()=>{orsPending.delete(key);});
}
/* Returns {minutes,miles} from cache, or null if not yet known (proxy
   not configured, cache miss still loading, or the call failed) — every
   caller has the GOLF-43 heuristic to fall back to in that case. A cache
   miss fires an async fetch + localStorage cache + a re-render once it
   resolves, so re-viewing an unchanged trip never re-hits the proxy. */
function tripDayRealEstimate(dayIdx){
  if(!ORS_PROXY_URL)return null;
  const a=tripDayLastStop(dayIdx-1),b=tripDayFirstStop(dayIdx);
  if(!a||!b)return null;
  const key=orsLegKey(a,b);
  const cache=orsCacheLoad();
  if(cache[key])return cache[key];
  orsEnsureLeg(key,a,b);
  return null;
}
/* GOLF-50: real road-following geometry for a single leg (any two
   courses, not just day-boundary gaps — every consecutive pair in the
   trip's drawn order calls this). Returns an array of [lat,lng] points,
   or null while it's unknown/unavailable — callers fall back to a
   straight line between the two points, same "heuristic until proven
   otherwise" convention as the drive-time estimate. A cache entry with
   no 'route' key at all (pre-GOLF-50 data, or from tripDayRealEstimate
   alone) still triggers exactly one fetch to backfill it; an entry where
   ORS genuinely returned no geometry (route explicitly null) is not
   retried forever. */
function orsLegRoute(a,b){
  if(!ORS_PROXY_URL)return null;
  const key=orsLegKey(a,b);
  const cache=orsCacheLoad();
  const hit=cache[key];
  if(hit&&'route'in hit)return hit.route;
  orsEnsureLeg(key,a,b);
  return null;
}
/* GOLF-118: the ordered road/ferry pieces of a leg's route (see the
   Worker's routeParts) — used by tripShowOrdered() to draw the ferry
   crossing as one straight port-to-port line instead of ORS's long
   coastal polyline. null when unknown or the leg has no ferry; callers
   fall back to orsLegRoute()/a straight line, same convention as
   everything else in this file. Never fires its own fetch — orsLegRoute()
   / tripDayRealEstimate() already do for this same cache key. */
function orsLegRouteParts(a,b){
  if(!ORS_PROXY_URL)return null;
  const hit=orsCacheLoad()[orsLegKey(a,b)];
  return hit&&Array.isArray(hit.routeParts)?hit.routeParts:null;
}
/* GOLF-118: {hasFerry,ferryMinutes,ferryMiles} for a leg from cache, with
   a hard no-ferry default for any leg not yet resolved or resolved before
   ferry data existed. Read-only — no fetch (its callers already trigger
   one via the drive-time / route helpers). */
function legFerryInfo(a,b){
  const none={hasFerry:false,ferryMinutes:0,ferryMiles:0};
  if(!ORS_PROXY_URL||!a||!b)return none;
  const hit=orsCacheLoad()[orsLegKey(a,b)];
  if(!hit||!hit.hasFerry)return none;
  return{hasFerry:true,ferryMinutes:hit.ferryMinutes||0,ferryMiles:hit.ferryMiles||0};
}
/* GOLF-56: place search (start/free/end day locations) via the same
   Worker's geocode mode. In-memory only (no localStorage cache — search
   text is transient/per-keystroke, not worth persisting) keyed by the
   raw query text; a fresh keystroke that repeats an earlier query in the
   same session is served from this map instead of re-hitting the proxy.
   cb(results|null) — null means "still loading/unavailable", same
   contract as the leg-estimate helpers above. */
const orsGeocodeCache=new Map();
/* GOLF-84: optional `country` (one of 'GBR'/'IRL'/'ZAF', matching the
   Worker's GEOCODE_COUNTRIES vocabulary) ringfences results to a single
   nation — e.g. Explore's GB/Ireland/South Africa pill selection — so a
   bare "Newcastle" search while browsing South Africa doesn't surface
   Newcastle upon Tyne. Omitted/falsy means "all nations", the pre-GOLF-84
   default. Folded into the cache key so a query typed under one nation
   filter never serves a stale cross-nation result under another. */
function orsGeocode(text,cb,country,layers){
  const q=text.trim();
  const key=(country||'')+'|'+(layers||'')+'|v2|'+q;
  if(!ORS_PROXY_URL||!q){cb([]);return;}
  if(orsGeocodeCache.has(key)){cb(orsGeocodeCache.get(key));return;}
  const body={mode:'geocode',text:q};
  if(country)body.country=country;
  /* Ireland = the whole island, Northern Ireland included (matches
     courses-ireland.js and the nation pill). The Worker widens IRL to
     IRL + NI when asked; an un-redeployed Worker ignores this. */
  if(country==='IRL')body.island='ireland';
  if(layers)body.layers=layers; // GOLF-150: 'coarse' = towns/regions only (Worker allowlists it)
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      const results=Array.isArray(data&&data.results)?data.results:[];
      orsGeocodeCache.set(key,results);
      cb(results);
    })
    .catch(()=>cb(null));
}
/* The value actually used wherever a drive time is needed (e.g. GOLF-44's
   cost total): the visitor's own typed number if they entered one, else
   a real ORS-backed estimate if one's cached, else the GOLF-43
   straight-line heuristic — so an unset day always contributes a
   sensible number rather than silently being treated as zero. */
function tripDayEffectiveDriveIn(dayIdx){
  const d=tripDays[dayIdx];
  if(!d)return{minutes:null,auto:false,real:false};
  if(d.driveIn!=null)return{minutes:d.driveIn,auto:false,real:false};
  const real=tripDayRealEstimate(dayIdx);
  if(real)return{minutes:real.minutes,auto:true,real:true};
  return{minutes:tripDayAutoEstimate(dayIdx),auto:true,real:false};
}
/* Friendly "Xh Ym" display for a minutes value over an hour — the
   underlying <input> stays a plain minutes number (simplest to type/step
   into), this is purely the human-readable label shown alongside it. */
function fmtDriveMinutes(mins){
  if(mins==null)return'—';
  const m=Math.round(mins);
  if(m<60)return`${m} min`;
  const h=Math.floor(m/60),rem=m%60;
  return rem===0?`${h}h`:`${h}h ${rem}m`;
}
/* GOLF-34a: a plain suggested overnight place per day — no new data
   source/API. GOLF-150 I5: used to prefer the last course's nearest
   railway station name (stn/nearStation), which surfaced hamlets like
   "Golf Street" / "Leuchars" / "Drem" that read as mistakes. Now: the
   day's own place if it has one (short form), else the last course's
   name minus its layout parenthetical ("Carnoustie (Championship)" ->
   "Carnoustie"), else its region; null (rendered as nothing) otherwise. */
function tripDaySuggestedTown(day){
  if(day.place&&String(day.place).trim())return tripShortPlace(day.place);
  const cs=tripDayCourses(day);
  if(cs.length){
    const i=cs[cs.length-1];
    const n=String(V(i,'n')||'').replace(/\s*\([^)]*\)\s*/g,' ').trim();
    return tripShortPlace(n)||C[i].r||null;
  }
  return null;
}
/* GOLF-79's live "Show POI's" (Worker mode:'heritage-pois' → Overpass,
   cached in localStorage) was replaced by GOLF-148's pre-baked dataset —
   see js/poi.js. GOLF-156 then deleted that Worker mode (and mode:'pois')
   outright, so there is nothing left to fall back to. poiKey()/tbPoiPoint()
   below stay: the hotel picker uses them. */
function poiKey(lat,lng){return lat.toFixed(4)+','+lng.toFixed(4);}
function tbPoiPoint(day){
  const cs=tripDayCourses(day);
  if(cs.length){
    const i=cs[cs.length-1];
    return{lat:C[i].lat,lng:C[i].lng};
  }
  if(Number.isFinite(day.placeLat)&&Number.isFinite(day.placeLng))return{lat:day.placeLat,lng:day.placeLng};
  return null;
}
/* GOLF-96: "Add a stay" — zoom to the day's area and offer real nearby
   hotels to pick from, sourced from OpenStreetMap via the Worker's
   'hotels' mode (Overpass-only, no ORS_API_KEY dependency — works even
   while ORS itself is down). Mirrors the old tbHeritageFor()'s exact
   cache/dedupe/silent-fail contract; the picker panel (list + map
   markers) is a convenience layer in front of the existing
   tbAddStopFormHTML add-stay form, not a replacement for it — manual
   entry still works unchanged. */
const HOTELS_CACHE_KEY='golfmap:hotelscache:v1';
/* Memoised like the two caches above — same reasoning, same invalidation. */
let hotelsCacheMemo=null;
function hotelsCacheLoad(){
  if(hotelsCacheMemo)return hotelsCacheMemo;
  try{hotelsCacheMemo=JSON.parse(localStorage.getItem(HOTELS_CACHE_KEY)||'{}');}catch(e){hotelsCacheMemo={};}
  return hotelsCacheMemo;
}
function hotelsCacheSave(c){
  const t=orsCacheTrim(c,ORS_POI_CACHE_CAP);
  hotelsCacheMemo=t;
  try{localStorage.setItem(HOTELS_CACHE_KEY,JSON.stringify(t));}catch(e){}
}
let hotelsPending=new Set();
/* dayId currently showing the hotel picker, or null — one panel open at
   a time, same convention as tbAddStop. */
let tbHotelPickerFor=null;
function tbHotelsFor(day){
  if(!ORS_PROXY_URL)return null;
  const pt=tbPoiPoint(day);
  if(!pt)return null;
  const key=poiKey(pt.lat,pt.lng);
  const cache=hotelsCacheLoad();
  if(cache[key])return cache[key].pois;
  if(hotelsPending.has(key))return null;
  hotelsPending.add(key);
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'hotels',point:[pt.lng,pt.lat],radius:3000})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(data&&Array.isArray(data.pois)){
        const c=hotelsCacheLoad();
        c[key]={pois:data.pois,ts:Date.now()};
        hotelsCacheSave(c);
        if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
      }
    })
    .catch(()=>{ /* silent — on-demand only, no retry loop; panel just stays empty */ })
    .finally(()=>{hotelsPending.delete(key);});
  return null;
}
/* Opens the picker: jumps the map to the day's anchor point (falling
   back to opening the plain add-stay form immediately if the day has no
   resolvable point at all — a day with no course/place yet), and opens
   the search field (tbAddStop) at the same time as the nearby-hotel list
   so a visitor sees "search on top, candidates below" in one panel
   instead of a two-click reveal.
   GOLF-96 follow-up fix: this used to call map.flyTo(), whose animation
   does not reliably complete in some environments (confirmed against
   this project's own automated-preview testing, and matching the
   stakeholder's live report of the map failing to move here) — setView
   jumps instantly and has no animation to stall, same fix already
   applied to the nation-pill zoom. */
function tbOpenHotelPicker(dayId){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  const pt=tbPoiPoint(d);
  if(!pt){tbPromptHotel(dayId);return;}
  if(typeof showMobileMap==='function')showMobileMap();
  if(typeof map!=='undefined'&&map)map.setView([pt.lat,pt.lng],13);
  tbHotelPickerFor=dayId;
  tbAddStop={dayId,itemId:null,type:'hotel',name:'',price:'',lat:null,lng:null,nights:'1'};
  renderTripBuilder();tbDrawMap();
}
function tbCloseHotelPicker(){tbHotelPickerFor=null;tbAddStop=null;renderTripBuilder();tbDrawMap();}
/* GOLF-186: one ordered list of candidates, shared by the panel rows and
   the map pins, so "number 3 in the list" and "pin 3 on the map" are the
   same hotel — which is the only reason the numbering is worth having.
   Sorted by distance from the day's golf (tbPoiPoint), straight-line: the
   point is "which of these is nearest", and a driving matrix for 30
   candidates would be 30 Worker round-trips to reorder a list. */
function tbHotelCandidates(day){
  const pois=tbHotelsFor(day);
  if(!pois)return null;
  const pt=tbPoiPoint(day);
  return pois.map(p=>Object.assign({},p,{
    miles:pt?haversineMiles(pt.lat,pt.lng,p.lat,p.lng):null
  })).sort((a,b)=>(a.miles==null?1e9:a.miles)-(b.miles==null?1e9:b.miles));
}
function tbHotelMilesText(m){
  if(m==null)return'';
  return m<10?`${m.toFixed(1)} mi`:`${Math.round(m)} mi`;
}
/* GOLF-186: picking a candidate used to only pre-fill the add-stay form,
   so choosing a hotel took a tap on the row and then a tap on "Add" — the
   second tap asking for nothing the first hadn't already said. It now adds
   the stay outright and closes the picker; nights and price are editable in
   place on the day's stay slot afterwards, and removing it is one menu
   away, so there is nothing a confirm step was protecting against. Same
   commit path as the map layer's "Add to Day N" (js/hotel-layer.js), which
   is why both now land a visitor in identical state. */
function tbAddHotelCandidate(dayId,idx){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  const list=tbHotelCandidates(d);
  const p=list&&list[idx];if(!p)return;
  /* "Change" on a day that already has a stay means swap it, not stack a
     second hotel on the same night. tripDayUpdateStop() carries the change
     across every night of a multi-night booking, which is what a visitor
     means by changing where they are staying. */
  const cur=typeof tripDayStay==='function'?tripDayStay(d):null;
  if(cur){
    if(!tripDayUpdateStop(dayId,cur.id,{name:p.name,price:cur.price,lat:p.lat,lng:p.lng}))return;
  }else if(!tripDayAddStop(dayId,'hotel',p.name,null,p.lat,p.lng,1))return;
  tbHotelPickerFor=null;
  tbAddStop=null;
  renderTripBuilder();tbDrawMap(false);
  if(typeof mapFitDay==='function')mapFitDay(dayId); // GOLF-191 (AC 2): keep the new stop and the rest of its day in view
}
/* GOLF-96 follow-up: this used to be its own boxed panel (title + Close +
   a "search by name" footer button) sitting ABOVE the separate add-stay
   form, only reachable via a second click — reported live as "clicking
   add a stay should open a search bar on top and list a few options
   below," which this wasn't doing. tbOpenHotelPicker() now opens the
   search form (tbAddStopFormHTML) and this list together, and js/trip-ui.js
   renders the form first — so this is now just the "below" half: a plain
   "Nearby" heading plus the candidate rows, no box of its own, sharing
   the form's Cancel/Close instead of duplicating one. */
function tbHotelPickerHTML(day){
  if(tbHotelPickerFor!==day.id)return'';
  if(!ORS_PROXY_URL)return'';
  const pois=tbHotelCandidates(day);
  const body=pois==null
    ?`<p class="hint" style="margin:4px 0 0">Looking for nearby hotels…</p>`
    :!pois.length
      ?`<p class="hint" style="margin:4px 0 0">No hotels found nearby — search above instead.</p>`
      :`<div class="tb-poi-list tb-hotel-cands" style="padding-left:0">${pois.map((p,idx)=>{
          const mi=tbHotelMilesText(p.miles);
          return`<button type="button" class="tb-hotel-cand" onclick="tbAddHotelCandidate(${day.id},${idx})" title="Add ${esc(p.name)} to this day">
            <span class="tb-cand-num">${idx+1}</span>
            <span class="tb-cand-main"><span class="tb-cand-name">${esc(p.name)}</span>${p.category?`<span class="wt"> · ${esc(p.category)}</span>`:''}</span>
            ${mi?`<span class="tb-cand-dist">${mi}</span>`:''}
          </button>`;
        }).join('')}</div>`;
  return`<div class="tb-hotel-picker">
    <div class="tb-addstop-title">Nearby — tap one to add it</div>
    ${body}
  </div>`;
}
