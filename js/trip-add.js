/* ============================================================
   js/trip-add.js — adding things to a trip: the pane's search results,
   wishlist/day adds, place anchoring and add-a-city, and the draggable
   course/item row HTML.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* GOLF-37: search results for the pane's own search box — bookable courses
   not already in the cart, matching tbSearchQ via the existing fuzzy
   searchMatches(), capped so a broad query doesn't dump the whole dataset. */
function tbSearchResults(){
  const q=tbSearchQ.trim().toLowerCase();
  if(!q)return[];
  return C.map((c,i)=>i).filter(i=>!TRIP.has(i)&&bookable(i)&&searchMatches(i,q)
    &&(!state.nation||courseNation(i)===state.nation)).slice(0,20);
}
/* GOLF-92: place search wasn't ringfenced to the trip a visitor is
   actually planning — a South Africa trip's "add a stop" location field
   queried all nations, so a South African street name could surface an
   Irish result of the same name. Explore's own state.nation pill (what
   exploreCountryCode() reads) is the wrong signal here: it's Explore-mode
   filter state, often untouched or set to something unrelated while
   planning a trip in Build mode. Instead, infer the nation from the
   trip's own courses — the given day's golf items first (most specific:
   a South Africa trip could still have one UK add-on day), then every
   day in the trip, then the wishlist — falling back to Explore's pill
   only if the trip itself carries no nation signal yet (e.g. a brand-new
   trip with nothing added), and finally unrestricted. Returns
   'GBR'/'IRL'/'ZAF'/null, matching orsGeocode()'s `country` vocabulary. */
function tbTripCountryCode(dayId){
  const codeFor=i=>{const n=courseNation(i);return n==='ie'?'IRL':n==='za'?'ZAF':n==='gb'?'GBR':null;};
  const day=dayId==null?null:tripDays.find(d=>d.id===dayId);
  if(day)for(const it of tripDayItems(day))if(it.type==='golf'){const c=codeFor(it.i);if(c)return c;}
  for(const d of tripDays)for(const it of tripDayItems(d))if(it.type==='golf'){const c=codeFor(it.i);if(c)return c;}
  for(const i of tripSeq){const c=codeFor(i);if(c)return c;}
  return typeof exploreCountryCode==='function'?exploreCountryCode():null;
}
/* GOLF-57: the pane's search bar now lives in the shared chrome above
   every tab (moved up again per GOLF-53's spirit) and adds straight into
   whichever day the Add tab currently has selected (tbDayShown), falling
   back to a plain cart add (tbSelect) when no day exists yet. Search
   itself is still course-only — there's no hotel/city database to search
   against (see tbPromptHotel/tbPromptPoi for those, manual-entry only). */
/* GOLF-58: adding a course used to leave it in "Unscheduled" unless a day
   already existed and was explicitly chosen — a real 3-step tax (add
   course, add a day, then assign it) on every single addition. Now: no
   day picked and none exist yet -> silently create Day 1 and drop it
   there; no day picked but days already exist -> use whichever day is
   currently showing (tbDayShown), defaulting to the last day. A course
   only ever lands in Unscheduled if the visitor explicitly picks
   "Unscheduled" from a row's own dropdown afterwards. */
/* GOLF-62: the default entry point for adding a course — leaves it as an
   entry in tripUnscheduled() (the "wishlist") rather than force-landing it
   on a day. Matches the stakeholder's own worked example and every
   reference app researched (Wanderlog/Roadtrippers/Outing.golf): gather
   candidates first, commit them to specific days second. Adding straight
   to a specific day (tbAddToDay below) stays available as an explicit
   secondary action while a day is focused — not removed, just no longer
   the default. */
