/* ============================================================
   js/app-mode.js — the two top-level trip modes (Plan / Build), the
   URL hash, pushState/popstate, and the entry points reached from
   course popups.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */
/* Explore mode (the old map+filters+list landing view) has been removed
   for good — not a toggleable default, not just de-prioritized. There is
   no '#explore' route, no masthead button, and no code path anywhere in
   this file (or any caller of it) that can set appMode to 'explore'.
   Every non-shared mode is now a trip mode: 'plan' (search/discover/
   wishlist — the conceptual half) or 'build' (days, items, costs — the
   concrete half), plus the separate read-only 'shared' view. 'plan' is
   the default landing (no hash); '#trip' still opens Build directly, so
   an old GOLF-41 bookmark/shared link keeps working. `tripBuilderOn`
   is therefore always true from first render on — every existing
   `if(tripBuilderOn)` redraw hook across the file keeps working
   untouched, it's just never false anymore. */
let appMode='plan';
function appModeFromHash(){
  if(location.hash.indexOf('#share=')===0)return 'shared';
  return location.hash==='#trip'?'build':'plan';
}
function appModeHash(m){return m==='build'?'#trip':'';}
function setAppMode(mode,opts){
  opts=opts||{};
  const pushHash=opts.pushHash!==false;
  appMode=mode;
  if(mode==='shared'){
    // GOLF-86: a shared link never needs to push its own hash (it's
    // already the hash that got here), and never touches the trip-mode
    // body class used by every live plan/build mode — a shared view is
    // its own read-only thing, not part of the live app's mode toggling.
    document.body.classList.remove('trip-mode');
    document.body.classList.add('shared-mode');
    renderSharedTrip();
    return;
  }
  document.body.classList.remove('shared-mode');
  /* Explore is gone — every non-shared mode is a trip mode now, so this
     branch (which used to distinguish Explore from Plan/Build) always
     runs. body.trip-mode is therefore added once, on first load, and
     never removed again. */
  map.closePopup();
  tripBuilderOn=true;
  document.body.classList.add('trip-mode');
  if(opts.seedAnchor!=null)tbAnchor=opts.seedAnchor;
  renderTripBuilder();
  tbDrawMap();
  /* GOLF-41: a real, shareable/bookmarkable URL per mode — pushState (not a
     plain location.hash= assignment) so a mode change doesn't clobber a
     legitimate earlier back-stack entry, and the popstate listener below
     stays the single source of truth for what Back/Forward do. */
  if(pushHash){
    const h=appModeHash(mode);
    if((location.hash||'')!==h)history.pushState({appMode:mode},'',h||location.pathname+location.search);
  }
}
/* GOLF-64: the header's "Plan a trip" and a popup's "Add to trip" both land
   in PLAN mode now, never straight in Build — you gather candidates into the
   wishlist first (GOLF-62) and commit them to days second. */
function enterTripBuilder(seedAnchor,opts){setAppMode('plan',Object.assign({seedAnchor:seedAnchor??null},opts||{}));}
function enterBuildMode(opts){setAppMode('build',opts);}
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
