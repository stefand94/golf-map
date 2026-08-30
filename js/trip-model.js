/* ============================================================
   js/trip-model.js — the trip data model: the TRIP cart and tripSeq,
   tripDays with their ordered items, all day/item CRUD, drag-and-drop
   reordering, multi-trip snapshot/restore, and Trip Builder session
   state. No rendering lives here.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* GOLF-28: the trip cart — a Set, same pattern as PLAYED/WANT, for O(1)
   membership checks (popup badges, "in trip" state). GOLF-31: display/map
   order is a separate array, tripSeq, since a Set can't be reordered
   in place — new adds append to the end, tbMove() lets the visitor drag
   the order into whatever sequence they actually want to play, and that
   choice persists (it's no longer silently overwritten by a recomputed
   nearest-neighbour guess on every render). */
const TRIP=new Set();
let tripSeq=[];
let tripLastAdded=null;
/* GOLF-33: day-by-day schedule layered over the flat cart. Each day is
   {id, courses:[courseIndex,...], driveIn:minutes|null} — driveIn is a
   manually-entered estimate of the drive to reach this day's first stop
   from wherever the previous day ended (no per-course-within-a-day or
   hotel-to-course timing, per this round's scope). Days are identified by
   a stable `id` (not array position) specifically so a future revision
   can attach a real calendar date to a day object without restructuring
   anything already keyed on day order. A course can only be scheduled
   once it's in TRIP — this is an arrangement of the existing cart, not a
   separate selection step, so search-to-add/discovery keep feeding it the
   same way they feed the flat cart today. */
let tripDays=[];
let tripDayNextId=1;
/* GOLF-51: kind labels a day that isn't a round of golf — 'start'/'end'
   for arrival/departure days with no course, 'free' for a rest day — vs
   the default 'golf'. place is a free-text town/city name shown on the
   day header (e.g. "Arrive in Edinburgh").
   GOLF-56: place can now also carry real coordinates (placeLat/placeLng,
   from the geocode search box) — when set, the place becomes a genuine
   waypoint in the route/drive-time/fuel model (tripDayStops() below),
   not just a display label. A day typed by hand without picking a search
   result keeps placeLat/placeLng null and stays purely cosmetic, exactly
   as before this ticket. */
const TRIP_DAY_KINDS={golf:'Golf day',start:'Start point',free:'Free day',end:'End point'};
/* GOLF-63: a day's stops are now ONE ordered `items` array — the single
   source of truth, replacing the old parallel `courses[]` / `hotel` /
   `pois[]` trio. Each item is:
     {id, type:'golf', i:courseIndex}
     {id, type:'hotel'|'poi', name, price, lat, lng}
   `id` is a stable opaque string (not an array position), matching why
   tripDays itself is keyed by id — drag-reordering rewrites positions
   constantly, so nothing may be keyed on them. Coordinates on hotel/poi
   items are new this ticket and are what let a drive leg be computed to
   and from a hotel; they stay null when the visitor typed a plain name
   instead of picking a geocoded result, in which case that item simply
   contributes no leg (same graceful degradation as a day `place` with no
   placeLat/placeLng).
   Deliberate scope call: a day's `place` is NOT folded into items. It
   stays the day's own location/waypoint field (rendered in the day
   header, always the day's first stop), exactly as GOLF-56 defined it —
   folding it in would change how every existing saved day renders, which
   is the one thing this ticket's migration promises not to do. */
