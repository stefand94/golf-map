/* ============================================================
   js/trip-route.js — route ordering and drawing: nearest-neighbour
   ordering, day colours, the day-coloured drawn route, the discovery
   result list, the trip-wide stop chain, per-leg estimates and all
   trip map drawing.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* Greedy nearest-neighbour walk, starting from the first-added course —
   "as the crow flies, not a real route," same disclaimer convention as
   nearStation elsewhere in the app. */
function tripOrder(indices){
  if(!indices.length)return[];
  const remaining=[...indices];
  const order=[remaining.shift()];
  while(remaining.length){
    const last=order[order.length-1];
    let bestIdx=0,bestDist=Infinity;
    remaining.forEach((i,idx)=>{
      const d=haversineMiles(C[last].lat,C[last].lng,C[i].lat,C[i].lng);
      if(d<bestDist){bestDist=d;bestIdx=idx}
    });
    order.push(remaining.splice(bestIdx,1)[0]);
  }
  return order;
}
/* GOLF-62: "see the driving times and costs" before any day exists —
   reuses the existing nearest-neighbour ordering (tripOrder, already used
   for "Auto-order") plus a plain fee sum over the unscheduled pool, plus a
   straight-line/routing-inefficiency drive-time sum across that suggested
   order (same DRIVE_INEFFICIENCY/DRIVE_AVG_MPH heuristic tripDayAutoEstimate
   already uses for day-to-day legs). Browse-only — doesn't touch tripSeq or
   persist anything, purely a preview of "if you played these in roughly
   this order." */
function tripWishlistSummaryHTML(unscheduled){
  if(unscheduled.length<1)return'';
  const order=tripOrder(unscheduled);
  // GOLF-87: each traveller pays their own green fee, so the wishlist's
  // rough total scales by the trip's group size — same rule as every
  // other fee figure in the app (tripItemPriceDetail/groupSizeFor).
  const gs=groupSizeFor();
  const feeBuckets={};let covered=0;
  order.forEach(i=>{const f=extractFee(V(i,'wd'));if(f!=null){moneyBucketAdd(feeBuckets,courseCurrency(i),f*gs);covered++;}});
  let miles=0,mins=0;
  for(let k=1;k<order.length;k++){
    const a=order[k-1],b=order[k];
    const m=haversineMiles(C[a].lat,C[a].lng,C[b].lat,C[b].lng)*DRIVE_INEFFICIENCY;
    miles+=m;mins+=(m/DRIVE_AVG_MPH*60);
  }
  const orderLabel=order.map(i=>V(i,'n')).join(' → ');
  return`<p class="hint" style="margin:4px 10px 8px">Suggested order (nearest-neighbour): <b>${esc(orderLabel)}</b><br>
    ${covered?`${moneyBucketFmt(feeBuckets)} in green fees (${covered} of ${order.length} priced)${gs>1?` for ${gs} travellers`:''}`:'no parseable green fees yet'}${order.length>1?` · ~${miles.toFixed(0)} mi / ${fmtDriveMinutes(Math.round(mins/5)*5)} driving between them straight-line`:''}</p>`;
}
/* GOLF-33: small fixed palette so each day's stops read as visually
   distinct on the map — cycles if there are more days than colors rather
   than erroring. Unscheduled stops (stop.day null) keep the original
   gold fill, matching pre-GOLF-33 behavior exactly. */
const TRIP_DAY_COLORS=['#E6B400','#4C8C6B','#B25A9E','#3E7CB1','#C1553D','#7A6BC9'];
/* GOLF-56: `order` is now an array of stop objects — {type:'course',i,
   lat,lng,name,day} or {type:'place',lat,lng,name,day} — rather than a
   flat list of course indices, so a searched start/free/end-day place
   can sit in the route alongside courses. Every reader of a leg
   (orsLegRoute, orsLegKey) already only needs {lat,lng}, so a place stop
   slots in with zero special-casing there; the only thing that differs
   per type is how each stop is drawn. */
