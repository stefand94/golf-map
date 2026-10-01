# ORS driving-time proxy (GOLF-45)

`ors-proxy.js` is a small stateless Cloudflare Worker that sits between
the golf map and OpenRouteService, so the ORS API key never has to ship
in the page's own JavaScript. It's the **only** server-side piece of
infrastructure this app has — everything else is static files.

## What it does

Takes `POST {origin:[lng,lat], destination:[lng,lat]}`, calls ORS's
driving-directions API with the key held as a Worker secret, and returns
`{minutes, miles}`. Otherwise a pass-through that exists to keep the key
off the client, with one piece of state: GOLF-223's daily lookup cap.

## Daily lookup cap (GOLF-223)

ORS calls (directions and geocoding) are counted per UTC day in a
SQLite-backed Durable Object, `LookupQuota`, declared in the root
`wrangler.jsonc`. Limits live in `QUOTA_LIMITS` in `ors-proxy.js`:
per visitor (IP, or IPv6 /64) and for the whole site, just under ORS's
daily quota. Over either, the Worker answers **429** with
`{error, limit:'visitor'|'site', kind, resets}` and a `Retry-After`, and
makes no ORS call. Visitors are stored only as a hash with a random
per-day salt, and each day's rows are deleted the next day. Overpass
hotel modes are not counted.

## Health check and outage alert (GOLF-229)

`GET https://api.golftripper.uk/health` makes one small real call to each
upstream, through the same code visitors use: a St Andrews to Carnoustie
route, a "St Andrews" place search, and hotels near the Old Course
(Overpass). It answers **200** `{status:'ok'}` or **503**
`{status:'failing', failing:[...]}`, with each part's error and the
redacted upstream reason under `checks`. `HEAD` gives the same status.

- **Cost:** the result is cached for 30 minutes in the `LookupQuota`
  Durable Object, so there are at most 48 runs a day however often anyone
  hits it: 2.4% of the directions quota and 4.8% of geocoding. Probes
  don't count against the GOLF-223 per-visitor or site counters.
- **Hotels (Overpass)** only count as failing after two runs in a row. One
  miss shows under `warnings` with a 200, because public Overpass 504s
  under load and a one-off would be a false alarm. Routes and place search
  fail on the first miss.
- **`/health/test-alert`** always answers 503 and calls nothing. Use it to
  prove the alert email arrives.

Local testing: `wrangler dev --local-upstream localhost:<port>` with
`--var TEST_URL_DIRECTIONS:…`, `TEST_URL_GEOCODE:…`, `TEST_URL_OVERPASS:…`
pointing an upstream at a mock or a dead host, and
`TEST_HEALTH_TTL_MS` to shorten the cache. These are honoured only for a
request to localhost, so they can never redirect production (or its key).

### Monitor setup (Stefan, once)

UptimeRobot's free plan (non-commercial use; 5-minute minimum interval;
email alerts):

1. Sign up at uptimerobot.com with the address alerts should go to, and
   confirm the email.
2. **+ New monitor** → type **HTTP(s)**.
3. URL: `https://api.golftripper.uk/health`. Name: `Golf Tripper lookups`.
4. Interval: **15 minutes**. Polling faster than the 30-minute cache gains
   nothing; 15 means an outage is emailed within about 45 minutes.
5. Under alert contacts, tick your email. Create the monitor.
6. **Test alert:** edit the monitor, change the URL to
   `https://api.golftripper.uk/health/test-alert`, save. A "down" email
   arrives within one interval. Change the URL back to `/health` and you
   get an "up" email.

The alert email gives the status code only. Open `/health` in a browser
to see which part failed and why.

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
