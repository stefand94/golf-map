/* ============================================================
   js/trip-add.js — adding things to a trip: the pane's search results,
   wishlist/day adds, place anchoring and add-a-city, and the draggable
   course/item row HTML.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* GOLF-37: search results for the pane's own search box — bookable courses
   not already in the cart, matching tbSearchQ via the existing fuzzy
   searchMatches(), capped so a broad query doesn't dump the whole dataset. */
function tbSearchResults(){
  const q=tbSearchQ.trim().toLowerCase();
  if(!q)return[];
  /* GOLF-185d: one offerable rule for both halves of the unified search —
     the place groups below already used tbCourseOfferable(), so without
     this a filtered-out course vanished from a town's group but survived
     as a loose row. It carries the GOLF-150 (C1) nation rule: the nation
     pills only show on Discover, so an invisible nation filter mustn't
     hide courses when searching from the Itinerary tab. */
  return C.map((c,i)=>i).filter(i=>searchMatches(i,q)&&tbCourseOfferable(i)).slice(0,20);
}
/* GOLF-92: place search wasn't ringfenced to the trip a visitor is
   actually planning — a South Africa trip's "add a stop" location field
   queried all nations, so a South African street name could surface an
   Irish result of the same name. Explore's own state.nation pill (what
   exploreCountryCode() reads) is the wrong signal here: it's Explore-mode
   filter state, often untouched or set to something unrelated while
   planning a trip in Build mode. Instead, infer the nation from the
   trip's own courses — the given day's golf items first (most specific:
   a South Africa trip could still have one UK add-on day), then every
   day in the trip, then the wishlist — falling back to Explore's pill
   only if the trip itself carries no nation signal yet (e.g. a brand-new
   trip with nothing added), and finally unrestricted. Returns
   'GBR'/'IRL'/'ZAF'/null, matching orsGeocode()'s `country` vocabulary. */
function tbTripCountryCode(dayId){
  const codeFor=i=>{const n=courseNation(i);return n==='ie'?'IRL':n==='za'?'ZAF':n==='gb'?'GBR':null;};
  const day=dayId==null?null:tripDays.find(d=>d.id===dayId);
  if(day)for(const it of tripDayItems(day))if(it.type==='golf'){const c=codeFor(it.i);if(c)return c;}
  for(const d of tripDays)for(const it of tripDayItems(d))if(it.type==='golf'){const c=codeFor(it.i);if(c)return c;}
  for(const i of tripSeq){const c=codeFor(i);if(c)return c;}
  return typeof exploreCountryCode==='function'?exploreCountryCode():null;
}
/* GOLF-57: the pane's search bar now lives in the shared chrome above
   every tab (moved up again per GOLF-53's spirit) and adds straight into
   whichever day the Add tab currently has selected (tbDayShown), falling
   back to a plain cart add (tbSelect) when no day exists yet. Search
   itself is still course-only — there's no hotel/city database to search
   against (see tbPromptHotel/tbPromptPoi for those, manual-entry only). */
/* GOLF-58: adding a course used to leave it in "Unscheduled" unless a day
   already existed and was explicitly chosen — a real 3-step tax (add
   course, add a day, then assign it) on every single addition. Now: no
   day picked and none exist yet -> silently create Day 1 and drop it
   there; no day picked but days already exist -> use whichever day is
   currently showing (tbDayShown), defaulting to the last day. A course
   only ever lands in Unscheduled if the visitor explicitly picks
   "Unscheduled" from a row's own dropdown afterwards. */
/* GOLF-62: the default entry point for adding a course — leaves it as an
   entry in tripUnscheduled() (the "wishlist") rather than force-landing it
   on a day. Matches the stakeholder's own worked example and every
   reference app researched (Wanderlog/Roadtrippers/Outing.golf): gather
   candidates first, commit them to specific days second. Adding straight
   to a specific day (tbAddToDay below) stays available as an explicit
   secondary action while a day is focused — not removed, just no longer
   the default. */
