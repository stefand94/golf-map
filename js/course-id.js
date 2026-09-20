/* ============================================================
   js/course-id.js — GOLF-163: stable course identity.

   THE PROBLEM THIS SOLVES

   Until now a course *was* its position in C[]. Everything that
   remembers a course remembers a number: TRIP, tripSeq,
   tripDays[].items[].i, EDITS, PLAYED, WANT — and the #share= hash.

   The first five live in the visitor's own browser, so they can be
   rewritten on load. A share link cannot: it is a URL already sent to
   someone else, frozen, outside our control. Reorder C[] and that link
   renders a *different* trip — no error, no warning, just the wrong
   courses. That is the failure mode this module exists to prevent, and
   it is why the work had to land before GOLF-161's coordinate re-source
   and before any future re-pull.

   HOW IT WORKS

   Every record in data/courses-*.js now carries a frozen `id`
   (scripts/add_course_ids.py). Runtime code is untouched and still
   speaks indices — translating everywhere would have meant rewriting
   most of js/ for no user-visible gain. Instead the translation happens
   at the two boundaries where a reference *outlives* the array:

     localStorage  — encoded on save, decoded on load (js/state.js)
     #share= hash  — emitted on encode, accepted on decode
                     (js/trip-share.js)

   Both boundaries accept the old numeric form for ever, resolved
   through COURSE_IDS_V1 (data/course-ids.js), the frozen table of what
   each index meant on 2026-09-20. That table is never regenerated —
   see the comment at the top of that file.

   Loaded as a plain <script> after js/util.js and before js/state.js,
   which calls loadStoredState() at its own top level.
   ============================================================ */

/* Built once, at load, from the data files. A Map rather than an object
   so a course id can never collide with an inherited property name. */
const COURSE_INDEX_BY_ID = new Map();
(function buildCourseIdIndex(){
  if(typeof C==='undefined')return;
  for(let i=0;i<C.length;i++){
    const id=C[i]&&C[i].id;
    if(typeof id==='string'&&id&&!COURSE_INDEX_BY_ID.has(id))COURSE_INDEX_BY_ID.set(id,i);
  }
})();

/* index -> id. Falls back to the raw index if a record somehow has no id
   (a hand-added course that skipped scripts/add_course_ids.py), so an
   unidentified course still round-trips within this deploy rather than
   vanishing from the visitor's trip. */
function courseRefEncode(i){
  const c=(typeof C!=='undefined')?C[i]:null;
  return(c&&typeof c.id==='string'&&c.id)?c.id:i;
}

/* A legacy numeric reference -> today's index, via what that index meant
   when the reference was written. Returns null when the course it named
   no longer exists — which is the honest answer, and is handled the same
   way every other dropped saved field already is. */
function courseIndexFromLegacy(i){
  if(!Number.isInteger(i)||i<0)return null;
  const id=(typeof COURSE_IDS_V1!=='undefined')?COURSE_IDS_V1[i]:undefined;
  if(typeof id!=='string'){
    /* Beyond the frozen table: either the table failed to load, or this
       reference was written by a deploy newer than the freeze. Neither
       should happen; treating the index as still current is the least
       destructive reading, and the C[i] check keeps it in range. */
    return(typeof C!=='undefined'&&C[i])?i:null;
  }
  const at=COURSE_INDEX_BY_ID.get(id);
  return at===undefined?null:at;
}

/* id (current form) or number (legacy) -> today's index, or null. Every
   decode path in state.js and trip-share.js goes through this one
   function, so there is exactly one place where an old reference is
   interpreted. */
function courseRefDecode(ref){
  if(typeof ref==='string'){
    const at=COURSE_INDEX_BY_ID.get(ref);
    return at===undefined?null:at;
  }
  return courseIndexFromLegacy(ref);
}

/* ── Applied to a saved trip entry on its way out of localStorage.

   Returns a copy with every course reference turned back into a
   current index, leaving every other field exactly as found —
   validateTripEntry() still does the real validation afterwards, and
   still sees the index-shaped data it has always seen. References that
   no longer resolve are dropped here; validateTripEntry() would have
   dropped them a moment later anyway (its `C[i]` guard), so this
   changes nothing about how a stale trip behaves. ── */
function courseDecodeTripEntry(t){
  if(!t||typeof t!=='object')return t;
  const out=Object.assign({},t);
  const decodeList=(v)=>Array.isArray(v)?v.map(courseRefDecode).filter(i=>i!==null):v;
  out.trip=decodeList(t.trip);
  out.tripSeq=decodeList(t.tripSeq);
  if(t.tripLastAdded!==undefined&&t.tripLastAdded!==null)out.tripLastAdded=courseRefDecode(t.tripLastAdded);
  if(t.tbAnchor!==undefined&&t.tbAnchor!==null)out.tbAnchor=courseRefDecode(t.tbAnchor);
  if(Array.isArray(t.tripDays)){
    out.tripDays=t.tripDays.map(d=>{
      if(!d||typeof d!=='object')return d;
      const nd=Object.assign({},d);
      if(Array.isArray(d.items)){
        nd.items=d.items.map(it=>{
          if(!it||typeof it!=='object'||it.type!=='golf')return it;
          const i=courseRefDecode(it.i);
          return i===null?null:Object.assign({},it,{i});
        }).filter(Boolean);
      }
      /* The pre-GOLF-63 shape, still migrated by tripDayMigrateItems(). */
      if(Array.isArray(d.courses))nd.courses=decodeList(d.courses);
      return nd;
    });
  }
  return out;
}

/* The mirror image, on the way in to localStorage. */
function courseEncodeTripEntry(t){
  if(!t||typeof t!=='object')return t;
  const out=Object.assign({},t);
  out.trip=Array.isArray(t.trip)?t.trip.map(courseRefEncode):t.trip;
  out.tripSeq=Array.isArray(t.tripSeq)?t.tripSeq.map(courseRefEncode):t.tripSeq;
  if(typeof t.tripLastAdded==='number')out.tripLastAdded=courseRefEncode(t.tripLastAdded);
  if(typeof t.tbAnchor==='number')out.tbAnchor=courseRefEncode(t.tbAnchor);
  if(Array.isArray(t.tripDays)){
    out.tripDays=t.tripDays.map(d=>{
      if(!d||typeof d!=='object')return d;
      const nd=Object.assign({},d);
      if(Array.isArray(d.items)){
        nd.items=d.items.map(it=>(it&&it.type==='golf')
          ?Object.assign({},it,{i:courseRefEncode(it.i)}):it);
      }
      if(Array.isArray(d.courses))nd.courses=d.courses.map(courseRefEncode);
      return nd;
    });
  }
  return out;
}

/* EDITS is an object keyed by course reference. Legacy keys are decimal
   strings ("214"); ids never are — every id ends in "-" plus four hex
   characters — so the two forms are distinguishable without a version
   flag, which matters because a payload can contain both after a
   half-finished write. */
function courseDecodeKeyed(obj){
  const out={};
  if(!obj||typeof obj!=='object')return out;
  Object.keys(obj).forEach(k=>{
    const i=courseRefDecode(/^\d+$/.test(k)?Number(k):k);
    if(i!==null)out[i]=obj[k];
  });
  return out;
}
function courseEncodeKeyed(obj){
  const out={};
  Object.keys(obj||{}).forEach(k=>{out[courseRefEncode(Number(k))]=obj[k];});
  return out;
}