function tripItemNewId(){return 'it'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function tripDayAdd(){tripDays.push({id:tripDayNextId++,items:[],driveIn:null,date:null,kind:'golf',place:null,placeLat:null,placeLng:null});saveState();}
/* GOLF-66: "+ Add day" used to drop an anonymous, placeless day at the
   bottom and leave the visitor to notice the small place box and click
   into it. The stakeholder's ask was "when adding a day make it easier to
   add in a city — copy this from the search bar", so rather than build a
   second place-search UI this simply creates the day and hands focus to
   the place input that GOLF-56 already wired with the debounced
   orsGeocode() picker. The day is created first (not after a city is
   picked) deliberately: a day with no city is a legitimate, common thing
   — a rest day, a travel day — so the picker is an offer, not a gate.
   tbFocusDayPlace is transient one-shot page state, consumed by the
   place-box wiring in renderTripBuilder(). */
let tbFocusDayPlace=null;
function tbAddDayWithPlace(){
  tripDayAdd();
  tbFocusDayPlace=tripDays[tripDays.length-1].id;
  tbDayShown=tbFocusDayPlace;
  renderTripBuilder();tbDrawMap();
}
/* Every read of a day's items goes through here so a day that somehow
   arrived without the field (hand-edited localStorage, a future partial
   write) degrades to empty instead of throwing. */
function tripDayItems(d){return d&&Array.isArray(d.items)?d.items:[];}
/* GOLF-63 migration: an old-shape day (courses/hotel/pois, no items)
   flattens ONCE into items in exactly today's fixed render order —
   golf → poi → hotel (the "drive" row was always derived, never stored)
   — so every trip saved before this ticket looks pixel-identical on the
   first load after the upgrade, then behaves under free ordering from
   then on. Idempotent: a day that already has items is left alone. */
function tripDayMigrateItems(d){
  if(!d||typeof d!=='object')return d;
  if(Array.isArray(d.items)){delete d.courses;delete d.hotel;delete d.pois;return d;}
  const items=[];
  (Array.isArray(d.courses)?d.courses:[]).forEach(i=>items.push({id:tripItemNewId(),type:'golf',i}));
  (Array.isArray(d.pois)?d.pois:[]).forEach(p=>{
    if(p&&typeof p.name==='string'&&p.name.trim())
      items.push({id:tripItemNewId(),type:'poi',name:p.name.trim().slice(0,80),price:typeof p.price==='number'&&isFinite(p.price)?p.price:null,lat:null,lng:null});
  });
  if(d.hotel&&typeof d.hotel==='object'&&typeof d.hotel.name==='string'&&d.hotel.name.trim())
    // GOLF-74: priceType 'room' = the pre-GOLF-74 meaning of `price`, so this
    // migration remains total-preserving for every old trip.
    items.push({id:tripItemNewId(),type:'hotel',name:d.hotel.name.trim().slice(0,80),price:typeof d.hotel.price==='number'&&isFinite(d.hotel.price)?d.hotel.price:null,priceType:'room',guests:2,lat:null,lng:null});
  d.items=items;
  delete d.courses;delete d.hotel;delete d.pois;
  return d;
}
/* The course indices scheduled on a day, in item order — the read-side
   replacement for every former `d.courses` access. */
function tripDayCourses(d){return tripDayItems(d).filter(it=>it.type==='golf').map(it=>it.i);}
/* {lat,lng} for any item, or null when it has none (a hand-typed hotel/
   POI name). Everything routing-related funnels through this, so "does
   this stop contribute a drive leg?" is asked in exactly one place. */
function tripItemPoint(it){
  if(!it)return null;
  if(it.type==='golf')return C[it.i]?{lat:C[it.i].lat,lng:C[it.i].lng}:null;
  return(typeof it.lat==='number'&&isFinite(it.lat)&&typeof it.lng==='number'&&isFinite(it.lng))?{lat:it.lat,lng:it.lng}:null;
}
function tripItemName(it){
  if(!it)return'';
  return it.type==='golf'?(C[it.i]?V(it.i,'n'):'Unknown course'):(it.name||'');
}
function tripDayFindItem(dayId,itemId){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return null;
  return tripDayItems(d).find(it=>it.id===itemId)||null;
}
/* Append a hotel/POI item to a day. lat/lng are optional — passing them
   (from the geocode picker) is what turns the stop into a real routable
   waypoint; omitting them keeps the pre-GOLF-63 name-only behaviour. */
function tripDayAddStop(dayId,type,name,price,lat,lng,priceType,guests){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return null;
  if(!name||!String(name).trim())return null;
  if(!Array.isArray(d.items))d.items=[];
  const it={id:tripItemNewId(),type:type==='hotel'?'hotel':'poi',
    name:String(name).trim().slice(0,80),
    price:(typeof price==='number'&&isFinite(price))?price:null,
    lat:(typeof lat==='number'&&isFinite(lat))?lat:null,
    lng:(typeof lng==='number'&&isFinite(lng))?lng:null};
  /* GOLF-74: per-person-sharing pricing, hotels only. Written unconditionally
     (defaulting to 'room') so every hotel item created from here on has an
     explicit, self-describing shape; older saved items without the field are
     read as 'room' by tripItemPriceDetail(), same result. */
  if(it.type==='hotel'){
    it.priceType=priceType==='person'?'person':'room';
    it.guests=(typeof guests==='number'&&isFinite(guests)&&guests>0)?Math.round(guests):HOTEL_GUESTS_DEFAULT;
  }
  d.items.push(it);
  saveState();
  return it;
}
/* GOLF-73: in-place edit of a hotel/POI item — name, price, pricing basis and
   location. Golf items are deliberately NOT editable here: everything about a
   round comes from the course dataset (name, fee, coordinates), which has its
   own corrections editor, and the only per-trip fact a golf row carries — the
   day it sits on — is already changeable from the row's own day dropdown.
   Passing a null/blank name is a no-op rather than a silent delete. */
function tripDayUpdateStop(dayId,itemId,fields){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return null;
  const it=tripDayItems(d).find(x=>x.id===itemId);
  if(!it||(it.type!=='hotel'&&it.type!=='poi'))return null;
  const name=fields&&fields.name!=null?String(fields.name).trim():'';
  if(!name)return null;
  it.name=name.slice(0,80);
  it.price=(typeof fields.price==='number'&&isFinite(fields.price))?fields.price:null;
  it.lat=(typeof fields.lat==='number'&&isFinite(fields.lat))?fields.lat:null;
  it.lng=(typeof fields.lng==='number'&&isFinite(fields.lng))?fields.lng:null;
  if(it.type==='hotel'){
    it.priceType=fields.priceType==='person'?'person':'room';
    it.guests=(typeof fields.guests==='number'&&isFinite(fields.guests)&&fields.guests>0)?Math.round(fields.guests):HOTEL_GUESTS_DEFAULT;
  }
  saveState();
  return it;
}
function tripDayRemoveItem(dayId,itemId){
  const d=tripDays.find(d=>d.id===dayId);if(!d||!Array.isArray(d.items))return;
  d.items=d.items.filter(it=>it.id!==itemId);
  saveState();
}
/* Removes a course from whichever day (if any) currently holds it —
   called both when explicitly moving a course to a different day and
   when the course leaves the cart entirely, so tripDays never holds a
   dangling reference to a course no longer in TRIP. */
function tripDayRemoveCourse(i){tripDays.forEach(d=>{if(Array.isArray(d.items))d.items=d.items.filter(it=>!(it.type==='golf'&&it.i===i))});}
function tripDaySetCourse(i,dayId){
  tripDayRemoveCourse(i);
  if(dayId!=null){const d=tripDays.find(d=>d.id===dayId);if(d){if(!Array.isArray(d.items))d.items=[];d.items.push({id:tripItemNewId(),type:'golf',i});}}
  saveState();
}
/* GOLF-63: adding a hotel/POI used to be two stacked prompt() dialogs
   capturing a name and a price and nothing else — which is precisely why
   no drive leg could ever be computed to a hotel. This replaces them with
   an inline form using the same debounced orsGeocode() search-as-you-type
   picker already behind the day place-fields and the GOLF-61 unified
   search bar, so a picked result carries real coordinates onto the item.
   Typing a plain name and hitting Add still works exactly as before —
   that item just contributes no leg, same as an un-geocoded day place.
   tbAddStop is transient page state (one open form at a time, like
   tbPoiOn), deliberately not persisted. */
/* GOLF-73: the same transient state and the same form now serve BOTH adding
   and editing — an `itemId` on it is the only difference (null = add). Reusing
   one shape means the geocode search-as-you-type wiring, the coordinate
   handling and the price fields exist once, not twice. */
let tbAddStop=null;
function tbPromptHotel(dayId){tbAddStop={dayId,itemId:null,type:'hotel',name:'',price:'',priceType:'room',guests:HOTEL_GUESTS_DEFAULT,lat:null,lng:null};renderTripBuilder();}
function tbPromptPoi(dayId){tbAddStop={dayId,itemId:null,type:'poi',name:'',price:'',priceType:'room',guests:HOTEL_GUESTS_DEFAULT,lat:null,lng:null};renderTripBuilder();}
function tbEditStop(dayId,itemId){
  const it=tripDayFindItem(dayId,itemId);
  if(!it||(it.type!=='hotel'&&it.type!=='poi'))return;
  tbAddStop={dayId,itemId,type:it.type,name:it.name||'',
    price:it.price!=null?String(it.price):'',
    priceType:it.priceType==='person'?'person':'room',
    guests:tripHotelGuests(it),
    lat:it.lat!=null?it.lat:null,lng:it.lng!=null?it.lng:null};
  renderTripBuilder();
}
function tbAddStopCancel(){tbAddStop=null;renderTripBuilder();}
/* Reads whatever is currently typed back into tbAddStop, so a re-render
   triggered by the pricing toggle doesn't throw away in-progress input. */
function tbAddStopCapture(){
  if(!tbAddStop)return;
  const nameEl=document.getElementById('tb-addstop-name'),priceEl=document.getElementById('tb-addstop-price'),guestsEl=document.getElementById('tb-addstop-guests');
  if(nameEl&&nameEl.value!==tbAddStop.name){tbAddStop.name=nameEl.value;tbAddStop.lat=null;tbAddStop.lng=null;}
  if(priceEl)tbAddStop.price=priceEl.value;
  if(guestsEl&&guestsEl.value.trim())tbAddStop.guests=Math.max(1,parseInt(guestsEl.value,10)||HOTEL_GUESTS_DEFAULT);
}
function tbAddStopSetPriceType(v){
  if(!tbAddStop)return;
  tbAddStopCapture();
  tbAddStop.priceType=v==='person'?'person':'room';
  renderTripBuilder();
}
function tbAddStopCommit(){
  if(!tbAddStop)return;
  const s=tbAddStop;
  const nameEl=document.getElementById('tb-addstop-name');
  const priceEl=document.getElementById('tb-addstop-price');
  const guestsEl=document.getElementById('tb-addstop-guests');
  const name=nameEl?nameEl.value:s.name;
  if(!name||!name.trim()){if(nameEl)nameEl.focus();return;}
  const rawPrice=priceEl&&priceEl.value.trim()?parseFloat(priceEl.value):NaN;
  const price=Number.isFinite(rawPrice)?rawPrice:null;
  const guests=guestsEl&&guestsEl.value.trim()?parseInt(guestsEl.value,10):s.guests;
  /* Only keep the picked coordinates if the name still matches what was
     picked — typing over a geocoded pick makes those coordinates a lie.
     On an edit, `s.name` is seeded from the saved item, so leaving the name
     untouched keeps the item's existing coordinates. */
  const keepGeo=s.lat!=null&&s.lng!=null&&s.name&&name.trim()===s.name;
  const lat=keepGeo?s.lat:null,lng=keepGeo?s.lng:null;
  if(s.itemId)tripDayUpdateStop(s.dayId,s.itemId,{name,price,lat,lng,priceType:s.priceType,guests});
  else tripDayAddStop(s.dayId,s.type,name,price,lat,lng,s.priceType,guests);
  tbAddStop=null;
  renderTripBuilder();tbDrawMap();
}
/* GOLF-71 copy audit: the form used to carry a two-sentence footnote
   explaining what picking a search result does for drive times. The
   control makes that self-evident (you either picked a place or you
   typed a name), so the explanation moved into the input's own title=
   tooltip and the only visible feedback left is a one-word confirmation
   once a location IS set. Search field markup is the shared component.
   GOLF-73 adds the `itemId` argument: the same form renders both the
   day-footer "add" case (itemId undefined/null) and the in-place edit of
   one existing row (itemId = that row's id), so a day never shows the
   form twice. */
function tbAddStopFormHTML(dayId,itemId){
  if(!tbAddStop||tbAddStop.dayId!==dayId)return'';
  if((tbAddStop.itemId||null)!==(itemId===undefined?null:itemId))return'';
  const isHotel=tbAddStop.type==='hotel';
  const editing=!!tbAddStop.itemId;
  const person=isHotel&&tbAddStop.priceType==='person';
  const priceNum=parseFloat(tbAddStop.price);
  return`<div class="tb-addstop">
    <div class="tb-addstop-title">${editing?(isHotel?'Edit this stay':'Edit this stop'):(isHotel?'Add a stay':'Add a stop')}</div>
    ${tbSearchFieldHTML({id:'tb-addstop-name',value:tbAddStop.name,
      placeholder:isHotel?'Search a hotel…':'Search a place or landmark…',
      title:'Pick a search result to give this stop real coordinates, so drive times can be calculated to it. A plain typed name works too.'})}
    <div class="tb-addstop-row">
      <input class="tb-field" type="number" id="tb-addstop-price" min="0" step="5"
        placeholder="${isHotel?'£ / night — optional':'£ — optional'}" value="${esc(tbAddStop.price)}">
      ${/* GOLF-74 through GOLF-71's design system: same two-radio pricing
           basis and same conditional Guests field as before, re-expressed
           with the .tb-field input primitive and token-based .tb-pricetype /
           .tb-guests styles rather than inline widths. */
        isHotel?`<span class="tb-pricetype">
        <label><input type="radio" name="tb-pricetype" value="room" ${person?'':'checked'} onchange="tbAddStopSetPriceType('room')"> Per room / night</label>
        <label><input type="radio" name="tb-pricetype" value="person" ${person?'checked':''} onchange="tbAddStopSetPriceType('person')"> Per person sharing</label>
      </span>
      ${person?`<label class="tb-guests">Guests <input class="tb-field" type="number" id="tb-addstop-guests" min="1" max="12" step="1" value="${tbAddStop.guests}"></label>`:''}`:''}
    </div>
    ${person&&Number.isFinite(priceNum)?`<p class="hint" style="margin:var(--sp-2) 0 0">£${priceNum.toFixed(0)} × ${tbAddStop.guests} (sharing) = <b>£${(priceNum*tbAddStop.guests).toFixed(0)}</b> per night.</p>`:''}
    <div class="tb-addstop-row" style="margin-top:var(--sp-2)">
      <button class="tb-btn is-primary" onclick="tbAddStopCommit()">${editing?'Save':'Add'}</button>
      <button class="tb-btn is-quiet" onclick="tbAddStopCancel()">Cancel</button>
    </div>
    ${tbAddStop.lat!=null?`<p class="hint" style="margin:var(--sp-2) 0 0">📍 Location set</p>`:''}
  </div>`;
}
function tripDayRemove(dayId){
  tripDays=tripDays.filter(d=>d.id!==dayId);
  if(tbAddStop&&tbAddStop.dayId===dayId)tbAddStop=null;
  tbPoiOn.delete(dayId);
  tbHeritageOn.delete(dayId);
  saveState();
}
function tripDaySetDriveIn(dayId,mins){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  d.driveIn=(mins===''||mins==null||isNaN(mins))?null:Math.max(0,Math.round(mins));
  saveState();
}
/* GOLF-48: attaching a real date to a day is what lets the cost estimate
   pick the correct wd/we fee field for that day (see feeFieldForDate()) —
   entirely optional, defaults to null (pre-GOLF-48 wd-only behavior). */
function tripDaySetDate(dayId,value){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  d.date=(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))?value:null;
  saveState();
}
function tripDaySetKind(dayId,kind){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  d.kind=TRIP_DAY_KINDS[kind]?kind:'golf';
  saveState();
}
/* Manual free-text edit — clears any previously-geocoded coordinates,
   since typed-over text is no longer verified against a real place. Use
   tripDaySetPlaceGeo() below for picking a real search result instead. */