function tripShowOrdered(order,clear=true,fit=true){
  if(clear)tripClear();
  const pts=[];
  order.forEach((stop,idx)=>{
    const day=stop.day;
    const fill=day!=null?TRIP_DAY_COLORS[(day-1)%TRIP_DAY_COLORS.length]:'#E6B400';
    const label=day!=null?`D${day}·${idx+1}`:String(idx+1);
    if(stop.type!=='course'){
      /* Bug fix (2026-09-02): this used to only check stop.type==='place'
         (a day-level city field) — but a mid-route stop added via the
         "add hotel/POI" flow has type:'hotel'/'poi', which fell into the
         popupHTML(stop.i) branch below with stop.i undefined (only a
         course stop carries .i), throwing and silently aborting the whole
         route draw — the exact repro behind the "adding a stop along the
         way breaks routing" report. Any non-course stop (place/hotel/poi)
         gets the same hollow ring; only a real course stop gets the full
         popup/click behaviour, since only it has a course index to bind. */
      L.circleMarker([stop.lat,stop.lng],{radius:8,color:fill,weight:3,fillColor:'#fff',fillOpacity:1})
        .bindTooltip(label,{permanent:true,direction:'center',className:'trip-num'}).addTo(tripLayer);
    }else{
      /* Bug fix (2026-09-01): a numbered cart/route stop used to be a plain
         circleMarker with only a permanent number label — clicking it did
         nothing, same "doesn't expand" complaint as tripShow()'s discovery
         dots above. Bind the real course popup/tooltip and the same
         highlight/drawLink click behaviour as the main flag markers. */
      L.marker([stop.lat,stop.lng],{icon:tripGolfMarkerIcon(fill,label)})
        .bindPopup(popupHTML(stop.i),{maxWidth:340})
        .on('click',()=>{highlight(stop.i);drawLink(stop.i)})
        .addTo(tripLayer);
    }
    pts.push([stop.lat,stop.lng]);
    /* GOLF-35: nearest-station markers make sense in the normal popup view,
       but inside Trip Builder they zig-zag station->CourseA->station->CourseB
       across the actual trip route — suppress them entirely while the pane
       is open; the trip route itself is the only line drawn there. Only
       ever applies to course stops — a searched place has no station. */
    if(stop.type==='course'&&!tripBuilderOn){
      const i=stop.i;
      const stnObj=STN[V(i,'stn')],near=C[i].nearStation,s=stnObj||near;
      if(s){
        const isNR=stnObj?[...STN_LINES[stnObj.n]].some(k=>!TFL_LINES.has(k)):true;
        if(isNR)nrStationMarker(s.lat,s.lng,18).addTo(tripLayer);
      }
    }
  });
  /* GOLF-50/GOLF-51/GOLF-56: each leg is drawn as its own segment, coloured
     by the day it arrives into (falling back to the departing day for a
     leg that ends on an unscheduled/non-golf stop) — "each chunk
     individually" rather than one continuous line, matching the
     day-coloured stop markers above. A leg with cached real route
     geometry draws as a solid road-following line; one still on the
     straight-line heuristic (proxy unset, or genuinely not fetched yet)
     draws thin and dashed, the same "auto vs real" visual convention
     used for drive times. orsLegRoute() only ever reads {lat,lng} off
     each stop, so this works identically for course->course,
     course->place, and place->place legs. */
  for(let idx=1;idx<order.length;idx++){
    const a=order[idx-1],b=order[idx];
    const segDay=b.day??a.day;
    const segColor=segDay!=null?TRIP_DAY_COLORS[(segDay-1)%TRIP_DAY_COLORS.length]:'#1B2733';
    const route=orsLegRoute(a,b);
    const latlngs=(route&&route.length)?route:[[a.lat,a.lng],[b.lat,b.lng]];
    L.polyline(latlngs,route&&route.length
      ?{color:segColor,weight:4,opacity:.8,lineCap:'round'}
      :{color:segColor,weight:2,opacity:.85,dashArray:'2 5',lineCap:'round'}).addTo(tripLayer);
  }
  if(fit&&pts.length)map.fitBounds(L.latLngBounds(pts),{padding:[32,32]});
  return pts;
}
/* GOLF-33 note: the flat cart list (tripListHTML(), with its ▲/▼ tbMove()
   reordering) that used to render inside the pane here has been replaced
   by tripDayScheduleHTML() below, which arranges the same tripSeq cart
   into named days instead of one flat ordered list. tbMove() itself is
   kept — order-within-tripSeq is still what drives the flat fallback
   route (tripDayOrder() when no days exist yet) and the JSON export. */