/* GOLF-82: GOLF-69 (item 8)'s "the first course/place added starts the
   trip and lands straight on Day 1" exception is reverted, on the
   stakeholder's own explicit instruction after using the live site as a
   real user ("my prior recommendations no longer hold ... the latest
   suggestion ... is the best way to implement this going forward"). A
   course added by ANY path — this wishlist button, a map popup's "Add to
   trip" (toggleTrip, trip-model.js), or Discover's tbSelect() — always
   lands in the wishlist (tripUnscheduled()) now, never auto-creates or
   auto-assigns Day 1, whether the trip is empty or not. The only way a
   trip still gets a Day 1 for free is by picking a PLACE as a starting
   point (see tbAddPlaceToTrip below) — a non-golf location is the one
   thing that's allowed to seed a day, exactly as confirmed with the
   stakeholder. Adding straight to a specific day (tbAddToDay below) stays
   available as an explicit power path while a day is focused. */
// GOLF-91: adding a course is the "select a course" half of "select a
// course or a place, see nearby regardless" — clearing tbPlaceAnchor here
// hands the merged Nearby scope's anchor back to the course just added,
// exactly the recency rule tbNearbyAnchorPoint() (trip-route.js) expects.
function tbAddToWishlist(i){
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;tbPlaceAnchor=null;}
  saveState();render();
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}else{tripDrawCart(true);}
}
function tbAddToDay(i,dayId){
  if(dayId==null){
    if(!tripDays.length)tripDayAdd();
    const shown=tripDays.find(d=>d.id===tbDayShown);
    dayId=(shown||tripDays[tripDays.length-1]).id;
  }
  if(!TRIP.has(i)){TRIP.add(i);tripSeq.push(i);tripLastAdded=i;tbAnchor=i;tbPlaceAnchor=null;}
  tripDaySetCourse(i,dayId);
  tbDayShown=dayId;
  saveState();render();renderTripBuilder();tbDrawMap(false);
  if(typeof mapFitDay==='function')mapFitDay(dayId); // GOLF-191 (AC 2): keep the new stop and the rest of its day in view
}
/* GOLF-61: place results for the unified search bar, fetched via the same
   orsGeocode() already used for day place-fields — populated asynchronously
   by the debounced call wired in renderTripBuilder() below. null = not
   fetched yet / a fetch is in flight for the current query text; [] = a
   fetch completed with no place matches. */
let tbUnifiedPlaceResults=null;
/* GOLF-61: picking a place from the unified search always anchors the
   whole trip there (confirmed with the stakeholder) — jumps Discover's
   "Nearby" scope (GOLF-91: merged with the old separate "Near a place"
   tab) to this point and clears the search, same behavior as the
   existing Discover-tab place box, just reachable from the one main
   search bar now instead of a second, buried box. */
/* GOLF-82: the "Anchor here" (lens-only) and "+ Add to trip" (day-only)
   buttons are merged into this one action, on the stakeholder's explicit
   instruction after real-world use ("get rid of the anchor here option").
   A place result now does exactly one thing: it becomes a starting point
   for the trip. Two things it must always do, confirmed with the
   stakeholder / carried over from the two functions this replaces:
   (a) it still becomes Day 1 when picked on a trip that hasn't started
       yet (kind stays the tripDayAdd() default 'golf', so a round can go
       straight on it) — the ONE way a course/place-less trip still gets
       an automatic Day 1, now that GOLF-82 removed that behavior from
       plain course adds (see tbAddToWishlist above); a later place is
       appended as its own 'free' day instead, alongside whatever's
       already there.
   (b) it ALWAYS moves tbPlaceAnchor (+tbDiscoveryTab='anchor') to this
       point, even on an already-started trip — this is still the only
       code path that ever sets tbPlaceAnchor to a real value, and the
       merged "Nearby" scope (GOLF-91) has no other way to get seeded by a
       place, so dropping this side effect would silently strand it. */
