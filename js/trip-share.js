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
  /* GOLF-203: the trip's own "Other" cost lines. Written as a NEW,
     OPTIONAL key — omitted entirely when there are none, so a link made
     by a trip without them is byte-for-byte what it was before this
     shipped, and every link already in someone's hands decodes exactly
     as it always did (tripDecodeSharePayload treats a missing `oth` as
     "no custom costs"). No existing field changes meaning. */
  const oth=(Array.isArray(tripCustom)?tripCustom:[]).map(c=>({
    l:c.label||'',a:(typeof c.amount==='number'&&isFinite(c.amount))?c.amount:null,
    p:c.per==='person'?'person':'group',c:c.cur||'GBP'}));
  return{
    v:1,
    gs:groupSize,
    nm:((trips[activeTripId]||{}).name)||null, // GOLF-115: carry the trip name so the shared view can show it in full
    ...(oth.length?{oth}:{}),
    /* GOLF-153: the view the sender was looking at, so the link opens on
       the same one. Written only when detailed — an untimed, list-view
       trip encodes to exactly the bytes it did before detailed mode. */
    ...(typeof tbDetailed!=='undefined'&&tbDetailed?{dt:1}:{}),

    /* GOLF-163: courses travel as stable ids (`c`), not array indices.
       A share link is the one reference we can never migrate — it is a
       URL already in someone else's hands — so from here on it names
       courses by something that does not move when C[] does. The old
       numeric `i` is still *read* by tripDecodeSharePayload() for every
       link made before today, but is no longer written. */
    seq:[...tripSeq].map(courseRefEncode),
    /* GOLF-118 needs the day's index for tripShareInboundFerry(), which
       looks at the previous day's last stop. */
    days:tripDays.map((d,idx)=>({
      id:d.id,kind:d.kind,place:d.place||null,
      placeLat:d.placeLat??null,placeLng:d.placeLng??null,
      date:d.date||null,driveIn:d.driveIn??null,
      /* GOLF-118: freeze the inbound leg's ferry facts (the viewer's ORS
         cache is empty, so the shared itinerary can't recompute them).
         Presence of the object = "this leg has a ferry". */
      ferryIn:tripShareInboundFerry(idx),
      items:tripDayItems(d).map(it=>shareItemTiming(it.type==='golf'
        ?{id:it.id,type:'golf',c:courseRefEncode(it.i)}
        :it.type==='flight'
          ?shareFlightFields(it)
          :it.type==='train'
            /* DEC-039 (owner review): a train is two station names and
               two times. No coordinates — that is what keeps it out of
               the routing and out of the fuel. */
            ?{id:it.id,type:'train',name:it.name,fnm:it.fromName||null,
              dep:it.depart||null,arr:it.arrive||null,price:it.price??null}
            :{id:it.id,type:it.type,name:it.name,price:it.price,lat:it.lat,lng:it.lng},it))
    }))
  };
}
/* GOLF-153: the timing fields ride along ONLY when set. That is what
   keeps the payload small, and more importantly what keeps a trip with
   no times encoding byte-for-byte as it did before detailed mode
   existed — adding the keys unconditionally would change every link the
   app generates, for every trip, to carry two nulls nobody asked for. */
function shareItemTiming(out,it){
  if(!out||!it)return out;
  if(typeof it.time==='string'&&it.time)out.t=it.time;
  if(typeof it.durationMins==='number'&&isFinite(it.durationMins))out.dm=it.durationMins;
  if(typeof it.bufferMins==='number'&&isFinite(it.bufferMins))out.bf=it.bufferMins;
  if(typeof it.note==='string'&&it.note)out.nt=it.note;
  return out;
}
function shareFlightFields(it){
  const out={id:it.id,type:'flight'};
  if(it.name)out.name=it.name;
  if(it.flightNo)out.fn=it.flightNo;
  if(it.fromCode)out.fc=it.fromCode;
  if(it.toCode)out.tc=it.toCode;
  // GOLF-153: the departure airport, only when the visitor set one.
  if(it.fromName)out.fnm=it.fromName;
  if(typeof it.fromLat==='number'&&isFinite(it.fromLat))out.flat=it.fromLat;
  if(typeof it.fromLng==='number'&&isFinite(it.fromLng))out.flng=it.fromLng;
  if(it.depart)out.dep=it.depart;
  if(it.arrive)out.arr=it.arrive;
  if(typeof it.price==='number'&&isFinite(it.price))out.price=it.price;
  if(typeof it.lat==='number'&&isFinite(it.lat))out.lat=it.lat;
  if(typeof it.lng==='number'&&isFinite(it.lng))out.lng=it.lng;
  return out;
}
/* GOLF-118: {mins} for the ferry portion of a day's inbound leg (previous
   day's last stop → this day's first stop), or null when that leg has no
   ferry / isn't ORS-resolved. Mirrors tripDayRealEstimate()'s leg pick. */
