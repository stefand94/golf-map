/* ============================================================
   js/app-mode.js — the three top-level modes (Explore / Plan / Build),
   the URL hash, pushState/popstate, and the entry points reached from
   course popups and the masthead.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* GOLF-64: three explicit top-level modes, layered on the EXISTING pane-swap
   architecture rather than replacing it — 'plan' and 'build' both still mean
   "the #tb-pane is showing and body.trip-mode is on", exactly as GOLF-31 set
   it up; all that's new is which content the pane renders and which URL
   describes it. `tripBuilderOn` therefore keeps its original meaning ("the
   pane is open"), so every existing `if(tripBuilderOn)` redraw hook across
   the file keeps working untouched.
     ''      -> Explore  (map + filters + list, unchanged)
     '#plan' -> Plan     (search/discover/wishlist — the conceptual half)
     '#trip' -> Build    (days, items, costs — the concrete half)
   '#trip' is deliberately NOT renamed: every GOLF-41 bookmark/shared link
   still lands somewhere sensible. */
let appMode='explore';
function appModeFromHash(){return location.hash==='#trip'?'build':location.hash==='#plan'?'plan':'explore';}
function appModeHash(m){return m==='plan'?'#plan':m==='build'?'#trip':'';}
function setAppMode(mode,opts){
  opts=opts||{};
  const pushHash=opts.pushHash!==false;
  const prev=appMode;
  appMode=mode;
  if(mode==='explore'){
    tripBuilderOn=false;
    document.body.classList.remove('trip-mode');
    /* Keep the cart's route visible on the map after exiting — only the
       discovery-candidate overlay goes away, not the trip itself. */
    tripDrawCart(false);
    render();
  }else{
    map.closePopup();
    tripBuilderOn=true;
    document.body.classList.add('trip-mode');
    if(opts.seedAnchor!=null)tbAnchor=opts.seedAnchor;
    else if(prev==='explore')tbAnchor=tbEffectiveAnchor();
    renderTripBuilder();
    tbDrawMap();
  }
  /* GOLF-41: a real, shareable/bookmarkable URL per mode — pushState (not a
     plain location.hash= assignment) so a mode change doesn't clobber a
     legitimate earlier back-stack entry, and the popstate listener below
     stays the single source of truth for what Back/Forward do. */
  if(pushHash){
    const h=appModeHash(mode);
    if((location.hash||'')!==h)history.pushState({appMode:mode},'',h||location.pathname+location.search);
  }
  syncMastTripButton();
}
/* The masthead's top-right pill always read "Plan a trip", even while
   already inside Plan/Build — a dead-end back to a screen you're already
   on. While a trip mode is active it becomes "← Back to Explore" instead,
   wired to exitTripBuilder(); Explore mode gets the original button back,
   badge and all. */
function syncMastTripButton(){
  const btn=document.getElementById('open-trip');
  if(!btn)return;
  const badge=document.getElementById('trip-badge');
  const badgeHTML=badge?badge.outerHTML:'<span id="trip-badge"></span>';
  if(appMode==='explore'){
    btn.innerHTML=`Plan a trip${badgeHTML}`;
    btn.onclick=()=>enterTripBuilder();
  }else{
    btn.innerHTML='← Back to Explore';
    btn.onclick=()=>exitTripBuilder();
  }
}
/* GOLF-64: the header's "Plan a trip" and a popup's "Add to trip" both land
   in PLAN mode now, never straight in Build — you gather candidates into the
   wishlist first (GOLF-62) and commit them to days second. */
function enterTripBuilder(seedAnchor,opts){setAppMode('plan',Object.assign({seedAnchor:seedAnchor??null},opts||{}));}
function enterBuildMode(opts){setAppMode('build',opts);}
function exitTripBuilder(opts){setAppMode('explore',opts);}
/* GOLF-41/64: back/forward support — popstate fires on both real navigation
   and our own pushState calls above, so this guards against re-entering a
   mode we're already in. Extended from two states to three. */
window.addEventListener('popstate',()=>{
  const m=appModeFromHash();
  if(m!==appMode)setAppMode(m,{pushHash:false});
});
/* tbSelect: the "pick a nearby course" action — set the anchor to the
   just-picked course BEFORE the mutating toggleTrip() call, since
   toggleTrip() synchronously triggers saveState()->render() which (via
   the tripBuilderOn hook in render()) re-renders this pane immediately;
   this is what re-seeds "nearby" from Dornoch -> Castle Stuart -> Nairn. */
/* GOLF-62: Discover's "Add" button now routes through the wishlist by
   default, same as the unified search — was tbAddToDay(i,null), which
   force-created/used a day (see GOLF-60c: this is precisely the bug that
   made adding a course "only ever land on Day 1"). */
function tbSelect(i){tbAddToWishlist(i);}
/* Jump straight into Trip Builder from a course's own popup — the
   fastest path from "I like this course" to "what else is nearby."
   Adds the course to the cart too (it's the first pick of the trip),
   not just anchor-only, matching "select Dornoch -> select Castle
   Stuart -> both are in my cart." */
/* Bug found while testing GOLF-35/36: this used to add straight to the
   TRIP Set without pushing onto tripSeq/tripLastAdded, desyncing the two —
   the cart display (which renders from tripSeq) would silently drop the
   anchor course. Route through toggleTrip() so cart/order/anchor all stay
   in lockstep, same as every other add path. */
function setAsAnchor(i){if(!TRIP.has(i))toggleTrip(i);enterTripBuilder(i)}
/* GOLF-64: a popup's "+ Add to trip" now lands the course in the wishlist
   (GOLF-62) and opens PLAN mode — the natural next question after "I like
   this course" is "what else is near it?", which is exactly what Plan mode
   answers. It never jumps straight into Build/day-scheduling. */
function tbAddToPlan(i){
  tbAddToWishlist(i);
  if(appMode!=='plan')setAppMode('plan',{seedAnchor:i});
}