/* GOLF-94: "restore auto-order as 1-day-per-course, assigned in
   nearest-neighbour order" turned out to mean two different things,
   confirmed separately with the stakeholder:
     - moving into the Itinerary tab should lightly, non-destructively pick
       up whatever's sitting in the wishlist (see tripAutoScheduleUnscheduled
       below);
     - this manual button is the deliberate, opt-in destructive action —
       "full reset — rebuild every day from scratch" (the stakeholder's own
       words, explicitly NOT the lighter "only handle new courses" option).
   Every EXISTING golf day is discarded and rebuilt as a fresh one-course
   day, in nearest-neighbour order over every course in the trip (scheduled
   and unscheduled alike) — free/start/end days are never touched and keep
   their original position, per the stakeholder's separately-confirmed "keep
   it in place, only touch golf days." Implementation: walk the ORIGINAL day
   list once, replacing each 'golf'-kind day in place with the next
   freshly-built one-course day off the nn-ordered queue (so a free day
   sandwiched between two golf days stays sandwiched between two golf days,
   just re-populated); any courses left over once every old golf slot is
   used are appended as new days at the end (covers a trip that had fewer
   golf days than courses, or none at all yet). */
function tripAutoOrder(){
  const ordered=tripOrder([...TRIP]);
  const freshGolfDay=i=>({id:tripDayNextId++,items:[{id:tripItemNewId(),type:'golf',i}],driveIn:null,date:null,kind:'golf',place:null,placeLat:null,placeLng:null});
  let qi=0;
  const rebuilt=tripDays.map(d=>d.kind==='golf'?(qi<ordered.length?freshGolfDay(ordered[qi++]):null):d).filter(Boolean);
  while(qi<ordered.length)rebuilt.push(freshGolfDay(ordered[qi++]));
  tripDays=rebuilt;
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(false);}
}
/* GOLF-94: the lightweight, automatic half of the same request — fires once
   on every transition INTO Build mode (see setAppMode(), js/app-mode.js).
   Takes only whatever's currently in the wishlist (tripUnscheduled() —
   courses added but not yet on any day) and gives each its own new day,
   appended after every existing day, in nearest-neighbour order. Existing
   days — golf, free, start, end, however already arranged/reordered by the
   visitor — are never touched, never reordered, never rebuilt: this is
   strictly additive, unlike the manual "Auto schedule" button above, which
   is the deliberate destructive full-reset action. A no-op when the
   wishlist is empty (e.g. re-entering Build with nothing new to schedule). */
function tripAutoScheduleUnscheduled(){
  const unscheduled=tripUnscheduled();
  if(!unscheduled.length)return;
  tripOrder(unscheduled).forEach(i=>{
    tripDays.push({id:tripDayNextId++,items:[{id:tripItemNewId(),type:'golf',i}],driveIn:null,date:null,kind:'golf',place:null,placeLat:null,placeLng:null});
  });
  saveState();
}
/* GOLF-95: prompt-based reorder suggestion, superseding the earlier
   silent-automatic/manual-full-reset-only design. Stakeholder's own
   example: 4 courses auto-scheduled into 4 days (tripAutoScheduleUnscheduled
   above), then a stopover inserted between day 2 and 3 that may or may not
   be the efficient spot — the app should ask before reordering, and a
   decline must stick (not re-nag) until the day arrangement actually
   changes again. */
/* A day's own routable anchor — its first located stop, or null when it
   has none (a placeless free/rest day). Generalizes tripOrder()'s
   course-index-only nearest-neighbour walk to work per-day, since a day's
   anchor may be a place, a course, or a hotel/POI. */
function tripDayAnchorPoint(dayIdx){
  const s=tripDayFirstStop(dayIdx);
  return s?{lat:s.lat,lng:s.lng}:null;
}
/* Indices of days that have a routable anchor — placeless days are
   excluded entirely from reorder consideration (nothing to route them by,
   and moving one would violate "keep a free day in place" unless it's
   already keyed to a real location). */
function tripLocatableDayIndices(){
  return tripDays.map((d,i)=>i).filter(i=>tripDayAnchorPoint(i)!=null);
}
/* Nearest-neighbour permutation of a set of day indices, by their anchor
   points, fixed starting point = the first of them in current order (so
   the trip's start never moves). Sibling of tripOrder(), keyed on day
   index instead of course index. */
