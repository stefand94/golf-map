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
   listed in index.html.
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
/* GOLF-185b: the course card. On a phone a tapped pin shows its course
   here, in the sheet, instead of in a Leaflet popup over the map. */
mobHandle.insertAdjacentHTML('afterend','<section class="bs-card pop" id="bs-card" tabindex="-1" aria-label="Course" hidden></section>');
const mobCard=document.getElementById('bs-card');

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
['focusin','click','input'].forEach(ev=>mobTop.addEventListener(ev,e=>{
  if(e.target.id==='tb-unified-search')document.body.classList.remove('mob-results-off');
}));
const mobTabbar=document.getElementById('bs-tabbar');
const filterBtn=document.createElement('button');
filterBtn.type='button';filterBtn.id='filterBtn';
filterBtn.className='tb-btn is-icon map-filter-btn';
filterBtn.setAttribute('aria-label','Filters');filterBtn.title='Filters';
filterBtn.innerHTML=FILTER_ICON_SVG;
filterBtn.hidden=true; // GOLF-185d unhides it once the filter panel exists

/* GOLF-185c: on a phone the app opens on a country question, over a
   blurred map, until a country is picked; after that the pick lives on as
   a small chip beside the floating search. state.nation is saved, so the
   card doesn't come back on reload. GOLF-224/DEC-037 retired the per-deploy
   wipe that used to bring it back once after every release, so a release no
   longer re-asks the question. Never on a #share= link: CSS keys every
   rule below off body:not(.shared-mode). */
const MOB_NATION_CODE={gb:'GB',ie:'IE',za:'ZA'};
document.body.insertAdjacentHTML('beforeend',
  `<div class="mob-gate" id="mob-gate" hidden>
    <div class="mob-gate-card" role="dialog" aria-modal="true" aria-labelledby="mob-gate-h">
      <h2 id="mob-gate-h">Where are you playing?</h2>
      <p>Pick a country to see its courses.</p>
      <div class="mob-gate-opts"></div>
    </div>
  </div>`);
const mobGate=document.getElementById('mob-gate');
function mobGateWanted(){return mobIsPhone()&&!state.nation&&!document.body.classList.contains('shared-mode');}
function mobGateSync(){
  const want=mobGateWanted();
  if(want&&mobGate.hidden){
    /* Filled here, not at load: NATIONS lives in js/explore.js, which
       loads after this file. */
    const opts=mobGate.querySelector('.mob-gate-opts');
    if(!opts.firstChild)opts.innerHTML=NATIONS.map(([k,l])=>`<button type="button" class="mob-gate-opt" data-nation="${k}">${esc(l)}</button>`).join('');
    mobGate.classList.remove('is-leaving');
    mobGate.hidden=false;
    document.body.classList.add('mob-gate-on');
    mobGate.querySelector('.mob-gate-opt').focus({preventScroll:true});
  }else if(!want&&!mobGate.hidden&&!mobGate.classList.contains('is-leaving')){
    mobGate.hidden=true;
    document.body.classList.remove('mob-gate-on');
  }
}
/* Picking fades the card out while the map fits the country behind it.
   The search and sheet come back first, so GOLF-184's fit measures the
   strip of map that will actually be visible. */
function mobPickNation(k){
  mobNationMenu(false);
  if(!mobGate.hidden){
    document.body.classList.remove('mob-gate-on');
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce)mobGate.hidden=true;
    else{
      mobGate.classList.add('is-leaving');
      setTimeout(()=>{mobGate.hidden=true;mobGate.classList.remove('is-leaving');},320);
    }
  }
  tbPickNation(k);
  const chip=document.getElementById('mob-nation-chip');
  if(chip)chip.focus({preventScroll:true});
}
mobGate.addEventListener('click',e=>{
  const b=e.target.closest('[data-nation]');if(b)mobPickNation(b.dataset.nation);
});
/* Keep Tab inside the card while it's up: there's nothing behind it to use. */
mobGate.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const opts=[...mobGate.querySelectorAll('.mob-gate-opt')];
  const i=opts.indexOf(document.activeElement);
  if(e.shiftKey&&i<=0){e.preventDefault();opts[opts.length-1].focus();}
  else if(!e.shiftKey&&i===opts.length-1){e.preventDefault();opts[0].focus();}
});

