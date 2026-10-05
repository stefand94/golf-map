/* ════════════════════════════════════════════════════════════════════
   GOLF-153 — detailed mode: the day view (DEC-039)

   The calendar half of detailed mode. js/timeline.js does the
   arithmetic; everything here is presentation, so the two can be wrong
   independently and only one of them needs a browser to check.

   Nothing in this file runs unless the visitor turns Detailed on. The
   default itinerary is rendered by exactly the code that rendered it
   before (tbDayCardHTML / tbItinAllHTML) — the toggle swaps the rows
   inside a day card, and leaves the card, its menu, its stay slot and
   its add controls alone.
   ════════════════════════════════════════════════════════════════════ */

/* Off by default, including on a shared link that was made before
   detailed mode existed. Saved as a view preference (js/state.js), and
   written only when ON so an untimed trip's stored bytes don't move. */
let tbDetailed=false;
/* A shared link states which view it was made in; that applies once, on
   the first render, and the recipient's own toggle wins from then on. */
let tlSharedViewApplied=false;

/* 56px to the hour is the smallest that still leaves a 90-minute POI
   legible at 375px, which is the width this was built at. */
const TL_PX_PER_HOUR=56;
const TL_PX_PER_MIN=TL_PX_PER_HOUR/60;
/* Below this a block has no room for its own label, so short stops are
   drawn at the floor and overlap the following hour line slightly
   rather than becoming a sliver with text spilling out. */
const TL_MIN_BLOCK_PX=22;
/* Same idea for a drive leg: 14px is the floor at which "🚗 1h 20m"
   still fits on its line. */
const TL_DRIVE_MIN_PX=14;
/* What a marker takes up: its time and its two lines of text. It has no
   duration, so this is the only thing that keeps the next block off it. */
const TL_MARKER_PX=38;

function tlSetDetailed(on){
  tbDetailed=!!on;
  /* The shared view is read-only in both directions: it renders someone
     else's trip and must not write anything into this browser's own
     saved state. It still gets the toggle, just not the memory of it. */
  if(appMode==='shared'){renderSharedTrip();return;}
  saveState();
  renderTripBuilder();
}

/* ── Setting a time ───────────────────────────────────────────────────
   The only times ever written are the ones typed here. Clearing the
   field removes the field rather than storing an empty string, so an
   item that has had a time and lost it is indistinguishable from one
   that never had one — which is what keeps old trips and new ones the
   same shape. A golf item's time is its tee time; a hotel's is its
   check-in; a flight's arrival is edited as part of the flight. */
function tlSetItemTime(dayId,itemId,v){
  if(appMode==='shared')return; // a shared trip is someone else's
  const d=tripDays.find(x=>x.id===dayId);if(!d)return;
  const it=tripDayItems(d).find(x=>x.id===itemId);if(!it)return;
  const mins=tlParseTime(v);
  if(mins==null)delete it.time;
  else it.time=tlFormatTime(mins);
  /* A stay's check-in belongs to the stay, not to one of its nights —
     the same rule tripDayUpdateStop() follows for name and price. */
  if(it.type==='hotel'&&it.stayId)
    tripDays.forEach(dd=>tripDayItems(dd).forEach(x=>{
      if(x.stayId!==it.stayId)return;
      if(mins==null)delete x.time; else x.time=it.time;
    }));
  saveState();
  renderTripBuilder();
}
function tlTimeFieldHTML(d,it,label){
  if(appMode==='shared')return'';
  return`<input type="time" class="tl-time" value="${esc(it.time||'')}"
    aria-label="${esc(label)}" title="${esc(label)} — everything after it follows from here. Clear it to let it float."
    onchange="tlSetItemTime(${d.id},'${esc(it.id)}',this.value)"
    onclick="event.stopPropagation()">`;
}

