/* ════════════════════════════════════════════════════════════════════
   GOLF-153 — detailed mode: the day as a calendar (DEC-039)

   js/timeline.js does the arithmetic; everything here is presentation,
   so the two can be wrong independently and only one of them needs a
   browser to check.

   Nothing in this file runs unless the visitor turns Detailed on. The
   default itinerary is rendered by exactly the code that rendered it
   before (tbDayCardHTML / tbItinAllHTML) — the toggle swaps the rows
   inside a day card, and leaves the card, its menu, its stay slot and
   its add controls alone.

   DEC-039's owner review (2026-10-05) asked for a calendar rather than a
   printed schedule, which is four things:
     · the day is a scrollable hour timeline, all 24 hours of it, so
       nothing can be off the end of the view;
     · right-click (long-press on a phone) an empty slot and you add
       something AT that time;
     · a block is dragged to move it and its edges are dragged to
       resize it — the defaults are a starting point, not a verdict;
     · clicking a block opens its details, which is where its time, its
       length, its buffer and its note are edited.
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
const TL_MARKER_PX=46;
/* A buffer is drawn as a hatched band in front of its block. 12px is the
   floor: below that it is a hint rather than a band. */
const TL_BUFFER_MIN_PX=12;
/* Long-press, for a phone with no right-click. Deliberately the same
   half-second GOLF-215 uses, so the two gestures feel like one. */
const TL_PRESS_MS=500;
const TL_PRESS_SLOP=8;
/* The calendar is the whole day now (owner review): 24 hours, always, so
   an 06:40 flight and a 23:30 check-in are both reachable by scrolling
   rather than conjured into existence by the contents of the day. The
   grid is 1344px tall and lives in its own scroller. */
const TL_DAY_HOURS=24;
/* How far a block's top or bottom edge reaches as a resize handle. 10px
   is two things at once: a comfortable mouse target, and small enough
   that the middle of even a TL_MIN_BLOCK_PX block is still a move. */
const TL_EDGE_PX=10;
/* A mouse has to travel this far before a press becomes a drag, so a
   plain click still opens the details panel. A finger uses the hold
   instead (TL_PRESS_MS), exactly as GOLF-215's reordering does. */
const TL_DRAG_SLOP=4;
/* Nothing can be shorter than one snap step. */
const TL_MIN_DUR=TL_SNAP_MINS;

function tlSetDetailed(on){
  tbDetailed=!!on;
  /* Switching view throws away whatever was open in the other one: a
     details panel or an add form for a block you can no longer see is a
     panel nobody can close. */
  tlPanel=null;tlDraft=null;tlMenuClose();
  /* The shared view is read-only in both directions: it renders someone
     else's trip and must not write anything into this browser's own
     saved state. It still gets the toggle, just not the memory of it. */
  if(appMode==='shared'){renderSharedTrip();return;}
  saveState();
  renderTripBuilder();
}

/* ── What each kind of block is ───────────────────────────────────────
   One table, read by the grid, the add menu, the forms and the details
   panel alike, so a new kind of block is described once.

     label    what the add menu and the form call it
     icon     the one icon vocabulary, shared with the list rows
     place    the form offers a place search (and so a drive leg)
     price    the form offers a price
     resize   the block's length is the visitor's to drag. A flight and a
              train are sized by the two times they were typed with, so
              dragging their edges would be editing one of those times
              from the wrong end; they move, and their length follows
              their own fields.
     legTimes the form asks for a departure and an arrival rather than a
              start and a length. */
const TL_KINDS={
  flight:{label:'Flight',icon:'✈',place:false,price:true,resize:false,legTimes:true},
  train:{label:'Train',icon:'🚆',place:false,price:true,resize:false,legTimes:true},
  drivefrom:{label:'Drive from another place',icon:'🚗',place:true,price:false,resize:false,legTimes:false},
  activity:{label:'Activity',icon:'📌',place:true,price:true,resize:true,legTimes:false},
  golf:{label:'Round',icon:'⛳',place:false,price:true,resize:true,legTimes:false},
  poi:{label:'Stop',icon:'📍',place:true,price:true,resize:true,legTimes:false},
  hotel:{label:'Stay',icon:'🏨',place:true,price:true,resize:false,legTimes:false}
};
function tlKind(t){return TL_KINDS[t]||TL_KINDS.poi;}
function tlItemIcon(t){return tlKind(t).icon;}
/* The three kinds the calendar's own add menu offers to create, plus the
   flight it already offered. Order is the owner's: flight, train, drive,
   activity. */
const TL_ADD_KINDS=['flight','train','drivefrom','activity'];

/* ── Writing a time ───────────────────────────────────────────────────
   The only times ever written are the ones a visitor set — typed into
   the details panel, or landed by dragging a block. Clearing the field
   removes the field rather than storing an empty string, so an item that
   has had a time and lost it is indistinguishable from one that never
   had one — which is what keeps old trips and new ones the same shape.

   A golf item's time is its tee time; a hotel's is its check-in; a
   flight's and a train's two times are edited as the leg they are. */
function tlSetItemTime(dayId,itemId,v){
  if(appMode==='shared')return; // a shared trip is someone else's
  const d=tripDays.find(x=>x.id===dayId);if(!d)return;
  const it=tripDayItems(d).find(x=>x.id===itemId);if(!it)return;
  const mins=tlParseTime(v);
  if(TL_TIMED_LEG[it.type]){
    /* A leg's "time" is its departure, and moving it keeps the journey
       the length it was — shifting one end of a flight and not the other
       would silently re-time the landing. */
    if(mins!=null)tlShiftLeg(it,mins);
    return tlAfterEdit(d,it,mins);
  }
  if(mins==null)delete it.time;
  else it.time=tlFormatTime(mins);
  /* A stay's check-in belongs to the stay, not to one of its nights —
     the same rule tripDayUpdateStop() follows for name and price. */
  if(it.type==='hotel'&&it.stayId)
    tripDays.forEach(dd=>tripDayItems(dd).forEach(x=>{
      if(x.stayId!==it.stayId)return;
      if(mins==null)delete x.time; else x.time=it.time;
    }));
  tlAfterEdit(d,it,mins);
}
/* Move a flight or a train to a new departure, carrying its arrival with
   it. A leg with only one of the two times set just gets that one. */
function tlShiftLeg(it,mins){
  const dep=tlParseTime(it.depart),arr=tlParseTime(it.arrive);
  if(dep!=null&&arr!=null){
    it.depart=tlFormatTime(mins);
    it.arrive=tlFormatTime(mins+(arr-dep));
    return;
  }
  if(dep!=null||arr==null)it.depart=tlFormatTime(mins);
  else it.arrive=tlFormatTime(mins);
}
/* Shared tail of every edit that changes a time: a hotel stays where it
   is (it is a strip, not a point in the day), and everything else is
   re-seated in items[] by the clock, so the order the engine walks
   matches the order the eye reads. Then save and redraw. */
function tlAfterEdit(d,it,mins){
  if(mins!=null&&it.type!=='hotel')tlReseat(d,it,mins);
  saveState();
  renderTripBuilder();
}
/* Where an item belongs in a day's items[] for it to start at `mins`.
   The engine walks items[] in order with a monotonic cursor, so an item
   whose fixed time is earlier than the one before it reads as "you can't
   get there in time" — true when a drive is too long, nonsense when the
   visitor has just dragged a block up past another. Re-seating is what
   keeps those two apart.

   Position is judged against what the day CURRENTLY shows (computed
   starts, not only typed ones), because that is what the visitor was
   looking at when they dropped the block. */
