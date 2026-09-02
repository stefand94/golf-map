/**
 * GOLF-45 / GOLF-46 / GOLF-50 / GOLF-55 / GOLF-56 — ORS driving-time +
 * route + POI + geocoding proxy, auto-deployed via Cloudflare's Git
 * integration (build root directory: scripts/cloudflare-worker).
 * ORS_API_KEY is set under the Build's own "Variables and secrets"
 * section and needs a fresh build to bind — it doesn't apply
 * retroactively to a running deployment.
 *
 * A stateless Cloudflare Worker that stands between the golf map (a fully
 * static page with no backend of its own) and OpenRouteService. It exists
 * for exactly one reason: calling ORS straight from the browser would put
 * the ORS API key in the page's own JS, where anyone could copy it and
 * burn the free 2,500-req/day quota. This Worker holds the key
 * server-side (as an encrypted secret, never in this file) and forwards
 * three kinds of request:
 *
 *   1. Driving time/distance/route (GOLF-45/GOLF-50, default — no "mode"
 *      field needed):
 *      POST {origin:[lng,lat], destination:[lng,lat]}
 *      -> {minutes, miles, route: [[lat,lng],...] | null}
 *
 *   2. Nearby points of interest (GOLF-46):
 *      POST {mode:'pois', point:[lng,lat], radius?:metres, categories?:[id,...]}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 *   3. Place search / geocoding (GOLF-56 — start/free/end day locations):
 *      POST {mode:'geocode', text:'Newquay'}
 *      -> {results:[{label, lat, lng}, ...]}
 *
 *   4. Heritage points of interest — castles, distilleries, historic
 *      sites (GOLF-79 — a thematic sibling of mode:'pois' above, sourced
 *      from OpenStreetMap's Overpass API instead of ORS since Overpass
 *      already indexes exactly these tags for free, no key needed):
 *      POST {mode:'heritage-pois', point:[lng,lat], radius?:metres}
 *      -> {pois:[{name, category, lat, lng}, ...]}
 *
 * No database, no state, no logging of requests beyond Cloudflare's own
 * standard request logs — a pure pass-through either way.
 *
 * --- Deploy steps (Cloudflare dashboard, no CLI needed) ---
 * 1. dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker.
 * 2. Give it any name (e.g. "golf-map-ors-proxy") -> Deploy the default
 *    starter, then click "Edit code".
 * 3. Delete the starter code and paste in this entire file. Save/Deploy.
 * 4. Worker -> Settings -> Variables and Secrets -> Add:
 *      Name:  ORS_API_KEY
 *      Value: <your OpenRouteService API key>
 *      Type:  Secret (encrypted) — NOT a plain-text variable.
 *    Save/Deploy again so the Worker picks it up.
 * 5. Copy the Worker's *.workers.dev URL (shown on the Worker's overview
 *    page) and send it back — it goes into ORS_PROXY_URL in
 *    london-golf-map-v5_1.html, nothing else needs to change on your end.
 *    (If you're re-pasting this file to add GOLF-46 support to an
 *    already-deployed Worker, no new secret or URL change is needed —
 *    ORS_API_KEY and the Worker's URL both stay exactly as they are.)
 */

// GOLF-50: the /geojson variant returns the actual route geometry
// alongside the same duration/distance summary the plain endpoint gives —
// no extra request, no extra cost, just a different response shape.
const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const ORS_POIS_URL = 'https://api.openrouteservice.org/pois';
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/autocomplete';
// GOLF-79: Overpass, not ORS — a free, no-key OpenStreetMap query service.
// overpass-api.de is the most widely used public instance, but every call
// to it from *inside this Worker* consistently 521'd across two separate
// redeploys (dozens of tries), while the identical request succeeded every
// single time run directly from a plain machine — this looks like
// overpass-api.de blocking/rejecting Cloudflare's shared Worker egress IP
// ranges specifically, not a transient outage. overpass.osm.ch was tried
// as a straight swap but returned an empty result for a real,
// confirmed-present distillery and a malformed status timestamp — stale/
// broken data, worse than unreachable. maps.mail.ru's Overpass mirror
// tested with fresh, correct data matching overpass-api.de's own result
// for the same query. Rather than gamble on one single mirror being
// reachable from Workers, handleHeritagePois() below tries this ordered
// list and falls through to the next entry on any failure — one redeploy
// away from resilience instead of another round of guess-and-redeploy.
const OVERPASS_URLS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
// A leg between two golf courses rarely needs more than a couple hundred
// points to look like a real road at map zoom levels — cap it so the
// response (and what ends up cached in localStorage) stays small.
const ROUTE_MAX_POINTS = 150;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'invalid JSON body' }, 400);
    }

    if (!env.ORS_API_KEY) {
      return json({ error: 'ORS_API_KEY secret is not configured on this Worker' }, 500);
    }

    if (body && body.mode === 'pois') {
      return handlePois(body, env);
    }
    if (body && body.mode === 'geocode') {
      return handleGeocode(body, env);
    }
    if (body && body.mode === 'heritage-pois') {
      // Overpass needs no ORS_API_KEY at all — but the guard above already
      // 500'd if it's missing, so this mode is only reachable on a Worker
      // that's otherwise correctly configured. Fine: it costs nothing to
      // require the same setup as every other mode, and avoids a second,
      // differently-gated code path.
      return handleHeritagePois(body);
    }
    return handleRoute(body, env);
  },
};

