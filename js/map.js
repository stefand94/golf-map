/* ============================================================
   js/map.js — the Leaflet map: basemap, rail/station layers and their
   zoom restyling, the clustered course markers, pin/popup/tooltip
   HTML, the nearest-station link line, and the mobile list/map
   toggle.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

const startView=restoredView||{center:[51.45,-0.15],zoom:9};
map=L.map('map',{scrollWheelZoom:true,zoomControl:false}).setView(startView.center,startView.zoom);
L.control.zoom({position:'bottomright'}).addTo(map);
/* GOLF: basemap went CartoDB Light -> OpenTopoMap -> CartoDB Voyager.
   OpenTopoMap's contour lines/terrain shading looked great on coastal
   links courses but were too busy at the country-wide "show all results"
   view, and Esri World Topo (compared side by side) was even busier —
   more place-name labels and a relief tint competing with the pins.
   Switched from CARTO's Voyager tiles to the standard OSM tile server —
   CARTO started gating rastertiles behind a "API key required" watermark
   for unauthenticated/high-volume traffic; the plain OSM tile server needs
   no key at all and has no such gate. */
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);

const railLayer=L.layerGroup().addTo(map),lblLayer=L.layerGroup().addTo(map),
      stnLayer=L.layerGroup().addTo(map),stnLblLayer=L.layerGroup().addTo(map),
      linkLayer=L.layerGroup().addTo(map);

const railPolys=[],stnDots=[];
function railWeight(){const z=map.getZoom();return z<10?1.1:z<12?1.6:z<14?2.2:3}
function stnRadius(ix){const z=map.getZoom();const b=z<10?1.4:z<12?2:z<14?2.8:3.6;return ix?b*1.55:b}

/* GOLF: TfL-network families (met/jub/nor/pic/cen/dis/eli/ovg) draw from
   RAIL_GEOM — real track geometry traced from OpenStreetMap via
   scripts/fetch_rail_geometry.py — instead of a spline through station
   coordinates, which only ever approximated the route and looked visibly
   wrong once the basemap started showing real streets underneath it.
   National Rail groupings (Thameslink, Southern, etc.) have no single
   physical route to trace (they're our own station groupings by corridor,
   not one relation in OSM) so those keep the spline approximation. Each
   family's real geometry is drawn once (not once per branch key) since
   RAIL_GEOM already holds every distinct segment for that family. */
const geomDrawn=new Set();
Object.entries(R).forEach(([rk,stations])=>{
  const fam=ROUTE_LINE[rk],L_=LINES[fam];
  if(typeof RAIL_GEOM!=='undefined'&&RAIL_GEOM[fam]){
    if(!geomDrawn.has(fam)){
      geomDrawn.add(fam);
      RAIL_GEOM[fam].forEach(seg=>{
        const p=L.polyline(seg,{color:L_.c,weight:railWeight(),opacity:.95,dashArray:L_.d,lineCap:'round',lineJoin:'round'})
          .bindTooltip(L_.n,{sticky:true}).addTo(railLayer);
        railPolys.push(p);
      });
    }
  }else{
    const curve=spline(stations.map(s=>[s[1],s[2]]));
    const p=L.polyline(curve,{color:L_.c,weight:railWeight(),opacity:.95,dashArray:L_.d,lineCap:'round',lineJoin:'round'})
      .bindTooltip(L_.n,{sticky:true}).addTo(railLayer);
    railPolys.push(p);
  }
  if(LABEL_AT[rk]!==undefined){
    const s=stations[LABEL_AT[rk]];
    L.marker([s[1],s[2]],{interactive:false,icon:L.divIcon({className:'',html:`<div class="lnlabel" style="background:${L_.c}">${L_.n}</div>`,iconSize:[0,0],iconAnchor:[-5,5]})}).addTo(lblLayer);
  }
});

