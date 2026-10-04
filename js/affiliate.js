/* ════════════════════════════════════════════════════════════════════
   GOLF-233 — affiliate links, stage 1 (DEC-038)

   Two placements, both plain <a> links. No network calls from the app,
   no Worker involvement: a click leaves the site, and nothing here runs
   until someone clicks.

     · hotels   — "Check prices" on the first hotel row of a day,
                  deep-linked into Klook's search for that destination
                  with the stay's dates and the group size.
     · car hire — one "Hire a car" link per trip, in the Costs tab's
                  Other group beside Fuel.

   The marker and trs below are PUBLIC partner ids. They are safe in
   client code and are the whole point of the link — they are not keys.
   The 2026-09-17 Travelpayouts API token is never used here.

   Shared view (#share=): no links at all. A shared trip is someone
   else's snapshot; monetising a link the recipient did not ask for is
   the one placement DEC-038 ruled out. affEnabled() is the single
   guard, deliberately central — the shared view renders through the
   SAME tbItinAllHTML()/tbCostsBodyHTML() as build mode, so a per-call
   -site check would be one forgotten branch away from leaking.
   ════════════════════════════════════════════════════════════════════ */

const AFF_MARKER='778843',AFF_TRS='575131';
/* campaign_id + p identify the programme to Travelpayouts; both come
   from the partner's own deeplink builder. */
const AFF_PROGRAMMES={
  economybookings:{campaign_id:'10',p:'2018'},
  klook:          {campaign_id:'137',p:'4110'}
};
/* Travelpayouts calls this "SubID" and the query parameter is sub_id
   (support.travelpayouts.com/hc/en-us/articles/203955653). It is what
   makes the dashboard say which PLACEMENT earned, rather than just
   which programme — without it both links report as one lump. */
function affLink(programme,targetUrl,subId){
  const p=AFF_PROGRAMMES[programme];
  if(!p||!targetUrl)return null;
  return'https://tp.media/r?campaign_id='+p.campaign_id
    +'&marker='+AFF_MARKER+'&p='+p.p+'&trs='+AFF_TRS
    +(subId?'&sub_id='+encodeURIComponent(subId):'')
    +'&u='+encodeURIComponent(targetUrl);
}
/* Shown next to every link. Required by the ASA here and by Travelpayouts'
   own terms, and it is the honest thing to say. */
const AFF_DISCLOSURE='We may earn a commission, at no extra cost to you.';
function affEnabled(){
  return typeof appMode==='undefined'||appMode!=='shared';
}

/* ── Klook destinations ───────────────────────────────────────────────
   Klook's hotel search will NOT take a free-text place or a bare
   lat/lng: a URL without one of its own internal ids (svalue) bounces
   to the hotels landing page. Verified 2026-10-04 against stype=latlng,
   stype=keyword, and latlng+city_id — all three bounce. So the ids have
   to be carried here.

   Each entry was taken from Klook's own search UI and the resulting
   search URL confirmed to render from a cold load with arbitrary dates.
   `kind` is Klook's stype:
     city       — svalue IS the city_id. Results are strictly in-city.
     place      — a landmark (here, the golf course). Results are by
                  RADIUS from it and are much richer: Kingsbarns as a
                  place returns 39 where St Andrews as a city returns 15,
                  and Gullane has no city entry at all yet returns 142.
                  So the golf course is the preferred key, not the town.
     google_poi — svalue is a Google Place ID. Klook accepts these too;
                  Machrihanish is only reachable this way.
   lat/lng here is the DESTINATION's own position, used only to pick the
   nearest entry to a given stay — it is not sent to Klook.

   Extending this list is a manual job (type the town into Klook's hotel
   search, pick the golf course, and read svalue/city_id out of the
   resulting URL). Property counts are the 2026-10-04 coverage test. */
