/* ============================================================
   js/trip-ui.js — the Trip Builder pane UI: day legs, the itinerary
   lists, the Costs tab, the editable day schedule, the wishlist, and
   renderTripBuilder() with all of its event wiring.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* GOLF-57: Trip Builder sidebar redesign — a "leg" is one row in the
   Itinerary tab's day cards: drive (getting to today), golf (a round),
   poi (a manually-added stop), hotel (where the day ends). Built
   entirely from tripDays — no new persisted shape beyond GOLF-57's own
   hotel/pois fields, this is just a different way of laying the same
   data out. Order is drive -> golf(s) -> poi(s) -> hotel, since a hotel
   is naturally where the day *ends*. */
/* GOLF-63: rows for one day of the itinerary, now driven entirely by the
   day's own free item order rather than the old fixed golf->poi->hotel
   sequence — and with a drive row emitted before EVERY stop that has a
   predecessor in the trip-wide chain, not just before the day's first one.
   That's what makes "hotel in Aberdeen -> course -> drive to St Andrews ->
   POI -> different hotel" show real driving at each hop. The day's manual
   driveIn override still applies to the day's first stop only, exactly as
   before; intra-day hops are always computed. An item with no coordinates
   simply gets no drive row above it. */
function tripDayLegs(dayIdx){
  const d=tripDays[dayIdx];if(!d)return[];
  const chain=tripStopChain();
  const posOf=new Map();
  let firstPos=-1,placePos=-1;
  chain.forEach((s,k)=>{
    if(s.dayIdx!==dayIdx)return;
    if(firstPos<0)firstPos=k;
    if(s.type==='place'&&placePos<0)placePos=k;
    if(s.itemId)posOf.set(s.itemId,k);
  });
  const driveRow=(pos)=>{
    const prev=tripPrevStop(chain,pos);
    if(!prev)return null;
    const cur=chain[pos];
    const leg=tripLegEstimate(prev,cur);
    const isDayFirst=pos===firstPos;
    const mins=(isDayFirst&&d.driveIn!=null)?d.driveIn:(leg?leg.minutes:null);
    return{type:'drive',label:`${prev.name} → ${cur.name}`,mins,real:!!(leg&&leg.real),dayFirst:isDayFirst};
  };
  const legs=[];
  if(placePos>=0){const r=driveRow(placePos);if(r)legs.push(r);}
  tripDayItems(d).forEach(it=>{
    const pos=posOf.get(it.id);
    if(pos!=null){const r=driveRow(pos);if(r)legs.push(r);}
    const det=tripItemPriceDetail(d,it);
    legs.push({type:it.type,name:tripItemName(it),price:det.total,detail:det,id:it.id,i:it.type==='golf'?it.i:undefined});
  });
  return legs;
}
function tripDayTotal(dayIdx){
  return tripDayLegs(dayIdx).reduce((sum,l)=>sum+(l.type!=='drive'&&l.price!=null?l.price:0),0);
}
/* GOLF-74: the £ figure as the visitor should read it. A per-person-sharing
   stay shows its arithmetic ("£90 × 2 = £180") rather than silently folding
   the doubling into the trip total — the stakeholder's explicit ask. */
