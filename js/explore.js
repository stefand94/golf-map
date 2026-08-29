/* ============================================================
   js/explore.js — the Explore page: filter chips, the fee-range
   control, place + course search, sorting/filtering/fuzzy matching,
   the nearest-to-trip list, render(), and the map legend.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

function buildChips(id,items,key,withIcon){
  document.getElementById(id).innerHTML=items.map(([v,l,colOrArch,pole])=>
    `<button class="chip" aria-pressed="false" data-k="${key}" data-v="${v}">${withIcon?flagSVG(colOrArch,pole,13,false):''}${l}</button>`).join('')}
buildChips('f-access',Object.entries(ACCESS).map(([k,v])=>[k,v.label,v.colour,v.pole]),'access',true);
buildChips('f-arch',ARCHS,'arch',false);
buildChips('f-region',REGIONS.map(r=>[r,r]),'region',false);
buildChips('f-flag',[['ranked','Top 100 ranked'],['top100','England Top 100 only'],['topScot','Scotland only'],['topWales','Wales only'],['weekend','Open at weekends'],['walk','Walk from station'],['winter','Good in winter'],['sweep','Sweep finds'],['edited','My corrections'],['played','Played'],['want','Want to play']],'flag',false);
function updateFilterBadges(){
  [['arch','b-arch'],['region','b-region'],['flag','b-flag']].forEach(([k,id])=>{
    const b=document.getElementById(id),n=state[k].size;
    b.hidden=!n;if(n)b.textContent=n;});
  /* GOLF-69: with everything behind one collapsed dropdown, the summary
     needs its own count or an active filter becomes invisible. Counts each
     group that's narrowing anything, plus the fee range as one. */
  const total=state.access.size+state.arch.size+state.region.size+state.flag.size
    +((state.feeMin!=null||state.feeMax!=null)?1:0);
  const b=document.getElementById('b-filters');
  b.hidden=!total;if(total)b.textContent=total;
}
/* GOLF-69 (item 2): the green-fee range control. Bounds come from the data
   itself (rounded out to a tidy £25) rather than a hardcoded ceiling, so
   the slider still spans the real spread if the dataset grows a pricier
   course later. A thumb parked at either extreme means "no bound on this
   end" (state stays null) — otherwise dragging max to the top would
   silently exclude every unpriced course. */
/* Scaled to the 95th percentile, not the absolute maximum: one £1,150
   championship green fee would otherwise squash every ordinary course into
   the leftmost 10% of the track, where a £10 difference is sub-pixel. The
   top of the slider therefore means "and up" (the bound goes null), so
   nothing is ever hidden by the scale — the readout shows "£N+" to say so.
   Typing a number above the top of the scale in the max box lands on that
   same unbounded top: broader than asked for, never narrower, so it can't
   silently hide a course that matched. */
const FEE_SLIDER_MAX=(()=>{
  const fees=C.map((c,i)=>feeNum(i)).filter(f=>f<9999).sort((a,b)=>a-b);
  if(!fees.length)return 300;
  return Math.max(50,Math.ceil(fees[Math.floor(fees.length*0.95)]/25)*25);
})();
function feeRangeEls(){return{
  minR:document.getElementById('fee-min-r'),maxR:document.getElementById('fee-max-r'),
  minN:document.getElementById('fee-min'),maxN:document.getElementById('fee-max'),
  out:document.getElementById('fee-readout')};}
/* GOLF-75: the four fixed price bands are back — as quick-select shortcuts
   ON TOP of the range slider, not as a second filter system. Ranges are the
   original BANDS definitions from data/config.js (≤£30 / £31–70 / £71–150 /
   £151+), and clicking one simply calls feeRangeSet() with that range, so
   there is exactly one underlying piece of filter state (feeMin/feeMax) and
   the slider and chips can never disagree. A chip highlights when the
   current range is exactly its range; dragging the slider off it clears the
   highlight. state.price stays unused — the old Set-based band filtering is
   deliberately not resurrected. */
const FEE_BANDS=[
  ['low','≤ £30',null,30],
  ['mid','£31–70',31,70],
  ['high','£71–150',71,150],
  ['premium','£151+',151,null]
];
/* Compare against the SAME normalisation feeRangeSet() applies (0 -> null at
   the bottom, the slider ceiling -> null at the top) so "is this band active?"
   asks the question in the stored vocabulary, not the chip's. */
