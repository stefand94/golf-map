/* ============================================================
   js/boot.js — startup: the first render(), cold-load mode restore
   from the URL hash, and the initial cart draw. Must load last.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

render();
/* GOLF-41: a direct/shared/bookmarked #trip link opens straight into the
   Trip Builder pane — pushHash:false since the hash is already correct,
   no need to push a duplicate history entry for it. */
/* GOLF-64: three URL states now, not two — a cold load on #plan or #trip
   restores that mode directly (and a bookmarked GOLF-41 #trip link still
   works, landing in Build exactly as it used to). */
if(appModeFromHash()!=='explore')setAppMode(appModeFromHash(),{pushHash:false});
else syncMastTripButton();
if(TRIP.size)tripDrawCart(false);

/* GOLF-80/PWA basics: register the service worker after boot, not before —
   registration is fire-and-forget and shouldn't delay first render. Guarded
   on browser support (Safari <11.1, some older WebViews) rather than
   assumed; a registration failure (e.g. file:// preview, no HTTPS) is
   silently ignored — the app works identically either way, it just won't
   be installable/offline-capable in that context. */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
