/* ============================================================
   js/course-filters.js — GOLF-185d: the course filters, behind an
   icon, on every viewport.

   The filters themselves (state.access / arch / region / flag and the
   feeMin/feeMax range) have existed since GOLF-69 and are still
   persisted by js/state.js — but their only UI was the Explore
   sidebar, which is display:none in trip mode, i.e. always. So a
   filter restored from localStorage could silently hide courses with
   nothing on screen to say so, and nothing to clear it with.

   This module is the reachable UI: a Filters button in the pane's
   toolbar carrying a count of what's active, and a panel (right-hand
   drawer on desktop, bottom sheet on phones) holding the controls.
   No new filters — every control here writes the same state the
   Explore sidebar wrote.

   Loaded as a plain <script> after js/explore.js, whose FEE_BANDS /
   FEE_SLIDER_MAX / feeRangeSet() this reuses rather than re-deriving:
   one filter, two control surfaces, by construction.
   ============================================================ */

/* The panel's chips are built once and then only re-synced (pressed
   state, slider values), never re-innerHTML'd — rebuilding mid-drag
   would drop the pointer capture and stall the slider. The flag and
   area rows are the exception: they depend on the chosen nation, so
   they are rebuilt each time the panel opens. */
let cfBuilt=false;

/* GOLF-185d: how many filters are narrowing anything right now. Same
   shape as js/explore.js's updateFilterBadges() total — each group
   that is narrowing counts once, and the fee range counts as one
   however many ends are bounded. Counts EVERY group, including the
   ones this panel doesn't draw (a stale `walk` or `played` flag from
   an old session still hides courses, so it must still show up in the
   count and still be cleared by Clear filters). */
function cfActiveCount(){
  return state.access.size+state.arch.size+state.region.size+state.flag.size
    +((state.feeMin!=null||state.feeMax!=null)?1:0);
}
/* The "Show only" chips worth offering for the nation being browsed.
   The per-nation top lists are mutually exclusive with the nation
   pills, so only the relevant ones are drawn. */
