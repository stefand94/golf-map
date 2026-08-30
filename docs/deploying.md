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

## The ORS proxy Worker (separate deployment)

The OpenRouteService proxy (`scripts/cloudflare-worker/ors-proxy.js`) is a
**separate** Cloudflare Worker, not part of the Pages deployment above —
see `scripts/cloudflare-worker/README.md` for its own deploy steps. It has
its own URL (`ORS_PROXY_URL` in the app) and its own `ORS_API_KEY` secret;
redeploying the Pages site does not touch it, and vice versa.

## GitHub Pages (legacy, may still be live)

The site was previously hosted on GitHub Pages, auto-deployed from `main`'s
root with no build step — the same zero-config static-hosting model
Cloudflare Pages now provides, kept live in parallel initially rather than
torn down same-day as the Cloudflare cutover. Once the Cloudflare Pages
production URL is confirmed working, this becomes the canonical link;
GitHub Pages can be decommissioned in the repo settings whenever convenient.