function tripDaySetPlace(dayId,value){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  d.place=(typeof value==='string'&&value.trim())?value.trim().slice(0,80):null;
  d.placeLat=null;d.placeLng=null;
  saveState();
}
/* GOLF-56: picking a real result from the place search box — sets both
   the display label and real coordinates, turning this day's place into
   a genuine routable waypoint (see tripDayStops()). */
function tripDaySetPlaceGeo(dayId,label,lat,lng){
  const d=tripDays.find(d=>d.id===dayId);if(!d)return;
  d.place=(typeof label==='string'?label.trim():'').slice(0,80)||null;
  d.placeLat=typeof lat==='number'&&isFinite(lat)?lat:null;
  d.placeLng=typeof lng==='number'&&isFinite(lng)?lng:null;
  saveState();
}
/* Courses in the cart not yet assigned to any day. */
function tripUnscheduled(){
  const scheduled=new Set(tripDays.flatMap(d=>tripDayCourses(d)));
  return tripSeq.filter(i=>!scheduled.has(i));
}
/* Google-Maps-stops-style drag reordering. tbDrag holds the course index
   currently being dragged (set on dragstart, cleared on drop). Dropping on
   a row moves the dragged course to just before that row, in that row's
   list (a day's `courses` array, or — for Unscheduled, which has no array
   of its own — a reordering of tripSeq itself, since tripUnscheduled()'s
   display order is simply "cart order minus whatever's scheduled").
   Dropping into a day ALSO reassigns the course to that day (or clears it
   to Unscheduled) in the same motion — matches how dragging a stop
   between lists reads on a map-based trip planner: one drag both places
   and orders it. */