function tlReseat(d,it,mins){
  const items=tripDayItems(d);
  const at=items.indexOf(it);
  if(at<0)return;
  items.splice(at,1);
  items.splice(tlInsertAtTime(d,mins),0,it);
}
/* The index in d.items at which something starting at `mins` goes: just
   after the last block in the day that starts no later than it.

   Hotels are skipped, because a stay is a strip along the night rather
   than a point the day passes through — and "skipped" has to mean
   "stepped over", not "ignored": landing AFTER a trailing hotel would
   put the hotel above the round in the list view, which is a visible
   change to a view DEC-039 keeps as it was. */
function tlInsertAtTime(d,mins){
  const items=tripDayItems(d);
  if(mins==null)return items.length;
  const rows=tlComputeDay(items,()=>0,{inboundFlightId:tlInboundFlightId(tripDays)});
  let at=0;
  rows.forEach((r,i)=>{
    if(!r.item||r.item.type==='hotel')return;
    if(r.startMins<=mins)at=i+1;
  });
  return Math.min(items.length,at);
}

/* ── Drive minutes ────────────────────────────────────────────────────
   Taken from tripDayLegs(), not recomputed: that function already owns
   the day-first override (d.driveIn), the GOLF-118 ferry split and the
   frozen values a shared link carries instead of a live routing cache.
   Detailed mode showing a different number from the list view for the
   same leg would be a bug in itself. */
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
/* DEC-039 (owner review): last night's hotel is the first point of the
   day's chain, so the morning drive from it is shown and timed. The
   NUMBER already exists — tripDayLegs() measures the day's first leg
   from the previous day's last stop, which on nearly every day is that
   hotel — it was simply being discarded by the engine for the first item
   of a day. This is what hands it over.

   Skipped when the day opens with a "drive from another place": that
   block exists precisely to say the day did not start where the trip
   slept, and drawing a leg into it from the hotel would contradict it. */
function tlInboundDriveMins(dayIdx,by){
  const d=tripDays[dayIdx];
  if(!d)return 0;
  const first=tripDayItems(d).find(it=>tlInChain(it));
  if(!first||first.type==='drivefrom')return 0;
  return by.get(first.id)||0;
}
/* Where that drive comes from, in words, for the leg's tooltip: the last
   located stop of the day before. Null when there isn't one. */
