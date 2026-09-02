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
const ORS_PROXY_URL='https://geofftheworker.stefand94.workers.dev/';
/* GOLF-50: v2 — the cached shape gained a route field. Bumping the key
   (rather than reusing v1) means any leg cached against the pre-GOLF-50
   Worker deploy (route missing from the response entirely) can't get
   stuck permanently believing "no geometry available" — v1 entries are
   simply abandoned, a fresh v2 cache starts empty and refetches as
   needed, same one-time cost as any other cache-key bump would have. */
const ORS_CACHE_KEY='golfmap:legcache:v2';
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
function orsCacheSave(c){orsCacheMemo=c;try{localStorage.setItem(ORS_CACHE_KEY,JSON.stringify(c));}catch(e){}}
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
function orsEnsureLeg(key,a,b){
  if(orsPending.has(key))return;
  orsPending.add(key);
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({origin:[a.lng,a.lat],destination:[b.lng,b.lat]})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(data&&typeof data.minutes==='number'){
        const c=orsCacheLoad();
        c[key]={minutes:Math.round(data.minutes),miles:data.miles!=null?Math.round(data.miles*10)/10:null,
          route:Array.isArray(data.route)?data.route:null,ts:Date.now()};
        orsCacheSave(c);
        if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else if(TRIP.size){tripDrawCart(false);}
      }
    })
    .catch(()=>{ /* silent — heuristic/straight-line fallback stays in place */ })
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
/* GOLF-56: place search (start/free/end day locations) via the same
   Worker's geocode mode. In-memory only (no localStorage cache — search
   text is transient/per-keystroke, not worth persisting) keyed by the
   raw query text; a fresh keystroke that repeats an earlier query in the
   same session is served from this map instead of re-hitting the proxy.
   cb(results|null) — null means "still loading/unavailable", same
   contract as the leg-estimate helpers above. */
const orsGeocodeCache=new Map();
function orsGeocode(text,cb){
  const q=text.trim();
  if(!ORS_PROXY_URL||!q){cb([]);return;}
  if(orsGeocodeCache.has(q)){cb(orsGeocodeCache.get(q));return;}
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'geocode',text:q})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      const results=Array.isArray(data&&data.results)?data.results:[];
      orsGeocodeCache.set(q,results);
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
/* GOLF-71 copy audit. This row used to end in one of four full sentences
   explaining where the number came from and what typing over it does
   ("real driving time via OpenRouteService — type a number to override",
   "estimated from straight-line distance — type a real number if you know
   it", …). The live/auto chip already says which of the two it is, and an
   editable number field already says it can be edited — so the sentences
   became the chip's own title tooltip and the visible copy is now just
   "Drive in" + the field + the chip. */
function tripDayDriveHTML(d,idx){
  if(idx<=0)return'';
  const eff=tripDayEffectiveDriveIn(idx);
  const chip=eff.auto
    ?(eff.minutes!=null
        ?(eff.real
            ?`<span class="tb-auto-chip tb-auto-chip-real" title="Real driving time from OpenRouteService. Type a number to override it.">live</span>`
            :`<span class="tb-auto-chip" title="Estimated from straight-line distance. Type a number to override it.">auto</span>`)
        :`<span class="tb-auto-chip" title="No estimate yet — add a stop to both this day and the one before it.">—</span>`)
    :`<span class="tb-auto-chip" title="Your own figure, overriding the estimate. Clear the field to go back to the estimate.">yours</span>`;
  return`<label class="tb-day-drive" title="Driving time into this day's first stop">Drive in
    <input type="number" min="0" step="5" value="${d.driveIn??''}" placeholder="${eff.auto&&eff.minutes!=null?eff.minutes:'—'}"
      onchange="tripDaySetDriveIn(${d.id},this.value===''?null:parseFloat(this.value));renderTripBuilder();"> min ${chip}</label>`;
}
/* GOLF-34a: a plain suggested overnight place per day — no new data
   source/API, just reuses whichever nearest-station name (stn/nearStation,
   both already carry a real place name, often a town) the day's LAST
   course already has, since that's roughly where the night starts.
   Falls back to the course's region if no station data exists at all;
   returns null (rendered as nothing) if neither is available. */