let tbPlaceAddedNote=null;
function tbAddPlaceToTrip(lat,lng,label){
  const fresh=tripDays.length===0;
  const prevAnchor=tbPlaceAnchor,prevTab=tbDiscoveryTab;
  tripDayAdd();
  const d=tripDays[tripDays.length-1];
  if(!fresh)d.kind='free';
  tripDaySetPlaceGeo(d.id,label,lat,lng);
  tbDayShown=d.id;
  tbPlaceAnchor={label,lat,lng};
  tbDiscoveryTab='anchor'; // GOLF-91: "Near a place" merged into "Nearby"
  tbSearchQ='';tbUnifiedPlaceResults=null;
  tbPlaceAddedNote={label,day:tripDays.length};
  saveState();
  // GOLF-69a: don't yank a visitor who's mid-Build back to Plan/Discover.
  if(appMode!=='build')setAppMode('plan');
  else{renderTripBuilder();tbDrawMap();}
  /* GOLF-150 W3: adding a place creates a whole itinerary day — a much
     bigger consequence than "+ Wishlist" beside it — and the old
     "Added X as Day N" note lived in search results that had just been
     cleared, so it never showed. A toast confirms it and offers Undo. */
  const dayId=d.id,n=tripDays.length;
  tbToast(`Added <b>${esc(tripShortPlace(label))}</b> as Day ${n}`,[
    {label:'Undo',fn:()=>{tripDayRemove(dayId);tbPlaceAnchor=prevAnchor;tbDiscoveryTab=prevTab;tbPlaceAddedNote=null;
      saveState();renderTripBuilder();tbDrawMap();}},
    ...(appMode!=='build'?[{label:'Open',fn:()=>enterBuildMode()}]:[])
  ]);
}
/* GOLF-187: one place to forget the current query — the input's value, the
   two result caches and the temporary map marker that belongs to them. */
function tbClearUnifiedSearch(){
  tbSearchQ='';
  tbUnifiedPlaceResults=null;
  tbPlaceAddedNote=null;
  const el=document.getElementById('tb-unified-search');
  if(el)el.value='';
  if(typeof tbClearTempPlaceMarker==='function')tbClearTempPlaceMarker();
}
/* GOLF-187: the place card the focused-place marker opens (js/map.js).
   Two actions, both of which used to be buttons in the search list:
   re-scope Discover's "Nearby" to here, or make this place a day. */
