# Implementation Task — GOLF-35 + GOLF-102

**Feature:** GOLF-35 — Production hosting consolidation + custom domain + hidden dev instance
**Feature:** GOLF-102 — Cloudflare Worker abuse hardening (CORS allowlist + rate limiting)

These two ship together but in **two phases**. Phase A needs no domain and
should land first. Phase B happens once the product owner has bought a
domain.

---

## Objective

1. Make **Cloudflare Pages** the single canonical host for the live site and
   retire GitHub Pages.
2. Put the live site on a **custom domain** the product owner buys.
3. Give the **preview/dev deployments** a shared-password gate so
   work-in-progress is never visible to the public.
4. Keep the live site **link-only** (not indexed by search engines) for now.
5. Harden the **ORS proxy Worker** against quota abuse: lock CORS to known
   origins, add rate limiting.

No secret is exposed today and none should become exposed. The only secret
in the system is `ORS_API_KEY`, held server-side as an encrypted Cloudflare
Worker secret. Do not move it, log it, echo it, or add it to any client
file.

---

## Context

- Fully static site, **no build step, no framework** (see `CLAUDE.md`).
  Ordered `<script src>` tags, globals not modules.
- Already auto-deploys to **both** GitHub Pages and Cloudflare Pages from
  `main`. Cloudflare Pages project is connected to `stefand94/golf-map`,
  production branch `main`, build command empty, output dir `/`. Any
  non-`main` branch already gets a preview URL
  `<branch>.<project>.pages.dev` (see `docs/deploying.md`).
- The **ORS proxy Worker** (`scripts/cloudflare-worker/ors-proxy.js`) is a
  *separate* Cloudflare Worker, Git-connected (build root
  `scripts/cloudflare-worker`), with its own `*.workers.dev` URL stored as
  `ORS_PROXY_URL` in `london-golf-map-v5_1.html`. Its CORS is currently
  `Access-Control-Allow-Origin: '*'` with no rate limiting.
- PWA: `manifest` + `sw.js` (service worker auto-bumps `CACHE_NAME`). See
  `docs/pwa.md`.

### Decisions already made (do not re-litigate — see `DECISIONS.md` DEC-006)

| Question | Decision |
| --- | --- |
| Canonical host | **Cloudflare Pages.** Retire GitHub Pages once the custom domain is confirmed stable. |
| Dev instance privacy | **Shared password** via a Pages Functions middleware, applied to **preview deployments only**. Not Cloudflare Access, not per-user. |
| Live site indexing | **Link-only.** Blanket `noindex` on every deployment for now. Reversible later. |
| Worker hardening | **Yes** — CORS allowlist now (Phase A), rate limiting once the Worker is on the custom domain (Phase B). |
| Domain registrar | TBC — product owner leaning Cloudflare Registrar. Handover assumes Cloudflare Registrar; if they buy elsewhere the only delta is a manual DNS step, called out in Phase B. |

---

## Phase A — ship now (no domain required)

### A1. Dev-instance password gate

Add `functions/_middleware.js` (this creates a Pages Functions dir — still
no build step; Cloudflare picks it up automatically):

- On every request, if `env.DEV_PASSWORD` is **not** set → `next()` (do
  nothing). This is the production case.
- If `env.DEV_PASSWORD` **is** set → require HTTP Basic Auth. Username
  `dev`, password `env.DEV_PASSWORD`. On mismatch/absence return `401` with
  `WWW-Authenticate: Basic realm="Golf Map dev"`. On match → `next()`.
- Use a constant-time-ish comparison; a plain `===` on the decoded password
  is acceptable here (low-value secret, not user data).

The product owner will set `DEV_PASSWORD` in the Pages project's
environment variables scoped to **Preview only** (task S3 below), so the gate
is automatically live on previews and absent on production. Do not hardcode
any password in the repo.

### A2. Keep everything link-only (noindex)

- Add `_headers` (Cloudflare Pages format) at repo root with:
  `X-Robots-Tag: noindex, nofollow` for `/*`.
- Add `robots.txt` at repo root: `User-agent: *` / `Disallow: /`.
- Both live and dev are link-only right now, so a blanket rule is correct.
  Leave a one-line comment in `_headers` noting this is intentionally
  blanket and how to make it per-environment later.