function feeBandNorm(lo,hi){
  const l=lo==null?0:lo,h=hi==null?FEE_SLIDER_MAX:Math.min(hi,FEE_SLIDER_MAX);
  return[l<=0?null:l,h>=FEE_SLIDER_MAX?null:h];
}
function feeBandActive(lo,hi){
  const[nl,nh]=feeBandNorm(lo,hi);
  return state.feeMin===nl&&state.feeMax===nh;
}
function renderFeeBands(){
  const box=document.getElementById('f-fee-bands');
  if(!box)return;
  box.innerHTML=FEE_BANDS.map(([k,label,lo,hi])=>
    /* Deliberately NOT class="chip": the generic chip handler at the bottom
       of this file keys off data-k/data-v into a state Set, which these
       range shortcuts have nothing to do with. */
    `<button type="button" class="fee-band-chip" data-band="${k}" aria-pressed="${feeBandActive(lo,hi)}">${label}</button>`).join('');
}
function feeBandApply(key){
  const b=FEE_BANDS.find(x=>x[0]===key);if(!b)return;
  const[,,lo,hi]=b;
  // Clicking the already-active band clears back to "any price".
  if(feeBandActive(lo,hi)){feeRangeSet(0,FEE_SLIDER_MAX);return;}
  feeRangeSet(lo==null?0:lo,hi==null?FEE_SLIDER_MAX:hi);
}
function feeRangeSync(){
  renderFeeBands();
  const e=feeRangeEls();
  const lo=state.feeMin!=null?state.feeMin:0,hi=state.feeMax!=null?state.feeMax:FEE_SLIDER_MAX;
  e.minR.value=lo;e.maxR.value=hi;
  e.minN.value=state.feeMin!=null?state.feeMin:'';
  e.maxN.value=state.feeMax!=null?state.feeMax:'';
  e.out.textContent=(state.feeMin==null&&state.feeMax==null)?'any price'
    :`£${lo} – ${hi>=FEE_SLIDER_MAX?`${FEE_SLIDER_MAX}+`:`£${hi}`}`;
}
/* Takes the two raw numbers, keeps them in order, and normalises an
   at-the-extreme value back to null ("unbounded"). */
function feeRangeSet(lo,hi){
  lo=Math.max(0,Math.min(FEE_SLIDER_MAX,isFinite(lo)?lo:0));
  hi=Math.max(0,Math.min(FEE_SLIDER_MAX,isFinite(hi)?hi:FEE_SLIDER_MAX));
  if(lo>hi){const t=lo;lo=hi;hi=t;}
  state.feeMin=lo<=0?null:lo;
  state.feeMax=hi>=FEE_SLIDER_MAX?null:hi;
  feeRangeSync();updateFilterBadges();saveState();render();
}
(function wireFeeRange(){
  const e=feeRangeEls();
  /* GOLF-75: step 1 (was 5). The band shortcuts set odd boundaries (£31,
     £71, £151) and a step-5 track snapped the thumb to the nearest multiple,
     so the slider silently disagreed with the readout and the number boxes,
     which read the exact stored value. Dragging at £1 granularity is strictly
     more precise; the typed min/max boxes keep their £5 step. */
  [e.minR,e.maxR].forEach(r=>{r.min=0;r.max=FEE_SLIDER_MAX;r.step=1;});
  [e.minN,e.maxN].forEach(n=>{n.max=FEE_SLIDER_MAX;n.placeholder=n===e.minN?'0':String(FEE_SLIDER_MAX);});
  const fromSliders=()=>feeRangeSet(parseFloat(e.minR.value),parseFloat(e.maxR.value));
  e.minR.addEventListener('input',fromSliders);
  e.maxR.addEventListener('input',fromSliders);
  const fromNumbers=()=>feeRangeSet(
    e.minN.value.trim()===''?0:parseFloat(e.minN.value),
    e.maxN.value.trim()===''?FEE_SLIDER_MAX:parseFloat(e.maxN.value));
  e.minN.addEventListener('change',fromNumbers);
  e.maxN.addEventListener('change',fromNumbers);
  // GOLF-75: delegated, because renderFeeBands() rewrites the chips on every
  // range change to refresh their pressed state.
  const bands=document.getElementById('f-fee-bands');
  if(bands)bands.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-band]');
    if(b)feeBandApply(b.dataset.band);
  });
  feeRangeSync();
})();
document.querySelectorAll('.chip').forEach(ch=>ch.addEventListener('click',()=>{
  const k=ch.dataset.k,v=ch.dataset.v,on=ch.getAttribute('aria-pressed')==='true';
  ch.setAttribute('aria-pressed',String(!on));on?state[k].delete(v):state[k].add(v);updateFilterBadges();saveState();render();
  /* GOLF-22: turning on "England Top 100 only" is exactly the case that got
     lost off-screen — jump the map to wherever those results actually are. */
  if(k==='flag'&&(v==='top100'||v==='topScot'||v==='topWales')&&!on)fitToResults();}));