function tripNearestNeighbourDayOrder(dayIdxs){
  if(!dayIdxs.length)return[];
  const remaining=[...dayIdxs];
  const order=[remaining.shift()];
  while(remaining.length){
    const lastPt=tripDayAnchorPoint(order[order.length-1]);
    let bestIdx=0,bestDist=Infinity;
    remaining.forEach((di,idx)=>{
      const pt=tripDayAnchorPoint(di);
      const d=haversineMiles(lastPt.lat,lastPt.lng,pt.lat,pt.lng);
      if(d<bestDist){bestDist=d;bestIdx=idx}
    });
    order.push(remaining.splice(bestIdx,1)[0]);
  }
  return order;
}
/* Returns {origIdxs,suggestedIdxs,sig} when the current day order differs
   from the nearest-neighbour order over locatable days, or null when
   there's nothing to suggest (fewer than 2 locatable days, or the current
   order already matches). `sig` is the current day-id sequence — used so a
   decline sticks until the arrangement actually changes again, rather than
   re-prompting on every render. */
function tripSuggestedDayReorder(){
  const locIdxs=tripLocatableDayIndices();
  if(locIdxs.length<2)return null;
  const suggested=tripNearestNeighbourDayOrder(locIdxs);
  const sig=tripDays.map(d=>d.id).join(',');
  if(suggested.join(',')===locIdxs.join(','))return null;
  return{origIdxs:locIdxs,suggestedIdxs:suggested,sig};
}
/* Applies a suggested reorder: walks the ORIGINAL tripDays array once,
   replacing only locatable slots with the next day off the nn-ordered
   queue (mirrors tripAutoOrder()'s "walk original, replace matching slots"
   pattern) — non-locatable/placeless days are left completely untouched,
   in their original position. Clears driveIn only on days whose
   predecessor changed (mirrors tbDayMoveTo()'s before/after-snapshot
   pattern) — dates are never touched, same reasoning as GOLF-65. */
function tripApplySuggestedDayReorder(){
  const sug=tripSuggestedDayReorder();
  if(!sug)return false;
  const before=tbDayPredecessors();
  const queue=sug.suggestedIdxs.map(i=>tripDays[i]);
  const locSet=new Set(sug.origIdxs);
  let qi=0;
  tripDays=tripDays.map((d,i)=>locSet.has(i)?queue[qi++]:d);
  const after=tbDayPredecessors();
  tripDays.forEach(d=>{if(before.get(d.id)!==after.get(d.id))d.driveIn=null;});
  tbReorderDismissedSig=null;
  saveState();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
  return true;
}
/* Transient (not persisted) — a decline sticks only until the day
   arrangement changes again. Reset alongside every other pane-session
   transient at every trip-lifecycle boundary (GOLF-60b convention). */
function tbDismissSuggestedDayReorder(sig){
  tbReorderDismissedSig=sig;
  if(tripBuilderOn)renderTripBuilder();
}
/* GOLF-31: Trip Builder pane — retires the modal openTripPlanner()/
   tripPlannerMode() flow (region/anchor/mine mode buttons in a centered
   drawer) in favour of a persistent left-pane "page within a page":
   .filters/.list hide, #tb-pane shows (body.trip-mode, see <style>).
   Region/anchor browsing fold in as "Nearby"/"By region" discovery tabs
   inside the same pane rather than living on as a separate UI. */
function tbEffectiveAnchor(){
  if(tbAnchor!=null&&bookable(tbAnchor))return tbAnchor;
  if(tripLastAdded!=null&&TRIP.has(tripLastAdded))return tripLastAdded;
  return tripSeq.length?tripSeq[tripSeq.length-1]:null;
}
/* Excludes courses already in the cart — tripByAnchor()/tripByRegion()
   alone don't know about TRIP, they're shared with nothing else. */
/* GOLF-90: with a country pill picked (see tbNationPillsHTML(), Plan mode),
   every Discover scope is narrowed to that nation's courses — otherwise
   picking "Ireland" up top and then seeing GB courses in "Nearby" would be
   incoherent. Applied as a final filter so each scope's own logic
   (region/anchor/place ranking) is untouched. */
function tbNationFilter(i){return!state.nation||courseNation(i)===state.nation;}
/* GOLF-91: "Near a place" and "Nearby" were two tabs doing the exact same
   "nearest 5 bookable courses to a point" query, differing only in where
   the point came from (a searched place vs. the last course added) — a
   genuine duplication the stakeholder flagged directly. Collapsed into
   one "Nearby" scope whose anchor point is whichever was set more
   recently: tbAddToWishlist()/tbAddToDay()/toggleTrip() all now clear
   tbPlaceAnchor the moment a course is added, so a place anchor only
   survives until the next course is picked, exactly mirroring "select a
   course or a place, see nearby regardless." Returns {lat,lng,label} or
   null. */