function tlInboundOriginName(dayIdx){
  for(let k=dayIdx-1;k>=0;k--){
    const items=tripDayItems(tripDays[k]).filter(it=>tripItemPoint(it));
    if(items.length)return tripItemName(items[items.length-1])||null;
  }
  return null;
}
function tlRowsForDay(dayIdx){
  const d=tripDays[dayIdx];
  if(!d)return[];
  const by=tlDriveMinsByItem(dayIdx);
  /* GOLF-153: which flight is arrival-only is a property of the whole
     trip, not of this day, so it is worked out across tripDays and
     handed in. */
  return tlComputeDay(tripDayItems(d),(_prev,it)=>by.get(it.id)||0,
    {inboundFlightId:tlInboundFlightId(tripDays),
     inboundDriveMins:tlInboundDriveMins(dayIdx,by)});
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
   tee time is the whole point of this view. The ruler is the full 24
   hours and the grid lives in its own scroller, which is what makes the
   whole day reachable on a phone as well as a desktop. */
function tlBlockLabelHTML(r){
  const it=r.item;
  /* Every note is the visitor's own text, so it is escaped here like
     every other string that reaches the DOM, and held to one line on the
     grid with the whole of it in the title. */
  const note=it.note?`<span class="tl-note-line" title="${esc(it.note)}">📝 ${esc(it.note)}</span>`:'';
  if(TL_TIMED_LEG[it.type]){
    /* A leg you are ON is drawn from its departure to its arrival, so
       the second line says when it LANDS (or pulls in) — the block's own
       time is already the departure. The inbound flight is a marker at
       its landing instead, and shows its departure as text, because
       nothing on this trip happened before it. */
    const route=it.type==='flight'
      ?[it.flightNo,it.fromCode&&it.toCode?it.fromCode+'→'+it.toCode:''].filter(Boolean).join(' ')
      :(it.fromName?'from '+it.fromName:'');
    const when=r.durationMins>0
      ?(tlParseTime(it.arrive)!=null?`${it.type==='flight'?'lands':'arrives'} ${it.arrive}`:'')
      :(tlParseTime(it.depart)!=null?`dep ${it.depart}`:'');
    return`<span class="tl-block-name">${esc(tripItemName(it)||tlKind(it.type).label)}</span>
      ${route||when?`<span class="tl-block-sub">${[esc(route),esc(when)].filter(Boolean).join(' · ')}</span>`:''}${note}`;
  }
  if(it.type==='drivefrom')
    return`<span class="tl-block-name">${esc(tripItemName(it)||'Start point')}</span>
      <span class="tl-block-sub">you set off from here</span>${note}`;
  return`<span class="tl-block-name">${esc(tripItemName(it))}</span>${note}`;
}
function tlDayGridHTML(d,dayIdx,firstNights){
  const rows=tlRowsForDay(dayIdx);
  const chain=rows.filter(r=>r.item&&r.item.type!=='hotel');
  const stays=rows.filter(r=>r.item&&r.item.type==='hotel');
  const ro=appMode==='shared';
  /* The grid goes out even for an empty day: right-clicking it is how
     the first thing of the day gets added, so there has to be something
     to right-click. A read-only shared day with nothing in it has
     nothing to offer and is left as it was. */
  if(!rows.length&&ro)return'';

  const top=mins=>mins*TL_PX_PER_MIN;
  const hours=[];
  for(let h=0;h<=TL_DAY_HOURS;h++){
    hours.push(`<div class="tl-hour" style="top:${(h*TL_PX_PER_HOUR).toFixed(1)}px">
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
  const originName=tlInboundOriginName(dayIdx);
  const blocks=chain.map((r,ri)=>{
    const parts=[];
    const driveH=r.driveMins>0?Math.max(TL_DRIVE_MIN_PX,r.driveMins*TL_PX_PER_MIN):0;
    /* DEC-039: the arrival buffer — the time before a fixed start that
       you have to be there by. Drawn between the drive and the block,
       because that is the order it happens in, and because it is what
       the drive is now judged against. */
    const bufH=r.bufferMins>0?Math.max(TL_BUFFER_MIN_PX,r.bufferMins*TL_PX_PER_MIN):0;
    const y=Math.max(top(r.startMins),cursor+driveH+bufH);
    if(driveH){
      /* Hung from the stop it arrives at, not drawn down from its own
         start: a short leg is held at the floor height, and a 9-minute
         drive drawn downwards would overlap the block it leads into by
         the difference. */
      const from=(ri===0&&originName)?` from ${originName}`:'';
      parts.push(`<div class="tl-drive" style="top:${(y-bufH-driveH).toFixed(1)}px;height:${driveH.toFixed(1)}px"
        title="Drive${esc(from)} to ${esc(tripItemName(r.item))}. Computed, so it can't be dragged.">🚗 ${esc(fmtDriveMinutes(r.driveMins))}${from?` <span class="tl-drive-from">${esc(from.trim())}</span>`:''}</div>`);
    }
    if(bufH){
      parts.push(`<div class="tl-buffer" style="top:${(y-bufH).toFixed(1)}px;height:${bufH.toFixed(1)}px"
        title="Be here by ${tlFormatTime(r.readyMins)} — ${esc(fmtDriveMinutes(r.bufferMins))} before it starts. The drive has to land by then, not by ${tlFormatTime(r.startMins)}."></div>`);
    }
    /* A marker (no duration) is sized by its own text instead — it
       carries a second line, and a fixed height would cut that off. It
       still has to claim room from the cursor, though, or the next block
       starts on top of it; TL_MARKER_PX is what two lines of it come
       to. */
    const h=r.marker?null:Math.max(TL_MIN_BLOCK_PX,r.durationMins*TL_PX_PER_MIN);
    cursor=y+(h||TL_MARKER_PX);
    const kind=tlKind(r.item.type);
    const cls=['tl-block','tl-block-'+(r.item.type||'poi')];
    if(r.marker)cls.push('is-marker');
    if(r.conflict)cls.push('is-conflict');
    if(!ro)cls.push('is-live');
    if(tlPanel&&tlPanel.dayId===d.id&&tlPanel.itemId===r.item.id)cls.push('is-open');
    /* A conflict is said in words, not just colour: the time stands as
       typed and the visitor is told they cannot make it (DEC-039). */
    const warn=r.conflict?`<span class="tl-warn" title="You'd arrive at ${tlFormatTime(r.conflict.arriveMins)}, and you need to be here by ${
      tlFormatTime(r.conflict.dueMins)} for a ${tlFormatTime(r.conflict.fixedMins)} start.">⚠ arrive ${tlFormatTime(r.conflict.arriveMins)}</span>`:'';
    /* DEC-039 asks for this in words on the block, not only as the band
       in front of it: for a 10:00 tee, "Arrive by 09:15". */
    const ready=r.bufferMins>0
      ?`<span class="tl-block-ready" title="${esc(fmtDriveMinutes(r.bufferMins))} before it starts.">Arrive by ${tlFormatTime(r.readyMins)}</span>`:'';
    /* The drag contract travels on the element: everything the pointer
       handlers need to turn a y delta into a new time is here, so they
       never have to look the item up in the model mid-gesture. */
    const dragAttrs=ro?'':` data-tldrag="1" data-tlstart="${r.startMins}" data-tldur="${r.durationMins}"${
      kind.resize?' data-tlresize="1"':''}`;
    parts.push(`<div class="${cls.join(' ')}" style="top:${y.toFixed(1)}px${h?`;height:${h.toFixed(1)}px`:''}"
      data-tlblock="1" data-tlday="${d.id}" data-tlitem="${esc(r.item.id)}"${dragAttrs}
      title="${ro?'':esc(tlBlockHint(r,kind))}">
      <span class="tl-block-time">${tlFormatTime(r.startMins)}${r.fixed?'<span class="tl-pin" title="A time you set. Everything after it follows from here.">•</span>':''}</span>
      <span class="tl-block-body">${kind.icon} ${tlBlockLabelHTML(r)}${ready}${warn}</span>
      ${kind.resize&&!ro?'<span class="tl-handle tl-handle-t" aria-hidden="true"></span><span class="tl-handle tl-handle-b" aria-hidden="true"></span>':''}
    </div>`);
    return parts.join('');
  }).join('');
  /* The check-in line is a marker: it sits on the grid and pushes
     nothing (DEC-039). Drawn only on a stay's first night. */
  const checkins=stays.filter(r=>firstNights.has(r.item.id))
    .map(r=>`<div class="tl-checkin" style="top:${top(r.startMins).toFixed(1)}px">
      <span>🏨 check in ${tlFormatTime(r.startMins)}</span></div>`).join('');
  /* The ruler's own height, unless the stretching above has pushed the
     last block past the bottom of it. */
  const height=Math.max(TL_DAY_HOURS*TL_PX_PER_HOUR,cursor);
  /* Where the scroller opens: a little before the first thing in the
     day, so a day that starts at 09:00 doesn't open on an empty 00:00.
     tlAfterRender() applies it, and only when the visitor hasn't already
     scrolled this day themselves. */
  const range=tlDayRange(rows);
  const focus=Math.max(0,((range?range.startHour:9)*TL_PX_PER_HOUR)-8);
  return`<div class="tl-scroll" data-tlscroll="${d.id}" data-tlfocus="${focus.toFixed(0)}"
      tabindex="0" aria-label="Day ${dayIdx+1} timeline">
    <div class="tl-grid" style="height:${height}px"
      data-tlgap="1" data-tlday="${d.id}"
      oncontextmenu="return tlGapContext(event,${d.id})">${hours.join('')}${blocks}${checkins}</div>
  </div>
  ${ro?'':`<p class="hint tl-howto">Right-click an empty slot to add a flight, train, drive or activity${
      ''} · drag a block to move it, its edges to resize it · click it for its details.<span class="tl-howto-touch"> On a phone: hold an empty slot to add, hold a block then drag to move.</span></p>`}
  ${tlStayStripHTML(d,dayIdx,stays,firstNights)}
  ${tlPanelHTML(d)}`;
}
function tlBlockHint(r,kind){
  const bits=[];
  if(kind.resize)bits.push('Drag to move, drag an edge to resize');
  else bits.push('Drag to move');
  bits.push('click for details');
  return bits.join(' · ')+'.';
}

/* DEC-039: a stay is a strip along the bottom of the night it covers,
   not a timed block — you do not "spend" the evening before driving on,
   and drawing it as a block made every hotel look like a 12-hour
   commitment that pushed the next morning. */