/* GOLF-63: tbDrag used to be a bare course index, which is why only golf
   rounds were draggable. It now carries a ref — either
   {kind:'item', dayId, id} (a scheduled golf/hotel/POI item) or
   {kind:'course', i} (a wishlist course, which has no item of its own
   until it lands on a day) — so hotel and POI rows drag into any position
   alongside rounds through the exact same interaction, no new pattern. */
let tbDrag=null;
/* GOLF-69 (item 5): every dragstart/dragend in the pane funnels through
   these two so the "a drag is happening" flag lives in exactly one place.
   body.tb-dragging is what reveals the end-of-day drop zones and the
   dashed day outlines — the stakeholder's "highlight the area you are
   dropping it into once you have grabbed a course". dragend fires even on
   a cancelled/failed drop, so the flag can't get stuck on. */
function tbDragBegin(){document.body.classList.add('tb-dragging');}
function tbDragEnd(){
  document.body.classList.remove('tb-dragging');
  document.querySelectorAll('.tb-drop-over').forEach(el=>el.classList.remove('tb-drop-over'));
  document.querySelectorAll('.tb-drag-src').forEach(el=>el.classList.remove('tb-drag-src'));
  tbDrag=null;tbDayDrag=null;
}
/* ── GOLF-71 (workstream D) ────────────────────────────────────────────
   The stakeholder's "it doesn't seem to pick it up when I drag and drop
   it… it is a bit clunky". Four real defects were found in the GOLF-39/
   63/65 native-DnD wiring, all fixed here or in the row markup:

   1. No dataTransfer.setData() in any ondragstart. Chrome tolerates
      this; Firefox refuses to begin the drag at all, and even in Chrome
      a drag with an empty data store can be dropped by the OS layer.
      tbDragStart() below now always seeds a text/plain payload.
   2. Rows are draggable="true" but every golf row's name is an
      <a href="#">, and anchors are natively draggable. Grabbing the
      course NAME — by far the biggest, most obvious handle in the row —
      started a *link* drag carrying "#", which no drop target here
      accepts, so the row visibly refused to move. Same for selected
      text inside the row. Fixed with draggable="false" on the inner
      anchors plus user-select:none on the row (see <style>).
   3. dragleave fires when the pointer crosses onto a CHILD of the drop
      target, so the highlight flickered off and on continuously and the
      day-level highlight fought the row-level one. tbDropOut() now
      ignores a leave whose relatedTarget is still inside the element,
      and row-level dragover stops propagating.
   4. The end-of-day drop zone went display:none → display:flex at
      dragstart, which reflowed every card below it the instant a drag
      began — the target you aimed at moved out from under the cursor.
      It is position:absolute over the card's own bottom padding now
      (see <style>), so revealing it shifts nothing.

   On top of the fixes, "lift": the source element gets .tb-drag-src one
   tick after dragstart (synchronously would bake the effect into the
   browser's drag-image snapshot instead of the placeholder left behind),
   and whatever is under the pointer gets --shadow-dragging plus a solid
   3px accent insertion line. */