function cfFlagChips(){
  const out=[['ranked','Top 100 ranked'],['weekend','Open at weekends']];
  const byNation={gb:[['top100','England Top 100'],['topScot','Scotland Top 100'],['topWales','Wales Top 100']],
    ie:[['topIreland','Ireland Top 100']],za:[['topSouthAfrica','South Africa Top 100']]};
  const extra=state.nation?byNation[state.nation]:null;
  return extra?out.concat(extra):out;
}
function cfChipHTML(k,v,label,icon){
  return`<button type="button" class="cf-chip" data-cf-k="${k}" data-cf-v="${esc(v)}" aria-pressed="false">${icon||''}${esc(label)}</button>`;
}
function cfPanelEl(){return document.getElementById('cf-panel');}
function cfBuildPanel(){
  if(cfBuilt)return;
  const wrap=document.createElement('div');
  wrap.innerHTML=`
    <div class="cf-backdrop" id="cf-backdrop" hidden></div>
    <aside class="cf-panel" id="cf-panel" role="dialog" aria-modal="true" aria-label="Filters" hidden>
      <header class="cf-head">
        <b>Filters</b>
        <button type="button" class="cf-x" id="cf-close" aria-label="Close filters">✕</button>
      </header>
      <div class="cf-body">
        <section class="cf-group">
          <span class="cf-label">Green fee</span>
          <div class="cf-chips" id="cf-bands"></div>
          <div class="cf-slider">
            <input id="cf-fee-min-r" type="range" aria-label="Minimum green fee">
            <input id="cf-fee-max-r" type="range" aria-label="Maximum green fee">
          </div>
          <div class="cf-fee-row">
            <label>Min £<input id="cf-fee-min" type="number" min="0" step="5" aria-label="Minimum green fee in pounds"></label>
            <label>Max £<input id="cf-fee-max" type="number" min="0" step="5" aria-label="Maximum green fee in pounds"></label>
            <span class="cf-readout" id="cf-readout"></span>
          </div>
          <p class="cf-note">Courses with no published fee ("POA", members only) drop out as soon as you set a price.</p>
        </section>
        <section class="cf-group">
          <span class="cf-label">Who can play</span>
          <div class="cf-chips" id="cf-access"></div>
        </section>
        <section class="cf-group">
          <span class="cf-label">Show only</span>
          <div class="cf-chips" id="cf-flag"></div>
        </section>
        <section class="cf-group">
          <span class="cf-label">Architect</span>
          <div class="cf-chips" id="cf-arch"></div>
        </section>
        <section class="cf-group">
          <span class="cf-label">Area</span>
          <div class="cf-chips" id="cf-region"></div>
        </section>
      </div>
      <footer class="cf-foot">
        <button type="button" class="cf-clear" id="cf-clear">Clear filters</button>
        <button type="button" class="cf-done" id="cf-done">Show courses</button>
      </footer>
    </aside>`;
  while(wrap.firstElementChild)document.body.appendChild(wrap.firstElementChild);
  document.getElementById('cf-access').innerHTML=
    Object.entries(ACCESS).map(([k,v])=>cfChipHTML('access',k,v.label,flagSVG(v.colour,v.pole,13,false))).join('');
  document.getElementById('cf-arch').innerHTML=
    ARCHS.map(([v,l])=>cfChipHTML('arch',v,l)).join('');
  const panel=cfPanelEl();
  /* One delegated handler for every chip in the panel — the flag and
     area rows are rebuilt on each open, so per-element listeners would
     have to be re-attached each time. */
  panel.addEventListener('click',e=>{
    const band=e.target.closest('[data-cf-band]');
    if(band){feeBandApply(band.dataset.cfBand);cfSync();return;}
    const chip=e.target.closest('[data-cf-k]');
    if(!chip)return;
    const k=chip.dataset.cfK,v=chip.dataset.cfV;
    if(state[k].has(v))state[k].delete(v);else state[k].add(v);
    cfApply();
  });
  document.getElementById('cf-close').addEventListener('click',cfClose);
  document.getElementById('cf-done').addEventListener('click',cfClose);
  document.getElementById('cf-backdrop').addEventListener('click',cfClose);
  document.getElementById('cf-clear').addEventListener('click',()=>{
    ['access','price','region','flag','arch'].forEach(k=>state[k].clear());
    state.feeMin=null;state.feeMax=null;
    cfBuildDynamicChips();
    cfApply();
  });
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')cfClose();});
  const minR=document.getElementById('cf-fee-min-r'),maxR=document.getElementById('cf-fee-max-r'),
    minN=document.getElementById('cf-fee-min'),maxN=document.getElementById('cf-fee-max');
  [minR,maxR].forEach(r=>{r.min=0;r.max=FEE_SLIDER_MAX;r.step=1;});
  [minN,maxN].forEach(n=>{n.max=FEE_SLIDER_MAX;n.placeholder=n===minN?'0':String(FEE_SLIDER_MAX);});
  /* feeRangeSet() already does saveState()+render() and syncs the
     legacy Explore controls, so this only has to re-sync its own. */
  const fromSliders=()=>{feeRangeSet(parseFloat(minR.value),parseFloat(maxR.value));cfSync();};
  minR.addEventListener('input',fromSliders);
  maxR.addEventListener('input',fromSliders);
  const fromNumbers=()=>{feeRangeSet(
    minN.value.trim()===''?0:parseFloat(minN.value),
    maxN.value.trim()===''?FEE_SLIDER_MAX:parseFloat(maxN.value));cfSync();};
  minN.addEventListener('change',fromNumbers);
  maxN.addEventListener('change',fromNumbers);
  cfBuilt=true;
}
/* The two rows whose contents depend on the nation pill. */
function cfBuildDynamicChips(){
  document.getElementById('cf-flag').innerHTML=
    cfFlagChips().map(([v,l])=>cfChipHTML('flag',v,l)).join('');
  const regions=state.nation?tbRegionsForNation(state.nation):REGIONS;
  document.getElementById('cf-region').innerHTML=
    regions.map(r=>cfChipHTML('region',r,r)).join('');
}
/* A filter changed: persist it and rebuild everything that shows
   courses. render() redraws the map pin layer AND calls
   renderTripBuilder(), so the map, the Discover lists and the search
   results all come back agreeing with each other. */