function tbPlaceCardHTML(lat,lng,label){
  const started=tbPlaceAnchor!=null||tripDays.length>0;
  const a=`${lat},${lng},'${String(label).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
  return`<div class="place-pop">
    <div class="place-pop-name">📍 ${esc(tripShortPlace(label))}</div>
    ${label.includes(',')?`<div class="place-pop-sub">${esc(label.slice(label.indexOf(',')+1).trim())}</div>`:''}
    <button type="button" class="tb-btn is-sm place-pop-btn" onclick="tbPlaceShowNearby(${a})">⛳ Courses near here</button>
    <button type="button" class="tb-btn is-sm is-primary place-pop-btn" onclick="tbAddPlaceToTrip(${a})">${started?'＋ Add as a day':'Start a trip here'}</button>
  </div>`;
}
/* GOLF-112 set tbPlaceAnchor as a side effect of merely focusing a place,
   because focusing was then the only thing a place row could do. GOLF-187
   gives the card an explicit button for it, so looking at a town on the
   map no longer silently re-scopes the Discover list underneath. */
function tbPlaceShowNearby(lat,lng,label){
  tbPlaceAnchor={label,lat,lng};
  tbDiscoveryTab='anchor';
  if(typeof map!=='undefined'&&map)map.closePopup();
  if(appMode!=='plan')setAppMode('plan');
  else{renderTripBuilder();tbDrawMap();}
  if(typeof showMobileList==='function')showMobileList();
}
/* GOLF-150: one transient toast (bottom of the list panel, above the mobile
   "Show map" pill). A new toast replaces the old; actions dismiss it. */
let tbToastTimer=null;
function tbToast(html,actions=[],ms=6000){
  let el=document.getElementById('tb-toast');
  if(!el){el=document.createElement('div');el.id='tb-toast';el.className='tb-toast';el.setAttribute('role','status');(document.querySelector('.panel')||document.body).appendChild(el);}
  el.innerHTML=`<span class="tb-toast-msg">${html}</span>`+actions.map((a,k)=>`<button type="button" class="tb-toast-btn" data-k="${k}">${esc(a.label)}</button>`).join('');
  el.querySelectorAll('.tb-toast-btn').forEach(b=>b.onclick=()=>{tbToastHide();actions[+b.dataset.k].fn();});
  el.classList.add('is-on');
  clearTimeout(tbToastTimer);tbToastTimer=setTimeout(tbToastHide,ms);
}
function tbToastHide(){const el=document.getElementById('tb-toast');if(el)el.classList.remove('is-on');clearTimeout(tbToastTimer);}
/* ── GOLF-187: one ranked list.

   Searching "st andrews" used to put ten courses above the town, which
   came twelfth, in a separate "Towns & cities" section below the fold —
   so the one result a visitor was actually looking for was the hardest to
   find. Kingsbarns and Lundin sat in that list with no reason given,
   "Saint Andrews Major" appeared twice, and course rows and place rows
   used different verbs for the same idea.

   Now there is one list, ranked. A town that has courses near it becomes
   a group heading with those courses underneath, which is both what the
   owner asked for and what pulls the town up the page: the courses that
   used to outrank it are now its children, not its competitors. */
const TB_PLACE_RADIUS_MI=15;
const TB_PLACE_CHILDREN_MAX=10;
function tbSearchNorm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
/* Deliberately coarse: whole-word-prefix beats substring beats nothing.
   A finer scale would be false precision — the ORS geocoder and the course
   names disagree about punctuation and word order far more than a few
   points of relevance could express. */
function tbMatchScore(text,q){
  if(!text||!q)return 0;
  if(text===q)return 100;
  if(text.startsWith(q))return 80;
  if(text.split(' ').some(w=>w.startsWith(q)))return 65;
  if(text.includes(q))return 50;
  return 0;
}
// The same "is this course offerable right now" rule tbSearchResults()
// applies, so a proximity child can never be something the text search
// would have refused to show.
/* GOLF-185d: search now answers with the same set the map is drawing —
   courseShownOnMap() (a SA club outside the ringfenced top-100 was
   findable in search but had no pin) and the active filters. */
function tbCourseOfferable(i){
  return !TRIP.has(i)&&bookable(i)&&courseShownOnMap(i)&&courseFilterPasses(i)
    &&(appMode==='build'||!state.nation||courseNation(i)===state.nation);
}
function tbUnifiedSearchModel(){
  const q=tbSearchNorm(tbSearchQ);
  if(!q)return null;
  const matched=new Map();
  tbSearchResults().forEach(i=>{
    const nameS=tbMatchScore(tbSearchNorm(V(i,'n')),q);
    const regS=tbMatchScore(tbSearchNorm(C[i].r),q);
    /* Every row that isn't an outright name match says why it is here.
       "Kingsbarns" appearing under a search for St Andrews with nothing
       said about it was the reported complaint — it matches on a mention
       buried in its notes, which is true but not something a visitor can
       see. A fuzzy/notes hit scores 30: it matched something, just nothing
       anyone would recognise as the name or the region. */
    matched.set(i,{type:'course',i,name:!!nameS,
      score:nameS||regS*0.7||30,
      reason:nameS?null:(regS?`in ${C[i].r}`:`mentions "${tbSearchQ.trim()}"`)});
  });
  /* "Saint Andrews Major" twice was two geocoder rows for one village.
     Two decimal places is about a kilometre — close enough that a second
     row of the same name is the same place, far enough apart that two
     genuinely different towns sharing a name still both show. */
  const seen=new Set(),places=[];
  (Array.isArray(tbUnifiedPlaceResults)?tbUnifiedPlaceResults:[]).forEach(p=>{
    if(!isFinite(p.lat)||!isFinite(p.lng))return;
    const short=tripShortPlace(p.label);
    const key=tbSearchNorm(short)+'@'+p.lat.toFixed(2)+','+p.lng.toFixed(2);
    if(seen.has(key))return;
    seen.add(key);
    /* A place the geocoder returned whose NAME doesn't match the query
       (searching "st andrews" also finds Hornchurch, for its St Andrews
       Avenue) is a weak answer, and must not climb the list on the
       strength of how many courses happen to sit near it. */
    const nameScore=tbMatchScore(tbSearchNorm(short),q);
    places.push({type:'place',p,short,score:nameScore||15,named:!!nameScore,children:[],total:0});
  });
  /* Strongest place first, and a course belongs to only one of them — so
     two overlapping towns don't each list the same course, and the one
     that matched the query best gets it. */
  places.sort((a,b)=>b.score-a.score);
  const claimed=new Set();
  places.forEach(pl=>{
    const plNorm=tbSearchNorm(pl.short);
    const kids=[];
    C.forEach((c,i)=>{
      if(claimed.has(i)||!tbCourseOfferable(i))return;
      const miles=haversineMiles(pl.p.lat,pl.p.lng,c.lat,c.lng);
      if(miles>TB_PLACE_RADIUS_MI){
        // Far away, but named after the place ("St Andrews Major GC") —
        // still this town's course as far as a visitor is concerned.
        if(!matched.has(i))return;
        if(!plNorm||!tbSearchNorm(V(i,'n')+' '+c.r).includes(plNorm))return;
      }
      kids.push({i,miles,hit:matched.get(i)||null});
    });
    // Text matches first — they are why the visitor typed what they typed —
    // then nearest first among the rest.
    kids.sort((a,b)=>(a.hit?0:1)-(b.hit?0:1)||a.miles-b.miles);
    kids.forEach(k=>claimed.add(k.i));
    pl.total=kids.length;
    pl.children=kids.slice(0,TB_PLACE_CHILDREN_MAX).map(k=>({type:'course',i:k.i,
      // Under a heading, "near St Andrews" is the more useful reason than
      // whatever text the fuzzy matcher happened to hit.
      reason:k.hit&&k.hit.name?null:`near ${pl.short}`}));
    // A town that gathers courses is a more useful answer than any one of
    // them, and it has just absorbed the rows that outranked it.
    if(pl.total&&pl.named)pl.score+=15;
  });
  const loose=[...matched.values()].filter(e=>!claimed.has(e.i));
  return{rows:[...places,...loose].sort((a,b)=>b.score-a.score).slice(0,20),
         placesState:tbUnifiedPlaceResults};
}
/* GOLF-187: "tapping a row moves the map to it and opens its card" has a
   precondition the search doesn't share: GOLF-81 keeps the map empty until
   a nation pill is picked, and the Explore filters can hide a course the
   search still deliberately offers. Without this, tapping a result on a
   fresh load did nothing at all — there was no marker to open.
   The nation follows the tap, because picking it is the one filter a
   visitor hasn't consciously set. Anything they HAVE set is theirs to
   keep, so a course still hidden by it says so rather than being
   silently un-filtered. */
function tbSearchGoToCourse(i){
  if(!passes(i)){
    const n=courseNation(i);
    if(n&&state.nation!==n){
      state.nation=n;
      if(state.sort!=='rank')state.sort='rank';
      saveState();render();
    }
  }
  if(!passes(i)){
    tbToast(`<b>${esc(V(i,'n'))}</b> is hidden by your current filters.`);
    return;
  }
  goToCourse(i);
}
function tbSearchCourseRowHTML(e,day){
  const i=e.i;
  const why=e.reason?` · <span class="tb-why">${esc(e.reason)}</span>`:'';
  return`<div class="tb-row tb-sr-row" onclick="if(!event.target.closest('button'))tbSearchGoToCourse(${i})" title="Show ${esc(V(i,'n'))} on the map">
    <div>⛳ <a href="#" class="linkbtn" onclick="event.preventDefault();event.stopPropagation();tbSearchGoToCourse(${i})">${esc(V(i,'n'))}</a>
      <div class="cart-region">${esc(C[i].r)} · ${ACCESS[V(i,'a')].label.toLowerCase()}${why}</div></div>
    <div style="display:flex;gap:var(--sp-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
      <button class="tb-btn is-sm is-primary" onclick="event.stopPropagation();tbAddToWishlist(${i})">＋ Add to trip</button>
      ${day?`<button class="tb-btn is-sm" onclick="event.stopPropagation();tbAddToDay(${i},${day.id})">＋ Day ${tripDays.indexOf(day)+1}</button>`:''}
    </div>
  </div>`;
}
function tbUnifiedSearchResultsHTML(){
  const raw=tbSearchQ.trim();
  if(!raw)return'';
  const model=tbUnifiedSearchModel();
  if(!model)return'';
  // GOLF-62: a focused day grows a second, explicit "+ Add to Day N".
  const day=(appMode==='build'&&tbBuildTab==='itin'&&tbDayShown!=null)?tripDays.find(d=>d.id===tbDayShown):null;
  /* Phase 22 fix, kept: undefined means the geocode request failed, [] means
     it succeeded with nothing. A real outage must not read as "no towns
     match", or place search looks broken rather than temporarily down. */
  const outage=model.placesState===undefined
    ?`<p class="hint" style="margin:0 0 var(--sp-2)">Place search is temporarily unavailable — showing golf courses only.</p>`:'';
  if(!model.rows.length)
    return outage||`<p class="hint">No places or bookable courses match "${esc(raw)}".</p>`;
  const html=model.rows.map(e=>{
    if(e.type==='course')return tbSearchCourseRowHTML(e,day);
    const p=e.p;
    const count=e.total?` · <span class="tb-sr-count">${e.total} course${e.total===1?'':'s'}</span>`:'';
    const region=p.label.includes(',')?p.label.slice(p.label.indexOf(',')+1).trim():'';
    /* GOLF-187: the row is the tap target and the place's own card carries
       the actions (js/map.js tbFocusPlaceOnMap) — two buttons per town in
       the list is exactly what pushed the town below the fold. */
    const head=`<div class="tb-row tb-sr-place tb-unified-place-focus" role="button" tabindex="0"
      data-lat="${p.lat}" data-lng="${p.lng}" data-label="${esc(p.label)}"
      title="Show ${esc(e.short)} on the map">
      <div><span class="tb-sr-place-name">📍 ${esc(e.short)}</span>${count}
        ${region?`<div class="cart-region">${esc(region)}</div>`:''}</div>
    </div>`;
    const kids=e.children.length
      ?`<div class="tb-sr-kids">${e.children.map(k=>tbSearchCourseRowHTML(k,day)).join('')}${
          e.total>e.children.length?`<p class="hint tb-sr-more">${e.total-e.children.length} more near ${esc(e.short)} — tap the place to see them on the map.</p>`:''}</div>`
      :'';
    return`<div class="tb-sr-group">${head}${kids}</div>`;
  }).join('');
  return outage+html;
}
/* GOLF-33: day-by-day schedule view for the pane's cart section — a
   "move to day" select per cart course (assign/reassign/unschedule),
   a manually-entered drive-in estimate per day (except Day 1, which has
   no previous day to drive from), and an "Unscheduled" bucket for cart
   courses not yet placed on a day. Replaces the flat tripListHTML() only
   inside the pane — exports/outside-pane map feedback keep using the
   flat tripSeq order untouched. */
/* GOLF-58: "+ New day" is picked straight from the row's own dropdown —
   no more leaving the course editor to hit "+ Add day" separately then
   coming back to assign it. */
function tbAssignCourseDay(i,val){
  let dayId=val===''?null:Number(val);
  if(val==='new'){tripDayAdd();dayId=tripDays[tripDays.length-1].id;}
  tripDaySetCourse(i,dayId);
  if(dayId!=null)tbDayShown=dayId;
  renderTripBuilder();tbDrawMap();
}
/* GOLF-71: tripDaySelectHTML() (the per-row "move to day" <select>) is
   retired — tbDayMenuItemsHTML() renders the same choices as 44px rows
   inside each stop's "⋯" menu instead. */
/* GOLF-71 (workstream D, defect 2): every draggable row's inner <a> now
   carries draggable="false". An anchor is natively draggable, so grabbing
   the course NAME — the largest and most obvious thing in the row — used
   to start a *link* drag carrying "#" instead of the row drag. No drop
   target here accepts that, so the row simply refused to move: the
   stakeholder's "it doesn't seem to pick it up when I drag and drop it".
   The row itself also sets user-select:none (see <style>) so a slow press
   can't start a text-selection drag instead.

   GOLF-71 (workstream C): the per-row "move to day" <select> and bare ✕
   moved into one 36px "⋯" menu. The sketch shows a stop as name + price;
   a 11px select and a 4px-padded ✕ were precisely the "small, finicky
   buttons" called out in the brief. Dragging is now the primary way to
   move a stop, and the menu is the accessible/precise fallback. */
function tbRowMenuHTML(inner){
  return`<details class="tb-rowmenu"><summary title="More" aria-label="More actions">⋯</summary>
    <div class="tb-drop-body is-right">${inner}</div></details>`;
}
function tbRowDragAttrs(startExpr,dropExpr){
  return`draggable="true"
      ondragstart="${startExpr}"
      ondragend="tbDragEnd();"
      ondragover="event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';tbDropOver(this);"
      ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);${dropExpr}"`;
}
/* A wishlist (unscheduled) course row — no item of its own yet, so it
   drags by course index. */