function tbDragStart(ev,el,label){
  try{ev.dataTransfer.setData('text/plain',label||'trip-item');}catch(e){}
  try{ev.dataTransfer.effectAllowed='move';}catch(e){}
  tbDragBegin();
  if(el)setTimeout(()=>{if(el.isConnected)el.classList.add('tb-drag-src');},0);
}
/* Per-target hover highlight. `ev` is optional: when passed to tbDropOut
   a dragleave onto a descendant is ignored (defect 3 above). */
function tbDropOver(el){if(el&&el.classList)el.classList.add('tb-drop-over');}
function tbDropOut(el,ev){
  if(!el||!el.classList)return;
  if(ev&&ev.relatedTarget&&el.contains(ev.relatedTarget))return;
  el.classList.remove('tb-drop-over');
}
function tbDragSetItem(dayId,id,ev,el){tbDrag={kind:'item',dayId,id};tbDayDrag=null;tbDragStart(ev,el,'item:'+id);}
function tbDragSetCourse(i,ev,el){tbDrag={kind:'course',i};tbDayDrag=null;tbDragStart(ev,el,'course:'+i);}
/* GOLF-65: dragging a WHOLE DAY. Deliberately a second, separate global
   rather than a third `kind` on tbDrag, because the two drags have
   different drop grammars — an item drop asks "before which row?", a day
   drop asks "before which day?" — and every existing tbDropOn() caller
   would otherwise have to learn about days. Instead every in-day drop
   handler funnels through tbDropInDay() below, which checks tbDayDrag
   first and falls through to the untouched item logic when it's null.
   Net: zero changes to tbDropOn()'s behaviour. */
let tbDayDrag=null;
function tbDayDragSet(dayId,ev,el){tbDayDrag=dayId;tbDrag=null;tbDragStart(ev,el&&el.closest?el.closest('.tb-day'):el,'day:'+dayId);}
/* A day's stored `driveIn` is a manual override of the leg driven INTO
   that day (GOLF-43) — it describes the gap between it and whatever day
   precedes it. Reordering changes which day that is, so an override that
   was entered against a different predecessor is now describing a leg
   that no longer exists. We clear the override on exactly those days
   whose predecessor changed (computed before/after, so an untouched
   day's hand-typed number survives a reorder elsewhere in the list) and
   let tripDayAutoEstimate() take over again. Dates are deliberately NOT
   touched: a date is the visitor's own fact about that day, not a
   derived property of its position. */
function tbDayPredecessors(){
  const m=new Map();
  tripDays.forEach((d,idx)=>m.set(d.id,idx>0?tripDays[idx-1].id:null));
  return m;
}
/* Move day `dragId` to sit immediately before `targetId` — or to the end
   when targetId is null. "Before the target" matches the item-drag
   convention above, so both drags read the same way. */
function tbDayMoveTo(dragId,targetId){
  if(dragId==null||dragId===targetId)return false;
  const from=tripDays.findIndex(d=>d.id===dragId);
  if(from<0)return false;
  const before=tbDayPredecessors();
  const moving=tripDays.splice(from,1)[0];
  const to=targetId==null?-1:tripDays.findIndex(d=>d.id===targetId);
  if(to<0)tripDays.push(moving);else tripDays.splice(to,0,moving);
  const after=tbDayPredecessors();
  tripDays.forEach(d=>{if(before.get(d.id)!==after.get(d.id))d.driveIn=null;});
  saveState();
  return true;
}
/* The single drop entry point for anything dropped inside a day block.
   A day being dragged wins (it's the coarser gesture and can only mean
   one thing); otherwise this is exactly the old tbDropOn() call. */
