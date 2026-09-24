/* ============================================================
   js/app-version.js — GOLF-132: page-visible deploy identifier.

   Stamped in lockstep with sw.js's CACHE_NAME by
   scripts/update_sw_cache_version.py (same content hash) so
   js/state.js can detect "did this deploy change since the
   visitor's last load" without a runtime fetch or a second,
   independently-maintained version scheme (DEC-011/GOLF-132).

   Loaded as a plain <script> (not a module), before js/state.js,
   in the fixed order listed in london-golf-map-v5_1.html.
   ============================================================ */
const APP_VERSION='golfmap-shell-v5-1f6aa96a15';