### A3. Lock Worker CORS to an allowlist (GOLF-102, part 1)

In `scripts/cloudflare-worker/ors-proxy.js`:

- Replace the static `corsHeaders()` with one that takes the `request`,
  reads the `Origin` header, and reflects it back **only if allowed**:
  - exact matches: the Cloudflare Pages production URL
    (`https://<project>.pages.dev` — confirm the exact project name from the
    dashboard/`docs/deploying.md`), and `http://localhost:<port>` /
    `http://127.0.0.1:<port>` for local dev.
  - suffix match: any `*.<project>.pages.dev` (preview deployments).
  - a placeholder line for the future custom domain, clearly marked
    `// Phase B: add the real domain here`.
- If the origin is not allowed, send `Access-Control-Allow-Origin: null`
  (do not send `*`).
- Thread `request` through to `corsHeaders()` everywhere it is called
  (`json()` helper, the `OPTIONS` early return).
- Add a short comment noting the known limitation: **CORS only blocks
  browser calls from other web pages; it does not stop a direct
  script/curl hit with no `Origin`.** That is what Phase B rate limiting
  covers.

Do not change any request/response body shape or the ORS/Overpass logic.

### A4. Make PWA / asset URLs origin-agnostic

- Grep `manifest` (`manifest.json` or inline), `sw.js`, and
  `london-golf-map-v5_1.html` for any hardcoded `https://…github.io`,
  `…pages.dev`, or other absolute-origin URLs in: `start_url`, `scope`,
  `id`, the service-worker precache list, canonical `<link>`, OG tags.
- Convert to **relative** (`./`, `/js/…`) wherever possible so the same
  files work on `pages.dev` and the future custom domain unchanged.
- If `start_url`/`scope` must be absolute, leave a `// Phase B` marker.

### A5. Remove GitHub-Pages-specific cruft

- If a `CNAME` file exists at repo root (GitHub Pages custom-domain marker),
  delete it — it will conflict with the Cloudflare setup. If none exists,
  note that in the PR description.
- Do **not** disable GitHub Pages in repo settings yet (that is a Phase B
  step for the product owner, after the domain is proven).

### A6. Verify Phase A

- `node scripts/test_data.js` and `node scripts/check_js.js` both pass.
- Push to a throwaway branch → confirm the preview URL prompts for Basic
  Auth once `DEV_PASSWORD` is set on Preview (coordinate with product owner
  on S3), and that an incorrect password is rejected.
- Confirm production (`main` deploy) does **not** prompt for a password.
- From the deployed app, confirm map routing / place search / hotels still
  work (Worker accepts the real origin).
- With `curl`, confirm the Worker returns
  `Access-Control-Allow-Origin: null` for
  `-H 'Origin: https://evil.example'` and reflects the real origin for an
  allowed one.
- View-source / DevTools: confirm no API key or secret anywhere in client
  payloads (there should be none today — this is a regression check).

---

## Phase B — after the product owner buys a domain

### B1. Add the custom domain to Cloudflare Pages

Product-owner tasks S1–S2 below cover the dashboard clicks. Coding-agent
side:

- Once `DOMAIN` is known, update the Worker CORS allowlist (A3) with
  `https://<domain>` and `https://www.<domain>`.
- Update any `// Phase B` markers left in `manifest`/`sw.js`/`_headers`.

### B2. Put the Worker on the custom domain + rate-limit it (GOLF-102, part 2)

- Give the Worker a route/custom domain, e.g. `api.<domain>` (product-owner
  task S4).
- Update `ORS_PROXY_URL` in `london-golf-map-v5_1.html` to the new
  `https://api.<domain>` URL. Keep the `*.workers.dev` URL working as a
  fallback if trivial; otherwise a clean switch is fine.
- Specify a **Cloudflare Rate Limiting rule** for the product owner to
  create (they click; you give exact values). Suggested starting point,
  tune after observing real traffic:
  - Match: requests to `api.<domain>/*`
  - Threshold: **> 30 requests per 60 seconds per client IP**
  - Action: block for 60 seconds (or managed challenge)
  - One rule fits the free-plan allowance.