function tbDropInDay(dayId,beforeRef){
  if(tbDayDrag!=null){
    const drag=tbDayDrag;tbDayDrag=null;tbDragEnd();
    if(tbDayMoveTo(drag,dayId)){renderTripBuilder();tbDrawMap();}
    return;
  }
  tbDropOn(dayId,beforeRef===undefined?null:beforeRef);
}
/* Drop past the last day (the "+ Add day" bar) — the only way to move a
   day to the final position, since every day drop lands *before* its
   target. */
function tbDropDayAtEnd(){
  if(tbDayDrag==null){tbDragEnd();return;}
  const drag=tbDayDrag;tbDayDrag=null;tbDragEnd();
  if(tbDayMoveTo(drag,null)){renderTripBuilder();tbDrawMap();}
}
/* Drop target: a day (dayId) or the wishlist (dayId null), positioned
   before `beforeRef` — an item id when dropping into a day, a course
   index when dropping into the wishlist, or null to append. */
function tbDropOn(dayId,beforeRef){
  const drag=tbDrag;tbDrag=null;tbDayDrag=null; // GOLF-65: a day dropped outside any day block is a no-op, not a stuck drag
  tbDragEnd(); // GOLF-69: clears the body flag + any lingering hover highlights (drag captured above first)
  if(!drag)return;
  if(dayId==null){
    /* Wishlist: only golf can live here — it's a pool of courses, not of
       stops. A hotel/POI dragged out of a day has nowhere to go, so this
       is a deliberate no-op (the row snaps back) rather than a silent
       delete of something the visitor typed. */
    let i=null;
    if(drag.kind==='course')i=drag.i;
    else{
      const it=tripDayFindItem(drag.dayId,drag.id);
      if(!it||it.type!=='golf')return;
      i=it.i;
      tripDayRemoveItem(drag.dayId,drag.id);
    }
    if(i==null)return;
    tripDayRemoveCourse(i);
    tripSeq=tripSeq.filter(x=>x!==i);
    const idx=beforeRef!=null?tripSeq.indexOf(beforeRef):-1;
    if(idx>=0)tripSeq.splice(idx,0,i);else tripSeq.push(i);
  }else{
    const target=tripDays.find(d=>d.id===dayId);
    if(!target)return;
    if(!Array.isArray(target.items))target.items=[];
    let moving=null;
    if(drag.kind==='course'){
      moving={id:tripItemNewId(),type:'golf',i:drag.i};
      tripDayRemoveCourse(drag.i); // can't be on a day, but keeps the invariant honest
    }else{
      const src=tripDays.find(d=>d.id===drag.dayId);
      if(!src)return;
      const at=tripDayItems(src).findIndex(it=>it.id===drag.id);
      if(at<0)return;
      moving=src.items.splice(at,1)[0];
    }
    if(beforeRef===moving.id)return; // dropped on itself
    const idx=beforeRef!=null?target.items.findIndex(it=>it.id===beforeRef):-1;
    if(idx>=0)target.items.splice(idx,0,moving);else target.items.push(moving);
  }
  saveState();
  renderTripBuilder();
  tbDrawMap();
}
/* One-click "start over" — previously the only way to empty the cart was
   removing each course individually. Confirms first since it's
   destructive and (unlike most of this app's actions) not something a
   page reload undoes — the cleared state persists to localStorage too. */
function tripClearAll(){
  if(!TRIP.size)return;
  if(!confirm(`Clear all ${TRIP.size} course${TRIP.size===1?'':'s'} from your trip? This can't be undone.`))return;
  TRIP.clear();tripSeq=[];tripLastAdded=null;tbAnchor=null;tripDays=[];tripDayNextId=1;tbPoiOn.clear();tbHeritageOn.clear();
  tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null; // GOLF-65/66/67 transient state
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(false);}
  render();
}
function toggleTrip(i){
  /* GOLF-36 fix: tbAnchor previously only got set inside tbSelect() (the
     "pick a nearby suggestion" path) — adding a course straight from a
     popup's "Add to trip" button left the old anchor from a previous,
     already-cleared trip in place, so the discovery list kept showing
     courses near wherever that stale anchor was. Now every add/remove
     keeps tbAnchor in sync with the cart itself: adding anchors to the
     course just added; removing the currently-anchored course re-anchors
     to whatever's now last, or clears to null once the cart is empty. */
  if(TRIP.has(i)){
    TRIP.delete(i);tripSeq=tripSeq.filter(x=>x!==i);
    if(tripLastAdded===i)tripLastAdded=tripSeq.length?tripSeq[tripSeq.length-1]:null;
    if(tbAnchor===i)tbAnchor=tripSeq.length?tripSeq[tripSeq.length-1]:null;
    tripDayRemoveCourse(i); // GOLF-33: no orphaned day references once a course leaves the cart
  }
  else{
    /* GOLF-69 (item 8): same "the first thing added starts the trip, and
       the trip starts in Day 1" rule as tbAddToWishlist() — this is the
       other way a first course gets added (straight from a map popup on
       the Explore page), and it would be incoherent for the two paths to
       disagree about whether a trip has a Day 1 yet. */
    const fresh=!tripDays.length&&!tripSeq.length;
    TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;
    if(fresh){tripDayAdd();tripDaySetCourse(i,tripDays[0].id);tbDayShown=tripDays[0].id;}
  }
  saveState();render();
  /* GOLF-31: clicking "Add to trip" straight from a popup (not via the
     Trip Builder pane) previously gave no visible feedback beyond a small
     popup badge — the map itself never showed anything building. Now the
     cart's numbered route is always drawn/updated on the map, pane open
     or not, so a visitor can watch their trip take shape as they click
     through popups. render()'s tripBuilderOn hook already redraws it when
     the pane is open; this covers the "pane closed" case. */
  if(!tripBuilderOn)tripDrawCart(true);
}
/* Swap a cart course one place earlier/later in tripSeq. */
function tbMove(i,dir){
  const idx=tripSeq.indexOf(i),next=idx+dir;
  if(idx<0||next<0||next>=tripSeq.length)return;
  [tripSeq[idx],tripSeq[next]]=[tripSeq[next],tripSeq[idx]];
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(false);}
}

