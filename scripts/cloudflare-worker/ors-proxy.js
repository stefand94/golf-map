/**
 * GOLF-45 / GOLF-46 / GOLF-50 — ORS driving-time + route + POI proxy.
 *
 * A stateless Cloudflare Worker that stands between the golf map (a fully
 * static page with no backend of its own) and OpenRouteService. It exists
 * for exactly one reason: calling ORS straight from the browser would put
 * the ORS API key in the page's own JS, where anyone could copy it and
 * burn the free 2,500-req/day quota. This Worker holds the key
 * server-side (as an encrypted secret, never in this file) and forwards
 * two kinds of request:
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
