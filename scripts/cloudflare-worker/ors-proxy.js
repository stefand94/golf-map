/**
 * GOLF-45 — ORS driving-time proxy.
 *
 * A stateless Cloudflare Worker that stands between the golf map (a fully
 * static page with no backend of its own) and OpenRouteService's driving
 * directions API. It exists for exactly one reason: calling ORS straight
 * from the browser would put the ORS API key in the page's own JS, where
 * anyone could copy it and burn the free 2,500-req/day quota. This Worker
 * holds the key server-side (as an encrypted secret, never in this file)
 * and forwards only {origin, destination} -> {minutes, miles}.
 *
 * No database, no state, no logging of requests beyond Cloudflare's own
 * standard request logs — a pure pass-through.
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
 */

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

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

    const { origin, destination } = body || {};
    if (!isCoord(origin) || !isCoord(destination)) {
      return json({ error: 'origin and destination must both be [lng, lat] number pairs' }, 400);
    }

    if (!env.ORS_API_KEY) {
      return json({ error: 'ORS_API_KEY secret is not configured on this Worker' }, 500);
    }

    let orsRes;
    try {
      orsRes = await fetch(ORS_URL, {
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

    const summary = data && data.routes && data.routes[0] && data.routes[0].summary;
    if (!summary) {
      return json({ error: 'no route found' }, 502);
    }

    return json({
      minutes: summary.duration / 60,
      miles: summary.distance / 1609.344,
    });
  },
};

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