/* ── Drive minutes ────────────────────────────────────────────────────
   Taken from tripDayLegs(), not recomputed: that function already owns
   the day-first override (d.driveIn), the GOLF-118 ferry split and the
   frozen values a shared link carries instead of a live routing cache.
   Detailed mode showing a different number from the list view for the
   same leg would be a bug in itself.

   One known seam: legs are measured along the full stop chain, which
   includes the hotel, while the clock skips it (a hotel consumes no
   time, DEC-039). On a day that ends at the hotel — nearly all of them
   — the two agree. On a day with a stop *after* the hotel, the drive
   drawn into that stop is the one from the hotel, which is the number
   the list view shows too. */
function tlDriveMinsByItem(dayIdx){
  const by=new Map();
  let pending=0;
  (tripDayLegs(dayIdx)||[]).forEach(l=>{
    if(l.type==='drive'){pending=(l.mins==null?0:l.mins);return;}
    by.set(l.id,pending);
    pending=0;
  });
  return by;
}
function tlRowsForDay(dayIdx){
  const d=tripDays[dayIdx];
  if(!d)return[];
  const by=tlDriveMinsByItem(dayIdx);
  return tlComputeDay(tripDayItems(d),(_prev,it)=>by.get(it.id)||0);
}
/* The day on which each stay's first night falls — the only day that
   draws a check-in line (DEC-039). A one-night stay carries no stayId,
   so it is its own first night. */
function tlFirstNightItemIds(){
  const seen=new Set(),ids=new Set();
  tripDays.forEach(d=>{
    tripDayItems(d).forEach(it=>{
      if(it.type!=='hotel')return;
      /* stayId is the reliable key, but a share link doesn't carry one
         (the payload stores one hotel per day and nothing else), so the
         same inn on consecutive days would otherwise draw a check-in
         line every night. Fall back to the hotel's own identity. */
      const key=it.stayId||['n',it.name,it.lat,it.lng].join('|');
      if(seen.has(key))return;
      seen.add(key);
      ids.add(it.id);
    });
  });
  return ids;
}

/* ── One day ──────────────────────────────────────────────────────────
   The grid is an absolute-positioned layer over an hour ruler, because
   a CSS grid would have to quantise every block to a row and a 12:24
   tee time is the whole point of this view. */
function tlItemIcon(t){return t==='golf'?'⛳':t==='hotel'?'🏨':t==='flight'?'✈':'📍';}