/* reflect any filters restored from localStorage onto the actual chip elements */
document.querySelectorAll('.chip').forEach(ch=>{
  if(state[ch.dataset.k].has(ch.dataset.v))ch.setAttribute('aria-pressed','true');
});
['g-arch','g-region','g-flag'].forEach((id,idx)=>{
  const k=['arch','region','flag'][idx];
  if(state[k].size)document.getElementById(id).open=true;
});
// GOLF-69: a filter restored from localStorage would otherwise be invisible
// inside the new collapsed Filters dropdown.
if(state.access.size||state.arch.size||state.region.size||state.flag.size||state.feeMin!=null||state.feeMax!=null)
  document.getElementById('g-filters').open=true;
updateFilterBadges();
document.getElementById('q').value=state.q;
document.getElementById('sort').value=state.sort;
/* GOLF-69 (item 1): "on the explore page, I am unable to search for a town
   or city. This should work the same as the unified search bar." The Explore
   search stays a course filter — that's what the list below it is — and
   additionally runs the same debounced orsGeocode() the Trip Builder's
   unified bar uses, rendering any place hits in their own strip above the
   list with the same two actions (start a trip here / add it to the trip).
   Deliberately the same 300ms debounce and same stale-response guard, so
   the two search boxes behave identically. null = nothing fetched yet. */
/* GOLF-72: Explore-mode place search is now PURE NAVIGATION. It previously
   reused the Trip Builder bar's result actions ("Start a trip here" / "+ Add
   to trip"), which put trip-building affordances on a page whose whole job is
   browsing — the stakeholder's ask was "search Islay, the map goes to Islay,
   full stop". Picking a result flies the map there and nothing else; no trip
   data is read or written from this strip. The Plan-mode unified search bar
   keeps both actions unchanged — that IS the trip-building surface.
   Merge note (GOLF-71 + GOLF-72): GOLF-71 replaced this strip's hand-rolled
   debounce with the shared tbGeocodeDebounced() below, so the local
   explorePlaceDebounce handle is gone; the navigate-only *rendering* and
   click handling below are GOLF-72's and are deliberately kept — GOLF-71
   predates GOLF-72 and still drew the two trip-action buttons here. */
let explorePlaceResults=null,explorePlaceQ='';
const EXPLORE_PLACE_ZOOM=11;
function renderExplorePlaces(){
  const box=document.getElementById('place-results');
  const list=explorePlaceResults;
  if(!list||!list.length){box.hidden=true;box.innerHTML='';return;}
  box.hidden=false;
  box.innerHTML=`<span class="flabel" style="margin:0">Towns &amp; cities</span>`+
    list.map(p=>`<button class="explore-place ep-go" type="button" data-lat="${p.lat}" data-lng="${p.lng}" title="Show this on the map">
      <span class="ep-name">📍 ${esc(p.label)}</span><span class="ep-hint">Show on map →</span>
    </button>`).join('');
}
document.getElementById('place-results').addEventListener('click',e=>{
  const b=e.target.closest('.ep-go');
  if(!b)return;
  const lat=parseFloat(b.dataset.lat),lng=parseFloat(b.dataset.lng);
  if(!isFinite(lat)||!isFinite(lng))return;
  // Same fly-to pattern the course cards use below.
  showMobileMap();map.flyTo([lat,lng],EXPLORE_PLACE_ZOOM,{duration:.6});
});
/* GOLF-71 (workstream B): the fifth hand-rolled copy of the debounce +
   stale-response guard is gone — this now shares tbGeocodeDebounced()
   with every other place lookup in the app, so all of them behave
   identically by construction rather than by four parallel edits. The
   results still render into Explore's own strip above the course list
   (not a dropdown), which is why this call site uses the debounce helper
   directly rather than the full tbAttachSearch() binding. */
