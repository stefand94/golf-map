# Implementation Task — GOLF-105

**Feature:** GOLF-105 — Basemap tile upgrade (raster style swap, keep Leaflet)

## Objective

Replace the plain OpenStreetMap raster basemap with a cleaner, muted,
pin-friendly raster style from a proper tile provider (MapTiler or Stadia),
without changing the map engine. The map is a backdrop for course pins,
drive routes and POIs — the new style must be quieter than raw OSM, not
busier.

This also retires a latent risk (R-8): the app currently uses OSM's public
tile server, which is not licensed for production/high-volume use.

## Context

- **Map engine:** Leaflet 1.9.4 + `leaflet.markercluster` 1.5.3, loaded as
  plain `<script>` from cdnjs (`london-golf-map-v5_1.html` ~lines 14–15,
  867–868). **Not changing.**
- **Main map + basemap:** `js/map.js` — `L.map('map', …)` ~line 20, the
  `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', …)`
  ~line 31. The comment block above it (lines 22–30) records the style
  history (CARTO Light → OpenTopoMap → CARTO Voyager → OSM) and why it left
  CARTO (raster tiles started requiring a key). Update that comment.
- **Second map:** `js/trip-share.js` ~line 211–212 — a separate Leaflet
  instance for the read-only shared-trip view, its own
  `L.tileLayer(...OSM...)`. Must get the same new basemap.
- No other map-rendering changes. Do **not** touch markers, clustering,
  rail-line geometry, popups, bounds-fitting, or the mobile list/map
  toggle.

## Open decision — provider bake-off (resolve first)

Wire up **both** and show them on a branch preview URL for the product
owner to choose:

| Provider | Suggested style | Endpoint shape |
| --- | --- | --- |
| **MapTiler** | `dataviz` / `basic-v2` / `bright-v2` (muted) | `https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key=KEY` (`@2x` variant for retina) |
| **Stadia Maps** | `alidade_smooth` (very clean) / `outdoors` | `https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{r}.png?api_key=KEY` (`{r}` = `@2x` on retina) |

Recommended default if the owner is indifferent: **Stadia `alidade_smooth`**
— it is the quietest "map as background" option. MapTiler `dataviz` is the
close second.

Both need a free account and an API key (product-owner tasks O1–O2). The
key is **client-side and public by design** — it is locked to the site's
domains in the provider dashboard, not kept secret. This is a different
risk class from the ORS key; do not build a Worker proxy for tiles.

## Requirements

1. Both maps (`js/map.js`, `js/trip-share.js`) use the chosen provider's
   raster tiles via `L.tileLayer`.
2. Correct attribution in the `attribution` option — OSM data credit **plus**
   the provider credit, per the provider's terms (e.g.
   `© MapTiler © OpenStreetMap contributors` /
   `© Stadia Maps © OpenMapTiles © OpenStreetMap`).
3. Retina/HiDPI: use the provider's `@2x` tiles with
   `detectRetina: true` (or the `{r}` token), so labels are sharp on
   high-density screens.
4. `maxZoom` set to what the chosen style actually supports (typically
   20). Keep the existing `setView` / default view logic untouched.
5. The API key lives inline in the client (there is no build step to inject
   it). Put it in **one** clearly-commented `const` near the top of
   `js/map.js` and reference it from both files (globals are shared — see
   the file header), with a comment stating it is domain-restricted and
   safe to be public, unlike `ORS_API_KEY`.
6. Update the `js/map.js` basemap history comment to record this change and
   why (R-8: OSM public tile server not production-licensed).
7. If a Content-Security-Policy exists (`<meta http-equiv>` in the HTML, or
   a `_headers` CSP added by GOLF-35), add the tile host (and any font host
   the style needs) to `img-src` / `connect-src`.

## Acceptance Criteria

- [ ] Given the main map on a preview deploy, when it loads, then tiles
      render from the chosen provider with no "API key required" watermark
      and no console 401/403.