function tripDayCourseRowHTML(i,dayId){
  const fee=feeNumberFor(i,'wd');
  const menu=tbRowMenuHTML(
    `<div class="tb-menu-label">Move to</div>${tbDayMenuItemsHTML(i,dayId)}
     <div class="tb-menu-sep"></div>
     <button type="button" class="tb-menu-item is-danger" onclick="tripRemoveCourse(${i});">🗑 Remove from trip</button>`);
  return`<div class="tb-day-course tb-item-golf" ${tbRowDragAttrs(`tbDragSetCourse(${i},event,this);`,`tbDropOn(${dayId==null?'null':dayId},${i});`)}>
    <span class="tb-drag-handle" title="Drag to reorder">⠿</span>
    <span class="tb-item-icon">⛳</span>
    <div class="tb-item-main">
      <a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
      <div class="cart-region">${esc(C[i].r)}</div>
    </div>
    <span class="tb-item-price">${tbDualPriceHTML(fee==null?null:fee*groupSizeFor(),courseCurrency(i))}</span>
    <div class="tb-item-actions">${menu}</div>
  </div>`;
}
/* The day list for a row's "⋯ → Move to" menu — the same choices the old
   inline <select> offered, as 44px menu rows. */
function tbDayMenuItemsHTML(i,currentDayId){
  return[`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'')">${currentDayId==null?'✓':'&nbsp;&nbsp;'} Shortlist</button>`]
    .concat(tripDays.map((d,idx)=>`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'${d.id}')">${d.id===currentDayId?'✓':'&nbsp;&nbsp;'} Day ${idx+1}</button>`))
    .concat([`<button type="button" class="tb-menu-item" onclick="tbAssignCourseDay(${i},'new')">＋ New day</button>`]).join('');
}
/* GOLF-63: one scheduled stop of any type, draggable into any position in
   any day. Golf rows keep their existing "move to day" dropdown and
   remove-from-trip action; hotel/POI rows get a remove of their own (they
   exist only on that day, so there's nothing to unschedule them to). The
   drag/drop wiring is identical across all three types — that's the whole
   point of collapsing the old three fields into one list. */