function exploreSearchPlaces(q){
  explorePlaceQ=q;
  tbGeocodeDebounced('explore-q',q,list=>{
    explorePlaceResults=list;
    renderExplorePlaces();
  });
}
document.getElementById('q').addEventListener('input',e=>{
  state.q=e.target.value.toLowerCase();saveState();render();
  exploreSearchPlaces(e.target.value.trim());
});
document.getElementById('sort').addEventListener('change',e=>{state.sort=e.target.value;saveState();render()});
map.on('moveend zoomend',saveState);
document.getElementById('reset').addEventListener('click',()=>{
  ['access','price','region','flag','arch'].forEach(k=>state[k].clear());state.q="";
  state.feeMin=null;state.feeMax=null;feeRangeSync(); // GOLF-69
  document.getElementById('q').value="";document.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed','false'));
  explorePlaceResults=null;renderExplorePlaces(); // GOLF-69: clearing the search clears its place hits too
  updateFilterBadges();linkLayer.clearLayers();saveState();render();map.setView([51.45,-0.15],9)});
function toggle(id,lyr){const b=document.getElementById(id);
  b.addEventListener('click',()=>{const on=b.getAttribute('aria-pressed')==='true';
    b.setAttribute('aria-pressed',String(!on));on?map.removeLayer(lyr):map.addLayer(lyr)})}
/* t-rail/t-lbl/t-stn don't add/remove their layer directly — restyleRail()
   also gates them on zoom (RAIL_MIN_ZOOM/STN_MIN_ZOOM), so flip the button
   state and let it decide what's actually shown. */
['t-rail','t-lbl','t-stn'].forEach(id=>{
  const b=document.getElementById(id);
  b.addEventListener('click',()=>{
    b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));
    restyleRail();
  });
});

/* GOLF-70: feeNum/distOut/distMiles/rankNum moved to js/util.js — they are
   shared course metrics, not Explore-only ones: popupHTML() (js/map.js) calls
   distMiles() while building the marker popups at load time, which is before
   this file has been evaluated. See the note at the top of js/util.js. */
function passes(i){const c=C[i];
  if(state.access.size&&!state.access.has(V(i,'a')))return false;
  /* GOLF-69 (item 2): the four fixed BANDS chips became a real min/max
     range. A course whose weekday fee doesn't parse to a number (feeNum
     returns its 9999 sentinel — "POA", "members only", blank) can't be
     compared against a range, so it passes while the range is untouched
     and drops out the moment a bound is set. Stating a price ceiling and
     still being shown unpriced courses would be the more surprising
     behaviour of the two. */
  if(state.feeMin!=null||state.feeMax!=null){
    const f=feeNum(i);
    if(f>=9999)return false;
    if(state.feeMin!=null&&f<state.feeMin)return false;
    if(state.feeMax!=null&&f>state.feeMax)return false;
  }
  if(state.region.size&&!state.region.has(c.r))return false;
  if(state.arch.size){const tags=archTags(V(i,'arch'));if(![...state.arch].some(a=>tags.has(a)))return false}
  if(state.flag.has('ranked')&&!ranked(i))return false;
  if(state.flag.has('weekend')&&/members only|closed|restricted/i.test(V(i,'we')))return false;
  if(state.flag.has('walk')&&!/walk|minute/i.test(V(i,'walk')))return false;
  if(state.flag.has('winter')&&!c.winter)return false;
  if(state.flag.has('sweep')&&!c.sweep)return false;
  if(state.flag.has('top100')&&!c.top100)return false;
  if(state.flag.has('topScot')&&!c.topScot)return false;
  if(state.flag.has('topWales')&&!c.topWales)return false;
  if(state.flag.has('edited')&&!isEdited(i))return false;
  if(state.flag.has('played')&&!PLAYED.has(i))return false;
  if(state.flag.has('want')&&!WANT.has(i))return false;
  if(state.q&&!searchMatches(i,state.q))return false;
  return true}

/* GOLF-20: exact substring match stays the primary, fast path (unchanged
   behavior for anyone typing something that actually appears verbatim).
   Fuzzy only kicks in as a fallback so a typo doesn't return zero results
   — checked word-by-word against the searchable text, not as one long
   Levenshtein diff against the whole blob, so "Sunningdle" still finds
   "Sunningdale" inside a longer name/note without needing the whole
   string to nearly match. */