/* The country chip (rebuilt with the floating search on every render). */
function mobNationChip(){
  const box=document.createElement('div');box.className='mob-nation';
  const cur=NATIONS.find(([k])=>k===state.nation);
  box.innerHTML=`<button type="button" class="mob-nation-chip" id="mob-nation-chip" aria-haspopup="true" aria-expanded="false"
      aria-controls="mob-nation-menu" aria-label="Country: ${esc(cur[1])}. Change country">${MOB_NATION_CODE[cur[0]]||esc(cur[0].toUpperCase())}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    <div class="mob-nation-menu" id="mob-nation-menu" role="menu" aria-label="Country" hidden>
      ${NATIONS.map(([k,l])=>`<button type="button" role="menuitemradio" aria-checked="${k===state.nation}" data-nation="${k}"><b>${MOB_NATION_CODE[k]||esc(k.toUpperCase())}</b>${esc(l)}</button>`).join('')}
    </div>`;
  box.querySelector('.mob-nation-chip').addEventListener('click',()=>mobNationMenu(!mobNationMenuOpen()));
  box.querySelector('.mob-nation-menu').addEventListener('click',e=>{
    const b=e.target.closest('[data-nation]');if(!b)return;
    if(b.dataset.nation===state.nation){mobNationMenu(false,true);return;}
    mobPickNation(b.dataset.nation);
  });
  return box;
}
function mobNationMenuOpen(){const m=document.getElementById('mob-nation-menu');return!!m&&!m.hidden;}
function mobNationMenu(open,refocus){
  const m=document.getElementById('mob-nation-menu'),chip=document.getElementById('mob-nation-chip');
  if(!m||!chip)return;
  m.hidden=!open;
  chip.setAttribute('aria-expanded',String(open));
  if(open)(m.querySelector('[aria-checked="true"]')||m.querySelector('button')).focus({preventScroll:true});
  else if(refocus)chip.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  if(mobNationMenuOpen()&&!e.target.closest('.mob-nation'))mobNationMenu(false);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&mobNationMenuOpen()){e.stopPropagation();mobNationMenu(false,true);}
},true);

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
let mobPanelTop=0; // where the sheet is heading, not where its transition has got to
function mobApplySheet(){
  if(!mobIsPhone()||!mobSheetState)return;
  const t=mobSheetTops();
  let top=t[mobSheetState],sheet=mobSheetState;
  /* A card sizes the sheet to itself (never above half, so the pin stays in
     view); "Show more" takes it to full, where the card scrolls. */
  if(mobCardI!=null){
    top=mobCardMore?t.full:Math.max(t.half,t.H-t.tabH-mobHandle.offsetHeight-mobCard.offsetHeight);
    sheet=mobCardMore?'full':'card';
  }
  mobPanelTop=top;
  mobPanel.style.top=top+'px';
  mobPanel.dataset.sheet=sheet;
  mobSetMapInsets(top,t);
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
  mobCardDrop();
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
  /* GOLF-199: the floating results sit over the map, so a result tapped
     from them (GOLF-187) opened its card underneath the list. Tuck them
     away; focusing or typing in the search brings them back, query kept. */
  document.body.classList.add('mob-results-off');
  mobCardDrop();
  if(mobSheetState!=='peek')mobSheetSet('peek');
  else mobApplySheet();
  setTimeout(mapReplayPendingFit,0);
}
function showMobileList(){if(mobIsPhone())mobSheetSet('half');}

