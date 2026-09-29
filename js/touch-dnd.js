/* ============================================================
   js/touch-dnd.js — mobile touch support for the Trip Builder's
   native-HTML5 drag-and-drop (day/item reordering wired up across
   js/trip-model.js, js/trip-add.js and js/trip-ui.js).

   Loaded as a plain <script> (not a module) in the fixed order
   listed in index.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.

   Bug: "the drag and drop for moving courses around from wishlist to a
   day, or their ordering in a wishlist, doesn't seem to work" on mobile.
   Root cause: the whole Trip Builder drag system is native HTML5
   drag-and-drop (draggable="true" + ondragstart/ondragover/ondrop) —
   which mobile Safari and Chrome for Android never fire from touch input
   at all. It was never broken on desktop; it simply never ran on a phone.

   Fix, deliberately NOT a reimplementation: every draggable element's
   ondragstart/ondragover/ondragleave/ondrop/ondragend are real DOM
   properties (set from the inline on*="..." attributes already in the
   rendered HTML), and none of that logic reads its payload from
   event.dataTransfer — tbDrag/tbDayDrag (js/trip-model.js) are plain
   module-level globals, so the actual "what's being dragged" state lives
   outside the DragEvent entirely. That means a touch gesture can drive
   the exact same handlers by calling them directly with a small
   DragEvent-shaped stub — one source of truth for what a drop does,
   shared by mouse and touch. */

/* ── GOLF-215: press-and-hold to lift, swipe to scroll ─────────────
   The first cut of this shim started a drag as soon as the finger had
   travelled 10px on a draggable row. On a phone the itinerary IS the
   scroll surface, and every scroll gesture starts on a card, so a plain
   swipe through the days picked a course up instead — "it mixes up
   genuine scrolls with dragging and dropping".

   A distance threshold cannot tell those two gestures apart, because
   they are the same movement; only intent differs. Time can: a scroll
   starts moving immediately, a deliberate grab does not. So the drag now
   arms on a HOLD — the finger has to stay within TB_HOLD_SLOP of where
   it landed for TB_HOLD_MS — and any movement before that cancels the
   arming outright and hands the gesture back to the browser, which
   scrolls it. Nothing is ever prevented until a lift has actually
   happened, so a swipe is never even slightly stickier than before.

   Because a lift only ever happens from a stationary finger, no scroll
   is in flight at that moment, which is what makes the subsequent
   preventDefault() in touchmove reliable (iOS ignores it once a scroll
   has begun). Desktop mouse drag never enters this file. */
const TB_HOLD_MS=500;   // "about half a second, still"
const TB_HOLD_SLOP=8;   // finger jitter tolerance while holding, px

let tbTouch=null; // {srcEl, overEl, x, y, timer, started}

function tbFakeDragEvent(){
  return{
    preventDefault(){},
    stopPropagation(){},
    dataTransfer:{setData(){},dropEffect:'move',effectAllowed:'move'},
    relatedTarget:null
  };
}
/* Nearest ancestor that is a real drop target — priority falls out of
   closest() naturally (nearest match wins regardless of selector order),
   so a touch over a row inside a day's dropzone hits the row/dropzone
   before the day container behind it. */
function tbTouchDropTarget(el){
  return el&&el.closest?el.closest('.tb-dropzone,.tb-day-endzone,.tb-day-course,.tb-day'):null;
}
/* Elements a touch-drag should never start from — links, buttons, the
   "⋯" row menu, form controls — exactly what draggable="false" already
   excludes for a mouse drag (GOLF-71's fix for the course-name link
   stealing the drag), plus the interactive controls a real tap needs to
   keep working untouched by this shim. */
function tbTouchExcluded(el){
  return el.closest('a,button,input,select,summary,.tb-rowmenu,.tb-drop-body');
}
/* Give up on the gesture. Called both when the finger moves before the
   hold has completed (→ the browser scrolls, nothing was prevented) and
   when a real drag finishes. */
function tbTouchReset(){
  if(tbTouch&&tbTouch.timer)clearTimeout(tbTouch.timer);
  tbTouch=null;
  document.querySelectorAll('.tb-touch-lift').forEach(el=>el.classList.remove('tb-touch-lift'));
}
/* The hold completed with the finger still on the row: lift it. .tb-touch-lift
   is the "it's in your hand now" cue — on touch there is no browser drag
   image, so without it the only feedback would be tbDragStart's
   .tb-drag-src, which FADES the row (correct for a placeholder left
   behind by a ghost, wrong when the row itself is the thing you're
   holding). navigator.vibrate is the buzz where it exists; iOS Safari
   has no API for it, hence the visual cue carrying the same message. */
function tbTouchLift(){
  if(!tbTouch||tbTouch.started)return;
  const src=tbTouch.srcEl;
  if(!src.isConnected||typeof src.ondragstart!=='function'){tbTouchReset();return;}
  tbTouch.started=true;
  tbTouch.timer=null;
  src.classList.add('tb-touch-lift');
  try{if(navigator.vibrate)navigator.vibrate(18);}catch(e){}
  src.ondragstart(tbFakeDragEvent());
}
document.addEventListener('touchstart',e=>{
  tbTouchReset();
  if(e.touches.length>1)return; // pinch/second finger is never a drag
  const pane=document.getElementById('tb-pane');
  if(!pane||!pane.contains(e.target))return;
  if(tbTouchExcluded(e.target))return;
  const src=e.target.closest('[draggable="true"]');
  if(!src||typeof src.ondragstart!=='function')return;
  const t=e.touches[0];
  tbTouch={srcEl:src,overEl:null,x:t.clientX,y:t.clientY,timer:null,started:false};
  tbTouch.timer=setTimeout(tbTouchLift,TB_HOLD_MS);
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!tbTouch)return;
  if(e.touches.length>1){tbTouchReset();return;}
  const t=e.touches[0];
  if(!tbTouch.started){
    /* Still arming. Any real movement means this was a swipe: drop the
       gesture and return WITHOUT preventDefault, so the list scrolls. */
    if(Math.hypot(t.clientX-tbTouch.x,t.clientY-tbTouch.y)>TB_HOLD_SLOP)tbTouchReset();
    return;
  }
  e.preventDefault(); // lifted — the finger now moves the item, not the list
  const el=document.elementFromPoint(t.clientX,t.clientY);
  const target=tbTouchDropTarget(el);
  if(target!==tbTouch.overEl){
    if(tbTouch.overEl&&typeof tbTouch.overEl.ondragleave==='function')tbTouch.overEl.ondragleave(tbFakeDragEvent());
    if(target&&typeof target.ondragover==='function')target.ondragover(tbFakeDragEvent());
    tbTouch.overEl=target;
  }
},{passive:false});
function tbTouchFinish(){
  if(!tbTouch)return;
  if(tbTouch.started){
    if(tbTouch.overEl&&typeof tbTouch.overEl.ondrop==='function')tbTouch.overEl.ondrop(tbFakeDragEvent());
    else if(typeof tbTouch.srcEl.ondragend==='function')tbTouch.srcEl.ondragend(tbFakeDragEvent());
  }
  tbTouchReset();
}
document.addEventListener('touchend',tbTouchFinish);
document.addEventListener('touchcancel',tbTouchFinish);
/* A half-second hold is exactly the gesture Android uses for the
   text-selection / context menu, and iOS for its link callout. The rows
   are already user-select:none + -webkit-touch-callout:none (see
   <style>), but a stray contextmenu would still cancel the touch
   sequence mid-drag, so suppress it for the duration of one of ours. */
document.addEventListener('contextmenu',e=>{if(tbTouch)e.preventDefault();});
