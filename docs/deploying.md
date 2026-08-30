# Deploying — GitHub Pages (current) and Cloudflare Pages (dev/prod links)

## Current state

The site is a fully static build — no build step, no server, no database.
Everything a visitor's browser needs is `london-golf-map-v5_1.html` plus
`js/*.js`, `data/*.js`, and `images/`. It's hosted today on **GitHub
Pages**, serving straight from the `main` branch's root, auto-deployed on
every push to `main`. That's the only live environment — `main` *is*
production.

## Why this doc exists (GOLF-80)

Feature work has been happening on branches (`sidebar-redesign`,
`trip-builder-item-timeline`, `modularization`, this one) reviewed and
merged into `main` only once verified — a sound pattern, but those branches
have no shareable live URL of their own. Testing a branch today means
either a local preview (`.claude/launch.json`) or waiting for a merge to
`main`. Cloudflare Pages fixes this natively: every branch gets its own
automatic preview URL, with zero extra config beyond connecting the repo.

## One-time setup (stakeholder action — not doable on their behalf)

Connecting a GitHub repo to a new Cloudflare Pages project is an account
action inside the Cloudflare dashboard:

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers &
   Pages** → **Create application** → **Pages** tab → **Connect to Git**.
2. Select the `golf-map` GitHub repository (grant Cloudflare access if
   prompted — same GitHub App flow used to authorize any Pages project).
3. Build settings — this is a static site with no build step, so:
   - **Build command**: leave empty
   - **Build output directory**: `/` (repo root)
   - **Root directory**: leave as `/` (default)
4. Click **Save and Deploy**.

That's it — no further per-branch setup. From then on:

- `main` → the project's production URL (`https://golf-map.pages.dev` or
  whatever project name is chosen), redeployed automatically on every push
  to `main`.
- Every other branch (e.g. `nations-expansion`, `sidebar-redesign`) →
  its own preview URL, in the form
  `https://<branch-name>.<project-name>.pages.dev`, redeployed automatically
  on every push to that branch.

## After it's connected

- Verify the production URL serves the site correctly (map loads, course
  popups render, the ORS Worker integration — a separate origin at
  `geofftheworker.stefand94.workers.dev` — still works cross-origin from
  the new domain; CORS on that Worker is already open (`*`), so no Worker
  config change should be needed).
- Verify a feature branch gets its own live preview URL and behaves
  identically to its local preview.
- GitHub Pages can keep serving in parallel — no need to tear it down the
  same day. Cut over to the Cloudflare Pages URL as the canonical link once
  it's verified working, not before.

## Nothing else changes

No secrets are introduced by this — the app has none to begin with (the
ORS key lives only in the Worker's encrypted secret store, never in this
repo). No new dependency, no new build tooling. `.claude/launch.json`'s
local preview keeps working exactly as it does today, unaffected by any of
this.