async function handleRoute(body, env) {
  const { origin, destination } = body || {};
  if (!isCoord(origin) || !isCoord(destination)) {
    return json({ error: 'origin and destination must both be [lng, lat] number pairs' }, 400);
  }

  let orsRes;
  try {
    orsRes = await fetch(ORS_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coordinates: [origin, destination] }),
    });
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502);
  }

  if (!orsRes.ok) {
    // Common cases: 403 bad/expired key, 429 quota exceeded, 404 no
    // route found between the two points. Pass the status through
    // untranslated so the caller can decide how to fall back.
    return json({ error: 'ORS request failed', status: orsRes.status }, 502);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502);
  }

  // GOLF-50: the /geojson endpoint wraps the route in a FeatureCollection
  // instead of the plain endpoint's { routes: [...] } shape.
  const feature = data && Array.isArray(data.features) && data.features[0];
  const summary = feature && feature.properties && feature.properties.summary;
  if (!summary) {
    return json({ error: 'no route found' }, 502);
  }

  const coords = feature.geometry && feature.geometry.type === 'LineString' ? feature.geometry.coordinates : null;
  return json({
    minutes: summary.duration / 60,
    miles: summary.distance / 1609.344,
    // [lat, lng] pairs (flipped from GeoJSON's [lng, lat]) so the client
    // can feed this straight to Leaflet without any conversion.
    route: coords ? simplifyRoute(coords.map((c) => [c[1], c[0]])) : null,
  });
}

function simplifyRoute(points) {
  if (points.length <= ROUTE_MAX_POINTS) return points;
  const step = points.length / ROUTE_MAX_POINTS;
  const out = [];
  for (let i = 0; i < ROUTE_MAX_POINTS; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

async function handlePois(body, env) {
  const { point } = body || {};
  if (!isCoord(point)) {
    return json({ error: 'point must be a [lng, lat] number pair' }, 400);
  }
  // Clamp the buffer so a bad client value can't turn into a huge/slow
  // ORS query — 200m to 5km, defaulting to 1.5km (a sensible "near this
  // overnight stop" radius for food/fuel/accommodation).
  const rawRadius = typeof body.radius === 'number' ? body.radius : 1500;
  const radius = Math.min(5000, Math.max(200, rawRadius));

  const orsBody = {
    request: 'pois',
    geometry: {
      geojson: { type: 'Point', coordinates: point },
      buffer: radius,
    },
    limit: 30,
  };
  if (Array.isArray(body.categories) && body.categories.length) {
    // ORS caps category_ids at 5 entries per request (confirmed against
    // the live API — a 6th causes a 400) — defensively cap here too so a
    // future client-side change can't silently start 400ing.
    orsBody.filters = { category_ids: body.categories.slice(0, 5) };
  }

  let orsRes;
  try {
    orsRes = await fetch(ORS_POIS_URL, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orsBody),
    });
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502);
  }

  if (!orsRes.ok) {
    return json({ error: 'ORS request failed', status: orsRes.status }, 502);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502);
  }

  const features = Array.isArray(data && data.features) ? data.features : [];
  const pois = features
    .map((f) => {
      const props = (f && f.properties) || {};
      const osm = props.osm_tags || {};
      const coords = f && f.geometry && f.geometry.coordinates;
      // ORS's category_ids on a feature is keyed by id -> {category_name,...};
      // just take whichever comes first for a simple one-line label.
      const catEntry = props.category_ids && Object.values(props.category_ids)[0];
      return {
        name: osm.name || osm.brand || 'Unnamed',
        category: (catEntry && catEntry.category_name) || null,
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      };
    })
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');

  return json({ pois });
}

