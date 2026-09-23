# Deploying

This is a fully static site — no build step, no server-side rendering,
no npm/build tooling. Everything the browser needs is `london-golf-map-v5_1.html`,
`data/*.js`, `js/*.js`, and whatever assets they reference.

## Cloudflare Pages (dev + prod)

Hosted via **Cloudflare Pages**, connected directly to this GitHub repo
(`stefand94/golf-map`). One-time setup (done via the Cloudflare dashboard,
not repeatable from a script — see GOLF-80):

- Dashboard → Workers & Pages → Create application → Pages → Connect to Git
- Repo: `stefand94/golf-map`
- Production branch: `main`
- Build command: *(none — leave blank)*
- Build output directory: `/`

Once connected, Cloudflare deploys automatically on every push:

- **Production**: pushes to `main` deploy to **`https://golftripper.uk`**
  (GOLF-35 Phase B, custom domain on the `golf-map` Pages project).
  `functions/_middleware.js` 301s the bare `golf-map.pages.dev` and
  `www.golftripper.uk` to the same path on golftripper.uk. Browsers carry a
  `#share=` hash across a redirect, so old share links still open the same
  trip. A returning visitor's old service worker on pages.dev doesn't get
  in the way: navigations are network-first (GOLF-122), so one reload lands
  them on golftripper.uk. Trips saved on pages.dev stay there; the new
  domain starts empty (DEC-011).
- **Preview**: pushes to *any other branch* automatically get their own
  preview URL, `<branch-name>.<project-name>.pages.dev` — no per-branch
  configuration needed. This is the "dev link" — use it to view/share a
  feature branch's state before merging to `main`, instead of relying on
  a local preview only you can see. Previews are **not** redirected to
  golftripper.uk; only the bare `golf-map.pages.dev` host is.

Branch names with characters Cloudflare doesn't allow in a subdomain
(e.g. slashes) get a sanitized/truncated preview subdomain instead of the
literal branch name — check the deployment's own listing in the dashboard
if a predicted URL 404s.

## Dev-instance password gate (Preview only, GOLF-35 Phase A) — currently unused

`functions/_middleware.js` gates every request behind HTTP Basic Auth
(`dev` / the password) whenever `env.DEV_PASSWORD` is set — and does
nothing at all when it isn't. This is a Cloudflare Pages **environment
variable**, scoped per-environment:

- Dashboard → Workers & Pages → **golf-map** project → **Settings** →
  **Environment variables** ("Variables and Secrets").
- Add `DEV_PASSWORD`, scoped to **Preview only** — do **not** tick
  Production.