/* GOLF-82: GOLF-69 (item 8)'s "the first course/place added starts the
   trip and lands straight on Day 1" exception is reverted, on the
   stakeholder's own explicit instruction after using the live site as a
   real user ("my prior recommendations no longer hold ... the latest
   suggestion ... is the best way to implement this going forward"). A
   course added by ANY path — this wishlist button, a map popup's "Add to
   trip" (toggleTrip, trip-model.js), or Discover's tbSelect() — always
   lands in the wishlist (tripUnscheduled()) now, never auto-creates or
   auto-assigns Day 1, whether the trip is empty or not. The only way a
   trip still gets a Day 1 for free is by picking a PLACE as a starting
   point (see tbAddPlaceToTrip below) — a non-golf location is the one
   thing that's allowed to seed a day, exactly as confirmed with the
   stakeholder. Adding straight to a specific day (tbAddToDay below) stays
   available as an explicit power path while a day is focused. */
// GOLF-91: adding a course is the "select a course" half of "select a
// course or a place, see nearby regardless" — clearing tbPlaceAnchor here
// hands the merged Nearby scope's anchor back to the course just added,
// exactly the recency rule tbNearbyAnchorPoint() (trip-route.js) expects.
function tbAddToWishlist(i){
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;tbPlaceAnchor=null;}
  saveState();render();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(true);}
}
function tbAddToDay(i,dayId){
  if(dayId==null){
    if(!tripDays.length)tripDayAdd();
    const shown=tripDays.find(d=>d.id===tbDayShown);
    dayId=(shown||tripDays[tripDays.length-1]).id;
  }
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;tbPlaceAnchor=null;}
  tripDaySetCourse(i,dayId);
  tbDayShown=dayId;
  saveState();render();renderTripBuilder();tbDrawMap();
}
/* GOLF-61: place results for the unified search bar, fetched via the same
   orsGeocode() already used for day place-fields — populated asynchronously
   by the debounced call wired in renderTripBuilder() below. null = not
   fetched yet / a fetch is in flight for the current query text; [] = a
   fetch completed with no place matches. */
let tbUnifiedPlaceResults=null;
/* GOLF-61: picking a place from the unified search always anchors the
   whole trip there (confirmed with the stakeholder) — jumps Discover's
   "Nearby" scope (GOLF-91: merged with the old separate "Near a place"
   tab) to this point and clears the search, same behavior as the
   existing Discover-tab place box, just reachable from the one main
   search bar now instead of a second, buried box. */
/* GOLF-82: the "Anchor here" (lens-only) and "+ Add to trip" (day-only)
   buttons are merged into this one action, on the stakeholder's explicit
   instruction after real-world use ("get rid of the anchor here option").
   A place result now does exactly one thing: it becomes a starting point
   for the trip. Two things it must always do, confirmed with the
   stakeholder / carried over from the two functions this replaces:
   (a) it still becomes Day 1 when picked on a trip that hasn't started
       yet (kind stays the tripDayAdd() default 'golf', so a round can go
       straight on it) — the ONE way a course/place-less trip still gets
       an automatic Day 1, now that GOLF-82 removed that behavior from
       plain course adds (see tbAddToWishlist above); a later place is
       appended as its own 'free' day instead, alongside whatever's
       already there.
   (b) it ALWAYS moves tbPlaceAnchor (+tbDiscoveryTab='anchor') to this
       point, even on an already-started trip — this is still the only
       code path that ever sets tbPlaceAnchor to a real value, and the
       merged "Nearby" scope (GOLF-91) has no other way to get seeded by a
       place, so dropping this side effect would silently strand it. */