/* ── Course card (GOLF-185b) ──────────────────────────────────── */
/* Compact first (DEC-032, owner item 3): name, green fee, a two-line note
   and Add to trip — about a third of the screen. "Show more" opens the
   rest in place: popupHTML()'s full body, so every action the popup has
   is still here and the two can't drift apart.

   Being in the sheet rather than on the map is also the phone half of
   GOLF-201's fix: a redraw that rebuilds the marker can't close it. */
let mobCardI=null,mobCardMore=false,mobCardPrev=null;
function mobCardFeeHTML(i){
  const lab=f=>String((typeof feeV2Label==='function'&&feeV2Label(i,f))||V(i,f)||'').trim();
  const wd=lab('wd'),we=lab('we');
  if(!wd&&!we)return'';
  const mark=typeof estMark==='function'?estMark(feeConfWord(i)==='Estimate'):''; // GOLF-193's "~"
  return mark+(!we||!wd||wd===we?esc(wd||we):`${esc(wd)} weekday · ${esc(we)} weekend`);
}
function mobCardHTML(i){
  const fee=mobCardFeeHTML(i),note=String(V(i,'note')||'').trim(),inTrip=TRIP.has(i);
  return`<div class="bs-card-head">
      <h3>${esc(V(i,'n'))} ${courseBadgesHTML(i)}</h3>
      <button type="button" class="bs-card-x" data-card="close" aria-label="Close">×</button>
    </div>
    ${fee?`<p class="bs-card-fee">${fee}</p>`:''}
    ${note?`<p class="bs-card-note">${esc(note)}</p>`:''}
    <div class="bs-card-acts">
      <button type="button" class="btn primary" onclick="${inTrip?`tripRemoveCourse(${i})`:`tbAddToPlan(${i})`}">${inTrip?'✓ In your trip — remove':'＋ Add to trip'}</button>
      <button type="button" class="bs-card-more" data-card="more" aria-expanded="${mobCardMore}" aria-controls="bs-card-body">${mobCardMore?'Show less':'Show more'}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    <div class="bs-card-body" id="bs-card-body"${mobCardMore?'':' hidden'}>${popupHTML(i,{card:true})}</div>`;
}
function mobCardRender(){
  const sc=mobCard.scrollTop;
  mobCard.innerHTML=mobCardHTML(mobCardI);
  mobCard.classList.toggle('is-more',mobCardMore);
  mobCard.hidden=false;
  mobCard.scrollTop=sc;
  mobApplySheet();
}
function mobCardOpen(i,ll){
  if(mobCardI==null)mobCardPrev=mobSheetState;
  mobCardI=i;mobCardMore=false;
  document.body.classList.add('mob-card-on');
  mobCard.scrollTop=0;
  mobCardRender();
  mobCard.focus({preventScroll:true});
  mobCardKeepInView(ll||courseLatLng(i));
}
/* Drop: the card goes and the caller decides the sheet height. Close: the
   visitor dismissed it, so the sheet goes back to where it was. */
function mobCardDrop(){
  if(mobCardI==null)return;
  mobCardI=null;mobCardMore=false;
  document.body.classList.remove('mob-card-on');
  mobCard.hidden=true;mobCard.replaceChildren();
}
function mobCardClose(){
  if(mobCardI==null)return;
  mobCardDrop();
  mobSheetState=mobCardPrev||'half';
  mobApplySheet();
}
function mobCardSetMore(on){
  if(mobCardI==null)return;
  mobCardMore=on;
  if(!on)mobCard.scrollTop=0;
  mobCardRender();
}
function mobCardRefresh(){if(mobCardI!=null&&mobIsPhone())mobCardRender();}
mobCard.addEventListener('click',e=>{
  const b=e.target.closest('[data-card]');if(!b)return;
  if(b.dataset.card==='close')mobCardClose();
  else mobCardSetMore(!mobCardMore);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobCardI!=null&&!e.defaultPrevented)mobCardClose();});