Because the scoping is per-environment, this single middleware file is
what makes every preview URL (`<branch>.golf-map.pages.dev`) require the
password while the production URL (`main`'s deploy) never prompts for
one. The password is never committed to the repo.

**Decided 2026-09-13 (GOLF-129):** `DEV_PASSWORD` is deliberately left
unset for the current beta — the tester group is small and contacted
directly, so link-only + `noindex` (below) is judged sufficient without
the extra friction of a password. Testers get the **production URL**
(`https://golftripper.uk`)
directly — it's static, so there's no new link to send on every deploy.
The gate code stays in the repo, harmless while dormant, for whenever a
future preview/beta actually wants it.

Both production and preview also carry a blanket `X-Robots-Tag:
noindex, nofollow` (`_headers`) and `robots.txt` `Disallow: /` — the
whole site is link-only, independent of whether the password gate is
ever turned on.

## Worker CORS allowlist (GOLF-102 Part 1)

`scripts/cloudflare-worker/ors-proxy.js`'s `ALLOWED_ORIGINS` /
`ALLOWED_ORIGIN_SUFFIX` constants (near the top of the file) list which
origins the Worker will answer a browser request from:
`golftripper.uk` and `www.golftripper.uk`, `golf-map.pages.dev`, any
`*.golf-map.pages.dev` preview subdomain (previews still call the Worker),
and `localhost`/`127.0.0.1` for local dev. Anything else gets
`Access-Control-Allow-Origin: null`. CORS alone only stops *browser* calls
from other pages, not a direct script/curl request (which carries no
`Origin` header at all) — that is what the rate limit below is for.

Every response also carries `Access-Control-Max-Age: 7200` (Chrome's cap),
so a browser sends one preflight per two hours instead of one per POST.
Without it, each call counted twice against the rate limit.

## Worker rate limit (GOLF-102 Part 2)

One Cloudflare **rate-limiting rule** on the golftripper.uk zone
(Security → WAF → Rate limiting rules), free-plan shape:

| Setting | Value |
| --- | --- |
| Matches | `http.host eq "api.golftripper.uk"` |
| Counted by | IP address |
| Threshold | **100 requests per 10 seconds** |
| Action | Block, for 10 seconds |

**How 100 was chosen** (measured 2026-09-23, localhost against the live
Worker): a fresh 10-day trip, 2 rounds plus a hotel a day, with an empty
cache (the same as opening a share link on a new device), fires **28 route
calls in 0.07 s**. That is the peak. Heavy editing straight after (3 day
moves, 4 hotel searches, 8 per-keystroke place searches) added 18 calls
over about 15 s. Heritage stops make no Worker calls since GOLF-148. With
Max-Age, the peak is about 30 requests. A 14-day, 4-stops-a-day trip is
about 57. Three people opening one share link behind a single hotel Wi-Fi
IP is about 90. So 100 is roughly 3x a real peak. If someone does hit it,
the affected legs show the dotted straight-line fallback and retry after
10 minutes (`ORS_FAIL_RETRY_MS`); nothing breaks.

**What it doesn't do:** it stops floods, not a slow drip. 100 per 10 s
still allows far more per day than the ORS free quota, so a patient abuser
could drain the quota without ever tripping it. Logged under R-7 in
`docs/project/RISKS.md`.

The rule only guards `api.golftripper.uk`, so the Worker's other public
addresses (`geofftheworker.stefand94.workers.dev` and the per-version
preview URLs) are switched off in `wrangler.jsonc` (`workers_dev` /
`preview_urls`). This lives in the config file, not just the dashboard,
because every git deploy re-applies the file.

## The ORS proxy Worker (separate deployment)

The OpenRouteService proxy (`scripts/cloudflare-worker/ors-proxy.js`) is a
**separate** Cloudflare Worker, not part of the Pages deployment above —
see `scripts/cloudflare-worker/README.md` for its own deploy steps. It has
its own URL (`ORS_PROXY_URL` in the app) and its own `ORS_API_KEY` secret;
redeploying the Pages site does not touch it, and vice versa.

**It deploys from git (since 2026-09-20).** Cloudflare Workers Builds is
connected to the GitHub repo, and a push to `main` that touches
`ors-proxy.js` now goes live on its own — no dashboard paste. Verified by
the `X-Worker-Build` header moving unaided on commit `06df67a`. The only
reasons left to open the dashboard are changing a secret, or a build that
failed.

Before that date it was connected but **built without deploying**: the
Worker's build ran the Version command (a `wrangler versions upload`) for
every push, which uploads a version and leaves production untouched. Three
consecutive green builds shipped nothing, and production served
pre-GOLF-164 code while GitHub showed ✅ on every commit. The tell in the
build output was a branch-named preview alias
(`main-geofftheworker.stefand94.workers.dev`) and no deployment. If the
header ever stops moving again, that is the first thing to check: Worker →
Settings → Builds → Branch control → **Production branch** must be `main`,
or the Deploy command never runs.

**When redeploying the Worker, never paste over its secrets.** `ORS_API_KEY`
(and any Google key) are set separately as Worker variables — this file does
not contain them and pasting the source over a running Worker doesn't touch
them, but re-entering them by hand is how one gets clobbered.

### Checking whether a Worker change is actually live (GOLF-164)

A Worker change that only touches logging or an error path is externally
indistinguishable from the old code — a 200 means nothing either way. Since
GOLF-164 every response carries the source's content hash:

```bash
curl -sI https://api.golftripper.uk/ | grep -i x-worker-build
python3 scripts/update_worker_build.py --print
```

Same value → the deployed Worker is this source. Different → the redeploy
hasn't landed. A HEAD request lands on the 405 path, so this costs no ORS
quota. `.githooks/pre-push` keeps the stamp current automatically.

**This is still worth running after a Worker push even though deploys are
automatic now** — automatic is not the same as verified, and the whole
reason the versions-upload bug survived three pushes is that a green check
was taken as proof. The header is the proof; the check is not.

This also settled the standing contradiction about this Worker. Its own
header comment claimed Git auto-deploy while the project notes said it
needed a manual redeploy, and **both were describing the same broken
setup**: connected to git, building on every push, never promoting. Neither
note was wrong about what it observed.

## GitHub Pages (decommissioned 2026-09-20)

The site was previously hosted on GitHub Pages, auto-deployed from `main`'s
root with no build step — the same zero-config static-hosting model
Cloudflare Pages now provides, kept live in parallel rather than torn down
same-day as the Cloudflare cutover. DEC-006 retired it, but only in the
sense that the repo stopped carrying a workflow or CNAME for it; **the
GitHub setting itself stayed on for another three weeks** and kept
publishing every push to `main` at `stefand94.github.io/golf-map/`, a
second live copy of the app calling the same Worker.

Turned off in the repo settings on 2026-09-20 (`gh api -X DELETE
repos/stefand94/golf-map/pages`); the URL now 404s and the
`pages-build-deployment` workflow no longer runs. Cloudflare Pages is the
only host. Worth remembering as a general lesson: retiring a host in the
repo is not the same as retiring it at the provider, and nothing in the
repo would ever have told us.