function tlBlockLabelHTML(r){
  const it=r.item;
  if(it.type==='flight'){
    /* DEC-039: the departure is TEXT, never a block — a trip "only
       starts from arrival", and with time zones out of scope a
       depart→arrive bar would be drawn wrong as often as right. */
    const from=[it.flightNo,it.fromCode&&it.toCode?it.fromCode+'→'+it.toCode:''].filter(Boolean).join(' ');
    const dep=tlParseTime(it.depart)!=null?`dep ${esc(it.depart)}`:'';
    return`<span class="tl-block-name">${esc(tripItemName(it)||'Flight')}</span>
      ${from||dep?`<span class="tl-block-sub">${[esc(from),dep].filter(Boolean).join(' · ')}</span>`:''}`;
  }
  return`<span class="tl-block-name">${esc(tripItemName(it))}</span>`;
}
function tlDayGridHTML(d,dayIdx,firstNights){
  const rows=tlRowsForDay(dayIdx);
  const chain=rows.filter(r=>r.item&&r.item.type!=='hotel');
  const stays=rows.filter(r=>r.item&&r.item.type==='hotel');
  if(!rows.length)return'';
  const range=tlDayRange(chain);
  /* A day with nothing but a hotel has no clock to draw, only a strip. */
  if(!range)return tlStayStripHTML(d,stays,firstNights);
  /* ...but once there IS a clock, it has to reach the check-in line: an
     18:00 check-in after a round that ended at 16:54 would otherwise be
     set and then silently not drawn. */
  const firstStays=stays.filter(r=>firstNights.has(r.item.id));
  firstStays.forEach(r=>{
    range.startHour=Math.min(range.startHour,Math.floor(r.startMins/60));
    range.endHour=Math.max(range.endHour,Math.ceil(r.startMins/60));
  });

  const top=mins=>(mins-range.startHour*60)*TL_PX_PER_MIN;
  const hours=[];
  for(let h=range.startHour;h<=range.endHour;h++){
    hours.push(`<div class="tl-hour" style="top:${((h-range.startHour)*TL_PX_PER_HOUR).toFixed(1)}px">
      <span class="tl-hour-label">${tlFormatTime(h*60)}</span></div>`);
  }
  /* Drawn in order down a running cursor rather than each block
     independently at its own true offset. Three things have a floor
     height — a short stop, a short drive leg, and a marker, which has
     no duration at all — and at true offsets any of them can be written
     straight over the next thing down: a 10:55 arrival five minutes
     before an 11:00 tee was painted over completely by the round.
     Below the floor, then, the drawing stretches and every block still
     prints its own true time; above it, nothing moves. */
  let cursor=0;
  const blocks=chain.map(r=>{
    const parts=[];
    const driveH=r.driveMins>0?Math.max(TL_DRIVE_MIN_PX,r.driveMins*TL_PX_PER_MIN):0;
    const y=Math.max(top(r.startMins),cursor+driveH);
    if(driveH){
      /* Hung from the stop it arrives at, not drawn down from its own
         start: a short leg is held at the floor height, and a 9-minute
         drive drawn downwards would overlap the block it leads into by
         the difference. */
      parts.push(`<div class="tl-drive" style="top:${(y-driveH).toFixed(1)}px;height:${driveH.toFixed(1)}px"
        title="Drive into ${esc(tripItemName(r.item))}">🚗 ${esc(fmtDriveMinutes(r.driveMins))}</div>`);
    }
    /* A marker (a flight: no duration) is sized by its own text
       instead — it carries the flight number and departure on a second
       line, and a fixed height would cut that off. It still has to
       claim room from the cursor, though, or the next block starts on
       top of it; TL_MARKER_PX is what two lines of it come to. */
    const h=r.marker?null:Math.max(TL_MIN_BLOCK_PX,r.durationMins*TL_PX_PER_MIN);
    cursor=y+(h||TL_MARKER_PX);
    const cls=['tl-block','tl-block-'+(r.item.type||'poi')];
    if(r.marker)cls.push('is-marker');
    if(r.conflict)cls.push('is-conflict');
    /* A conflict is said in words, not just colour: the time stands as
       typed and the visitor is told they cannot make it (DEC-039). */
    const warn=r.conflict?`<span class="tl-warn" title="You'd arrive at ${tlFormatTime(r.conflict.arriveMins)}, after this ${
      tlFormatTime(r.conflict.fixedMins)} start.">⚠ arrive ${tlFormatTime(r.conflict.arriveMins)}</span>`:'';
    parts.push(`<div class="${cls.join(' ')}" style="top:${y.toFixed(1)}px${h?`;height:${h.toFixed(1)}px`:''}">
      <span class="tl-block-time">${tlFormatTime(r.startMins)}${r.fixed?'<span class="tl-pin" title="A time you set. Everything after it follows from here.">•</span>':''}</span>
      <span class="tl-block-body">${tlItemIcon(r.item.type)} ${tlBlockLabelHTML(r)}${warn}${
        r.item.type==='flight'?'':tlTimeFieldHTML(d,r.item,r.item.type==='golf'?'Tee time':'Start time')}</span>
    </div>`);
    return parts.join('');
  }).join('');
  /* The check-in line is a marker: it sits on the grid and pushes
     nothing (DEC-039). Drawn only on a stay's first night. */
  const checkins=firstStays.map(r=>`<div class="tl-checkin" style="top:${top(r.startMins).toFixed(1)}px">
      <span>🏨 check in ${tlFormatTime(r.startMins)}</span></div>`).join('');
  /* The ruler's own height, unless the stretching above has pushed the
     last block past the bottom of it. */
  const height=Math.max((range.endHour-range.startHour)*TL_PX_PER_HOUR,cursor);
  return`<div class="tl-grid" style="height:${height}px">${hours.join('')}${blocks}${checkins}</div>
    ${tlStayStripHTML(d,stays,firstNights)}`;
}
/* DEC-039: a stay is a strip along the bottom of the night it covers,
   not a timed block — you do not "spend" the evening before driving on,
   and drawing it as a block made every hotel look like a 12-hour
   commitment that pushed the next morning. */
