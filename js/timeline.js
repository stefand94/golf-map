/* ════════════════════════════════════════════════════════════════════
   GOLF-153 — detailed mode: the computed-time engine (DEC-039)

   The model stores only FIXED times. Every other time on screen is
   derived here, at render time, and never written back. That is the
   whole point of the decision: a tee time is a fact the visitor typed,
   everything else is a consequence, and a consequence that got saved
   would quietly become a second source of truth.

   The day's items[] is already the ordered source of truth, and drive
   legs are computed between consecutive located stops (js/trip-geo.js),
   never stored. This walks that same order and hangs a clock off it.

   Nothing here renders. It takes a day and gives back one row per item,
   so the view can stay dumb and the arithmetic can be tested on its own.
   ════════════════════════════════════════════════════════════════════ */

/* Default block lengths, in minutes (DEC-039, owner 2026-10-05).
   A value of 0 means "a marker, not a block": it takes a line on the
   grid but consumes no time, so nothing after it is pushed. */
const TL_DEFAULT_MINS={golf:300,poi:90,hotel:0,flight:0};
/* Where a day starts when NOTHING in it carries a fixed time. Without an
   anchor there is no clock at all and the grid has nothing to draw. */
const TL_DAY_START=9*60;
/* Default hotel check-in, drawn on the first night of a stay only, and a
   marker: it never pushes or blocks what follows (DEC-039). There is no
   check-in data anywhere in data/ to derive this from — checked
   2026-10-05 — so this is a convention, not a measurement. */
const TL_DEFAULT_CHECKIN=15*60;
/* Arrival buffers (DEC-039, revised by the owner 2026-10-05): the time
   you have to be there BEFORE the thing you are there for. A 10:00 tee
   means being at the course by 09:15; a flight means being at the
   airport two hours before it departs. Editable per item through
   `bufferMins` — these are only the defaults.

   A buffer is a DEADLINE, not a block: it changes when you are late,
   not how long anything takes. The drive has to land by the buffer, and
   landing after it is the conflict. A hotel or a POI has nothing to be
   early for, so neither has one. */
const TL_DEFAULT_BUFFER={golf:45,flight:120};
/* One cap for a note, read by the model, the loader and the share codec
   alike — notes ride in share URLs, which is what makes a cap a
   correctness concern rather than a tidiness one. */
const TL_NOTE_MAX=300;

/* ── Time values ──────────────────────────────────────────────────────
   A stored time is "HH:MM", 24h, local wall-clock at that place. Time
   ZONES are deliberately out (DEC-039): a trip "only starts from
   arrival", so every time is simply what a local clock would read. */
function tlParseTime(v){
  if(typeof v!=='string')return null;
  const m=/^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if(!m)return null;
  const h=+m[1],mi=+m[2];
  if(h<0||h>23||mi<0||mi>59)return null;
  return h*60+mi;
}
function tlFormatTime(mins){
  if(!Number.isFinite(mins))return'';
  /* Past midnight keeps counting up rather than wrapping to 00:xx — a
     round finishing at 25:00 reads as "late that night", where 01:00
     looks like it happened before breakfast. The view decides whether to
     show a +1 day marker. */
  const m=Math.round(mins),h=Math.floor(m/60),r=((m%60)+60)%60;
  return String(h).padStart(2,'0')+':'+String(r).padStart(2,'0');
}
/* Minutes for one item: its own durationMins when set and sane, else the
   type default. Clamped to a day — a 3-day block is always a typo. */
function tlDurationFor(it){
  if(!it)return 0;
  const d=it.durationMins;
  if(typeof d==='number'&&Number.isFinite(d)&&d>=0)return Math.min(1440,Math.round(d));
  const def=TL_DEFAULT_MINS[it.type];
  return typeof def==='number'?def:0;
}
/* The arrival buffer for one item, in minutes: its own bufferMins when
   set and sane, else the type default, else none. Clamped to a day for
   the same reason a duration is — a 3-day buffer is always a typo. */