function levenshtein(a,b){
  const m=a.length,n=b.length;
  if(!m)return n;if(!n)return m;
  let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j]=a[i-1]===b[j-1]?prev[j-1]:1+Math.min(prev[j-1],prev[j],cur[j-1]);
    }
    prev=cur;
  }
  return prev[n];
}
function searchMatches(i,q){
  const c=C[i],s=V(i,'stn')||'';
  const text=(V(i,'n')+' '+c.r+' '+V(i,'arch')+' '+V(i,'note')+' '+V(i,'walk')+' '+s).toLowerCase();
  if(text.includes(q))return true;
  if(q.length<3)return false; // too short for fuzzy to mean anything, avoid noisy matches
  const threshold=q.length<=5?1:2;
  return text.split(/\W+/).some(word=>word.length>=q.length-threshold&&levenshtein(q,word)<=threshold);
}
function highlight(i){document.querySelectorAll('.card').forEach(el=>el.classList.toggle('active',+el.dataset.i===i));
  const el=document.querySelector(`.card[data-i="${i}"]`);if(el)el.scrollIntoView({block:'nearest'})}

/* GOLF-22: default map view (London, zoom 9) hides every Top 100 course
   hundreds of miles away with no on-screen hint to zoom out. This gives
   an explicit, discoverable way to see wherever the current filters
   actually are. */
function fitToResults(){
  const shown=C.map((c,i)=>i).filter(passes);
  if(!shown.length)return;
  map.fitBounds(L.latLngBounds(shown.map(i=>[C[i].lat,C[i].lng])),{padding:[28,28]});
}
document.getElementById('fit-map').addEventListener('click',fitToResults);

/* GOLF-69 (item 3): the Explore list's two modes. 'near' is the default the
   moment a trip has something to be near; the visitor can flip back to
   'all' and that choice sticks for the session (not persisted — a new
   session with a saved trip should still open on the more useful view). */
let exploreListMode='near';
/* The point everything is measured from: the last course added to the trip,
   falling back to the trip's own anchor. Returns a course index, or null
   when there's nothing in the trip yet. */
function exploreNearAnchor(){
  if(tripLastAdded!=null&&C[tripLastAdded])return tripLastAdded;
  if(tbAnchor!=null&&C[tbAnchor])return tbAnchor;
  if(tripSeq.length&&C[tripSeq[tripSeq.length-1]])return tripSeq[tripSeq.length-1];
  return null;
}
function renderListMode(anchorIdx){
  const bar=document.getElementById('list-mode');
  if(anchorIdx==null){bar.hidden=true;bar.innerHTML='';return;}
  bar.hidden=false;
  bar.innerHTML=`<span>Nearest to <b>${esc(V(anchorIdx,'n'))}</b></span>
    <span class="list-mode-pills">
      <button data-lm="near" aria-pressed="${exploreListMode==='near'}">Near my trip</button>
      <button data-lm="all" aria-pressed="${exploreListMode==='all'}">All results</button>
    </span>`;
  bar.querySelectorAll('[data-lm]').forEach(b=>b.addEventListener('click',()=>{
    exploreListMode=b.dataset.lm;render();
  }));
}
/* Bookable courses not already in the trip, closest first. Deliberately
   ignores the filter chips: this list answers "what else could I play while
   I'm there?", and silently hiding a neighbouring course because an
   unrelated filter is still set would make it untrustworthy. */