function tbNearbyAnchorPoint(){
  if(tbPlaceAnchor)return tbPlaceAnchor;
  const anchor=tbEffectiveAnchor();
  if(anchor==null)return null;
  return{lat:C[anchor].lat,lng:C[anchor].lng,label:V(anchor,'n')};
}
function tbDiscover(){
  if(tbDiscoveryTab==='region'){
    /* Bug fix (2026-09-02): read the persisted tbRegion/tbBorder state
       rather than the live DOM value — tbDiscover() can run from a
       redraw (e.g. after "+ Wishlist") that happens before/without the
       change listener firing, so the DOM alone isn't reliable. */
    if(!tbRegion)return[];
    return tripByRegion(tbRegion,tbBorder||0).filter(({i})=>!TRIP.has(i)&&tbNationFilter(i));
  }
  const pt=tbNearbyAnchorPoint();
  if(!pt)return[];
  // Over-fetch past the 5 we'll show, since some of the nearest courses
  // overall may already be in the cart (or in a different nation) and get
  // filtered out below.
  return nearestCoursesToPoint(pt.lat,pt.lng,5+TRIP.size).filter(({i})=>!TRIP.has(i)&&tbNationFilter(i)).slice(0,5);
}
/* GOLF-71: the empty state used to restate whatever the scope line
   directly above it had just said ("Add a course to see what's nearby." /
   "Add a course to seed nearby suggestions." rendered one under the
   other). The scope line owns that message now; this only speaks for the
   region scope, which has no scope line of its own. */
function tbResultsHTML(items){
  if(!items.length)return tbDiscoveryTab==='region'?`<p class="hint">No courses in that region yet — pick one above.</p>`:'';
  const anchorPt=tbDiscoveryTab==='anchor'?tbNearbyAnchorPoint():null;
  return items.map(({i,border})=>{
    const dist=anchorPt?` — ${haversineMiles(anchorPt.lat,anchorPt.lng,C[i].lat,C[i].lng).toFixed(1)} mi`:'';
    return`<div class="tb-row">
      <div>⛳ <a href="#" class="linkbtn" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        ${border?' <span class="wt" title="Just over the border — nearest to a course in your chosen region, not itself in it">border</span>':''}
        <div class="cart-region">${dist?dist.replace(/^ — /,''):''}${dist?' · ':''}${esc(C[i].r)} · ${ACCESS[V(i,'a')].label.toLowerCase()}</div></div>
      <button class="tb-btn is-sm is-primary" onclick="tbSelect(${i})">＋ Wishlist</button>
    </div>`;
  }).join('');
}
/* GOLF-31: draws just the confirmed cart's numbered route — used whenever
   the cart changes outside the pane (toggleTrip/tbMove from a popup), so
   there's always visible feedback on the map even when Trip Builder isn't
   open. */
/* GOLF-33: full itinerary order for the map/route — scheduled days in
   day order (each day's own course order preserved), then any
   not-yet-scheduled cart courses appended at the end so they still show
   on the route even before being assigned a day. Falls back to the plain
   flat tripSeq order when no days exist yet (pre-GOLF-33 behavior). Also
   returns a courseIndex->dayPosition map so the map/list can colour- and
   label-code stops by day. */
/* GOLF-56: a "stop" is either a golf course ({type:'course',i,lat,lng,
   name,day}) or a searched place ({type:'place',lat,lng,name,day}) — a
   day's place (its start/free/end-day location, when geocoded) is always
   the day's first stop, followed by its courses in order. Lets a
   start/free/end day's searched location act as a real routable waypoint
   alongside golf courses, with zero special-casing in the leg/route
   machinery below (which only ever reads {lat,lng} off a stop). */
/* GOLF-63: a day's stops are now its place (when geocoded, still always
   first — see the tripDays comment) followed by its items in their own
   free order. Only items that actually carry coordinates become stops; a
   hand-typed hotel with no location is real to the itinerary and the cost
   table but invisible to the router, which is what lets it degrade
   gracefully instead of breaking the chain. A stop keeps `itemId` so the
   leg machinery can attribute a drive to the item it arrives at. */
