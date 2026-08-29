/* ============================================================
   js/trip-ui.js — the Trip Builder pane UI: the shared search
   component, day cards, the itinerary lists, the Costs tab, the
   wishlist, and renderTripBuilder() with all of its event wiring.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* ════════════════════════════════════════════════════════════════════
   GOLF-71 workstream B — THE search component.

   Before this round the app hand-rolled the same "type → debounce →
   orsGeocode → results dropdown → mousedown to pick" sequence in FIVE
   places, each with its own subtly different copy of the debounce timer,
   the stale-response guard and the blur race-condition workaround:

     1. renderTripBuilder()  — the unified search bar
     2. renderTripBuilder()  — each day's "search a city" box
     3. renderTripBuilder()  — the "add hotel/POI" form's location box
     4. renderTripBuilder()  — Discover's "Near a place" box
     5. explore.js           — the Explore panel's #q place lookup

   Now there is one debounce (tbGeocodeDebounced), one markup helper
   (tbSearchFieldHTML) and one behaviour binding (tbAttachSearch), and
   every call site goes through them. Call site 4 was deleted outright
   rather than converted: the unified bar already anchors the discovery
   lens when you pick a place, so Discover's own box was a second control
   for an action the main bar performs — exactly the duplication the
   stakeholder asked to remove ("there should only be one search bar for
   everything"). Net: 5 bespoke implementations → 1 component, 3 call
   sites.
   ════════════════════════════════════════════════════════════════════ */

/* One debounce + stale-response guard, keyed so independent fields don't
   cancel each other. cb(null) means "cleared / nothing to show"; cb([])
   means "the geocoder answered with no matches". */
const tbGeoTimers={},tbGeoLatest={};
function tbGeocodeDebounced(key,text,cb,ms){
  clearTimeout(tbGeoTimers[key]);
  tbGeoLatest[key]=text;
  if(!text||!text.trim()){cb(null);return;}
  tbGeoTimers[key]=setTimeout(()=>{
    orsGeocode(text,list=>{
      if(tbGeoLatest[key]!==text)return; // a newer keystroke has since fired
      cb(list||[]);
    });
  },ms==null?300:ms);
}
/* The component's markup. `variant:'bar'` is the full-width pill at the
   top of the pane; the default is an inline field inside a card. The
   results container is always `<id>-results`, which is the contract
   tbAttachSearch() relies on. */
function tbSearchFieldHTML(o){
  const bar=o.variant==='bar';
  return`<span class="tb-place-wrap${bar?' tb-search-bar-wrap':''}"${o.wrapStyle?` style="${o.wrapStyle}"`:''}>
    <input type="text" id="${o.id}" class="${bar?'tb-search-bar':'tb-field'}" autocomplete="off" spellcheck="false"
      role="combobox" aria-expanded="false" aria-autocomplete="list"
      ${o.title?`title="${esc(o.title)}"`:''} ${o.ariaLabel?`aria-label="${esc(o.ariaLabel)}"`:''}
      placeholder="${esc(o.placeholder||'')}" value="${esc(o.value==null?'':o.value)}">
    <div id="${o.id}-results" class="tb-place-results" role="listbox"></div>
  </span>`;
}
/* The component's behaviour. Binds one field + its results dropdown.
     opts.onPick({label,lat,lng}, inputEl)  — required; a result was chosen
     opts.onType(text)                      — optional; every keystroke
     opts.render(list, resultsEl)           — optional; take over painting
                                              (used by the unified bar,
                                              which mixes course hits in)
   Keyboard: ↑/↓ move, Enter picks, Escape closes — the dropdown was
   mouse-only before. mousedown (not click) picks, so the input's own
   blur can't clobber the selection mid-gesture. */