function cfApply(){
  saveState();
  if(typeof updateFilterBadges==='function')updateFilterBadges();
  render();
  cfSync();
}
function cfSync(){
  if(!cfBuilt)return;
  const panel=cfPanelEl();
  panel.querySelectorAll('[data-cf-k]').forEach(ch=>{
    ch.setAttribute('aria-pressed',String(state[ch.dataset.cfK].has(ch.dataset.cfV)));
  });
  document.getElementById('cf-bands').innerHTML=FEE_BANDS.map(([k,label,lo,hi])=>
    `<button type="button" class="cf-chip" data-cf-band="${k}" aria-pressed="${feeBandActive(lo,hi)}">${label}</button>`).join('');
  const lo=state.feeMin!=null?state.feeMin:0,hi=state.feeMax!=null?state.feeMax:FEE_SLIDER_MAX;
  document.getElementById('cf-fee-min-r').value=lo;
  document.getElementById('cf-fee-max-r').value=hi;
  document.getElementById('cf-fee-min').value=state.feeMin!=null?state.feeMin:'';
  document.getElementById('cf-fee-max').value=state.feeMax!=null?state.feeMax:'';
  document.getElementById('cf-readout').textContent=
    (state.feeMin==null&&state.feeMax==null)?'any price'
      :`£${lo} – ${hi>=FEE_SLIDER_MAX?`${FEE_SLIDER_MAX}+`:`£${hi}`}`;
  const n=cfActiveCount();
  const clear=document.getElementById('cf-clear');
  clear.disabled=!n;
  clear.textContent=n?`Clear filters (${n})`:'Clear filters';
  const shown=state.nation?C.reduce((a,c,i)=>a+(passes(i)?1:0),0):null;
  document.getElementById('cf-done').textContent=
    shown==null?'Done':`Show ${shown} course${shown===1?'':'s'}`;
}
function cfOpen(){
  cfBuildPanel();
  cfBuildDynamicChips();
  cfSync();
  document.getElementById('cf-backdrop').hidden=false;
  cfPanelEl().hidden=false;
  document.body.classList.add('cf-open');
  const first=cfPanelEl().querySelector('.cf-x');
  if(first)first.focus();
}
function cfClose(){
  if(!cfBuilt)return;
  document.getElementById('cf-backdrop').hidden=true;
  cfPanelEl().hidden=true;
  document.body.classList.remove('cf-open');
  const btn=document.getElementById('tb-course-filters');
  if(btn)btn.focus();
}
function cfToggle(){
  if(cfBuilt&&!cfPanelEl().hidden)cfClose();else cfOpen();
}
/* The toolbar button. Rendered by renderTripBuilder() on every pass,
   so the count is always current; the panel itself lives outside the
   pane and survives those re-renders. */
function cfButtonHTML(){
  const n=cfActiveCount();
  return`<button type="button" class="tb-btn is-sm${n?' is-active':''}" id="tb-course-filters"
    aria-haspopup="dialog" title="Filter by green fee, who can play, ranking, architect or area. Applies to the map, the lists and search alike."
    >${FILTER_ICON_SVG}<span class="tb-lbl-long">&nbsp;Filters</span>${n?`<span class="cf-badge">${n}</span>`:''}</button>`;
}
function cfWireButton(){
  const b=document.getElementById('tb-course-filters');
  if(b)b.addEventListener('click',cfToggle);
}