function tripPriceLabel(det){
  if(!det||det.total==null)return'—';
  return det.sharing?`£${det.base.toFixed(0)} × ${det.guests} (sharing) = £${det.total.toFixed(0)}`:`£${det.total.toFixed(0)}`;
}
function itinLegRowHTML(l){
  if(l.type==='drive')return`<div class="itin-leg itin-leg-drive">🚗 ${esc(l.label)}${l.mins!=null?` · ${fmtDriveMinutes(l.mins)}`:''}</div>`;
  if(l.type==='golf')return`<div class="itin-leg itin-leg-golf"><span class="itin-leg-main">⛳ <span class="itin-golf-name">${esc(l.name)}</span></span><span class="itin-golf-price">${l.price!=null?`£${l.price.toFixed(0)}`:'—'}</span></div>`;
  if(l.type==='hotel')return`<div class="itin-leg itin-leg-hotel"><span class="itin-leg-main">🛏 <span class="itin-hotel-name">${esc(l.name)}</span></span><span class="itin-hotel-price">${tripPriceLabel(l.detail)}</span></div>`;
  if(l.type==='poi')return`<div class="itin-leg itin-leg-poi"><span class="itin-leg-main">📷 <span class="itin-poi-name">${esc(l.name)}</span></span>${l.price!=null?`<span class="itin-hotel-price">£${l.price.toFixed(0)}</span>`:`<span class="wt">POI</span>`}</div>`;
  return'';
}
function tbItinAllHTML(){
  if(!tripDays.length)return`<p class="hint">Add a day (Day tab) to start building your itinerary.</p>`;
  return tripDays.map((d,idx)=>{
    const legs=tripDayLegs(idx).filter(l=>tbDriveToggle||l.type!=='drive');
    const total=tripDayTotal(idx);
    const dow=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}).toUpperCase():'';
    return`<div class="itin-card">
      <div class="itin-card-head">DAY ${String(idx+1).padStart(2,'0')}${dow?` · ${dow}`:''}${d.place?` · ${esc(d.place)}`:''}</div>
      ${legs.length?legs.map(itinLegRowHTML).join(''):`<p class="hint" style="margin:4px 0">${d.kind!=='golf'?TRIP_DAY_KINDS[d.kind]:'No stops yet.'}</p>`}
      <div class="itin-day-total"><span>Day total</span><span>${total?`£${total.toFixed(0)}`:'—'}</span></div>
    </div>`;
  }).join('');
}
function tbItinGolfListHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='golf')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it)});}));
  if(!rows.length)return`<p class="hint">No golf rounds scheduled yet.</p>`;
  return rows.map(r=>`<div class="itin-card itin-flat"><div class="itin-card-kicker">DAY ${r.day}</div>
    <div class="itin-flat-row"><span class="itin-golf-name-lg">⛳ ${esc(r.name)}</span><span class="itin-golf-price-lg">${r.price!=null?`£${r.price.toFixed(0)}`:'—'}</span></div></div>`).join('');
}
function tbItinHotelRailHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='hotel')rows.push({day:idx+1,name:tripItemName(it),detail:tripItemPriceDetail(d,it)});}));
  if(!rows.length)return`<p class="hint">No stays added yet — add one with a day's <b>+ Add hotel/stay</b> button.</p>`;
  return`<div class="itin-rail">${rows.map(r=>`<div class="itin-rail-row"><div class="itin-rail-dot"></div>
      <div class="itin-card-kicker">DAY ${r.day}</div>
      <div class="itin-flat-row"><span class="itin-hotel-name-md">${esc(r.name)}</span><span class="itin-hotel-price-md">${tripPriceLabel(r.detail)}</span></div>
    </div>`).join('')}</div>`;
}
function tbItinPoiListHTML(){
  const rows=[];
  // GOLF-63: `price` is carried through here now — this list used to drop it
  // silently, so a priced POI read as free on this tab while still counting
  // in the cost table.
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='poi')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it)});}));
  if(!rows.length)return`<p class="hint">No points of interest added yet.</p>`;
  return rows.map(r=>`<div class="itin-card itin-flat"><div class="itin-flat-row"><span>📷 ${esc(r.name)}</span><span class="itin-golf-price-lg">${r.price!=null?`£${r.price.toFixed(0)}`:'—'}</span></div><div class="itin-card-kicker">DAY ${r.day}</div></div>`).join('');
}
function tbItineraryHTML(){
  if(!tripSeq.length&&!tripDays.some(d=>d.place||tripDayItems(d).length))return`<p class="hint">No courses in your trip yet. Open any course's popup and hit <b>Add to trip</b>, or search above.</p>`;
  if(tbItinFilter==='golf')return tbItinGolfListHTML();
  if(tbItinFilter==='hotel')return tbItinHotelRailHTML();
  if(tbItinFilter==='poi')return tbItinPoiListHTML();
  return tbItinAllHTML();
}
/* Costs tab: a full line-item breakdown, distinct from the older
   tripCostSummary()/tripCostSummaryHTML() (kept, defined but no longer
   called — the Day tab now links to this Costs tab instead of repeating
   a compact estimate inline) — this one itemises every
   golf/hotel/POI cost individually rather than just totalling them, and
   folds a day's explicit hotel price in ahead of the regional estimate. */