map.on('click',()=>{if(mobCardI!=null)mobCardClose();}); // a tap on open map; pin taps don't reach here
/* The pin has to stay visible between the floating search and the card.
   A fly or cluster zoom still under way would override a pan, so wait
   for it to land. animate:false: an animated pan queued behind another
   move is silently dropped (GOLF-191). */
function mobCardKeepInView(ll){
  if(!ll)return;
  const check=()=>{
    if(mobCardI==null)return;
    const t=mobSheetTops(),y=map.latLngToContainerPoint(ll).y+map.getContainer().getBoundingClientRect().top;
    const lo=t.topBar+48,hi=mobPanelTop-16; // 48: the pin is drawn above its point
    const dy=y<lo?y-lo:y>hi?y-hi:0;
    if(dy)map.panBy([0,dy],{animate:false});
  };
  const busy=map._flyToFrame||map._animatingZoom||(map._panAnim&&map._panAnim._inProgress);
  if(busy)map.once('moveend',check);else check();
}
/* Every course popup is built by popupHTML(), whose root carries
   data-course. On a phone that popup opens as the card instead — caught
   here, before Leaflet's auto-pan moves the map for a popup that will
   never show. Other popups (hotels, sights, places) stay on the map, but
   auto-pan clear of the floating search and the sheet rather than under
   them (Geoff's GOLF-199 handover). */
const mobPopupOpenOn=L.Popup.prototype.openOn;
L.Popup.include({openOn(m){
  if(mobIsPhone()){
    const src=this._source,c=this._content;
    const html=typeof c==='function'?c(src||this):c;
    const hit=typeof html==='string'&&/^<div class="pop" data-course="(\d+)"/.exec(html);
    if(hit){
      if(m&&m.closePopup)m.closePopup();
      mobCardOpen(+hit[1],src&&src.getLatLng?src.getLatLng():null);
      return this;
    }
    /* GOLF-185e: clear of the map's own controls too — the basemap
       button under the search, and zoom sitting on the sheet — not just
       the search bar and the sheet. */
    const t=mobSheetTops();
    let top=t.topBar,bottom=mobPanelTop;
    document.querySelectorAll('#map .leaflet-top .leaflet-control').forEach(el=>{
      const r=el.getBoundingClientRect();if(r.height)top=Math.max(top,r.bottom);
    });
    document.querySelectorAll('#map .leaflet-bottom .leaflet-control-zoom').forEach(el=>{
      const r=el.getBoundingClientRect();if(r.height)bottom=Math.min(bottom,r.top);
    });
    this.options.autoPanPaddingTopLeft=[12,Math.round(top)+12];
    this.options.autoPanPaddingBottomRight=[12,Math.max(12,Math.round(t.H-bottom)+12)];
  }
  return mobPopupOpenOn.apply(this,arguments);
}});

/* GOLF-185e: the map attribution folds behind an ⓘ on phones (three lines
   of credits ate the strip of map above the sheet). Tapping it shows the
   credits in full, legible, until the ⓘ or the map is tapped again. The
   button is its own control, not inside the attribution, because Leaflet
   rewrites the attribution's markup whenever the base layer changes. CSS
   hides the button, and leaves the attribution alone, on desktop. */
const mobAttrControl=L.control({position:'bottomright'});
mobAttrControl.onAdd=function(){
  const el=L.DomUtil.create('div','leaflet-control mob-attr-btn');
  el.innerHTML=`<button type="button" aria-expanded="false" aria-label="Map credits and privacy" title="Map credits and privacy"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg></button>`;
  L.DomEvent.disableClickPropagation(el);
  el.firstChild.addEventListener('click',()=>mobAttrSet(!map.getContainer().classList.contains('mob-attr-open')));
  return el;
};
mobAttrControl.addTo(map);
/* Bottom corners stack new controls on top; this one belongs underneath,
   directly below the credits it opens. */