function tlBufferFor(it){
  if(!it)return 0;
  const b=it.bufferMins;
  if(typeof b==='number'&&Number.isFinite(b)&&b>=0)return Math.min(1440,Math.round(b));
  const def=TL_DEFAULT_BUFFER[it.type];
  return typeof def==='number'?def:0;
}
/* Which flight is the one that BRINGS you, given the whole trip. The
   rule is derived, never stored (DEC-039): the first item in the trip
   that is part of the chain decides it. If that item is a flight, that
   flight is the inbound one and the trip genuinely starts at its
   landing; if anything else comes first, every flight in the trip is
   one you have to get yourself to.

   Hotels and notes are skipped because they are not in the chain at
   all — a hotel booked for the night you land is still "before" the
   flight in items[], and it must not make that flight look like a
   departure you need two hours of check-in for.

   Returns the inbound flight's id, or null when there isn't one. */
function tlInboundFlightId(days){
  const list=Array.isArray(days)?days:[];
  for(const d of list){
    const items=(d&&Array.isArray(d.items))?d.items:[];
    for(const it of items){
      if(!tlInChain(it))continue;
      return(it&&it.type==='flight')?(it.id||null):null;
    }
  }
  return null;
}
/* How long a flight is in the air: the gap between the two times the
   visitor typed. Zero (a marker) unless both are set and the arrival is
   after the departure — a flight with one time, or one that lands
   "before" it left, has no honest length to draw.

   Time zones are still out of scope (DEC-039), so this is only true for
   a flight within one zone. That is what the trip is: GB, Ireland and
   South Africa, each internally single-zone. */
function tlFlightDuration(it){
  if(!it||it.type!=='flight')return 0;
  const dep=tlParseTime(it.depart),arr=tlParseTime(it.arrive);
  if(dep==null||arr==null||arr<=dep)return 0;
  return Math.min(1440,arr-dep);
}
/* The fixed start the visitor typed, or null when this item just flows
   from the one before it.

   A flight is anchored on whichever end the visitor has to BE at. The
   inbound flight is anchored on its ARRIVAL — you were not planned to
   the airport you left from, the trip starts when you land. Every other
   flight is anchored on its DEPARTURE, because that is the end you have
   to drive to and check in for, and the arrival simply follows. */
function tlFixedStart(it,inbound){
  if(!it)return null;
  if(it.type==='flight')
    return inbound?tlParseTime(it.arrive):(tlParseTime(it.depart)??tlParseTime(it.arrive));
  return tlParseTime(it.time);
}
/* Hotels are a strip along the bottom of the day, not a stop in the
   chain: you do not "spend" the evening before driving on. Excluding
   them here is what stops a hotel pushing the next morning. A note is
   out of the chain for the same reason: it is something written about
   the time it sits in, and reading it costs the day nothing. */
function tlInChain(it){return!!it&&it.type!=='hotel'&&it.type!=='note';}

/* ── The engine ───────────────────────────────────────────────────────
   Walks a day's items in order and returns one row per item:
     {item, startMins, endMins, durationMins, bufferMins, readyMins,
      fixed, driveMins, conflict:{arriveMins,fixedMins,dueMins}|null,
      marker}
   `fixed` says the visitor set this time; everything else was derived.
   `driveMins` is the leg running INTO this item. `readyMins` is when
   you have to BE there — startMins minus the buffer — which is the time
   the view shows as "Arrive by" and the time the drive is judged
   against.

   A fixed time is never moved. When the chain cannot reach it in time,
   the row carries a conflict and the clock continues from the fixed
   time anyway — the visitor is told they are late, not quietly
   re-planned.

   driveFn(prevItem,item) → minutes is supplied by the caller, so this
   module never reaches into the routing cache and the tests can hand it
   fixed numbers. For a flight that is driven to, the minutes it returns
   are the drive to the DEPARTURE airport — the leg into the arrival
   airport is flown, and costs the road nothing.

   opts.inboundFlightId names the one flight that is arrival-only, from
   tlInboundFlightId(). Omitting it plans every flight in full, which is
   right for a day considered on its own. */