function tbAttachSearch(id,opts){
  const input=document.getElementById(id),results=document.getElementById(id+'-results');
  if(!input||!results)return null;
  let active=-1;
  const rows=()=>Array.from(results.querySelectorAll('.tb-place-row'));
  const close=()=>{results.innerHTML='';active=-1;input.setAttribute('aria-expanded','false');};
  const paint=list=>{
    active=-1;
    if(list==null){close();return;}
    results.innerHTML=list.length
      ?list.map(r=>`<div class="tb-place-row" role="option" data-lat="${r.lat}" data-lng="${r.lng}" data-label="${esc(r.label)}">📍 ${esc(r.label)}</div>`).join('')
      :`<div class="tb-place-empty">No matches</div>`;
    input.setAttribute('aria-expanded',String(!!list.length));
  };
  const pick=row=>{
    const r={label:row.dataset.label,lat:parseFloat(row.dataset.lat),lng:parseFloat(row.dataset.lng)};
    close();
    opts.onPick(r,input);
  };
  input.addEventListener('input',()=>{
    const text=input.value;
    if(opts.onType)opts.onType(text);
    tbGeocodeDebounced(id,text,list=>{
      // Don't paint over a field the visitor has already left.
      if(document.activeElement!==input&&!opts.render)return;
      if(opts.render)opts.render(list,results);else paint(list);
    });
  });
  input.addEventListener('keydown',e=>{
    const rs=rows();
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!rs.length)return;
      e.preventDefault();
      active=(active+(e.key==='ArrowDown'?1:-1)+rs.length)%rs.length;
      rs.forEach((r,k)=>r.classList.toggle('is-active',k===active));
      rs[active].scrollIntoView({block:'nearest'});
    }else if(e.key==='Enter'){
      if(active>=0&&rs[active]){e.preventDefault();pick(rs[active]);}
    }else if(e.key==='Escape'){close();}
  });
  results.addEventListener('mousedown',e=>{
    const row=e.target.closest('.tb-place-row');
    if(!row)return;
    e.preventDefault();
    pick(row);
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(results.isConnected)close();},150));
  return{input,results,close,paint};
}

/* ════════════════════════════════════════════════════════════════════
   Day legs — one row per stop, with a drive caption above each stop that
   has a predecessor. Unchanged from GOLF-63 in behaviour; only the
   rendering below it changed this round.
   ════════════════════════════════════════════════════════════════════ */
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
/* GOLF-71: the drive leg is a small indented caption sitting directly
   above the stop it leads into — the sketch's "Drive X min" label — not
   the chip-and-full-route-string row it used to be. The from → to string
   is still available, in the title tooltip, where it doesn't compete with
   the stop names for attention. */
function tbDriveCapHTML(l){
  if(l.mins==null&&!l.label)return'';
  return`<div class="tb-drive-cap" title="${esc(l.label)}">🚗 Drive ${l.mins!=null?esc(fmtDriveMinutes(l.mins)):'—'}${l.real?` <span class="tb-drive-real">· live</span>`:''}</div>`;
}
const tbMoney=v=>v!=null?`£${v.toFixed(0)}`:'—';
/* GOLF-74: the £ figure as the visitor should read it. A per-person-sharing
   stay shows its arithmetic ("£90 × 2 (sharing) = £180") rather than silently
   folding the doubling into the trip total — the stakeholder's explicit ask.
   Everything else is plain tbMoney(), so this is a strict superset. */