function tripDayItemRowHTML(d,it){
  const det=tripItemPriceDetail(d,it);
  const price=det.total;
  // GOLF-74: hotel/POI rows show the effective total, and a per-person stay
  // shows how it got there ("£90 × 2 (sharing) = £180").
  const priceLabel=price!=null?` · ${tripPriceLabel(det)}`:'';
  // GOLF-69 (item 10): one icon vocabulary shared by the list rows and the
  // map markers — hotel emoji for stays, location pin for POIs.
  const icon=it.type==='golf'?'⛳':it.type==='hotel'?'🏨':'📍';
  const noGeo=it.type!=='golf'&&tripItemPoint(it)==null;
  /* GOLF-71 copy audit: the price used to be repeated in the grey meta
     line AND (on golf) implied by the fee — it now appears once, in the
     right-hand price column the sketch calls for. The meta line is the
     region for golf, and the stop kind for everything else. */
  const main=it.type==='golf'
    ?`<a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${it.i})">${esc(tripItemName(it))}</a>
       <div class="cart-region">${esc(C[it.i]?C[it.i].r:'')}${((typeof feeCartFor==='function')&&feeCartFor(it.i)||{}).status==='mandatory'?' · <span class="wt">buggy compulsory</span>':''}</div>`
    :`<span class="tb-item-name">${esc(tripItemName(it))}</span>
       <div class="cart-region">${it.type==='hotel'?'Stay':'Stop'}${noGeo?' · <span title="No location picked, so no drive time can be calculated to this stop">no location</span>':''}</div>`;
  /* Merge (GOLF-71 + GOLF-73): GOLF-73 shipped Edit as a second inline button
     beside ✕. GOLF-71 collapsed every per-row action into one overflow menu
     (and moved "move to day" out of a <select> into it), so Edit lives there
     now rather than as a third control competing for the row's width. Same
     entry point (tbEditStop), same rule: hotel/POI only. A golf row has
     nothing editable here — name, fee and coordinates all come from the
     course dataset (edited in the corrections editor), and its one trip-level
     fact, the day it sits on, is the "Move to" section of this same menu. */
  const menu=tbRowMenuHTML(
    (it.type==='golf'?`<div class="tb-menu-label">Move to</div>${tbDayMenuItemsHTML(it.i,d.id)}<div class="tb-menu-sep"></div>`
      :`<button type="button" class="tb-menu-item" onclick="tbEditStop(${d.id},'${it.id}')">✎ Edit</button><div class="tb-menu-sep"></div>`)+
    `<button type="button" class="tb-menu-item is-danger" onclick="tripRemoveItem(${d.id},'${it.id}');">🗑 Remove</button>`);
  return`<div class="tb-day-course tb-item-${it.type}" ${tbRowDragAttrs(`tbDragSetItem(${d.id},'${it.id}',event,this);`,`tbDropInDay(${d.id},'${it.id}');`)}>
    <span class="tb-drag-handle" title="Drag to reorder">⠿</span>
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main">${main}</div>
    ${/* Merge (GOLF-71 + GOLF-74): the effective total goes in GOLF-71's
         narrow price column, and a per-person-sharing stay explains its
         arithmetic in the column's tooltip rather than overflowing the
         column with "£90 × 2 (sharing) = £180". The full worked label still
         renders in the Itinerary tab and the Costs breakdown, which have the
         width for it. */''}
    <span class="tb-item-price"${det.sharing?` title="${esc(priceLabel.replace(/^ · /,''))}"`:''}>${estMark(!!det.est)}${tbDualPriceHTML(price,det.cur||'GBP')}</span>
    <div class="tb-item-actions">${menu}</div>
  </div>`;
}