const NEAR_LIST_MAX=25;
function renderNearestList(anchorIdx){
  const a=C[anchorIdx];
  const rows=C.map((c,i)=>i)
    .filter(i=>i!==anchorIdx&&!TRIP.has(i)&&bookable(i))
    .map(i=>({i,mi:haversineMiles(a.lat,a.lng,C[i].lat,C[i].lng)}))
    .sort((x,y)=>x.mi-y.mi).slice(0,NEAR_LIST_MAX);
  const list=document.getElementById('list');
  document.getElementById('count').textContent=`${rows.length} near${rows.length===NEAR_LIST_MAX?'est':''}`;
  if(!rows.length){list.innerHTML=`<p class="empty">Nothing else bookable nearby — try "All results".</p>`;return;}
  list.innerHTML=rows.map(({i,mi})=>{const ac=ACCESS[V(i,'a')];
    return`<div class="card" data-i="${i}"><div class="card-top">
      <p class="cname">${flagSVG(ac.colour,ac.pole,15,false)}${V(i,'n')}</p>
      <span class="cfee">${V(i,'wd')}<small>${mi.toFixed(0)} mi away</small></span></div>
      <p class="cmeta"><span>${ac.label}</span><span>${esc(C[i].r)}</span>${bestRankBadge(i)}</p>
      <p class="cmeta"><button class="btn2" data-add="${i}" style="padding:5px 10px;font-size:11px">+ Add to trip</button></p></div>`}).join('');
  list.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    tbAddToWishlist(+b.dataset.add);
  }));
  list.querySelectorAll('.card').forEach(el=>el.addEventListener('click',()=>{
    const i=+el.dataset.i;showMobileMap();map.flyTo([C[i].lat,C[i].lng],13,{duration:.6});
    markers.get(i).setPopupContent(popupHTML(i));markers.get(i).openPopup();highlight(i);drawLink(i)}));
}
function render(){
  /* GOLF-31: single hook point — every existing render() call site
     (filter chips, played/want/trip toggles, corrections save, reset,
     wipeStoredState) keeps the Trip Builder pane and the mast's cart-count
     badge in sync for free. */
  document.getElementById('trip-badge').textContent=TRIP.size?String(TRIP.size):'';
  if(tripBuilderOn){renderTripBuilder();tbDrawMap();}
  layer.clearLayers();
  /* Map-clutter fix: with all 326 course markers still clustering
     underneath it, the Trip Builder route got lost in whichever dense
     area (usually London) happened to be on screen, regardless of where
     the trip actually was. The pane already replaces the filter/course
     list entirely — the full marker layer is redundant screen noise
     while it's open, so skip populating it and let tripLayer (the
     cart/discovery markers) be the only thing on the map. Filters/list
     stay untouched underneath, ready the moment Trip Builder exits. */
  if(tripBuilderOn)return;
  let shown=C.map((c,i)=>i).filter(passes);
  const S_={region:(a,b)=>REGIONS.indexOf(C[a].r)-REGIONS.indexOf(C[b].r)||feeNum(a)-feeNum(b),
    fee:(a,b)=>feeNum(a)-feeNum(b),rank:(a,b)=>rankNum(a)-rankNum(b),
    dist:(a,b)=>distOut(a)-distOut(b),name:(a,b)=>V(a,'n').localeCompare(V(b,'n'))};
  shown.sort(S_[state.sort]);
  shown.forEach(i=>{markers.get(i).setIcon(pinFor(i));markers.get(i).setPopupContent(popupHTML(i));layer.addLayer(markers.get(i))});
  document.getElementById('count').textContent=`${shown.length} of ${C.length}`;
  document.getElementById('editcount').textContent=editCount();
  /* GOLF-69 (item 3): "once I have selected and added the first course to a
     trip on the explore page, the bottom area underneath should show the
     list of courses nearest to it" — clarified to mean this list is
     REPLACED, not supplemented, which is how the old Trip Builder Discover
     tab worked. Placed after the marker/count work above so the map still
     shows the full filtered result set underneath either list. Escapable
     via the "All results" pill: a one-way switch would strand anyone who
     wanted to carry on browsing. */
  const nearAnchor=exploreNearAnchor();
  renderListMode(nearAnchor);
  if(nearAnchor!=null&&exploreListMode==='near'){renderNearestList(nearAnchor);return;}
  const list=document.getElementById('list');
  if(!shown.length){list.innerHTML=`<p class="empty">Nothing matches. The cheapest heathland tends to be weekdays-only — try dropping that filter.</p>`;return}
  list.innerHTML=shown.map(i=>{const a=ACCESS[V(i,'a')],stn=STN[V(i,'stn')],near=C[i].nearStation;
    return `<button class="card" data-i="${i}"><div class="card-top">
      <p class="cname">${flagSVG(a.colour,a.pole,15,false)}${V(i,'n')}${isEdited(i)?' <span class="edited">EDITED</span>':''}${PLAYED.has(i)?' <span class="wt played">played</span>':WANT.has(i)?' <span class="wt want">want</span>':''}</p>
      <span class="cfee">${V(i,'wd')}<small>wknd ${V(i,'we')}</small></span></div>
      <p class="cmeta"><span>${a.label}</span>
      ${stn?`<span>${stn.n} · ${LINES[stn.l].n}</span>`:near?`<span>${near.n} · ${near.mi} mi straight-line</span>`:`<span style="color:var(--stone)">no close station</span>`}
      ${(C[i].top100||C[i].topScot||C[i].topWales)?`<span style="color:var(--stone)">${distMiles(i)} mi from home</span>`:''}
      ${bestRankBadge(i)}${C[i].sweep?'<span class="wt">sweep</span>':''}${C[i].winter?'<span class="wt">winter</span>':''}</p></button>`}).join('');
  list.querySelectorAll('.card').forEach(el=>el.addEventListener('click',()=>{
    const i=+el.dataset.i;showMobileMap();map.flyTo([C[i].lat,C[i].lng],13,{duration:.6});
    markers.get(i).setPopupContent(popupHTML(i));markers.get(i).openPopup();highlight(i);drawLink(i)}));
}