let tbPlaceAddedNote=null;
function tbAddPlaceToTrip(lat,lng,label){
  const fresh=tripDays.length===0;
  tripDayAdd();
  const d=tripDays[tripDays.length-1];
  if(!fresh)d.kind='free';
  tripDaySetPlaceGeo(d.id,label,lat,lng);
  tbDayShown=d.id;
  tbPlaceAnchor={label,lat,lng};
  tbDiscoveryTab='anchor'; // GOLF-91: "Near a place" merged into "Nearby"
  tbSearchQ='';tbUnifiedPlaceResults=null;
  tbPlaceAddedNote={label,day:tripDays.length};
  saveState();
  // GOLF-69a: don't yank a visitor who's mid-Build back to Plan/Discover.
  if(appMode!=='build')setAppMode('plan');
  else{renderTripBuilder();tbDrawMap();}
}
function tbUnifiedSearchResultsHTML(){
  const q=tbSearchQ.trim();
  if(!q)return'';
  const results=tbSearchResults();
  const places=tbUnifiedPlaceResults;
  let html='';
  if(places===undefined){
    // Phase 22 fix: distinguishes "the geocode request failed" from "no
    // matches" — both used to render as an absent Towns & cities section,
    // making a real outage look identical to a normal empty result.
    html+=`<div class="tb-section-title">Towns &amp; cities</div><p class="hint" style="margin:0 0 var(--sp-2)">Place search is temporarily unavailable — showing golf courses only.</p>`;
  }else if(places&&places.length){
    /* GOLF-82: one button per place, not two — "Start a trip here" before
       a trip exists, "+ Add to trip" once one does (tbAddPlaceToTrip
       handles both cases itself, see its comment above). */
    const started=tbPlaceAnchor!=null||tripDays.length>0;
    html+=`<div class="tb-section-title">Towns &amp; cities</div>`+
      places.map(p=>`<div class="tb-row">
        <div>📍 ${esc(p.label)}</div>
        <div style="display:flex;gap:var(--sp-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="tb-btn is-sm is-primary tb-unified-place-trip" data-lat="${p.lat}" data-lng="${p.lng}" data-label="${esc(p.label)}">${started?'＋ Add to trip':'Start a trip here'}</button>
        </div>
      </div>`).join('');
    if(tbPlaceAddedNote)html+=`<p class="hint" style="margin:var(--sp-2) 0 0">Added <b>${esc(tbPlaceAddedNote.label)}</b> as Day ${tbPlaceAddedNote.day} — <a href="#" class="linkbtn" onclick="event.preventDefault();enterBuildMode()">open it</a>.</p>`;
  }
  if(!results.length){
    if(html)return html;
    return`<p class="hint">No places or bookable courses match "${esc(q)}".</p>`;
  }
  // GOLF-62: default action is "add to wishlist" (tripUnscheduled(), no
  // day assignment); a specific day being focused in the Day tab grows a
  // second, explicit "+ Add to Day N" button next to it — direct-to-day
  // stays available as a deliberate power path, just not the default.
  const day=(appMode==='build'&&tbBuildTab==='itin'&&tbDayShown!=null)?tripDays.find(d=>d.id===tbDayShown):null;
  html+=`<div class="tb-section-title" style="margin-top:var(--sp-3)">Golf courses</div>`+
    results.map(i=>`<div class="tb-row">
      <div>⛳ <a href="#" class="linkbtn" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        <div class="cart-region">${esc(C[i].r)} · ${ACCESS[V(i,'a')].label.toLowerCase()}</div></div>
      <div style="display:flex;gap:var(--sp-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        <button class="tb-btn is-sm is-primary" onclick="tbAddToWishlist(${i})">＋ Wishlist</button>
        ${day?`<button class="tb-btn is-sm" onclick="tbAddToDay(${i},${day.id})">＋ Day ${tripDays.indexOf(day)+1}</button>`:''}
      </div>
    </div>`).join('');
  return html;
}
/* GOLF-33: day-by-day schedule view for the pane's cart section — a
   "move to day" select per cart course (assign/reassign/unschedule),
   a manually-entered drive-in estimate per day (except Day 1, which has
   no previous day to drive from), and an "Unscheduled" bucket for cart
   courses not yet placed on a day. Replaces the flat tripListHTML() only
   inside the pane — exports/outside-pane map feedback keep using the
   flat tripSeq order untouched. */