function tripPriceLabel(det){
  if(!det||det.total==null)return'—';
  return det.sharing?`£${det.base.toFixed(0)} × ${det.guests} (sharing) = £${det.total.toFixed(0)}`:tbMoney(det.total);
}
function itinLegRowHTML(l){
  if(l.type==='drive')return tbDriveCapHTML(l);
  const icon=l.type==='golf'?'⛳':l.type==='hotel'?'🏨':'📍';
  /* Merge (GOLF-71 + GOLF-74): GOLF-71's price column is a single nowrap
     figure and stays exactly that — the sharing arithmetic would have burst
     it. Instead a per-person stay explains itself on GOLF-71's own existing
     .cart-region meta line under the name, so the worked total is visible
     (not hidden in a tooltip) without changing the row's shape or adding a
     new style. Build-mode rows, which have no meta line to spare, keep the
     tooltip. */
  const sharing=!!(l.detail&&l.detail.sharing);
  return`<div class="tb-day-course tb-item-${l.type}" style="cursor:default">
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main"><span class="tb-item-name">${esc(l.name)}</span>
      ${sharing?`<div class="cart-region">£${l.detail.base.toFixed(0)} × ${l.detail.guests} (sharing) = £${l.detail.total.toFixed(0)}</div>`:''}</div>
    <span class="tb-item-price">${tbMoney(l.price)}</span>
  </div>`;
}
function tbItinAllHTML(){
  if(!tripDays.length)return`<p class="hint">Add a day to start building your itinerary.</p>`;
  return tripDays.map((d,idx)=>{
    const legs=tripDayLegs(idx).filter(l=>tbDriveToggle||l.type!=='drive');
    const dow=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}):'';
    return`<div class="tb-day">
      <div class="tb-day-head">
        <span class="tb-day-title"><span class="tb-day-dot"></span>
          <span class="tb-day-title-text">Day ${idx+1}</span>
          <span class="tb-day-place">${[dow,d.place?esc(d.place):''].filter(Boolean).join(' · ')}</span></span>
        <span class="tb-day-sum">${tbMoney(tripDayTotal(idx)||null)}</span>
      </div>
      <div class="tb-day-rule"></div>
      ${legs.length?legs.map(itinLegRowHTML).join(''):`<p class="hint" style="margin:var(--sp-3)">${d.kind!=='golf'?TRIP_DAY_KINDS[d.kind]:'No stops yet.'}</p>`}
    </div>`;
  }).join('');
}
function tbItinGolfListHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='golf')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it)});}));
  if(!rows.length)return`<p class="hint">No golf rounds scheduled yet.</p>`;
  return rows.map(r=>`<div class="itin-card"><div class="itin-card-kicker">Day ${r.day}</div>
    <div class="itin-flat-row"><span class="itin-golf-name-lg">⛳ ${esc(r.name)}</span><span class="itin-golf-price-lg">${tbMoney(r.price)}</span></div></div>`).join('');
}
function tbItinHotelRailHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='hotel')rows.push({day:idx+1,name:tripItemName(it),detail:tripItemPriceDetail(d,it)});}));
  if(!rows.length)return`<p class="hint">No stays added yet.</p>`;
  return`<div class="itin-rail">${rows.map(r=>`<div class="itin-rail-row"><div class="itin-rail-dot"></div>
      <div class="itin-card-kicker">Day ${r.day}</div>
      <div class="itin-flat-row"><span class="itin-hotel-name-md">🏨 ${esc(r.name)}</span><span class="itin-hotel-price-md">${tripPriceLabel(r.detail)}</span></div>
    </div>`).join('')}</div>`;
}
function tbItinPoiListHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='poi')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it)});}));
  if(!rows.length)return`<p class="hint">No stops added yet.</p>`;
  return rows.map(r=>`<div class="itin-card"><div class="itin-card-kicker">Day ${r.day}</div>
    <div class="itin-flat-row"><span class="itin-hotel-name-md">📍 ${esc(r.name)}</span><span class="itin-golf-price-lg">${tbMoney(r.price)}</span></div></div>`).join('');
}
function tbItineraryHTML(){
  if(!tripSeq.length&&!tripDays.some(d=>d.place||tripDayItems(d).length))
    return`<p class="hint">Nothing in this trip yet. Search above, or hit <b>Add to trip</b> on any course.</p>`;
  if(tbItinFilter==='golf')return tbItinGolfListHTML();
  if(tbItinFilter==='hotel')return tbItinHotelRailHTML();
  if(tbItinFilter==='poi')return tbItinPoiListHTML();
  return tbItinAllHTML();
}

/* ════════════════════════════════════════════════════════════════════
   Costs tab
   ════════════════════════════════════════════════════════════════════ */
function tripCostLineItems(){
  const items=[];
  // GOLF-63: itemised in the day's own order, so the breakdown reads down
  // the day the same way the itinerary does. GOLF-71 renamed the POI
  // category label to "Stop" (tripCostBreakdown() filters on that string).
  const CAT={golf:'Golf',hotel:'Stay',poi:'Stop'};
  // GOLF-74: a per-person-sharing stay carries its arithmetic into the label
  // so the line item explains its own (doubled) amount.
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{
    const det=tripItemPriceDetail(d,it);
    items.push({label:tripItemName(it)+(det.sharing?` (£${det.base.toFixed(0)} × ${det.guests} sharing)`:''),
      cat:CAT[it.type]||'Stop',amount:det.total,day:idx+1});
  }));
  tripUnscheduled().forEach(i=>items.push({label:V(i,'n'),cat:'Golf',amount:extractFee(V(i,'wd')),day:null}));
  return items;
}
function tripCostBreakdown(){
  const items=tripCostLineItems();
  const sum=arr=>arr.reduce((t,x)=>t+(x.amount||0),0);
  const golf=items.filter(x=>x.cat==='Golf'),stay=items.filter(x=>x.cat==='Stay'),poi=items.filter(x=>x.cat==='Stop');
  const fuelMiles=tripTotalDriveMiles();
  const fuelCost=fuelMiles*FUEL_COST_PER_MILE;
  const golfTotal=sum(golf),stayTotal=sum(stay),poiTotal=sum(poi);
  const grand=golfTotal+stayTotal+poiTotal+(tbIncludeFuel?fuelCost:0);
  return{items,golfTotal,golfCov:golf.filter(x=>x.amount!=null).length,golfOf:golf.length,stayTotal,poiTotal,fuelMiles,fuelCost,grand};
}
function tbTripTotal(){return tripCostBreakdown().grand;}
/* GOLF-71 copy audit. Before, this tab carried a three-sentence paragraph
   under the summary table explaining fee coverage, where stay prices come
   from, how to add one, and that fuel is a straight-line estimate. Two of
   those facts are now conveyed by the controls themselves ("Fuel (est.)"
   is labelled est.; a stay's price is edited on the stay), so what's left
   is the one thing the numbers genuinely can't say: how many fees are
   real vs assumed. */
