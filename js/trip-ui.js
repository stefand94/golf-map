/* ============================================================
   js/trip-ui.js — the Trip Builder pane UI: the shared search
   component, day cards, the itinerary lists, the Costs tab, the
   wishlist, and renderTripBuilder() with all of its event wiring.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* item-6: the Share button used a 🔗 chain-link emoji; the stakeholder's
   screenshot showed the standard iOS/macOS Share glyph (a box with an
   arrow lifting out of its top) and asked to match it. No system font
   renders that exact glyph as an emoji, so it's a small inline SVG
   instead — currentColor so it always matches the button's own text
   colour (light/dark, hover, disabled) with no separate theming needed. */
const SHARE_ICON_SVG=`<svg class="share-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

/* ════════════════════════════════════════════════════════════════════
   GOLF-71 workstream B — THE search component.

   Before this round the app hand-rolled the same "type → debounce →
   orsGeocode → results dropdown → mousedown to pick" sequence in FIVE
   places, each with its own subtly different copy of the debounce timer,
   the stale-response guard and the blur race-condition workaround:

     1. renderTripBuilder()  — the unified search bar
     2. renderTripBuilder()  — each day's "search a city" box
     3. renderTripBuilder()  — the "add hotel/POI" form's location box
     4. renderTripBuilder()  — Discover's place-search box (GOLF-91: this
        and the old "Nearby" scope were later merged into one "Nearby"
        scope; the search box itself lives in the unified bar (#1) now,
        not a separate box)
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
   cancel each other. Three distinct states, kept apart deliberately (Phase
   22 fix): cb(null) means "cleared / nothing typed"; cb(undefined) means
   "the geocode request itself failed" (network error, proxy down, ORS
   rejected it — orsGeocode() reports this as its own null, which used to
   get silently collapsed into "[]" here, making an outage look identical
   to "no matches"); cb([]) means "the geocoder answered and there
   genuinely are no matches". Callers should treat undefined as a reason to
   show an explicit "search unavailable" message, not an empty result. */
const tbGeoTimers={},tbGeoLatest={};
function tbGeocodeDebounced(key,text,cb,ms,country){
  clearTimeout(tbGeoTimers[key]);
  tbGeoLatest[key]=text;
  if(!text||!text.trim()){cb(null);return;}
  tbGeoTimers[key]=setTimeout(()=>{
    orsGeocode(text,list=>{
      if(tbGeoLatest[key]!==text)return; // a newer keystroke has since fired
      cb(list===null?undefined:list);
    },country);
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
    if(list===null){close();return;} // cleared / nothing typed
    if(list===undefined){ // the geocode request failed — distinct from a genuine zero-match answer
      results.innerHTML=`<div class="tb-place-empty">Place search is temporarily unavailable</div>`;
      input.setAttribute('aria-expanded','true');
      return;
    }
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
    const country=typeof opts.country==='function'?opts.country():opts.country;
    tbGeocodeDebounced(id,text,list=>{
      // Don't paint over a field the visitor has already left.
      if(document.activeElement!==input&&!opts.render)return;
      if(opts.render)opts.render(list,results);else paint(list);
    },null,country);
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
/* Currency correctness: every £ figure in the pane now takes an optional
   currency symbol (defaulting to £, the common case), sourced from
   courseCurrency()/tripItemPriceDetail()'s new `cur` field rather than
   hardcoded — GBP for GB/NI courses, EUR for Republic of Ireland, ZAR
   (shown as R) for South Africa. */
const tbMoney=(v,cur='£')=>v!=null?`${cur}${v.toFixed(0)}`:'—';
/* GOLF-74/91: the £ figure as the visitor should read it. A hotel priced
   for more than one traveller shows its arithmetic ("£90 × 2 people = £180")
   rather than silently folding the multiplication into the trip total.
   Everything else is plain tbMoney(), so this is a strict superset. */
function tripPriceLabel(det){
  if(!det||det.total==null)return'—';
  const cur=det.cur||'£';
  return det.sharing?`${cur}${det.base.toFixed(0)} × ${det.guests} people = ${cur}${det.total.toFixed(0)}`:tbMoney(det.total,cur);
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
  const cur=(l.detail&&l.detail.cur)||'£';
  return`<div class="tb-day-course tb-item-${l.type}" style="cursor:default">
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main"><span class="tb-item-name">${esc(l.name)}</span>
      ${sharing?`<div class="cart-region">${cur}${l.detail.base.toFixed(0)} × ${l.detail.guests} people = ${cur}${l.detail.total.toFixed(0)}</div>`:''}</div>
    <span class="tb-item-price">${tbMoney(l.price,cur)}</span>
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
        <span class="tb-day-sum">${tbMoney(tripDayTotal(idx)||null,tripDayCurrency(tripDays[idx]))}</span>
      </div>
      <div class="tb-day-rule"></div>
      ${legs.length?legs.map(itinLegRowHTML).join(''):`<p class="hint" style="margin:var(--sp-3)">${d.kind!=='golf'?TRIP_DAY_KINDS[d.kind]:'No stops yet.'}</p>`}
    </div>`;
  }).join('');
}
function tbItinGolfListHTML(){
  const rows=[];
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='golf')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it),cur:courseCurrency(it.i)});}));
  if(!rows.length)return`<p class="hint">No golf rounds scheduled yet.</p>`;
  return rows.map(r=>`<div class="itin-card"><div class="itin-card-kicker">Day ${r.day}</div>
    <div class="itin-flat-row"><span class="itin-golf-name-lg">⛳ ${esc(r.name)}</span><span class="itin-golf-price-lg">${tbMoney(r.price,r.cur)}</span></div></div>`).join('');
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
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{if(it.type==='poi')rows.push({day:idx+1,name:tripItemName(it),price:tripItemPrice(d,it),cur:tripDayCurrency(d)});}));
  if(!rows.length)return`<p class="hint">No stops added yet.</p>`;
  return rows.map(r=>`<div class="itin-card"><div class="itin-card-kicker">Day ${r.day}</div>
    <div class="itin-flat-row"><span class="itin-hotel-name-md">📍 ${esc(r.name)}</span><span class="itin-golf-price-lg">${tbMoney(r.price,r.cur)}</span></div></div>`).join('');
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
  // GOLF-87: golf/POI totals scale by the trip's group size — each
  // traveller plays their own round/pays their own POI cost — so tag those
  // rows "× groupSize"; a stay keeps its own GOLF-74 sharing tag (or "as
  // entered" when it's a plain room rate).
  const gs=groupSizeFor();
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{
    const det=tripItemPriceDetail(d,it);
    const tag=it.type==='hotel'?(det.sharing?`× ${det.guests} people`:'estimated'):(gs>1?`× ${gs}`:null);
    items.push({label:tripItemName(it)+(det.sharing?` (${det.cur}${det.base.toFixed(0)} × ${det.guests} people)`:''),
      cat:CAT[it.type]||'Stop',amount:det.total,day:idx+1,cur:det.cur,tag});
  }));
  tripUnscheduled().forEach(i=>{
    const fee=extractFee(V(i,'wd'));
    items.push({label:V(i,'n'),cat:'Golf',amount:fee==null?null:fee*gs,day:null,cur:courseCurrency(i),tag:gs>1?`× ${gs}`:null});
  });
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
  // GOLF-87: an even per-person split of the whole trip total — golf/POI
  // are already priced per-traveller above, stays keep their own GOLF-74
  // sharing math untouched, and fuel is one shared trip cost only divided
  // here, at the very last step.
  const gs=groupSizeFor();
  const perPerson=gs>1?grand/gs:null;
  return{items,golfTotal,golfCov:golf.filter(x=>x.amount!=null).length,golfOf:golf.length,stayTotal,poiTotal,fuelMiles,fuelCost,grand,groupSize:gs,perPerson};
}
function tbTripTotal(){return tripCostBreakdown().grand;}
/* GOLF-71 copy audit. Before, this tab carried a three-sentence paragraph
   under the summary table explaining fee coverage, where stay prices come
   from, how to add one, and that fuel is a straight-line estimate. Two of
   those facts are now conveyed by the controls themselves ("Fuel (est.)"
   is labelled est.; a stay's price is edited on the stay), so what's left
   is the one thing the numbers genuinely can't say: how many fees are
   real vs assumed. */
/* GOLF-91/item-5: line items used to sit in a second, always-open flat
   table below the category summary — the same figures shown twice, with
   no link between a category's total and the rows behind it. Each
   category row is now a <details class="cost-group"> that expands to
   reveal exactly its own line items — the summary *is* the group header,
   per the stakeholder's ask ("line items as part of a hierarchy you
   expand from the grouping above it"). Reuses the .fgroup chevron
   convention already established for Explore's filter dropdowns
   (london-golf-map-v5_1.html), just re-skinned to a label+amount row via
   .cost-group. */
function costGroupHTML(icon,label,total,items,cur){
  const rows=items.length
    ?items.map(x=>`<tr><td>${esc(x.label)}${x.tag?` <span class="wt">${esc(x.tag)}</span>`:''}</td><td>${tbMoney(x.amount,x.cur||cur)}</td></tr>`).join('')
    :`<tr><td colspan="2" class="hint">Nothing here yet.</td></tr>`;
  return`<details class="cost-group"><summary class="cost-group-summary">
      <span class="cost-group-label">${icon} ${label}</span>
      <span class="cost-group-amt">${cur}${total.toFixed(0)}</span>
    </summary>
    <table class="cost-line-table cost-group-lines">${rows}</table>
  </details>`;
}
function tbCostsTabHTML(){
  const b=tripCostBreakdown();
  const cur=tripPrimaryCurrency();
  const mixed=b.items.some(x=>x.cur&&x.cur!==cur);
  const golf=b.items.filter(x=>x.cat==='Golf'),stay=b.items.filter(x=>x.cat==='Stay'),stop=b.items.filter(x=>x.cat==='Stop');
  return`<div class="cost-banner"><div class="cost-banner-label">Trip total${b.groupSize>1?` · ${b.groupSize} travellers`:''}</div><div class="cost-banner-amount">${cur}${b.grand.toFixed(0)}${b.perPerson!=null?`<span class="cost-banner-pp"> · ${cur}${b.perPerson.toFixed(0)} per person</span>`:''}</div></div>
    <div class="cost-card cost-groups">
      ${costGroupHTML('⛳','Golf',b.golfTotal,golf,cur)}
      ${costGroupHTML('🏨','Stays',b.stayTotal,stay,cur)}
      ${costGroupHTML('📍','Stops',b.poiTotal,stop,cur)}
      <div class="cost-fuel-row"><label class="cost-fuel-toggle"><input type="checkbox" ${tbIncludeFuel?'checked':''} onchange="tbIncludeFuel=this.checked;renderTripBuilder();"> Fuel (est.)</label><span class="cost-group-amt">${cur}${b.fuelCost.toFixed(0)}</span></div>
    </div>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} green fee${b.golfOf===1?'':'s'} confirmed — the rest are typical rates.${mixed?` Totals are shown in ${cur} but some line items above are priced in a different currency — no conversion is applied yet.`:''}</p>
    <p class="hint" style="margin-top:var(--sp-2)">🔜 Currency conversion (showing every cost in one currency) is planned for a future update — for now, amounts display in each course's own local currency.</p>`;
}