/* GOLF-42: multiple named trips, all local (no sharing/accounts). Rather
   than thread a tripId through every function that already reads/writes
   TRIP/tripSeq/tripDays/tripLastAdded/tbAnchor directly, `trips` holds a
   dictionary of named snapshots and the live globals above stay exactly
   what they were before this ticket: "the current trip's working state."
   tripSnapshotActive() copies the live globals into trips[activeTripId]
   (called from saveState(), so every existing mutation path — toggleTrip,
   tripDayAdd, tbDropOn, etc. — keeps every trip's stored snapshot
   fresh for free); tripRestoreActive() does the reverse when switching. */
let trips={default:{name:'My trip',created:Date.now(),modified:Date.now(),trip:[],tripSeq:[],tripDays:[],tripLastAdded:null,tbAnchor:null,tripDayNextId:1}};
let activeTripId='default';
function tripSnapshotActive(){
  if(!trips[activeTripId])trips[activeTripId]={name:'My trip',created:Date.now()};
  const t=trips[activeTripId];
  t.trip=[...TRIP];t.tripSeq=[...tripSeq];t.tripDays=JSON.parse(JSON.stringify(tripDays));
  t.tripLastAdded=tripLastAdded;t.tbAnchor=tbAnchor;t.tripDayNextId=tripDayNextId;
  t.modified=Date.now();
}
function tripRestoreActive(){
  const t=trips[activeTripId];
  TRIP.clear();(t&&t.trip||[]).forEach(i=>TRIP.add(i));
  tripSeq=t&&Array.isArray(t.tripSeq)?[...t.tripSeq]:[...TRIP];
  // GOLF-63: migrate defensively here too — a snapshot can also arrive from
  // tripDuplicate()'s deep copy, not only from the validated load path.
  tripDays=(t&&Array.isArray(t.tripDays)?JSON.parse(JSON.stringify(t.tripDays)):[]).map(tripDayMigrateItems);
  tripLastAdded=t?(t.tripLastAdded??null):null;
  tbAnchor=t?(t.tbAnchor??null):null;
  tripDayNextId=t&&t.tripDayNextId?t.tripDayNextId:(Math.max(0,...tripDays.map(d=>d.id))+1);
}
/* Fresh course count per trip needs the active trip's own snapshot to be
   current, hence the snapshot call here too — cheap and idempotent. */
function tripListAll(){
  tripSnapshotActive();
  return Object.entries(trips).map(([id,t])=>({id,name:t.name||'My trip',count:(t.trip||[]).length,modified:t.modified||0}))
    .sort((a,b)=>b.modified-a.modified);
}
function tripSwitchTo(id){
  if(id===activeTripId||!trips[id])return;
  tripSnapshotActive();activeTripId=id;tripRestoreActive();
  // GOLF-60b: tbSearchQ/tbPlaceAnchor are page-session globals outside the
  // per-trip snapshot — reset them on every lifecycle transition so a
  // switched-to trip never inherits stale search text/anchor from whatever
  // trip was active before.
  tbSearchQ='';tbPlaceAnchor=null;tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null;
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(true);}
  render();
}
function tripCreateNew(){
  const name=prompt('Name this trip:','New trip');
  if(name==null)return;
  tripSnapshotActive();
  const id='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  trips[id]={name:name.trim()||'Untitled trip',created:Date.now(),modified:Date.now(),trip:[],tripSeq:[],tripDays:[],tripLastAdded:null,tbAnchor:null,tripDayNextId:1};
  activeTripId=id;tripRestoreActive();
  // GOLF-58: a brand-new trip has nothing to anchor "nearby" from yet —
  // land straight on the "search a place" starting point instead of an
  // empty Nearby list with no obvious next step.
  // GOLF-60b: also clear tbSearchQ (previously only tbPlaceAnchor was reset
  // here) so no stale search text carries over into the new trip either.
  // GOLF-64: a brand-new trip always drops you back at the start of the
  // workflow — and via setAppMode(), so the URL follows the mode instead of
  // leaving a stale #trip pointing at Plan-mode content.
  tbDiscoveryTab='place';tbPlaceAnchor=null;tbSearchQ='';
  saveState();
  if(tripBuilderOn)setAppMode('plan');
  render();
}
function tripRename(id){
  if(!trips[id])return;
  const name=prompt('Rename trip:',trips[id].name);
  if(name==null||!name.trim())return;
  trips[id].name=name.trim();trips[id].modified=Date.now();
  saveState();
  if(tripBuilderOn)renderTripBuilder();
}
function tripDuplicate(id){
  tripSnapshotActive();
  const src=trips[id];if(!src)return;
  const newId='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  trips[newId]=JSON.parse(JSON.stringify(src));
  trips[newId].name=(src.name||'My trip')+' (copy)';
  trips[newId].created=Date.now();trips[newId].modified=Date.now();
  activeTripId=newId;tripRestoreActive();
  tbSearchQ='';tbPlaceAnchor=null;tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null; // GOLF-60b
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
  render();
}
function tripDelete(id){
  if(!trips[id])return;
  if(Object.keys(trips).length<=1){alert("You need at least one trip — clear it instead of deleting it.");return;}
  if(!confirm(`Delete "${trips[id].name}"? This can't be undone.`))return;
  delete trips[id];
  if(activeTripId===id){activeTripId=Object.keys(trips)[0];tripRestoreActive();}
  tbSearchQ='';tbPlaceAnchor=null;tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null; // GOLF-60b
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
  render();
}
/* GOLF-60a: "Start fresh" — the only prior way to get a guaranteed-empty
   trip was wipeStoredState() (buried in the unrelated corrections/export
   drawer, copy never mentions trips) or repeatedly deleting down through
   whatever trips existed (tripDelete() only ever deletes the *active*
   trip and falls back to another leftover one). This is the one-click
   "wipe every trip, start with exactly one guaranteed-empty one," reachable
   from inside the Trip Builder pane itself. */
