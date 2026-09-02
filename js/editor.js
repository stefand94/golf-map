/* ============================================================
   js/editor.js — the corrections drawer (with its focus trap), the
   per-course editor, the JSON export/copy/download, and the
   clear-saved-state action.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* ---- editor / export / trip planner drawer ---- */
const drawer=document.getElementById('drawer'),sheet=document.getElementById('sheet');
drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
drawer.addEventListener('click',e=>{if(e.target===drawer)closeDrawer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('open'))closeDrawer()});

/* GOLF-18: focus management — move focus into the drawer on open, trap
   Tab/Shift+Tab within it while open, restore focus to whatever triggered
   it on close. Previously the drawer opened/closed with no focus handling
   at all, leaving keyboard/screen-reader users disoriented. */
let drawerTrigger=null;
function openDrawer(){
  drawerTrigger=document.activeElement;
  drawer.classList.add('open');
  const first=sheet.querySelector('input,select,textarea,button,a[href]');
  if(first)first.focus();
}
function closeDrawer(){
  drawer.classList.remove('open');
  /* GOLF-31: the trip route overlay is independent of this modal drawer's
     lifecycle now (it's drawn whenever the cart is non-empty, pane open or
     not) — closing the unrelated corrections/export drawer must never wipe
     it off the map. */
  if(drawerTrigger&&document.body.contains(drawerTrigger))drawerTrigger.focus();
  drawerTrigger=null;
}
drawer.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const focusable=[...sheet.querySelectorAll('input,select,textarea,button,a[href]')].filter(el=>!el.disabled&&el.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
let editTees=[];
function teeRowHTML(idx,t){
  return `<div class="tee-row" data-idx="${idx}" style="display:flex;gap:6px;align-items:end;margin-bottom:6px">
    <div class="fld" style="flex:1"><label>Tee name</label><input class="e-tee-name" value="${esc(t.name||'')}" placeholder="e.g. White"></div>
    <div class="fld" style="width:64px"><label>Par</label><input class="e-tee-par" type="number" value="${t.par!=null&&t.par!==''?t.par:''}"></div>
    <div class="fld" style="width:64px"><label>Slope</label><input class="e-tee-slope" type="number" value="${t.slope!=null&&t.slope!==''?t.slope:''}"></div>
    <div class="fld" style="width:76px"><label>Rating</label><input class="e-tee-rating" type="number" step="0.1" value="${t.rating!=null&&t.rating!==''?t.rating:''}"></div>
    <button class="btn2 ghost" type="button" onclick="removeTeeRow(${idx})">Remove</button>
  </div>`;
}
function renderTees(){document.getElementById('e-tees-list').innerHTML=editTees.map((t,idx)=>teeRowHTML(idx,t)).join('')}
function syncTeesFromDOM(){
  editTees=[...document.querySelectorAll('#e-tees-list .tee-row')].map(r=>({
    name:r.querySelector('.e-tee-name').value.trim(),
    par:r.querySelector('.e-tee-par').value,
    slope:r.querySelector('.e-tee-slope').value,
    rating:r.querySelector('.e-tee-rating').value
  }));
}
function addTeeRow(){syncTeesFromDOM();editTees.push({name:'',par:'',slope:'',rating:''});renderTees()}
function removeTeeRow(idx){syncTeesFromDOM();editTees.splice(idx,1);renderTees()}
function openEditor(i){
  map.closePopup();
  const stnOpts=Object.keys(STN).sort().map(s=>`<option value="${s}" ${V(i,'stn')===s?'selected':''}>${s}</option>`).join('');
  const csRaw=V(i,'courseStats');
  editTees=csRaw?(csRaw.tees?csRaw.tees.map(t=>({...t})):[{name:'White',par:csRaw.par,slope:csRaw.slope,rating:csRaw.rating}]):[];
  sheet.innerHTML=`<h2>Correct: ${C[i].n}</h2>
    <p class="lede">Change anything that's wrong. Edits stay in this browser session — use <b>Review &amp; export</b> to pull them out as JSON you can paste back to me.</p>
    <div class="grid2"><div class="fld"><label for="e-wd">Weekday fee</label><input id="e-wd" value="${esc(V(i,'wd'))}"></div>
    <div class="fld"><label for="e-we">Weekend fee</label><input id="e-we" value="${esc(V(i,'we'))}"></div></div>
    <div class="grid2"><div class="fld"><label for="e-a">Who can play</label><select id="e-a">${Object.entries(ACCESS).map(([k,v])=>`<option value="${k}" ${V(i,'a')===k?'selected':''}>${v.label}</option>`).join('')}</select></div>
    <div class="fld"><label for="e-band">Fee band</label><select id="e-band">${Object.entries(BANDS).map(([k,v])=>`<option value="${k}" ${V(i,'band')===k?'selected':''}>${v}</option>`).join('')}<option value="na" ${V(i,'band')==='na'?'selected':''}>n/a</option></select></div></div>
    <div class="fld"><label for="e-stn">Nearest station</label><select id="e-stn"><option value="">— none —</option>${stnOpts}</select></div>
    <div class="fld"><label for="e-walk">Getting there from the station</label><input id="e-walk" value="${esc(V(i,'walk'))}"></div>
    <div class="grid2"><div class="fld"><label for="e-arch">Architect</label><input id="e-arch" value="${esc(V(i,'arch'))}"></div>
    <div class="fld"><label for="e-spec">Course spec</label><input id="e-spec" value="${esc(V(i,'spec'))}"></div></div>
    <div class="fld"><label for="e-site">Club website</label><input id="e-site" value="${esc(V(i,'site'))}" placeholder="https://"></div>
    <div class="fld"><label for="e-book">Green fees / booking page</label><input id="e-book" value="${esc(V(i,'book'))}" placeholder="https://"></div>
    <div class="fld"><label for="e-note">Notes</label><textarea id="e-note">${esc(V(i,'note'))}</textarea></div>
    <div class="fld"><label>Course stats (par / slope / course rating) — one row per tee, feeds the handicap calculator</label>
      <div id="e-tees-list">${editTees.map((t,idx)=>teeRowHTML(idx,t)).join('')}</div>
      <button class="btn2 ghost" type="button" onclick="addTeeRow()">+ Add tee</button>
    </div>
    <div class="fld"><label for="e-why">What was wrong? (optional, but useful to me)</label><textarea id="e-why" placeholder="e.g. played it last month, weekend rate is actually £62 and the handicap requirement has gone">${esc((EDITS[i]||{})._why||'')}</textarea></div>
    <div class="bar"><button class="btn2" onclick="saveEdit(${i})">Save correction</button>
    <button class="btn2 ghost" onclick="closeDrawer()">Cancel</button>
    ${isEdited(i)?`<button class="btn2 warn" onclick="revertEdit(${i})">Revert to original</button>`:''}</div>`;
  openDrawer();
}
function saveEdit(i){const g=id=>document.getElementById(id).value;
  const next={wd:g('e-wd'),we:g('e-we'),a:g('e-a'),band:g('e-band'),stn:g('e-stn'),walk:g('e-walk'),arch:g('e-arch'),spec:g('e-spec'),site:g('e-site'),book:g('e-book'),note:g('e-note')};
  const diff={};Object.entries(next).forEach(([k,v])=>{if(v!==C[i][k])diff[k]=v});
  syncTeesFromDOM();
  const tees=editTees.map(t=>({name:t.name||'',par:parseFloat(t.par),slope:parseFloat(t.slope),rating:parseFloat(t.rating)})).filter(t=>!isNaN(t.par)&&!isNaN(t.slope)&&!isNaN(t.rating));
  const csNext=tees.length?(tees.length===1&&!tees[0].name?{par:tees[0].par,slope:tees[0].slope,rating:tees[0].rating}:{tees}):undefined;
  if(JSON.stringify(csNext)!==JSON.stringify(C[i].courseStats))diff.courseStats=csNext===undefined?null:csNext;
  const why=g('e-why').trim();if(why)diff._why=why;
  if(Object.keys(diff).length)EDITS[i]=diff;else delete EDITS[i];
  saveState();closeDrawer();render()}
function revertEdit(i){delete EDITS[i];saveState();closeDrawer();render()}
function corrections(){return Object.keys(EDITS).filter(isEdited).map(i=>{
  const changed={};Object.entries(EDITS[i]).forEach(([k,v])=>{if(k!=='_why')changed[k]={from:C[i][k],to:v}});
  return{course:C[i].n,why:EDITS[i]._why||null,changed}})}
/* GOLF-?? masthead back-button: #open-trip's click handler is now owned by
   syncMastTripButton() (js/app-mode.js), assigned as .onclick so it can
   swap between enterTripBuilder()/exitTripBuilder() per mode — no
   addEventListener here, that would stack a second, stale handler. */
document.getElementById('open-export').addEventListener('click',()=>{
  const list=corrections();
  const tripOrdered=tripSeq;
  const trip=tripOrdered.map(i=>({course:C[i].n,region:C[i].r,weekdayFee:V(i,'wd')}));
  /* GOLF-33: include the day-by-day schedule alongside the flat trip list
     when one exists — driveIn is the visitor's own manual estimate, not a
     real route, labelled accordingly so an exported copy stays honest
     about what it is. */
  const days=tripDays.length?tripDays.map((d,idx)=>({day:idx+1,kind:d.kind,place:d.place||undefined,placeLat:d.placeLat??undefined,placeLng:d.placeLng??undefined,date:d.date||undefined,driveInMinutes:d.driveIn,driveInNote:d.driveIn!=null?"user-entered estimate, not a real route":undefined,
    /* GOLF-63: `courses` stays in the export for backwards compatibility
       with anything already reading it; `stops` is the full ordered
       timeline (golf/hotel/POI as one list), which is now the real shape. */
    courses:tripDayCourses(d).map(i=>C[i].n),
    stops:tripDayItems(d).map(it=>({type:it.type,name:tripItemName(it),price:tripItemPrice(d,it)??undefined,lat:it.lat??undefined,lng:it.lng??undefined}))})):undefined;
  /* GOLF-42: export every saved trip, not just the active one — a
     self-backup/share-by-file path that doesn't need any of Pillar 4's
     later sharing tiers. */
  tripSnapshotActive();
  const allTrips=tripListAll().length>1?tripListAll().map(t=>{
    const tt=trips[t.id];
    return{name:tt.name,active:t.id===activeTripId,courses:(tt.tripSeq||[]).map(i=>C[i].n),
      days:(tt.tripDays||[]).length?tt.tripDays.map((d,idx)=>({day:idx+1,kind:d.kind,place:d.place||undefined,placeLat:d.placeLat??undefined,placeLng:d.placeLng??undefined,date:d.date||undefined,driveInMinutes:d.driveIn,courses:tripDayCourses(d).map(i=>C[i].n),
        stops:tripDayItems(d).map(it=>({type:it.type,name:tripItemName(it),price:it.price??undefined}))})):undefined};
  }):undefined;
  const json=JSON.stringify({source:"The Britain Golf Explorer",exported:new Date().toISOString().slice(0,10),corrections:list,trip,days,allTrips},null,2);
  sheet.innerHTML=`<h2>Your corrections</h2>
    <p class="lede">${list.length?`${list.length} ${list.length===1?'entry':'entries'} changed.`:`Nothing corrected yet. Open any course and hit <b>Correct this</b>.`} ${trip.length?`Your trip (${trip.length} course${trip.length===1?'':'s'}) is included below too.`:''} Your corrections, trip, filters and map position are saved to this browser automatically — export below only if you want a portable copy to paste back into our chat.</p>
    ${list.length||trip.length?`<div class="fld"><label for="ex">Export</label><textarea id="ex" style="min-height:220px">${esc(json)}</textarea></div>
    <div class="bar"><button class="btn2" onclick="copyPatch()">Copy to clipboard</button>
    <button class="btn2 ghost" onclick="downloadPatch()">Download .json</button>
    <button class="btn2 ghost" onclick="closeDrawer()">Close</button>
    <span id="copied" style="font-size:12px;color:var(--stone)"></span></div>`
    :`<div class="bar"><button class="btn2 ghost" onclick="closeDrawer()">Close</button></div>`}
    <div class="bar"><button class="btn2 warn" onclick="wipeStoredState()">Clear saved filters &amp; corrections on this device</button></div>`;
  openDrawer()});
function wipeStoredState(){
  if(!confirm('Clear all saved filters, map position, corrections, played/want-to-play lists and your trip stored in this browser? This cannot be undone unless you exported a copy.'))return;
  Object.keys(EDITS).forEach(k=>delete EDITS[k]);
  PLAYED.clear();WANT.clear();
  trips={default:{name:'My trip',created:Date.now(),modified:Date.now(),trip:[],tripSeq:[],tripDays:[],tripLastAdded:null,tbAnchor:null,tripDayNextId:1}};
  activeTripId='default';tripRestoreActive();
  tbSearchQ='';tbPlaceAnchor=null;tbPlaceAddedNote=null;tbFocusDayPlace=null;tbDayDrag=null;tbAnchor=null;tbDayShown=null;tbRegion='';tbBorder=8; // GOLF-60b
  clearStoredState();closeDrawer();render();
}
function copyPatch(){const t=document.getElementById('ex');t.select();
  navigator.clipboard.writeText(t.value).then(()=>document.getElementById('copied').textContent='Copied.')
  .catch(()=>document.getElementById('copied').textContent='Select the text above and copy manually.')}
function downloadPatch(){try{const blob=new Blob([document.getElementById('ex').value],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='golf-map-corrections.json';a.click();URL.revokeObjectURL(a.href)}
  catch(e){document.getElementById('copied').textContent='Download blocked here — use Copy instead.'}}