function tlStayStripHTML(d,dayIdx,stays,firstNights){
  if(!stays.length)return'';
  /* Whether tomorrow is actually driven from here (DEC-039, owner
     review). On the last night of the trip there is no tomorrow, and a
     day that opens with a "drive from another place" is saying in so
     many words that it did not start where the trip slept. */
  const next=tripDays[dayIdx+1];
  const nextFirst=next&&tripDayItems(next).find(it=>tlInChain(it));
  const drivesOn=!!nextFirst&&nextFirst.type!=='drivefrom';
  return stays.map(r=>{
    const it=r.item;
    const n=Number(it.nights)>1?` · ${Number(it.nights)} nights`:'';
    const first=firstNights.has(it.id);
    /* Check-in is editable on the night it happens, and 15:00 until
       someone says otherwise (DEC-039) — a default, not a lookup: no
       check-in data exists anywhere in data/. */
    return`<div class="tl-stay">🏨 <b>${esc(tripItemName(it))}</b>${n}
      <span class="tl-stay-sub">${first?`check-in ${tlFormatTime(r.startMins)}`:'continuing stay'}</span>
      ${first?tlTimeFieldHTML(d,it,'Check-in time'):''}
      ${/* The stay is where the next morning is driven from, which is
           worth saying once where the hotel is, rather than leaving the
           drive at the top of tomorrow to explain itself. */''}
      ${drivesOn?`<span class="tl-stay-sub">tomorrow's first drive starts here</span>`:''}</div>`;
  }).join('');
}
function tlTimeFieldHTML(d,it,label){
  if(appMode==='shared')return'';
  return`<input type="time" class="tl-time" value="${esc(it.time||'')}"
    aria-label="${esc(label)}" title="${esc(label)} — everything after it follows from here. Clear it to let it float."
    onchange="tlSetItemTime(${d.id},'${esc(it.id)}',this.value)"
    onclick="event.stopPropagation()">`;
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
    ${btn('true','Calendar',!!tbDetailed,'The day on an hour grid you can drag things around on.')}
  </div>`;
}

/* ── The details panel (DEC-039, owner review) ────────────────────────
   Clicking a block opens this, and this is where a note lives now — the
   day note is gone, and so is the right-click-to-write-a-note gesture
   that used to be the only way in. Four fields, the same four for every
   kind of block: when it starts, how long it is, how early you have to
   be there, and whatever you want to remember about it.

   Anything else about the block — a train's two stations, an activity's
   place and price — is its own form, one button away, because those
   fields differ per kind and this panel deliberately does not. */
let tlPanel=null;
function tlOpenPanel(dayId,itemId){
  if(appMode==='shared')return;
  tlPanel=(tlPanel&&tlPanel.dayId===dayId&&tlPanel.itemId===itemId)?null:{dayId,itemId};
  tlDraft=null;
  renderTripBuilder();
}
function tlClosePanel(){tlPanel=null;renderTripBuilder();}
function tlPanelHTML(d){
  if(appMode==='shared'||!tlPanel||tlPanel.dayId!==d.id)return'';
  const dayIdx=tripDays.indexOf(d);
  const row=tlRowsForDay(dayIdx).find(r=>r.item&&r.item.id===tlPanel.itemId);
  if(!row)return'';
  const it=row.item,kind=tlKind(it.type);
  const leg=!!TL_TIMED_LEG[it.type];
  const q=v=>`'${esc(String(v))}'`;
  const set=(fn,extra)=>`${fn}(${d.id},${q(it.id)},this.value${extra||''})`;
  /* A golf block's length and a flight's times are the two cases where
     the field has to explain itself: a round is 5 hours until you say
     otherwise, and a leg's length is the gap between its own two times
     rather than anything editable here. */
  const durField=kind.resize
    ?`<label class="tl-f"><span>Length</span>
        <input type="number" class="tl-field" min="${TL_MIN_DUR}" max="1440" step="5"
          value="${esc(it.durationMins!=null?String(it.durationMins):'')}"
          placeholder="${TL_DEFAULT_MINS[it.type]||0}"
          title="Minutes. Clear it for the usual ${TL_DEFAULT_MINS[it.type]||0}."
          onchange="${set('tlSetItemDuration')}"></label>`
    :`<label class="tl-f"><span>Length</span>
        <span class="tl-f-static" title="${leg?'The gap between the two times you typed — change those, not this.':'This block has no length: it marks a moment.'}">${
          leg?(row.durationMins>0?esc(fmtDriveMinutes(row.durationMins)):'—'):'a moment'}</span></label>`;
  return`<div class="tl-panel" role="group" aria-label="Details">
    <div class="tl-panel-head">
      <span class="tl-panel-title">${kind.icon} ${esc(tripItemName(it)||kind.label)}</span>
      <button type="button" class="tl-notebtn" onclick="tlClosePanel()" aria-label="Close details">✕</button>
    </div>
    <div class="tl-panel-grid">
      <label class="tl-f"><span>${leg?(it.type==='flight'?'Departs':'Leaves'):'Starts'}</span>
        <input type="time" class="tl-time" value="${esc(leg?(it.depart||''):(it.time||''))}"
          title="${leg?'The time you leave. The arrival moves with it, keeping the journey the length it is.':'A time you set. Everything after it follows from here; clear it to let it float.'}"
          onchange="${set('tlSetItemTime')}"></label>
      ${durField}
      ${leg?`<label class="tl-f"><span>${it.type==='flight'?'Lands':'Arrives'}</span>
        <input type="time" class="tl-time" value="${esc(it.arrive||'')}"
          title="When it gets in. This is what makes the block as long as it is."
          onchange="tlSetLegArrive(${d.id},${q(it.id)},this.value)"></label>`:''}
      <label class="tl-f"><span>Be there</span>
        <input type="number" class="tl-field" min="0" max="1440" step="5"
          value="${esc(it.bufferMins!=null?String(it.bufferMins):'')}"
          placeholder="${TL_DEFAULT_BUFFER[it.type]||0}"
          title="Minutes before it starts that you have to be there. The drive has to land by then. Clear it for the usual ${TL_DEFAULT_BUFFER[it.type]||0}."
          onchange="${set('tlSetItemBuffer')}"></label>
    </div>
    <label class="tl-f tl-f-wide"><span>Note</span>
      <textarea class="tl-field tl-note-field" rows="2" maxlength="${TL_NOTE_MAX}"
        placeholder="Anything worth remembering — ${TL_NOTE_MAX} characters."
        onchange="tlSetItemNote(${d.id},${q(it.id)},this.value)">${esc(it.note||'')}</textarea></label>
    <div class="tl-panel-actions">
      ${tlPanelEditBtnHTML(d,it)}
      <button type="button" class="tb-btn is-sm is-quiet is-danger"
        onclick="tlRemoveFromPanel(${d.id},${q(it.id)})">🗑 Remove</button>
    </div>
  </div>`;
}
/* The one button that leads out of the panel and into the kind's own
   form. A round has none — everything about a round comes from the
   course dataset, exactly as tripDayUpdateStop() has always had it. */
function tlPanelEditBtnHTML(d,it){
  const q=v=>`'${esc(String(v))}'`;
  if(it.type==='golf')return'';
  const fn=it.type==='flight'?`tlEditFlight(${d.id},${q(it.id)})`
    :TL_KINDS[it.type]&&(it.type==='train'||it.type==='drivefrom'||it.type==='activity')
      ?`tlEditBlock(${d.id},${q(it.id)})`
      :`tbEditStop(${d.id},${q(it.id)})`;
  return`<button type="button" class="tb-btn is-sm" onclick="${fn}">✎ Edit the rest</button>`;
}
function tlRemoveFromPanel(dayId,itemId){
  if(appMode==='shared')return;
  tlPanel=null;
  tripRemoveItem(dayId,itemId);
  renderTripBuilder();
  tbDrawMap(false);
}
function tlSetItemDuration(dayId,itemId,v){
  if(appMode==='shared')return;
  const it=tripDayFindItem(dayId,itemId);if(!it)return;
  const n=parseInt(v,10);
  if(!Number.isFinite(n)||n<TL_MIN_DUR)delete it.durationMins;  // back to the default
  else it.durationMins=Math.min(1440,n);
  saveState();
  renderTripBuilder();
}
/* DEC-039: the buffer is editable, in minutes, and empty means "the
   default for this kind of thing" rather than zero — clearing it has to
   give you the 45 or the 120 back, not take the buffer away. */
function tlSetItemBuffer(dayId,itemId,v){
  if(appMode==='shared')return;
  const it=tripDayFindItem(dayId,itemId);if(!it)return;
  const n=parseInt(v,10);
  if(!Number.isFinite(n)||n<0)delete it.bufferMins;
  else it.bufferMins=Math.min(1440,n);
  saveState();
  renderTripBuilder();
}
/* A note is capped on the way in — notes travel in #share= links, which
   is what makes the cap a correctness concern rather than a tidiness
   one — and escaped at every point it renders. */
function tlSetItemNote(dayId,itemId,v){
  if(appMode==='shared')return;
  const it=tripDayFindItem(dayId,itemId);if(!it)return;
  const s=String(v==null?'':v).trim().slice(0,TL_NOTE_MAX);
  if(s)it.note=s;else delete it.note;
  saveState();
  renderTripBuilder();
}
function tlSetLegArrive(dayId,itemId,v){
  if(appMode==='shared')return;
  const it=tripDayFindItem(dayId,itemId);if(!it||!TL_TIMED_LEG[it.type])return;
  const m=tlParseTime(v);
  if(m==null)delete it.arrive;else it.arrive=tlFormatTime(m);
  saveState();
  renderTripBuilder();
}

/* ── The add menu (DEC-039, owner review) ─────────────────────────────
   Right-click an empty slot — long-press it on a phone — and you add
   something at that time. The menu is a plain absolutely-positioned div
   on <body> rather than inside the scroller, so it can't be clipped by
   the grid it was opened over, and it closes on the next click, scroll
   or Escape anywhere.

   The four entries are the owner's own list. Each opens that kind's
   form, seeded with the time that was clicked — nothing is added to the
   trip until the form is committed, because none of these four has
   enough default content to be worth creating empty. */
let tlMenu=null; // {el}
function tlMenuClose(){
  if(tlMenu&&tlMenu.el&&tlMenu.el.parentNode)tlMenu.el.parentNode.removeChild(tlMenu.el);
  tlMenu=null;
}
function tlMenuOpen(dayId,mins,x,y){
  tlMenuClose();
  const at=tlSnap(mins);
  const el=document.createElement('div');
  el.className='tl-menu';
  el.setAttribute('role','menu');
  el.innerHTML=`<div class="tl-menu-label">Add at ${tlFormatTime(at)}</div>`+
    TL_ADD_KINDS.map(k=>`<button type="button" class="tb-menu-item" role="menuitem"
      data-tlkind="${k}">${TL_KINDS[k].icon} ${esc(TL_KINDS[k].label)}</button>`).join('');
  document.body.appendChild(el);
  /* Kept on screen: a right-click near the bottom of the window would
     otherwise open a menu whose last entry is below the fold. */
  const b=el.getBoundingClientRect();
  const left=Math.max(6,Math.min(x,window.innerWidth-b.width-6));
  const topPx=Math.max(6,Math.min(y,window.innerHeight-b.height-6));
  el.style.left=left+'px';
  el.style.top=topPx+'px';
  el.addEventListener('click',e=>{
    const btn=e.target.closest('[data-tlkind]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();
    const kind=btn.getAttribute('data-tlkind');
    tlMenuClose();
    if(kind==='flight')tlPromptFlight(dayId,at);
    else tlPromptBlock(dayId,kind,at);
  });
  tlMenu={el};
}
function tlGapContext(ev,dayId){
  if(appMode==='shared')return true;   // someone else's trip: no editing
  /* A right-click on a block belongs to the block, not to the slot
     behind it — and a block's own context menu is its details panel. */
  if(ev.target&&ev.target.closest&&ev.target.closest('[data-tlblock]'))return true;
  const el=ev.currentTarget;
  if(!el||!el.getBoundingClientRect)return true;
  ev.preventDefault();ev.stopPropagation();
  tlMenuOpen(dayId,tlGridMinsAt(el,ev.clientY),ev.clientX,ev.clientY);
  return false;
}
/* A y position on the grid, back to a time on the clock. The grid is the
   whole day from 00:00, so this is the offset and nothing else. */
function tlGridMinsAt(el,clientY){
  const y=clientY-el.getBoundingClientRect().top;
  return Math.max(0,Math.min(TL_DAY_HOURS*60-1,y/TL_PX_PER_MIN));
}
function tlSnap(mins){
  return Math.max(0,Math.min(TL_DAY_HOURS*60-TL_SNAP_MINS,
    Math.round(mins/TL_SNAP_MINS)*TL_SNAP_MINS));
}
document.addEventListener('click',e=>{if(tlMenu&&!e.target.closest('.tl-menu'))tlMenuClose();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')tlMenuClose();});
window.addEventListener('scroll',tlMenuClose,true);

/* ── Dragging a block (DEC-039, owner review) ─────────────────────────
   Pointer events, one document-level set, so nothing has to be rebound
   after a render — and so the gesture survives the block being redrawn
   under it.

   A mouse drags as soon as it has moved TL_DRAG_SLOP, which leaves a
   plain click free to open the details panel. A finger holds first
   (TL_PRESS_MS), for exactly the reason GOLF-215 gives: on a phone the
   itinerary IS the scroll surface, every scroll starts on a card, and
   only time can tell a deliberate grab from a swipe. Nothing is
   prevented until a hold has completed, so a swipe is never stickier
   than before.

   The three zones of a block: its top edge resizes from the start, its
   bottom edge resizes the end, everything between moves the whole
   thing. A drive leg is not a block and has no handles at all — it is
   computed, and the one thing it must never say is "drag me". */
let tlDrag=null;
function tlDragZone(el,clientY){
  if(!el.getAttribute('data-tlresize'))return'move';
  const b=el.getBoundingClientRect();
  if(clientY-b.top<=TL_EDGE_PX)return'top';
  if(b.bottom-clientY<=TL_EDGE_PX)return'bottom';
  return'move';
}
function tlDragStart(){
  if(!tlDrag||tlDrag.started)return;
  tlDrag.started=true;
  tlDrag.el.classList.add('is-dragging');
  document.body.classList.add('tl-dragging');
  try{if(tlDrag.touch&&navigator.vibrate)navigator.vibrate(18);}catch(e){}
}
/* What the gesture has made of the block so far, in model terms. Pure
   arithmetic off the numbers stamped on the element, so the drawn
   position (which the cursor layout may have stretched) never feeds
   back into the time. */
function tlDragValues(dy){
  const dMins=dy/TL_PX_PER_MIN;
  const s=tlDrag;
  if(s.zone==='move')return{start:tlSnap(s.start+dMins),dur:s.dur};
  if(s.zone==='top'){
    const start=Math.min(tlSnap(s.start+dMins),s.start+s.dur-TL_MIN_DUR);
    return{start:Math.max(0,start),dur:s.start+s.dur-Math.max(0,start)};
  }
  return{start:s.start,dur:Math.max(TL_MIN_DUR,Math.min(1440,tlSnap(s.dur+dMins)))};
}
function tlDragPaint(dy){
  const s=tlDrag,v=tlDragValues(dy);
  /* Moved by the SNAPPED difference, not by the raw pointer delta, so
     what the block does under the finger is what will be committed. */
  const shift=(v.start-s.start)*TL_PX_PER_MIN;
  s.el.style.top=(s.topPx+shift).toFixed(1)+'px';
  if(s.zone!=='move')s.el.style.height=Math.max(TL_MIN_BLOCK_PX,v.dur*TL_PX_PER_MIN).toFixed(1)+'px';
  const t=s.el.querySelector('.tl-block-time');
  if(t)t.textContent=tlFormatTime(v.start);
}
function tlDragCommit(dy){
  const s=tlDrag,v=tlDragValues(dy);
  tlDragEnd();
  const it=tripDayFindItem(s.dayId,s.itemId);
  if(!it)return renderTripBuilder();
  if(s.zone!=='move'){
    /* A resize from the bottom is a length and nothing else; from the
       top it is a length AND a new start, because the end stayed put. */
    if(v.dur!==s.dur)it.durationMins=Math.round(v.dur);
    if(s.zone==='top'&&v.start!==s.start){tlSetItemTime(s.dayId,s.itemId,tlFormatTime(v.start));return;}
    saveState();renderTripBuilder();return;
  }
  if(v.start===s.start){renderTripBuilder();return;} // dropped where it started
  tlSetItemTime(s.dayId,s.itemId,tlFormatTime(v.start));
}
function tlDragEnd(){
  if(!tlDrag)return;
  if(tlDrag.timer)clearTimeout(tlDrag.timer);
  if(tlDrag.el){
    tlDrag.el.classList.remove('is-dragging');
    try{tlDrag.el.releasePointerCapture(tlDrag.pointerId);}catch(e){}
  }
  document.body.classList.remove('tl-dragging');
  tlDrag=null;
}
document.addEventListener('pointerdown',e=>{
  if(appMode==='shared'||e.button===2)return;
  const el=e.target.closest&&e.target.closest('[data-tldrag]');
  if(!el)return;
  /* The time inputs and buttons inside a block keep their own
     behaviour — a press on one of those is never a drag. */
  if(e.target.closest('input,button,select,textarea,a'))return;
  tlDragEnd();tlMenuClose();
  const touch=e.pointerType==='touch';
  tlDrag={el,pointerId:e.pointerId,touch,
    dayId:Number(el.getAttribute('data-tlday')),
    itemId:el.getAttribute('data-tlitem'),
    start:Number(el.getAttribute('data-tlstart'))||0,
    dur:Number(el.getAttribute('data-tldur'))||0,
    topPx:parseFloat(el.style.top)||0,
    zone:tlDragZone(el,e.clientY),
    y0:e.clientY,x0:e.clientX,moved:false,started:false,timer:null};
  try{el.setPointerCapture(e.pointerId);}catch(err){}
  /* A finger has to hold still first; a mouse only has to move. */
  if(touch)tlDrag.timer=setTimeout(()=>{if(tlDrag){tlDrag.timer=null;tlDragStart();}},TL_PRESS_MS);
});
document.addEventListener('pointermove',e=>{
  if(!tlDrag||e.pointerId!==tlDrag.pointerId)return;
  const dy=e.clientY-tlDrag.y0;
  if(!tlDrag.started){
    /* Still deciding. A finger that moves before the hold completes was
       scrolling: hand the gesture back untouched. A mouse past the slop
       was always dragging. */
    if(tlDrag.touch){if(Math.abs(dy)>TL_PRESS_SLOP||Math.abs(e.clientX-tlDrag.x0)>TL_PRESS_SLOP)tlDragEnd();return;}
    if(Math.abs(dy)<TL_DRAG_SLOP)return;
    tlDragStart();
  }
  tlDrag.moved=true;
  e.preventDefault();
  tlDragPaint(dy);
});
document.addEventListener('pointerup',e=>{
  if(!tlDrag||e.pointerId!==tlDrag.pointerId)return;
  const dy=e.clientY-tlDrag.y0,was=tlDrag;
  if(was.started&&was.moved){e.preventDefault();tlDragCommit(dy);return;}
  /* A press that never became a drag is a click: open the details. */
  const dayId=was.dayId,itemId=was.itemId;
  tlDragEnd();
  tlOpenPanel(dayId,itemId);
});
document.addEventListener('pointercancel',e=>{
  if(tlDrag&&e.pointerId===tlDrag.pointerId){const live=tlDrag.started;tlDragEnd();if(live)renderTripBuilder();}
});

/* ── Long-press an empty slot (phone) ─────────────────────────────────
   A phone has no right-click, so the add menu is reached by holding an
   empty slot. Armed on a stationary finger and cancelled by any
   movement, so a scroll through the itinerary is never even slightly
   stickier — the same contract GOLF-215's hold follows, for the same
   reason. A hold that lands on a BLOCK belongs to the drag above, not
   here. */
let tlPressT=null,tlPressFrom=null;
function tlPressCancel(){if(tlPressT){clearTimeout(tlPressT);tlPressT=null;}tlPressFrom=null;}
document.addEventListener('touchstart',e=>{
  tlPressCancel();
  if(appMode==='shared'||!e.touches||e.touches.length!==1)return;
  const t=e.touches[0];
  const el=e.target&&e.target.closest?e.target.closest('[data-tlgap]'):null;
  if(!el||(e.target.closest&&e.target.closest('[data-tlblock]')))return;
  tlPressFrom={x:t.clientX,y:t.clientY};
  tlPressT=setTimeout(()=>{
    tlPressT=null;
    tlMenuOpen(Number(el.getAttribute('data-tlday')),tlGridMinsAt(el,tlPressFrom.y),
      tlPressFrom.x,tlPressFrom.y);
    tlPressFrom=null;
  },TL_PRESS_MS);
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!tlPressT||!tlPressFrom||!e.touches||!e.touches.length)return;
  const t=e.touches[0];
  if(Math.abs(t.clientX-tlPressFrom.x)>TL_PRESS_SLOP||Math.abs(t.clientY-tlPressFrom.y)>TL_PRESS_SLOP)tlPressCancel();
},{passive:true});
document.addEventListener('touchend',tlPressCancel,{passive:true});
document.addEventListener('touchcancel',tlPressCancel,{passive:true});

/* ── Keeping the scroller where the visitor left it ───────────────────
   Every edit re-renders the whole pane, which would otherwise throw the
   day's scroll position away mid-drag. Positions are remembered per day
   for the life of the page (not saved: where you had scrolled to is not
   a fact about the trip), and a day nobody has scrolled yet opens just
   above its first block. */
const tlScrollTop=new Map();
function tlAfterRender(){
  document.querySelectorAll('.tl-scroll').forEach(el=>{
    const key=el.getAttribute('data-tlscroll');
    const want=tlScrollTop.has(key)?tlScrollTop.get(key):Number(el.getAttribute('data-tlfocus'))||0;
    el.scrollTop=want;
    el.addEventListener('scroll',()=>{tlScrollTop.set(key,el.scrollTop);},{passive:true});
  });
  tlAttachBlockSearch();
}

/* ── Adding a train, a drive-from or an activity ──────────────────────
   DEC-039: all three are hand-typed. One form serves them, because the
   difference between them is which fields it shows, not what it does:
   a draft is harvested out of the DOM, validated, and written as the
   only keys that have values — which is exactly what the GOLF-224 load
   whitelist keeps, so an item in memory and the same item after a reload
   are the same object.

   A train is never routed and never costs fuel. That is not a special
   case anywhere in the routing code: a train has no coordinates, so
   tripItemPoint() returns null and it contributes no leg, by the same
   mechanism a hand-typed hotel does. A "drive from another place" is the
   opposite — its whole purpose is to BE a located point the next stop is
   driven from, so its place search is the one field it cannot do
   without. */
let tlDraft=null;
function tlPromptBlock(dayId,kind,mins){
  if(appMode==='shared')return;
  tbAddStop=null;tlFlightDraft=null;tlPanel=null;
  tlDraft={dayId,itemId:null,kind,name:'',fromName:'',depart:mins!=null?tlFormatTime(tlSnap(mins)):'',
    arrive:'',time:mins!=null?tlFormatTime(tlSnap(mins)):'',durationMins:'',price:'',note:'',
    lat:null,lng:null};
  renderTripBuilder();
}
function tlEditBlock(dayId,itemId){
  const it=tripDayFindItem(dayId,itemId);
  if(!it||!(it.type==='train'||it.type==='drivefrom'||it.type==='activity'))return;
  tbAddStop=null;tlFlightDraft=null;
  tlDraft={dayId,itemId,kind:it.type,name:it.name||'',fromName:it.fromName||'',
    depart:it.depart||'',arrive:it.arrive||'',time:it.time||'',
    durationMins:it.durationMins!=null?String(it.durationMins):'',
    price:it.price!=null?String(it.price):'',note:it.note||'',
    lat:it.lat!=null?it.lat:null,lng:it.lng!=null?it.lng:null};
  renderTripBuilder();
}
function tlBlockCancel(){tlDraft=null;renderTripBuilder();}
function tlBlockHarvest(){
  const s=tlDraft;if(!s)return;
  const g=id=>{const el=document.getElementById(id);return el?el.value:null;};
  ['name','fromName','depart','arrive','time','durationMins','price','note'].forEach(k=>{
    const v=g('tl-bk-'+k.toLowerCase());
    if(v!==null)s[k]=v;
  });
}
function tlBlockCommit(){
  tlBlockHarvest();
  const s=tlDraft;if(!s)return;
  const k=tlKind(s.kind);
  const name=String(s.name||'').trim().slice(0,80);
  if(!name){const el=document.getElementById('tl-bk-name');if(el)el.focus();return;}
  const canonTime=v=>{const m=tlParseTime(v);return m==null?null:tlFormatTime(m);};
  const fields={name};
  if(s.kind==='train'){
    const from=String(s.fromName||'').trim().slice(0,80);if(from)fields.fromName=from;
    const dep=canonTime(s.depart);if(dep)fields.depart=dep;
    const arr=canonTime(s.arrive);if(arr)fields.arrive=arr;
  }else{
    const t=canonTime(s.time);if(t)fields.time=t;
    const dur=parseInt(s.durationMins,10);
    if(Number.isFinite(dur)&&dur>=TL_MIN_DUR)fields.durationMins=Math.min(1440,dur);
  }
  if(k.price){
    const price=parseFloat(s.price);
    if(Number.isFinite(price))fields.price=price;
  }
  const note=String(s.note||'').trim().slice(0,TL_NOTE_MAX);if(note)fields.note=note;
  /* The picked coordinates are only kept while the name still matches
     what was picked — typing over a geocoded pick makes those
     coordinates a lie. The same rule tbAddStopCommit() follows. */
  if(k.place&&s.lat!=null&&s.lng!=null&&s.picked&&name===String(s.picked).trim()){
    fields.lat=s.lat;fields.lng=s.lng;
  }
  const d=tripDays.find(x=>x.id===s.dayId);
  if(!d)return;
  if(s.itemId){
    const it=tripDayItems(d).find(x=>x.id===s.itemId);
    if(!it)return;
    /* Rebuilt rather than patched: clearing a field has to remove it,
       not leave the old value behind under a key the form no longer
       shows. The id, the type and the item's place in d.items are what
       must survive, and all three do — except that a time it now has is
       what decides where in the day it sits. */
    Object.keys(it).forEach(key=>{if(key!=='id'&&key!=='type')delete it[key];});
    Object.assign(it,fields);
    const at=tlFixedStart(it);
    if(at!=null)tlReseat(d,it,at);
  }else{
    if(!Array.isArray(d.items))d.items=[];
    const it=Object.assign({id:tripItemNewId(),type:s.kind},fields);
    const at=tlFixedStart(it);
    d.items.splice(at!=null?tlInsertAtTime(d,at):tripDayItems(d).length,0,it);
  }
  tlDraft=null;
  saveState();
  renderTripBuilder();
  tbDrawMap(false);
}
function tlBlockFormHTML(dayId){
  if(!tlDraft||tlDraft.dayId!==dayId)return'';
  /* The hotel/POI form takes the day's one form slot when both are
     somehow open — it is the one with a map picker behind it. */
  if(typeof tbAddStop!=='undefined'&&tbAddStop&&tbAddStop.dayId===dayId)return'';
  const s=tlDraft,k=tlKind(s.kind);
  const dayObj=tripDays.find(d=>d.id===dayId);
  const cur=curSym(typeof tripStayCurrency==='function'?tripStayCurrency(dayObj,s):'GBP');
  const gs=groupSizeFor();
  const priceNum=parseFloat(s.price);
  const nameField=k.place
    ?tbSearchFieldHTML({id:'tl-bk-name',value:s.name,
        placeholder:s.kind==='drivefrom'?'Where do you set off from?':'What are you doing?',
        title:'Pick a search result to give this a real location, so the drive to or from it can be worked out. A plain typed name works too.'})
    :`<input class="tb-field" type="text" id="tl-bk-name" maxlength="80"
        placeholder="${s.kind==='train'?'Station you arrive at, e.g. Penzance':'Name'}" value="${esc(s.name)}">`;
  return`<div class="tb-addstop">
    <div class="tb-addstop-title">${s.itemId?'Edit this ':/^[aeiou]/i.test(k.label)?'Add an ':'Add a '}${esc(k.label.toLowerCase())}</div>
    ${s.kind==='train'?`<label class="tl-fl-label" for="tl-bk-fromname">From</label>
      <input class="tb-field" type="text" id="tl-bk-fromname" maxlength="80"
        placeholder="Station you leave from, e.g. London Paddington" value="${esc(s.fromName)}">
      <label class="tl-fl-label" for="tl-bk-name">To</label>`:''}
    ${nameField}
    ${s.kind==='train'
      ?`<div class="tb-addstop-row">
          <label class="tl-fl-label" for="tl-bk-depart">Departs</label>
          <input class="tb-field tl-time" type="time" id="tl-bk-depart" value="${esc(s.depart)}">
          <label class="tl-fl-label" for="tl-bk-arrive">Arrives</label>
          <input class="tb-field tl-time" type="time" id="tl-bk-arrive" value="${esc(s.arrive)}">
        </div>
        <p class="hint" style="margin:var(--sp-2) 0 0">A train isn't routed or fuelled — the two times are the whole journey.</p>`
      :`<div class="tb-addstop-row">
          <label class="tl-fl-label" for="tl-bk-time">${s.kind==='drivefrom'?'Set off':'Starts'}</label>
          <input class="tb-field tl-time" type="time" id="tl-bk-time" value="${esc(s.time)}">
          ${s.kind==='activity'?`<label class="tl-fl-label" for="tl-bk-durationmins">Minutes</label>
          <input class="tb-field" type="number" id="tl-bk-durationmins" min="${TL_MIN_DUR}" max="1440" step="5"
            placeholder="${TL_DEFAULT_MINS.activity}" value="${esc(s.durationMins)}" style="max-width:88px">`:''}
        </div>`}
    ${k.price?`<div class="tb-addstop-row">
      <input class="tb-field" type="number" id="tl-bk-price" min="0" step="5"
        placeholder="${cur} per person — optional" value="${esc(s.price)}">
    </div>
    ${gs>1&&Number.isFinite(priceNum)?`<p class="hint" style="margin:var(--sp-2) 0 0">${cur}${priceNum.toFixed(0)} × ${gs} people = <b>${cur}${(priceNum*gs).toFixed(0)}</b>.</p>`:''}`:''}
    <div class="tb-addstop-row">
      <input class="tb-field" type="text" id="tl-bk-note" maxlength="${TL_NOTE_MAX}"
        placeholder="Note — optional" value="${esc(s.note)}">
    </div>
    ${s.kind==='drivefrom'?`<p class="hint" style="margin:var(--sp-2) 0 0">Pick a place from the search for the drive to your first stop to be worked out. ${
      s.lat!=null?'📍 Location set.':'No location yet.'}</p>`:''}
    <div class="tb-addstop-row" style="margin-top:var(--sp-2)">
      <button class="tb-btn is-primary" onclick="tlBlockCommit()">${s.itemId?'Save':'Add'}</button>
      <button class="tb-btn is-quiet" onclick="tlBlockCancel()">Cancel</button>
    </div>
  </div>`;
}
/* The place search inside that form, bound after each render — the same
   shared component (tbAttachSearch) the day places and the add-a-stop
   form use, so there is one geocoder debounce in the app, not four. */
function tlAttachBlockSearch(){
  if(!tlDraft||!tlKind(tlDraft.kind).place)return;
  if(!document.getElementById('tl-bk-name'))return;
  tbAttachSearch('tl-bk-name',{
    country:()=>tbTripCountryCode(tlDraft&&tlDraft.dayId),
    onType(text){tlDraft.name=text;tlDraft.lat=null;tlDraft.lng=null;tlDraft.picked=null;},
    onPick(r){
      tlBlockHarvest();
      tlDraft.name=r.label;tlDraft.lat=r.lat;tlDraft.lng=r.lng;tlDraft.picked=r.label;
      renderTripBuilder();
    }
  });
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
function tlPromptFlight(dayId,mins){
  /* One form open at a time per day — the hotel/POI form is the other
     one, and it owns the map picker, so it yields to nothing. */
  tbAddStop=null;tlDraft=null;tlPanel=null;
  tlFlightDraft={dayId,itemId:null,toCode:'',name:'',flightNo:'',fromCode:'',
    depart:mins!=null?tlFormatTime(tlSnap(mins)):'',arrive:'',price:'',note:'',other:false};
  renderTripBuilder();
}
function tlEditFlight(dayId,itemId){
  const it=tripDayFindItem(dayId,itemId);
  if(!it||it.type!=='flight')return;
  tbAddStop=null;tlDraft=null;
  tlFlightDraft={dayId,itemId,toCode:it.toCode||'',name:it.name||'',
    flightNo:it.flightNo||'',fromCode:it.fromCode||'',
    depart:it.depart||'',arrive:it.arrive||'',
    price:it.price!=null?String(it.price):'',note:it.note||'',
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
  ['name','flightNo','fromCode','depart','arrive','price','note'].forEach(k=>{
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
  /* GOLF-153: the departure airport's coordinates, looked up from the
     code the form already asks for rather than from a second picker.
     A code that isn't on the list contributes no point, and the flight
     stays the single arrival point it was — the same convention a
     hand-typed hotel follows. */
  const fc=code(s.fromCode);
  if(fc){
    fields.fromCode=fc;
    const fa=tlAirportByCode(fc);
    if(fa){fields.fromLat=fa.lat;fields.fromLng=fa.lng;fields.fromName=tlAirportLabel(fa);}
  }
  const tc=ap?ap.iata:code(s.toCode);if(tc)fields.toCode=tc;
  const dep=canonTime(s.depart);if(dep)fields.depart=dep;
  const arr=canonTime(s.arrive);if(arr)fields.arrive=arr;
  if(Number.isFinite(price))fields.price=price;
  const note=String(s.note||'').trim().slice(0,TL_NOTE_MAX);if(note)fields.note=note;
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
    /* GOLF-153: a flight you fly out on takes its place in the day
       from when it LEAVES, which is the end of it you have to be
       driven to. Only the inbound one is placed by its landing. */
    d.items.splice(tlFlightInsertAt(d,fields.depart||fields.arrive),0,
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
   flags as a conflict, for a trip that is not what anyone typed. So it
   lands by its clock instead, against the day as it is currently drawn
   (tlInsertAtTime), and a flight with no time typed is appended like
   anything else. Positions are never adjusted again — dragging is how
   you change your mind. */
function tlFlightInsertAt(d,at){
  const mins=tlParseTime(at);
  return mins==null?tripDayItems(d).length:tlInsertAtTime(d,mins);
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
        placeholder="From" title="The airport you fly out of — a listed code gives the drive to the terminal a real start point." value="${esc(s.fromCode)}" style="max-width:88px">
    </div>
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
    <div class="tb-addstop-row">
      <input class="tb-field" type="text" id="tl-fl-note" maxlength="${TL_NOTE_MAX}"
        placeholder="Note — optional" value="${esc(s.note)}">
    </div>
    ${gs>1&&Number.isFinite(priceNum)?`<p class="hint" style="margin:var(--sp-2) 0 0">${cur}${priceNum.toFixed(0)} × ${gs} people = <b>${cur}${(priceNum*gs).toFixed(0)}</b>.</p>`:''}
    <div class="tb-addstop-row" style="margin-top:var(--sp-2)">
      <button class="tb-btn is-primary" onclick="tlFlightCommit()">${s.itemId?'Save':'Add'}</button>
      <button class="tb-btn is-quiet" onclick="tlFlightCancel()">Cancel</button>
    </div>
  </div>`;
}
/* The list view's own meta line for the kinds of stop the calendar
   invented (js/trip-add.js calls this): the same facts the grid shows,
   without the clock. The list view is the default view and DEC-039 keeps
   it as it was — but an item it cannot describe would read as a bare
   "Stop", so each of these says what it is. */