// GOLF-79: castles, distilleries, and a small curated set of other
// historic/tourism points near a given spot — a thematic sibling of
// handlePois() above (fuel/food/lodging), sourced from Overpass instead of
// ORS since Overpass already tags exactly these things for free.
async function handleHeritagePois(body) {
  const { point } = body || {};
  if (!isCoord(point)) {
    return json({ error: 'point must be a [lng, lat] number pair' }, 400);
  }
  // Same clamp policy as handlePois(): 200m to 5km, defaulting to 3km — a
  // castle or distillery is worth a slightly wider net than "food near
  // tonight's stop" since these are detour-worthy, not walk-to.
  const rawRadius = typeof body.radius === 'number' ? body.radius : 3000;
  const radius = Math.min(5000, Math.max(200, rawRadius));
  const [lng, lat] = point;

  // 2026-09-02 redesign: dropped the fixed 6-tag category whitelist in
  // favour of a notability-driven query — anything OSM contributors
  // thought worth linking to Wikipedia/Wikidata, rather than only the
  // handful of tags we happened to enumerate. `nwr(around:...)["wikipedia"]`
  // and `["wikidata"]` match on tag *presence* regardless of value (no `=`),
  // so this pulls in castles/distilleries/monuments/museums exactly as
  // before plus everything else with a real Wikipedia/Wikidata link
  // (historic houses, notable bridges, nature reserves, etc.) — the same
  // "worth a detour" bar, just sourced from notability instead of a
  // hand-picked tag list. `out center` collapses a way/relation to a
  // single representative point. Explicitly unnamed results are dropped
  // below in the response-shaping step, not here, since Overpass QL can't
  // easily express "has no name tag" as a query-time filter alongside this.
  const query = `
[out:json][timeout:20];
(
  nwr(around:${radius},${lat},${lng})["wikipedia"];
  nwr(around:${radius},${lat},${lng})["wikidata"];
);
out center 60;
`.trim();

  // Try each mirror in order, falling through to the next on any failure
  // (network error, non-OK status, or invalid JSON) — only the last
  // mirror's failure is actually reported back to the client.
  let data, lastError;
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    let opRes;
    try {
      opRes = await fetch(OVERPASS_URLS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
    } catch (e) {
      lastError = { error: 'could not reach Overpass', status: 502 };
      continue;
    }
    if (!opRes.ok) {
      // Overpass rate-limits under load (429) — the client-side cache
      // (GOLF-79 app code) is what keeps this on-demand rather than
      // hammered, but a transient failure here just surfaces as "nothing
      // found" to the visitor if every mirror is down, same as any other
      // POI fetch failure.
      lastError = { error: 'Overpass request failed', status: opRes.status };
      continue;
    }
    try {
      data = await opRes.json();
      lastError = null;
      break;
    } catch (e) {
      lastError = { error: 'Overpass returned invalid JSON', status: 502 };
    }
  }
  if (lastError) return json(lastError, 502);

  // Best-effort friendly label, still derived from whatever historic/
  // tourism/craft/etc. tags a result happens to carry — the tag list is no
  // longer the *filter* (wikipedia/wikidata presence is), but a result that
  // does carry one of these common tags still gets a nicer label than the
  // raw OSM value. Falls through to a generic "Heritage site" rather than
  // null for the (very common) case of a wiki-linked place with no tag in
  // this list — e.g. a historic house tagged `historic=yes`, a nature
  // reserve, a notable bridge.
  const CATEGORY_LABELS = {
    'historic=castle': 'Castle',
    'craft=distillery': 'Distillery',
    'tourism=viewpoint': 'Viewpoint',
    'historic=monument': 'Monument',
    'historic=ruins': 'Ruins',
    'tourism=museum': 'Museum',
    'historic=memorial': 'Memorial',
    'historic=archaeological_site': 'Archaeological site',
    'historic=manor': 'Manor house',
    'historic=church': 'Historic church',
    'amenity=place_of_worship': 'Place of worship',
    'tourism=attraction': 'Attraction',
    'tourism=artwork': 'Artwork',
    'leisure=nature_reserve': 'Nature reserve',
    'natural=peak': 'Peak',
  };
  function categoryFor(tags) {
    if (!tags) return 'Heritage site';
    for (const key in CATEGORY_LABELS) {
      const [k, v] = key.split('=');
      if (tags[k] === v) return CATEGORY_LABELS[key];
    }
    return 'Heritage site';
  }

  // 2026-09-02, tightened after two live sanity checks: wikipedia/wikidata
  // presence alone is a *notability* signal, not a *"this is a visitable
  // place"* signal — a live query near Craigellachie also returned named
  // rivers, roads and rail lines, and a live query in central Johannesburg
  // returned dozens of tagged suburbs, railway stations, schools,
  // government offices and courthouses (South Africa's OSM data has a
  // dense "sagns" import that wikidata-tags administrative places and
  // civic buildings, not just tourist attractions — confirmed by
  // inspecting real API output, not assumed). Notability alone can't tell
  // "Aberlour Distillery" from "Constitutional Court of South Africa" —
  // both are real, wiki-linked, named places. The fix is to combine the
  // wiki-notability query above (for recall — it catches anything
  // deemed notable, not just our 6 old guessed tags) with a second,
  // category-based filter here (for precision): keep a result only if it
  // ALSO carries a tag family that actually describes a visitable
  // place — tourism/historic/craft(distillery-family)/certain natural
  // features/nature reserves/lighthouses/places of worship — which
  // structurally excludes railway stations, roads, rivers, suburbs,
  // squares, schools, universities, offices, government buildings and
  // courthouses regardless of how well-linked their Wikipedia article is.
  const TOURISM_EXCLUDE = new Set(['hotel', 'guest_house', 'hostel', 'motel', 'camp_site', 'caravan_site', 'information']);
  const CRAFT_INCLUDE = new Set(['distillery', 'brewery', 'winery']);
  const NATURAL_INCLUDE = new Set(['peak', 'waterfall', 'cave_entrance', 'cliff', 'arch']);
  function isVisitablePlace(tags) {
    if (tags.tourism && !TOURISM_EXCLUDE.has(tags.tourism)) return true;
    if (tags.historic) return true;
    if (tags.craft && CRAFT_INCLUDE.has(tags.craft)) return true;
    if (tags.natural && NATURAL_INCLUDE.has(tags.natural)) return true;
    if (tags.leisure === 'nature_reserve') return true;
    if (tags.man_made === 'lighthouse') return true;
    if (tags.amenity === 'place_of_worship') return true;
    return false;
  }

  const elements = Array.isArray(data && data.elements) ? data.elements : [];
  const pois = elements
    .filter((el) => isVisitablePlace(el.tags || {}))
    .map((el) => {
      const tags = el.tags || {};
      // A node has lat/lon directly; a way/relation only has them via
      // `out center`'s synthesized `center` field.
      const elLat = typeof el.lat === 'number' ? el.lat : el.center && el.center.lat;
      const elLng = typeof el.lon === 'number' ? el.lon : el.center && el.center.lon;
      return {
        name: tags.name || null,
        category: categoryFor(tags),
        wikipedia: tags.wikipedia || null,
        lat: typeof elLat === 'number' ? elLat : null,
        lng: typeof elLng === 'number' ? elLng : null,
      };
    })
    // 2026-09-02: drop unnamed results — a bare "Heritage site" pin with no
    // name is noise, not a detour-worthy suggestion (stakeholder request).
    .filter((p) => p.name && typeof p.lat === 'number' && typeof p.lng === 'number')
    .slice(0, 40);

  return json({ pois });
}