function tbCostsTabHTML(){
  const b=tripCostBreakdown();
  return`<div class="cost-banner"><div class="cost-banner-label">Trip total</div><div class="cost-banner-amount">£${b.grand.toFixed(0)}</div></div>
    <div class="cost-card"><table class="cost-summary-table">
      <tr><td>⛳ Golf</td><td>£${b.golfTotal.toFixed(0)}</td></tr>
      <tr><td>🏨 Stays</td><td>£${b.stayTotal.toFixed(0)}</td></tr>
      <tr><td>📍 Stops</td><td>£${b.poiTotal.toFixed(0)}</td></tr>
      <tr><td><label class="cost-fuel-toggle"><input type="checkbox" ${tbIncludeFuel?'checked':''} onchange="tbIncludeFuel=this.checked;renderTripBuilder();"> Fuel (est.)</label></td><td>£${b.fuelCost.toFixed(0)}</td></tr>
    </table></div>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} green fee${b.golfOf===1?'':'s'} confirmed — the rest are typical rates.</p>
    <div class="cost-line-items-label">Line items</div>
    <div class="cost-card"><table class="cost-line-table">${b.items.length?b.items.map(x=>`<tr><td>${esc(x.label)} <span class="wt">${x.cat}</span></td><td>${tbMoney(x.amount)}</td></tr>`).join(''):`<tr><td colspan="2" class="hint">No costs yet.</td></tr>`}</table></div>`;
}

/* ════════════════════════════════════════════════════════════════════
   Build mode's editable itinerary — the day cards from the sketch.
   ════════════════════════════════════════════════════════════════════ */
let tbBuildTab='itin',tbItinFilter='all',tbDriveToggle=true,tbDayShown=null;

/* One day card. Structure follows the sketch exactly: bold day title with
   a right-aligned running total in the header, a thin divider, then the
   stops — each preceded by its own small "Drive X min" caption.

   Everything that is a *setting* rather than a *stop* (day kind, city,
   date, manual drive override, remove-day) is folded into one collapsed
   "Options" dropdown, per "you can save space by hiding things in drop
   down menus". It opens automatically for a just-created day so GOLF-66's
   "+ Add day lands you in the city picker" flow still works in one click. */