const AFF_KLOOK_DESTS=[
  {name:'St Andrews',  lat:56.339800,lng:-2.796700,kind:'city',      svalue:'703805',  cityId:'703805'},
  {name:'Kingsbarns',  lat:56.299436,lng:-2.647297,kind:'place',     svalue:'60055847',cityId:'703805'},
  {name:'Gullane',     lat:56.033634,lng:-2.838008,kind:'place',     svalue:'50149335',cityId:'20645'},
  {name:'Brora',       lat:58.010500,lng:-3.852800,kind:'city',      svalue:'40243906',cityId:'40243906'},
  {name:'Dornoch',     lat:57.881400,lng:-4.028000,kind:'city',      svalue:'704614',  cityId:'704614'},
  {name:'Machrihanish',lat:55.426500,lng:-5.729500,kind:'google_poi',svalue:'ChIJNYNUjucIikgRpQmv4JGVHuA',cityId:''},
  {name:'Portrush',    lat:55.205600,lng:-6.653100,kind:'city',      svalue:'40242928',cityId:'40242928'},
  {name:'Lahinch',     lat:52.934710,lng:-9.344890,kind:'place',     svalue:'50149661',cityId:'4675'},
  {name:'Ballybunion', lat:52.494732,lng:-9.675640,kind:'place',     svalue:'50149682',cityId:'705502'},
  {name:'George',      lat:-33.952927,lng:22.406914,kind:'place',    svalue:'50147466',cityId:'25130'}
];
/* Beyond this, the "nearest" destination is somewhere the traveller is
   not going, and a Check prices link would be a lie. No link is better
   than a wrong one, so an unmatched stay simply shows nothing. */
const AFF_KLOOK_MAX_KM=60;
function affNearestKlookDest(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  let best=null,bestD=Infinity;
  AFF_KLOOK_DESTS.forEach(d=>{
    /* Equirectangular approximation. At these separations (tens of km,
       and only ever used to RANK candidates) it is well inside the
       precision this needs, and it avoids pulling in a haversine. */
    const dy=(d.lat-lat)*111.32;
    const dx=(d.lng-lng)*111.32*Math.cos((lat+d.lat)/2*Math.PI/180);
    const km=Math.sqrt(dx*dx+dy*dy);
    if(km<bestD){bestD=km;best=d;}
  });
  return bestD<=AFF_KLOOK_MAX_KM?best:null;
}
/* 'YYYY-MM-DD' + n days, or null. Kept here rather than reaching into
   js/trip-model.js's private shift(). */
function affDatePlus(iso,n){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return null;
  const t=new Date(iso+'T00:00:00Z');
  if(isNaN(t.getTime()))return null;
  t.setUTCDate(t.getUTCDate()+n);
  return t.toISOString().slice(0,10);
}
/* A Klook hotel search URL for one destination.
   Dates are OMITTED rather than guessed when the day has no date on it —
   a trip can be planned with no dates at all, and "check_in=undefined"
   or a today-default would both be worse than letting Klook ask. */
function affKlookSearchUrl(dest,checkIn,nights,adults){
  if(!dest)return null;
  const n=Math.max(1,Math.round(nights)||1);
  const out=checkIn?affDatePlus(checkIn,n):null;
  const q=['city_id='+encodeURIComponent(dest.cityId||''),
           'stype='+encodeURIComponent(dest.kind),
           'svalue='+encodeURIComponent(dest.svalue),
           'title='+encodeURIComponent(dest.name),
           'adult_num='+Math.max(1,Math.round(adults)||1),
           'child_num=0','room_num=1'];
  if(checkIn&&out)q.push('check_in='+checkIn,'check_out='+out);
  return'https://www.klook.com/en-GB/hotels/searchresult/?'+q.join('&');
}
/* The whole hotel placement, as one call: null means render nothing. */
function affHotelLink(day,stay){
  if(!affEnabled()||!day||!stay)return null;
  /* The stay's own coordinates when it has them (hotels picked off the
     map do), else the day's place — a hotel typed in by hand has a name
     and a price but no point. */
  let lat=stay.lat,lng=stay.lng;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){lat=day.placeLat;lng=day.placeLng;}
  const dest=affNearestKlookDest(lat,lng);
  if(!dest)return null;
  const gs=typeof groupSizeFor==='function'?groupSizeFor():1;
  const url=affKlookSearchUrl(dest,day.date||null,stay.nights||1,gs);
  return url?{href:affLink('klook',url,'hotel'),dest:dest.name}:null;
}
/* Car hire: one link per trip.
   EconomyBookings keys its pick-up location to an internal `plc` id the
   same way Klook does, and a results URL carrying only dates renders
   "Please choose pick-up location" over an empty list (checked
   2026-10-04). A dateless homepage link is the better landing of the
   two and still carries the marker, which is what the brief allows. */
function affCarHireLink(){
  if(!affEnabled())return null;
  return affLink('economybookings','https://www.economybookings.com/','carhire');
}