- Note in `docs/deploying.md` that the rule exists and its values.

### B3. PWA finalisation

- Set `manifest` `start_url` / `scope` to the custom domain (or confirm
  relative values already work).
- Bump `sw.js` `CACHE_NAME` so returning visitors pick up any changed
  precache paths.
- Optional: leave a minimal "tombstone" service worker consideration noted
  for the old `pages.dev` origin — low priority, visitors will migrate via
  the new link.

### B4. Consolidate

- Update the canonical URL in `README`, `docs/deploying.md`,
  `docs/project/PROJECT.md` to the custom domain.
- After the domain is stable for a few days (product-owner judgement),
  product owner disables GitHub Pages (task S6). Then remove the
  "GitHub Pages (legacy)" section from `docs/deploying.md`.

### B5. Verify Phase B

- Custom domain serves the live site over HTTPS, no password prompt.
- `www.` redirects to apex (or vice versa — pick one, be consistent).
- App on the custom domain: routing / geocoding / hotels / heritage all
  work against `api.<domain>`.
- Rate limit rule triggers under a scripted burst and recovers after the
  block window.
- Lighthouse/PWA: installable, `noindex` still present.
- GitHub Pages URL either gone or clearly superseded.

---

## Acceptance Criteria

- [ ] Given a preview/branch deployment with `DEV_PASSWORD` set on Preview,
      when a visitor opens the URL, then the browser prompts for a password
      and no app content loads until `dev` + the correct password is given.
- [ ] Given the production deployment, when a visitor opens it, then no
      password is requested.
- [ ] Given any deployment, when a search engine crawler requests it, then
      the response carries `X-Robots-Tag: noindex` and `robots.txt`
      disallows all.
- [ ] Given a request to the Worker with an `Origin` not on the allowlist,
      when it responds, then `Access-Control-Allow-Origin` is `null` (not
      `*`) and a browser on that origin cannot read the response.
- [ ] Given the deployed app on its real origin, when it calls the Worker
      for routing / geocoding / POIs / hotels, then all still succeed.
- [ ] Given the custom domain (Phase B), when a visitor opens it over
      HTTPS, then the live site loads with no password and no cert warning.
- [ ] Given more than the configured request rate from one IP to
      `api.<domain>` (Phase B), when the threshold is crossed, then further
      requests are blocked/challenged for the cooldown window.
- [ ] `node scripts/test_data.js` and `node scripts/check_js.js` pass.
- [ ] No API key or secret appears in any client-served file or network
      payload.
- [ ] GitHub Pages is retired (or explicitly deferred with a dated note).

---

## Edge Cases

- Static assets must still serve when `_middleware.js` calls `next()` — do
  not accidentally intercept asset responses.
- `_middleware.js` runs on production too (just passes through); keep its
  no-password path allocation-light.
- Preview subdomains for branches with `/` or odd characters get sanitized
  names — the CORS suffix match on `.<project>.pages.dev` still covers them.
- A visitor who previously installed the PWA from the `github.io` or
  `pages.dev` origin keeps an independent old service worker on that origin;
  acceptable, they migrate by using the new link. Do not attempt a
  cross-origin takeover.
- OpenRouteService geocoding intermittently 403s (R-1, account-side) — do
  not mistake it for a CORS/hosting regression during verification.
- `hotels` mode may still be on the pre-GOLF-96 Worker build until a
  redeploy (R-2) — check the Worker's Deployments tab, not just the code.

## Dependencies

- Phase B is blocked on the product owner buying a domain.
- Rate limiting (B2) depends on the Worker being on a Cloudflare zone
  (custom domain), not `workers.dev`.
- GitHub Pages retirement (B4) depends on the custom domain being confirmed
  stable.

## Out of Scope

- Accounts, server-side sessions, any database (DEC-004 stands).
- Cloudflare Access / per-user SSO for the dev instance (shared password
  chosen instead).
- Making the live site SEO-discoverable (deliberately deferred; one-line
  change later).
- Analytics / usage dashboards for the Worker.
- Trip sharing work (GOLF-99/100) — unrelated.

## Constraints

