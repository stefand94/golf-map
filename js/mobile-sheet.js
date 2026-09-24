/* ============================================================
   js/mobile-sheet.js — GOLF-185a: the phone layout. Map-first, with
   the pane living in a draggable bottom sheet.

   On a phone (≤900px, the app's one breakpoint) the map fills the
   screen at all times, and the existing .panel — unchanged inside —
   becomes a sheet over it with three resting heights:
     peek — handle + a one-line summary only
     half — lists, with the map still visible above
     full — Itinerary / Costs
   A bottom tab bar (Discover / Itinerary / Costs) replaces the pane's
   own segmented tabs, and the one search bar floats over the map
   (moved out of the pane after every render, so trip-ui.js keeps
   rendering and binding it exactly as on desktop).

   This replaces GOLF-19's full-screen list<->map toggle.
   showMobileMap()/showMobileList() keep their names, because many
   callers still ask to "show the map": on a phone that now means
   "lower the sheet", and on desktop it is still a no-op.

   The sheet is positioned with `top`, not a transform, deliberately:
   a transformed ancestor would become the containing block for the
   position:fixed toast inside the pane, and at half height the pane's
   own scroll area has to end at the tab bar, not below the screen.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html.
   ============================================================ */
const MOB_BREAKPOINT=900;
function mobIsPhone(){return window.innerWidth<=MOB_BREAKPOINT;}

const MOB_SHEET_STATES=['peek','half','full'];
let mobSheetState=null; // set on the first phone render (Discover → half, Build → full)
let mobWasPhone=null;
const MOB_PEEK_H=72; // visible sheet at peek: grip + the one-line summary

const mobPanel=document.querySelector('.app>.panel');

/* The sheet's handle: grip + the peek summary. First thing in the panel;
   display:none on desktop. */
mobPanel.insertAdjacentHTML('afterbegin',
  `<div class="bs-handle" id="bs-handle">
    <button type="button" class="bs-grip" id="bs-grip" aria-label="Resize panel"></button>
    <div class="bs-peek" id="bs-peek" aria-live="polite"></div>
  </div>`);
const mobHandle=document.getElementById('bs-handle');

/* Floating bar over the map: the pane's search is moved in here on phones.
   The filter button slot (GOLF-185d, Dev 2 wires it up) always sits
   straight after the search field, on every viewport, so it is created once
   here and re-homed after each render; its listeners survive the move. */
document.body.insertAdjacentHTML('beforeend',
  `<div class="mob-top" id="mob-top"></div>
  <nav class="bs-tabbar" id="bs-tabbar" role="tablist" aria-label="Trip sections">
    <button type="button" role="tab" data-tab="discover"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg><span>Discover</span></button>
    <button type="button" role="tab" data-tab="itin"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><span>Itinerary</span></button>
    <button type="button" role="tab" data-tab="cost"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7.5A4 4 0 0 0 9 10v8M6.5 14h7M6 18h11"/></svg><span>Costs</span></button>
  </nav>`);
const mobTop=document.getElementById('mob-top');
const mobTabbar=document.getElementById('bs-tabbar');
const filterBtn=document.createElement('button');
filterBtn.type='button';filterBtn.id='filterBtn';
filterBtn.className='tb-btn is-icon map-filter-btn';
filterBtn.setAttribute('aria-label','Filters');filterBtn.title='Filters';
filterBtn.innerHTML=FILTER_ICON_SVG;
filterBtn.hidden=true; // GOLF-185d unhides it once the filter panel exists

/* ── Geometry ─────────────────────────────────────────────────── */
function mobSheetTops(){
  const H=window.innerHeight;
  const tabH=mobTabbar.offsetHeight;
  /* .mob-top always has height: its safe-area padding when empty (Costs
     has no search), plus the search row otherwise. Its results panel is
     absolutely positioned, so an open result list never moves this. */
  const topBar=Math.round(mobTop.getBoundingClientRect().bottom);
  const full=topBar+8;
  const peek=H-tabH-MOB_PEEK_H;
  /* Half keeps a usable strip of map above it even on a short (landscape)
     screen, and never sinks to within a thumb of peek. */
  const half=Math.round(Math.min(peek-48,Math.max(full+120,H*0.48)));
  return{full,half,peek,H,tabH,topBar};
}
function mobApplySheet(){
  if(!mobIsPhone()||!mobSheetState)return;
  const t=mobSheetTops();
  mobPanel.style.top=t[mobSheetState]+'px';
  mobPanel.dataset.sheet=mobSheetState;
  mobSetMapInsets(t[mobSheetState],t);
}
/* Keep Leaflet's own corner controls (zoom, layers, attribution) inside
   the visible strip of map: below the floating search, above the sheet. */
