/* ============================================================
   js/state.js — localStorage persistence (load/save/clear), the
   Explore filter state object, HOME, the map binding, and the initial
   loadStoredState() call.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
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
    tripDayNextId:Math.max(0,...tripDays.map(d=>d.id))+1
  };
}
function loadStoredState(){
  let raw;try{raw=localStorage.getItem(LS_KEY)}catch(e){return}
  if(!raw)return;
  let saved;try{saved=JSON.parse(raw)}catch(e){return}
  if(saved.edits)Object.assign(EDITS,saved.edits);
  (saved.played||[]).forEach(i=>PLAYED.add(i));
  (saved.want||[]).forEach(i=>WANT.add(i));
  if(saved.trips&&typeof saved.trips==='object'&&Object.keys(saved.trips).length){
    const nextTrips={};
    Object.entries(saved.trips).forEach(([id,t])=>{if(t&&typeof t==='object')nextTrips[id]=validateTripEntry(t)});
    if(Object.keys(nextTrips).length){
      trips=nextTrips;
      activeTripId=(typeof saved.activeTripId==='string'&&trips[saved.activeTripId])?saved.activeTripId:Object.keys(trips)[0];
    }
  }else if(Array.isArray(saved.trip)){
    trips={default:validateTripEntry({name:'My trip',trip:saved.trip,tripSeq:saved.tripSeq,tripDays:saved.tripDays})};
    activeTripId='default';
  }
  tripRestoreActive();
  if(saved.filters){['access','price','region','flag','arch'].forEach(k=>{
    (saved.filters[k]||[]).forEach(v=>state[k].add(v));});}
  // GOLF-69: fee range, same defensive "finite number or null" discipline
  // as every other saved field.
  if(saved.filters){
    const n=v=>typeof v==='number'&&isFinite(v)?v:null;
    state.feeMin=n(saved.filters.feeMin);state.feeMax=n(saved.filters.feeMax);
  }
  if(saved.q)state.q=saved.q;
  if(saved.sort)state.sort=saved.sort;
  // GOLF-81: which nation's courses the Explore list is gated to — 'gb'
  // (Great Britain: England/Scotland/Wales)/'ie'/'za', or null before any
  // pill has been picked.
  if(saved.nation==='gb'||saved.nation==='ie'||saved.nation==='za')state.nation=saved.nation;
  if(saved.mapCenter&&saved.mapZoom)restoredView={center:saved.mapCenter,zoom:saved.mapZoom};
}
function saveState(){
  try{
    tripSnapshotActive();
    const c=map?map.getCenter():null;
    localStorage.setItem(LS_KEY,JSON.stringify({
      edits:EDITS,
      played:[...PLAYED],want:[...WANT],trips,activeTripId,
      filters:{access:[...state.access],price:[...state.price],region:[...state.region],flag:[...state.flag],arch:[...state.arch],feeMin:state.feeMin,feeMax:state.feeMax},
      q:state.q,sort:state.sort,nation:state.nation,
      mapCenter:c?[c.lat,c.lng]:undefined,mapZoom:map?map.getZoom():undefined
    }));
  }catch(e){/* storage unavailable or full — persistence is best-effort */}
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