// GOLF-56: place search for start/free/end day locations. ORS's geocoder
// takes its key as a query param (not the Authorization header the
// directions/POI endpoints use — a real, confirmed difference between
// those two parts of the ORS API, not an oversight). Boundary was fixed to
// GBR only, which silently broke South Africa (and Ireland) city search
// once GOLF-77/78 added those nations' courses — a bare "Newquay" still
// shouldn't have to compete with a same-named place abroad, but the
// boundary now needs to cover every nation this app has course data for,
// not just the original one. Update this list whenever a new nation's
// course data ships.
const GEOCODE_COUNTRIES = 'GBR,IRL,ZAF';
async function handleGeocode(body, env) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return json({ results: [] });
  }

  const url = new URL(ORS_GEOCODE_URL);
  url.searchParams.set('api_key', env.ORS_API_KEY);
  url.searchParams.set('text', text.slice(0, 200));
  url.searchParams.set('boundary.country', GEOCODE_COUNTRIES);
  url.searchParams.set('size', '6');

  let orsRes;
  try {
    orsRes = await fetch(url.toString());
  } catch (e) {
    return json({ error: 'could not reach OpenRouteService' }, 502);
  }

  if (!orsRes.ok) {
    return json({ error: 'ORS request failed', status: orsRes.status }, 502);
  }

  let data;
  try {
    data = await orsRes.json();
  } catch (e) {
    return json({ error: 'ORS returned invalid JSON' }, 502);
  }

  const features = Array.isArray(data && data.features) ? data.features : [];
  const results = features
    .map((f) => {
      const props = (f && f.properties) || {};
      const coords = f && f.geometry && f.geometry.coordinates;
      return {
        label: props.label || props.name || 'Unknown place',
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      };
    })
    .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number');

  return json({ results });
}

function isCoord(v) {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    // The app is a public static page with no login/session, so an open
    // CORS policy here doesn't expose anything sensitive — the only thing
    // this Worker guards is the ORS key, which never leaves the server.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