function mobSetMapInsets(top,t){
  const root=document.documentElement.style;
  root.setProperty('--bs-cover-bottom',Math.max(0,t.H-top)+'px');
  root.setProperty('--bs-cover-top',t.topBar+'px');
}
function mobSheetSet(state){
  if(!MOB_SHEET_STATES.includes(state))return;
  mobSheetState=state;
  mobApplySheet();
}

/* GOLF-184's mapFitBounds() calls this: on a phone, fit into the part of
   the map the visitor can actually see, not the whole screen under the
   sheet. At full the map isn't visible at all, so fit as if at half —
   that is what they'll see when they lower it. */
function mobFitOpts(opts){
  if(!mobIsPhone()||!mobSheetState)return opts;
  const t=mobSheetTops();
  const top=t[mobSheetState==='full'?'half':mobSheetState];
  const p=(opts&&opts.padding&&opts.padding[0])||28;
  return Object.assign({},opts,{paddingTopLeft:[p,t.topBar+p],paddingBottomRight:[p,t.H-top+p]});
}

/* Existing callers ask to "show the map" (course picked, place focused,
   POI opened): lower the sheet so it is in view. */
function showMobileMap(){
  if(!mobIsPhone())return;
  if(mobSheetState!=='peek')mobSheetSet('peek');
  setTimeout(mapReplayPendingFit,0);
}
function showMobileList(){if(mobIsPhone())mobSheetSet('half');}

/* ── Dragging ─────────────────────────────────────────────────── */
/* Handle: drags either way; a tap moves it up one height (full → half,
   since there's nothing above full). Content: a downward swipe drags the
   sheet only once the list is scrolled to its top — until then the list
   scrolls, not the sheet. */
let mobDrag=null;
function mobDragStart(y,source){
  if(!mobIsPhone()||!mobSheetState)return;
  mobDrag={y0:y,top0:mobPanel.getBoundingClientRect().top,lastY:y,lastT:performance.now(),v:0,moved:false,source};
}
function mobDragMove(y){
  if(!mobDrag)return false;
  const dy=y-mobDrag.y0;
  if(!mobDrag.moved&&Math.abs(dy)<6)return false;
  if(!mobDrag.moved){mobDrag.moved=true;mobPanel.classList.add('is-dragging');}
  const t=mobSheetTops();
  const top=Math.min(t.peek,Math.max(t.full,mobDrag.top0+dy));
  mobPanel.style.top=top+'px';
  const now=performance.now(),dt=now-mobDrag.lastT;
  if(dt>0)mobDrag.v=(y-mobDrag.lastY)/dt;
  mobDrag.lastY=y;mobDrag.lastT=now;
  return true;
}
function mobDragEnd(){
  if(!mobDrag)return;
  const d=mobDrag;mobDrag=null;
  mobPanel.classList.remove('is-dragging');
  if(!d.moved){
    if(d.source==='handle'){
      const k=MOB_SHEET_STATES.indexOf(mobSheetState);
      mobSheetSet(k<2?MOB_SHEET_STATES[k+1]:'half');
    }
    return;
  }
  const t=mobSheetTops(),top=mobPanel.getBoundingClientRect().top;
  let next;
  if(Math.abs(d.v)>0.5){
    /* A flick: go one step in its direction from wherever it started. */
    const k=MOB_SHEET_STATES.indexOf(mobSheetState);
    next=MOB_SHEET_STATES[Math.max(0,Math.min(2,k+(d.v<0?1:-1)))];
  }else{
    next=MOB_SHEET_STATES.reduce((a,b)=>Math.abs(t[b]-top)<Math.abs(t[a]-top)?b:a);
  }
  mobSheetSet(next);
}
mobHandle.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  mobHandle.setPointerCapture(e.pointerId);
  mobDragStart(e.clientY,'handle');
});
mobHandle.addEventListener('pointermove',e=>{if(mobDrag&&mobDrag.source==='handle')mobDragMove(e.clientY);});
mobHandle.addEventListener('pointerup',()=>{if(mobDrag&&mobDrag.source==='handle')mobDragEnd();});
mobHandle.addEventListener('pointercancel',()=>{if(mobDrag&&mobDrag.source==='handle')mobDragEnd();});
/* Keyboard: the grip is a real button, so Enter/Space steps it up one. */
document.getElementById('bs-grip').addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    e.preventDefault();
    const k=MOB_SHEET_STATES.indexOf(mobSheetState);
    mobSheetSet(MOB_SHEET_STATES[Math.max(0,Math.min(2,k+(e.key==='ArrowUp'?1:-1)))]);
  }
});
document.getElementById('bs-grip').addEventListener('click',e=>{
  /* Pointer taps are handled by pointerup above; this only catches a
     keyboard "click" (detail 0), so a tap never counts twice. */
  if(e.detail===0){const k=MOB_SHEET_STATES.indexOf(mobSheetState);mobSheetSet(k<2?MOB_SHEET_STATES[k+1]:'half');}
});
/* Content drags use touch events (not pointer), so a list that is not at
   its top keeps native momentum scrolling untouched. */
