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

**It deploys from git — as of 2026-09-20 this actually works** (GOLF-55,
finished off under GOLF-164). Cloudflare Workers Builds is connected to
`stefand94/golf-map`; a push to `main` that touches `ors-proxy.js`
redeploys the Worker with no dashboard paste, no GitHub Actions file and
no API token to manage.

Current settings, for reference if it ever needs rebuilding:

- **Root directory: empty.** Not `scripts/cloudflare-worker`, despite what
  this file and the Worker's own header comment used to say. Workers
  Builds runs from the repo root, so the root `wrangler.jsonc` is the
  config that matters; it points `main` at
  `scripts/cloudflare-worker/ors-proxy.js`.
- **Production branch: `main`.** This is the setting that was wrong, and
  it is the first thing to check if pushes stop deploying — see below.
- `scripts/cloudflare-worker/wrangler.toml` is kept for local/manual
  `wrangler` runs from inside this folder. Both files name the same
  Worker (`geofftheworker`) and the same entry file; if you ever rename
  the Worker, both must change or Cloudflare will create a *new* Worker
  with a new URL and no `ORS_API_KEY`.
- `ORS_API_KEY` (and the Google key) are untouched by any of this. They
  are dashboard secrets, never read from or written to git.

**The failure mode this had for weeks, because it is silent and will look
like success if it recurs:** the build was running a *version upload*
rather than a deploy. Every push produced a green "Workers Builds" check
on GitHub and a new version in Cloudflare, and production kept serving the
old code. Nothing anywhere said "not deployed". It was only visible once
GOLF-164 put a content hash in a response header. The tell in the build
output is a branch-named preview alias
(`main-geofftheworker.stefand94.workers.dev`) and no deployment line —
that means Cloudflare ran the *Version* command, which it does for any
branch it does not consider production.

Verify a deploy — always, and never trust the green check on its own:

```bash
curl -sI https://api.golftripper.uk/ | grep -i x-worker-build
python3 scripts/update_worker_build.py --print
```

Same value → live. Different → not live yet, regardless of what the build
status says.

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
