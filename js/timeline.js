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
const TL_DEFAULT_MINS={golf:270,poi:90,hotel:0,flight:0};
/* Where a day starts when NOTHING in it carries a fixed time. Without an
   anchor there is no clock at all and the grid has nothing to draw. */
const TL_DAY_START=9*60;
/* Default hotel check-in, drawn on the first night of a stay only, and a
   marker: it never pushes or blocks what follows (DEC-039). There is no
   check-in data anywhere in data/ to derive this from — checked
   2026-10-05 — so this is a convention, not a measurement. */
const TL_DEFAULT_CHECKIN=15*60;

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
/* The fixed start the visitor typed, or null when this item just flows
   from the one before it. A flight is anchored on ARRIVAL: the departure
   is shown as text but never drawn, because across a time zone a
   depart→arrive block is a lie and we are not storing offsets. */
function tlFixedStart(it){
  if(!it)return null;
  if(it.type==='flight')return tlParseTime(it.arrive);
  return tlParseTime(it.time);
}
/* Hotels are a strip along the bottom of the day, not a stop in the
   chain: you do not "spend" the evening before driving on. Excluding
   them here is what stops a hotel pushing the next morning. */
function tlInChain(it){return!!it&&it.type!=='hotel';}

/* ── The engine ───────────────────────────────────────────────────────
   Walks a day's items in order and returns one row per item:
     {item, startMins, endMins, durationMins, fixed, driveMins,
      conflict:{arriveMins,fixedMins}|null, marker}
   `fixed` says the visitor set this time; everything else was derived.
   `driveMins` is the leg running INTO this item.

   A fixed time is never moved. When the chain cannot reach it, the row
   carries a conflict and the clock continues from the fixed time anyway
   — the visitor is told they are late, not quietly re-planned.

   driveFn(prevItem,item) → minutes is supplied by the caller, so this
   module never reaches into the routing cache and the tests can hand it
   fixed numbers. */
function tlComputeDay(items,driveFn){
  const list=Array.isArray(items)?items:[];
  const rows=[];
  let cursor=null,prevStop=null;
  list.forEach(it=>{
    const dur=tlDurationFor(it);
    const fixed=tlFixedStart(it);
    /* A hotel sits outside the chain entirely: it gets its check-in
       marker and leaves the cursor exactly where it was. */
    if(!tlInChain(it)){
      const at=fixed!=null?fixed:TL_DEFAULT_CHECKIN;
      rows.push({item:it,startMins:at,endMins:at,durationMins:0,
        fixed:fixed!=null,driveMins:0,conflict:null,marker:true});
      return;
    }
    /* The drive into this item. The caller only returns minutes when
       both ends have a location, so a hand-typed stop contributes none. */
    const drive=(prevStop&&typeof driveFn==='function')?(driveFn(prevStop,it)||0):0;
    let start,conflict=null;
    if(cursor===null){
      /* First timed item of the day: nothing precedes it, so a fixed
         time here can never be late. */
      start=fixed!=null?fixed:TL_DAY_START;
    }else{
      const earliest=cursor+drive;
      if(fixed!=null){
        start=fixed;
        if(fixed<earliest)conflict={arriveMins:earliest,fixedMins:fixed};
      }else{
        start=earliest;
      }
    }
    rows.push({item:it,startMins:start,endMins:start+dur,durationMins:dur,
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
    const s=x.startMins-(x.driveMins||0); // the drive before it is drawn too
    if(s<lo)lo=s;
    if(x.endMins>hi)hi=x.endMins;
  });
  return{startHour:Math.floor(lo/60),endHour:Math.ceil(hi/60)};
}