/* ════════════════════════════════════════════════════════════════════
   Build mode's editable itinerary — the day cards from the sketch.
   ════════════════════════════════════════════════════════════════════ */
let tbBuildTab='itin',tbItinFilter='all',tbDriveToggle=true,tbDayShown=null;

/* One day card. Structure follows the sketch exactly: bold day title with
   a right-aligned running total in the header, a thin divider, then the
   stops — each preceded by its own small "Drive X min" caption.

   Everything that used to be a *setting* rather than a *stop* (day kind,
   city, date, manual drive override) lived behind a collapsed "Options"
   dropdown — dropped entirely per stakeholder feedback ("it's confusing").
   Remove-day survives as a single icon in the ⋯ overflow menu next to the
   day title (reusing the same tbRowMenuHTML() pattern every item row
   already uses), since a day that could never be deleted once created
   would be a real dead end, not just decluttering. Day kind/city/date/
   drive-in override have no UI entry point any more — their functions
   (TRIP_DAY_KINDS, tripDaySetKind/SetDate, the manual drive-in field) are
   left intact in the data model and read normally wherever they're already
   set, in case this needs revisiting. */
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
  const menu=tbRowMenuHTML(
    `<button type="button" class="tb-menu-item is-danger" onclick="tripDayRemove(${d.id});renderTripBuilder();tbDrawMap();">🗑 Remove day ${idx+1}</button>`);
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
        <span class="tb-day-sum">${tbMoney(tripDayTotal(idx)||null,tripDayCurrency(tripDays[idx]))}</span>
        ${menu}
      </div>
      <div class="tb-day-rule"></div>
      ${items.length?rowsHTML:`<p class="hint" style="margin:0 var(--sp-3) var(--sp-3) 44px">Drag a course here, or add a stop below.</p>`}
      <div class="tb-dropzone"
        ondragover="event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';tbDropOver(this);"
        ondragleave="tbDropOut(this,event);"
        ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);tbDropInDay(${d.id},null);">↓ Put it last on Day ${idx+1}</div>
      ${tripDaySuggestedTown(d)?`<div class="tb-day-town">Staying near <b>${esc(tripDaySuggestedTown(d))}</b>${tbPoiPoint(d)&&ORS_PROXY_URL?` · <a href="#" class="linkbtn" onclick="event.preventDefault();tbToggleHeritage(${d.id})">${tbHeritageOn.has(d.id)?'hide':'show'} POI's</a>`:''}</div>`:''}
      ${tbHeritageListHTML(d)}
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
      ${tripSeq.length>1?`<details class="tb-drop">
        <summary class="tb-btn" title="Automatically reorder your trip">Auto schedule ▾</summary>
        <div class="tb-drop-body">
          <button type="button" class="tb-menu-item" onclick="tripAutoOrder();renderTripBuilder();tbDrawMap();" title="Reorder your courses by nearest-neighbour to cut driving">Order by nearest-neighbour</button>
        </div>
      </details>`:''}
    </div>
    <div class="tb-total-card"><span class="tb-total-label">Trip total</span><span class="tb-total-amount">${tripPrimaryCurrency()}${total.toFixed(0)}</span></div>`;
}

/* Plan mode's wishlist. */
function tbWishlistHTML(){
  const allUnscheduled=tripUnscheduled();
  const unscheduled=state.nation?allUnscheduled.filter(i=>courseNation(i)===state.nation):allUnscheduled;
  const hidden=allUnscheduled.length-unscheduled.length;
  const hiddenNote=hidden?`<p class="hint" style="margin:0 0 var(--sp-2)">${hidden} more course${hidden===1?'':'s'} on your wishlist from other countries — clear the country filter above to see ${hidden===1?'it':'them'}.</p>`:'';
  if(!unscheduled.length)return hiddenNote||`<p class="hint">Nothing on your wishlist yet — add any course you fancy playing.</p>`;
  const rows=unscheduled.map(i=>{
    const fee=extractFee(V(i,'wd'));
    return`<div class="tb-day-course tb-item-golf" style="cursor:default">
      <span class="tb-item-icon">⛳</span>
      <div class="tb-item-main"><a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        <div class="cart-region">${esc(C[i].r)}</div></div>
      <span class="tb-item-price">${tbMoney(fee,courseCurrency(i))}</span>
      <div class="tb-item-actions"><button class="tb-btn is-icon is-sm is-quiet" title="Remove from wishlist"
        onclick="toggleTrip(${i});renderTripBuilder();tbDrawMap();">✕</button></div>
    </div>`;}).join('');
  return`<div class="tb-day">
      <div class="tb-day-head"><span class="tb-day-title"><span class="tb-day-title-text">Wishlist</span>
        <span class="tb-day-place">${unscheduled.length} course${unscheduled.length===1?'':'s'}</span></span>
        <button class="tb-btn is-primary is-sm" onclick="enterBuildMode()" title="Start scheduling these courses into days">Schedule →</button></div>
      <div class="tb-day-rule"></div>
      ${hiddenNote}
      ${rows}
      ${tripWishlistSummaryHTML(unscheduled)}
    </div>`;
}
/* GOLF-90/93: reuses Explore's old state.nation/NATIONS/courseNation
   (js/explore.js, GOLF-81) rather than inventing a second country concept —
   picking a nation here is the exact same fact Explore's pill used to set,
   before Explore itself was removed. GOLF-93: since this pane is now the
   app's only page (Discover/Itinerary/Costs all live under it), the pills
   moved out of the Discover-only tbPlanHTML() into the shared chrome in
   renderTripBuilder() — rendered once, above the tab row, so the choice
   persists and stays visible switching tabs instead of disappearing the
   moment you leave Discover. It already filters everything nation-scoped
   below it: course search (tbSearchResults, js/trip-add.js), Discover's
   Nearby/By-region results (tbNationFilter, js/trip-route.js) and the
   wishlist's unscheduled list (js/trip-ui.js). The Itinerary/Costs tabs
   are deliberately NOT filtered by it — they show the trip you've already
   built, which can legitimately span more than one nation, and hiding an
   already-added course/day because the pill moved would silently corrupt
   the view of your own trip. The click handler lives in
   renderTripBuilder()'s wiring block, alongside every other delegated
   listener. */
function tbNationPillsHTML(){
  return`<div class="nation-pills" id="tb-nation-pills" role="group" aria-label="Choose a country">
    ${NATIONS.map(([k,l])=>`<button class="nation-pill" aria-pressed="${state.nation===k}" data-nation="${k}">${l}</button>`).join('')}
  </div>`;
}
function tbPlanHTML(){return tbDiscoverTabHTML()+`<div class="tb-section-title" style="margin-top:var(--sp-6)">Your wishlist</div>${tbWishlistHTML()}`;}

/* Discover. GOLF-71: its own "Near a place" search box is gone — the one
   search bar at the top of the pane anchors the lens when you pick a
   place, which is what that box did. The scope segmented control stays.
   GOLF-91: "Near a place" and "Nearby" were two scopes running the exact
   same "nearest 5 courses to a point" query, differing only in whether
   the point came from a searched place or the last course added —
   genuinely redundant, per the stakeholder's own read. Merged into one
   "Nearby" scope (see tbNearbyAnchorPoint() in trip-route.js): searching
   a place or adding a course both feed the same list, whichever happened
   more recently. */
function tbDiscoverTabHTML(){
  const scopes=[['anchor','Nearby'],['region','By region']];
  return`<div class="tb-section-title">Find courses</div>
    <div class="tb-seg" style="margin-bottom:var(--sp-3)">${scopes.map(([k,label])=>
      `<button id="tb-tab-${k}" aria-pressed="${tbDiscoveryTab===k}">${label}</button>`).join('')}</div>
    ${tbDiscoveryTab==='anchor'?(()=>{const pt=tbNearbyAnchorPoint();return`<p class="hint" style="margin:0 0 var(--sp-2)">${pt?`Courses near <b>${esc(pt.label)}</b>.`:'Add a course, or search a town or city in the bar above, to see what\'s nearby.'}</p>`;})()
      :`<div class="tb-day-settings-body" style="padding:0 0 var(--sp-3)">
        <select id="tb-region" aria-label="Region"><option value="">Choose a region…</option>${REGIONS.map(r=>`<option value="${r}"${r===tbRegion?' selected':''}>${r}</option>`).join('')}</select>
        <label style="display:inline-flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-caption);color:var(--stone)"
          title="Also include courses just outside the region, within this many miles of its edge">Border
          <input id="tb-border" type="number" value="${tbBorder}" min="0" max="50" style="width:70px"></label>
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
  const TABS=[['discover','Discover'],['itin','Itinerary'],['cost','Costs']];
  const showItinFilters=isBuild&&tbBuildTab==='itin';
  pane.innerHTML=`
    <div class="tb-navbar">
      <span class="tb-wordmark">${isBuild?'Build your trip':'Plan a trip'}</span>
      <span class="tb-navbar-right"><span class="tb-pill">${isBuild&&tripDays.length?`${tripDays.length} day${tripDays.length===1?'':'s'} · `:''}${tripPrimaryCurrency()}${total.toFixed(0)}</span></span>
    </div>
    ${tbSearchFieldHTML({id:'tb-unified-search',variant:'bar',value:tbSearchQ,
      placeholder:'Search courses, towns and cities…',ariaLabel:'Search courses, towns and cities'})}
    <div class="tb-section" id="tb-search-results" style="border-bottom:none;padding-top:0${tbSearchQ.trim()?'':';display:none'}">${tbSearchQ.trim()?tbUnifiedSearchResultsHTML():''}</div>
    <div class="tb-toolbar">
      ${tbTripMenuHTML()}
      <span class="tb-groupsize" title="How many people is this trip for? Green fees and stop costs scale by this; hotels keep their own per-item sharing setting.">
        <span class="tb-groupsize-label">👥</span>
        <button type="button" class="tb-btn is-icon is-sm is-quiet tb-groupsize-btn" id="tb-groupsize-dec" aria-label="Decrease group size">−</button>
        <span class="tb-groupsize-n">${groupSize}</span>
        <button type="button" class="tb-btn is-icon is-sm is-quiet tb-groupsize-btn" id="tb-groupsize-inc" aria-label="Increase group size">+</button>
      </span>
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
      <button class="tb-btn" id="tb-share-trip" title="Copies a read-only link showing this trip's map, day-by-day plan and costs. It's a frozen snapshot, not live — editing the trip afterward won't change the link.">${SHARE_ICON_SVG} Share trip</button>
    </div>
    ${tbNationPillsHTML()}
    <div class="tb-tabs" role="tablist">${TABS.map(([k,label])=>
      `<button class="tb-tab-btn" role="tab" data-tab="${k}" aria-pressed="${activeTab===k}">${label}</button>`).join('')}</div>
    <div class="tb-tab-content">${
      !isBuild?tbPlanHTML()
      :tbBuildTab==='cost'?tbCostsTabHTML()
      :tbItinFilter==='all'?tripDayScheduleHTML()
      :tbItineraryHTML()
    }</div>`;

  document.getElementById('tb-clear-trip').addEventListener('click',()=>tripClearAll());
  const nationPills=document.getElementById('tb-nation-pills');
  if(nationPills)nationPills.addEventListener('click',e=>{
    const b=e.target.closest('[data-nation]');if(!b)return;
    const k=b.dataset.nation;
    state.nation=state.nation===k?null:k;
    saveState();renderTripBuilder();tbDrawMap();
  });
  const shareBtn=document.getElementById('tb-share-trip');
  if(shareBtn)shareBtn.addEventListener('click',()=>tbShareTrip(shareBtn));
  document.getElementById('tb-groupsize-dec').addEventListener('click',()=>tripSetGroupSize(groupSize-1));
  document.getElementById('tb-groupsize-inc').addEventListener('click',()=>tripSetGroupSize(groupSize+1));
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
    country:()=>tbTripCountryCode(null), // GOLF-92: trip's own nation first, Explore's pill as fallback
    onType(text){
      tbSearchQ=text;
      const q=text.trim();
      searchResultsEl.style.display=q?'':'none';
      tbUnifiedPlaceResults=null;
      tbPlaceAddedNote=null; // the "added as Day N" note belongs to the query that produced it
      searchResultsEl.innerHTML=q?tbUnifiedSearchResultsHTML():'';
    },
    render(list){
      // Keep list's null/undefined/[] distinction intact — tbUnifiedSearchResultsHTML()
      // needs to tell "geocode failed" (undefined) apart from "no matches" ([]).
      tbUnifiedPlaceResults=list;
      if(document.getElementById('tb-unified-search'))searchResultsEl.innerHTML=tbUnifiedSearchResultsHTML();
    },
    onPick(){/* unreachable: `render` owns this field's results panel */}
  });
  searchResultsEl.addEventListener('click',e=>{
    // GOLF-82: one place action now, not two — tbAnchorTripToPlace() is gone.
    const trip=e.target.closest('.tb-unified-place-trip');
    if(!trip)return;
    e.preventDefault();
    tbAddPlaceToTrip(parseFloat(trip.dataset.lat),parseFloat(trip.dataset.lng),trip.dataset.label);
  });

  /* ── Call site 2: the open "add a stop" form's location field. ── */
  if(tbAddStop&&document.getElementById('tb-addstop-name')){
    tbAttachSearch('tb-addstop-name',{
      country:()=>tbTripCountryCode(tbAddStop&&tbAddStop.dayId), // GOLF-92: ringfence to this trip's nation
      onType(text){tbAddStop.name=text;tbAddStop.lat=null;tbAddStop.lng=null;},
      onPick(r){
        const priceEl=document.getElementById('tb-addstop-price');
        tbAddStop.price=priceEl?priceEl.value:'';
        tbAddStop.name=r.label;tbAddStop.lat=r.lat;tbAddStop.lng=r.lng;
        renderTripBuilder();
      }
    });
  }
  /* Call site 3 (each day card's own city field) was retired along with
     the rest of the day card's "Options" dropdown — see tbDayCardHTML()'s
     comment. tbFocusDayPlace is left in the transient-state reset lists
     untouched (harmless — it just never gets set to anything meaningful
     any more) rather than threading its removal through every reset site. */
  if(appMode==='plan'){
    ['anchor','region'].forEach(k=>{ // GOLF-91: 'place' scope merged into 'anchor' ("Nearby")
      const b=document.getElementById('tb-tab-'+k);
      if(b)b.addEventListener('click',()=>{tbDiscoveryTab=k;renderTripBuilder();tbDrawMap();});
    });
    if(tbDiscoveryTab==='region'){
      const run=()=>{
        tbRegion=document.getElementById('tb-region').value;
        tbBorder=parseFloat(document.getElementById('tb-border').value)||0;
        document.getElementById('tb-results').innerHTML=tbResultsHTML(tbDiscover());tbDrawMap();
      };
      document.getElementById('tb-region').addEventListener('change',run);
      document.getElementById('tb-border').addEventListener('change',run);
    }
  }
}
