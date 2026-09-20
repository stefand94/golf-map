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

- **Production**: pushes to `main` deploy to the project's production URL
  (custom domain, once set, or `<project-name>.pages.dev`).
- **Preview**: pushes to *any other branch* automatically get their own
  preview URL, `<branch-name>.<project-name>.pages.dev` — no per-branch
  configuration needed. This is the "dev link" — use it to view/share a
  feature branch's state before merging to `main`, instead of relying on
  a local preview only you can see.

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
(`https://golf-map.pages.dev`, or the custom domain once Phase B lands)
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
`golf-map.pages.dev`, any `*.golf-map.pages.dev` preview subdomain, and
`localhost`/`127.0.0.1` for local dev. Anything else gets
`Access-Control-Allow-Origin: null`. Adding the future custom domain
(Phase B) is a one-line addition to `ALLOWED_ORIGINS`. Rate limiting
(Phase B / GOLF-102 Part 2) is a separate, not-yet-built piece — CORS
alone only stops *browser* calls from other pages, not a direct
script/curl request (which carries no `Origin` header at all).

## The ORS proxy Worker (separate deployment)

The OpenRouteService proxy (`scripts/cloudflare-worker/ors-proxy.js`) is a
**separate** Cloudflare Worker, not part of the Pages deployment above —
see `scripts/cloudflare-worker/README.md` for its own deploy steps. It has
its own URL (`ORS_PROXY_URL` in the app) and its own `ORS_API_KEY` secret;
redeploying the Pages site does not touch it, and vice versa.

**When redeploying the Worker, never paste over its secrets.** `ORS_API_KEY`
(and any Google key) are set separately as Worker variables — this file does
not contain them and pasting the source over a running Worker doesn't touch
them, but re-entering them by hand is how one gets clobbered.

### Checking whether a Worker change is actually live (GOLF-164)

A Worker change that only touches logging or an error path is externally
indistinguishable from the old code — a 200 means nothing either way. Since
GOLF-164 every response carries the source's content hash:

```bash
curl -sI https://geofftheworker.stefand94.workers.dev/ | grep -i x-worker-build
python3 scripts/update_worker_build.py --print
```

Same value → the deployed Worker is this source. Different → the redeploy
hasn't landed. A HEAD request lands on the 405 path, so this costs no ORS
quota. `.githooks/pre-push` keeps the stamp current automatically.

This is also how to settle the standing contradiction about this Worker: its
own header comment says it auto-deploys via Cloudflare's Git integration,
while the project notes say a push does not deploy it and it needs a manual
redeploy. Push a Worker change, wait, and curl — whichever it is, the header
will say so.

## GitHub Pages (legacy, may still be live)

The site was previously hosted on GitHub Pages, auto-deployed from `main`'s
root with no build step — the same zero-config static-hosting model
Cloudflare Pages now provides, kept live in parallel initially rather than
torn down same-day as the Cloudflare cutover. Once the Cloudflare Pages
production URL is confirmed working, this becomes the canonical link;
GitHub Pages can be decommissioned in the repo settings whenever convenient.