function tlStayStripHTML(d,stays,firstNights){
  if(!stays.length)return'';
  return stays.map(r=>{
    const it=r.item;
    const n=Number(it.nights)>1?` · ${Number(it.nights)} nights`:'';
    const first=firstNights.has(it.id);
    /* Check-in is editable on the night it happens, and 15:00 until
       someone says otherwise (DEC-039) — a default, not a lookup: no
       check-in data exists anywhere in data/. */
    return`<div class="tl-stay">🏨 <b>${esc(tripItemName(it))}</b>${n}
      <span class="tl-stay-sub">${first?`check-in ${tlFormatTime(r.startMins)}`:'continuing stay'}</span>
      ${first?tlTimeFieldHTML(d,it,'Check-in time'):''}</div>`;
  }).join('');
}

/* ── The toggle ───────────────────────────────────────────────────────
   Shown on the Itinerary tab in both the live app and the read-only
   shared view: the recipient of a link gets the same two views the
   sender had. */
function tlViewToggleHTML(){
  const btn=(k,label,on,title)=>`<button type="button" class="tb-btn is-sm${on?' is-active':''}"
    aria-pressed="${on}" title="${title}" onclick="tlSetDetailed(${k})">${on?'✓ ':''}${label}</button>`;
  return`<div class="tl-viewswitch" role="group" aria-label="Itinerary view">
    ${btn('false','List',!tbDetailed,'The day as a list of stops.')}
    ${btn('true','Detailed',!!tbDetailed,'The day on an hour grid, with times worked out from the ones you set.')}
  </div>`;
}

/* ── Adding a flight ──────────────────────────────────────────────────
   DEC-039: flights are hand-typed. There is no flight data in this app
   and no API behind this form — a visitor copies the four facts off
   their booking (where they land, when, the number, where from) and
   that is the whole model.

   Picking the arrival airport off data/airports.js is what gives the
   item lat/lng, and therefore a drive leg to the first course, with no
   change to js/trip-geo.js: tripItemPoint() accepts any non-golf item
   carrying numeric coordinates. "Somewhere else" keeps the form honest
   for an airport outside the three countries the app covers — that
   flight is a time on the grid with no leg, exactly like a hand-typed
   hotel with no location.

   Deliberately kept out of trip-model.js's tbAddStop machinery: that
   form is a geocoder, a price and a night count, none of which a
   flight has. Sharing it would have meant four `type==='flight'`
   branches through code the default view depends on. */
let tlFlightDraft=null;
const TL_NATION_LABEL={gb:'Britain',ie:'Ireland',za:'South Africa'};
function tlAirportByCode(code){
  if(typeof AIRPORTS==='undefined'||!Array.isArray(AIRPORTS)||!code)return null;
  const c=String(code).trim().toUpperCase();
  return AIRPORTS.find(a=>a.iata===c)||null;
}
/* "Inverness (INV)", not OurAirports' own "Inverness Airport" or its
   `town` of "Inverness, Highland" — the first is redundant next to the
   ✈, and the second reads as the wrong place for the ones written the
   other way round ("Ingliston, Edinburgh"). The code is always kept, so
   the two Newcastles stay distinguishable. "City" is deliberately not
   stripped: London City is not London. */