const legend=L.control({position:'topright'});
legend.onAdd=()=>{const d=L.DomUtil.create('div','legend');
  const head=L.DomUtil.create('button','legend-head',d);
  head.type='button';head.textContent='Legend';head.setAttribute('aria-expanded','false');
  const bodyId='legend-body-'+Math.random().toString(36).slice(2,8);
  head.setAttribute('aria-controls',bodyId);
  const body=L.DomUtil.create('div','legend-body',d);body.id=bodyId;
  head.addEventListener('click',()=>{
    const open=d.classList.toggle('open');
    head.setAttribute('aria-expanded',String(open));
  });
  body.innerHTML='<b>Flag colour = who can play</b>'+
    Object.values(ACCESS).map(a=>`<div class="lr">${flagSVG(a.colour,a.pole,15,false)}<span>${a.label}</span></div>`).join('')+
    '<div style="margin-top:4px;color:var(--stone);font-size:10.5px">Bigger flag + gold ring = Top 100 ranked</div><hr>'+
    '<b>Stations</b>'+
    '<div class="lr"><svg width="14" height="14"><circle cx="7" cy="7" r="3" fill="#9B0056" stroke="#9B0056"/></svg><span>Ordinary stop</span></div>'+
    '<div class="lr"><svg width="14" height="14"><circle cx="7" cy="7" r="4.4" fill="#fff" stroke="#1B2733" stroke-width="1.6"/></svg><span>Interchange</span></div><hr>'+
    '<b>Rail — colour + dash</b>'+
    Object.values(LINES).map(l=>`<div class="lr"><svg width="24" height="5"><line x1="0" y1="2.5" x2="24" y2="2.5" stroke="${l.c}" stroke-width="2" ${l.d?`stroke-dasharray="${l.d}"`:''}/></svg><span>${l.n}</span></div>`).join('')+
    '<div style="margin-top:5px;color:var(--stone);font-size:10.5px">Zone 1 omitted. Station positions are from TfL and National Rail open data; curves still run point-to-point through stations, not along the real track. "Sweep find" tags mark courses added from geographic search rather than the original topic search — verify details before relying on them. England Top 100 pins (national, black-flag clubs included) are from a published 2026 price list cross-checked against England Golf’s club directory for name and coordinates — most sit outside the London rail network drawn on this map, so instead they show the nearest station <i>nationally</i> as a straight-line (as-the-crow-flies) distance, not a walking route or real travel time. Scotland and Wales pins are a curated set of notable courses (not a full national directory), sourced the same way from Scottish Golf and Wales Golf’s club directories; fee/access/architect details for these are indicative and unverified (marked "est") pending direct confirmation from each club.</div>'+
    `<div style="margin-top:5px;color:var(--stone);font-size:10.5px">Data last refreshed — stations: ${DATA_REFRESHED.stations}, England Top 100: ${DATA_REFRESHED.top100}, Scotland &amp; Wales: ${DATA_REFRESHED.scotlandWales}, nearest-station lookups: ${DATA_REFRESHED.nearStation}. All fetched once and stored statically; the page makes no live API calls.</div>`;
  L.DomEvent.disableClickPropagation(d);L.DomEvent.disableScrollPropagation(d);return d};
legend.addTo(map);
