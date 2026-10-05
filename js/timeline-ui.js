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
  const blocks=chain.map(r=>{
    const parts=[];
    if(r.driveMins>0){
      /* Hung from the stop it arrives at, not drawn down from its own
         start: a short leg is held at the floor height, and a 9-minute
         drive drawn downwards would overlap the block it leads into by
         the difference. */
      const h=Math.max(TL_DRIVE_MIN_PX,r.driveMins*TL_PX_PER_MIN);
      parts.push(`<div class="tl-drive" style="top:${(top(r.startMins)-h).toFixed(1)}px;height:${h.toFixed(1)}px"
        title="Drive into ${esc(tripItemName(r.item))}">🚗 ${esc(fmtDriveMinutes(r.driveMins))}</div>`);
    }
    /* A marker (a flight: no duration) is sized by its own text
       instead — it carries the flight number and departure on a second
       line, and a fixed height would cut that off. */
    const h=r.marker?null:Math.max(TL_MIN_BLOCK_PX,r.durationMins*TL_PX_PER_MIN);
    const cls=['tl-block','tl-block-'+(r.item.type||'poi')];
    if(r.marker)cls.push('is-marker');
    if(r.conflict)cls.push('is-conflict');
    /* A conflict is said in words, not just colour: the time stands as
       typed and the visitor is told they cannot make it (DEC-039). */
    const warn=r.conflict?`<span class="tl-warn" title="You'd arrive at ${tlFormatTime(r.conflict.arriveMins)}, after this ${
      tlFormatTime(r.conflict.fixedMins)} start.">⚠ arrive ${tlFormatTime(r.conflict.arriveMins)}</span>`:'';
    parts.push(`<div class="${cls.join(' ')}" style="top:${top(r.startMins).toFixed(1)}px${h?`;height:${h.toFixed(1)}px`:''}">
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
  const height=(range.endHour-range.startHour)*TL_PX_PER_HOUR;
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
