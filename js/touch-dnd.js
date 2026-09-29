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
/* Auto-scroll (AC c2). The band at each end of the list inside which a
   held item drags the list along, and the px-per-frame range across it —
   gentle where the finger just enters the band, quickest against the
   very edge. Capped at 10px/frame (~600px/s): fast enough to cross a day
   card in about a second, slow enough to read what's coming, and
   deliberately nowhere near a fling. */
const TB_EDGE_BAND=72;
const TB_EDGE_MIN=2;
const TB_EDGE_MAX=10;

let tbTouch=null; // {srcEl, overEl, x, y, lastX, lastY, timer, started, scroller, raf}

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
/* The thing that actually scrolls under the itinerary. On a phone that
   is the mobile sheet's own scrolling body, on a desktop it is usually
   the document — so find it rather than assume, by walking up from the
   row for the first ancestor that both overflows and is allowed to
   scroll. */
function tbTouchScroller(el){
  for(let n=el&&el.parentElement;n&&n!==document.body;n=n.parentElement){
    const oy=getComputedStyle(n).overflowY;
    if((oy==='auto'||oy==='scroll')&&n.scrollHeight-n.clientHeight>4)return n;
  }
  return document.scrollingElement||document.documentElement;
}
/* Which drop target is under (x,y), and the enter/leave bookkeeping that
   goes with a change. Shared by touchmove and the auto-scroll frame loop,
   because scrolling moves the list under a stationary finger — the row
   the visitor is now pointing at changes with no touch event at all. */
function tbTouchHover(x,y){
  if(!tbTouch)return;
  const target=tbTouchDropTarget(document.elementFromPoint(x,y));
  if(target===tbTouch.overEl)return;
  if(tbTouch.overEl&&typeof tbTouch.overEl.ondragleave==='function')tbTouch.overEl.ondragleave(tbFakeDragEvent());
  if(target&&typeof target.ondragover==='function')target.ondragover(tbFakeDragEvent());
  tbTouch.overEl=target;
}
/* AC (c2): carry an item to a day that is off screen. The finger can't
   go past the edge of the glass, so the list has to come to it — while a
   lifted finger sits in the band at either end, scroll that way, at a
   speed that ramps across the band so easing in is gentle and the very
   edge is the quickest it gets. One rAF loop, started when the finger
   enters the band and cancelled the moment it leaves, is dropped, or the
   list hits its end; the visible viewport, not the scroller's own box,
   sets the band on the document so a full-height page still has one. */
function tbTouchEdgeStop(){
  if(tbTouch&&tbTouch.raf){cancelAnimationFrame(tbTouch.raf);tbTouch.raf=null;}
}
function tbTouchEdgeSpeed(y){
  const sc=tbTouch.scroller;
  const doc=sc===document.scrollingElement||sc===document.documentElement;
  const box=doc?{top:0,bottom:window.innerHeight}:sc.getBoundingClientRect();
  const ramp=d=>TB_EDGE_MIN+(TB_EDGE_MAX-TB_EDGE_MIN)*Math.min(1,(TB_EDGE_BAND-d)/TB_EDGE_BAND);
  const up=y-box.top, down=box.bottom-y;
  if(up<TB_EDGE_BAND&&sc.scrollTop>0)return -ramp(Math.max(0,up));
  if(down<TB_EDGE_BAND&&sc.scrollTop<sc.scrollHeight-sc.clientHeight-1)return ramp(Math.max(0,down));
  return 0;
}
function tbTouchEdgeTick(){
  if(!tbTouch||!tbTouch.started){tbTouchEdgeStop();return;}
  const v=tbTouchEdgeSpeed(tbTouch.lastY);
  if(!v){tbTouch.raf=null;return;}
  const sc=tbTouch.scroller,before=sc.scrollTop;
  sc.scrollTop=before+v;
  if(sc.scrollTop===before){tbTouch.raf=null;return;} // hit the end
  tbTouchHover(tbTouch.lastX,tbTouch.lastY);
  tbTouch.raf=requestAnimationFrame(tbTouchEdgeTick);
}
function tbTouchEdgeSync(){
  if(!tbTouch||!tbTouch.started)return;
  if(tbTouchEdgeSpeed(tbTouch.lastY)){if(!tbTouch.raf)tbTouch.raf=requestAnimationFrame(tbTouchEdgeTick);}
  else tbTouchEdgeStop();
}
/* Give up on the gesture. Called both when the finger moves before the
   hold has completed (→ the browser scrolls, nothing was prevented) and
   when a real drag finishes. */
function tbTouchReset(){
  if(tbTouch&&tbTouch.timer)clearTimeout(tbTouch.timer);
  tbTouchEdgeStop();
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
  tbTouch.scroller=tbTouchScroller(src);
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
  tbTouch={srcEl:src,overEl:null,x:t.clientX,y:t.clientY,lastX:t.clientX,lastY:t.clientY,
    timer:null,started:false,scroller:null,raf:null};
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
  tbTouch.lastX=t.clientX;tbTouch.lastY=t.clientY;
  tbTouchHover(t.clientX,t.clientY);
  tbTouchEdgeSync(); // AC (c2): near an end of the list, bring the list to the finger
},{passive:false});
function tbTouchFinish(){
  if(!tbTouch)return;
  tbTouchEdgeStop();
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
