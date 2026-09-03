/* ============================================================
   js/trip-share.js — GOLF-86: shareable trip link (v1/demo).

   A frozen, read-only snapshot of a trip, encoded entirely into the URL
   hash (#share=<payload>) — no backend, nothing written to localStorage
   for the viewer, nothing written into the live TRIP/tripSeq/tripDays
   globals except for the brief, synchronous swap-render-restore window
   below. Course data itself is never re-embedded — the payload carries
   course *indices* only, referencing the C[] array every visitor's page
   already has loaded statically.

   Loaded as a plain <script> (not a module), after js/app-mode.js and
   before js/boot.js — top-level here is just function declarations, so
   its position only needs to be after everything it calls (trip-model.js,
   trip-ui.js, trip-route.js) and before boot.js's cold-load check.
   ============================================================ */

/* ── Encode: current active trip → a compact, self-contained payload ── */
function tripBuildSharePayload(){
  return{
    v:1,
    gs:groupSize,
    seq:[...tripSeq],
    days:tripDays.map(d=>({
      id:d.id,kind:d.kind,place:d.place||null,
      placeLat:d.placeLat??null,placeLng:d.placeLng??null,
      date:d.date||null,driveIn:d.driveIn??null,
      items:tripDayItems(d).map(it=>it.type==='golf'
        ?{id:it.id,type:'golf',i:it.i}
        :{id:it.id,type:it.type,name:it.name,price:it.price,
          priceType:it.priceType,guests:it.guests,lat:it.lat,lng:it.lng})
    }))
  };
}
function tripEncodeShareURL(){
  const encoded=encodeURIComponent(JSON.stringify(tripBuildSharePayload()));
  return location.origin+location.pathname+'#share='+encoded;
}
/* Wired to the Build-mode "🔗 Share" button — builds the link, writes it
   into location.hash (so the *current tab* also becomes that shareable
   URL — bookmarkable, matches GOLF-41's convention) and copies it to the
   clipboard, following the exact copy/feedback pattern already used by
   the corrections drawer's "Copy to clipboard" button (js/editor.js). */
function tbShareTrip(btn){
  const url=tripEncodeShareURL();
  history.pushState({appMode},'',url);
  const original=btn.textContent;
  navigator.clipboard.writeText(url)
    .then(()=>{btn.textContent='Copied!';setTimeout(()=>{btn.textContent=original;},1800);})
    .catch(()=>{btn.textContent='Copy failed — select from address bar';setTimeout(()=>{btn.textContent=original;},2400);});
}

/* ── Decode: a #share= hash → a plain payload object, or null on any
   malformed/truncated input (graceful degradation — never throws past
   this function). ── */
function tripDecodeSharePayload(hash){
  try{
    if(!hash||hash.indexOf('#share=')!==0)return null;
    const json=decodeURIComponent(hash.slice('#share='.length));
    const p=JSON.parse(json);
    if(!p||typeof p!=='object'||!Array.isArray(p.days)||!Array.isArray(p.seq))return null;
    return p;
  }catch(e){return null;}
}

/* ── Render: decode the payload into the pane, entirely read-only.

   Implementation choice (per the plan's explicit permission to pick
   either approach): temporarily swap the live TRIP/tripSeq/tripDays/
   groupSize/tbIncludeFuel globals to the decoded snapshot, call the
   existing pure render functions (tbItinAllHTML/tripCostBreakdown/
   tripDayOrder — none of which call saveState() or touch localStorage,
   confirmed by direct reading), then restore the visitor's real globals
   in a `finally` before this function returns. The swap window is
   synchronous and over before this function's caller gets control back,
   so the visitor's own trip is never persisted-over, never visibly
   altered, and no other code path can observe the swapped values. ── */
function renderSharedTrip(){
  const pane=document.getElementById('shared-pane');
  if(!pane)return;
  const payload=tripDecodeSharePayload(location.hash);
  if(!payload){
    pane.innerHTML=`<div class="shared-wrap"><div class="cost-card" style="margin:var(--sp-6) auto;max-width:640px">
      <p class="hint">This link looks broken or incomplete — a character may have been cut off when it was shared. Ask whoever sent it for a fresh one.</p>
    </div></div>`;
    return;
  }
  const savedTrip=new Set(TRIP),savedSeq=tripSeq,savedDays=tripDays,savedGS=groupSize,savedFuel=tbIncludeFuel;
  try{
    TRIP.clear();payload.seq.forEach(i=>{if(typeof i==='number'&&C[i])TRIP.add(i);});
    tripSeq=payload.seq.filter(i=>typeof i==='number'&&C[i]);
    tripDays=payload.days.map(d=>({
      id:d.id,kind:d.kind||'golf',place:d.place||null,
      placeLat:d.placeLat??null,placeLng:d.placeLng??null,
      date:d.date||null,driveIn:d.driveIn??null,
      items:Array.isArray(d.items)?d.items.map(it=>Object.assign({},it)):[]
    })).map(tripDayMigrateItems);
    groupSize=typeof payload.gs==='number'&&payload.gs>0?Math.round(payload.gs):1;
    tbIncludeFuel=true;
    const dayCount=tripDays.length;
    const grand=tripCostBreakdown().grand;
    pane.innerHTML=`<div class="shared-wrap">
      <div class="tb-navbar"><span class="tb-wordmark">Shared trip</span>
        <span class="tb-navbar-right"><span class="tb-pill">${dayCount?`${dayCount} day${dayCount===1?'':'s'} · `:''}${tripPrimaryCurrency()}${grand.toFixed(0)}</span></span></div>
      <p class="hint" style="margin:var(--sp-3) var(--sp-4)">📸 <b>Frozen snapshot</b> — this shows the trip exactly as it was when the link was made. It won't update if the trip changes, and viewing it doesn't touch your own trip.</p>
      <div id="shared-map" style="height:320px;margin:0 var(--sp-4) var(--sp-4);border-radius:var(--radius-lg);overflow:hidden"></div>
      <div class="tb-section" style="padding:0 var(--sp-4)"><h3 style="font-size:var(--fs-title);margin:0 0 var(--sp-2)">Itinerary</h3>${tbItinAllHTML()}</div>
      <div class="tb-section" style="padding:0 var(--sp-4) var(--sp-6)"><h3 style="font-size:var(--fs-title);margin:var(--sp-4) 0 var(--sp-2)">Costs</h3>${tbCostsTabReadOnlyHTML()}</div>
    </div>`;
    renderSharedMap();
  }catch(e){
    pane.innerHTML=`<div class="shared-wrap"><div class="cost-card" style="margin:var(--sp-6) auto;max-width:640px">
      <p class="hint">This link looks broken or incomplete.</p>
    </div></div>`;
  }finally{
    TRIP.clear();savedTrip.forEach(i=>TRIP.add(i));
    tripSeq=savedSeq;tripDays=savedDays;groupSize=savedGS;tbIncludeFuel=savedFuel;
  }
}
/* A read-only twin of tbCostsTabHTML() — identical output except the fuel
   row has no checkbox/onchange, since that handler would otherwise flip
   the *live* tbIncludeFuel/call renderTripBuilder() against whatever the
   viewer's own trip state happens to be. */
