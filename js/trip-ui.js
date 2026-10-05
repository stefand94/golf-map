/* ============================================================
   js/trip-ui.js — the Trip Builder pane UI: the shared search
   component, day cards, the itinerary lists, the Costs tab, the
   wishlist, and renderTripBuilder() with all of its event wiring.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in index.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* item-6: the Share button used a 🔗 chain-link emoji; the stakeholder's
   screenshot showed the standard iOS/macOS Share glyph (a box with an
   arrow lifting out of its top) and asked to match it. No system font
   renders that exact glyph as an emoji, so it's a small inline SVG
   instead — currentColor so it always matches the button's own text
   colour (light/dark, hover, disabled) with no separate theming needed. */
const SHARE_ICON_SVG=`<svg class="share-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

/* GOLF-150: the toolbar's text buttons ("Clear trip", "Filters") became
   icon buttons, same inline-SVG/currentColor approach as SHARE_ICON_SVG. */
const TRASH_ICON_SVG=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>`;
const FILTER_ICON_SVG=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`;
const PERSON_ICON_SVG=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;

/* ════════════════════════════════════════════════════════════════════
   GOLF-71 workstream B — THE search component.

   Before this round the app hand-rolled the same "type → debounce →
   orsGeocode → results dropdown → mousedown to pick" sequence in FIVE
   places, each with its own subtly different copy of the debounce timer,
   the stale-response guard and the blur race-condition workaround:

     1. renderTripBuilder()  — the unified search bar
     2. renderTripBuilder()  — each day's "search a city" box
     3. renderTripBuilder()  — the "add hotel/POI" form's location box
     4. renderTripBuilder()  — Discover's place-search box (GOLF-91: this
        and the old "Nearby" scope were later merged into one "Nearby"
        scope; the search box itself lives in the unified bar (#1) now,
        not a separate box)
     5. explore.js           — the Explore panel's #q place lookup

   Now there is one debounce (tbGeocodeDebounced), one markup helper
   (tbSearchFieldHTML) and one behaviour binding (tbAttachSearch), and
   every call site goes through them. Call site 4 was deleted outright
   rather than converted: the unified bar already anchors the discovery
   lens when you pick a place, so Discover's own box was a second control
   for an action the main bar performs — exactly the duplication the
   stakeholder asked to remove ("there should only be one search bar for
   everything"). Net: 5 bespoke implementations → 1 component, 3 call
   sites.
   ════════════════════════════════════════════════════════════════════ */

/* One debounce + stale-response guard, keyed so independent fields don't
   cancel each other. Three distinct states, kept apart deliberately (Phase
   22 fix): cb(null) means "cleared / nothing typed"; cb(undefined) means
   "the geocode request itself failed" (network error, proxy down, ORS
   rejected it — orsGeocode() reports this as its own null, which used to
   get silently collapsed into "[]" here, making an outage look identical
   to "no matches"); cb([]) means "the geocoder answered and there
   genuinely are no matches". Callers should treat undefined as a reason to
   show an explicit "search unavailable" message, not an empty result. */
const tbGeoTimers={},tbGeoLatest={};
function tbGeocodeDebounced(key,text,cb,ms,country,layers){
  clearTimeout(tbGeoTimers[key]);
  tbGeoLatest[key]=text;
  if(!text||!text.trim()){cb(null);return;}
  tbGeoTimers[key]=setTimeout(()=>{
    orsGeocode(text,list=>{
      if(tbGeoLatest[key]!==text)return; // a newer keystroke has since fired
      cb(list===null?undefined:list);
    },country,layers);
  },ms==null?300:ms);
}
/* The component's markup. `variant:'bar'` is the full-width pill at the
   top of the pane; the default is an inline field inside a card. The
   results container is always `<id>-results`, which is the contract
   tbAttachSearch() relies on. */
function tbSearchFieldHTML(o){
  const bar=o.variant==='bar';
  return`<span class="tb-place-wrap${bar?' tb-search-bar-wrap':''}"${o.wrapStyle?` style="${o.wrapStyle}"`:''}>
    <input type="text" id="${o.id}" class="${bar?'tb-search-bar':'tb-field'}" autocomplete="off" spellcheck="false"
      role="combobox" aria-expanded="false" aria-autocomplete="list"
      ${o.title?`title="${esc(o.title)}"`:''} ${o.ariaLabel?`aria-label="${esc(o.ariaLabel)}"`:''}
      placeholder="${esc(o.placeholder||'')}" value="${esc(o.value==null?'':o.value)}">
    ${bar?`<button type="button" class="tb-search-clear" aria-label="Clear search" title="Clear search"${o.value?'':' hidden'}>×</button>`:''}
    <div id="${o.id}-results" class="tb-place-results" role="listbox"></div>
  </span>`;
}
/* The component's behaviour. Binds one field + its results dropdown.
     opts.onPick({label,lat,lng}, inputEl)  — required; a result was chosen
     opts.onType(text)                      — optional; every keystroke
     opts.render(list, resultsEl)           — optional; take over painting
                                              (used by the unified bar,
                                              which mixes course hits in)
   Keyboard: ↑/↓ move, Enter picks, Escape closes — the dropdown was
   mouse-only before. mousedown (not click) picks, so the input's own
   blur can't clobber the selection mid-gesture. */
function tbAttachSearch(id,opts){
  const input=document.getElementById(id),results=document.getElementById(id+'-results');
  if(!input||!results)return null;
  let active=-1;
  const rows=()=>Array.from(results.querySelectorAll('.tb-place-row'));
  const close=()=>{results.innerHTML='';active=-1;input.setAttribute('aria-expanded','false');};
  const paint=list=>{
    active=-1;
    if(list===null){close();return;} // cleared / nothing typed
    if(list===undefined){ // the geocode request failed — distinct from a genuine zero-match answer
      results.innerHTML=`<div class="tb-place-empty">Place search is temporarily unavailable</div>`;
      input.setAttribute('aria-expanded','true');
      return;
    }
    results.innerHTML=list.length
      ?list.map(r=>`<div class="tb-place-row" role="option" data-lat="${r.lat}" data-lng="${r.lng}" data-label="${esc(r.label)}">📍 ${esc(r.label)}</div>`).join('')
      :`<div class="tb-place-empty">No matches</div>`;
    input.setAttribute('aria-expanded',String(!!list.length));
  };
  const pick=row=>{
    const r={label:row.dataset.label,lat:parseFloat(row.dataset.lat),lng:parseFloat(row.dataset.lng)};
    close();
    opts.onPick(r,input);
  };
  /* GOLF-150 (S2): the bar variant gets a × to clear it (clearing on a
     phone used to mean select-all + delete), and Escape clears it too. */
  const clearBtn=input.parentElement.querySelector('.tb-search-clear');
  const clearField=()=>{input.value='';input.dispatchEvent(new Event('input'));input.focus();};
  if(clearBtn){
    clearBtn.addEventListener('mousedown',e=>e.preventDefault()); // keep focus in the field
    clearBtn.addEventListener('click',clearField);
    input.addEventListener('input',()=>{clearBtn.hidden=!input.value;});
  }
  input.addEventListener('input',()=>{
    const text=input.value;
    if(opts.onType)opts.onType(text);
    const country=typeof opts.country==='function'?opts.country():opts.country;
    tbGeocodeDebounced(id,text,list=>{
      // Don't paint over a field the visitor has already left.
      if(document.activeElement!==input&&!opts.render)return;
      if(opts.render)opts.render(list,results);else paint(list);
    },null,country,opts.layers);
  });
  input.addEventListener('keydown',e=>{
    const rs=rows();
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!rs.length)return;
      e.preventDefault();
      active=(active+(e.key==='ArrowDown'?1:-1)+rs.length)%rs.length;
      rs.forEach((r,k)=>r.classList.toggle('is-active',k===active));
      rs[active].scrollIntoView({block:'nearest'});
    }else if(e.key==='Enter'){
      if(active>=0&&rs[active]){e.preventDefault();pick(rs[active]);}
    }else if(e.key==='Escape'){close();if(clearBtn&&input.value)clearField();}
  });
  results.addEventListener('mousedown',e=>{
    const row=e.target.closest('.tb-place-row');
    if(!row)return;
    e.preventDefault();
    pick(row);
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(results.isConnected)close();},150));
  return{input,results,close,paint};
}

/* ════════════════════════════════════════════════════════════════════
   Day legs — one row per stop, with a drive caption above each stop that
   has a predecessor. Unchanged from GOLF-63 in behaviour; only the
   rendering below it changed this round.
   ════════════════════════════════════════════════════════════════════ */
function tripDayLegs(dayIdx){
  const d=tripDays[dayIdx];if(!d)return[];
  const chain=tripStopChain();
  const posOf=new Map();
  let firstPos=-1,placePos=-1;
  chain.forEach((s,k)=>{
    if(s.dayIdx!==dayIdx)return;
    if(firstPos<0)firstPos=k;
    if(s.type==='place'&&placePos<0)placePos=k;
    if(s.itemId)posOf.set(s.itemId,k);
  });
  const driveRow=(pos)=>{
    const prev=tripPrevStop(chain,pos);
    if(!prev)return null;
    const cur=chain[pos];
    const leg=tripLegEstimate(prev,cur);
    const isDayFirst=pos===firstPos;
    const overridden=isDayFirst&&d.driveIn!=null;
    const mins=overridden?d.driveIn:(leg?leg.minutes:null);
    /* GOLF-118: ferry info for this leg. In the read-only shared view the
       live ORS cache isn't populated, so the day-first leg's ferry facts
       are frozen onto the day object at share time (d.ferryIn) — same
       mechanism as driveIn. Live app: straight off the leg estimate. */
    const fin=(isDayFirst&&d.ferryIn)?d.ferryIn:leg;
    const hasFerry=!!(fin&&fin.hasFerry),ferryMinutes=(fin&&fin.ferryMinutes)||0;
    return{type:'drive',label:`${prev.name} → ${cur.name}`,mins,real:!!(leg&&leg.real),
      dayFirst:isDayFirst,overridden,hasFerry,ferryMinutes};
  };
  const legs=[];
  if(placePos>=0){const r=driveRow(placePos);if(r)legs.push(r);}
  tripDayItems(d).forEach(it=>{
    const pos=posOf.get(it.id);
    if(pos!=null){const r=driveRow(pos);if(r)legs.push(r);}
    const det=tripItemPriceDetail(d,it);
    /* GOLF-153: a note's words are its name, and a note attached to
       another item rides along so the read-only itinerary can show it
       too — the shared view renders from these legs, not from
       tripDayItemRowHTML(). */
    legs.push({type:it.type,name:it.type==='note'?(it.text||''):tripItemName(it),
      note:it.note||null,price:det.total,detail:det,id:it.id,i:it.type==='golf'?it.i:undefined});
  });
  return legs;
}
/* GOLF-170a: a single day can mix currencies — the ordinary trigger is a
   border-crossing day (play in Northern Ireland at £, stay in the Republic
   at €). The old flat reduce added those together and tbDaySumHTML then
   labelled the result with the day's *majority* currency, so £100 + €120
   rendered as "£220": wrong arithmetic wearing the wrong symbol. Return a
   money bucket instead ({'£':100,'€':120}) and let moneyBucketFmt() render
   it as "£100 + €120". Each leg's own `cur` comes from
   tripItemPriceDetail(); tripDayLegs() excludes only drives, so hotels and
   POIs are bucketed too. Single-currency days are unaffected — one bucket
   formats to exactly the string tbMoney() produced before. */
function tripDayTotal(dayIdx){
  const buckets={};
  tripDayLegs(dayIdx).forEach(l=>{
    if(l.type==='drive'||l.price==null)return;
    moneyBucketAdd(buckets,(l.detail&&l.detail.cur)||'GBP',l.price);
  });
  return buckets;
}
/* GOLF-71: the drive leg is a small indented caption sitting directly
   above the stop it leads into — the sketch's "Drive X min" label — not
   the chip-and-full-route-string row it used to be. The from → to string
   is still available, in the title tooltip, where it doesn't compete with
   the stop names for attention. */
function tbDriveCapHTML(l){
  if(l.mins==null&&!l.label)return'';
  /* GOLF-118: when the leg crosses water, split the time into drive + ferry
     ("2h 0m driving + ~55m ferry") and add a ⛴ tag. A manual driveIn
     override keeps its own number (no split) but still shows the tag so the
     ferry isn't hidden; hasFerry with a zero ferry estimate → tag only. */
  let timeHTML;
  if(l.hasFerry&&l.ferryMinutes>0&&!l.overridden&&l.mins!=null){
    const drive=l.mins-l.ferryMinutes;
    timeHTML=drive>=1
      ?`${esc(fmtDriveMinutes(drive))} driving + ~${esc(fmtDriveMinutes(l.ferryMinutes))} ferry`
      :`~${esc(fmtDriveMinutes(l.ferryMinutes))} ferry`;
  }else{
    timeHTML=l.mins!=null?esc(fmtDriveMinutes(l.mins)):'—';
  }
  const tag=l.hasFerry?` <span class="wt tb-ferry-tag" title="This route has a ferry">⛴ This route has a ferry</span>`:'';
  return`<div class="tb-drive-cap${l.hasFerry?' has-ferry':''}" title="${esc(l.label)}">🚗 Drive ${timeHTML}${l.real?` <span class="tb-drive-real">· live</span>`:''}${tag}</div>`;
}
/* Currency correctness (GOLF-169): every `cur` passed around the pane is
   now a currency CODE ('GBP'/'EUR'/'ZAR'/'AUD'/'NZD'...), sourced from
   courseCurrency()/tripItemPriceDetail()'s `cur` field — never a bare
   symbol, since a symbol alone can't tell AUD from NZD apart (both "$").
   tbMoney() is the one place that turns a code into the displayed symbol
   (curSym(), js/util.js), so every caller downstream of it — tbPrice(),
   this file's manual "£X × N people" templates below — gets the
   conversion for free as long as it goes through tbMoney or curSym(). */
const tbMoney=(v,cur='GBP')=>v!=null?`${curSym(cur)}${v.toFixed(0)}`:'—';
/* GOLF-150 I3: a row's own price when it's unknown reads "TBC" (muted)
   rather than a bare "–" that sat beside the ⋯ menu looking like a
   collapse control. Cost tables keep tbMoney()'s dash. */
const tbPrice=(v,cur='GBP')=>v!=null?tbMoney(v,cur):'<span class="tb-price-tbc">TBC</span>';
/* GOLF-193: the Per person / Total choice used to live and die inside the
   Costs tab, so a trip could read £100 on an Itinerary day card and £50 on
   Costs at the same time and never say which was which. The mode is now one
   app-wide fact. Every figure outside the Costs tab renders BOTH readings
   and CSS shows the one matching `data-cost-mode` on <body> — the same
   trick GOLF-178 already used inside .cost-body, lifted up a level. Nothing
   re-renders on a mode change, so the map, the open day cards and the
   read-only #share= view all keep their state.
   The control itself stays on the Costs tab; the AC asks for the CHOICE to
   apply app-wide, not for the segmented control to be repeated in chrome
   GOLF-150 already called overcrowded. */
function tbCostModeApply(){
  const m=tbCostMode==='tot'?'tot':'pp';
  if(document.body)document.body.dataset.costMode=m;
  return m;
}
/* Per person is the total divided by the group size — one rule for every
   figure in the app, so a day card, the badge and the Costs tab can never
   disagree. A single traveller has no second reading, so nothing is
   doubled up for them. */
function tbDualBucketHTML(b,cur,unit){
  const gs=groupSizeFor();
  const tot=moneyBucketFmt(b,cur);
  if(gs<=1)return unit?`${tot}<span class="cv-unit"> ${unit.tot}</span>`:tot;
  const pp=costPPBucketFmt(b,gs,cur);
  return`<span class="cv-pp">${pp}${unit?`<span class="cv-unit"> ${unit.pp}</span>`:''}</span>`
        +`<span class="cv-tot">${tot}${unit?`<span class="cv-unit"> ${unit.tot}</span>`:''}</span>`;
}
/* A single item's price, in both readings. Unpriced rows keep tbPrice()'s
   "TBC" — there is nothing to show per head either. */
function tbDualPriceHTML(v,cur){
  const gs=groupSizeFor();
  if(v==null)return tbPrice(v,cur);
  if(gs<=1)return tbMoney(v,cur);
  /* A row figure is too narrow for a visible "pp"/"total" without crowding
     the name beside it, and the day header above it already states the
     reading. The title carries it for anyone checking a single row, and for
     a screen reader. */
  return`<span class="cv-pp" title="Per person">${costPPMoney(v,cur,gs)}</span>`
        +`<span class="cv-tot" title="Total for all ${gs} travellers">${tbMoney(v,cur)}</span>`;
}
/* GOLF-193: the mark for a figure the app guessed rather than read. It
   goes on the figure itself, not only on the line that produced it, so a
   total containing one estimate is marked too — otherwise the trip total
   looks like a researched number. */
const EST_TITLE='Includes an estimate the app filled in — not a quoted price';
const estMark=on=>on?`<span class="cost-est" title="${EST_TITLE}">~</span>`:'';
/* Does this day contain a figure the app estimated? Today that is a stay
   with no price entered (tripItemPriceDetail sets det.est, js/trip-geo.js).
   Driving fuel is a trip-level estimate and is handled with the trip
   total, not here — no day card shows fuel. */
function tripDayEstimated(dayIdx){
  return tripDayLegs(dayIdx).some(l=>l.type!=='drive'&&l.price!=null&&l.detail&&l.detail.est);
}
/* Any estimate anywhere in the trip, for the figures that total everything:
   an estimated stay on any day, or the fuel estimate while it is switched
   on (FUEL_COST_PER_MILE is an assumed running cost, js/trip-geo.js). */
function tripHasEstimate(){
  if(tbIncludeFuel&&tripTotalDriveMiles()>0)return true;
  return tripDays.some((d,idx)=>tripDayEstimated(idx));
}
/* Day-header total: blank for a day with nothing priced. */
/* ── GOLF-186: the stay slot.

   A golf day used to say nothing at all about where you were sleeping
   until you found "＋ Add to Day N → 🏨 A place to stay" — two taps into a
   menu, on the one question every golf trip has to answer for every night.
   The slot asks it outright, sits in the same place on every golf day, and
   once it is answered becomes the stay's own editor: nights and price are
   changed here rather than by re-opening the add form through the row's
   overflow menu.
   Only the FIRST hotel on a day is the slot's subject. A day can hold more
   than one (nothing stops it, and a moved stay can transiently produce
   it), and the extra ones stay visible as ordinary itinerary rows — the
   slot is the day's headline answer, not a second copy of the list. */
function tripDayStay(d){
  return(d.items||[]).find(it=>it.type==='hotel')||null;
}
function tbStayNightsStep(dayId,itemId,delta){
  const it=tripDayFindItem(dayId,itemId);
  if(!it)return;
  /* tripDayResizeStay() rebuilds the stay's items from scratch (new ids),
     so the re-render is not a nicety — the stepper's own itemId is stale
     the moment this returns. */
  tripDayResizeStay(dayId,itemId,(it.nights||1)+delta);
  renderTripBuilder();tbDrawMap();
}
function tbStayPriceSet(dayId,itemId,el){
  const it=tripDayFindItem(dayId,itemId);
  if(!it||!el)return;
  const raw=String(el.value).trim();
  const v=raw?parseFloat(raw):NaN;
  // A blank field means "I haven't got a price", which is a real answer:
  // it puts the stay back on the app's estimate (GOLF-193), not on zero.
  tripDayUpdateStop(dayId,itemId,{name:it.name,price:Number.isFinite(v)&&v>=0?v:null,lat:it.lat,lng:it.lng});
  renderTripBuilder();tbDrawMap();
}
/* GOLF-197: which night of its stay this day is, 0-based. Extracted from
   the slot, which used to own both this and the controls. */
function tripStayNightIndex(d,st){
  if(!st||!st.stayId)return 0;
  return tripDays.filter(dd=>(dd.items||[]).some(x=>x.stayId===st.stayId))
    .findIndex(dd=>dd.id===d.id);
}
/* GOLF-197: the stay's controls, now rendered inside the hotel's own row
   (js/trip-add.js) instead of in a box below the day.

   The box was a second copy of something the day already listed: one
   hotel appeared as a "Stay" row in the day order AND again in the slot,
   and the slot's fixed-width name ellipsised anything long ("Sinnott's
   Bar Guest R…"). Putting the controls on the row itself removes the
   duplicate outright rather than hiding one of the two, and the row has
   the full width of the card to wrap a name into.

   Only the first night of a multi-night stay gets these: tripDayResizeStay()
   re-spans a stay forward from whichever day it is called on, so a "+" on
   night 2 would silently move the booking's start date, and "Change" there
   would leave the earlier nights pointing at the old hotel (DEC-028 186a). */
function tbStayControlsHTML(d,st){
  const n=st.nights||1;
  const det=tripItemPriceDetail(d,st);
  const cur=curSym(tripStayCurrency(d,st));
  /* The field takes a PER PERSON, per night figure, so its placeholder has
     to be the per-person share of the estimate — det.total is the room. A
     placeholder of ~£110 beside an itinerary row reading ~£55 is exactly
     the two-figures-disagree bug GOLF-193 went and fixed. */
  const gs=groupSizeFor();
  const est=det.est&&det.total!=null?det.total/(gs>1?gs:1):null;
  const ph=est!=null?`~${cur}${Math.round(est)} est.`:`${cur} / night`;
  /* The row is draggable; these are not. Without this, a press inside the
     price field starts a drag of the whole stop instead of a text
     selection. */
  const noDrag=`draggable="false" ondragstart="event.preventDefault();event.stopPropagation();"`;
  /* GOLF-233: null in the shared view, and null when the stay is nowhere
     near a destination we can actually search — see js/affiliate.js. */
  const aff=typeof affHotelLink==='function'?affHotelLink(d,st):null;
  return`<div class="tb-stay-ctl" ${noDrag}>
    <span class="tb-stay-nights">
      <span class="tb-stay-label">Nights</span>
      <button type="button" class="tb-step" ${noDrag} onclick="tbStayNightsStep(${d.id},'${st.id}',-1)"
        title="One night fewer"${n<=1?' disabled':''}>−</button>
      <b class="tb-stay-n">${n}</b>
      <button type="button" class="tb-step" ${noDrag} onclick="tbStayNightsStep(${d.id},'${st.id}',1)"
        title="One night more — fills the following day(s) with the same stay">+</button>
    </span>
    <input class="tb-field tb-stay-price" type="number" min="0" step="5" ${noDrag}
      title="What this stay costs per person, per night. Leave it blank to keep the app's estimate."
      placeholder="${esc(ph)}" value="${st.price!=null?esc(String(st.price)):''}"
      onchange="tbStayPriceSet(${d.id},'${st.id}',this)">
    <button type="button" class="tb-btn is-sm is-quiet" ${noDrag} onclick="tbOpenHotelPicker(${d.id})"
      title="Pick a different hotel — replaces it on every night of this stay">Change</button>
    ${aff?`<a class="tb-btn is-sm is-quiet tb-aff" ${noDrag} href="${esc(aff.href)}"
      target="_blank" rel="sponsored noopener"
      title="Search hotels around ${esc(aff.dest)} for these dates">Check prices ↗</a>
    <p class="tb-aff-note">Hotel search around ${esc(aff.dest)}. ${esc(AFF_DISCLOSURE)}</p>`:''}
  </div>`;
}
/* GOLF-197: the slot is now only ever the empty question. Once a hotel is
   picked, the day's own hotel row answers it. */
function tbStaySlotHTML(d){
  if((d.kind||'golf')!=='golf')return'';
  if(tripDayStay(d))return'';
  return`<div class="tb-stay-slot is-empty">
    <button type="button" class="tb-stay-ask" onclick="tbOpenHotelPicker(${d.id})"
      title="Show hotels near this day's golf">🏨 Where are you staying?</button>
  </div>`;
}
const tbDaySumHTML=idx=>{
  const b=tripDayTotal(idx);
  if(!Object.keys(b).some(c=>b[c]))return'';
  return`<span class="tb-day-sum">${estMark(tripDayEstimated(idx))}${tbDualBucketHTML(b,undefined,{pp:'pp',tot:'total'})}</span>`;
};
/* GOLF-74/91: the £ figure as the visitor should read it. A hotel priced
   for more than one traveller shows its arithmetic ("£90 × 2 people = £180")
   rather than silently folding the multiplication into the trip total.
   Everything else is plain tbMoney(), so this is a strict superset. */
function tripPriceLabel(det){
  if(!det||det.total==null)return'—';
  const cur=det.cur||'GBP',sym=curSym(cur);
  return det.sharing?`${sym}${det.base.toFixed(0)} × ${det.guests} people = ${sym}${det.total.toFixed(0)}`:tbMoney(det.total,cur);
}
function itinLegRowHTML(l){
  if(l.type==='drive')return tbDriveCapHTML(l);
  /* GOLF-153: a flight and a note are stops of their own here too —
     this is the renderer the read-only shared view uses. */
  const icon=l.type==='golf'?'⛳':l.type==='hotel'?'🏨':l.type==='flight'?'✈':l.type==='note'?'📝':'📍';
  /* Merge (GOLF-71 + GOLF-74): GOLF-71's price column is a single nowrap
     figure and stays exactly that — the sharing arithmetic would have burst
     it. Instead a per-person stay explains itself on GOLF-71's own existing
     .cart-region meta line under the name, so the worked total is visible
     (not hidden in a tooltip) without changing the row's shape or adding a
     new style. Build-mode rows, which have no meta line to spare, keep the
     tooltip. */
  const sharing=!!(l.detail&&l.detail.sharing);
  const cur=(l.detail&&l.detail.cur)||'GBP',sym=curSym(cur);
  return`<div class="tb-day-course tb-item-${l.type}" style="cursor:default">
    <span class="tb-item-icon">${icon}</span>
    <div class="tb-item-main"><span class="tb-item-name">${esc(l.name)}</span>
      ${sharing?`<div class="cart-region">${sym}${l.detail.base.toFixed(0)} × ${l.detail.guests} people = ${sym}${l.detail.total.toFixed(0)}</div>`:''}
      ${l.note?`<div class="tb-item-noteline" title="${esc(l.note)}">📝 ${esc(l.note)}</div>`:''}</div>
    <span class="tb-item-price">${estMark(!!(l.detail&&l.detail.est))}${tbDualPriceHTML(l.price,cur)}</span>
  </div>`;
}
function tbItinAllHTML(){
  if(!tripDays.length)return`<p class="hint">Add a day to start building your itinerary.</p>`;
  /* GOLF-153: the same two views the trip's owner had. The toggle is the
     only thing added when detailed mode is off — the day markup below is
     untouched, so an existing share link renders exactly as it did. */
  const firstNights=tlFirstNightItemIds();
  return tlViewToggleHTML()+tripDays.map((d,idx)=>{
    const legs=tripDayLegs(idx);
    const dow=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}):'';
    return`<div class="tb-day">
      <div class="tb-day-head">
        <span class="tb-day-title"><span class="tb-day-dot"></span>
          <span class="tb-day-title-text">Day ${idx+1}</span>
          <span class="tb-day-place" title="${esc(d.place||'')}">${[dow,d.place?esc(tripShortPlace(d.place)):''].filter(Boolean).join(' · ')}</span></span>
        ${tbDaySumHTML(idx)}
      </div>
      <div class="tb-day-rule"></div>
      ${d.note?`<div class="tb-day-note">📝 ${esc(d.note)}</div>`:''}
      ${tbDetailed?tlDayGridHTML(d,idx,firstNights)
        :legs.length?legs.map(itinLegRowHTML).join(''):`<p class="hint" style="margin:var(--sp-3)">${d.kind!=='golf'?TRIP_DAY_KINDS[d.kind]:'No stops yet.'}</p>`}
    </div>`;
  }).join('');
}
/* GOLF-207: the Itinerary "Show: Everything / Golf only / Stays only /
   Stops only" filter is gone, and with it tbItinGolfListHTML(),
   tbItinHotelRailHTML(), tbItinPoiListHTML() and the tbItineraryHTML()
   dispatcher that chose between them — the itinerary always shows the
   whole trip now. tbItinAllHTML() above survives because the read-only
   share view still renders through it (js/trip-share.js). */
/* ════════════════════════════════════════════════════════════════════
   Costs tab
   ════════════════════════════════════════════════════════════════════ */
function tripCostLineItems(){
  const items=[];
  // GOLF-63: itemised in the day's own order, so the breakdown reads down
  // the day the same way the itinerary does. GOLF-71 renamed the POI
  // category label to "Stop" (tripCostBreakdown() filters on that string).
  // GOLF-153: a flight is its own category. Falling through to 'Stop'
  // (as any unknown type does) would have put an airfare under "Stops"
  // next to the lunch, and the "× group size" tag below is already the
  // right arithmetic for a per-person fare.
  const CAT={golf:'Golf',hotel:'Stay',poi:'Stop',flight:'Travel'};
  // GOLF-74: a per-person-sharing stay carries its arithmetic into the label
  // so the line item explains its own (doubled) amount.
  // GOLF-87: golf/POI totals scale by the trip's group size — each
  // traveller plays their own round/pays their own POI cost — so tag those
  // rows "× groupSize"; a stay keeps its own GOLF-74 sharing tag (or "as
  // entered" when it's a plain room rate).
  const gs=groupSizeFor();
  // GOLF-97: a golf item whose course carries hand-researched fee data shows
  // its real range ("£65–£90") and a confidence tag instead of the old
  // single blended figure — a legacy wd/we-only course (feeRange.confidence
  // null, or feeRange.min===feeRange.max) still renders exactly as before.
  // GOLF-120: also renders the owner-Q5 label variants — "from £X" for a
  // club "from" price, "up to £Y" for a derived in-season ceiling.
  const feeRangeLabel=fr=>{
    if(!fr||!fr.confidence||fr.min==null||fr.max==null)return'';
    if(fr.isFrom)return` (from ${tbMoney(fr.min,'')})`;
    if(fr.upTo&&fr.min!==fr.max)return` (up to ${tbMoney(fr.max,'')})`;
    if(fr.min!==fr.max)return` (${tbMoney(fr.min,'')}–${tbMoney(fr.max,'')})`;
    return'';
  };
  const FEE_CONF_TAG=FEE_CONF_LABEL; // GOLF-120: canonical map lives in js/trip-geo.js
  // GOLF-116: a hotel booked for N nights is stored as N separate night-items
  // sharing one stayId (older trips: no stayId, so fall back to hotel name +
  // rounded coordinates). The Costs breakdown groups them into ONE line —
  // "Hotel A (£150/night × 3 nights)" — summing the per-night amounts so the
  // grand total is byte-for-byte unchanged, only the breakdown is regrouped.
  // priceType is not part of the current hotel model (GOLF-91 made every
  // hotel price per-person-per-night); if an old trip ever carries a flat
  // 'total'/'flat' price, honour it by not multiplying across nights.
  // TODO GOLF-74 per-room model: hotels are priced per-person-per-night ×
  // whole-trip group size today; revisit here if a real per-room split lands.
  const stayGroups=new Map(); // group key -> index into items[]
  const stayKey=it=>it.stayId||('@'+String(it.name||'').trim().toLowerCase()
    +'|'+(typeof it.lat==='number'?it.lat.toFixed(3):'?')
    +'|'+(typeof it.lng==='number'?it.lng.toFixed(3):'?'));
  tripDays.forEach((d,idx)=>tripDayItems(d).forEach(it=>{
    /* GOLF-153: a note is not a cost. Left to fall through it would have
       pushed a nameless £0 line into "Stops" for every note in the
       trip. */
    if(it.type==='note')return;
    const det=tripItemPriceDetail(d,it);
    if(it.type==='hotel'){
      const flat=it.priceType==='total'||it.priceType==='flat';
      const key=stayKey(it);
      const name=tripItemName(it);
      const sharingBit=det.sharing?` (${curSym(det.cur)}${(det.base||0).toFixed(0)} × ${det.guests} people)`:'';
      if(stayGroups.has(key)){
        const row=items[stayGroups.get(key)];
        row._nights++;
        if(!flat)row.amount=(row.amount||0)+(det.total||0);
        row.label=row._nights>1
          ? `${row._name} (${curSym(row._cur)}${(row.amount/row._nights).toFixed(0)}/night × ${row._nights} nights)`
          : row._name+sharingBit;
      }else{
        stayGroups.set(key,items.length);
        items.push({label:name+sharingBit,cat:'Stay',amount:det.total,day:idx+1,cur:det.cur,
          /* GOLF-193: was `det.sharing?'× N people':'estimated'`, which
             tagged a price the visitor had typed as "estimated" whenever
             the party was one (sharing is only true for gs>1). det.est is
             the fact being described. */
          tag:det.sharing?`× ${det.guests} people`:(det.est?'estimated':null),
          _nights:1,_name:name,_cur:det.cur});
      }
      return;
    }
    let tag=gs>1?`× ${gs}`:null;
    let label=tripItemName(it)+(det.sharing?` (${curSym(det.cur)}${det.base.toFixed(0)} × ${det.guests} people)`:'');
    if(it.type==='golf'&&det.feeRange&&det.feeRange.confidence){
      label+=feeRangeLabel(det.feeRange);
      const confTag=FEE_CONF_TAG[det.feeRange.confidence];
      tag=tag?`${tag} · ${confTag}`:confTag;
    }
    items.push({label,cat:CAT[it.type]||'Stop',amount:det.total,day:idx+1,cur:det.cur,tag});
    if(it.type==='golf')pushMandatoryBuggy(it.i,idx+1);
  }));
  tripUnscheduled().forEach(i=>{
    const fee=feeNumberFor(i,'wd');
    const fr=feeRangeFor(i,'wd');
    let label=V(i,'n');
    let tag=gs>1?`× ${gs}`:null;
    if(fr&&fr.confidence){
      label+=feeRangeLabel(fr);
      const confTag=FEE_CONF_TAG[fr.confidence];
      tag=tag?`${tag} · ${confTag}`:confTag;
    }
    items.push({label,cat:'Golf',amount:fee==null?null:fee*gs,day:null,cur:courseCurrency(i),tag});
    pushMandatoryBuggy(i,null);
  });
  return items;
  // GOLF-120 owner Q6: a course whose feeV2 marks the buggy mandatory gets
  // its OWN "Compulsory buggy" line, in the same currency/day bucket as the
  // round, never folded into the green fee. per:'person' scales by group
  // size; per:'cart' (the default) is one charge for the round.
  function pushMandatoryBuggy(ci,day){
    const ct=(typeof feeCartFor==='function')&&feeCartFor(ci);
    if(!ct||ct.status!=='mandatory'||ct.amount==null)return;
    const perPerson=ct.per==='person';
    items.push({
      label:'Compulsory buggy — '+V(ci,'n'),
      cat:'Golf',
      amount:ct.amount*(perPerson?gs:1),
      day,cur:courseCurrency(ci),
      tag:perPerson&&gs>1?`× ${gs} · mandatory`:'mandatory'
    });
  }
}
function tripCostBreakdown(){
  const items=tripCostLineItems();
  /* GOLF-174 / DEC-026: every total is a {[£|€|R]:amount} bucket, never a
     scalar — a trip mixing £ golf with € stays used to add the two and
     label the sum £. Each bucket is seeded with the primary currency so it
     always renders first ("£1470 + €1520"); moneyBucketFmt() drops the
     zero. Fuel has no currency of its own (FUEL_COST_PER_MILE is £/mile)
     and keeps pricing in the primary one, as before. */
  const cur=tripPrimaryCurrency();
  const sum=arr=>{const b={[cur]:0};arr.forEach(x=>moneyBucketAdd(b,x.cur||cur,x.amount));return b;};
  const golf=items.filter(x=>x.cat==='Golf'),stay=items.filter(x=>x.cat==='Stay'),poi=items.filter(x=>x.cat==='Stop');
  // GOLF-153: Travel is the flights bucket, and its group is rendered
  // only when it has lines — a trip with no flight (every trip before
  // this ticket) shows the same three groups it always did.
  const travel=items.filter(x=>x.cat==='Travel');
  const fuelMiles=tripTotalDriveMiles();
  const fuelCost=fuelMiles*FUEL_COST_PER_MILE;
  const golfTotal=sum(golf),stayTotal=sum(stay),poiTotal=sum(poi),travelTotal=sum(travel);
  /* GOLF-203: the trip's own "Other" lines, priced here and nowhere else.
     `typed` is what the visitor entered; `amount` is the whole-party
     figure every other cost line in this app is already expressed in, so
     the Per person view's "÷ group size" needs no special case. An empty
     amount is 0, not NaN — the line exists before it is priced. */
  const gs=groupSizeFor();
  const customItems=(Array.isArray(tripCustom)?tripCustom:[]).map(c=>{
    const lcur=CURRENCY_SYMS[c.cur]?c.cur:cur;
    const typed=(typeof c.amount==='number'&&isFinite(c.amount))?c.amount:0;
    return{id:c.id,label:c.label||'',per:c.per==='person'?'person':'group',cur:lcur,typed,
      amount:c.per==='person'?typed*gs:typed};
  });
  /* Fuel moved in here (owner item 7): it was its own row under the three
     category groups, which made it the one cost with no home. */
  const otherTotal={[cur]:0};
  if(tbIncludeFuel)moneyBucketAdd(otherTotal,cur,fuelCost);
  customItems.forEach(x=>moneyBucketAdd(otherTotal,x.cur,x.amount));
  const grand={[cur]:0};
  [golfTotal,stayTotal,poiTotal,travelTotal,otherTotal].forEach(b=>Object.keys(b).forEach(c=>moneyBucketAdd(grand,c,b[c])));
  // GOLF-87: an even per-person split of the whole trip total — golf/POI
  // are already priced per-traveller above, stays keep their own GOLF-74
  // sharing math untouched, and fuel is one shared trip cost only divided
  // here, at the very last step. Across currencies, each bucket divides on
  // its own (DEC-026).
  const perPerson=gs>1?moneyBucketScale(grand,1/gs):null;
  return{items,cur,golfTotal,golfCov:golf.filter(x=>x.amount!=null).length,golfOf:golf.length,stayTotal,poiTotal,travelTotal,fuelMiles,fuelCost,customItems,otherTotal,grand,groupSize:gs,perPerson};
}
/* The headline trip total as display text — navbar pill, Itinerary's
   "Trip total" card and the shared view's pill all read this, so a mixed
   trip shows every currency everywhere (DEC-026). */
function tbTripTotal(){const b=tripCostBreakdown();return moneyBucketFmt(b.grand,b.cur);}
/* GOLF-193: the same headline, in both readings and marked if it contains
   an estimate. The navbar pill, the Itinerary "Trip total" card and the
   shared view's pill all read this, so they can never disagree about which
   figure they are showing. tbTripTotal() stays for anywhere a bare string
   is needed (it is what the mode-less single-traveller case renders). */
function tbTripTotalHTML(unit){
  const b=tripCostBreakdown();
  return estMark(tripHasEstimate())+tbDualBucketHTML(b.grand,b.cur,unit||{pp:'pp',tot:'total'});
}
/* GOLF-71 copy audit. Before, this tab carried a three-sentence paragraph
   under the summary table explaining fee coverage, where stay prices come
   from, how to add one, and that fuel is a straight-line estimate. Two of
   those facts are now conveyed by the controls themselves ("Fuel (est.)"
   is labelled est.; a stay's price is edited on the stay), so what's left
   is the one thing the numbers genuinely can't say: how many fees are
   real vs assumed. */
/* GOLF-91/item-5: line items used to sit in a second, always-open flat
   table below the category summary — the same figures shown twice, with
   no link between a category's total and the rows behind it. Each
   category row is now a <details class="cost-group"> that expands to
   reveal exactly its own line items — the summary *is* the group header,
   per the stakeholder's ask ("line items as part of a hierarchy you
   expand from the grouping above it"). Reuses the .fgroup chevron
   convention already established for Explore's filter dropdowns
   (index.html), just re-skinned to a label+amount row via
   .cost-group. */
/* GOLF-100: every cost line is priced for the whole party (golf/POI ×
   group size, hotels per-person-per-night × group size), so the
   per-person figure is simply the line total ÷ group size — shown as a
   small second amount under the total, in both the group header and each
   line row. Group size 1 (or unset) → no second figure (it would just
   repeat the total). Stacked rather than a third column so it can't
   overflow a 360px sidebar. */
/* GOLF-178 supersedes the stacked second figure: the card now shows ONE
   figure per amount, per person or total, switched by a Per person | Total
   control (group size > 1 only). Both figures are rendered and CSS shows
   the one matching .cost-body[data-mode] — so the read-only #share= view
   can flip mode without re-rendering its map, and both views keep sharing
   this one path (GOLF-174). Per person = line total ÷ group size, rounded
   per line; the banner divides the full trip total (never a sum of lines).
   Not persisted: the card always opens on Per person. */
let tbCostMode='pp';
// A real cost that rounds to nothing per head reads "<£1", never "£0".
const ppAmt=(v,c)=>v>0&&v<0.5?`&lt;${curSym(c)}1`:`${curSym(c)}${Math.round(v)}`;
const costPPMoney=(v,cur,gs)=>v==null?tbMoney(v,cur):ppAmt(v/gs,cur);
// GOLF-174 / DEC-026: per currency, never combined — "£368 + €380".
function costPPBucketFmt(b,gs,emptyCur){
  const keys=Object.keys(b).filter(c=>b[c]);
  return keys.length?keys.map(c=>ppAmt(b[c]/gs,c)).join(MONEY_JOIN):moneyBucketFmt(b,emptyCur);
}
const costDual=(tot,pp,gs)=>gs>1?`<span class="cv-pp">${pp}</span><span class="cv-tot">${tot}</span>`:tot;
const costModeNote=(mode,gs)=>mode==='pp'?'Showing cost per person':`Showing total for all ${gs} travellers`;
function tbCostSetMode(btn,mode){
  // Every caller is a button in the segmented control, but the mode itself
  // is app-wide state — so a call without one sets the mode and skips only
  // the control's own highlight, rather than throwing.
  const body=btn&&typeof btn.closest==='function'?btn.closest('.cost-body'):null;
  tbCostMode=mode;
  /* GOLF-193: the choice is app-wide now. Setting it on <body> reaches
     every figure in the pane, the day cards and the shared view at once,
     with no re-render — so the map, any open day and the scroll position
     all survive a mode change. */
  tbCostModeApply();
  if(!body)return;
  body.dataset.mode=mode;
  body.querySelectorAll('.cost-mode-seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  const note=body.querySelector('.cost-mode-note');
  if(note)note.textContent=costModeNote(mode,+body.dataset.gs);
}
function costGroupHTML(icon,label,total,items,cur){
  const gs=groupSizeFor();
  const rows=items.length
    ?items.map(x=>`<tr><td>${esc(x.label)}${x.tag?` <span class="wt">${esc(x.tag)}</span>`:''}</td><td>${costDual(tbMoney(x.amount,x.cur||cur),costPPMoney(x.amount,x.cur||cur,gs),gs)}</td></tr>`).join('')
    :`<tr><td colspan="2" class="hint">Nothing here yet.</td></tr>`;
  return`<details class="cost-group"><summary class="cost-group-summary">
      <span class="cost-group-label"><span class="cost-group-toggle" aria-hidden="true"></span>${icon} ${label}</span>
      <span class="cost-group-amt">${costDual(moneyBucketFmt(total,cur),costPPBucketFmt(total,gs,cur),gs)}</span>
    </summary>
    <table class="cost-line-table cost-group-lines">${rows}</table>
  </details>`;
}
/* GOLF-174: the banner + category rows + coverage note, shared by the live
   Costs tab and the read-only #share= twin (js/trip-share.js), which used to
   carry a copy of this markup — and so a copy of the single-currency bug.
   `readOnly` is the only difference between the two: the shared view gets
   plain text where the live tab has the fuel checkbox, the custom-cost
   inputs and "+ Add a cost" (GOLF-203, which retired the old
   fuelRowLabel string — the param is kept only so an older caller
   passing one is harmless). GOLF-178: the banner's hero figure
   follows the mode and carries its unit in words; the other mode's figure
   sits under it, smaller and labelled, so a screenshot can't pass one off
   as the other. Always its own line: inline, it wrapped mid-phrase at
   360px, and on a mixed trip "£1470 + €1520 · £368 + €380 per person"
   would read as one run of four numbers. */
/* GOLF-178's banner figure, split out for GOLF-203: typing in a custom
   cost repaints this node in place (tbCostLiveRefresh) rather than
   re-rendering the pane under the visitor's cursor, so both paths have to
   build it from one place or they will drift. */
function tbCostBannerAmountHTML(b){
  const cur=b.cur,gs=b.groupSize,multi=gs>1;
  const totTxt=moneyBucketFmt(b.grand,cur);
  const ppTxt=multi?costPPBucketFmt(b.grand,gs,cur):'';
  const second=txt=>`<span class="cost-banner-pp is-own-line">${txt}</span>`;
  /* GOLF-178: a mixed headline never breaks inside an amount, and never
     leaves a "+" dangling at a line end — each amount is one unbreakable
     chunk, the separator carried at the head of the next. With two
     currencies the smaller .is-mixed size keeps it on one line at 360px. */
  const hero=txt=>txt.split(MONEY_JOIN).map((t,k)=>`<span class="cost-banner-fig">${k?'+ ':''}${t}</span>`).join(' ');
  const amount=multi
    ?`<span class="cv-pp">${hero(ppTxt)}<span class="cost-banner-unit"> per person</span>${second(`${totTxt} total`)}</span><span class="cv-tot">${hero(totTxt)}<span class="cost-banner-unit"> total</span>${second(`${ppTxt} per person`)}</span>`
    :totTxt;
  return (tripHasEstimate()?estMark(true):'')+amount;
}
/* GOLF-203: one custom line's own money cell — the whole-party figure and
   the per-person one, switched by the card's mode like every other row. */
function costCustomAmtHTML(x,gs){
  return costDual(tbMoney(x.amount,x.cur),costPPMoney(x.amount,x.cur,gs),gs);
}
/* GOLF-203: "Other" — fuel plus whatever the visitor adds themselves.
   Not costGroupHTML(): its rows are editable and it has a footer button,
   and the read-only #share= twin renders the same rows as plain text.

   Judgement call (the ticket leaves it to the dev): the per-line currency
   picker only appears once the trip already spans more than one currency
   — or once a line carries something other than the primary one, so a
   line can always be changed back. A single-nation trip never sees it.

   GOLF-203 opened it by default, unlike the other three, on the grounds
   that it is the only interactive group and absorbed a fuel row that used
   to be permanently visible. GOLF-219 overrides that: the owner wants
   Costs to open as four matching collapsed groups, the total on each
   summary row doing the talking. It still has to stay open once the
   visitor opens it, because a custom-cost keystroke can trigger a full
   re-render and a group that snapped shut mid-edit would be worse than
   either default — hence tbCostOtherOpen, which lives for the visit only
   (remembering it across visits is explicitly out of scope). */
let tbCostOtherOpen=false;
function costOtherGroupHTML(b,readOnly){
  const cur=b.cur,gs=b.groupSize;
  const lines=b.customItems||[];
  const mixed=moneyBucketCount(b.grand)>1||lines.some(x=>x.cur!==cur);
  const fuelRow=`<div class="cost-fuel-row">${readOnly?'<span>⛽ Fuel (est.)</span>':
    `<label class="cost-fuel-toggle"><input type="checkbox" ${tbIncludeFuel?'checked':''} onchange="tbIncludeFuel=this.checked;renderTripBuilder();"> ⛽ Fuel (est.)</label>`
    }<span class="cost-group-amt">${/* its own label already reads "Fuel (est.)" — a ~ here just stutters */''}${costDual(`${curSym(cur)}${b.fuelCost.toFixed(0)}`,costPPMoney(b.fuelCost,cur,gs),gs)}</span></div>`;
  const rows=readOnly
    ? (lines.length?`<table class="cost-line-table cost-group-lines">${lines.map(x=>{
        const tag=x.per==='person'&&gs>1?`× ${gs}`:null;
        return`<tr><td>${esc(x.label.trim()||'Other cost')}${tag?` <span class="wt">${esc(tag)}</span>`:''}</td><td>${costCustomAmtHTML(x,gs)}</td></tr>`;
      }).join('')}</table>`:'')
    : lines.map(x=>{
        const id=esc(x.id);
        return`<div class="cc-row" data-cc="${id}">
          <input class="tb-field cc-label" id="tb-cc-label-${id}" type="text" maxlength="80"
            aria-label="What is this cost?" placeholder="Car hire" value="${esc(x.label)}"
            oninput="tripCustomUpdate('${id}',{label:this.value})">
          <div class="cc-row-2">
            ${mixed?`<select class="tb-field cc-cur" aria-label="Currency"
              onchange="tripCustomUpdate('${id}',{cur:this.value});tbCostLiveRefresh();">${
                ['GBP','EUR','ZAR'].map(c=>`<option value="${c}"${x.cur===c?' selected':''}>${curSym(c)}</option>`).join('')
              }</select>`:''}
            <input class="tb-field cc-amount" type="number" min="0" step="5" inputmode="decimal"
              aria-label="Amount in ${esc(curSym(x.cur))}" placeholder="${esc(curSym(x.cur))} amount"
              value="${x.typed?esc(String(x.typed)):''}"
              oninput="tripCustomUpdate('${id}',{amount:this.value});tbCostLiveRefresh();">
            <div class="tb-seg cc-per" role="group" aria-label="Who pays this cost">${
              [['group','Whole group'],['person','Per person']].map(([k,l])=>
                `<button type="button" data-per="${k}" aria-pressed="${x.per===k}" onclick="tripCustomSetPer('${id}','${k}',this)">${l}</button>`).join('')
            }</div>
            <span class="cost-group-amt cc-amt" data-cc-amt="${id}">${costCustomAmtHTML(x,gs)}</span>
            <button type="button" class="tb-btn is-icon is-sm is-quiet cc-del" title="Remove this cost"
              aria-label="Remove this cost" onclick="tripCustomRemove('${id}')">✕</button>
          </div>
        </div>`;
      }).join('');
  const addBtn=readOnly?'':`<button type="button" class="tb-btn is-sm is-quiet cc-add"
    ${lines.length>=TRIP_CUSTOM_MAX?'disabled title="That is as many as one trip can hold."':''}
    onclick="tripCustomAdd()">+ Add a cost</button>`;
  /* GOLF-233: the trip's one car-hire link. It lives here rather than on
     the Itinerary because hire is a cost, not a stop — the custom-cost
     field right above it already suggests "Car hire" as its example. The
     readOnly branch is the shared view and the print sheet, neither of
     which gets a link. */
  const car=readOnly?null:(typeof affCarHireLink==='function'?affCarHireLink():null);
  const carRow=car?`<div class="tb-cost-aff">
    <a class="tb-btn is-sm is-quiet tb-aff" href="${esc(car)}"
      target="_blank" rel="sponsored noopener"
      title="Compare hire cars on EconomyBookings">🚗 Hire a car ↗</a>
    <p class="tb-aff-note">${esc(AFF_DISCLOSURE)}</p>
  </div>`:'';
  return`<details class="cost-group cost-other-group"${tbCostOtherOpen?' open':''}
      ontoggle="tbCostOtherOpen=this.open"><summary class="cost-group-summary">
      <span class="cost-group-label"><span class="cost-group-toggle" aria-hidden="true"></span>💷 Other</span>
      <span class="cost-group-amt" data-other-amt>${costDual(moneyBucketFmt(b.otherTotal,cur),costPPBucketFmt(b.otherTotal,gs,cur),gs)}</span>
    </summary>
    <div class="cost-other-body">${fuelRow}${rows}${addBtn}${carRow}</div>
  </details>`;
}
/* GOLF-203: repaint every figure a custom-cost keystroke can move, and
   nothing else. A full renderTripBuilder() on each input would replace the
   very field being typed in (and on `change`, would destroy the element
   Tab was heading for), so the money is patched in place instead. */
function tbCostLiveRefresh(){
  const b=tripCostBreakdown(),gs=b.groupSize,cur=b.cur;
  const body=document.querySelector('#tb-pane .cost-body')||document.querySelector('.cost-body');
  if(body){
    const ban=body.querySelector('.cost-banner-amount');
    if(ban)ban.innerHTML=tbCostBannerAmountHTML(b);
    const oth=body.querySelector('.cost-other-group [data-other-amt]');
    if(oth)oth.innerHTML=costDual(moneyBucketFmt(b.otherTotal,cur),costPPBucketFmt(b.otherTotal,gs,cur),gs);
    (b.customItems||[]).forEach(x=>{
      const cell=body.querySelector(`[data-cc-amt="${x.id}"]`);
      if(cell)cell.innerHTML=costCustomAmtHTML(x,gs);
    });
  }
  document.querySelectorAll('.js-trip-total').forEach(el=>{el.innerHTML=tbTripTotalHTML(el.dataset.unit?JSON.parse(el.dataset.unit):undefined);});
  /* The phone sheet's peek summary carries the same headline but lives
     outside #tb-pane and rebuilds itself wholesale, so it needs its own
     call rather than a .js-trip-total hook — without it the peek sat at
     the pre-edit figure until the next reload. Nothing inside #bs-peek
     can hold focus, so rebuilding it mid-keystroke is safe. Guarded
     because js/mobile-sheet.js loads after this one. */
  if(typeof mobUpdatePeek==='function')mobUpdatePeek();
}
function tbCostsBodyHTML(b,fuelRowLabel,readOnly){
  const cur=b.cur,gs=b.groupSize,multi=gs>1;
  const mixed=moneyBucketCount(b.grand)>1;
  const golf=b.items.filter(x=>x.cat==='Golf'),stay=b.items.filter(x=>x.cat==='Stay'),stop=b.items.filter(x=>x.cat==='Stop');
  const travel=b.items.filter(x=>x.cat==='Travel'); // GOLF-153
  const mode=tbCostMode==='tot'?'tot':'pp';
  // Control first, note after: the note's length changes with the mode, so
  // it must never be what positions the button the viewer just tapped.
  const control=multi?`<div class="cost-mode-row">
      <div class="tb-seg cost-mode-seg no-print" role="group" aria-label="Show costs">${[['pp','Per person'],['tot','Total']].map(([k,l])=>
        `<button type="button" data-mode="${k}" aria-pressed="${mode===k}" onclick="tbCostSetMode(this,'${k}')">${l}</button>`).join('')}</div>
      <span class="cost-mode-note">${costModeNote(mode,gs)}</span></div>`:'';
  return`<div class="cost-body"${multi?` data-mode="${mode}" data-gs="${gs}"`:''}>${control}
    <div class="cost-banner"><div class="cost-banner-label">Trip total${multi?` · ${gs} travellers`:''}${tripHasEstimate()?` · <span class="cost-est-note" title="${EST_TITLE}">~ includes an estimate</span>`:''}</div><div class="cost-banner-amount${mixed?' is-mixed':''}">${tbCostBannerAmountHTML(b)}</div></div>
    <div class="cost-card cost-groups">
      ${costGroupHTML('⛳','Golf',b.golfTotal,golf,cur)}
      ${costGroupHTML('🏨','Stays',b.stayTotal,stay,cur)}
      ${costGroupHTML('📍','Stops',b.poiTotal,stop,cur)}
      ${/* GOLF-153: only when the trip has flights — see tripCostBreakdown(). */''}
      ${travel.length?costGroupHTML('✈','Travel',b.travelTotal,travel,cur):''}
      ${costOtherGroupHTML(b,readOnly)}
    </div>
    <p class="hint cost-cov">${b.golfCov} of ${b.golfOf} green fee${b.golfOf===1?'':'s'} confirmed — the rest are typical rates.${mixed?' This trip spans more than one currency, so each is totalled separately — nothing is converted.':''}</p></div>`;
}
function tbCostsTabHTML(){
  // GOLF-203: the fuel row's label moved inside costOtherGroupHTML() with
  // the row itself, so there is nothing left to pass in here.
  return tbCostsBodyHTML(tripCostBreakdown(),null,false);
}

/* ════════════════════════════════════════════════════════════════════
   Build mode's editable itinerary — the day cards from the sketch.
   ════════════════════════════════════════════════════════════════════ */
let tbBuildTab='itin',tbDayShown=null;
/* GOLF-108: "Show nearby courses" on the Itinerary tab map. Owner decision
   2026-09-07 — default ON; flip TB_SHOW_NEARBY_DEFAULT to change it, no
   other code change needed. Not persisted — a sensible default each
   session, the same call GOLF-207's POI layer makes.
   GOLF-131 (2026-09-13): flipped to default OFF — arriving in Itinerary
   with every nearby bookable course already drawn was noisy; a tester now
   opts in, and the set itself live-updates as the map is panned (see
   tbItinNearbyAnchorPts()/tbDrawMap() in js/trip-route.js). */
const TB_SHOW_NEARBY_DEFAULT=false;
let tbShowNearby=TB_SHOW_NEARBY_DEFAULT;

/* One day card. Structure follows the sketch exactly: bold day title with
   a right-aligned running total in the header, a thin divider, then the
   stops — each preceded by its own small "Drive X min" caption.

   Everything that used to be a *setting* rather than a *stop* (day kind,
   city, date, manual drive override) lived behind a collapsed "Options"
   dropdown — dropped entirely per stakeholder feedback ("it's confusing").
   Remove-day survives as a single icon in the ⋯ overflow menu next to the
   day title (reusing the same tbRowMenuHTML() pattern every item row
   already uses), since a day that could never be deleted once created
   would be a real dead end, not just decluttering. Day kind/city/date/
   drive-in override have no UI entry point any more — the setters behind
   them have since been removed, but the fields themselves (d.kind against
   TRIP_DAY_KINDS, d.date, d.driveIn) are still read normally wherever
   they're already set, in case this needs revisiting. */
function tbDayCardHTML(d,idx){
  const kind=TRIP_DAY_KINDS[d.kind]?d.kind:'golf';
  const items=tripDayItems(d);
  const nCourses=items.filter(it=>it.type==='golf').length;
  const byId=new Map(items.map(it=>[it.id,it]));
  /* GOLF-153: detailed mode replaces the day's ROWS and nothing else —
     the head, its menu, the drop zones, the stay slot and the add
     controls are the same controls in the same places, so turning the
     view on never takes an action away. */
  const rowsHTML=tbDetailed?tlDayGridHTML(d,idx,tlFirstNightItemIds()):tripDayLegs(idx).map(l=>{
    if(l.type==='drive')return tbDriveCapHTML(l);
    const it=byId.get(l.id);
    if(!it)return'';
    /* GOLF-73: an item being edited swaps its row for the inline edit form
       in place, so the form appears exactly where the thing it edits was.
       Carried across the GOLF-71 restructure unchanged — the row markup
       around it is new, the swap rule is not. */
    if(tbAddStop&&tbAddStop.itemId===it.id&&tbAddStop.dayId===d.id)return tbAddStopFormHTML(d.id,it.id);
    return tripDayItemRowHTML(d,it);
  }).join('');
  const dow=d.date?new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'}):'';
  const sub=[dow,d.place?esc(tripShortPlace(d.place)):'',kind!=='golf'?TRIP_DAY_KINDS[kind]:''].filter(Boolean).join(' · ');
  const town=tripDaySuggestedTown(d);
  /* GOLF-152: "Move to" as a list of destinations, so reordering never
     depends on a drag that has to be done in stages down a long trip. */
  const moveItems=tripDays.length>1?tripDays.map((_,i)=>i===idx?''
    :`<button type="button" class="tb-menu-item" onclick="tripDayMoveToPos(${d.id},${i})">${
        i===0?'↑ Move to Day 1':i===tripDays.length-1?`↓ Move to Day ${i+1} (last)`:`Move to Day ${i+1}`}</button>`).join(''):'';
  const menu=tbRowMenuHTML(moveItems+
    /* GOLF-153: a note for the whole day. The day header is draggable
       (GOLF-152), so it gets right-click and this menu entry but no
       long-press — see the note in js/timeline-ui.js. */
    `<button type="button" class="tb-menu-item" onclick="tlEditDayNote(${d.id})">📝 ${d.note?'Edit day note':'Add a day note'}</button>`+
    `<button type="button" class="tb-menu-item is-danger" onclick="tripRemoveDay(${d.id});">🗑 Remove day ${idx+1}</button>`);
  return`
    <div class="tb-day tb-day-${kind}"
      ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropInDay(${d.id},null);">
      <div class="tb-day-head" draggable="true"
        ondragstart="tbDayDragSet(${d.id},event,this);"
        ondragend="tbDragEnd();"
        oncontextmenu="return tlNoteContextDay(event,${d.id})">
        <span class="tb-drag-handle" title="Drag to move this whole day">⠿</span>
        <span class="tb-day-title"><span class="tb-day-dot"></span>
          <span class="tb-day-title-text">Day ${idx+1}</span>
          ${sub?`<span class="tb-day-place" title="${esc(d.place||'')}">${sub}</span>`:''}</span>
        ${tbDaySumHTML(idx)}
        ${menu}
      </div>
      <div class="tb-day-rule"></div>
      ${/* GOLF-153: the day's own note, in both views — the visitor's
           text, escaped, and clickable to edit (read-only when shared). */''}
      ${d.note?`<div class="tb-day-note"${appMode==='shared'?'':` onclick="tlEditDayNote(${d.id})" title="Click to edit"`}>📝 ${esc(d.note)}</div>`:''}
      ${items.length?rowsHTML:`<p class="hint" style="margin:0 var(--sp-3) var(--sp-3) 44px">Drag a course here, or add a stop below.</p>`}
      <div class="tb-dropzone"
        ondragover="event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';tbDropOver(this);"
        ondragleave="tbDropOut(this,event);"
        ondrop="event.preventDefault();event.stopPropagation();tbDropOut(this);tbDropInDay(${d.id},null);">↓ Put it last on Day ${idx+1}</div>
      ${town?`<div class="tb-day-town">Staying near <b>${esc(town)}</b>${tbPoiLinkHTML(d)}</div>`:''}
      ${tbStaySlotHTML(d)}
      ${tbPoiListHTML(d)}
      ${/* GOLF-96 follow-up: search bar on top, nearby candidates below —
           the form (tbAddStopFormHTML) now always opens together with the
           hotel picker's own list (tbOpenHotelPicker, js/ors.js), so this
           order is what actually renders "search on top, options below". */''}
      ${tbAddStopFormHTML(d.id)}
      ${/* GOLF-153: the flight form is its own thing (js/timeline-ui.js),
           sharing this slot but not tbAddStop's geocoder/nights state. */''}
      ${typeof tlFlightFormHTML==='function'?tlFlightFormHTML(d.id):''}
      ${tbHotelPickerHTML(d)}
      ${/* GOLF-150 I2: one quiet "+ Add" per day instead of two full-width
           buttons (12 buttons on a 6-day trip). */''}
      <div class="tb-day-add">
        <details class="tb-drop tb-add-drop">
          <summary class="tb-btn is-sm is-quiet">＋ Add to Day ${idx+1}</summary>
          <div class="tb-drop-body">
            ${/* GOLF-186: a golf day asks this in its own stay slot above, so
                  offering it again here would be two doors to one room. Other
                  day kinds have no slot and still need the entry point. */''}
            ${kind==='golf'?'':`<button type="button" class="tb-menu-item" onclick="this.closest('details').open=false;tbOpenHotelPicker(${d.id})">🏨 A place to stay</button>`}
            <button type="button" class="tb-menu-item" onclick="this.closest('details').open=false;tbPromptPoi(${d.id})">📍 A stop (sight, lunch…)</button>
            ${/* GOLF-153: a flight is trip data, not view data — it is
                 offered in both views, or you would have to switch to
                 Detailed to record the one that gets you there. */''}
            <button type="button" class="tb-menu-item" onclick="this.closest('details').open=false;tlPromptFlight(${d.id})">✈ A flight</button>
            ${/* GOLF-153: a note as a thing you add to a day, for anyone
                 who never discovers the right-click. */''}
            <button type="button" class="tb-menu-item" onclick="this.closest('details').open=false;tlAddNote(${d.id})">📝 A note</button>
          </div>
        </details>
      </div>
    </div>`;
}
/* GOLF-71 copy audit: this view opened with a 60-word paragraph explaining
   how to drag rows, how to drag day headers, and what auto-order does.
   With a real 44px drag handle, a visible lift on pickup and a solid
   insertion line, the gesture teaches itself — so the paragraph is gone
   and "Auto-order" is simply a button you can see. */
/* GOLF-95: a dismissible banner offering to auto-order the trip whenever a
   day-structure change (e.g. inserting a stopover) has made the current
   order suboptimal versus nearest-neighbour routing. Never reorders
   silently — Accept applies it, Decline sticks (via tbReorderDismissedSig)
   until the day arrangement changes again. */
function tbReorderSuggestionHTML(){
  const sug=tripSuggestedDayReorder();
  if(!sug||sug.sig===tbReorderDismissedSig)return'';
  const det=tripReorderDetail(sug);
  const movedTxt=det.moved.length
    ?`${det.moved.map(esc).join(', ')} ${det.moved.length===1?'looks':'look'} out of place`
    :'the order looks off';
  const rowHTML=(label,arr)=>`<div class="tb-reorder-row">
      <span class="tb-reorder-row-label">${label}</span>
      <span class="tb-reorder-row-path">${arr.map((n,i)=>{
        const wasMoved=det.moved.includes(n);
        return`<span class="tb-reorder-stop${wasMoved?' is-moved':''}">${esc(n)}</span>`+(i<arr.length-1?'<span class="tb-reorder-arrow">→</span>':'');
      }).join('')}</span>
    </div>`;
  /* GOLF-150 I1: was ~15 lines, open by default, above Day 1. Now one
     line with the payoff up front; the Now/Suggested detail expands. */
  const mi=Math.round(det.savedMiles||0);
  const headline=mi>=5?`Reordering could save ~${mi} miles`:'Reordering could shorten the route';
  return`<details class="tb-reorder-suggest">
    <summary><span class="tb-reorder-head">↻ ${headline}</span><span class="tb-reorder-review">Review</span></summary>
    <div class="tb-reorder-body">
      <p class="hint" style="margin:0 0 var(--sp-2)">${movedTxt[0].toUpperCase()+movedTxt.slice(1)}. Free/start/end days stay where they are. Miles are straight-line.</p>
      ${rowHTML('Now',det.origLabels)}
      ${rowHTML('Suggested',det.suggLabels)}
      <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap">
        <button class="tb-btn is-primary is-sm" onclick="tripApplySuggestedDayReorder();">Use suggested order</button>
        <button class="tb-btn is-quiet is-sm" onclick="tbDismissSuggestedDayReorder('${esc(sug.sig)}');">Keep current order</button>
      </div>
    </div>
  </details>`;
}
function tripDayScheduleHTML(){
  if(!tripSeq.length&&!tripDays.length)
    return`<p class="hint">Nothing scheduled yet.</p>
      <div class="tb-day-add" style="padding-left:0"><button class="tb-btn is-primary" onclick="tbAddDayWithPlace();">＋ Add a day</button>
      <button class="tb-btn" onclick="setAppMode('plan')">Browse courses</button></div>`;
  const unscheduled=tripUnscheduled();
  const reorderHTML=tbReorderSuggestionHTML();
  const daysHTML=tlViewToggleHTML()+tripDays.map((d,idx)=>tbDayCardHTML(d,idx)).join('');
  const unschedHTML=unscheduled.length?`
    <div class="tb-day tb-day-wish" ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropOn(null,null);">
      <div class="tb-day-head"><span class="tb-day-title"><span class="tb-day-title-text">Shortlist</span>
        <span class="tb-day-place">${unscheduled.length} course${unscheduled.length===1?'':'s'} · not on a day yet</span></span></div>
      <div class="tb-day-rule"></div>
      ${unscheduled.map(i=>tripDayCourseRowHTML(i,null)).join('')}
    </div>`:'';
  return`${reorderHTML}${daysHTML}${unschedHTML}
    <div class="tb-day-endzone tb-day-add" style="padding-left:0"
      ondragover="event.preventDefault();tbDropOver(this);" ondragleave="tbDropOut(this,event);"
      ondrop="event.preventDefault();tbDropOut(this);tbDropDayAtEnd();">
      <button class="tb-btn is-primary" onclick="tbAddDayWithPlace();">＋ Add a day</button>
      ${tripSeq.length>1?`<details class="tb-drop tb-auto-drop">
        <summary class="tb-btn" title="Rebuilds every golf day from scratch, one course per day, in nearest-neighbour order. Free/start/end days are kept exactly where they are."><span class="tb-drop-label">Auto schedule</span></summary>
        <div class="tb-drop-body is-right">
          <button type="button" class="tb-menu-item" onclick="tripAutoOrder();renderTripBuilder();tbDrawMap();" title="Full reset: every golf day is rebuilt from scratch (one course per day, nearest-neighbour order). Free/start/end days stay in place.">Reschedule all courses (full reset)</button>
        </div>
      </details>`:''}
    </div>
    <div class="tb-total-card"><span class="tb-total-label">Trip total</span><span class="tb-total-amount js-trip-total">${tbTripTotalHTML()}</span></div>`;
}

/* Plan mode's wishlist. */
function tbWishlistHTML(){
  const allUnscheduled=tripUnscheduled();
  const unscheduled=state.nation?allUnscheduled.filter(i=>courseNation(i)===state.nation):allUnscheduled;
  const hidden=allUnscheduled.length-unscheduled.length;
  const hiddenNote=hidden?`<p class="hint" style="margin:0 0 var(--sp-2)">${hidden} more course${hidden===1?'':'s'} on your shortlist from other countries — clear the country filter above to see ${hidden===1?'it':'them'}.</p>`:'';
  /* GOLF-150 W1: once every course is on a day, "Nothing on your wishlist
     yet" read like the trip had been lost. Say where the courses went. */
  const nSched=tripSeq.length-allUnscheduled.length;
  if(!unscheduled.length&&!hiddenNote&&nSched>0)
    return`<div class="tb-wish-moved"><span>✓ ${nSched} course${nSched===1?' is':'s are'} in your itinerary${tripDays.length?` across ${tripDays.length} day${tripDays.length===1?'':'s'}`:''}.</span>
      <button class="tb-btn is-sm is-primary" onclick="enterBuildMode()">View itinerary →</button></div>`;
  if(!unscheduled.length)return hiddenNote||`<p class="hint">Nothing on your shortlist yet — add any course you fancy playing.</p>`;
  const rows=unscheduled.map(i=>{
    const fee=feeNumberFor(i,'wd');
    return`<div class="tb-day-course tb-item-golf" style="cursor:default">
      <span class="tb-item-icon">⛳</span>
      <div class="tb-item-main"><a href="#" draggable="false" onclick="event.preventDefault();goToCourse(${i})">${esc(V(i,'n'))}</a>
        <div class="cart-region">${esc(C[i].r)}</div></div>
      <span class="tb-item-price">${tbDualPriceHTML(fee==null?null:fee*groupSizeFor(),courseCurrency(i))}</span>
      <div class="tb-item-actions"><button class="tb-btn is-icon is-sm is-quiet" title="Remove from shortlist"
        onclick="tripRemoveCourse(${i});">✕</button></div>
    </div>`;}).join('');
  return`<div class="tb-day">
      <div class="tb-day-head"><span class="tb-day-title"><span class="tb-day-title-text">Shortlist</span>
        <span class="tb-day-place">${unscheduled.length} course${unscheduled.length===1?'':'s'}</span></span>
        <button class="tb-btn is-primary is-sm" onclick="enterBuildMode()" title="Start scheduling these courses into days">Build itinerary →</button></div>
      <div class="tb-day-rule"></div>
      ${hiddenNote}
      ${rows}
      ${tripWishlistSummaryHTML(unscheduled)}
    </div>`;
}
/* GOLF-90/93: reuses Explore's old state.nation/NATIONS/courseNation
   (js/explore.js, GOLF-81) rather than inventing a second country concept —
   picking a nation here is the exact same fact Explore's pill used to set,
   before Explore itself was removed. GOLF-93: since this pane is now the
   app's only page (Discover/Itinerary/Costs all live under it), the pills
   moved out of the Discover-only tbPlanHTML() into the shared chrome in
   renderTripBuilder() — rendered once, so the choice persists and stays
   visible switching tabs instead of disappearing the moment you leave
   Discover. GOLF-94: moved again, from just above the tab row to the very
   top of the pane (above the navbar) — the stakeholder's own instruction.
   It already filters everything nation-scoped
   below it: course search (tbSearchResults, js/trip-add.js), Discover's
   Nearby/By-region results (tbNationFilter, js/trip-route.js) and the
   wishlist's unscheduled list (js/trip-ui.js). The Itinerary/Costs tabs
   are deliberately NOT filtered by it — they show the trip you've already
   built, which can legitimately span more than one nation, and hiding an
   already-added course/day because the pill moved would silently corrupt
   the view of your own trip. The click handler lives in
   renderTripBuilder()'s wiring block, alongside every other delegated
   listener. */
/* GOLF-113: the By-region dropdown must only offer regions that actually
   contain a course in the currently selected nation — region names are
   already nation-distinct in data/config.js, so we derive the list rather
   than maintain a second map. With no nation picked we group every
   region by nation via <optgroup>. */
function tbRegionsForNation(nation){
  return REGIONS.filter(r=>C.some((c,i)=>C[i].r===r&&courseNation(i)===nation));
}
function tbRegionOptionsHTML(){
  const opt=r=>`<option value="${esc(r)}"${r===tbRegion?' selected':''}>${esc(r)}</option>`;
  if(state.nation)return tbRegionsForNation(state.nation).map(opt).join('');
  return NATIONS.map(([k,l])=>{
    const rs=tbRegionsForNation(k);
    return rs.length?`<optgroup label="${esc(l)}">${rs.map(opt).join('')}</optgroup>`:'';
  }).join('');
}
/* The one place a country gets picked: the pane's pills (toggle, desktop)
   and, on a phone, GOLF-185c's first-visit card and country chip
   (js/mobile-sheet.js). null clears the pick. */
function tbPickNation(k){
  state.nation=k||null;
  /* GOLF-113: drop a now-invalid region filter so switching nation
     doesn't leave a stale By-region selection filtering the results. */
  if(tbRegion&&state.nation&&!tbRegionsForNation(state.nation).includes(tbRegion))tbRegion='';
  /* Match the legacy js/explore.js pill: opening a nation orders its
     list top courses first (GOLF-160). */
  if(state.nation)state.sort='rank';
  /* The retired Explore sidebar draws its own copy of these pills and
     only ever re-renders them from its own handler, so a pick made
     here left the two sets disagreeing about which country is on.
     Harmless while that markup is display:none, but it is the kind of
     thing that comes back the moment anything reveals it. */
  if(typeof renderNationPills==='function')renderNationPills();
  /* GOLF-125: must be render(), not renderTripBuilder()+tbDrawMap(). Only
     render() rebuilds the background course-pin layer for the new
     nation filter (it calls renderTripBuilder()+tbDrawMap() itself).
     With the lighter pair, picking Ireland / South Africa from these
     pane pills moved the camera but left the map showing the previous
     nation's pins (or none) — the "country selected, no pins" bug. */
  saveState();render();
  /* GOLF-98: this pane's own pill click never actually moved the map —
     js/explore.js's now-unreachable Explore-mode pills had this, the
     pane's pills never picked it up. Fly to the picked nation's course
     bounds; picking the same pill again (clearing the filter) leaves
     the map where it is rather than snapping back out. */
  if(state.nation&&typeof map!=='undefined'&&map){
    const pts=C.map((c,i)=>i).filter(i=>courseNation(i)===state.nation).map(i=>[C[i].lat,C[i].lng]);
    /* fitBounds, not flyToBounds — this app's own testing notes (see the
       plan file) document flyTo's animation stalling in at least one
       environment; fitBounds jumps instantly and is never unreliable. */
    if(pts.length)mapFitBounds(L.latLngBounds(pts),{padding:[28,28]}); // GOLF-184
  }
}
function tbNationPillsHTML(){
  /* GOLF-114: --nation-count drives the equal-width grid in CSS, so adding
     a nation to NATIONS redistributes the row with no style change. */
  return`<div class="nation-pills" id="tb-nation-pills" role="group" aria-label="Choose a country" style="--nation-count:${NATIONS.length}">
    ${NATIONS.map(([k,l])=>`<button class="nation-pill" aria-pressed="${state.nation===k}" data-nation="${k}">${l}</button>`).join('')}
  </div>`;
}
function tbPlanHTML(){return tbDiscoverTabHTML()+`<div class="tb-section-title" style="margin-top:var(--sp-6)">Your shortlist</div>${tbWishlistHTML()}`;}

/* Discover. GOLF-71: its own "Near a place" search box is gone — the one
   search bar at the top of the pane anchors the lens when you pick a
   place, which is what that box did. The scope segmented control stays.
   GOLF-91: "Near a place" and "Nearby" were two scopes running the exact
   same "nearest 5 courses to a point" query, differing only in whether
   the point came from a searched place or the last course added —
   genuinely redundant, per the stakeholder's own read. Merged into one
   "Nearby" scope (see tbNearbyAnchorPoint() in trip-route.js): searching
   a place or adding a course both feed the same list, whichever happened
   more recently. */
function tbDiscoverTabHTML(){
  const scopes=[['anchor','Nearby'],['region','By region']];
  return`<div class="tb-section-title">Find courses</div>
    <div class="tb-seg" style="margin-bottom:var(--sp-3)">${scopes.map(([k,label])=>
      `<button id="tb-tab-${k}" aria-pressed="${tbDiscoveryTab===k}">${label}</button>`).join('')}</div>
    ${tbDiscoveryTab==='anchor'?(()=>{const pt=tbNearbyAnchorPoint();return`<p class="hint" style="margin:0 0 var(--sp-2)">${pt?`Courses near <b>${esc(pt.label)}</b>.`:'Add a course, or search a town or city in the bar above, to see what\'s nearby.'}</p>`;})()
      :`<div class="tb-day-settings-body" style="padding:0 0 var(--sp-3)">
        <select id="tb-region" aria-label="Region"><option value="">Choose a region…</option>${tbRegionOptionsHTML()}</select>
        <label style="display:inline-flex;align-items:center;gap:var(--sp-2);font-size:var(--fs-caption);color:var(--stone)"
          title="Also include courses just outside the region, within this many miles of its edge">Border (mi)
          <input id="tb-border" type="number" value="${tbBorder}" min="0" max="50" style="width:70px"></label>
      </div>`}
    <div id="tb-results">${tbResultsHTML(tbDiscover())}</div>`;
}

/* ════════════════════════════════════════════════════════════════════
   The pane itself. Chrome order matches the stakeholder's sketch:
     navbar → one pill search bar → [Trip ▾][Filters ▾][Clear trip]
     → pill tabs → content.
   The tab row now spans BOTH modes: Itinerary and Costs are Build,
   Discover is Plan. That kills the old "← Back to wishlist" backlink
   (a second control for what a tab already does) and makes moving
   between browsing and scheduling one click in either direction.
   ════════════════════════════════════════════════════════════════════ */
/* Any open <details> menu in the pane closes on an outside click — a
   <details> won't do this by itself, and a menu you must click twice to
   dismiss is exactly the friction this round removes. Bound ONCE for the
   life of the page (not per render) so row menus opened after a render
   are covered too, and so re-renders can't stack duplicate listeners. */
let tbDismissBound=false;
function tbBindDropdownDismiss(){
  if(tbDismissBound)return;
  tbDismissBound=true;
  document.addEventListener('mousedown',e=>{
    document.querySelectorAll('#tb-pane details[open].tb-drop,#tb-pane details[open].tb-rowmenu,.mast details[open].tb-beta,#tb-pane details[open].tb-beta')
      .forEach(dd=>{if(!dd.contains(e.target))dd.removeAttribute('open');});
  });
}
/* GOLF-129: a small always-visible "Beta" badge (Plan/Build navbar only —
   never rendered on the #share=… read-only view, since that view has its
   own renderer in trip-share.js and never calls renderTripBuilder()) that
   opens a short panel of known limitations for testers. A <details> like
   every other dropdown in this pane (see tbBindDropdownDismiss for the
   outside-click close); dismissing the panel only closes it — there is no
   "don't show again", the badge itself always stays visible. Copy is
   owner-approved verbatim (2026-09-13) — don't reword the four points. */
function tbBetaBadgeHTML(){
  return`<details class="tb-beta">
    <summary title="What's still rough in this beta">Beta</summary>
    <div class="tb-drop-body tb-beta-body">
      <h3>You're testing a beta</h3>
      <ul>
        <li>Courses covered: Great Britain, Ireland, and South Africa only.</li>
        <li>Green fees are confirmed for the highest-ranked ~130 courses; everywhere else is an estimate — check the "Confirmed" / "Estimate" label under the price.</li>
        <li>Hotel pins come from OpenStreetMap and prices are entered manually — coverage is patchy, especially outside towns.</li>
        <li>Trips are saved only in this browser (no account, no sync). Clearing browser data, or switching device, loses them.</li>
        <li>An app update also resets saved trips — the next time you load the app after we ship a change, your trip starts fresh.</li>
      </ul>
      <div class="tb-beta-foot"><button type="button" class="attr-link" onclick="privacyOpen()">Privacy</button>
      <span class="tb-beta-acts"><button type="button" class="tb-btn is-sm" onclick="feedbackOpen()">Feedback</button>
      <button type="button" class="tb-btn is-sm" id="tb-beta-close">Close</button></span></div>
    </div>
  </details>`;
}
/* GOLF-227: a short privacy note. One <dialog>, built on first open and
   reached from a "Privacy" link in the map credits (desktop footer, the
   phone's ⓘ, the shared view's map) and from the Beta panel. The analytics
   and lookup-cap lines are Geoff's wording for GOLF-222/223 — keep them in
   step with what the Worker and the beacon actually do. */
function privacyOpen(){
  let d=document.getElementById('privacy-dlg');
  if(!d){
    document.body.insertAdjacentHTML('beforeend',`<dialog id="privacy-dlg" class="privacy-dlg" aria-labelledby="privacy-h"><div class="privacy-body">
      <h3 id="privacy-h">Your privacy</h3>
      <ul>
        <li>Your trips are saved only in this browser. There are no accounts and no cookies.</li>
        <li>Route and place searches go through our server to OpenRouteService and OpenStreetMap. They see the places you search for, not who you are.</li>
        <li>To stop abuse, our server counts how many lookups each connection makes per day, using a scrambled form of your IP address that is deleted the next day. It doesn't record what you searched.</li>
        <li>Cloudflare Web Analytics counts visits anonymously: which pages, the referring site, country and browser type, and page speed. No cookies and nothing that identifies you.</li>
        <li>The map comes from Esri and the fonts from Google Fonts. Like any website, they see your IP address when your browser loads them.</li>
        <li>Feedback you send is emailed to the site owner. It's not stored anywhere else.</li>
        <li>We count, anonymously, how many trips are planned and shared. Nothing about you or your trip is stored.</li>
        <li>Hotel and car-hire "Check prices" links are affiliate links: they go through Travelpayouts to the booking site, which may pay us a commission. We send the destination and your dates, nothing else, and nothing is sent until you click.</li>
      </ul>
      <h3>Credits</h3>
      <ul>
        <li>Course positions, sights and hotels: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, under the Open Database License.</li>
        <li>Drive routes and place search: <a href="https://openrouteservice.org/" target="_blank" rel="noopener">openrouteservice.org</a> by HeiGIT, using OpenStreetMap data.</li>
        <li>Map tiles: Esri and its data partners (named on the map).</li>
        <li>Station data: Powered by TfL Open Data. Contains OS data &copy; Crown copyright and database rights 2016, and Geomni UK Map data &copy; and database rights 2019. National Rail stations from <a href="https://github.com/davwheat/uk-railway-stations" target="_blank" rel="noopener">uk-railway-stations</a> by David Wheatley, Trainline EU and their sources (ODbL).</li>
      </ul>
      <form method="dialog"><button class="tb-btn is-sm">Close</button></form>
    </div></dialog>`);
    d=document.getElementById('privacy-dlg');
    /* A tap on the backdrop closes it: the dialog has no padding, so only
       a backdrop tap lands on the dialog element itself. */
    d.addEventListener('click',e=>{if(e.target===d)d.close();});
  }
  document.querySelectorAll('details.tb-beta[open]').forEach(x=>x.removeAttribute('open'));
  if(!d.open)d.showModal();
}
/* GOLF-232: the Feedback dialog, reached from a "Feedback" link next to
   every Privacy link (map credits, the shared view's map, the Beta panel).
   Same one-<dialog>-built-on-first-open pattern as privacyOpen(). The text
   is posted to the Worker's /feedback, which emails it to Stefan; nothing
   about the trip goes with it, only the build and the page mode. The
   dialog stays in the page once built, so whatever is typed survives a
   failed send, a Cancel and a re-open; it's cleared only by a send that
   worked. The text is only ever a textarea value, never put into markup.
   `website` is a honeypot: hidden from people and screen readers, so only
   a bot fills it, and the Worker drops those silently. */
const FEEDBACK_MAX=2000;
function feedbackOpen(){
  let d=document.getElementById('feedback-dlg');
  if(!d){
    document.body.insertAdjacentHTML('beforeend',`<dialog id="feedback-dlg" class="privacy-dlg" aria-labelledby="feedback-h"><form class="privacy-body fb-body" id="fb-form">
      <h3 id="feedback-h">Send feedback</h3>
      <label class="fb-label" for="fb-text">What's working, what isn't, what you'd like to see?</label>
      <textarea id="fb-text" class="fb-text" maxlength="${FEEDBACK_MAX}" rows="6" required aria-describedby="fb-hint fb-count"></textarea>
      <div class="fb-meta"><span id="fb-hint">Don't include personal details. Add your email if you'd like a reply.</span>
        <span id="fb-count" class="fb-count" aria-live="polite">0 / ${FEEDBACK_MAX}</span></div>
      <div class="fb-hp" aria-hidden="true"><label>Website <input type="text" name="website" id="fb-website" tabindex="-1" autocomplete="off"></label></div>
      <p id="fb-status" class="fb-status" role="status" hidden></p>
      <div class="fb-acts"><button type="button" class="tb-btn is-sm" id="fb-cancel">Cancel</button>
        <button type="submit" class="tb-btn is-sm is-primary" id="fb-send">Send</button></div>
    </form></dialog>`);
    d=document.getElementById('feedback-dlg');
    d.addEventListener('click',e=>{if(e.target===d)d.close();});
    const ta=document.getElementById('fb-text');
    ta.addEventListener('input',()=>{
      document.getElementById('fb-count').textContent=ta.value.length+' / '+FEEDBACK_MAX;
      fbStatus('');
    });
    document.getElementById('fb-cancel').addEventListener('click',()=>d.close());
    document.getElementById('fb-form').addEventListener('submit',e=>{e.preventDefault();feedbackSend();});
  }
  document.querySelectorAll('details.tb-beta[open]').forEach(x=>x.removeAttribute('open'));
  fbStatus('');
  document.getElementById('fb-cancel').textContent='Cancel';
  if(!d.open)d.showModal();
  document.getElementById('fb-text').focus();
}
function fbStatus(msg,kind){
  const p=document.getElementById('fb-status');
  if(!p)return;
  p.textContent=msg;
  p.hidden=!msg;
  p.className='fb-status'+(kind?' is-'+kind:'');
}
function feedbackSend(){
  const ta=document.getElementById('fb-text');
  const btn=document.getElementById('fb-send');
  const text=ta.value.trim();
  if(!text){fbStatus('Type a message first.','err');ta.focus();return;}
  if(text.length>FEEDBACK_MAX){fbStatus('That\'s over '+FEEDBACK_MAX+' characters.','err');return;}
  btn.disabled=true;btn.textContent='Sending…';
  fbStatus('');
  fetch(ORS_PROXY_URL.replace(/\/$/,'')+'/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text,
      build:typeof APP_VERSION==='string'?APP_VERSION.slice(APP_VERSION.lastIndexOf('-')+1):'',
      mode:appMode,website:document.getElementById('fb-website').value})})
    .then(r=>r.json().catch(()=>({})).then(data=>({r,data})))
    .then(({r,data})=>{
      if(r.ok&&data.ok){
        ta.value='';
        document.getElementById('fb-count').textContent='0 / '+FEEDBACK_MAX;
        document.getElementById('fb-cancel').textContent='Close';
        fbStatus('Thanks, sent.','ok');
        return;
      }
      if(r.status===429)fbStatus(data.limit==='site'
        ?'We\'ve had a lot of feedback today, so sending is paused until tomorrow. Your message is still here.'
        :'You\'ve reached today\'s feedback limit. Try again tomorrow; your message is still here.','err');
      else fbStatus('Sorry, that didn\'t send. Your message is still here; try again in a minute.','err');
    })
    .catch(()=>fbStatus('Sorry, that didn\'t send. Check your connection and try again; your message is still here.','err'))
    .finally(()=>{btn.disabled=false;btn.textContent='Send';});
}
/* GOLF-150 (C3): the Beta badge moved from the pane header into the
   "Golf Tripper" masthead — one fewer thing competing with the trip's
   name. Mounted once (the masthead isn't re-rendered with the pane). */
function tbMountBetaBadge(){
  const mast=document.querySelector('.panel>.mast');
  if(!mast||mast.querySelector('.tb-beta'))return;
  mast.insertAdjacentHTML('beforeend',tbBetaBadgeHTML());
  /* GOLF-228: close the panel the button sits in, not one looked up in the
     masthead — on a phone the badge has moved into the pane header. */
  document.getElementById('tb-beta-close').addEventListener('click',e=>{
    const dd=e.currentTarget.closest('details.tb-beta');
    if(dd)dd.removeAttribute('open');
  });
}
/* Tabs span both modes: Discover means Plan, the other two mean Build.
   Shared by the pane's own tab row and the phone tab bar (GOLF-185a). */
function tbGoTab(k){
  /* GOLF-187: results used to stay open across a tab switch and sit above
     the itinerary, so the Itinerary tab opened onto a list of search hits
     rather than the trip. Switching tab is a change of subject. */
  tbClearUnifiedSearch();
  if(k==='discover'){if(appMode!=='plan')setAppMode('plan');return;}
  tbBuildTab=k;
  /* GOLF-178 reset removed by GOLF-193: re-opening the Costs tab used to
     force the mode back to Per person. That was harmless while the mode
     only governed that one card, but the choice is app-wide now — picking
     Total, glancing at the Itinerary and coming back would silently flip
     every figure in the app back again. It still starts on Per person on
     a page load and on a shared link (js/trip-share.js); it just stops
     undoing the visitor's own choice mid-session. */
  if(appMode!=='build')setAppMode('build');
  else{render();} // GOLF-108: render() so the course-pin layer tracks the tab (Costs/Itinerary hide it, Discover shows it)
}
function renderTripBuilder(){
  if(typeof mobBeforeRender==='function')mobBeforeRender(); // GOLF-185a
  const pane=document.getElementById('tb-pane');
  /* GOLF-193: every render re-asserts the app-wide mode on <body>, so a
     figure drawn by this pass shows the same reading as the ones already
     on screen — including the very first render, before anyone has touched
     the control. */
  tbCostModeApply();
  if(tbDayShown==null||!tripDays.find(d=>d.id===tbDayShown))tbDayShown=tripDays.length?tripDays[0].id:null;
  const isBuild=appMode==='build';
  const activeTab=isBuild?tbBuildTab:'discover';
  const TABS=[['discover','Discover'],['itin','Itinerary'],['cost','Costs']];
  const showItinFilters=isBuild&&tbBuildTab==='itin';
  // GOLF-142: the "Show hotels" toggle belongs anywhere the map itself is
  // the point — Discover (Plan mode) and the Itinerary tab — but not the
  // Costs tab, which isn't about the map. Mirrors showItinFilters' shape.
  const showMapTab=!isBuild||tbBuildTab==='itin';
  /* GOLF-150: chrome reorganised after owner feedback ("too many buttons,
     things are overflowing"), in two passes:
       batch 1 — the trip's name is the headline at the very top, and the
                 trip-level actions (share, clear) sit beside it as icons;
       batch 2 (W2/C1) — the tabs are the pane's primary navigation, so
                 they come straight after the header, and each tab only
                 carries its own controls.
     GOLF-208 (DEC-033): the country is the top-level choice, so its pills
     sit between the header and the tabs, on every tab. Discover gets
     search + [filters] Show hotels · Show POIs; Itinerary gets search +
     its view toggles, then group size and the £ total (moved out of the
     header, as on a phone); Costs gets nothing extra. */
  const isItin=isBuild&&tbBuildTab==='itin';
  const searchHTML=`${tbSearchFieldHTML({id:'tb-unified-search',variant:'bar',value:tbSearchQ,
      placeholder:isItin?'Add a course or town…':tbPhoneLayout()?'Search clubs or towns':'Search courses, towns and cities…',ariaLabel:'Search courses, towns and cities'})}
    <div class="tb-section" id="tb-search-results" style="border-bottom:none;padding-top:0${tbSearchQ.trim()?'':';display:none'}">${tbSearchQ.trim()?tbUnifiedSearchResultsHTML():''}</div>`;
  const hotelsBtn=`<button type="button" class="tb-btn is-sm${tbHotelLayerOn?' is-active':''}" id="tb-hotel-layer-toggle" aria-pressed="${tbHotelLayerOn}" title="Show nearby hotels on the map as you pan and zoom. Zoom in to see pins — no price data, just location."><span>${tbHotelLayerOn?'✓ ':''}<span class="tb-lbl-long">Show hotels</span><span class="tb-lbl-short">Hotels</span></span></button>`;
  /* GOLF-208: Show POIs drives GOLF-207's POI layer (Gavin's tbPoiLayerOn /
     tbPoiLayerSet); left out until that layer exists. */
  const poisBtn=typeof tbPoiLayerSet==='function'?`<button type="button" class="tb-btn is-sm${tbPoiLayerOn?' is-active':''}" id="tb-poi-layer-toggle" aria-pressed="${!!tbPoiLayerOn}" title="Show places to see near the map view. Zoom in to see pins."><span>${tbPoiLayerOn?'✓ ':''}<span class="tb-lbl-long">Show POIs</span><span class="tb-lbl-short">POIs</span></span></button>`:'';
  let tabChrome='';
  if(!isBuild){
    // GOLF-185d: the course filters sit beside the search, on every viewport.
    tabChrome=`${searchHTML}<div class="tb-toolbar">${cfButtonHTML()}${hotelsBtn}${poisBtn}</div>`;
  }else if(isItin){
    /* GOLF-207: Hotels · Courses · POIs, three map-layer pills of the same
       shape, in place of the old second filter icon. What's in the trip and
       its drive legs are always shown now, so the only thing these change is
       what extra sits on the map. Short labels keep the row on one line at
       375px (see .tb-lbl-long/.tb-lbl-short). */
    tabChrome=`${searchHTML}
    <div class="tb-toolbar">
      ${cfButtonHTML()}
      ${hotelsBtn}
      <button type="button" class="tb-btn is-sm${tbShowNearby?' is-active':''}" id="tb-nearby-toggle" aria-pressed="${tbShowNearby}" title="Show other bookable courses near your trip on the map. Doesn't change your itinerary."><span>${tbShowNearby?'✓ ':''}<span class="tb-lbl-long">Nearby courses</span><span class="tb-lbl-short">Courses</span></span></button>
      ${poisBtn}
    </div>`;
  }
  pane.innerHTML=`
    <header class="tb-head">
      ${tbTripMenuHTML(isBuild)}
      <div class="tb-head-actions">
        <button type="button" class="tb-btn is-icon is-sm is-quiet" id="tb-share-trip" aria-label="Share trip" title="Share — copies a read-only link showing this trip's map, day-by-day plan and costs. It's a frozen snapshot, not live — editing the trip afterward won't change the link.">${SHARE_ICON_SVG}</button>
        <button type="button" class="tb-btn is-icon is-sm is-quiet is-danger" id="tb-clear-trip" aria-label="Clear trip" title="Clear trip — empties this trip. Your other trips are untouched; to delete every trip use Start fresh in the trip menu."${TRIP.size||tripDays.length?'':' disabled'}>${TRASH_ICON_SVG}</button>
      </div>
    </header>
    ${tbNationPillsHTML()}
    <div class="tb-tabs" role="tablist">${TABS.map(([k,label])=>
      `<button class="tb-tab-btn" role="tab" data-tab="${k}" aria-pressed="${activeTab===k}">${label}</button>`).join('')}</div>
    ${tabChrome}
    <div class="tb-tab-content">${isItin?tbItinGroupHTML():''}${
      !isBuild?tbPlanHTML()
      :tbBuildTab==='cost'?tbCostsTabHTML()
      :tripDayScheduleHTML()
    }</div>`;

  tbMountBetaBadge();
  document.getElementById('tb-clear-trip').addEventListener('click',()=>tripClearAll());
  const nationPills=document.getElementById('tb-nation-pills');
  if(nationPills)nationPills.addEventListener('click',e=>{
    const b=e.target.closest('[data-nation]');if(!b)return;
    const k=b.dataset.nation;
    tbPickNation(state.nation===k?null:k);
  });
  const shareBtn=document.getElementById('tb-share-trip');
  if(shareBtn)shareBtn.addEventListener('click',()=>tbShareTrip(shareBtn));
  /* GOLF-194: the stepper lives in the trip menu now, so it is inside a
     <details> that this same re-render would otherwise slam shut —
     tripSetGroupSize() reopens it and restores focus. */
  pane.querySelectorAll('.tb-group-btn[data-gs]').forEach(b=>b.addEventListener('click',()=>tripSetGroupSize(groupSize+Number(b.dataset.gs),b.id)));
  pane.querySelectorAll('.tb-tab-btn').forEach(btn=>btn.addEventListener('click',()=>tbGoTab(btn.dataset.tab)));
  cfWireButton();
  /* GOLF-207: tbPoiLayerSet() owns its own Leaflet group and moveend
     listener (js/poi.js) and re-renders the pane itself, so this only has
     to flip it — same shape as the hotel toggle below. */
  const poiToggle=document.getElementById('tb-poi-layer-toggle');
  if(poiToggle)poiToggle.addEventListener('click',()=>tbPoiLayerSet(!tbPoiLayerOn));
  const nearbyToggle=document.getElementById('tb-nearby-toggle');
  if(nearbyToggle)nearbyToggle.addEventListener('click',()=>{tbShowNearby=!tbShowNearby;render();});
  // GOLF-142: unlike tbShowNearby above, this toggle doesn't feed
  // tbDrawMap()'s own redraw — it owns its own Leaflet layer group and
  // moveend/zoomend listener (js/hotel-layer.js), so flipping it only
  // needs a re-render for the button's own pressed/label state.
  const hotelLayerToggle=document.getElementById('tb-hotel-layer-toggle');
  if(hotelLayerToggle)hotelLayerToggle.addEventListener('click',()=>{tbToggleHotelLayer();renderTripBuilder();});
  tbBindDropdownDismiss();

  /* ── The one search bar. Course hits and place hits share its results
     panel; the component owns the debounce/stale-guard/keyboard, and
     `render` takes over painting so places and courses can be mixed. ── */
  const searchResultsEl=document.getElementById('tb-search-results');
  if(searchResultsEl){ // GOLF-150: the Costs tab has no search bar
  tbAttachSearch('tb-unified-search',{
    country:()=>tbTripCountryCode(null), // GOLF-92: trip's own nation first, Explore's pill as fallback
    layers:'coarse', // GOLF-150 (S1): towns & regions, not schools/libraries/football clubs
    onType(text){
      tbSearchQ=text;
      const q=text.trim();
      if(typeof tbClearTempPlaceMarker==='function')tbClearTempPlaceMarker(); // GOLF-112: a new search clears the focused-place marker
      searchResultsEl.style.display=q?'':'none';
      tbUnifiedPlaceResults=null;
      tbPlaceAddedNote=null; // the "added as Day N" note belongs to the query that produced it
      tbPlaceDayPick=null;
      searchResultsEl.innerHTML=q?tbUnifiedSearchResultsHTML():'';
    },
    render(list){
      // Keep list's null/undefined/[] distinction intact — tbUnifiedSearchResultsHTML()
      // needs to tell "geocode failed" (undefined) apart from "no matches" ([]).
      tbUnifiedPlaceResults=list;
      if(document.getElementById('tb-unified-search'))searchResultsEl.innerHTML=tbUnifiedSearchResultsHTML();
    },
    onPick(){/* unreachable: `render` owns this field's results panel */}
  });
  searchResultsEl.addEventListener('click',e=>{
    /* GOLF-187: the whole place row is the tap target now, and it does one
       thing — put the place on the map and open its card. The two actions
       that used to be buttons here ("Courses near here", "Add as a day")
       live on that card (js/trip-add.js tbPlaceCardHTML), which is what
       stopped a town costing three rows' worth of height in the list. */
    const focus=e.target.closest('.tb-unified-place-focus');
    if(!focus||e.target.closest('button,select'))return; // GOLF-216: the row's own "Add as a day"
    e.preventDefault();
    tbFocusPlaceOnMap(parseFloat(focus.dataset.lat),parseFloat(focus.dataset.lng),focus.dataset.label);
  });
  searchResultsEl.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const focus=e.target.closest('.tb-unified-place-focus');
    if(!focus||e.target.closest('button,select'))return; // GOLF-216: the row's own "Add as a day"
    e.preventDefault();
    tbFocusPlaceOnMap(parseFloat(focus.dataset.lat),parseFloat(focus.dataset.lng),focus.dataset.label);
  });
  }

  /* ── Call site 2: the open "add a stop" form's location field. ── */
  if(tbAddStop&&document.getElementById('tb-addstop-name')){
    tbAttachSearch('tb-addstop-name',{
      country:()=>tbTripCountryCode(tbAddStop&&tbAddStop.dayId), // GOLF-92: ringfence to this trip's nation
      onType(text){tbAddStop.name=text;tbAddStop.lat=null;tbAddStop.lng=null;},
      onPick(r){
        const priceEl=document.getElementById('tb-addstop-price');
        tbAddStop.price=priceEl?priceEl.value:'';
        tbAddStop.name=r.label;tbAddStop.lat=r.lat;tbAddStop.lng=r.lng;
        renderTripBuilder();
      }
    });
  }
  /* Call site 3 (each day card's own city field) was retired along with
     the rest of the day card's "Options" dropdown — see tbDayCardHTML()'s
     comment. tbFocusDayPlace is left in the transient-state reset lists
     untouched (harmless — it just never gets set to anything meaningful
     any more) rather than threading its removal through every reset site. */
  if(appMode==='plan'){
    ['anchor','region'].forEach(k=>{ // GOLF-91: 'place' scope merged into 'anchor' ("Nearby")
      const b=document.getElementById('tb-tab-'+k);
      if(b)b.addEventListener('click',()=>{tbDiscoveryTab=k;renderTripBuilder();tbDrawMap();});
    });
    if(tbDiscoveryTab==='region'){
      const run=()=>{
        tbRegion=document.getElementById('tb-region').value;
        tbBorder=parseFloat(document.getElementById('tb-border').value)||0;
        document.getElementById('tb-results').innerHTML=tbResultsHTML(tbDiscover());tbDrawMap();
      };
      document.getElementById('tb-region').addEventListener('change',run);
      document.getElementById('tb-border').addEventListener('change',run);
    }
  }
  if(typeof mobAfterRender==='function')mobAfterRender(); // GOLF-185a: phone sheet, floating search, tab bar
}
