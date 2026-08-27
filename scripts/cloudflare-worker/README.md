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

**One-time manual setup** (if you haven't deployed this Worker yet): see
the comment block at the top of `ors-proxy.js` for the exact dashboard
steps (create Worker → paste this file's contents → add `ORS_API_KEY` as
an encrypted secret → deploy → copy the `*.workers.dev` URL). No
`wrangler` CLI needed — the dashboard's built-in editor is enough for a
Worker this small.

**After that, auto-deploy from GitHub instead of copy-pasting** (GOLF-55):
Cloudflare can redeploy this Worker automatically every time `ors-proxy.js`
changes on `main`, via its native "Connect to Git" build integration —
no GitHub Actions file, no API token to manage.

1. In the Cloudflare dashboard, open your existing Worker (the one
   already running — check its name at the top of its overview page).
2. **Before connecting**, open `wrangler.toml` in this folder and make
   sure `name` matches that Worker's name exactly. If it doesn't,
   Cloudflare will create a brand-new Worker (new URL, no `ORS_API_KEY`
   secret) instead of taking over deploys for the existing one — update
   the file and push it first if needed.
3. Worker → Settings → Build → **Connect to Git** → authorize Cloudflare
   against the `stefand94/golf-map` GitHub repo → branch `main` → set the
   build's root directory to `scripts/cloudflare-worker`.
4. Save. Cloudflare deploys once immediately to confirm the connection,
   then again automatically on every future push that touches this
   folder.
5. `ORS_API_KEY` is untouched by any of this — it stays exactly as it is,
   a secret set in the dashboard, never read from or written to Git.

Verify: change something trivial-but-visible in `ors-proxy.js` (e.g. a
comment), push, and confirm the Worker's dashboard shows a fresh
deployment without you touching the editor.

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
