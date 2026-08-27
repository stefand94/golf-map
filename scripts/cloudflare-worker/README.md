# ORS driving-time proxy (GOLF-45)

`ors-proxy.js` is a small stateless Cloudflare Worker that sits between
the golf map and OpenRouteService, so the ORS API key never has to ship
in the page's own JavaScript. It's the **only** server-side piece of
infrastructure this app has — everything else is static files.

## What it does

Takes `POST {origin:[lng,lat], destination:[lng,lat]}`, calls ORS's
driving-directions API with the key held as a Worker secret, and returns
`{minutes, miles}`. No database, no state, no per-visitor data — a pure
pass-through that exists solely to keep the key off the client.

## Deploying it

See the comment block at the top of `ors-proxy.js` for the exact
dashboard steps (create Worker → paste this file's contents → add
`ORS_API_KEY` as an encrypted secret → deploy → copy the `*.workers.dev`
URL). No `wrangler` CLI needed — the dashboard's built-in editor is
enough for a Worker this small.

## Wiring it into the app

Once deployed, set `ORS_PROXY_URL` in `london-golf-map-v5_1.html` to the
Worker's URL (currently `''`, which makes every GOLF-45 code path return
`null` and fall back to GOLF-43's straight-line heuristic — safe to leave
unset indefinitely). That's the only app-side change needed; everything
else (caching, fallback, re-render on load) is already wired up.

## Refreshing the key

If the ORS key ever needs rotating, update the `ORS_API_KEY` secret in
the Worker's dashboard settings — no code change, no redeploy of the
main app.
