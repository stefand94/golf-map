/* ════════════════════════════════════════════════════════════════════
   GOLF-233 — affiliate links, stage 1 (DEC-038)

   Two placements, both plain <a> links. No network calls from the app,
   no Worker involvement: a click leaves the site, and nothing here runs
   until someone clicks.

     · hotels   — "Check prices" on the first hotel row of a day,
                  deep-linked into Stay22's search at the stay's own
                  position with its dates and the group size (GOLF-242;
                  was Klook in GOLF-233).
     · car hire — one "Hire a car" link per trip, in the Costs tab's
                  Other group beside Fuel.

   The marker, trs and Stay22 aid below are PUBLIC partner ids. They are safe in
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

/* ── Hotels: Stay22 (GOLF-242) ───────────────────────────────────────
   Stay22's "Allez" deeplink takes a bare lat/lng and dates, so every
   located stay gets a link with no hand-harvested ids. This replaced
   GOLF-233's Klook town table, whose ids had to be collected one town
   at a time and covered only 10 places. Klook stays in AFF_PROGRAMMES
   above for a possible tours stage; nothing uses it for hotels now.

   Format, per dev.stay22.com/docs/allez/parameters (checked 2026-10-05):
     https://www.stay22.com/allez/roam?aid=…&lat=…&lng=…
       &checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=N&campaign=…
   `roam` lets Stay22 pick the booking site. lat/lng beat `address` when
   both are given, so no address is sent. `campaign` is Stay22's
   placement tag (their docs ask for underscores, not hyphens).

   This is a direct Stay22 link, NOT a tp.media redirect: Stay22 is its
   own affiliate programme, not a Travelpayouts one. The aid is a public
   partner id, like the marker above. */
const AFF_STAY22_AID='golftripper';
/* 'YYYY-MM-DD' + n days, or null. Kept here rather than reaching into
   js/trip-model.js's private shift(). */
function affDatePlus(iso,n){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return null;
  const t=new Date(iso+'T00:00:00Z');
  if(isNaN(t.getTime()))return null;
  t.setUTCDate(t.getUTCDate()+n);
  return t.toISOString().slice(0,10);
}
/* Dates are OMITTED rather than guessed when the day has no date on it —
   a trip can be planned with day labels only, and "checkin=undefined"
   or a today-default would both be worse than letting Stay22 ask. */
function affStay22Url(lat,lng,checkIn,nights,adults,campaign){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const n=Math.max(1,Math.round(nights)||1);
  const out=checkIn?affDatePlus(checkIn,n):null;
  /* 5 dp is ~1 m: as precise as a hotel pin needs. */
  const q=['aid='+encodeURIComponent(AFF_STAY22_AID),
           'lat='+lat.toFixed(5),'lng='+lng.toFixed(5)];
  if(out)q.push('checkin='+checkIn,'checkout='+out);
  q.push('adults='+Math.max(1,Math.round(adults)||1));
  if(campaign)q.push('campaign='+encodeURIComponent(campaign));
  return'https://www.stay22.com/allez/roam?'+q.join('&');
}
/* The whole hotel placement, as one call: null means render nothing.
   Only the STAY's own coordinates count. A hotel typed in by hand has a
   name and a price but no point, and the day's place could be the golf
   course 30 miles away — no link is better than a search somewhere the
   traveller is not staying. */
function affHotelLink(day,stay){
  if(!affEnabled()||!day||!stay)return null;
  const gs=typeof groupSizeFor==='function'?groupSizeFor():1;
  const href=affStay22Url(stay.lat,stay.lng,day.date||null,stay.nights||1,gs,'hotel');
  return href?{href}:null;
}
/* Car hire: one link per trip.
   EconomyBookings keys its pick-up location to an internal `plc` id (as
   Klook did for hotels before GOLF-242), and a results URL carrying only
   dates renders "Please choose pick-up location" over an empty list (checked
   2026-10-04). A dateless homepage link is the better landing of the
   two and still carries the marker, which is what the brief allows. */
function affCarHireLink(){
  if(!affEnabled())return null;
  return affLink('economybookings','https://www.economybookings.com/','carhire');
}