function tbCostsTabReadOnlyHTML(){
  const b=tripCostBreakdown();
  const cur=tripPrimaryCurrency();
  const mixed=b.items.some(x=>x.cur&&x.cur!==cur);
  return`<div class="cost-banner"><div class="cost-banner-label">Trip total${b.groupSize>1?` · ${b.groupSize} travellers`:''}</div><div class="cost-banner-amount">${cur}${b.grand.toFixed(0)}${b.perPerson!=null?`<span class="cost-banner-pp"> · ${cur}${b.perPerson.toFixed(0)} per person</span>`:''}</div></div>
    <div class="cost-card"><table class="cost-summary-table">
      <tr><td>⛳ Golf</td><td>${cur}${b.golfTotal.toFixed(0)}</td></tr>
      <tr><td>🏨 Stays</td><td>${cur}${b.stayTotal.toFixed(0)}</td></tr>
      <tr><td>📍 Stops</td><td>${cur}${b.poiTotal.toFixed(0)}</td></tr>
      <tr><td>⛽ Fuel (est.)</td><td>${cur}${b.fuelCost.toFixed(0)}</td></tr>
    </table></div>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} green fee${b.golfOf===1?'':'s'} confirmed — the rest are typical rates.${mixed?` Totals are shown in ${cur} but some line items below are priced in a different currency — no conversion is applied yet.`:''}</p>
    <div class="cost-line-items-label">Line items</div>
    <div class="cost-card"><table class="cost-line-table">${b.items.length?b.items.map(x=>`<tr><td>${esc(x.label)} <span class="wt">${x.cat}</span>${x.tag?` <span class="wt">${esc(x.tag)}</span>`:''}</td><td>${tbMoney(x.amount,x.cur||cur)}</td></tr>`).join(''):`<tr><td colspan="2" class="hint">No costs yet.</td></tr>`}</table></div>`;
}
/* A dedicated Leaflet map instance, entirely separate from the app's main
   `map`/`tripLayer` globals — reusing those (via tripDrawCart()) would
   draw onto (and tripClear() would wipe) whatever route the *viewer's
   own* live trip already had on the real map, which is exactly the
   bleed-through this feature must never cause. Built fresh, and torn
   down/rebuilt if renderSharedTrip() ever runs twice in one page life. */
let sharedMapInstance=null;
function renderSharedMap(){
  const el=document.getElementById('shared-map');
  if(!el||typeof L==='undefined')return;
  if(sharedMapInstance){sharedMapInstance.remove();sharedMapInstance=null;}
  const m=L.map(el,{zoomControl:true,scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(m);
  const order=tripDayOrder();
  const pts=[];
  order.forEach((stop,idx)=>{
    if(stop.lat==null||stop.lng==null)return;
    const day=stop.day;
    const fill=day!=null?TRIP_DAY_COLORS[(day-1)%TRIP_DAY_COLORS.length]:'#E6B400';
    L.circleMarker([stop.lat,stop.lng],{radius:8,color:'#1B2733',weight:2,fillColor:fill,fillOpacity:1})
      .bindTooltip(`${idx+1}. ${stop.name||''}`,{direction:'top'}).addTo(m);
    pts.push([stop.lat,stop.lng]);
  });
  for(let k=1;k<order.length;k++){
    const a=order[k-1],b=order[k];
    if(a.lat==null||b.lat==null)continue;
    L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{color:'#3E7CB1',weight:3,dashArray:'5,7',opacity:.85}).addTo(m);
  }
  if(pts.length>1)m.fitBounds(L.latLngBounds(pts),{padding:[28,28]});
  else if(pts.length===1)m.setView(pts[0],11);
  else m.setView([54.5,-3],5);
  sharedMapInstance=m;
}