function tripDayStops(dayIdx){
  const d=tripDays[dayIdx];if(!d)return[];
  const stops=[];
  if(d.placeLat!=null&&d.placeLng!=null)stops.push({type:'place',lat:d.placeLat,lng:d.placeLng,name:d.place||'Place',day:dayIdx+1});
  tripDayItems(d).forEach(it=>{
    const pt=tripItemPoint(it);
    if(!pt)return;
    stops.push(it.type==='golf'
      ?{type:'course',i:it.i,lat:pt.lat,lng:pt.lng,name:tripItemName(it),day:dayIdx+1,itemId:it.id}
      :{type:it.type,lat:pt.lat,lng:pt.lng,name:tripItemName(it),day:dayIdx+1,itemId:it.id});
  });
  return stops;
}
function tripDayFirstStop(dayIdx){const s=tripDayStops(dayIdx);return s.length?s[0]:null;}
function tripDayLastStop(dayIdx){const s=tripDayStops(dayIdx);return s.length?s[s.length-1]:null;}
/* GOLF-63: the whole trip's scheduled stops as one flat ordered chain —
   the thing drive legs are actually computed over now. Previously a leg
   only ever existed at a day boundary (previous day's last course -> this
   day's first), so hotel -> course -> POI -> different hotel within one
   day produced no driving at all. Every consecutive pair in this chain is
   a leg, exactly as the day-to-day legs always were; unscheduled wishlist
   courses are excluded (they have no position in the trip yet). */
/* GOLF-84: one renderTripBuilder() pass asks for the chain many times over
   (tripDayLegs / tripDayTotal / tripCostBreakdown -> tripTotalDriveMiles),
   and rebuilding it each time is pure waste. Rather than invalidate from
   every mutation site, we cache the chain against a cheap signature of
   everything it is derived from — tripSeq plus each day's id, place,
   geocode and item identity/coordinates. If the signature string differs
   from the cached one, the chain is rebuilt; otherwise the cached array is
   returned. Callers only ever read the chain, so sharing it is safe. */
let _stopChainSig=null,_stopChainCache=null;
/* Stop names come from EDITS-corrected course data, which the signature
   deliberately doesn't walk; the editor calls this after a correction. */
function tripStopChainInvalidate(){_stopChainSig=null;_stopChainCache=null;}
function tripStopChainSig(){
  let sig=tripSeq.join(',')+'|';
  for(const d of tripDays){
    sig+=d.id+'~'+(d.place||'')+'~'+d.placeLat+'~'+d.placeLng+'~';
    for(const it of tripDayItems(d))sig+=it.id+':'+it.type+':'+(it.type==='golf'?it.i:it.lat+','+it.lng)+';';
    sig+='|';
  }
  return sig;
}
function tripStopChain(){
  const sig=tripStopChainSig();
  if(sig===_stopChainSig&&_stopChainCache)return _stopChainCache;
  const chain=[];
  tripDays.forEach((d,idx)=>tripDayStops(idx).forEach(s=>chain.push(Object.assign({dayIdx:idx},s))));
  _stopChainSig=sig;_stopChainCache=chain;
  return chain;
}
/* The stop immediately before this one in the trip-wide chain, or null for
   the very first stop of the trip. */
function tripPrevStop(chain,pos){return pos>0?chain[pos-1]:null;}
/* One leg's {minutes,miles,real} — a real ORS-backed figure when one is
   cached for this pair, otherwise the GOLF-43 straight-line heuristic, so
   a leg always contributes a sensible number rather than nothing. Same
   "fire the fetch, fall back for now, re-render when it lands" contract as
   tripDayRealEstimate(), which this generalizes. */
function tripLegEstimate(a,b){
  if(!a||!b)return null;
  const miles=haversineMiles(a.lat,a.lng,b.lat,b.lng)*DRIVE_INEFFICIENCY;
  if(ORS_PROXY_URL){
    const key=orsLegKey(a,b);
    const hit=orsCacheLoad()[key];
    if(hit&&typeof hit.minutes==='number')
      return{minutes:hit.minutes,miles:hit.miles!=null?hit.miles:miles,real:true};
    orsEnsureLeg(key,a,b);
  }
  return{minutes:Math.max(5,Math.round((miles/DRIVE_AVG_MPH*60)/5)*5),miles,real:false};
}
/* Total driving distance across the whole trip — every consecutive pair in
   the chain, not just the day boundaries, so the fuel estimate reflects
   the real shape of a multi-stop day. */