function tripDaySuggestedTown(day){
  const cs=tripDayCourses(day);
  if(cs.length){
    const i=cs[cs.length-1];
    const stnObj=STN[V(i,'stn')],near=C[i].nearStation,s=stnObj||near;
    if(s&&s.n)return s.n;
    return C[i].r||null;
  }
  if(day.place&&String(day.place).trim())return String(day.place).trim();
  return null;
}
/* GOLF-79 (renamed "Show POI's" — supersedes the old GOLF-46 practical
   food/fuel/lodging POI toggle, removed): wiki-notable (Wikipedia/Wikidata
   tagged) historic/tourism points near an overnight stop, via the same
   Cloudflare Worker proxy as GOLF-45's drive times, routed server-side to
   a mode:'heritage-pois' branch backed by OpenStreetMap's Overpass API.
   Same "inert until ORS_PROXY_URL is set" and "cache, don't re-fetch a
   view that hasn't changed" pattern as GOLF-45, so this never regresses
   anything when the proxy isn't configured.
   2026-09-02: query moved from a fixed 6-tag category whitelist to a
   wikipedia/wikidata tag-presence query (dropping unnamed results) — the
   cache key is bumped v1->v2 since the response for a given point can now
   differ from what an old cached entry holds, and there's no reliable way
   to tell "old-shape cached miss" from "genuinely nothing nearby" once the
   query itself has changed (same reasoning as ORS_CACHE_KEY's v1->v2 bump
   for GOLF-50). */
const HERITAGE_CACHE_KEY='golfmap:heritagecache:v2';
function heritageCacheLoad(){try{return JSON.parse(localStorage.getItem(HERITAGE_CACHE_KEY)||'{}');}catch(e){return{};}}
function heritageCacheSave(c){try{localStorage.setItem(HERITAGE_CACHE_KEY,JSON.stringify(c));}catch(e){}}
function poiKey(lat,lng){return lat.toFixed(4)+','+lng.toFixed(4);}
let heritagePending=new Set();
/* dayIds currently toggled "on" — pure UI state, not persisted, same as
   GOLF-44's cost-line checkboxes (resets to hidden on reload). */
let tbHeritageOn=new Set();
function tbPoiPoint(day){
  const cs=tripDayCourses(day);
  if(cs.length){
    const i=cs[cs.length-1];
    return{lat:C[i].lat,lng:C[i].lng};
  }
  if(Number.isFinite(day.placeLat)&&Number.isFinite(day.placeLng))return{lat:day.placeLat,lng:day.placeLng};
  return null;
}
/* Returns a cached heritage-POI array for this day's overnight point, or
   null if not yet known — mirrors tripDayRealEstimate()'s contract
   exactly (cache lookup -> null on miss + async fetch + cache +
   re-render, silent on failure) so a course/stop with genuinely nothing
   nearby just renders an empty list, never an error. */
function tbHeritageFor(day){
  if(!ORS_PROXY_URL)return null;
  const pt=tbPoiPoint(day);
  if(!pt)return null;
  const key=poiKey(pt.lat,pt.lng);
  const cache=heritageCacheLoad();
  if(cache[key])return cache[key].pois;
  if(heritagePending.has(key))return null;
  heritagePending.add(key);
  fetch(ORS_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'heritage-pois',point:[pt.lng,pt.lat],radius:3000})})
    .then(r=>r.ok?r.json():Promise.reject(new Error('proxy error '+r.status)))
    .then(data=>{
      if(data&&Array.isArray(data.pois)){
        const c=heritageCacheLoad();
        c[key]={pois:data.pois,ts:Date.now()};
        heritageCacheSave(c);
        if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
      }
    })
    .catch(()=>{ /* silent — on-demand only, no retry loop; toggle just stays empty */ })
    .finally(()=>{heritagePending.delete(key);});
  return null;
}
function tbToggleHeritage(dayId){
  if(tbHeritageOn.has(dayId))tbHeritageOn.delete(dayId);else tbHeritageOn.add(dayId);
  renderTripBuilder();tbDrawMap();
}
function tbAddHeritagePoi(dayId,idx){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  const pois=tbHeritageFor(d);
  const p=pois&&pois[idx];if(!p)return;
  tripDayAddStop(dayId,'poi',p.name,null,p.lat,p.lng);
  renderTripBuilder();tbDrawMap();
}
function tbHeritageListHTML(day){
  if(!tbHeritageOn.has(day.id))return'';
  if(!ORS_PROXY_URL)return'';
  const pois=tbHeritageFor(day);
  if(pois==null)return`<div class="tb-poi-list"><p class="hint" style="margin:4px 10px">Looking for things to do…</p></div>`;
  if(!pois.length)return`<div class="tb-poi-list"><p class="hint" style="margin:4px 10px">Nothing found nearby.</p></div>`;
  return`<div class="tb-poi-list">${pois.map((p,idx)=>`<div class="tb-poi-row"><span>${esc(p.name)}</span>${p.category?`<span class="wt">${esc(p.category)}</span>`:''}<button class="tb-btn is-sm is-icon" onclick="tbAddHeritagePoi(${day.id},${idx})" title="Add to trip">＋</button></div>`).join('')}</div>`;
}
