/* ============================================================
   js/state.js — localStorage persistence (load/save/clear), the
   Explore filter state object, HOME, the map binding, and the initial
   loadStoredState() call.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in index.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* ---- persistence (GOLF-9): filters, map view and corrections survive
   a reload via localStorage. The JSON export/import flow below stays
   as the manual backup path — this is just a convenience cache. ---- */
const LS_KEY='golfmap:v1';
let restoredView=null;
/* Hoisted out of loadStoredState() so scripts/test_trip.js can exercise
   the save->load round trip directly. Behaviour unchanged. */
/* GOLF-42: multiple named trips. Two shapes handled: the current
   {trips:{id:{...}},activeTripId} shape, validated defensively per
   trip exactly like the old single-trip validation used to; and a
   one-time migration from the pre-GOLF-42 flat {trip,tripSeq,tripDays}
   shape, wrapped into a single "My trip" entry so nobody's in-progress
   trip is lost when this ships. A brand-new visitor with neither key
   just keeps the empty default trip the globals already start with. */
function validateTripEntry(t){
  const trip=Array.isArray(t.trip)?t.trip.filter(i=>Number.isInteger(i)&&C[i]):[];
  const validSet=new Set(trip);
  const tripSeq=(Array.isArray(t.tripSeq)&&t.tripSeq.length===validSet.size&&t.tripSeq.every(i=>validSet.has(i)))?t.tripSeq.slice():[...validSet];
  /* GOLF-63: a saved day may be either shape — the new `items` array, or
     the pre-GOLF-63 courses/hotel/pois trio. Both are accepted here;
     tripDayMigrateItems() below folds the old one into the new one once,
     in today's exact render order, so an existing saved trip looks
     identical on the first load after this upgrade. */
  const validItems=(d)=>{
    if(!Array.isArray(d.items))return null;
    return d.items.filter(it=>it&&typeof it==='object'&&typeof it.id==='string').map(it=>{
      if(it.type==='golf')return validSet.has(it.i)?{id:it.id,type:'golf',i:it.i}:null;
      if(it.type!=='hotel'&&it.type!=='poi')return null;
      if(typeof it.name!=='string'||!it.name.trim())return null;
      const out={id:it.id,type:it.type,name:it.name.trim().slice(0,80),
        price:typeof it.price==='number'&&isFinite(it.price)?it.price:null,
        lat:typeof it.lat==='number'&&isFinite(it.lat)?it.lat:null,
        lng:typeof it.lng==='number'&&isFinite(it.lng)?it.lng:null};
      // GOLF-91: hotel price is read as per-person-per-night, multiplied by
      // the trip's groupSizeFor() (see tripItemPriceDetail() in trip-geo.js)
      // — any old priceType/guests fields on a saved item are simply ignored.
      // GOLF-96: nights/stayId link every night of one multi-night stay —
      // absent on any older/single-night item, which reads as nights:1,
      // stayId:null everywhere they're consumed.
      if(it.type==='hotel'){
        out.nights=(typeof it.nights==='number'&&isFinite(it.nights)&&it.nights>1)?Math.min(30,Math.round(it.nights)):1;
        out.stayId=typeof it.stayId==='string'?it.stayId:null;
      }
      return out;
    }).filter(Boolean);
  };
  const tripDays=Array.isArray(t.tripDays)?t.tripDays.filter(d=>d&&typeof d.id!=='undefined'&&(Array.isArray(d.items)||Array.isArray(d.courses)))
    .map(d=>tripDayMigrateItems({id:d.id,
      items:validItems(d),
      courses:Array.isArray(d.courses)?d.courses.filter(i=>validSet.has(i)):[],
      driveIn:typeof d.driveIn==='number'?d.driveIn:null,
      /* GOLF-48: optional real calendar date (YYYY-MM-DD), user-entered.
         Validated as a plain well-formed date string here — actual use
         (picking wd vs we for the cost estimate) lives in
         feeFieldForDate(). Absent/invalid -> null, same as pre-GOLF-48
         behavior (always wd). */
      date:(typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))?d.date:null,
      /* GOLF-51: kind/place — see TRIP_DAY_KINDS.
         GOLF-56: placeLat/placeLng are optional real coordinates from
         the geocode search — validated as finite numbers or null, same
         defensive pattern as every other saved field. A place with no
         coordinates stays exactly the pre-GOLF-56 display-only label. */
      kind:TRIP_DAY_KINDS[d.kind]?d.kind:'golf',
      place:(typeof d.place==='string'&&d.place.trim())?d.place.trim().slice(0,80):null,
      placeLat:typeof d.placeLat==='number'&&isFinite(d.placeLat)?d.placeLat:null,
      placeLng:typeof d.placeLng==='number'&&isFinite(d.placeLng)?d.placeLng:null,
      /* GOLF-57: manually-entered hotel/POI stops — same defensive
         validation discipline as every other saved field. */
      hotel:(d.hotel&&typeof d.hotel==='object'&&typeof d.hotel.name==='string'&&d.hotel.name.trim())
        ?{name:d.hotel.name.trim().slice(0,80),price:typeof d.hotel.price==='number'&&isFinite(d.hotel.price)?d.hotel.price:null}:null,
      pois:Array.isArray(d.pois)?d.pois.filter(p=>p&&typeof p.name==='string'&&p.name.trim())
        .map(p=>({name:p.name.trim().slice(0,80),price:typeof p.price==='number'&&isFinite(p.price)?p.price:null})):[]})):[];
  return{
    name:typeof t.name==='string'&&t.name.trim()?t.name.trim():'My trip',
    created:typeof t.created==='number'?t.created:Date.now(),
    modified:typeof t.modified==='number'?t.modified:Date.now(),
    trip,tripSeq,tripDays,
    tripLastAdded:validSet.has(t.tripLastAdded)?t.tripLastAdded:null,
    tbAnchor:validSet.has(t.tbAnchor)?t.tbAnchor:null,
    /* GOLF-87: how many travellers this trip is for. tripSnapshotActive()
       has always written it, but this whitelist used to drop it on load —
       so group size silently reset to 2 on every reload. Validated like
       every other saved field: finite integer, clamped 1–16, default 2. */
    groupSize:(typeof t.groupSize==='number'&&isFinite(t.groupSize))?Math.min(16,Math.max(1,Math.round(t.groupSize))):2,
    /* GOLF-203: the trip's own "Other" cost lines, validated with the same
       defensive discipline as every other saved field — absent (every trip
       saved before this shipped) reads as none. */
    tripCustom:(Array.isArray(t.tripCustom)?t.tripCustom:[]).slice(0,40).map(c=>{
      if(!c||typeof c!=='object')return null;
      return{
        id:(typeof c.id==='string'&&c.id)?c.id.slice(0,64):('cc'+Math.random().toString(36).slice(2,10)),
        label:typeof c.label==='string'?c.label.slice(0,80):'',
        amount:(typeof c.amount==='number'&&isFinite(c.amount))?Math.min(1e6,Math.max(0,c.amount)):null,
        per:c.per==='person'?'person':'group',
        cur:(typeof c.cur==='string'&&CURRENCY_SYMS[c.cur])?c.cur:'GBP'};
    }).filter(Boolean),
    tripDayNextId:Math.max(0,...tripDays.map(d=>d.id))+1
  };
}
/* GOLF-224/DEC-037: saved trips survive a release. Until this ticket,
   GOLF-132/DEC-011 compared APP_VERSION with a stored copy of it and wiped
   every visitor's trips whenever a deploy changed. DEC-037 ends that: the
   stored format is migratable in every direction we ship — GOLF-163's
   index->id references, the pre-GOLF-42 flat {trip,tripSeq,tripDays} shape,
   the pre-GOLF-63 day shape — so a new release migrates what it finds
   instead of deleting it. Gone with the wipe: DEPLOY_VERSION_KEY and
   tbDeployVersionChanged(), which nothing else read. A stale
   'golfmap:deployversion' key left behind in an existing visitor's browser
   is inert.
   The deploy *freshness* machinery is deliberately untouched: index.html's
   GOLF-210/220 build check still clears another build's caches, refetches
   every ?v= script and reloads once, and sw.js still versions its cache by
   content hash. Only the data wipe went. */

