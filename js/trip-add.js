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
  return C.map((c,i)=>i).filter(i=>!TRIP.has(i)&&bookable(i)&&searchMatches(i,q)).slice(0,20);
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
/* GOLF-69 (item 8): GOLF-62's wishlist-first default stands for every add
   after the first. The one exception the stakeholder asked for is the very
   first thing added to an empty trip — that starts the trip, so it goes
   straight onto Day 1 rather than sitting in an unscheduled pool the
   visitor then has to assign ("that will remove the ambiguity around which
   day to assign a course to"). Second and subsequent courses land in the
   wishlist exactly as before. */
function tbAddToWishlist(i){
  const fresh=!tripDays.length&&!tripSeq.length;
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;}
  if(fresh){
    tripDayAdd();
    tripDaySetCourse(i,tripDays[0].id);
    tbDayShown=tripDays[0].id;
  }
  saveState();render();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(true);}
}
function tbAddToDay(i,dayId){
  if(dayId==null){
    if(!tripDays.length)tripDayAdd();
    const shown=tripDays.find(d=>d.id===tbDayShown);
    dayId=(shown||tripDays[tripDays.length-1]).id;
  }
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;}
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
   "Near a place" tab to this point and clears the search, same behavior
   as the existing Discover-tab place box, just reachable from the one
   main search bar now instead of a second, buried box. */
/* GOLF-69 (items 7 + 8): picking a place still moves the discovery lens,
   but two things changed on the stakeholder's instruction.
   (a) It no longer yanks a visitor who is mid-Build back to Plan/Discover
       ("when I search and then select a city to start a trip there, it
       automatically switches me to the discover tab. It shouldn't do
       that") — the mode switch is now only for the not-yet-in-Build case.
   (b) Starting a trip at a place puts that place straight into DAY 1
       ("when you start a trip it should automatically get added to day 1
       — that will remove the ambiguity around which day to assign a course
       to"). There is no separate "start slot" any more: Day 1 IS the start
       of the trip, and the city lands as its first card. When days already
       exist we leave them alone — this is only about how a trip begins. */
function tbTripStarted(){return tripDays.length>0||tripSeq.length>0;}
function tbAnchorTripToPlace(lat,lng,label){
  const fresh=tripDays.length===0;
  tbPlaceAnchor={label,lat,lng};
  tbDiscoveryTab='place';
  tbSearchQ='';tbUnifiedPlaceResults=null;
  if(fresh){
    tripDayAdd();
    const d=tripDays[0];
    tripDaySetPlaceGeo(d.id,label,lat,lng);
    tbDayShown=d.id;
  }
  saveState();
  if(appMode!=='build')setAppMode('plan'); // GOLF-64 intent kept, minus the Build-mode hijack
  else{renderTripBuilder();tbDrawMap();}
}
/* GOLF-67: the second action on a place result — add this city to the trip
   as a stop, WITHOUT re-anchoring. Anchoring (above) is a discovery lens:
   it moves "show me what's nearby" to a new point and touches no trip
   data. This adds actual trip data and leaves the lens alone, which is
   precisely the stakeholder's ask ("start in Edinburgh, then search St
   Andrews and add St Andrews itself, not just courses near it").
   Landing spot: appended as a new day, not into the wishlist. The
   wishlist is a pool of *courses* by construction — tripUnscheduled()
   derives from tripSeq (course indices) and tbDropOn() refuses to put a
   non-golf item there — so a city has no representation in it. A day,
   by contrast, already has exactly the right shape for "a place we'll
   be": place/placeLat/placeLng, geocoded, routable (GOLF-56).
   kind:'free' because an added city carries no round yet; the visitor
   can switch it to Golf/Start/End from the day's own dropdown, and drag
   it anywhere in the sequence with GOLF-65's day drag. */
let tbPlaceAddedNote=null;
/* GOLF-69: unchanged for an in-progress trip (a city added later is a later
   day, appended). The only new case is the empty trip, where tripDayAdd()
   creates Day 1 and this lands there — same "the trip starts in Day 1"
   rule as tbAnchorTripToPlace() above. kind stays 'golf' (the default) for
   that first day so a round can be added to it; a later added city is
   still 'free', since it carries no round yet. */
function tbAddPlaceToTrip(lat,lng,label){
  const fresh=tripDays.length===0;
  tripDayAdd();
  const d=tripDays[tripDays.length-1];
  if(!fresh)d.kind='free';
  tripDaySetPlaceGeo(d.id,label,lat,lng);
  tbDayShown=d.id;
  tbPlaceAddedNote={label,day:tripDays.length};
  saveState();
  renderTripBuilder();tbDrawMap();
}
function tbUnifiedSearchResultsHTML(){
  const q=tbSearchQ.trim();
  if(!q)return'';
  const results=tbSearchResults();
  const places=tbUnifiedPlaceResults;
  let html='';
  if(places&&places.length){
    /* GOLF-67: "add to trip" only appears once there's a trip to add to —
       an anchor has been set, or days already exist. Before that the only
       sensible thing a place can do is start the trip, and showing two
       near-identical buttons on an empty trip would just be a choice with
       no meaning. */
    const started=tbPlaceAnchor!=null||tripDays.length>0;
    html+=`<div class="tb-section-title">Towns &amp; cities</div>`+
      places.map(p=>`<div class="tb-row">
        <div>📍 ${esc(p.label)}</div>
        <div style="display:flex;gap:var(--sp-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="tb-btn is-sm is-primary tb-unified-place-add" data-lat="${p.lat}" data-lng="${p.lng}" data-label="${esc(p.label)}">${started?'Anchor here':'Start a trip here'}</button>
          ${started?`<button class="tb-btn is-sm tb-unified-place-trip" data-lat="${p.lat}" data-lng="${p.lng}" data-label="${esc(p.label)}">＋ Add to trip</button>`:''}
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
  const fee=extractFee(V(i,'wd'));
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
    <span class="tb-item-price">${fee!=null?`£${fee.toFixed(0)}`:'—'}</span>
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
  const price=tripItemPrice(d,it);
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
  const menu=tbRowMenuHTML(
    (it.type==='golf'?`<div class="tb-menu-label">Move to</div>${tbDayMenuItemsHTML(it.i,d.id)}<div class="tb-menu-sep"></div>`:'')+
    `<button type="button" class="tb-menu-item is-danger" onclick="${it.type==='golf'?`toggleTrip(${it.i});`:`tripDayRemoveItem(${d.id},'${it.id}');`}renderTripBuilder();tbDrawMap();">🗑 Remove</button>`);
  return`<div class="tb-day-course tb-item-${it.type}" ${tbRowDragAttrs(`tbDragSetItem(${d.id},'${it.id}',event,this);`,`tbDropInDay(${d.id},'${it.id}');`)}>
    <span class="tb-drag-handle" title="Drag to reorder">⠿</span>
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main">${main}</div>
    <span class="tb-item-price">${price!=null?`£${price.toFixed(0)}`:'—'}</span>
    <div class="tb-item-actions">${menu}</div>
  </div>`;
}