function tripStartFresh(){
  if(!confirm('Start fresh? This deletes every saved trip on this device and creates one new, empty trip. This cannot be undone.'))return;
  trips={default:{name:'My trip',created:Date.now(),modified:Date.now(),trip:[],tripSeq:[],tripDays:[],tripLastAdded:null,tbAnchor:null,tripDayNextId:1}};
  activeTripId='default';tripRestoreActive();
  tbSearchQ='';tbPlaceAnchor=null;tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null;tbAnchor=null;tbDayShown=null;tbDiscoveryTab='place';
  saveState();
  if(tripBuilderOn)setAppMode('plan'); // GOLF-64: URL follows the mode
  render();
}
/* GOLF-71: the trip switcher was a <select> plus five permanently-visible
   buttons (New / Duplicate / Rename / Delete / Start fresh) eating a whole
   row of the pane — the stakeholder's "you can save space by hiding things
   in drop down menus" applied literally. It is now one control labelled
   with the trip's own name; switching trips is the top section (the common
   case, one click), and the rarely-used management actions sit under it.

   "Clear trip" (empty THIS trip, keep it) stays out here in the toolbar
   next to the dropdown, matching the sketch. "Start fresh" (delete EVERY
   trip) is deliberately the last item inside the menu, styled destructive
   and worded so the difference is unmissable — they are different actions
   and both stay available, per the brief. */
function tbTripMenuHTML(){
  const list=tripListAll();
  const active=list.find(t=>t.id===activeTripId);
  const rows=list.map(t=>`<button type="button" class="tb-menu-item" onclick="tripSwitchTo('${t.id}')">${t.id===activeTripId?'✓':'&nbsp;&nbsp;'} ${esc(t.name)}</button>`).join('');
  return`<details class="tb-drop" id="tb-trip-drop">
    <summary title="Switch or manage trips">${esc(active?active.name:'Trip')}</summary>
    <div class="tb-drop-body">
      ${list.length>1?`<div class="tb-menu-label">Your trips</div>${rows}<div class="tb-menu-sep"></div>`:''}
      <button type="button" class="tb-menu-item" onclick="tripCreateNew()">＋ New trip</button>
      <button type="button" class="tb-menu-item" onclick="tripRename(activeTripId)">✎ Rename</button>
      <button type="button" class="tb-menu-item" onclick="tripDuplicate(activeTripId)">⧉ Duplicate</button>
      ${list.length>1?`<button type="button" class="tb-menu-item is-danger" onclick="tripDelete(activeTripId)">🗑 Delete this trip</button>`:''}
      <div class="tb-menu-sep"></div>
      <button type="button" class="tb-menu-item is-danger" onclick="tripStartFresh()" title="Deletes every trip, not just this one, and leaves you with one empty trip">⟲ Start fresh — delete all trips</button>
    </div>
  </details>`;
}
/* Kept as a thin alias: tripSwitcherHTML() is referenced from older code
   paths and the plan file's history. */
function tripSwitcherHTML(){return tbTripMenuHTML();}

/* GOLF-31: Trip Builder pane state — a persistent left-pane mode (see
   .tb-pane/body.trip-mode in <style>), not a modal. tbAnchor seeds the
   "nearby" discovery list and moves forward to whatever was most recently
   added, so picking Dornoch -> Castle Stuart -> Nairn keeps the discovery
   list walking up the coast rather than staying anchored to the first pick. */
let tripBuilderOn=false,tbAnchor=null,tbDiscoveryTab='anchor';
/* GOLF-58: "start a trip by searching a place" — a plain {label,lat,lng}
   (via the same ORS geocode endpoint the day-place boxes already use),
   not tied to any course. Lets a brand-new trip begin "take me to
   Newquay, show me what's around it" instead of requiring an existing
   course to anchor from. */
let tbPlaceAnchor=null;
/* GOLF-37: free-text search-to-add inside the pane itself, reusing the
   main list's searchMatches()/levenshtein() fuzzy logic rather than a new
   scoring scheme — so "type a name, hit Add" behaves consistently with
   the main search box elsewhere in the app. */
let tbSearchQ='';
/* GOLF-61: debounce handle for the unified search bar's place geocode call
   — module-level so it survives across the renderTripBuilder() closures
   that redefine the input handler on every full re-render. */
let tbUnifiedSearchGeoDebounce=null;