function tripCostLineItems(){
  const items=[];
  // GOLF-63: itemised in the day's own order, so the breakdown reads down
  // the day the same way the itinerary does.
  const CAT={golf:'Golf',hotel:'Stay',poi:'POI'};
  // GOLF-74: a per-person-sharing stay carries its arithmetic into the label
  // so the line item explains its own (doubled) amount.
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{
    const det=tripItemPriceDetail(d,it);
    items.push({label:tripItemName(it)+(det.sharing?` (£${det.base.toFixed(0)} × ${det.guests} sharing)`:''),
      cat:CAT[it.type]||'POI',amount:det.total,day:idx+1});
  }));
  tripUnscheduled().forEach(i=>items.push({label:V(i,'n'),cat:'Golf',amount:extractFee(V(i,'wd')),day:null}));
  return items;
}
function tripCostBreakdown(){
  const items=tripCostLineItems();
  const sum=arr=>arr.reduce((t,x)=>t+(x.amount||0),0);
  const golf=items.filter(x=>x.cat==='Golf'),stay=items.filter(x=>x.cat==='Stay'),poi=items.filter(x=>x.cat==='POI');
  const fuelMiles=tripTotalDriveMiles(); // GOLF-63: every hop, not just day boundaries
  const fuelCost=fuelMiles*FUEL_COST_PER_MILE;
  const golfTotal=sum(golf),stayTotal=sum(stay),poiTotal=sum(poi);
  const grand=golfTotal+stayTotal+poiTotal+(tbIncludeFuel?fuelCost:0);
  return{items,golfTotal,golfCov:golf.filter(x=>x.amount!=null).length,golfOf:golf.length,stayTotal,poiTotal,fuelMiles,fuelCost,grand};
}
function tbTripTotal(){return tripCostBreakdown().grand;}
function tbCostsTabHTML(){
  const b=tripCostBreakdown();
  return`<div class="cost-banner"><div class="cost-banner-label">TRIP TOTAL</div><div class="cost-banner-amount">£${b.grand.toFixed(0)}</div></div>
    <table class="cost-summary-table">
      <tr><td>Golf</td><td>£${b.golfTotal.toFixed(0)}</td></tr>
      <tr><td>Stays</td><td>£${b.stayTotal.toFixed(0)}</td></tr>
      <tr><td>Points of interest</td><td>£${b.poiTotal.toFixed(0)}</td></tr>
      <tr><td><label style="cursor:pointer"><input type="checkbox" ${tbIncludeFuel?'checked':''} onchange="tbIncludeFuel=this.checked;renderTripBuilder();"> Fuel (est.)</label></td><td>£${b.fuelCost.toFixed(0)}</td></tr>
    </table>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} golf round${b.golfOf===1?'':'s'} have a parseable fee. Stays use your entered price where set, otherwise a typical regional rate — see <a href="#" class="linkbtn" onclick="event.preventDefault();tbBuildTab='itin';renderTripBuilder();">Itinerary tab</a> to add one. Fuel is a straight-line estimate.</p>
    <div class="cost-line-items-label">Line items</div>
    <table class="cost-line-table">${b.items.length?b.items.map(x=>`<tr><td>${esc(x.label)} <span class="wt">${x.cat}</span></td><td>${x.amount!=null?`£${x.amount.toFixed(0)}`:'—'}</td></tr>`).join(''):`<tr><td colspan="2" class="hint" style="padding:8px 0">No costs yet.</td></tr>`}</table>`;
}
/* GOLF-64: the standalone "Add" tab that used to live here is retired. Its
   three jobs are all reachable in fewer steps now: golf via the unified
   search bar (GOLF-61) or Plan mode's discover lists, hotel and POI via each
   day's own inline "+ Add hotel/stay" / "+ Add point of interest" buttons
   (GOLF-63) — which also carry real coordinates, which this tab never did.
   That removes a whole tab's worth of indirection, the "too many steps"
   complaint this round set out to fix. */
/* GOLF-64: the old 5-tab set (Itinerary/Day/Costs/Add/Discover) inside one
   pane is retired. Discover moved into Plan mode, Day + Itinerary merged
   into Build's single editable Itinerary tab, Costs sits under Build, and
   the standalone Add tab is gone entirely — its job is covered by the
   unified search bar (GOLF-61) plus each day's own inline "+" buttons
   (GOLF-63). tbBuildTab is all that's left: two tabs, inside Build only. */