/* GOLF-58: "+ New day" is picked straight from the row's own dropdown —
   no more leaving the course editor to hit "+ Add day" separately then
   coming back to assign it. */
function tbAssignCourseDay(i,val){
  let dayId=val===''?null:Number(val);
  if(val==='new'){tripDayAdd();dayId=tripDays[tripDays.length-1].id;}
  tripDaySetCourse(i,dayId);
  if(dayId!=null)tbDayShown=dayId;
  renderTripBuilder();tbDrawMap();
}
/* GOLF-71: tripDaySelectHTML() (the per-row "move to day" <select>) is
   retired — tbDayMenuItemsHTML() renders the same choices as 44px rows
   inside each stop's "⋯" menu instead. */
/* GOLF-71 (workstream D, defect 2): every draggable row's inner <a> now
   carries draggable="false". An anchor is natively draggable, so grabbing
   the course NAME — the largest and most obvious thing in the row — used
   to start a *link* drag carrying "#" instead of the row drag. No drop
   target here accepts that, so the row simply refused to move: the
   stakeholder's "it doesn't seem to pick it up when I drag and drop it".
   The row itself also sets user-select:none (see <style>) so a slow press
   can't start a text-selection drag instead.

   GOLF-71 (workstream C): the per-row "move to day" <select> and bare ✕
   moved into one 36px "⋯" menu. The sketch shows a stop as name + price;
   a 11px select and a 4px-padded ✕ were precisely the "small, finicky
   buttons" called out in the brief. Dragging is now the primary way to
   move a stop, and the menu is the accessible/precise fallback. */
function tbRowMenuHTML(inner){
  return`<details class="tb-rowmenu"><summary title="More" aria-label="More actions">⋯</summary>
    <div class="tb-drop-body is-right">${inner}</div></details>`;
}
function tbRowDragAttrs(startExpr,dropExpr){
  return`draggable="true"
      ondragstart="${startExpr}"
      ondragend="tbDragEnd();"
      ondragover="event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';tbDropOver(this);"
      ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);${dropExpr}"`;
}
/* A wishlist (unscheduled) course row — no item of its own yet, so it
   drags by course index. */
function tripDayCourseRowHTML(i,dayId){
  const fee=feeNumberFor(i,'wd');
  const menu=tbRowMenuHTML(
    `<div class="tb-menu-label">Move to</div>${tbDayMenuItemsHTML(i,dayId)}
     <div class="tb-menu-sep"></div>
     <button type="button" class="tb-menu-item is-danger" onclick="toggleTrip(${i});renderTripBuilder();tbDrawMap();">🗑 Remove from trip</button>`);
  return`<div class="tb-day-course tb-item-golf" ${tbRowDragAttrs(`tbDragSetCourse(${i},event,this);`,`tbDropOn(${dayId==null?'null':dayId},${i});`)}>
    <span class="tb-drag-handle" title="Drag to reorder">⠿</span>
    <span class="tb-item-icon">⛳</span>
    <div class="tb-item-main">
      <a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
      <div class="cart-region">${esc(C[i].r)}</div>
    </div>
    <span class="tb-item-price">${fee!=null?`${courseCurrency(i)}${fee.toFixed(0)}`:'—'}</span>
    <div class="tb-item-actions">${menu}</div>
  </div>`;
}
/* The day list for a row's "⋯ → Move to" menu — the same choices the old
   inline <select> offered, as 44px menu rows. */
function tbDayMenuItemsHTML(i,currentDayId){
  return[`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'')">${currentDayId==null?'✓':'&nbsp;&nbsp;'} Wishlist</button>`]
    .concat(tripDays.map((d,idx)=>`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'${d.id}')">${d.id===currentDayId?'✓':'&nbsp;&nbsp;'} Day ${idx+1}</button>`))
    .concat([`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'new')">＋ New day</button>`]).join('');
}
/* GOLF-63: one scheduled stop of any type, draggable into any position in
   any day. Golf rows keep their existing "move to day" dropdown and
   remove-from-trip action; hotel/POI rows get a remove of their own (they
   exist only on that day, so there's nothing to unschedule them to). The
   drag/drop wiring is identical across all three types — that's the whole
   point of collapsing the old three fields into one list. */