function tlAirportLabel(a){
  const n=String(a.name||'')
    .replace(/\s*\b(International|Intl\.?|Regional|Municipal)?\s*Airport\b.*$/i,'')
    .replace(/\s*\bAirfield\b.*$/i,'').trim();
  return`${n||a.town||a.name} (${a.iata})`;
}
function tlPromptFlight(dayId){
  /* One form open at a time per day — the hotel/POI form is the other
     one, and it owns the map picker, so it yields to nothing. */
  tbAddStop=null;
  tlFlightDraft={dayId,itemId:null,toCode:'',name:'',flightNo:'',fromCode:'',
    depart:'',arrive:'',price:'',other:false};
  renderTripBuilder();
}
function tlEditFlight(dayId,itemId){
  const it=tripDayFindItem(dayId,itemId);
  if(!it||it.type!=='flight')return;
  tbAddStop=null;
  tlFlightDraft={dayId,itemId,toCode:it.toCode||'',name:it.name||'',
    flightNo:it.flightNo||'',fromCode:it.fromCode||'',
    depart:it.depart||'',arrive:it.arrive||'',
    price:it.price!=null?String(it.price):'',
    other:!tlAirportByCode(it.toCode)};
  renderTripBuilder();
}
function tlFlightCancel(){tlFlightDraft=null;renderTripBuilder();}
/* The airport <select> re-renders the form (to show or hide the
   free-text fields), so every other field has to be read back out of
   the DOM first or the visitor loses what they had typed. */
function tlFlightHarvest(){
  const s=tlFlightDraft;if(!s)return;
  const g=id=>{const el=document.getElementById(id);return el?el.value:null;};
  const to=g('tl-fl-to');
  if(to!==null){s.other=to==='*';if(!s.other)s.toCode=to;}
  ['name','flightNo','fromCode','depart','arrive','price'].forEach(k=>{
    const v=g('tl-fl-'+k.toLowerCase());
    if(v!==null)s[k]=v;
  });
  const oc=g('tl-fl-othercode');
  if(oc!==null)s.toCode=oc;
}
function tlFlightPickAirport(){tlFlightHarvest();renderTripBuilder();}
/* Writes only the fields that have a value, which is exactly what the
   GOLF-224 load whitelist keeps (js/state.js) — so a flight in memory
   and the same flight after a reload are the same object, and a
   re-save of an untouched trip moves no bytes. */
