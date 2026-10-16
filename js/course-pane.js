/* GOLF-267 (DEC-040): a course opens in the side pane on a desktop.
   A pin gives the slim popup (js/map.js); Details there, or a Discover row,
   slides the full course over the pane. "‹ Discover" or Esc slides it away
   again onto the list exactly as it was — same scroll position, the row you
   looked at highlighted. Prev/next step through the list you came from.
   The pane underneath (js/trip-ui.js) is never touched: this sits over it,
   so a re-render of the list can't lose the visitor's place. Phones keep the
   card in the sheet (js/mobile-sheet.js). */
let cdI=null,cdOrder=[],cdScroll=0,cdOpener=null,cdRowI=null;
const cdPanel=document.querySelector('.panel');
const cdEl=document.createElement('section');
cdEl.className='cd-pane';cdEl.id='cd-pane';cdEl.setAttribute('aria-label','Course details');
cdPanel.appendChild(cdEl);
function cdIsOpen(){return cdI!=null;}
/* The courses in the Discover/shortlist list, in the order they're shown. */
function cdListOrder(){
  const seen=new Set(),out=[];
  document.querySelectorAll('#tb-pane a[onclick*="goToCourse("]').forEach(a=>{
    const m=/goToCourse\((\d+)\)/.exec(a.getAttribute('onclick')||'');
    if(m&&!seen.has(+m[1])){seen.add(+m[1]);out.push(+m[1]);}
  });
  return out;
}
function cdMarkRows(){
  document.querySelectorAll('#tb-pane .tb-row.cd-sel').forEach(r=>r.classList.remove('cd-sel'));
  if(cdRowI==null)return;
  document.querySelectorAll(`#tb-pane a[onclick*="goToCourse(${cdRowI})"]`).forEach(a=>{
    const r=a.closest('.tb-row');if(r)r.classList.add('cd-sel');
  });
}
let cdMarkQueued=false;
new MutationObserver(()=>{
  if(cdMarkQueued||cdRowI==null)return;
  cdMarkQueued=true;
  requestAnimationFrame(()=>{cdMarkQueued=false;cdMarkRows();});
}).observe(document.getElementById('tb-pane'),{childList:true,subtree:true});
function cdHTML(i){
  const pos=cdOrder.indexOf(i),n=cdOrder.length;
  return`<div class="cd-top"><button type="button" class="cd-back" data-cd="back">‹ Discover</button>
    ${pos>=0&&n>1?`<div class="cd-pos"><span>${pos+1} of ${n}</span>
      <button type="button" data-cd="prev" aria-label="Previous course">‹</button>
      <button type="button" data-cd="next" aria-label="Next course">›</button></div>`:''}</div>
    <div class="cd-body">${courseBodyHTML(i,'pane')}</div>`;
}
function cdRender(keepScroll){
  const sc=cdEl.scrollTop;
  cdEl.innerHTML=cdHTML(cdI);
  cdEl.scrollTop=keepScroll?sc:0;
}
function cdRefresh(){if(cdI!=null)cdRender(true);}
function cdOpen(i){
  if(mobIsPhone())return;
  const fresh=cdI==null;
  if(fresh){
    const pane=document.getElementById('tb-pane');
    cdScroll=pane?pane.scrollTop:0;
    cdOrder=cdListOrder();
    cdOpener=document.activeElement;
    const mast=cdPanel.querySelector('.mast');
    cdEl.style.top=(mast?mast.offsetHeight:0)+'px';
  }
  map.closePopup();
  cdI=i;cdRowI=i;
  cdRender(false);
  courseSelect(i);
  cdMarkRows();
  cdEl.classList.add('is-on');
  const c=C[i];
  if(c&&!map.getBounds().pad(-.15).contains([c.lat,c.lng]))map.panTo([c.lat,c.lng]);
  if(fresh){const b=cdEl.querySelector('[data-cd="back"]');if(b)b.focus({preventScroll:true});}
}
function cdClose(){
  if(cdI==null)return;
  cdI=null;
  cdEl.classList.remove('is-on');
  const pane=document.getElementById('tb-pane');
  if(pane)pane.scrollTop=cdScroll;
  cdMarkRows();
  const row=document.querySelector('#tb-pane .tb-row.cd-sel');
  if(row){row.scrollIntoView({block:'nearest'});const a=row.querySelector('a');if(a)a.focus({preventScroll:true});}
  else if(cdOpener&&cdOpener.focus)cdOpener.focus({preventScroll:true});
}
function cdStep(d){
  const pos=cdOrder.indexOf(cdI);if(pos<0||!cdOrder.length)return;
  cdOpen(cdOrder[(pos+d+cdOrder.length)%cdOrder.length]);
}
cdEl.addEventListener('click',e=>{
  const b=e.target.closest('[data-cd]');if(!b)return;
  if(b.dataset.cd==='back')cdClose();
  else cdStep(b.dataset.cd==='next'?1:-1);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&cdI!=null&&!e.defaultPrevented){
    if(cdEl.querySelector('details[open]')&&cdEl.contains(document.activeElement)){return;}
    cdClose();
  }
});
/* A tap on open map lets go of the selection, the row's highlight with it. */
map.on('click',()=>{if(cdI==null){cdRowI=null;cdMarkRows();courseSelect(null);}});
window.addEventListener('resize',()=>{if(cdI!=null&&mobIsPhone())cdClose();});