function tripShareInboundFerry(dayIdx){
  if(typeof legFerryInfo!=='function')return null;
  const a=tripDayLastStop(dayIdx-1),b=tripDayFirstStop(dayIdx);
  if(!a||!b)return null;
  const f=legFerryInfo(a,b);
  return f.hasFerry?{mins:Math.round(f.ferryMinutes||0)}:null;
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
  /* GOLF-235: one 'share' per trip, saved straight away so a reload can't
     count it twice; and the sharer's own link is marked as seen, so their
     reopening it doesn't count as an open. */
  usageTripOnce(trips[activeTripId],'share');saveState();
  usageLinkFirstSeen(location.hash);
  /* GOLF-150: the button is icon-only now, so "Copied!" can't replace its
     label — it shows as a small bubble (the data-tip ::after in CSS).
     On touch devices with a native share sheet (iPhone/iPad, most
     phones) that's opened instead, matching the Apple-style share glyph;
     desktop keeps the one-click copy. */
  const tip=(msg,ms)=>{btn.dataset.tip=msg;clearTimeout(btn._tipT);btn._tipT=setTimeout(()=>{delete btn.dataset.tip;},ms);};
  const copy=()=>navigator.clipboard.writeText(url)
    .then(()=>tip('Link copied',1800))
    .catch(()=>tip('Copy failed — copy from the address bar',2600));
  if(navigator.share&&matchMedia('(pointer:coarse)').matches){
    navigator.share({title:(trips[activeTripId]&&trips[activeTripId].name)||'Golf trip',url})
      .catch(e=>{if(e&&e.name!=='AbortError')copy();});
    return;
  }
  copy();
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
const SHARE_MAX_DAYS=30, SHARE_MAX_ITEMS_PER_DAY=20, SHARE_MAX_STR=120, SHARE_MAX_CUSTOM=40;
/* GOLF-153: the same cap the model enforces, so a note that was saved
   whole travels whole — and a hand-edited hash cannot smuggle in more. */
const SHARE_NOTE_MAX=typeof TL_NOTE_MAX==='number'?TL_NOTE_MAX:300;
function shareStr(v,max){
  if(typeof v!=='string')return null;
  const s=String(v).trim().slice(0,max||SHARE_MAX_STR);
  return s?s:null;
}
function shareNum(v,min,max){
  if(typeof v!=='number'||!Number.isFinite(v))return null;
  return Math.min(max,Math.max(min,v));
}
/* GOLF-153: a time off the URL, normalised to "HH:MM" or dropped. */
function shareTime(v){
  const m=typeof tlParseTime==='function'?tlParseTime(v):null;
  return m==null?null:tlFormatTime(m);
}
function shareReadTiming(out,it){
  if(!out||!it)return out;
  const t=shareTime(it.t); if(t)out.time=t;
  const d=shareNum(it.dm,0,1440); if(d!=null)out.durationMins=Math.round(d);
  const b=shareNum(it.bf,0,1440); if(b!=null)out.bufferMins=Math.round(b);
  const n=shareStr(it.nt,SHARE_NOTE_MAX); if(n)out.note=n;
  return out;
}
function tripDecodeSharePayload(hash){
  try{
    if(!hash||hash.indexOf('#share=')!==0)return null;
    const json=decodeURIComponent(hash.slice('#share='.length));
    const p=JSON.parse(json);
    if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.days)||!Array.isArray(p.seq))return null;
    /* GOLF-163: accepts both forms for ever — a stable id (written from
       2026-09-20 on) and a bare index (every link made before that), the
       latter resolved through the frozen index->id table. A reference
       that no longer names a real course resolves to null and is dropped,
       which is what the old `C[i]` guard did too. Note this runs on
       untrusted input off the URL: courseRefDecode() is a Map lookup with
       a type check, so an arbitrary string can only ever miss. */
    const seq=courseDecodeRefList(p.seq).filter(i=>C[i]).slice(0,500);
    const days=p.days.slice(0,SHARE_MAX_DAYS).map((d,idx)=>{
      if(!d||typeof d!=='object')return null;
      const items=(Array.isArray(d.items)?d.items:[]).slice(0,SHARE_MAX_ITEMS_PER_DAY).map((it,n)=>{
        if(!it||typeof it!=='object')return null;
        const id=shareStr(it.id,64)||('s'+idx+'-'+n);
        if(it.type==='golf'){
          const ci=courseRefDecode(it.c!==undefined?it.c:it.i);
          return(ci!==null&&C[ci])?shareReadTiming({id,type:'golf',i:ci,_raw:it.c!==undefined?it.c:it.i},it):null;
        }
        /* GOLF-153: untrusted input off the URL, so every field is read
           through the same shareStr/shareNum clamps as the rest, and a
           bad time is simply absent rather than fatal. */
        if(it.type==='flight'){
          const out={id,type:'flight'};
          const nm=shareStr(it.name,80); if(nm)out.name=nm;
          const fno=shareStr(it.fn,12); if(fno)out.flightNo=fno;
          const fc=shareStr(it.fc,8); if(fc)out.fromCode=fc;
          const tc=shareStr(it.tc,8); if(tc)out.toCode=tc;
          const fnm=shareStr(it.fnm,80); if(fnm)out.fromName=fnm;
          const fla=shareNum(it.flat,-90,90),flo=shareNum(it.flng,-180,180);
          if(fla!=null&&flo!=null){out.fromLat=fla;out.fromLng=flo;}
          const dep=shareTime(it.dep); if(dep)out.depart=dep;
          const arr=shareTime(it.arr); if(arr)out.arrive=arr;
          const pr=shareNum(it.price,0,1e6); if(pr!=null)out.price=pr;
          const la=shareNum(it.lat,-90,90),ln=shareNum(it.lng,-180,180);
          if(la!=null&&ln!=null){out.lat=la;out.lng=ln;}
          return shareReadTiming(out,it);
        }
        if(it.type==='train'){
          const name=shareStr(it.name,80);
          if(!name)return null;
          const out={id,type:'train',name};
          const fnm=shareStr(it.fnm,80); if(fnm)out.fromName=fnm;
          const dep=shareTime(it.dep); if(dep)out.depart=dep;
          const arr=shareTime(it.arr); if(arr)out.arrive=arr;
          const pr=shareNum(it.price,0,1e6); if(pr!=null)out.price=pr;
          return shareReadTiming(out,it);
        }
        /* DEC-039 (owner review): a drive-from and an activity are
           shaped exactly like a hotel or a sight — a name, an optional
           price and an optional location — so they decode through the
           same branch, which is the branch below. */
        if(it.type!=='hotel'&&it.type!=='poi'&&it.type!=='drivefrom'&&it.type!=='activity')return null;
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
        return shareReadTiming(out,it);
      }).filter(Boolean);
      const id=Number.isInteger(d.id)?d.id:idx+1;
      return{
        id,
        kind:TRIP_DAY_KINDS[d.kind]?d.kind:'golf',
        place:shareStr(d.place,80),
        placeLat:shareNum(d.placeLat,-90,90),placeLng:shareNum(d.placeLng,-180,180),
        date:(typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))?d.date:null,
        driveIn:shareNum(d.driveIn,0,10000),
        /* GOLF-118 — object present ⇒ inbound leg has a ferry; mins clamped. */
        ferryIn:(d.ferryIn&&typeof d.ferryIn==='object')
          ?{hasFerry:true,ferryMinutes:Math.round(shareNum(d.ferryIn.mins,0,10000)||0)}:null,
        items
      };
    }).filter(Boolean);
    /* GOLF-198: an old link can hold both records of a course that was
       in the data twice — keep the first, drop the other. */
    courseDedupeAliasItems(days,it=>it._raw);
    days.forEach(d=>d.items.forEach(it=>{delete it._raw;}));
    const gs=shareNum(p.gs,1,16);
    /* GOLF-203 — optional, and untrusted like everything else off the
       hash: same field-by-field rebuild, same caps. Absent on every link
       made before this shipped, which reads as no custom costs. */
    const oth=(Array.isArray(p.oth)?p.oth:[]).slice(0,SHARE_MAX_CUSTOM).map((c,n)=>{
      if(!c||typeof c!=='object')return null;
      return{id:'sc'+n,label:shareStr(c.l,80)||'',
        amount:shareNum(c.a,0,1e6),
        per:c.p==='person'?'person':'group',
        cur:(typeof c.c==='string'&&CURRENCY_SYMS[c.c])?c.c:'GBP'};
    }).filter(Boolean);
    return{v:1,gs:gs!=null?Math.round(gs):1,nm:shareStr(p.nm,80),seq,days,oth,dt:p.dt===1}; // GOLF-153
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
  usageShareOpened(location.hash); // GOLF-235: once per link per browser
  /* GOLF-153: the link opens on the view its sender was using, and after
     that the recipient's own toggle wins — this re-renders through here,
     so it has to be first-render only. Nothing is saved either way: a
     shared link never writes to this browser's state. */
  if(!tlSharedViewApplied){tlSharedViewApplied=true;tbDetailed=!!payload.dt;}
  const savedTrip=new Set(TRIP),savedSeq=tripSeq,savedDays=tripDays,savedGS=groupSize,savedFuel=tbIncludeFuel,savedCustom=tripCustom;
  try{
    /* tripDecodeSharePayload() has already rebuilt every field of this
       payload from scratch and validated it — nothing here is copied
       wholesale off the URL, so these can be used as-is. */
    TRIP.clear();payload.seq.forEach(i=>TRIP.add(i));
    tripSeq=[...payload.seq];
    tripDays=payload.days.map(d=>({...d,items:d.items.map(it=>({...it}))}));
    groupSize=payload.gs;
    tripCustom=payload.oth.map(c=>({...c})); // GOLF-203
    tbIncludeFuel=true;
    tbCostMode='pp'; // GOLF-178: a shared link always opens on Per person
    tbCostModeApply(); // GOLF-193: ...and the whole shared view follows it
    const dayCount=tripDays.length;
    pane.innerHTML=`<div class="shared-wrap">
      <div class="tb-navbar"><span class="tb-wordmark">${payload.nm?esc(payload.nm):'Shared trip'}</span>
        <span class="tb-navbar-right"><span class="tb-pill">${dayCount?`${dayCount} day${dayCount===1?'':'s'} · `:''}${tbTripTotalHTML()}</span>
        <button class="tb-btn is-sm is-quiet no-print" id="shared-print" title="Opens the browser's print dialog — save as PDF from there for a nice printable itinerary.">🖨️ Print / Save as PDF</button></span></div>
      <p class="hint no-print" style="margin:var(--sp-3) var(--sp-4)">📸 <b>Frozen snapshot</b> — this shows the trip exactly as it was when the link was made. It won't update if the trip changes, and viewing it doesn't touch your own trip.</p>
      <div id="shared-map" class="no-print" style="height:320px;margin:0 var(--sp-4) var(--sp-4);border-radius:var(--radius-lg);overflow:hidden"></div>
      <div class="tb-section" style="padding:0 var(--sp-4)"><h3 style="font-size:var(--fs-title);margin:0 0 var(--sp-2)">Itinerary</h3>${tbItinAllHTML()}</div>
      <div class="tb-section" style="padding:0 var(--sp-4) var(--sp-6)"><h3 style="font-size:var(--fs-title);margin:var(--sp-4) 0 var(--sp-2)">Costs</h3>${tbCostsTabReadOnlyHTML()}</div>
    </div>`;
    renderSharedMap();
    /* DEC-039 (owner review): the calendar's hour scrollers open on the
       first thing in each day. Called inside the try, because the finally
       below hands tripDays back to the viewer's own trip. */
    if(typeof tlAfterRender==='function')tlAfterRender();
    const printBtn=document.getElementById('shared-print');
    if(printBtn)printBtn.addEventListener('click',()=>window.print());
  }catch(e){
    pane.innerHTML=`<div class="shared-wrap"><div class="cost-card" style="margin:var(--sp-6) auto;max-width:640px">
      <p class="hint">This link looks broken or incomplete.</p>
    </div></div>`;
  }finally{
    TRIP.clear();savedTrip.forEach(i=>TRIP.add(i));
    tripSeq=savedSeq;tripDays=savedDays;groupSize=savedGS;tbIncludeFuel=savedFuel;tripCustom=savedCustom;
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
  return tbCostsBodyHTML(tripCostBreakdown(),null,true);
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
  const m=L.map(el,{zoomControl:true,scrollWheelZoom:false,maxZoom:19});
  /* GOLF-105: same Esri basemap + Default/Satellite toggle as the main
     map, keyed on production (GOLF-234). esriAttachBases() is a global from
     js/map.js (loaded first); it builds a fresh layer set per map, since
     these layers can't be shared with the main map instance. */
  esriAttachBases(m);
  m.attributionControl.addAttribution(PRIVACY_LINK); // GOLF-227
  m.attributionControl.addAttribution(FEEDBACK_LINK); // GOLF-232
  m.attributionControl.addAttribution(DATA_CREDIT); // GOLF-240
  const order=tripDayOrder();
  const pts=[];
  /* GOLF-182: the main map merges a multi-night stay into one 🏨 icon
     (tbDrawTripItems, js/trip-route.js); the shared map has to agree, or a
     2-night stay shared with a friend still shows two dots. Same identity
     key (name + point, not stayId), so a return visit A → B → A is one dot
     for A. Only the DRAWN markers are merged and renumbered — `order` itself
     is untouched below, so the route line, the drive legs it was computed
     from, and the itinerary and costs beneath the map are all unchanged. */
  const hotelDot=new Map();
  let nDrawn=0;
  order.forEach(stop=>{
    if(stop.lat==null||stop.lng==null)return;
    pts.push([stop.lat,stop.lng]);
    const key=stop.type==='hotel'?tbHotelMapKey(stop.name,stop):null;
    if(key){
      const prev=hotelDot.get(key);
      if(prev){
        prev.days.push(stop.day);
        prev.m.setTooltipContent(`${prev.n}. ${esc(stop.name||'')} — ${tbDayListLabel(prev.days.filter(d=>d!=null))}`);
        return;
      }
    }
    const day=stop.day;
    const fill=day!=null?TRIP_DAY_COLORS[(day-1)%TRIP_DAY_COLORS.length]:'#E6B400';
    const n=++nDrawn;
    const mk=L.circleMarker([stop.lat,stop.lng],{radius:8,color:'#1B2733',weight:2,fillColor:fill,fillOpacity:1})
      .bindTooltip(`${n}. ${esc(stop.name||'')}`,{direction:'top'}).addTo(m);
    if(key)hotelDot.set(key,{m:mk,n,days:[stop.day]});
  });
  for(let k=1;k<order.length;k++){
    const a=order[k-1],b=order[k];
    if(a.lat==null||b.lat==null)continue;
    /* GOLF-118: the shared map already draws every leg as a straight line,
       so a ferry crossing needs no re-routing here — just flag the
       day-boundary leg navy + label it when that day's frozen ferryIn
       says the inbound leg has a ferry. */
    const bd=(b.day!=null&&a.day!==b.day)?tripDays[b.day-1]:null;
    const isFerry=!!(bd&&bd.ferryIn);
    const line=L.polyline([[a.lat,a.lng],[b.lat,b.lng]],
      isFerry?{color:'#1B2A4A',weight:3,dashArray:'7,6',opacity:.9}
             :{color:'#3E7CB1',weight:3,dashArray:'5,7',opacity:.85}).addTo(m);
    if(isFerry)line.bindTooltip('⛴ Ferry crossing',{sticky:true});
  }
  if(pts.length>1)m.fitBounds(L.latLngBounds(pts),{padding:[28,28]});
  else if(pts.length===1)m.setView(pts[0],11);
  else m.setView([54.5,-3],5);
  sharedMapInstance=m;
}