const mobPane=document.getElementById('tb-pane');
let mobTouch=null;
mobPane.addEventListener('touchstart',e=>{
  if(!mobIsPhone()||e.touches.length!==1)return;
  mobTouch={y:e.touches[0].clientY,atTop:mobPane.scrollTop<=0};
},{passive:true});
mobPane.addEventListener('touchmove',e=>{
  if(!mobTouch)return;
  const y=e.touches[0].clientY;
  if(!mobDrag){
    /* Only a downward pull, starting with the list at its very top. */
    if(!mobTouch.atTop||y-mobTouch.y<6||mobPane.scrollTop>0){if(Math.abs(y-mobTouch.y)>6)mobTouch=null;return;}
    mobDragStart(mobTouch.y,'content');
  }
  if(mobDragMove(y))e.preventDefault();
},{passive:false});
mobPane.addEventListener('touchend',()=>{mobTouch=null;if(mobDrag&&mobDrag.source==='content')mobDragEnd();});
mobPane.addEventListener('touchcancel',()=>{mobTouch=null;if(mobDrag&&mobDrag.source==='content')mobDragEnd();});

/* ── Tab bar ──────────────────────────────────────────────────── */
mobTabbar.addEventListener('click',e=>{
  const b=e.target.closest('[data-tab]');if(!b)return;
  const k=b.dataset.tab;
  tbGoTab(k);
  /* Discover opens at half (lists + map); Itinerary and Costs at full. */
  mobSheetSet(k==='discover'?'half':'full');
});
function mobActiveTab(){return appMode==='build'?tbBuildTab:'discover';}

/* ── Peek summary ─────────────────────────────────────────────── */
function mobPeekHTML(){
  const nation=NATIONS.find(([k])=>k===state.nation);
  const bits=[];
  if(appMode==='build'){
    bits.push(nation?esc(nation[1]):'Your trip');
    bits.push(`${TRIP.size} course${TRIP.size===1?'':'s'}`);
    if(tripDays.length)bits.push(`${tripDays.length} day${tripDays.length===1?'':'s'}`);
  }else if(!nation){
    bits.push('Choose a country');
  }else{
    let n=0;
    try{
      const b=map.getBounds();
      C.forEach((c,i)=>{if(passes(i)&&b.contains([c.lat,c.lng]))n++;});
    }catch(e){}
    bits.push(esc(nation[1]));
    bits.push(`${n} course${n===1?'':'s'} in view`);
    if(TRIP.size)bits.push(`${TRIP.size} in trip`);
  }
  return`<span class="bs-peek-text">${bits.join(' · ')}</span><span class="tb-pill">${tbTripTotal()}</span>`;
}
function mobUpdatePeek(){
  if(!mobIsPhone())return;
  document.getElementById('bs-peek').innerHTML=mobPeekHTML();
}
map.on('moveend',()=>{if(mobIsPhone()&&appMode==='plan')mobUpdatePeek();});

/* ── Render hooks (called from renderTripBuilder()) ───────────── */
/* Before the pane is rebuilt: drop the previous render's floating search,
   so the fresh one's ids are the only ones in the document. */
function mobBeforeRender(){
  if(filterBtn.parentNode)filterBtn.remove();
  mobTop.replaceChildren();
}
function mobAfterRender(){
  const phone=mobIsPhone();
  const wrap=document.querySelector('#tb-pane .tb-search-bar-wrap');
  if(wrap)wrap.after(filterBtn);
  mobTabbar.querySelectorAll('[data-tab]').forEach(b=>{
    const on=b.dataset.tab===mobActiveTab();
    b.setAttribute('aria-selected',String(on));
    b.tabIndex=on?0:-1;
  });
  if(!phone){
    mobPanel.style.top='';
    return;
  }
  /* Float the search (and its results, and the filter slot) over the map. */
  const results=document.getElementById('tb-search-results');
  if(wrap){
    const row=document.createElement('div');row.className='mob-search-row';
    row.append(wrap,filterBtn);
    mobTop.append(row);
    if(results)mobTop.append(results);
  }
  if(!mobSheetState)mobSheetState=appMode==='build'?'full':'half';
  mobUpdatePeek();
  mobApplySheet();
}

/* Crossing the breakpoint (rotating a tablet, resizing a desktop window)
   swaps layouts, so re-render. Otherwise recompute the resting heights —
   except while a text field has focus: on Android the keyboard shrinks
   the viewport, and the sheet must not jump over the input or results. */
window.addEventListener('resize',()=>{
  const phone=mobIsPhone();
  if(phone!==mobWasPhone){
    mobWasPhone=phone;
    if(typeof tripBuilderOn!=='undefined'&&tripBuilderOn)renderTripBuilder();
    map.invalidateSize();
    return;
  }
  const a=document.activeElement;
  if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))return;
  mobApplySheet();
});
mobWasPhone=mobIsPhone();