function tlFlightCommit(){
  tlFlightHarvest();
  const s=tlFlightDraft;if(!s)return;
  const ap=s.other?null:tlAirportByCode(s.toCode);
  const code=v=>String(v||'').trim().toUpperCase().slice(0,8);
  const name=(ap?tlAirportLabel(ap):String(s.name||'').trim()).slice(0,80);
  if(!name){
    const el=document.getElementById(s.other?'tl-fl-name':'tl-fl-to');
    if(el)el.focus();
    return;
  }
  const canonTime=v=>{const m=tlParseTime(v);return m==null?null:tlFormatTime(m);};
  const price=parseFloat(s.price);
  const fields={name};
  const fno=String(s.flightNo||'').trim().slice(0,12);if(fno)fields.flightNo=fno;
  const fc=code(s.fromCode);if(fc)fields.fromCode=fc;
  const tc=ap?ap.iata:code(s.toCode);if(tc)fields.toCode=tc;
  const dep=canonTime(s.depart);if(dep)fields.depart=dep;
  const arr=canonTime(s.arrive);if(arr)fields.arrive=arr;
  if(Number.isFinite(price))fields.price=price;
  if(ap){fields.lat=ap.lat;fields.lng=ap.lng;}
  const d=tripDays.find(x=>x.id===s.dayId);
  if(!d)return;
  if(s.itemId){
    const it=tripDayItems(d).find(x=>x.id===s.itemId);
    if(!it)return;
    /* Rebuilt rather than patched: clearing a field has to remove it,
       not leave the old value behind under a key the form no longer
       shows. The id and the item's position in d.items are what must
       survive, and both do. */
    Object.keys(it).forEach(k=>{if(k!=='id'&&k!=='type')delete it[k];});
    Object.assign(it,fields);
  }else{
    if(!Array.isArray(d.items))d.items=[];
    d.items.splice(tlFlightInsertAt(d,fields.arrive),0,
      Object.assign({id:tripItemNewId(),type:'flight'},fields));
  }
  tlFlightDraft=null;
  saveState();
  renderTripBuilder();
  tbDrawMap(false);
}
/* Where a new flight goes in the day's list. Every other stop is
   appended, and a flight appended after the round reads as "play, then
   drive to the airport, then land" — which the engine then correctly
   flags as a conflict, for a trip that is not what anyone typed.

   So it lands by its clock, against the times the visitor actually
   TYPED. A stop with no time of its own floats to wherever the chain
   puts it, so its computed start says nothing about whether it happens
   before the flight — only a fixed time does. Hence:

     · lands after everything planned → it ends the day (appended);
     · otherwise it goes before the first stop that isn't demonstrably
       earlier than it — i.e. the first one with no time set, or with a
       time set later than the landing.

   A morning arrival therefore goes to the top of the day, an evening
   one to the bottom, and a 10:55 landing on a day with a 09:00 tee time
   stays after that tee time, where the engine can tell the visitor the
   two don't fit. A flight with no time typed is appended like anything
   else. Positions are never adjusted again — dragging stays the way you
   change your mind. */