function tbDayCardHTML(d,idx){
  const kind=TRIP_DAY_KINDS[d.kind]?d.kind:'golf';
  const items=tripDayItems(d);
  const nCourses=items.filter(it=>it.type==='golf').length;
  const byId=new Map(items.map(it=>[it.id,it]));
  const rowsHTML=tripDayLegs(idx).map(l=>{
    if(l.type==='drive')return tbDriveToggle?tbDriveCapHTML(l):'';
    const it=byId.get(l.id);
    if(!it)return'';
    /* GOLF-73: an item being edited swaps its row for the inline edit form
       in place, so the form appears exactly where the thing it edits was.
       Carried across the GOLF-71 restructure unchanged — the row markup
       around it is new, the swap rule is not. */
    if(tbAddStop&&tbAddStop.itemId===it.id&&tbAddStop.dayId===d.id)return tbAddStopFormHTML(d.id,it.id);
    return tripDayItemRowHTML(d,it);
  }).join('');
  const dow=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}):'';
  const sub=[dow,d.place?esc(d.place):'',kind!=='golf'?TRIP_DAY_KINDS[kind]:''].filter(Boolean).join(' · ');
  const openSettings=tbFocusDayPlace===d.id;
  return`
    <div class="tb-day tb-day-${kind}"
      ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropInDay(${d.id},null);">
      <div class="tb-day-head" draggable="true"
        ondragstart="tbDayDragSet(${d.id},event,this);"
        ondragend="tbDragEnd();">
        <span class="tb-drag-handle" title="Drag to move this whole day">⠿</span>
        <span class="tb-day-title"><span class="tb-day-dot"></span>
          <span class="tb-day-title-text">Day ${idx+1}</span>
          ${sub?`<span class="tb-day-place">${sub}</span>`:''}</span>
        <span class="tb-day-sum">${tbMoney(tripDayTotal(idx)||null)}</span>
      </div>
      <div class="tb-day-rule"></div>
      <details class="tb-day-settings"${openSettings?' open':''}>
        <summary>Options</summary>
        <div class="tb-day-settings-body">
          <select aria-label="Day type" onchange="tripDaySetKind(${d.id},this.value);renderTripBuilder();">${Object.entries(TRIP_DAY_KINDS).map(([k,label])=>`<option value="${k}"${k===kind?' selected':''}>${label}</option>`).join('')}</select>
          ${tbSearchFieldHTML({id:`tb-place-${d.id}`,value:d.place||'',placeholder:'City',ariaLabel:`City for day ${idx+1}`,wrapStyle:'flex:1 1 150px;min-width:0'})}
          <label style="display:inline-flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-caption);color:var(--stone)"
            title="Optional. Setting a date costs this day at the correct weekday or weekend green fee.">Date · optional
            <input type="date" value="${d.date??''}" onchange="tripDaySetDate(${d.id},this.value===''?null:this.value);renderTripBuilder();"></label>
          ${tripDayDriveHTML(d,idx)}
          <button class="tb-btn is-sm is-danger" onclick="tripDayRemove(${d.id});renderTripBuilder();tbDrawMap();">Remove day ${idx+1}</button>
        </div>
      </details>
      ${items.length?rowsHTML:`<p class="hint" style="margin:0 var(--sp-3) var(--sp-3) 44px">Drag a course here, or add a stop below.</p>`}
      <div class="tb-dropzone"
        ondragover="event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';tbDropOver(this);"
        ondragleave="tbDropOut(this,event);"
        ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);tbDropInDay(${d.id},null);">↓ Put it last on Day ${idx+1}</div>
      ${tripDaySuggestedTown(d)?`<div class="tb-day-town">Staying near <b>${esc(tripDaySuggestedTown(d))}</b>${nCourses&&ORS_PROXY_URL?` · <a href="#" class="linkbtn" onclick="event.preventDefault();tbTogglePois(${d.id})">${tbPoiOn.has(d.id)?'hide':'show'} what's nearby</a>`:''}</div>`:''}
      ${tbPoiListHTML(d)}
      ${tbAddStopFormHTML(d.id)}
      <div class="tb-day-add">
        <button class="tb-btn is-sm" onclick="tbPromptHotel(${d.id})">🏨 Add stay</button>
        <button class="tb-btn is-sm" onclick="tbPromptPoi(${d.id})">📍 Add stop</button>
      </div>
    </div>`;
}
/* GOLF-71 copy audit: this view opened with a 60-word paragraph explaining
   how to drag rows, how to drag day headers, and what auto-order does.
   With a real 44px drag handle, a visible lift on pickup and a solid
   insertion line, the gesture teaches itself — so the paragraph is gone
   and "Auto-order" is simply a button you can see. */