let tbBuildTab='itin',tbItinFilter='all',tbDriveToggle=true,tbDayShown=null;
function tripDayScheduleHTML(){
  if(!tripSeq.length&&!tripDays.length)return`<p class="hint">Nothing scheduled yet. Add a day below, or go <a href="#" class="linkbtn" onclick="event.preventDefault();setAppMode('plan')">← back to the wishlist</a> to gather some courses first.</p>`;
  const unscheduled=tripUnscheduled();
  /* GOLF-33 follow-up: each day/unscheduled block is itself a drop target
     for "append to the end of this list" — a drop that doesn't land on a
     specific row (e.g. the empty area below the last course, or on the
     header). Rows stopPropagation() on their own drop so a drop that DOES
     land on a row isn't double-handled here. */
  const daysHTML=tripDays.map((d,idx)=>{
    const kind=TRIP_DAY_KINDS[d.kind]?d.kind:'golf';
    const items=tripDayItems(d);
    /* GOLF-69 (item 8): the day header is now just "Day N" — the
       "— 1 course · 2 stops" suffix is gone per the stakeholder. The count
       is still needed here for the POI-toggle condition below. */
    const nCourses=items.filter(it=>it.type==='golf').length;
    const noRoundHint={start:'Arrival — no round scheduled.',free:'Free day — no round scheduled.',end:'Departure — no round scheduled.'}[kind];
    /* GOLF-64: this is where the old read-only Itinerary tab and the old
       editable Day tab become one view — the day's editable, draggable item
       rows with the computed 🚗 drive legs (tripDayLegs) interleaved between
       them, instead of the two being separate tabs showing the same day two
       different ways. Every reference app treats view and edit as one screen. */
    const byId=new Map(items.map(it=>[it.id,it]));
    const rowsHTML=tripDayLegs(idx).map(l=>{
      if(l.type==='drive')return tbDriveToggle?itinLegRowHTML(l):'';
      const it=byId.get(l.id);
      if(!it)return'';
      /* GOLF-73: an item being edited swaps its row for the inline edit form
         in place, so the form appears exactly where the thing it edits was. */
      if(tbAddStop&&tbAddStop.itemId===it.id&&tbAddStop.dayId===d.id)return tbAddStopFormHTML(d.id,it.id);
      return tripDayItemRowHTML(d,it);
    }).join('');
    return`
    <div class="tb-day tb-day-${kind}"
      ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropInDay(${d.id},null);">
      <div class="tb-day-head" draggable="true"
        ondragstart="tbDayDragSet(${d.id});event.dataTransfer.effectAllowed='move';"
        ondragend="tbDragEnd();"><span><span class="tb-drag-handle tb-day-handle" title="Drag to move this whole day">⠿</span> Day ${idx+1}</span>
        <button class="linkbtn" onclick="tripDayRemove(${d.id});renderTripBuilder();tbDrawMap();">Remove day</button></div>
      <div class="tb-day-date">
        <select onchange="tripDaySetKind(${d.id},this.value);renderTripBuilder();">${Object.entries(TRIP_DAY_KINDS).map(([k,label])=>`<option value="${k}"${k===kind?' selected':''}>${label}</option>`).join('')}</select>
        <span class="tb-place-wrap" style="position:relative;display:inline-block">
          <input type="text" class="tb-place-input" id="tb-place-${d.id}" placeholder="Search a city (e.g. Edinburgh)" value="${(d.place||'').replace(/"/g,'&quot;')}" style="width:150px"
            onchange="tripDaySetPlace(${d.id},this.value);renderTripBuilder();">
          <div id="tb-place-results-${d.id}" class="tb-place-results"></div>
        </span>
        Date <input type="date" value="${d.date??''}" onchange="tripDaySetDate(${d.id},this.value===''?null:this.value);renderTripBuilder();">
        <span style="opacity:.75">date is optional — used to cost this day at the correct weekday/weekend rate</span>
      </div>
      ${tripDayDriveHTML(d,idx)}
      ${items.length?rowsHTML:`<p class="hint" style="margin:8px 10px">${noRoundHint||''} ${kind==='golf'?'Drag a course in, or use the dropdown on a wishlist course below.':'Add a course too if you want one — a start/free/end day can still hold a round.'}</p>`}
      <div class="tb-dropzone"
        ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';tbDropOver(this);"
        ondragleave="tbDropOut(this);"
        ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);tbDropInDay(${d.id},null);">↓ Drop here to put it last on Day ${idx+1}</div>
      <div class="tb-day-total"><span>Day total</span><span>${tripDayTotal(idx)?`£${tripDayTotal(idx).toFixed(0)}`:'—'}</span></div>
      ${tripDaySuggestedTown(d)?`<div class="tb-day-town">Staying near: <b>${esc(tripDaySuggestedTown(d))}</b>${nCourses&&ORS_PROXY_URL?` <a href="#" class="linkbtn" onclick="event.preventDefault();tbTogglePois(${d.id})">${tbPoiOn.has(d.id)?'Hide POIs':'Show POIs'}</a>`:''}</div>`:''}
      ${tbPoiListHTML(d)}
      ${tbAddStopFormHTML(d.id)}
      <div class="tb-day-add"><button class="linkbtn" onclick="tbPromptHotel(${d.id})">+ Add hotel/stay</button>
        <button class="linkbtn" onclick="tbPromptPoi(${d.id})">+ Add point of interest</button></div>
    </div>
    ${idx===0?`<div class="bar" style="margin:0 0 10px"><button class="btn2" onclick="tbAddDayWithPlace();">+ Add day</button><span></span></div>`:''}`}).join('');
  const unschedHTML=unscheduled.length?`
    <div class="tb-day" style="border-style:dashed" ondragover="event.preventDefault();" ondrop="event.preventDefault();tbDropOn(null,null);">
      <div class="tb-day-head"><span>Unscheduled (Wishlist)</span></div>
      ${tripWishlistSummaryHTML(unscheduled)}
      ${unscheduled.map(i=>tripDayCourseRowHTML(i,null)).join('')}
    </div>`:'';
  return`<p style="font-size:11.5px;color:var(--stone);margin:0 0 10px">Drag <span class="tb-drag-handle" style="display:inline;font-size:11px">⠿</span> a course to reorder it or move it between days — like dragging stops on a map — or use each row's dropdown. Drag a <b>day header</b>'s ⠿ to move that whole day (and everything on it) to a different slot — handy for trying "what if the rest day were Day 2 instead?". <a href="#" class="linkbtn" onclick="event.preventDefault();tripAutoOrder()">Auto-order by nearest-neighbour</a> gives you a sensible starting sequence to drag from.</p>
    ${daysHTML}${unschedHTML}
    <!-- GOLF-69 (item 8): "+ Add day" moved up to sit directly under Day 1's
         card (rendered in the day loop above). This bar keeps "Clear trip"
         and stays the drop target that moves a dragged day to last place —
         every day drop lands *before* its target, so the final slot is only
         reachable past the last card. -->
    <div class="bar tb-day-endzone" style="margin-top:2px" ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this);" ondrop="event.preventDefault();tbDropOut(this);tbDropDayAtEnd();">
      ${tripDays.length>1?`<button class="btn2" onclick="tbAddDayWithPlace();">+ Add day at the end</button>`:'<span></span>'}
      <button class="btn2 ghost" onclick="tripClearAll();">Clear trip</button>
    </div>
    <p class="hint" style="margin-top:10px">See the <a href="#" class="linkbtn" onclick="event.preventDefault();tbBuildTab='cost';renderTripBuilder();">Costs tab</a> for a full trip total and line-item breakdown.</p>`;
}
/* GOLF-64: Plan mode's wishlist — GOLF-62's unscheduled pool promoted from a
   block at the bottom of the old Day tab into a first-class section, with
   its suggested order/running totals and the one clear forward action into
   Build mode. Rows are deliberately simpler than Build's: no "move to day"
   dropdown, because in Plan mode there are no days yet to move to — that's
   the whole point of the Plan/Build split. */