function tlFlightInsertAt(d,arrive){
  const items=tripDayItems(d);
  const mins=tlParseTime(arrive);
  if(mins==null)return items.length;
  const chain=tlRowsForDay(tripDays.indexOf(d)).filter(r=>r.item&&r.item.type!=='hotel');
  if(!chain.length)return items.length;
  if(mins>=Math.max(...chain.map(r=>r.endMins)))return items.length;
  for(let k=0;k<items.length;k++){
    if(items[k].type==='hotel')continue; // a stay is a strip, not a point in the day
    const fx=tlFixedStart(items[k]);
    if(fx==null||fx>mins)return k;
  }
  return items.length;
}
function tlFlightOptionsHTML(sel){
  if(typeof AIRPORTS==='undefined'||!Array.isArray(AIRPORTS))return'';
  return Object.keys(TL_NATION_LABEL).map(nat=>{
    const rows=AIRPORTS.filter(a=>a.nation===nat)
      .map(a=>({v:a.iata,l:tlAirportLabel(a)}))
      .sort((a,b)=>a.l.localeCompare(b.l));
    if(!rows.length)return'';
    return`<optgroup label="${esc(TL_NATION_LABEL[nat])}">${rows.map(r=>
      `<option value="${esc(r.v)}"${r.v===sel?' selected':''}>${esc(r.l)}</option>`).join('')}</optgroup>`;
  }).join('');
}
function tlFlightFormHTML(dayId){
  if(!tlFlightDraft||tlFlightDraft.dayId!==dayId)return'';
  /* The hotel/POI form takes the day's one form slot when both are
     somehow open — it is the one with a map picker behind it. The
     flight draft is kept, not dropped, so cancelling that form brings
     this one back as it was. */
  if(typeof tbAddStop!=='undefined'&&tbAddStop&&tbAddStop.dayId===dayId)return'';
  const s=tlFlightDraft;
  const dayObj=tripDays.find(d=>d.id===dayId);
  const cur=curSym(typeof tripStayCurrency==='function'?tripStayCurrency(dayObj,s):'GBP');
  const gs=groupSizeFor();
  const priceNum=parseFloat(s.price);
  return`<div class="tb-addstop">
    <div class="tb-addstop-title">${s.itemId?'Edit this flight':'Add a flight'}</div>
    <label class="tl-fl-label" for="tl-fl-to">Flying into</label>
    <select class="tb-field" id="tl-fl-to" onchange="tlFlightPickAirport()"
      title="Picking a listed airport gives the flight its location, so the drive from the airport to your first stop is worked out for you.">
      ${/* An empty first option, or the select opens pre-set to the first
           airport alphabetically and a visitor who never touches it gets
           a flight to Aberdeen. Add is refused while it is chosen. */''}
      <option value=""${!s.other&&!tlAirportByCode(s.toCode)?' selected':''}>Pick an airport…</option>
      ${tlFlightOptionsHTML(s.other?'':s.toCode)}
      <option value="*"${s.other?' selected':''}>Somewhere else — type it</option>
    </select>
    ${s.other?`<div class="tb-addstop-row">
      <input class="tb-field" type="text" id="tl-fl-name" maxlength="80"
        placeholder="Airport, e.g. Faro" value="${esc(s.name)}">
      <input class="tb-field" type="text" id="tl-fl-othercode" maxlength="8"
        placeholder="Code" value="${esc(s.toCode)}" style="max-width:88px">
    </div>
    <p class="hint" style="margin:var(--sp-2) 0 0">No drive time can be worked out from an airport that isn't on the list.</p>`:''}
    <div class="tb-addstop-row">
      <input class="tb-field" type="text" id="tl-fl-flightno" maxlength="12"
        placeholder="Flight no — optional" value="${esc(s.flightNo)}">
      <input class="tb-field" type="text" id="tl-fl-fromcode" maxlength="8"
        placeholder="From" title="The airport you fly out of — shown as text on the flight, since it happens before the trip starts." value="${esc(s.fromCode)}" style="max-width:88px">
    </div>
    ${/* DEC-039: the trip starts from the arrival, so the landing time
         is the one the rest of the day hangs off. A flight with no
         landing time still records the booking; it just floats to the
         start of the day like any untimed stop. */''}
    <div class="tb-addstop-row">
      <label class="tl-fl-label" for="tl-fl-depart">Departs</label>
      <input class="tb-field tl-time" type="time" id="tl-fl-depart" value="${esc(s.depart)}">
      <label class="tl-fl-label" for="tl-fl-arrive">Lands</label>
      <input class="tb-field tl-time" type="time" id="tl-fl-arrive" value="${esc(s.arrive)}">
    </div>
    <div class="tb-addstop-row">
      <input class="tb-field" type="number" id="tl-fl-price" min="0" step="5"
        placeholder="${cur} per person — optional" value="${esc(s.price)}">
    </div>
    ${gs>1&&Number.isFinite(priceNum)?`<p class="hint" style="margin:var(--sp-2) 0 0">${cur}${priceNum.toFixed(0)} × ${gs} people = <b>${cur}${(priceNum*gs).toFixed(0)}</b>.</p>`:''}
    <div class="tb-addstop-row" style="margin-top:var(--sp-2)">
      <button class="tb-btn is-primary" onclick="tlFlightCommit()">${s.itemId?'Save':'Add'}</button>
      <button class="tb-btn is-quiet" onclick="tlFlightCancel()">Cancel</button>
    </div>
  </div>`;
}
/* The list view's own line for a flight (js/trip-add.js calls this):
   the same facts the grid shows, without the clock. */
function tlFlightListMetaHTML(it){
  const bits=[];
  if(it.flightNo)bits.push(esc(it.flightNo));
  if(it.fromCode&&it.toCode)bits.push(esc(it.fromCode)+'→'+esc(it.toCode));
  else if(it.toCode)bits.push('to '+esc(it.toCode));
  if(it.arrive)bits.push('lands '+esc(it.arrive));
  else if(it.depart)bits.push('departs '+esc(it.depart));
  return`<div class="cart-region">${bits.length?bits.join(' · '):'Flight'}</div>`;
}