/* GOLF-224: a stored section that cannot be read must cost only that
   section. Every part of the load below runs through this, so a corrupt
   trip, an unreadable corrections map or a broken filter block drops
   itself and leaves the rest — and the app still finishes loading.
   console.warn, not an error: there is nothing here a visitor can act on,
   and a thrown error at this point would abort the rest of the load. */
function loadPart(label,fn){
  try{return fn()}
  catch(e){console.warn('golfmap: ignoring unreadable saved '+label+' — the rest of your saved data is unaffected.',e);return undefined}
}
function loadStoredState(){
  let raw;try{raw=localStorage.getItem(LS_KEY)}catch(e){return}
  if(!raw)return;
  let saved;try{saved=JSON.parse(raw)}catch(e){saved=null}
  /* A payload that isn't a plain object is unreadable as a whole — there is
     no smaller piece left to keep — so this is the one case that drops the
     key, rather than leaving a blob that fails again on every future load.
     (A bare string is the shape the old double-stringify bug left behind;
     see the quota retry in saveState().) */
  if(!saved||typeof saved!=='object'||Array.isArray(saved)){
    console.warn('golfmap: your saved data could not be read at all and has been reset.');
    clearStoredState();
    return;
  }
  /* GOLF-163: course references are stored as stable ids now, not array
     indices. Every one of these decodes goes through courseRefDecode(),
     which accepts both the id form and the old numeric form (resolved via
     the frozen index->id table) — so a visitor who last used the site
     before ids shipped keeps their trip, their corrections and their
     played/want marks. `null` means "that course no longer exists", which
     is dropped exactly as an out-of-range index always was. */
  loadPart('corrections',()=>{if(saved.edits)Object.assign(EDITS,courseDecodeKeyed(saved.edits))});
  loadPart('played list',()=>{(saved.played||[]).forEach(r=>{const i=courseRefDecode(r);if(i!==null)PLAYED.add(i)})});
  loadPart('want-to-play list',()=>{(saved.want||[]).forEach(r=>{const i=courseRefDecode(r);if(i!==null)WANT.add(i)})});
  /* GOLF-198: one course saved under both its records, marked played
     under one and want under the other — played wins, as togglePlayed()
     would have made it. */
  PLAYED.forEach(i=>WANT.delete(i));
  /* GOLF-224: decoded and validated one trip at a time, so a single
     unreadable trip costs that trip and not the whole list. */
  let nextTrips=null;
  if(saved.trips&&typeof saved.trips==='object'){
    const acc={};
    Object.entries(saved.trips).forEach(([id,t])=>{
      if(!t||typeof t!=='object')return;
      const v=loadPart('trip "'+id+'"',()=>validateTripEntry(courseDecodeTripEntry(t)));
      if(v)acc[id]=v;
    });
    if(Object.keys(acc).length)nextTrips=acc;
  }
  if(nextTrips){
    trips=nextTrips;
    activeTripId=(typeof saved.activeTripId==='string'&&trips[saved.activeTripId])?saved.activeTripId:Object.keys(trips)[0];
  }else if(Array.isArray(saved.trip)){
    /* The pre-GOLF-42 flat shape, wrapped into a single "My trip" entry. */
    const v=loadPart('trip',()=>validateTripEntry(courseDecodeTripEntry({name:'My trip',trip:saved.trip,tripSeq:saved.tripSeq,tripDays:saved.tripDays})));
    if(v){trips={default:v};activeTripId='default';}
  }
  tripRestoreActive();
  loadPart('filters',()=>{
    if(saved.filters){
      ['access','price','region','flag','arch'].forEach(k=>{
        (saved.filters[k]||[]).forEach(v=>state[k].add(v));});
      // GOLF-69: fee range, same defensive "finite number or null" discipline
      // as every other saved field.
      const n=v=>typeof v==='number'&&isFinite(v)?v:null;
      state.feeMin=n(saved.filters.feeMin);state.feeMax=n(saved.filters.feeMax);
    }
    if(typeof saved.q==='string')state.q=saved.q;
    if(typeof saved.sort==='string')state.sort=saved.sort;
    // GOLF-81: which nation's courses the Explore list is gated to — 'gb'
    // (Great Britain: England/Scotland/Wales)/'ie'/'za', or null before any
    // pill has been picked.
    if(saved.nation==='gb'||saved.nation==='ie'||saved.nation==='za')state.nation=saved.nation;
  });
  loadPart('map view',()=>{if(saved.mapCenter&&saved.mapZoom)restoredView={center:saved.mapCenter,zoom:saved.mapZoom}});
}
function saveState(){
  let payload;
  try{
    tripSnapshotActive();
    const c=map?map.getCenter():null;
    /* GOLF-163: written as stable ids, so a future reorder of C[] cannot
       silently turn someone's saved trip into a different one. The runtime
       globals stay index-based — the translation lives only here and in
       loadStoredState(), which is the whole point of keeping it to the
       storage boundary. */
    const encTrips={};
    Object.entries(trips).forEach(([id,t])=>{encTrips[id]=courseEncodeTripEntry(t)});
    payload=JSON.stringify({
      cidv:1,
      edits:courseEncodeKeyed(EDITS),
      played:[...PLAYED].map(courseRefEncode),want:[...WANT].map(courseRefEncode),
      trips:encTrips,activeTripId,
      filters:{access:[...state.access],price:[...state.price],region:[...state.region],flag:[...state.flag],arch:[...state.arch],feeMin:state.feeMin,feeMax:state.feeMax},
      q:state.q,sort:state.sort,nation:state.nation,
      mapCenter:c?[c.lat,c.lng]:undefined,mapZoom:map?map.getZoom():undefined
    });
    localStorage.setItem(LS_KEY,payload);
  }catch(e){
    /* Persistence is best-effort, but it used to be silently best-effort:
       an empty catch here meant that once the origin's quota was full,
       every trip edit from then on was quietly discarded — the trip looked
       saved and came back empty on the next reload, with nothing in the
       console to explain it.
       The likeliest thing filling that quota is our own ORS/POI caches
       (js/ors.js), which are pure derived data and safe to throw away —
       so on a quota error, drop them and retry the write once. Anything
       else (or a still-failing retry) is warned about rather than
       swallowed. The three keys are named as literals deliberately: this
       module loads before js/ors.js, and this must work even if that
       module failed to load at all. */
    const quota=payload!==undefined&&e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);
    if(quota){
      try{
        ['golfmap:legcache:v2','golfmap:heritagecache:v4','golfmap:hotelscache:v1'].forEach(k=>localStorage.removeItem(k));
        if(typeof orsCacheMemo!=='undefined')orsCacheMemo=null;
        if(typeof hotelsCacheMemo!=='undefined')hotelsCacheMemo=null;
        /* `payload` is already the JSON string — JSON.stringify()ing it
           again wrote a quoted string into LS_KEY, which JSON.parse()s
           back to a string and then silently loses every field on the
           next load. Noticed while adding the id encoding above; it only
           ever fired on the quota-retry path, which is exactly where a
           silent total loss is least likely to be noticed. */
        localStorage.setItem(LS_KEY,payload);
        return;
      }catch(e2){
        console.warn('golfmap: could not save to localStorage even after clearing the route/POI caches — this session\'s changes will not persist.',e2);
        return;
      }
    }
    console.warn('golfmap: could not save to localStorage — this session\'s changes will not persist.',e);
  }
}
function clearStoredState(){try{localStorage.removeItem(LS_KEY)}catch(e){}}

const HOME=[51.5467873,-0.1798875];
/* GOLF-22: default sort was "by area" — REGIONS appends the 5 Top-100-only
   regions after the 8 original London ones, so a course like Royal Birkdale
   ended up literally last of 221 in the default view. "by name" interleaves
   everything instead, so nothing is structurally buried by default. */
/* GOLF-69: `price` (the old band-chip Set) is retired in favour of
   feeMin/feeMax — null on either side meaning "no bound on this end". The
   key itself is kept in the shape so a localStorage payload written by an
   older build still loads without special-casing; nothing reads it. */
// GOLF-81: nation:null means "no country picked yet" — the Explore list
// stays empty until one of the three pills is clicked (see render() in
// js/explore.js); once set, the list is gated to that nation and sorted
// by ranking.
const state={access:new Set(),price:new Set(),region:new Set(),flag:new Set(),arch:new Set(),q:"",sort:"name",feeMin:null,feeMax:null,nation:null};
let map; // assigned below; loadStoredState reads state before map exists
loadStoredState();
