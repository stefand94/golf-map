/* ============================================================
   js/trip-geo.js — distance and discovery queries (nearby, by region,
   near a searched place), the trip map layer, and the green-fee /
   accommodation / fuel cost model.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* GOLF-24: standalone Trip Planning mode — supersedes GOLF-14's inline
   "Same-day pairing" popup blurb, which only ever worked for London
   courses on a shared rail line (silently did nothing for all 100 Top 100
   entries — exactly where this is most wanted, e.g. Cornwall, the
   Liverpool coast). "Bookable" = pay&play/open access, not members-only
   or application-only, matching GOLF-14's original definition. Distance
   is straight-line (haversine, miles) — same approximation already used
   for GOLF-10's nearest-station lookups, not real routing. Browse-only:
   nothing here is persisted. */
function haversineMiles(lat1,lng1,lat2,lng2){
  const R=3958.8,toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
/* "Bookable" = a visitor can actually book a round, even if only on
   certain days ("limited"). Only "application" (invitation-only, no
   public booking at all) is excluded. Verified this matters: every
   championship links course near Formby on the Liverpool coast — Royal
   Birkdale, Royal Liverpool, Hillside, West Lancs... — is tier "limited",
   so an public/open-only definition returned zero results for exactly
   the coastal-cluster case this feature exists for. */
function bookable(i){return['public','open','limited'].includes(V(i,'a'))}
/* GOLF-27: region mode has no real geometry to hand (REGIONS is a flat
   label list), so "just over the border" is derived from actual course
   geography instead of a hand-maintained adjacency table — any bookable
   course outside the chosen region whose straight-line distance to its
   single nearest course *inside* the region is within borderMiles is
   included, flagged {border:true} so the UI can explain why it's there. */
function tripByRegion(region,borderMiles){
  const inRegion=C.map((c,i)=>i).filter(i=>C[i].r===region&&bookable(i));
  const core=inRegion.map(i=>({i,border:false}));
  if(!borderMiles)return core.sort((a,b)=>V(a.i,'n').localeCompare(V(b.i,'n')));
  const outRegion=C.map((c,i)=>i).filter(i=>C[i].r!==region&&bookable(i));
  const border=outRegion.filter(i=>{
    let min=Infinity;
    inRegion.forEach(j=>{const d=haversineMiles(C[i].lat,C[i].lng,C[j].lat,C[j].lng);if(d<min)min=d});
    return min<=borderMiles;
  }).map(i=>({i,border:true}));
  return [...core,...border].sort((a,b)=>V(a.i,'n').localeCompare(V(b.i,'n')));
}
/* GOLF: a radius cutoff ("within 30 miles") left visitors guessing why
   the list was empty or overflowing depending on how remote the anchor
   was — a flat "nearest N" (straight-line) is a simpler, always-populated
   promise: sort every other bookable course by distance and take the
   closest `limit`. */
function tripByAnchor(anchor,limit){
  return C.map((c,i)=>i).filter(i=>i!==anchor&&bookable(i))
    .sort((a,b)=>haversineMiles(C[anchor].lat,C[anchor].lng,C[a].lat,C[a].lng)-haversineMiles(C[anchor].lat,C[anchor].lng,C[b].lat,C[b].lng))
    .slice(0,limit)
    .map(i=>({i,border:false}));
}
/* GOLF-58: same "nearest N" promise as tripByAnchor(), but anchored to a
   raw searched point instead of an existing course — powers "search a
   city, see what's around it" when starting a trip from scratch. */
function nearestCoursesToPoint(lat,lng,limit){
  return C.map((c,i)=>i).filter(bookable)
    .sort((a,b)=>haversineMiles(lat,lng,C[a].lat,C[a].lng)-haversineMiles(lat,lng,C[b].lat,C[b].lng))
    .slice(0,limit)
    .map(i=>({i,border:false}));
}
const tripLayer=L.layerGroup().addTo(map);
function tripClear(){tripLayer.clearLayers()}
/* Bug fix (2026-09-01): these discovery-candidate/anchor dots used to be
   plain L.circleMarker()s with no popup or click handler at all — visually
   a "white circle with a yellow border" (exactly what the stakeholder
   reported) that never expanded into anything when clicked. Give every
   course dot the same click→popup behaviour as the main flag markers
   (bindPopup(popupHTML(i)) + highlight/drawLink on click) so a dot drawn
   here is just as inspectable as one drawn on the normal Explore map. */
function tripShow(items,anchor,clear=true,fit=true){
  if(clear)tripClear();
  const pts=[];
  items.forEach(({i,border})=>{
    L.circleMarker([C[i].lat,C[i].lng],{radius:9,color:border?'#8C8478':'#E6B400',weight:2.5,fillColor:'#fff',fillOpacity:.9,dashArray:border?'2 3':null})
      .bindPopup(popupHTML(i),{maxWidth:340})
      .bindTooltip(courseTooltipHTML(i),{direction:'top',offset:[0,-10],className:'course-tt'})
      .on('click',()=>{highlight(i);drawLink(i)})
      .addTo(tripLayer);
    pts.push([C[i].lat,C[i].lng]);
  });
  if(anchor!=null){
    L.circleMarker([C[anchor].lat,C[anchor].lng],{radius:11,color:'#1B2733',weight:3,fillColor:'#E6B400',fillOpacity:1})
      .bindPopup(popupHTML(anchor),{maxWidth:340})
      .bindTooltip(courseTooltipHTML(anchor),{direction:'top',offset:[0,-12],className:'course-tt'})
      .on('click',()=>{highlight(anchor);drawLink(anchor)})
      .addTo(tripLayer);
    pts.push([C[anchor].lat,C[anchor].lng]);
  }
  if(fit&&pts.length)map.fitBounds(L.latLngBounds(pts),{padding:[32,32]});
  return pts;
}

/* GOLF-28: Trip Builder — best-effort numeric extractor over a course's
   free-text fee field. Many fees are "Members only"/"Ask club"/ranges —
   this deliberately returns null rather than guessing when nothing
   numeric is found, so the caller can report an honest coverage count
   instead of a misleadingly precise total. */
function extractFee(s){
  if(!s)return null;
  const nums=[...String(s).matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map(m=>parseFloat(m[1].replace(/,/g,'')));
  if(!nums.length)return null;
  return nums.length>1?(nums[0]+nums[1])/2:nums[0];
}
function tripCostEstimate(indices){
  let total=0,covered=0;
  indices.forEach(i=>{const fee=extractFee(V(i,'wd'));if(fee!=null){total+=fee;covered++}});
  return{total,covered,of:indices.length};
}
/* Currency correctness: a trip can mix nations (a UK/NI course priced in £,
   a Republic of Ireland course in €, a South African course in R), so a
   single flat total is potentially meaningless. tripDayCurrency() picks the
   currency of the majority of a day's golf items (falling back to the trip's
   overall primary currency for a day with no golf yet — e.g. a hotel-only
   day); tripPrimaryCurrency() is the single most common currency across
   every course in the trip, used as the default for the nav pill and for
   costs (fuel) that have no inherent currency of their own. */
function tripPrimaryCurrency(){
  const counts={};
  tripSeq.forEach(i=>{const c=courseCurrency(i);counts[c]=(counts[c]||0)+1;});
  let best='£',bestN=0;
  Object.keys(counts).forEach(c=>{if(counts[c]>bestN){best=c;bestN=counts[c];}});
  return best;
}
function tripDayCurrency(d){
  const cs=d?tripDayCourses(d):[];
  if(!cs.length)return tripPrimaryCurrency();
  const counts={};
  cs.forEach(i=>{const c=courseCurrency(i);counts[c]=(counts[c]||0)+1;});
  let best='£',bestN=0;
  Object.keys(counts).forEach(c=>{if(counts[c]>bestN){best=c;bestN=counts[c];}});
  return best;
}
/* A running total bucketed by currency — {[£|€|R]:amount} — plus a few
   small helpers to add to it and to render it as "£320 · €150". */
function moneyBucketAdd(buckets,cur,amt){
  if(amt==null)return;
  buckets[cur]=(buckets[cur]||0)+amt;
}
function moneyBucketFmt(buckets){
  const keys=Object.keys(buckets).filter(c=>buckets[c]);
  if(!keys.length)return'—';
  return keys.map(c=>`${c}${buckets[c].toFixed(0)}`).join(' · ');
}
/* GOLF-48: which fee field (wd/we) a scheduled day should be costed at —
   Saturday/Sunday if the day has a real calendar date attached, wd
   otherwise. A day with no date (the default — GOLF-33 deliberately
   ships day-numbers-only, no calendar anchoring) keeps exactly the old
   wd-only behavior, so this never regresses anyone who hasn't opted into
   dating their days. */
function feeFieldForDate(dateStr){
  if(!dateStr)return'wd';
  const d=new Date(dateStr+'T00:00:00');
  if(isNaN(d.getTime()))return'wd';
  const dow=d.getDay(); // 0=Sun .. 6=Sat
  return(dow===0||dow===6)?'we':'wd';
}
/* GOLF-48: weekend-aware replacement for tripCostEstimate(tripSeq) in the
   cost summary below — a course scheduled on a dated day is costed at
   that day's correct wd/we rate; a course with no day-date (including
   every Unscheduled course, which has no day context at all) falls back
   to the plain wd-only behavior tripCostEstimate() already had. */
function tripCostEstimateByDay(){
  const buckets={};let covered=0,of=0;
  const gs=groupSizeFor(); // GOLF-87: each traveller pays their own green fee
  tripDays.forEach(d=>{
    const field=feeFieldForDate(d.date);
    tripDayCourses(d).forEach(i=>{
      of++;
      const fee=extractFee(V(i,field));
      if(fee!=null){moneyBucketAdd(buckets,courseCurrency(i),fee*gs);covered++;}
    });
  });
  tripUnscheduled().forEach(i=>{
    of++;
    const fee=extractFee(V(i,'wd'));
    if(fee!=null){moneyBucketAdd(buckets,courseCurrency(i),fee*gs);covered++;}
  });
  const total=buckets[tripPrimaryCurrency()]||0;
  return{total,buckets,covered,of};
}
/* GOLF-44: typical UK hotel nightly-rate estimate by region — NOT live
   pricing, a ballpark grounded via web search (London ~£120-180,
   Scotland ~£90-150, Wales ~£60-100, rest of UK ~£80-120 as of Aug 2026)
   and tiered across this app's existing REGIONS list. Refreshed the same
   on-demand way every other one-off dataset in this app is, not live. */
const ACCOM_RATE_BY_REGION={
  "N & NW London":110,"W London":110,"SW London":110,"S London & Surrey":110,
  "SE London & Kent":105,"NE London & Essex":105,"Herts":100,"Bucks & Berks":100,
  "South Coast & Sussex":95,"East Anglia":90,"South West England":100,
  "Midlands":85,"North of England":85,
  "Fife & East Lothian":100,"Angus & Aberdeenshire":90,"Ayrshire & Argyll":90,
  "Highlands & Islands":90,"Perthshire & Central Scotland":90,
  "South Wales Coast":75,"North Wales Coast":75,"West Wales":75,"Mid Wales":70,
  "North Wales":75,"South Wales Borders":75
};
const ACCOM_RATE_DEFAULT=95;
function accomRateFor(region){return ACCOM_RATE_BY_REGION[region]??ACCOM_RATE_DEFAULT;}
/* GOLF-63: the "no explicit nightly price entered — fall back to a typical
   regional rate, taken from this day's last round" formula was copy-pasted
   independently into three separate places (tripDayLegs, tripCostLineItems,
   tbItinHotelRailHTML) and was about to be pasted a fourth time. It lives
   here once now, and every hotel price in the app reads through
   tripItemPrice() below. */
function tripDayAccomFallback(d){
  const cs=tripDayCourses(d);
  return cs.length?accomRateFor(C[cs[cs.length-1]].r):null;
}
/* The one place any item's £ figure is derived: a round is priced at this
   day's correct weekday/weekend fee field, a hotel at its entered price or
   the regional fallback, a POI at its entered price.
   GOLF-63 bugfix: tbItinPoiListHTML() used to drop `price` on POI rows
   entirely (unlike every other reader of the same field), so a priced POI
   showed as free there while counting in the cost table. Routing all four
   readers through this helper is what fixes it. */
/* GOLF-74: hotels are commonly quoted "per person sharing" — the figure on
   the booking page is per head, and a room for two costs double it. The item
   now carries priceType:'room'|'person' (default 'room' = exactly the
   pre-GOLF-74 meaning: the entered figure IS the room total) plus guests
   (default 2, only meaningful when priceType is 'person'). Because the
   default is 'room', no existing saved trip's total moves by a penny.
   The regional fallback (tripDayAccomFallback) is a ROOM rate by
   construction, so it is never multiplied — only an explicitly entered
   per-person price is. */
const HOTEL_GUESTS_DEFAULT=2;
function tripHotelGuests(it){
  const g=it&&it.guests;
  return(typeof g==='number'&&isFinite(g)&&g>0)?Math.round(g):HOTEL_GUESTS_DEFAULT;
}
function tripHotelPerPerson(it){return!!(it&&it.type==='hotel'&&it.priceType==='person'&&it.price!=null);}
/* {base,guests,sharing,total} for any item — the one place the per-person
   multiplication happens, so the itinerary row, the cost table and the
   trip total can never disagree about it. */
// GOLF-87: a trip's group size — each traveller plays their own round and
// pays their own green fee/POI cost, so those totals scale by it. Hotel
// stays out of this deliberately (see comment above tripHotelGuests) —
// re-multiplying it here would double-count a room already marked
// "per person sharing". groupSizeFor() degrades to 1 (today's pre-GOLF-87
// behaviour) if the live global is somehow missing/invalid.
function groupSizeFor(){return(typeof groupSize==='number'&&groupSize>0)?groupSize:1;}
function tripItemPriceDetail(d,it){
  if(!it)return{base:null,guests:1,sharing:false,total:null,cur:'£'};
  const gs=groupSizeFor();
  if(it.type==='golf'){
    // GOLF-87: `sharing` here deliberately stays false regardless of group
    // size — it's a GOLF-74 hotel-only display flag consumed by
    // tripCostLineItems() to build a "(£X × N sharing)" label off `base`,
    // and a golf/POI item's `base` is a single round's fee, not a
    // per-person entered figure — setting sharing:true here made that
    // label logic misfire (and throw on an unpriced course, base===null).
    // The "× groupSize" tag these items get instead is computed
    // independently in tripCostLineItems() from gs itself.
    const p=extractFee(V(it.i,feeFieldForDate(d&&d.date)));
    return{base:p,guests:gs,sharing:false,total:p==null?null:p*gs,cur:courseCurrency(it.i)};
  }
  const cur=tripDayCurrency(d);
  if(it.type==='hotel'){
    const entered=it.price??null;
    if(tripHotelPerPerson(it)){
      const g=tripHotelGuests(it);
      return{base:entered,guests:g,sharing:true,total:entered*g,cur};
    }
    const p=entered??tripDayAccomFallback(d);
    return{base:p,guests:1,sharing:false,total:p,cur};
  }
  // GOLF-87: same reasoning as the golf branch above — sharing stays false
  // for a POI, the × groupSize tag is computed separately in the consumer.
  const p=it.price??null;
  return{base:p,guests:gs,sharing:false,total:p==null?null:p*gs,cur};
}
function tripItemPrice(d,it){return tripItemPriceDetail(d,it).total;}
/* GOLF-44: fuel-cost estimate — same straight-line leg distances as the
   GOLF-43 drive-time default, x an assumed £/mile (roughly what a
   40mpg petrol car costs to run in Aug 2026 fuel prices). Both this and
   the accommodation estimate are separately toggleable in the UI so a
   visitor who thinks either number looks wrong can drop it from the
   total without losing the other. */
const FUEL_COST_PER_MILE=0.18;
let tbIncludeAccom=true,tbIncludeFuel=true;
function tripCostSummary(){
  const fees=tripCostEstimateByDay();
  const fuelMiles=tripTotalDriveMiles();
  const fuelCost=fuelMiles*FUEL_COST_PER_MILE;
  const primaryCur=tripPrimaryCurrency();
  const scheduledDays=tripDays.filter(d=>tripDayCourses(d).length);
  /* One night's stay per scheduled day except the last — no accommodation
     needed the night after the final round. Bucketed by each day's own
     currency, since a multi-nation trip's nightly rates aren't all the
     same money. */
  const accomBuckets={};
  scheduledDays.forEach((d,idx)=>{
    if(idx===scheduledDays.length-1)return;
    const rate=tripDayAccomFallback(d)??ACCOM_RATE_DEFAULT;
    moneyBucketAdd(accomBuckets,tripDayCurrency(d),rate);
  });
  const accomCost=accomBuckets[primaryCur]||0;
  const nights=Math.max(0,scheduledDays.length-1);
  const grandBuckets={};
  if(fees.covered)Object.keys(fees.buckets).forEach(c=>moneyBucketAdd(grandBuckets,c,fees.buckets[c]));
  if(tbIncludeAccom)Object.keys(accomBuckets).forEach(c=>moneyBucketAdd(grandBuckets,c,accomBuckets[c]));
  if(tbIncludeFuel)moneyBucketAdd(grandBuckets,primaryCur,fuelCost);
  const grand=grandBuckets[primaryCur]||0;
  // GOLF-87: fuel is a shared trip cost (one car, regardless of group size)
  // — the total above stays as-is; only the per-person split divides it.
  // Green fees are already a whole-group total (each traveller's own fee,
  // summed in tripCostEstimateByDay()) and accommodation is untouched by
  // groupSize (GOLF-74's own per-item sharing model), so per-person here is
  // simply the grand total shared across the party.
  const gs=groupSizeFor();
  const perPerson=gs>1?grand/gs:null;
  return{fees,accomCost,accomBuckets,nights,fuelMiles,fuelCost,grand,grandBuckets,primaryCur,groupSize:gs,perPerson};
}
function tripCostSummaryHTML(){
  const s=tripCostSummary();
  const cur=s.primaryCur;
  const mixed=Object.keys(s.fees.buckets).length>1;
  return`<div class="cart-cost-lines">
      <div class="cart-cost-line"><span>Green fees${s.groupSize>1?` <span class="wt">× ${s.groupSize}</span>`:''}</span><span>${s.fees.covered?moneyBucketFmt(s.fees.buckets):'—'}</span></div>
      <div class="cart-cost-cov">${s.fees.covered} of ${s.fees.of} course${s.fees.of===1?'':'s'} have a parseable weekday fee${mixed?' · multiple currencies':''}</div>
      <label class="cart-cost-line"><span><input type="checkbox" ${tbIncludeAccom?'checked':''} onchange="tbIncludeAccom=this.checked;renderTripBuilder();"> Accommodation${s.nights?` (${s.nights} night${s.nights===1?'':'s'}, typical rate)`:''} <span class="wt">as entered</span></span><span>${s.nights?moneyBucketFmt(s.accomBuckets):'—'}</span></label>
      <label class="cart-cost-line"><span><input type="checkbox" ${tbIncludeFuel?'checked':''} onchange="tbIncludeFuel=this.checked;renderTripBuilder();"> Fuel${s.fuelMiles?` (est. ${s.fuelMiles.toFixed(0)} mi)`:''} <span class="wt">shared</span></span><span>${s.fuelMiles?`${cur}${s.fuelCost.toFixed(0)}`:'—'}</span></label>
    </div>
    <p class="hint" style="margin:6px 0 0">Accommodation and fuel are typical-rate/straight-line estimates, not live prices or a real route — untick either to leave it out of the total below.${mixed?' Green fees are shown in each course’s own currency; no conversion is applied yet — see the note below.':''}</p>
    <div class="cart-total">
      <div><div class="cart-total-label">Estimated trip total</div><div class="cart-total-coverage">${s.fees.covered} of ${s.fees.of} course fee${s.fees.of===1?'':'s'} counted${s.groupSize>1?` · ${s.groupSize} travellers`:''}</div></div>
      <div class="cart-total-amount">${moneyBucketFmt(s.grandBuckets)}${s.perPerson!=null?`<div class="cart-total-pp">${cur}${s.perPerson.toFixed(0)} per person</div>`:''}</div>
    </div>`;
}