function tripDayScheduleHTML(){
  if(!tripSeq.length&&!tripDays.length)
    return`<p class="hint">Nothing scheduled yet.</p>
      <div class="tb-day-add" style="padding-left:0"><button class="tb-btn is-primary" onclick="tbAddDayWithPlace();">＋ Add a day</button>
      <button class="tb-btn" onclick="setAppMode('plan')">Browse courses</button></div>`;
  const unscheduled=tripUnscheduled();
  const daysHTML=tripDays.map((d,idx)=>tbDayCardHTML(d,idx)).join('');
  const unschedHTML=unscheduled.length?`
    <div class="tb-day tb-day-wish" ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropOn(null,null);">
      <div class="tb-day-head"><span class="tb-day-title"><span class="tb-day-title-text">Wishlist</span>
        <span class="tb-day-place">${unscheduled.length} course${unscheduled.length===1?'':'s'} · not on a day yet</span></span></div>
      <div class="tb-day-rule"></div>
      ${unscheduled.map(i=>tripDayCourseRowHTML(i,null)).join('')}
    </div>`:'';
  const total=tbTripTotal();
  return`${daysHTML}${unschedHTML}
    <div class="tb-day-endzone tb-day-add" style="padding-left:0"
      ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropDayAtEnd();">
      <button class="tb-btn is-primary" onclick="tbAddDayWithPlace();">＋ Add a day</button>
      ${tripDays.length>1?`<button class="tb-btn" onclick="tripAutoOrder()" title="Reorder your courses by nearest-neighbour to cut driving">Auto-order</button>`:''}
    </div>
    <div class="tb-total-card"><span class="tb-total-label">Trip total</span><span class="tb-total-amount">£${total.toFixed(0)}</span></div>`;
}

/* Plan mode's wishlist. */
function tbWishlistHTML(){
  const unscheduled=tripUnscheduled();
  if(!unscheduled.length)return`<p class="hint">Nothing on your wishlist yet — add any course you fancy playing.</p>`;
  const rows=unscheduled.map(i=>{
    const fee=extractFee(V(i,'wd'));
    return`<div class="tb-day-course tb-item-golf" style="cursor:default">
      <span class="tb-item-icon">⛳</span>
      <div class="tb-item-main"><a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        <div class="cart-region">${esc(C[i].r)}</div></div>
      <span class="tb-item-price">${tbMoney(fee)}</span>
      <div class="tb-item-actions"><button class="tb-btn is-icon is-sm is-quiet" title="Remove from wishlist"
        onclick="toggleTrip(${i});renderTripBuilder();tbDrawMap();">✕</button></div>
    </div>`;}).join('');
  return`<div class="tb-day">
      <div class="tb-day-head"><span class="tb-day-title"><span class="tb-day-title-text">Wishlist</span>
        <span class="tb-day-place">${unscheduled.length} course${unscheduled.length===1?'':'s'}</span></span></div>
      <div class="tb-day-rule"></div>
      ${rows}
      ${tripWishlistSummaryHTML(unscheduled)}
      <div class="tb-day-add"><button class="tb-btn is-primary" onclick="enterBuildMode()">Schedule these into days →</button></div>
    </div>`;
}
function tbPlanHTML(){return tbDiscoverTabHTML()+`<div class="tb-section-title" style="margin-top:var(--sp-6)">Your wishlist</div>${tbWishlistHTML()}`;}

/* Discover. GOLF-71: its own "Near a place" search box is gone — the one
   search bar at the top of the pane anchors the lens when you pick a
   place, which is what that box did. The scope segmented control stays. */
function tbDiscoverTabHTML(){
  const scopes=[['place','Near a place'],['anchor','Nearby'],['region','By region']];
  return`<div class="tb-section-title">Find courses</div>
    <div class="tb-seg" style="margin-bottom:var(--sp-3)">${scopes.map(([k,label])=>
      `<button id="tb-tab-${k}" aria-pressed="${tbDiscoveryTab===k}">${label}</button>`).join('')}</div>
    ${tbDiscoveryTab==='place'?`<p class="hint" style="margin:0 0 var(--sp-2)">${tbPlaceAnchor?`Courses near <b>${esc(tbPlaceAnchor.label)}</b>.`:'Search a town or city in the bar above.'}</p>`
      :tbDiscoveryTab==='anchor'?`<p class="hint" style="margin:0 0 var(--sp-2)">${tbEffectiveAnchor()!=null?`Courses near <b>${esc(V(tbEffectiveAnchor(),'n'))}</b>.`:'Add a course to see what\'s nearby.'}</p>`
      :`<div class="tb-day-settings-body" style="padding:0 0 var(--sp-3)">
        <select id="tb-region" aria-label="Region"><option value="">Choose a region…</option>${REGIONS.map(r=>`<option value="${r}">${r}</option>`).join('')}</select>
        <label style="display:inline-flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-caption);color:var(--stone)"
          title="Also include courses just outside the region, within this many miles of its edge">Border
          <input id="tb-border" type="number" value="8" min="0" max="50" style="width:70px"></label>
      </div>`}
    <div id="tb-results">${tbResultsHTML(tbDiscover())}</div>`;
}

