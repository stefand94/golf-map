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
        :{id:it.id,type:it.type,name:it.name,price:it.price,lat:it.lat,lng:it.lng})
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
  // item-6: swap innerHTML, not textContent — the button carries the
  // SHARE_ICON_SVG icon, and textContent would silently strip it out on
  // restore (a real bug this fix caught: the icon never came back after
  // the first "Copied!" round-trip).
  const original=btn.innerHTML;
  navigator.clipboard.writeText(url)
    .then(()=>{btn.innerHTML='Copied!';setTimeout(()=>{btn.innerHTML=original;},1800);})
    .catch(()=>{btn.innerHTML='Copy failed — select from address bar';setTimeout(()=>{btn.innerHTML=original;},2400);});
}

/* ── Decode: a #share= hash → a plain payload object, or null on any
   malformed/truncated input (graceful degradation — never throws past
   this function). ──

   Everything here comes off the URL hash, i.e. from whoever wrote the
   link — so this is untrusted input, not just possibly-truncated input.
   The payload is therefore rebuilt field by field into a fresh object
   (never copied wholesale) with the same defensive discipline as
   validateTripEntry() in js/state.js: every string is String()'d and
   length-capped, every number is Number.isFinite-checked and clamped,
   coordinates are range-checked, item types are restricted to the three
   the renderer knows, and the day/item counts are capped so a link can't
   ask the page to render an unbounded itinerary. Anything that doesn't
   fit is dropped; a structurally wrong payload returns null and
   renderSharedTrip()'s existing "link looks broken" fallback handles it. */
const SHARE_MAX_DAYS=30, SHARE_MAX_ITEMS_PER_DAY=20, SHARE_MAX_STR=120;
function shareStr(v,max){
  if(typeof v!=='string')return null;
  const s=String(v).trim().slice(0,max||SHARE_MAX_STR);
  return s?s:null;
}
function shareNum(v,min,max){
  if(typeof v!=='number'||!Number.isFinite(v))return null;
  return Math.min(max,Math.max(min,v));
}
function tripDecodeSharePayload(hash){
  try{
    if(!hash||hash.indexOf('#share=')!==0)return null;
    const json=decodeURIComponent(hash.slice('#share='.length));
    const p=JSON.parse(json);
    if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.days)||!Array.isArray(p.seq))return null;
    const seq=p.seq.filter(i=>Number.isInteger(i)&&C[i]).slice(0,500);
    const days=p.days.slice(0,SHARE_MAX_DAYS).map((d,idx)=>{
      if(!d||typeof d!=='object')return null;
      const items=(Array.isArray(d.items)?d.items:[]).slice(0,SHARE_MAX_ITEMS_PER_DAY).map((it,n)=>{
        if(!it||typeof it!=='object')return null;
        const id=shareStr(it.id,64)||('s'+idx+'-'+n);
        if(it.type==='golf')return(Number.isInteger(it.i)&&C[it.i])?{id,type:'golf',i:it.i}:null;
        if(it.type!=='hotel'&&it.type!=='poi')return null;
        const name=shareStr(it.name,80);
        if(!name)return null;
        const out={id,type:it.type,name,
          price:shareNum(it.price,0,1e6),
          lat:shareNum(it.lat,-90,90),lng:shareNum(it.lng,-180,180)};
        if(it.type==='hotel'){
          const n2=shareNum(it.nights,1,30);
          out.nights=n2!=null?Math.round(n2):1;
          out.stayId=shareStr(it.stayId,64);
        }
        return out;
      }).filter(Boolean);
      const id=Number.isInteger(d.id)?d.id:idx+1;
      return{
        id,
        kind:TRIP_DAY_KINDS[d.kind]?d.kind:'golf',
        place:shareStr(d.place,80),
        placeLat:shareNum(d.placeLat,-90,90),placeLng:shareNum(d.placeLng,-180,180),
        date:(typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))?d.date:null,
        driveIn:shareNum(d.driveIn,0,10000),
        items
      };
    }).filter(Boolean);
    const gs=shareNum(p.gs,1,16);
    return{v:1,gs:gs!=null?Math.round(gs):1,seq,days};
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
    /* tripDecodeSharePayload() has already rebuilt every field of this
       payload from scratch and validated it — nothing here is copied
       wholesale off the URL, so these can be used as-is. */
    TRIP.clear();payload.seq.forEach(i=>TRIP.add(i));
    tripSeq=[...payload.seq];
    tripDays=payload.days.map(d=>({...d,items:d.items.map(it=>({...it}))}));
    groupSize=payload.gs;
    tbIncludeFuel=true;
    const dayCount=tripDays.length;
    const grand=tripCostBreakdown().grand;
    pane.innerHTML=`<div class="shared-wrap">
      <div class="tb-navbar"><span class="tb-wordmark">Shared trip</span>
        <span class="tb-navbar-right"><span class="tb-pill">${dayCount?`${dayCount} day${dayCount===1?'':'s'} · `:''}${tripPrimaryCurrency()}${grand.toFixed(0)}</span>
        <button class="tb-btn is-sm is-quiet no-print" id="shared-print" title="Opens the browser's print dialog — save as PDF from there for a nice printable itinerary.">🖨️ Print / Save as PDF</button></span></div>
      <p class="hint no-print" style="margin:var(--sp-3) var(--sp-4)">📸 <b>Frozen snapshot</b> — this shows the trip exactly as it was when the link was made. It won't update if the trip changes, and viewing it doesn't touch your own trip.</p>
      <div id="shared-map" class="no-print" style="height:320px;margin:0 var(--sp-4) var(--sp-4);border-radius:var(--radius-lg);overflow:hidden"></div>
      <div class="tb-section" style="padding:0 var(--sp-4)"><h3 style="font-size:var(--fs-title);margin:0 0 var(--sp-2)">Itinerary</h3>${tbItinAllHTML()}</div>
      <div class="tb-section" style="padding:0 var(--sp-4) var(--sp-6)"><h3 style="font-size:var(--fs-title);margin:var(--sp-4) 0 var(--sp-2)">Costs</h3>${tbCostsTabReadOnlyHTML()}</div>
    </div>`;
    renderSharedMap();
    const printBtn=document.getElementById('shared-print');
    if(printBtn)printBtn.addEventListener('click',()=>window.print());
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
/* item-5: mirrors tbCostsTabHTML()'s expand-from-the-grouping layout
   (js/trip-ui.js's costGroupHTML()) so a shared read-only trip looks the
   same as the live Costs tab it's a frozen snapshot of — just with a
   plain, non-interactive Fuel row instead of a checkbox. */