- No build step, no framework, no bundler. `functions/_middleware.js` and
  `_headers` / `robots.txt` are the only new infra files and none require a
  build.
- Secrets stay server-side only. `ORS_API_KEY` is not touched.
- Follow the existing comment style in `ors-proxy.js` (dense
  explanatory comments with ticket refs).

## Implementation Guidance

- Cloudflare Pages env vars are scoped per-environment (Production /
  Preview) — the whole dev-gate design relies on setting `DEV_PASSWORD` on
  Preview only. Document this in `docs/deploying.md`.
- Keep the Worker CORS allowlist in one clearly-labelled `const` near the
  top of `ors-proxy.js` so adding the real domain in Phase B is a one-line
  edit.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

---

## Product-owner tasks (ELI5)

You only need to click things in dashboards. Nothing here involves code.

### S1 — Buy the domain (Phase B, when you're ready)

1. Think of a name you want, like `golftripplanner.com`.
2. Go to the Cloudflare dashboard → left menu **"Domain Registration"** →
   **"Register Domains"**.
3. Type your name. Cloudflare tells you if it's free and the yearly price
   (it doesn't add a markup).
4. Pay. Done — you now own it and Cloudflare already knows about it, so
   there's no extra "connect" step.

*(If you instead buy from somewhere else like Namecheap: tell the coding
agent, and there's one extra step where you copy two "nameserver"
addresses from Cloudflare into that other site. Cloudflare's own registrar
skips this.)*

### S2 — Point the domain at the site (Phase B)

1. Cloudflare dashboard → **"Workers & Pages"** → click the **golf-map**
   project.
2. Open the **"Custom domains"** tab → **"Set up a custom domain"**.
3. Type your domain (e.g. `golftripplanner.com`). Do it a second time for
   the `www.` version.
4. Wait a few minutes for a green **"Active"**. You don't configure
   anything — Cloudflare wires it up because it's the same account.

### S3 — Set the dev-site password (Phase A — do this when the agent says the code is ready)

1. Same **golf-map** project → **"Settings"** → **"Environment variables"**
   (may be called "Variables and Secrets").
2. Add a variable:
   - **Name:** `DEV_PASSWORD`
   - **Value:** any password you like
   - **Environment:** choose **"Preview"** ONLY. Do **not** tick
     "Production". This is the important bit — it's what makes the real site
     stay open to everyone while the dev site is locked.
3. Save.
4. Now every dev/preview link asks for a login. **Username is `dev`**,
   password is what you just set. Share those two with anyone who needs to
   see work-in-progress.

### S4 — Give the routing service its own address + spam protection (Phase B)

1. Cloudflare dashboard → **"Workers & Pages"** → click the **ors-proxy**
   Worker (the routing helper, not the golf-map site).
2. **"Settings"** → **"Domains & Routes"** → add `api.` + your domain
   (e.g. `api.golftripplanner.com`).
3. Then go to your domain → **"Security"** → **"Rate limiting rules"** →
   **"Create rule"**. The coding agent will give you the exact numbers to
   type. This stops a stranger from hammering the routing service and
   running up your usage.

### S5 — Redeploy the Worker after the agent changes it

The Worker rebuilds itself from GitHub automatically when the agent pushes.
Just check: **ors-proxy** Worker → **"Deployments"** tab shows a fresh
deployment dated after the agent's change. If routing/hotels still look
broken, click **"Retry deployment"** on the latest one.

### S6 — Turn off the old site (Phase B, a few days after S2 works)

1. Go to the GitHub repo → **"Settings"** → **"Pages"**.
2. Under **"Build and deployment"**, set **Source** to **"None"**.
3. That's it — now there's one official website on your domain.

---

## Definition of Done

- All acceptance criteria satisfied.
- Existing functionality (routing, geocoding, POIs, hotels, PWA install)
  intact on the canonical host.
- `node scripts/test_data.js` + `node scripts/check_js.js` pass.
- `docs/deploying.md`, `PROJECT.md`, `README` reflect the single canonical
  host + domain.
- `DECISIONS.md` DEC-006 and `RISKS.md` R-7 remain accurate; update if the
  implementation deviates.
- No known blocking issues remain.