function tripDayItemRowHTML(d,it){
  const det=tripItemPriceDetail(d,it);
  const price=det.total;
  // GOLF-74: hotel/POI rows show the effective total, and a per-person stay
  // shows how it got there ("£90 × 2 (sharing) = £180").
  const priceLabel=price!=null?` · ${tripPriceLabel(det)}`:'';
  // GOLF-69 (item 10): one icon vocabulary shared by the list rows and the
  // map markers — hotel emoji for stays, location pin for POIs.
  const icon=it.type==='golf'?'⛳':it.type==='hotel'?'🏨':'📍';
  const noGeo=it.type!=='golf'&&tripItemPoint(it)==null;
  /* GOLF-71 copy audit: the price used to be repeated in the grey meta
     line AND (on golf) implied by the fee — it now appears once, in the
     right-hand price column the sketch calls for. The meta line is the
     region for golf, and the stop kind for everything else. */
  const main=it.type==='golf'
    ?`<a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${it.i})">${esc(tripItemName(it))}</a>
       <div class="cart-region">${esc(C[it.i]?C[it.i].r:'')}</div>`
    :`<span class="tb-item-name">${esc(tripItemName(it))}</span>
       <div class="cart-region">${it.type==='hotel'?'Stay':'Stop'}${noGeo?' · <span title="No location picked, so no drive time can be calculated to this stop">no location</span>':''}</div>`;
  /* Merge (GOLF-71 + GOLF-73): GOLF-73 shipped Edit as a second inline button
     beside ✕. GOLF-71 collapsed every per-row action into one overflow menu
     (and moved "move to day" out of a <select> into it), so Edit lives there
     now rather than as a third control competing for the row's width. Same
     entry point (tbEditStop), same rule: hotel/POI only. A golf row has
     nothing editable here — name, fee and coordinates all come from the
     course dataset (edited in the corrections editor), and its one trip-level
     fact, the day it sits on, is the "Move to" section of this same menu. */
  const menu=tbRowMenuHTML(
    (it.type==='golf'?`<div class="tb-menu-label">Move to</div>${tbDayMenuItemsHTML(it.i,d.id)}<div class="tb-menu-sep"></div>`
      :`<button type="button" class="tb-menu-item" onclick="tbEditStop(${d.id},'${it.id}')">✎ Edit</button><div class="tb-menu-sep"></div>`)+
    `<button type="button" class="tb-menu-item is-danger" onclick="${it.type==='golf'?`toggleTrip(${it.i});`:`tripDayRemoveItem(${d.id},'${it.id}');`}renderTripBuilder();tbDrawMap();">🗑 Remove</button>`);
  return`<div class="tb-day-course tb-item-${it.type}" ${tbRowDragAttrs(`tbDragSetItem(${d.id},'${it.id}',event,this);`,`tbDropInDay(${d.id},'${it.id}');`)}>
    <span class="tb-drag-handle" title="Drag to reorder">⠿</span>
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main">${main}</div>
    ${/* Merge (GOLF-71 + GOLF-74): the effective total goes in GOLF-71's
         narrow price column, and a per-person-sharing stay explains its
         arithmetic in the column's tooltip rather than overflowing the
         column with "£90 × 2 (sharing) = £180". The full worked label still
         renders in the Itinerary tab and the Costs breakdown, which have the
         width for it. */''}
    <span class="tb-item-price"${det.sharing?` title="${esc(priceLabel.replace(/^ · /,''))}"`:''}>${price!=null?`${det.cur||'£'}${price.toFixed(0)}`:'—'}</span>
    <div class="tb-item-actions">${menu}</div>
  </div>`;
}