function tlFlightListMetaHTML(it){
  const bits=[];
  if(it.type==='flight'){
    if(it.flightNo)bits.push(esc(it.flightNo));
    if(it.fromCode&&it.toCode)bits.push(esc(it.fromCode)+'→'+esc(it.toCode));
    else if(it.toCode)bits.push('to '+esc(it.toCode));
    if(it.arrive)bits.push('lands '+esc(it.arrive));
    else if(it.depart)bits.push('departs '+esc(it.depart));
    return`<div class="cart-region">${bits.length?bits.join(' · '):'Flight'}</div>`;
  }
  if(it.type==='train'){
    bits.push('Train');
    if(it.fromName)bits.push('from '+esc(it.fromName));
    if(it.depart&&it.arrive)bits.push(esc(it.depart)+'–'+esc(it.arrive));
    else if(it.depart)bits.push('departs '+esc(it.depart));
    return`<div class="cart-region">${bits.join(' · ')}</div>`;
  }
  if(it.type==='drivefrom'){
    bits.push('You set off from here');
    if(it.time)bits.push(esc(it.time));
    if(tripItemPoint(it)==null)bits.push('<span title="No location picked, so no drive time can be calculated from here">no location</span>');
    return`<div class="cart-region">${bits.join(' · ')}</div>`;
  }
  bits.push('Activity');
  if(it.time)bits.push(esc(it.time));
  return`<div class="cart-region">${bits.join(' · ')}</div>`;
}
/* The four types the calendar owns, for the list view and the cost
   breakdown to ask about by name rather than by a chain of !==. */
function tlIsCalendarType(t){return t==='flight'||t==='train'||t==='drivefrom'||t==='activity';}