mobAttrControl.getContainer().parentNode.appendChild(mobAttrControl.getContainer());
function mobAttrSet(open){
  map.getContainer().classList.toggle('mob-attr-open',open);
  mobAttrControl.getContainer().firstChild.setAttribute('aria-expanded',String(open));
}
map.on('click',()=>mobAttrSet(false));

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
  /* With a card up, the handle is the card's: a tap or an upward drag shows
     more, a downward one shows less and then closes it. */
  if(mobCardI!=null){
    const top=mobPanel.getBoundingClientRect().top;
    const up=d.moved?(d.v<-0.5||top<d.top0-40):!mobCardMore;
    const down=d.moved?(d.v>0.5||top>d.top0+40):mobCardMore;
    if(up)mobCardSetMore(true);
    else if(down){if(mobCardMore)mobCardSetMore(false);else mobCardClose();}
    else mobApplySheet();
    return;
  }
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
  if(e.target.closest('.peek-fb'))return; // GOLF-232: a tap on Feedback, not a drag
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
  /* GOLF-232 follow-up: at full the map, and its Feedback pill, is covered,
     so a compact one rides in this row instead (CSS shows it only at full;
     beside Beta in the header it squeezed the trip name to "My tr…"). */
  return`<span class="bs-peek-text">${bits.join(' · ')}</span><button type="button" class="fb-pill peek-fb" onclick="feedbackOpen()">Feedback</button><span class="tb-pill">${tbTripTotalHTML()}</span>`; // GOLF-199: 193's app-wide pp/total reading, like the other pills
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
  mobGateSync();
  if(!phone){
    mobPanel.style.top='';
    return;
  }
  /* GOLF-185a (DEC-032, "drop chrome that repeats"): the "Golf Tripper"
     masthead row is hidden on phones (CSS), but the Beta badge must stay
     visible (GOLF-129), so it rides beside Share/Clear in the pane header.
     tbMountBetaBadge() mounts a fresh one in the masthead each render,
     because the pane's innerHTML replaced the last one moved here. */
  const beta=document.querySelector('.panel>.mast .tb-beta'),acts=document.querySelector('#tb-pane .tb-head-actions');
  if(beta&&acts)acts.prepend(beta);
  /* Float the search (and its results, and the filter slot) over the map. */
  const results=document.getElementById('tb-search-results');
  if(wrap){
    const row=document.createElement('div');row.className='mob-search-row';
    /* GOLF-199: 185d renders its filter button (#tb-course-filters) into the
       pane's toolbar on every pass, already wired to the panel. On a phone
       it moves out to sit beside the floating search; the placeholder slot
       is only used if a view renders no filter button. */
    const cfBtn=document.getElementById('tb-course-filters');
    if(cfBtn)cfBtn.classList.add('map-filter-btn');
    if(state.nation&&!document.body.classList.contains('shared-mode'))row.append(mobNationChip());
    row.append(wrap,cfBtn||filterBtn);
    mobTop.append(row);
    if(results)mobTop.append(results);
  }
  if(!mobSheetState)mobSheetState=appMode==='build'?'full':'half';
  mobUpdatePeek();
  if(mobCardI!=null)mobCardRender();else mobApplySheet();
}

/* Crossing the breakpoint (rotating a tablet, resizing a desktop window)
   swaps layouts, so re-render. Otherwise recompute the resting heights —
   except while a text field has focus: on Android the keyboard shrinks
   the viewport, and the sheet must not jump over the input or results. */
window.addEventListener('resize',()=>{
  const phone=mobIsPhone();
  if(phone!==mobWasPhone){
    mobWasPhone=phone;
    mobCardDrop();
    if(typeof tripBuilderOn!=='undefined'&&tripBuilderOn)renderTripBuilder();
    map.invalidateSize();
    return;
  }
  const a=document.activeElement;
  if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))return;
  mobApplySheet();
});
mobWasPhone=mobIsPhone();