function tbWishlistHTML(){
  const unscheduled=tripUnscheduled();
  if(!unscheduled.length)return`<p class="hint">Your wishlist is empty. Search above, or browse what's nearby, and hit <b>+ Wishlist</b> on anything you fancy playing.</p>`;
  const rows=unscheduled.map(i=>{
    const fee=extractFee(V(i,'wd'));
    return`<div class="tb-day-course">
      <div style="min-width:0">⛳ <a href="#" class="linkbtn" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        <div class="cart-region">${esc(C[i].r)}${fee!=null?` · £${fee.toFixed(0)}`:''}</div></div>
      <button class="btn2 ghost cart-remove" title="Remove from wishlist" onclick="toggleTrip(${i});renderTripBuilder();tbDrawMap();">✕</button>
    </div>`;}).join('');
  return`<div class="tb-day" style="border-style:dashed">
      <div class="tb-day-head"><span>Wishlist — ${unscheduled.length} course${unscheduled.length===1?'':'s'}</span>
        <button class="linkbtn" onclick="tripClearAll();">Clear</button></div>
      ${tripWishlistSummaryHTML(unscheduled)}
      ${rows}
    </div>
    <div class="bar" style="margin-top:10px">
      <button class="btn primary" onclick="enterBuildMode()">Start scheduling days →</button>
    </div>`;
}
function tbPlanHTML(){
  return`<div class="tb-section-title">Find courses</div>
    ${tbDiscoverTabHTML()}
    <div class="tb-section-title" style="margin-top:16px">Your wishlist</div>
    ${tbWishlistHTML()}`;
}
/* GOLF-64: one pane, two modes. The shared chrome (wordmark + total pill +
   exit, trip switcher, unified search) is identical in both — only what sits
   under it changes: Plan renders a single scrolling view (discover +
   wishlist, no sub-tabs, deliberately), Build renders two tabs (Itinerary,
   Costs) plus a "← Back to wishlist" link. Net: 5 flat unordered tabs
   become 0 tabs in Plan + 2 in Build, and the structure itself narrates the
   workflow instead of offering five destinations with no implied order. */