function tripTotalDriveMiles(){
  const chain=tripStopChain();
  let miles=0;
  for(let k=1;k<chain.length;k++){
    const leg=tripLegEstimate(chain[k-1],chain[k]);
    if(leg)miles+=leg.miles;
  }
  return miles;
}
function tripDayOrder(){
  if(!tripDays.length)return tripSeq.map(i=>({type:'course',i,lat:C[i].lat,lng:C[i].lng,name:V(i,'n'),day:null}));
  const order=[...tripDays.flatMap((d,idx)=>tripDayStops(idx)),
    ...tripUnscheduled().map(i=>({type:'course',i,lat:C[i].lat,lng:C[i].lng,name:V(i,'n'),day:null}))];
  return order;
}
function tripDrawCart(fit){
  tripClear();
  const order=tripDayOrder();
  const pts=tripShowOrdered(order,false,false);
  if(fit&&pts.length)map.fitBounds(L.latLngBounds(pts),{padding:[32,32]});
}
/* Draws the confirmed cart route AND the not-yet-added discovery
   candidates on the map at once — tripShow()/tripShowOrdered()'s clear/fit
   params exist specifically so these two draws don't wipe each other out. */
/* GOLF-69 (item 10): the day's own hotel/POI stops on the map — "hotels can
   be marked with little hotel emojis and POIs with location pins. Since we
   don't have hotel information, you can drop the pin somewhere in the
   nearest city."
   Note this is a different thing from tbDrawHeritage() below, which draws
   *suggested* nearby heritage POIs fetched from the ORS proxy; these are
   the stops the visitor actually put on a day.
   Location, in priority order: the stop's own geocoded point (set when it
   was picked from the search picker) → the day's own city/place point
   (GOLF-56's placeLat/placeLng) → the day's last golf course → the nearest
   day in either direction that has one of those. A stop placed by fallback
   is jittered a few hundred metres and says so in its tooltip, so two
   locationless stops on the same day don't stack into one invisible pin
   and nobody mistakes an approximate pin for a real address. */
/* GOLF-79 ("Show POI's"): small muted markers for whichever days currently
   have it toggled on — drawn from cache only (never triggers a fetch
   itself; the pane's own render already called tbHeritageFor() for that).
   Deliberately NOT included in the fitBounds points below — a nearby
   sight shouldn't zoom the map away from the actual trip route. */
function tbDrawHeritage(){
  tripDays.forEach(d=>{
    if(!tbHeritageOn.has(d.id))return;
    const pois=tbHeritageFor(d);
    if(!pois)return;
    pois.forEach(p=>{
      L.circleMarker([p.lat,p.lng],{radius:5,color:'#8A5A2B',weight:1.5,fillColor:'#fff',fillOpacity:.9})
        // p.name/p.category come straight from Overpass — escape both, same
        // as tbDrawHotelCandidates() below already does.
        .bindTooltip(p.category?`${esc(p.name)} — ${esc(p.category)}`:esc(p.name),{direction:'top'}).addTo(tripLayer);
    });
  });
}
/* GOLF-96: the hotel-picker's real OSM candidates, shown alongside a day's
   already-added stays (tbDrawTripItems, drawn as solid 🏨 pins) — these are
   deliberately visually distinct (a hollow ring, not a solid emoji marker)
   so "pick one of these" never reads as "already booked", and excluded
   from fitBounds for the same reason tbDrawHeritage()'s candidates are. */