- [ ] Given the shared-trip view (`#share=…`), when it loads, then it shows
      the same new basemap.
- [ ] Given a HiDPI screen, when the map loads, then labels/lines are sharp
      (retina tiles served).
- [ ] Given the country-wide default view, when pins are shown, then the
      basemap reads as a quiet background — labels/roads do not compete
      with the pins (product-owner visual sign-off on the preview URL).
- [ ] Attribution control shows the required OSM + provider credits.
- [ ] `node scripts/check_js.js` passes; no new console errors;
      `TESTING.md` map checks pass (pins, clusters, routes, rail layers,
      popups, mobile toggle all unchanged).
- [ ] The tile key present in client source is confirmed domain-restricted
      in the provider dashboard (product-owner task O1/O2).

## Edge Cases

- Do not add tile hosts to the service-worker precache list in `sw.js` —
  tiles are runtime assets. If the SW already runtime-caches map tiles,
  keep that behaviour; do not start caching them if it does not.
- Provider outage / quota exceeded → tiles 4xx. Optional low-cost
  resilience: a second `L.tileLayer` as a fallback is **out of scope** for
  v1; just make sure a tile failure degrades to blank tiles, not a JS
  error.
- Keep the `{s}` subdomain token out of the new URL — MapTiler/Stadia do
  not use it.
- The `trip-share.js` map passed `scrollWheelZoom:false` and its own
  options — preserve them; only the tile layer changes.

## Dependencies

- None blocking. Independent of GOLF-35, but if GOLF-35 adds a CSP, this
  must update it (req. 7).

## Out of Scope

- Vector tiles / MapLibre GL / continuous zoom / rotation — that is
  **GOLF-106**, a separate post-go-live epic.
- Custom-designed map styles (using a provider's style editor) — ship a
  stock style first; a bespoke style can be a later tweak.
- Dark-mode basemap variant — only if the app gains a dark mode (it has
  none today).
- Offline map tiles.

## Constraints

- No build step, no framework change, Leaflet stays.
- Two files change (`js/map.js`, `js/trip-share.js`) plus possibly the HTML
  (CSP / attribution). Nothing else.
- Follow the existing terse comment style in `js/map.js`.

## Implementation Guidance

- `L.tileLayer(url, { attribution, maxZoom, detectRetina })` is the whole
  change on the Leaflet side — this is deliberately small.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

---

## Product-owner tasks (ELI5)

### O1 — Get a MapTiler key

1. Go to **maptiler.com** → sign up (free).
2. **Account → API keys** → copy the key that is already there.
3. On that key's settings, find **"Allowed origins"** (or "HTTP referrers")
   and add your live domain and your preview domain
   (`*.<project>.pages.dev` — the agent will tell you the exact one).
   This stops anyone else using your key.
4. Send the key to the coding agent.

### O2 — Get a Stadia Maps key

1. Go to **stadiamaps.com** → sign up (free).
2. **Dashboard → Authentication** → create a "Property", add your live +
   preview domains as allowed domains, copy the **API key**.
3. Send it to the coding agent.

*(You need both only so you can compare the two maps side by side. After
you pick one, the other account can just sit unused or be deleted.)*

### O3 — Pick the look

The agent will deploy a branch with a toggle or two preview links. Open it,
look at the map with the course pins on it, and tell the agent which one
you prefer.

### O4 — After launch: set a spend cap / alert

In whichever provider you chose, set a monthly usage alert (and a hard cap
if offered) so a traffic spike can never produce a surprise bill. The free
tiers are generous; this is just a seatbelt.

## Definition of Done

- Both maps use the chosen provider; attribution correct; retina sharp.
- Owner has signed off the look on a preview URL.
- Key is domain-restricted.
- `check_js.js` passes; no map regressions per `TESTING.md`.
- R-8 marked resolved in `RISKS.md`.
