/* ============================================================
   js/touch-dnd.js — mobile touch support for the Trip Builder's
   native-HTML5 drag-and-drop (day/item reordering wired up across
   js/trip-model.js, js/trip-add.js and js/trip-ui.js).

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
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

let tbTouch=null; // {srcEl, overEl, x, y, started}

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
document.addEventListener('touchstart',e=>{
  const pane=document.getElementById('tb-pane');
  if(!pane||!pane.contains(e.target))return;
  if(tbTouchExcluded(e.target))return;
  const src=e.target.closest('[draggable="true"]');
  if(!src||typeof src.ondragstart!=='function')return;
  const t=e.touches[0];
  tbTouch={srcEl:src,overEl:null,x:t.clientX,y:t.clientY,started:false};
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!tbTouch)return;
  const t=e.touches[0];
  if(!tbTouch.started){
    if(Math.hypot(t.clientX-tbTouch.x,t.clientY-tbTouch.y)<10)return;
    tbTouch.started=true;
    tbTouch.srcEl.ondragstart(tbFakeDragEvent());
  }
  e.preventDefault(); // only once a drag has actually begun — plain scrolling stays untouched below the threshold
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
  tbTouch=null;
}
document.addEventListener('touchend',tbTouchFinish);
document.addEventListener('touchcancel',tbTouchFinish);