function renderTripBuilder(){
  const pane=document.getElementById('tb-pane');
  if(tbDayShown==null||!tripDays.find(d=>d.id===tbDayShown))tbDayShown=tripDays.length?tripDays[0].id:null;
  const total=tbTripTotal();
  const isBuild=appMode==='build';
  const TABS=[['itin','Itinerary'],['cost','Costs']];
  const showItinFilters=isBuild&&tbBuildTab==='itin';
  pane.innerHTML=`
    <div class="tb-navbar">
      <span class="tb-wordmark">${isBuild?'Build your trip':'Plan a trip'}</span>
      <span class="tb-navbar-right"><span class="tb-pill">${isBuild?`${tripDays.length} day${tripDays.length===1?'':'s'} · `:''}£${total.toFixed(0)}</span>
        <button class="linkbtn" id="tb-exit">← Back to Explore</button></span>
    </div>
    <div class="tb-section" style="padding:6px 20px">${tripSwitcherHTML()}</div>
    <div class="tb-search-bar-wrap">
      <input id="tb-unified-search" class="tb-search-bar" type="text" placeholder="Search courses, hotels, cities…" value="${tbSearchQ.replace(/"/g,'&quot;')}">
    </div>
    <div class="tb-section" id="tb-search-results" style="border-top:none${tbSearchQ.trim()?'':';display:none'}">${tbSearchQ.trim()?tbUnifiedSearchResultsHTML():''}</div>
    ${isBuild?`<div class="tb-backlink"><button class="linkbtn" id="tb-back-wishlist">← Back to wishlist</button></div>
    <div class="tb-tabs">${TABS.map(([k,label])=>`<button class="tb-tab-btn" data-tab="${k}" aria-pressed="${tbBuildTab===k}">${label}</button>`).join('')}</div>`:''}
    ${showItinFilters?`<div class="tb-filter-row">
      <div class="tb-filter-pills">${[['all','All'],['golf','Golf'],['hotel','Hotels'],['poi','POI']].map(([k,label])=>
        `<button class="tb-pill-btn" data-itin-filter="${k}" aria-pressed="${tbItinFilter===k}">${label}</button>`).join('')}</div>
      <button class="tb-pill-btn tb-drive-toggle" id="tb-drive-toggle" aria-pressed="${tbDriveToggle}">Drive times: ${tbDriveToggle?'On':'Off'}</button>
    </div>`:''}
    <div class="tb-tab-content">${
      !isBuild?tbPlanHTML()
      :tbBuildTab==='cost'?tbCostsTabHTML()
      /* 'all' is the merged editable timeline; the golf/hotel/POI filters
         keep the old Itinerary tab's flat read-only lists. */
      :tbItinFilter==='all'?tripDayScheduleHTML()
      :tbItineraryHTML()
    }</div>`;
  document.getElementById('tb-exit').addEventListener('click',()=>exitTripBuilder());
  const backEl=document.getElementById('tb-back-wishlist');
  if(backEl)backEl.addEventListener('click',()=>setAppMode('plan'));
  pane.querySelectorAll('.tb-tab-btn').forEach(btn=>btn.addEventListener('click',()=>{tbBuildTab=btn.dataset.tab;renderTripBuilder();tbDrawMap();}));
  const filterRow=pane.querySelector('.tb-filter-row');
  if(filterRow){
    filterRow.querySelectorAll('[data-itin-filter]').forEach(btn=>btn.addEventListener('click',()=>{tbItinFilter=btn.dataset.itinFilter;renderTripBuilder();}));
    document.getElementById('tb-drive-toggle').addEventListener('click',()=>{tbDriveToggle=!tbDriveToggle;renderTripBuilder();});
  }
  const searchEl=document.getElementById('tb-unified-search'),searchResultsEl=document.getElementById('tb-search-results');
  // Only patch the results div on each keystroke (not a full renderTripBuilder())
  // so the input keeps focus/caret position while typing — a full re-render
  // here would rebuild the whole pane and drop focus on every character.
  searchEl.addEventListener('input',()=>{
    tbSearchQ=searchEl.value;
    const q=tbSearchQ.trim();
    searchResultsEl.style.display=q?'':'none';
    tbUnifiedPlaceResults=null;
    tbPlaceAddedNote=null; // GOLF-67: the "added as Day N" note belongs to the query that produced it
    searchResultsEl.innerHTML=q?tbUnifiedSearchResultsHTML():'';
    clearTimeout(tbUnifiedSearchGeoDebounce);
    if(!q)return;
    // GOLF-61: fires alongside tbSearchResults() (courses) on every
    // keystroke — a debounced orsGeocode() call for places, rendered as a
    // labelled group above the course results.
    tbUnifiedSearchGeoDebounce=setTimeout(()=>{
      orsGeocode(q,list=>{
        if(tbSearchQ.trim()!==q)return; // stale — a newer keystroke has since fired
        tbUnifiedPlaceResults=list||[];
        if(document.getElementById('tb-unified-search'))searchResultsEl.innerHTML=tbUnifiedSearchResultsHTML();
      });
    },300);
  });
  searchResultsEl.addEventListener('click',e=>{
    // GOLF-67: two actions share this delegated handler — anchor (moves the
    // discovery lens, clears the search) and add-to-trip (adds a day, keeps
    // the search open so several cities can be added in one go).
    const trip=e.target.closest('.tb-unified-place-trip');
    if(trip){
      e.preventDefault();
      tbAddPlaceToTrip(parseFloat(trip.dataset.lat),parseFloat(trip.dataset.lng),trip.dataset.label);
      return;
    }
    const row=e.target.closest('.tb-unified-place-add');
    if(!row)return;
    e.preventDefault();
    tbAnchorTripToPlace(parseFloat(row.dataset.lat),parseFloat(row.dataset.lng),row.dataset.label);
  });
  /* GOLF-63: search-as-you-type wiring for the open "add hotel/POI" form —
     same debounce + mousedown-to-pick pattern as the day place boxes below,
     but a pick fills the name field and stashes the coordinates on tbAddStop
     rather than committing anything (the visitor still confirms with Add). */
  if(tbAddStop){
    const input=document.getElementById('tb-addstop-name'),results=document.getElementById('tb-addstop-results');
    if(input&&results){
      let debounce=null;
      input.addEventListener('input',()=>{
        tbAddStop.name=input.value;tbAddStop.lat=null;tbAddStop.lng=null;
        const text=input.value;
        clearTimeout(debounce);
        if(!text.trim()){results.innerHTML='';return;}
        debounce=setTimeout(()=>{
          orsGeocode(text,list=>{
            if(document.activeElement!==input)return;
            if(list==null){results.innerHTML='';return;}
            results.innerHTML=list.length?list.map(r=>
              `<div class="tb-place-row" data-lat="${r.lat}" data-lng="${r.lng}" data-label="${r.label.replace(/"/g,'&quot;')}">${r.label}</div>`
            ).join(''):'<div class="tb-place-empty">No matches</div>';
          });
        },300);
      });
      results.addEventListener('mousedown',e=>{
        const row=e.target.closest('.tb-place-row');
        if(!row)return;
        e.preventDefault();
        const priceEl=document.getElementById('tb-addstop-price');
        tbAddStop.price=priceEl?priceEl.value:'';
        tbAddStop.name=row.dataset.label;
        tbAddStop.lat=parseFloat(row.dataset.lat);tbAddStop.lng=parseFloat(row.dataset.lng);
        results.innerHTML='';
        renderTripBuilder();
      });
      input.addEventListener('blur',()=>{setTimeout(()=>{if(document.getElementById('tb-addstop-results')===results)results.innerHTML='';},150);});
    }
  }
  if(appMode==='build'&&tbBuildTab==='itin'&&tbItinFilter==='all'){
    /* GOLF-56: search-as-you-type wiring for each day's place box — mirrors
       the search-bar pattern above, one instance per day. mousedown (not
       click) on a result row so the input's blur doesn't clobber the pick. */
    tripDays.forEach(d=>{
      const input=document.getElementById(`tb-place-${d.id}`);
      const results=document.getElementById(`tb-place-results-${d.id}`);
      if(!input||!results)return;
      let debounce=null;
      input.addEventListener('input',()=>{
        const text=input.value;
        clearTimeout(debounce);
        if(!text.trim()){results.innerHTML='';return;}
        debounce=setTimeout(()=>{
          orsGeocode(text,list=>{
            if(document.activeElement!==input)return;
            if(list==null){results.innerHTML='';return;}
            results.innerHTML=list.length?list.map(r=>
              `<div class="tb-place-row" data-lat="${r.lat}" data-lng="${r.lng}" data-label="${r.label.replace(/"/g,'&quot;')}">${r.label}</div>`
            ).join(''):'<div class="tb-place-empty">No matches</div>';
          });
        },300);
      });
      results.addEventListener('mousedown',e=>{
        const row=e.target.closest('.tb-place-row');
        if(!row)return;
        e.preventDefault();
        tripDaySetPlaceGeo(d.id,row.dataset.label,parseFloat(row.dataset.lat),parseFloat(row.dataset.lng));
        renderTripBuilder();
        tbDrawMap();
      });
      input.addEventListener('blur',()=>{setTimeout(()=>{results.innerHTML='';},150);});
      /* GOLF-66: a just-created day hands focus straight to its place box,
         so "+ Add day" lands the visitor in the same search-and-pick flow
         the search bar uses. One-shot — cleared here so the next ordinary
         re-render doesn't yank focus back. */
      if(tbFocusDayPlace===d.id){tbFocusDayPlace=null;input.focus();}
    });
  }
  if(appMode==='plan'){
    document.getElementById('tb-tab-place').addEventListener('click',()=>{tbDiscoveryTab='place';renderTripBuilder();tbDrawMap();});
    document.getElementById('tb-tab-anchor').addEventListener('click',()=>{tbDiscoveryTab='anchor';renderTripBuilder();tbDrawMap();});
    document.getElementById('tb-tab-region').addEventListener('click',()=>{tbDiscoveryTab='region';renderTripBuilder();tbDrawMap();});
    if(tbDiscoveryTab==='region'){
      const run=()=>{document.getElementById('tb-results').innerHTML=tbResultsHTML(tbDiscover());tbDrawMap();};
      document.getElementById('tb-region').addEventListener('change',run);
      document.getElementById('tb-border').addEventListener('change',run);
    }
    if(tbDiscoveryTab==='place'){
      /* GOLF-58: same search-as-you-type pattern as the day place boxes —
         mousedown (not click) on a result so blur doesn't clobber the pick. */
      const input=document.getElementById('tb-start-place'),results=document.getElementById('tb-start-place-results');
      let debounce=null;
      input.addEventListener('input',()=>{
        const text=input.value;
        clearTimeout(debounce);
        if(!text.trim()){results.innerHTML='';return;}
        debounce=setTimeout(()=>{
          orsGeocode(text,list=>{
            if(document.activeElement!==input)return;
            if(list==null){results.innerHTML='';return;}
            results.innerHTML=list.length?list.map(r=>
              `<div class="tb-place-row" data-lat="${r.lat}" data-lng="${r.lng}" data-label="${r.label.replace(/"/g,'&quot;')}">${r.label}</div>`
            ).join(''):'<div class="tb-place-empty">No matches</div>';
          });
        },300);
      });
      results.addEventListener('mousedown',e=>{
        const row=e.target.closest('.tb-place-row');
        if(!row)return;
        e.preventDefault();
        tbPlaceAnchor={label:row.dataset.label,lat:parseFloat(row.dataset.lat),lng:parseFloat(row.dataset.lng)};
        results.innerHTML='';
        // tbDrawMap()'s own fitBounds (below) takes us to the place and its
        // nearby courses together — a separate flyTo here would just race it.
        renderTripBuilder();tbDrawMap();
      });
      input.addEventListener('blur',()=>{setTimeout(()=>{results.innerHTML='';},150);});
    }
  }
}
function tbDiscoverTabHTML(){
  return`<div class="toggles" style="margin-bottom:10px">
      <button class="togg" id="tb-tab-place" aria-pressed="${tbDiscoveryTab==='place'}">Near a place</button>
      <button class="togg" id="tb-tab-anchor" aria-pressed="${tbDiscoveryTab==='anchor'}">Nearby</button>
      <button class="togg" id="tb-tab-region" aria-pressed="${tbDiscoveryTab==='region'}">By region</button>
    </div>
    ${tbDiscoveryTab==='place'?`
      <p class="hint" style="margin:0 0 6px">Starting a new trip? Search a city or town — we'll take you there on the map and show the nearest bookable courses.</p>
      <span class="tb-place-wrap" style="position:relative;display:block;margin-bottom:8px">
        <input type="text" class="tb-place-input" id="tb-start-place" placeholder="Search a city or town…" value="${tbPlaceAnchor?tbPlaceAnchor.label.replace(/"/g,'&quot;'):''}" style="width:100%">
        <div id="tb-start-place-results" class="tb-place-results"></div>
      </span>`
      :tbDiscoveryTab==='anchor'?`
      <p class="hint" style="margin:0 0 8px">${tbEffectiveAnchor()!=null?`Nearest 5 courses to <b>${esc(V(tbEffectiveAnchor(),'n'))}</b>, straight-line.`:'Add a course from the map, or search above, to see what\'s nearby.'}</p>`
      :`<div class="fld" style="margin-bottom:8px"><label for="tb-region">Region</label>
        <select id="tb-region"><option value="">— choose a region —</option>${REGIONS.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div>
      <div class="fld" style="margin-bottom:8px"><label for="tb-border">Include courses just over the border, within (miles)</label><input id="tb-border" type="number" value="8" min="0" max="50"></div>`}
    <div id="tb-results">${tbResultsHTML(tbDiscover())}</div>`;
}