function tbCostsTabReadOnlyHTML(){
  const b=tripCostBreakdown();
  const cur=tripPrimaryCurrency();
  const mixed=b.items.some(x=>x.cur&&x.cur!==cur);
  const golf=b.items.filter(x=>x.cat==='Golf'),stay=b.items.filter(x=>x.cat==='Stay'),stop=b.items.filter(x=>x.cat==='Stop');
  return`<div class="cost-banner"><div class="cost-banner-label">Trip total${b.groupSize>1?` · ${b.groupSize} travellers`:''}</div><div class="cost-banner-amount">${cur}${b.grand.toFixed(0)}${b.perPerson!=null?`<span class="cost-banner-pp"> · ${cur}${b.perPerson.toFixed(0)} per person</span>`:''}</div></div>
    <div class="cost-card cost-groups">
      ${costGroupHTML('⛳','Golf',b.golfTotal,golf,cur)}
      ${costGroupHTML('🏨','Stays',b.stayTotal,stay,cur)}
      ${costGroupHTML('📍','Stops',b.poiTotal,stop,cur)}
      <div class="cost-fuel-row"><span>⛽ Fuel (est.)</span><span class="cost-group-amt">${cur}${b.fuelCost.toFixed(0)}</span></div>
    </div>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} green fee${b.golfOf===1?'':'s'} confirmed — the rest are typical rates.${mixed?` Totals are shown in ${cur} but some line items above are priced in a different currency — no conversion is applied yet.`:''}</p>`;
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
      .bindTooltip(`${idx+1}. ${esc(stop.name||'')}`,{direction:'top'}).addTo(m);
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