Object.values(STN).forEach(s=>{
  const ix=isIX(s.n),col=LINES[s.l].c;
  /* GOLF: a station is a National Rail station (gets the NR badge) if
     ANY line serving it is non-TfL — an interchange between, say, the
     Metropolitan line and Chiltern Railways is still worth flagging,
     since a Tube-only Oyster/contactless cap doesn't cover the NR leg. */
  const stnLineKeys=[...STN_LINES[s.n]];
  const isNR=stnLineKeys.some(k=>!TFL_LINES.has(k));
  /* GOLF: a visible marker at the station location itself, not just its
     label — a red halo ring around the dot, always on whenever the
     Stations layer is (not gated by the label zoom thresholds below),
     so National Rail stations are identifiable without needing to zoom
     in far enough for text labels to appear. */
  let ring=null;
  if(isNR){
    ring=L.circleMarker([s.lat,s.lng],{
      radius:stnRadius(ix)+3,color:'#B5121B',weight:2,fill:false,interactive:false
    }).addTo(stnLayer);
  }
  const dot=L.circleMarker([s.lat,s.lng],{
    radius:stnRadius(ix),color:ix?'#1B2733':col,weight:ix?1.6:1.2,fillColor:ix?'#ffffff':col,fillOpacity:1
  }).bindTooltip(`${s.n}${isNR?nrBadge():''}`,{direction:'top',offset:[0,-4]})
    .bindPopup(`<div class="pop"><h3 style="font-size:15px">${s.n}${isNR?nrBadge():''}</h3><p class="sub" style="margin:0">${stnLineKeys.map(k=>LINES[k].n).join(' · ')}${ix?' — interchange':''}</p></div>`)
    .addTo(stnLayer);
  stnDots.push({dot,ring,ix,s,isNR});
  const lbl=L.marker([s.lat,s.lng],{interactive:false,icon:L.divIcon({className:'',html:`<div class="stnlabel">${s.n}${isNR?' <span style="color:#B5121B;font-weight:700">NR</span>':''}</div>`,iconSize:[0,0],iconAnchor:[-6,6]})});
  stnDots[stnDots.length-1].lbl=lbl;
});

/* GOLF: at country-wide zoom (default view, zoom 9) the London rail
   network is 100+ overlapping polylines squeezed into a tiny area — pure
   clutter until you're actually zoomed in on London. Below RAIL_MIN_ZOOM
   the rail/line-label layers come off the map entirely (not just dimmed),
   while still respecting the manual Rail/Labels toggles once you zoom in. */
const RAIL_MIN_ZOOM=9;
/* GOLF: station dots (with their NR rings) were always on whenever the
   Stations toggle was on, even at the default country-wide zoom where
   they're just clutter on top of the flag markers. Gated the same way as
   rail — off entirely below STN_MIN_ZOOM regardless of the toggle state,
   back once you're zoomed in far enough for them to be useful. */
const STN_MIN_ZOOM=11;
function railToggledOn(){return document.getElementById('t-rail').getAttribute('aria-pressed')==='true'}
function lblToggledOn(){return document.getElementById('t-lbl').getAttribute('aria-pressed')==='true'}
function stnToggledOn(){return document.getElementById('t-stn').getAttribute('aria-pressed')==='true'}
function restyleRail(){
  const w=railWeight();
  railPolys.forEach(p=>p.setStyle({weight:w}));
  stnDots.forEach(o=>{o.dot.setRadius(stnRadius(o.ix));if(o.ring)o.ring.setRadius(stnRadius(o.ix)+3);});
  const z=map.getZoom();
  stnLblLayer.clearLayers();
  if(z>=13) stnDots.forEach(o=>stnLblLayer.addLayer(o.lbl));
  else if(z>=11) stnDots.filter(o=>o.ix).forEach(o=>stnLblLayer.addLayer(o.lbl));

  const showRail=railToggledOn()&&z>=RAIL_MIN_ZOOM;
  if(showRail&&!map.hasLayer(railLayer))map.addLayer(railLayer);
  if(!showRail&&map.hasLayer(railLayer))map.removeLayer(railLayer);
  const showLbl=lblToggledOn()&&z>=RAIL_MIN_ZOOM;
  if(showLbl&&!map.hasLayer(lblLayer))map.addLayer(lblLayer);
  if(!showLbl&&map.hasLayer(lblLayer))map.removeLayer(lblLayer);
  const showStn=stnToggledOn()&&z>=STN_MIN_ZOOM;
  if(showStn&&!map.hasLayer(stnLayer))map.addLayer(stnLayer);
  if(!showStn&&map.hasLayer(stnLayer))map.removeLayer(stnLayer);
}
map.on('zoomend',restyleRail);restyleRail();