function tbDrawHotelCandidates(){
  if(tbHotelPickerFor==null)return;
  const d=tripDays.find(d=>d.id===tbHotelPickerFor);if(!d)return;
  const pois=tbHotelsFor(d);
  if(!pois)return;
  pois.forEach((p,idx)=>{
    L.circleMarker([p.lat,p.lng],{radius:7,color:'#1b5e20',weight:2,fillColor:'#fff',fillOpacity:.85})
      .bindTooltip(`🏨 ${esc(p.name)}${p.category?' — '+esc(p.category):''}`,{direction:'top'})
      .on('click',()=>tbPickHotelCandidate(d.id,idx))
      .addTo(tripLayer);
  });
}
function tbDayFallbackPoint(idx){
  const d=tripDays[idx];
  if(!d)return null;
  if(typeof d.placeLat==='number'&&isFinite(d.placeLat)&&typeof d.placeLng==='number'&&isFinite(d.placeLng))
    return{lat:d.placeLat,lng:d.placeLng};
  const pt=tbPoiPoint(d); // that day's last golf course, or null
  if(pt)return pt;
  for(let step=1;step<tripDays.length;step++){
    for(const j of[idx-step,idx+step]){
      if(j<0||j>=tripDays.length)continue;
      const o=tripDays[j];
      if(typeof o.placeLat==='number'&&isFinite(o.placeLat)&&typeof o.placeLng==='number'&&isFinite(o.placeLng))
        return{lat:o.placeLat,lng:o.placeLng};
      const op=tbPoiPoint(o);
      if(op)return op;
    }
  }
  return null;
}
function tbEmojiIcon(emoji){
  return L.divIcon({className:'tb-emoji-marker',html:`<span>${emoji}</span>`,iconSize:[24,24],iconAnchor:[12,20],popupAnchor:[0,-18]});
}
/* GOLF-91/item-4: a scheduled golf stop used to be a bare numbered
   circleMarker on the trip route — no icon at all, unlike hotel/POI stops
   (🏨/📍ANCHOR via tbEmojiIcon) which already carry the same glyph the
   Trip Builder's own list rows use (⛳/🏨/📍, see tripDayItemRowHTML()).
   This closes that gap: a day-coloured circular badge with the same ⛳
   glyph, plus the existing "D{day}·{order}" label as a small corner pill
   so the route order/day is still legible at a glance. */
function tripGolfMarkerIcon(fill,label){
  return L.divIcon({className:'trip-golf-marker',
    html:`<div class="tgm-badge" style="background:${fill}"><span class="tgm-emoji">⛳</span></div><span class="tgm-num">${esc(label)}</span>`,
    iconSize:[30,30],iconAnchor:[15,26],popupAnchor:[0,-24]});
}
function tbDrawTripItems(){
  tripDays.forEach((d,idx)=>{
    let fallbackN=0;
    tripDayItems(d).forEach(it=>{
      if(it.type==='golf')return; // already drawn as a numbered route stop
      let pt=tripItemPoint(it),approx=false;
      if(!pt){
        const fb=tbDayFallbackPoint(idx);
        if(!fb)return;
        // ~0.004° ≈ 250–450m: enough to separate stacked pins, small enough
        // to still read as "in this town".
        const a=fallbackN++*(Math.PI*2/3);
        pt={lat:fb.lat+Math.cos(a)*0.004,lng:fb.lng+Math.sin(a)*0.006};
        approx=true;
      }
      L.marker([pt.lat,pt.lng],{icon:tbEmojiIcon(it.type==='hotel'?'🏨':'📍')})
        .bindTooltip(`${esc(tripItemName(it))} — Day ${idx+1}${approx?' (approximate — no address set)':''}`,{direction:'top'})
        .addTo(tripLayer);
    });
  });
}
function tbDrawMap(){
  tripClear();
  const order=tripDayOrder();
  const pts1=tripShowOrdered(order,false,false);
  /* GOLF-57: discovery candidates only clutter the map while the Discover
     tab is actually the one showing them — other tabs (Itinerary/Day/
     Costs/Add) just show the confirmed trip route. */
  let pts2=[];
  if(appMode==='plan'){
    // GOLF-91: the merged Nearby scope's anchor can be a place (no course
    // index — tripShow()'s special anchor marker needs one) or a course
    // (which it can draw distinctly). Only pass a course anchor through;
    // a place anchor just contributes its point to the fit-bounds list,
    // same as the old 'place' tab did.
    const courseAnchor=(tbDiscoveryTab==='anchor'&&!tbPlaceAnchor)?tbEffectiveAnchor():null;
    pts2=tripShow(tbDiscover(),courseAnchor,false,false);
    if(tbDiscoveryTab==='anchor'&&tbPlaceAnchor)pts2=[...pts2,[tbPlaceAnchor.lat,tbPlaceAnchor.lng]];
  }
  tbDrawHeritage();
  tbDrawTripItems();
  tbDrawHotelCandidates();
  const pts=[...pts1,...pts2];
  if(pts.length)map.fitBounds(L.latLngBounds(pts),{padding:[32,32]});
}