function tlComputeDay(items,driveFn,opts){
  const list=Array.isArray(items)?items:[];
  const inboundId=(opts&&opts.inboundFlightId)||null;
  const rows=[];
  let cursor=null,prevStop=null;
  list.forEach(it=>{
    const isFlight=!!it&&it.type==='flight';
    const inbound=isFlight&&!!it.id&&it.id===inboundId;
    const dur=isFlight?(inbound?0:tlFlightDuration(it)):tlDurationFor(it);
    const fixed=tlFixedStart(it,inbound);
    /* A hotel sits outside the chain entirely: it gets its check-in
       marker and leaves the cursor exactly where it was. A note in a
       gap marks the time the day has reached at that position — the
       cursor, not a convention — and likewise consumes none of it. */
    if(!tlInChain(it)){
      const at=fixed!=null?fixed
        :(it&&it.type==='note')?(cursor!=null?cursor:TL_DAY_START)
        :TL_DEFAULT_CHECKIN;
      rows.push({item:it,startMins:at,endMins:at,durationMins:0,
        bufferMins:0,readyMins:at,
        fixed:fixed!=null,driveMins:0,conflict:null,marker:true});
      return;
    }
    /* The drive into this item. The caller only returns minutes when
       both ends have a location, so a hand-typed stop contributes none. */
    const drive=(prevStop&&typeof driveFn==='function')?(driveFn(prevStop,it)||0):0;
    /* A buffer only means anything in front of a time the visitor
       FIXED. There is nothing to be early for when the start itself is
       derived from when you happen to arrive.

       The inbound flight is the one exception: it is anchored on its
       ARRIVAL, and a check-in buffer in front of a landing would tell
       you to be at Inverness two hours before you get there. Every
       other flight is anchored on its departure, which is exactly what
       a check-in buffer belongs in front of. */
    const buffer=(fixed!=null&&!inbound)?tlBufferFor(it):0;
    let start,conflict=null,ready;
    if(cursor===null){
      /* First timed item of the day: nothing precedes it, so a fixed
         time here can never be late. */
      start=fixed!=null?fixed:TL_DAY_START;
      ready=start-buffer;
    }else{
      const earliest=cursor+drive;
      start=fixed!=null?fixed:earliest;
      ready=start-buffer;
      /* DEC-039: the drive must land by the BUFFER, not by the tee
         time. Reaching the first tee as your round starts is late. */
      if(fixed!=null&&earliest>ready)conflict={arriveMins:earliest,fixedMins:fixed,dueMins:ready};
    }
    rows.push({item:it,startMins:start,endMins:start+dur,durationMins:dur,
      bufferMins:buffer,readyMins:ready,
      fixed:fixed!=null,driveMins:cursor===null?0:drive,conflict,marker:dur===0});
    cursor=start+dur;
    prevStop=it;
  });
  return rows;
}
/* The hours the grid needs, snapped out to whole hours — only the hours
   in use (the brief), so an 09:00–17:00 day does not render a pointless
   midnight-to-midnight ruler. Null for a day with nothing in it. */
function tlDayRange(rows){
  const r=(rows||[]).filter(x=>x&&Number.isFinite(x.startMins));
  if(!r.length)return null;
  let lo=Infinity,hi=-Infinity;
  r.forEach(x=>{
    // the buffer and the drive before it are drawn too
    const s=x.startMins-(x.bufferMins||0)-(x.driveMins||0);
    if(s<lo)lo=s;
    if(x.endMins>hi)hi=x.endMins;
  });
  return{startHour:Math.floor(lo/60),endHour:Math.ceil(hi/60)};
}