L.marker(HOME,{icon:L.divIcon({className:'',html:'<div class="home"></div>',iconSize:[21,21],iconAnchor:[10.5,10.5]})})
 .addTo(map).bindPopup('<div class="pop"><h3>Finchley Road</h3><p class="sub">Your starting point</p><p class="note" style="border:0;padding:0">Jubilee and Metropolitan. West Hampstead Thameslink is a 6-minute walk — that unlocks Mill Hill Broadway, Elstree, Radlett, St Albans City, Harpenden and West Dulwich directly.</p></div>');

/* GOLF: 284 flag markers all rendering individually made the map
   unreadable at any zoom wide enough to see more than one town at once —
   swapped the plain layerGroup for markercluster so nearby courses collapse
   into a single numbered badge until you're zoomed in close enough that
   they'd actually be distinguishable as separate flags. disableClusteringAtZoom
   matches roughly "one town/coastline visible" — past that every course
   shows as its own flag again, same as before this change. */
const layer=L.markerClusterGroup({
  maxClusterRadius:50,
  disableClusteringAtZoom:14,
  spiderfyOnMaxZoom:true,
  showCoverageOnHover:false,
  iconCreateFunction(cluster){
    const n=cluster.getChildCount(),tier=n<10?'sm':n<50?'md':'lg',size=n<10?30:n<50?36:42;
    return L.divIcon({className:'',html:`<div class="mcluster mcluster-${tier}">${n}</div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
  }
}).addTo(map),markers=new Map();
const HC_TEES={};
function ranked(i){const t=C[i].t100;return t&&(typeof t.gl==='number'||t.gbi||typeof t.eng==='number'||typeof t.sco==='number'||typeof t.wal==='number')}
function pinFor(i){const a=ACCESS[V(i,'a')],rk=ranked(i),size=rk?28:20;
  return L.divIcon({className:'',html:flagSVG(a.colour,a.pole,size,rk),iconSize:[size,size*1.3],iconAnchor:[size*0.28,size*1.25]})}
const CONF={club:"Rate from the club's own page",press:"Rate published in trade press or a golf guide",est:"Indicative — verify with the club before travelling"};
/* Card space is tight — show only the single most prestigious ranking
   (ENG > GB&I > GL), with a "+N" hint if a course carries more than one. */
function bestRankBadge(i){const t=C[i].t100;if(!t)return'';
  const all=[];
  if(typeof t.eng==='number')all.push(`ENG #${t.eng}`);
  if(typeof t.sco==='number')all.push(`SCO #${t.sco}`);
  if(typeof t.wal==='number')all.push(`WAL #${t.wal}`);
  if(typeof t.ire==='number')all.push(`IRE #${t.ire}`);
  if(typeof t.za==='number')all.push(`ZA #${t.za}`);
  if(t.gbi)all.push(`GB&amp;I #${t.gbi}`);
  if(typeof t.gl==='number')all.push(`GL #${t.gl}`);
  if(!all.length)return'';
  const extra=all.length>1?` <span class="wt">+${all.length-1}</span>`:'';
  return `<span class="rk">${all[0]}</span>${extra}`;
}
function rankChips(i){const t=C[i].t100;if(!t)return'';const p=[];
  if(typeof t.gl==='number')p.push(`Greater London #${t.gl}`);if(t.gbi)p.push(`Britain &amp; Ireland #${t.gbi}`);
  if(t.eng)p.push(`England #${t.eng}`);if(t.sco)p.push(`Scotland #${t.sco}`);if(t.wal)p.push(`Wales #${t.wal}`);if(t.ire)p.push(`Ireland #${t.ire}`);if(t.za)p.push(`South Africa #${t.za}`);
  if(t.lse)p.push(`London &amp; SE #${t.lse}`);if(t.sur)p.push(`Surrey #${t.sur}`);
  if(typeof t.gl==='string')p.push(t.gl);if(t.kent)p.push(t.kent);
  return `<p class="ranks">${p.map(x=>`<span>${x}</span>`).join('')}</p>`}

function popupHTML(i){
  const c=C[i],a=ACCESS[V(i,'a')],stn=STN[V(i,'stn')],near=c.nearStation;
  const travel=stn?`<b style="color:${LINES[stn.l].c}">${stn.n}</b> · ${LINES[stn.l].n}${nrBadge(stn.l)} — ${V(i,'walk')}`
    :near?`<b>${near.n}</b>${nrBadge()} — ${near.mi} mi, straight-line (nearest station nationally, not a walking route)`
    :(V(i,'walk')||'Outside the rail catchment — no nearby station on this map');
  const search=`https://www.google.com/search?q=${encodeURIComponent(V(i,'n')+' golf club green fees')}`;
  const site=V(i,'site'),book=V(i,'book'),club=c.clubInfo;
  return `<div class="pop">${c.logo?`<div style="width:100%;height:100px;background:var(--paper);border-radius:6px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="${c.logo}" alt="${V(i,'n')} club logo" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain"></div>`:''}<h3>${V(i,'n')} ${isEdited(i)?'<span class="edited">EDITED</span>':''}${c.sweep?' <span class="wt">sweep find</span>':''}${PLAYED.has(i)?' <span class="wt played">played</span>':WANT.has(i)?' <span class="wt want">want to play</span>':''}${TRIP.has(i)?' <span class="wt">in trip</span>':''}</h3>
    <p class="sub">${c.r} · ${a.label}${c.winter?' · drains well in winter':''}</p>${rankChips(i)}
    <div class="fees"><div class="fee-box"><b>Weekday</b><span>${V(i,'wd')}</span></div>
    <div class="fee-box"><b>Weekend</b><span>${V(i,'we')}</span></div></div>
    <dl><dt>Course</dt><dd>${V(i,'spec')}</dd><dt>Design</dt><dd>${V(i,'arch')}</dd><dt>By rail</dt><dd>${travel}</dd>${club&&club.phone?`<dt>Phone</dt><dd>${club.phone}</dd>`:''}${(c.top100||c.topScot||c.topWales||c.topIreland||c.topSouthAfrica)?`<dt>From home</dt><dd>${distMiles(i)} mi, as the crow flies</dd>`:''}</dl>
    <p class="note">${V(i,'note')}${club&&club.blurb?` <span style="color:var(--stone)">— England Golf: ${club.blurb}</span>`:''}</p>
    ${calcHTML(i)}
    <div class="actions">
      <button class="btn primary" onclick="${TRIP.has(i)?`toggleTrip(${i})`:`tbAddToPlan(${i})`}">${TRIP.has(i)?'✓ In your trip — remove':'+ Add to trip'}</button>
      ${site?`<a class="btn" href="${site}" target="_blank" rel="noopener">Club website</a>`:`<a class="btn ghost" href="${search}" target="_blank" rel="noopener">Find the club site</a>`}
      ${book&&book!==site?`<a class="btn ghost" href="${book}" target="_blank" rel="noopener">Green fees</a>`:''}
      ${club&&club.teeBooking&&club.teeBooking!==site&&club.teeBooking!==book?`<a class="btn ghost" href="${club.teeBooking}" target="_blank" rel="noopener">Tee booking</a>`:''}
      ${club&&club.membership&&club.membership!==site?`<a class="btn ghost" href="${club.membership}" target="_blank" rel="noopener">Membership</a>`:''}
      <button class="btn subtle" onclick="togglePlayed(${i})">${PLAYED.has(i)?'Unmark played':'Mark played'}</button>
      <button class="btn subtle" onclick="toggleWant(${i})">${WANT.has(i)?'Remove from want-to-play':'Want to play'}</button>
      <button class="btn subtle" onclick="openEditor(${i})">Correct this</button>
      <button class="btn subtle" onclick="setAsAnchor(${i})">Set as anchor course for a trip</button>
    </div><p class="conf">${CONF[c.conf]}</p></div>`;
}
/* GOLF-52: a lightweight hover tooltip (name/fee/ranking) so a visitor
   can scan the map without clicking every pin open — the full popup
   (fees, design, booking links, etc.) still only opens on click. */
function courseTooltipHTML(i){
  const t=C[i].t100,ranks=[];
  if(t){
    if(typeof t.gl==='number')ranks.push('GL #'+t.gl);
    else if(t.gbi)ranks.push('B&amp;I #'+t.gbi);
    else if(t.eng)ranks.push('England #'+t.eng);
    else if(t.sco)ranks.push('Scotland #'+t.sco);
    else if(t.wal)ranks.push('Wales #'+t.wal);
  }
  return`<div class="course-tt-name">${V(i,'n')}</div><div class="course-tt-meta">${V(i,'wd')}${ranks.length?' · '+ranks[0]:''}</div>`;
}
C.forEach((c,i)=>{
  const m=L.marker([c.lat,c.lng],{icon:pinFor(i),title:c.n});
  m.on('click',()=>{m.setPopupContent(popupHTML(i));highlight(i);drawLink(i)});
  m.bindPopup(popupHTML(i),{maxWidth:340});
  m.bindTooltip(courseTooltipHTML(i),{direction:'top',offset:[0,-28],className:'course-tt'});
  markers.set(i,m);
});
function drawLink(i){linkLayer.clearLayers();
  const stnObj=STN[V(i,'stn')],near=C[i].nearStation,s=stnObj||near;if(!s)return;
  L.polyline([[s.lat,s.lng],[C[i].lat,C[i].lng]],{color:'#1B2733',weight:2,opacity:.85,dashArray:'2 5',lineCap:'round'}).addTo(linkLayer);
  /* GOLF: nationwide nearStation lookups are always National Rail (no
     equivalent TfL data outside London); a London-network stn only gets
     the roundel if none of its lines are TfL. Without this, a course's
     nearest station never showed anything at its actual map location —
     only the dashed link line. */
  const isNR=stnObj?[...STN_LINES[stnObj.n]].some(k=>!TFL_LINES.has(k)):true;
  if(isNR)nrStationMarker(s.lat,s.lng).addTo(linkLayer);
}

/* GOLF-19: mobile list<->map toggle (see the max-width:900px block in
   <style> — .app stacks full-height, one of .panel/#map is display:none
   at a time via body.mob-list/mob-map). Desktop ignores this entirely,
   the toggle button itself is display:none above 900px. */
const mobToggle=document.getElementById('mob-toggle');
document.body.classList.add('mob-list');
function showMobileMap(){
  if(window.innerWidth>900)return;
  document.body.classList.remove('mob-list');document.body.classList.add('mob-map');
  mobToggle.textContent='Show list';
  /* GOLF-31: a tbDrawMap() fitBounds() that ran while #map was
     display:none (e.g. right after tbSelect() on mobile, still on the
     list view) computed against a stale/zero-size container — re-fit
     once the map is actually visible and sized. */
  setTimeout(()=>{map.invalidateSize();if(tripBuilderOn)tbDrawMap();},0);
}
function showMobileList(){
  document.body.classList.remove('mob-map');document.body.classList.add('mob-list');
  mobToggle.textContent='Show map';
}
mobToggle.addEventListener('click',()=>{
  document.body.classList.contains('mob-map')?showMobileList():showMobileMap();
});

function goToCourse(i){map.closePopup();showMobileMap();map.flyTo([C[i].lat,C[i].lng],13,{duration:.6});
  markers.get(i).setPopupContent(popupHTML(i));markers.get(i).openPopup();highlight(i);drawLink(i)}