/* ════════════════════════════════════════════════════════════════════
   The pane itself. Chrome order matches the stakeholder's sketch:
     navbar → one pill search bar → [Trip ▾][Filters ▾][Clear trip]
     → pill tabs → content.
   The tab row now spans BOTH modes: Itinerary and Costs are Build,
   Discover is Plan. That kills the old "← Back to wishlist" backlink
   (a second control for what a tab already does) and makes moving
   between browsing and scheduling one click in either direction.
   ════════════════════════════════════════════════════════════════════ */
/* Any open <details> menu in the pane closes on an outside click — a
   <details> won't do this by itself, and a menu you must click twice to
   dismiss is exactly the friction this round removes. Bound ONCE for the
   life of the page (not per render) so row menus opened after a render
   are covered too, and so re-renders can't stack duplicate listeners. */
let tbDismissBound=false;
function tbBindDropdownDismiss(){
  if(tbDismissBound)return;
  tbDismissBound=true;
  document.addEventListener('mousedown',e=>{
    document.querySelectorAll('#tb-pane details[open].tb-drop,#tb-pane details[open].tb-rowmenu')
      .forEach(dd=>{if(!dd.contains(e.target))dd.removeAttribute('open');});
  });
}
function renderTripBuilder(){
  const pane=document.getElementById('tb-pane');
  if(tbDayShown==null||!tripDays.find(d=>d.id===tbDayShown))tbDayShown=tripDays.length?tripDays[0].id:null;
  const total=tbTripTotal();
  const isBuild=appMode==='build';
  const activeTab=isBuild?tbBuildTab:'discover';
  const TABS=[['itin','Itinerary'],['cost','Costs'],['discover','Discover']];
  const showItinFilters=isBuild&&tbBuildTab==='itin';
  pane.innerHTML=`
    <div class="tb-navbar">
      <span class="tb-wordmark">${isBuild?'Build your trip':'Plan a trip'}</span>
      <span class="tb-navbar-right"><span class="tb-pill">${isBuild&&tripDays.length?`${tripDays.length} day${tripDays.length===1?'':'s'} · `:''}£${total.toFixed(0)}</span>
        <button class="tb-btn is-sm is-quiet" id="tb-exit">← Explore</button></span>
    </div>
    ${tbSearchFieldHTML({id:'tb-unified-search',variant:'bar',value:tbSearchQ,
      placeholder:'Search courses, towns and cities…',ariaLabel:'Search courses, towns and cities'})}
    <div class="tb-section" id="tb-search-results" style="border-bottom:none;padding-top:0${tbSearchQ.trim()?'':';display:none'}">${tbSearchQ.trim()?tbUnifiedSearchResultsHTML():''}</div>
    <div class="tb-toolbar">
      ${tbTripMenuHTML()}
      ${showItinFilters?`<details class="tb-drop" id="tb-filter-drop">
        <summary title="Filter what this itinerary shows">Filters${tbItinFilter!=='all'||!tbDriveToggle?' ·':''}</summary>
        <div class="tb-drop-body">
          <div class="tb-menu-label">Show</div>
          ${[['all','Everything'],['golf','⛳ Golf only'],['hotel','🏨 Stays only'],['poi','📍 Stops only']].map(([k,label])=>
            `<button type="button" class="tb-menu-item" data-itin-filter="${k}">${tbItinFilter===k?'✓':'&nbsp;&nbsp;'} ${label}</button>`).join('')}
          <div class="tb-menu-sep"></div>
          <button type="button" class="tb-menu-item" id="tb-drive-toggle">${tbDriveToggle?'✓':'&nbsp;&nbsp;'} 🚗 Drive times</button>
        </div>
      </details>`:''}
      <button class="tb-btn is-danger" id="tb-clear-trip" title="Empties this trip. Your other trips are untouched — to delete every trip use Start fresh in the trip menu.">Clear trip</button>
    </div>
    <div class="tb-tabs" role="tablist">${TABS.map(([k,label])=>
      `<button class="tb-tab-btn" role="tab" data-tab="${k}" aria-pressed="${activeTab===k}">${label}</button>`).join('')}</div>
    <div class="tb-tab-content">${
      !isBuild?tbPlanHTML()
      :tbBuildTab==='cost'?tbCostsTabHTML()
      :tbItinFilter==='all'?tripDayScheduleHTML()
      :tbItineraryHTML()
    }</div>`;

  document.getElementById('tb-exit').addEventListener('click',()=>exitTripBuilder());
  document.getElementById('tb-clear-trip').addEventListener('click',()=>tripClearAll());
  /* Tabs span both modes: Discover means Plan, the other two mean Build. */
  pane.querySelectorAll('.tb-tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const k=btn.dataset.tab;
    if(k==='discover'){setAppMode('plan');return;}
    tbBuildTab=k;
    if(appMode!=='build')setAppMode('build');
    else{renderTripBuilder();tbDrawMap();}
  }));
  const filterDrop=document.getElementById('tb-filter-drop');
  if(filterDrop){
    filterDrop.querySelectorAll('[data-itin-filter]').forEach(btn=>btn.addEventListener('click',()=>{tbItinFilter=btn.dataset.itinFilter;renderTripBuilder();}));
    document.getElementById('tb-drive-toggle').addEventListener('click',()=>{tbDriveToggle=!tbDriveToggle;renderTripBuilder();});
  }
  tbBindDropdownDismiss();

  /* ── The one search bar. Course hits and place hits share its results
     panel; the component owns the debounce/stale-guard/keyboard, and
     `render` takes over painting so places and courses can be mixed. ── */
  const searchResultsEl=document.getElementById('tb-search-results');
  tbAttachSearch('tb-unified-search',{
    onType(text){
      tbSearchQ=text;
      const q=text.trim();
      searchResultsEl.style.display=q?'':'none';
      tbUnifiedPlaceResults=null;
      tbPlaceAddedNote=null; // the "added as Day N" note belongs to the query that produced it
      searchResultsEl.innerHTML=q?tbUnifiedSearchResultsHTML():'';
    },
    render(list){
      tbUnifiedPlaceResults=list||[];
      if(document.getElementById('tb-unified-search'))searchResultsEl.innerHTML=tbUnifiedSearchResultsHTML();
    },
    onPick(){/* unreachable: `render` owns this field's results panel */}
  });
  searchResultsEl.addEventListener('click',e=>{
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

  /* ── Call site 2: the open "add a stop" form's location field. ── */
  if(tbAddStop&&document.getElementById('tb-addstop-name')){
    tbAttachSearch('tb-addstop-name',{
      onType(text){tbAddStop.name=text;tbAddStop.lat=null;tbAddStop.lng=null;},
      onPick(r){
        const priceEl=document.getElementById('tb-addstop-price');
        tbAddStop.price=priceEl?priceEl.value:'';
        tbAddStop.name=r.label;tbAddStop.lat=r.lat;tbAddStop.lng=r.lng;
        renderTripBuilder();
      }
    });
  }
  /* ── Call site 3: each day card's city field. ── */
  if(isBuild&&tbBuildTab==='itin'&&tbItinFilter==='all'){
    tripDays.forEach(d=>{
      const s=tbAttachSearch(`tb-place-${d.id}`,{
        onPick(r){tripDaySetPlaceGeo(d.id,r.label,r.lat,r.lng);renderTripBuilder();tbDrawMap();}
      });
      if(!s)return;
      // Typing over a geocoded city and leaving commits the plain text.
      s.input.addEventListener('change',()=>{tripDaySetPlace(d.id,s.input.value);});
      /* GOLF-66: a just-created day hands focus straight to its city box.
         One-shot, so an ordinary re-render doesn't yank focus back. */
      if(tbFocusDayPlace===d.id){tbFocusDayPlace=null;s.input.focus();}
    });
  }
  if(appMode==='plan'){
    ['place','anchor','region'].forEach(k=>{
      const b=document.getElementById('tb-tab-'+k);
      if(b)b.addEventListener('click',()=>{tbDiscoveryTab=k;renderTripBuilder();tbDrawMap();});
    });
    if(tbDiscoveryTab==='region'){
      const run=()=>{document.getElementById('tb-results').innerHTML=tbResultsHTML(tbDiscover());tbDrawMap();};
      document.getElementById('tb-region').addEventListener('change',run);
      document.getElementById('tb-border').addEventListener('change',run);
    }
  }
}
