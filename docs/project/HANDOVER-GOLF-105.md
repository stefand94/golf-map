# Implementation Task — GOLF-105 (rescoped 2026-09-10)

**Feature:** GOLF-105 — Basemap upgrade: Esri tiles + street/satellite layer toggle (keep Leaflet, no API key)

## Why this was rescoped

The original ticket was a MapTiler-vs-Stadia raster swap. Owner reviewed
both and was not impressed enough to sign up for either. New direction
(owner, 2026-09-10):

- Use **Esri's keyless ArcGIS Online tile services** — no new account, no
  API token of any kind.
- Add a **base-layer toggle**: a muted street style as the default, plus
  **Esri "Imagery Hybrid"** (satellite + place/road labels) as an
  opt-in layer. A third street style is optional, owner picks on preview.
- If for any reason a keyless Esri basemap can't be made to work, **stop**
  and report back — the fallback plan is to evaluate vector maps
  (GOLF-106) and defer/cancel this, not to reach for another keyed raster
  provider.

## Objective

Replace the single OSM raster basemap on both Leaflet maps with an Esri
tile layer, and give the user a Leaflet layer control to switch between a
quiet street basemap (default) and a satellite/hybrid view.

## Context

- **Map engine:** Leaflet 1.9.4 + `leaflet.markercluster` 1.5.3, plain
  `<script>` from cdnjs. **Not changing.**
- **Main map:** `js/map.js` — `L.map('map', …)` ~line 20; the current
  `L.tileLayer('https://{s}.tile.openstreetmap.org/...')` is ~line 39,
  under a comment block (~lines 31–38) recording the style history
  (CARTO Light → OpenTopoMap → CARTO Voyager → OSM, and that Esri World
  Topo was rejected once as **too busy** — see "style choice" below).
  Update that comment.
- **Second map:** `js/trip-share.js` — `renderSharedMap()` ~line 210, its
  own `L.map(el, {zoomControl:true, scrollWheelZoom:false})` and its own
  `L.tileLayer(...OSM...)` ~line 213. Preserve its options; only the
  tiles + layer control change.
- Globals are shared across the ordered `<script>` files (no modules), so
  a basemap helper defined in `js/map.js` is callable from
  `js/trip-share.js`. Prefer one shared factory function over copy-paste.
- Do **not** touch markers, clustering, rail-line geometry, popups,
  bounds-fitting, the `bgCoursePins` pane, or the mobile list/map toggle.

## Esri endpoints (all keyless, `{z}/{y}/{x}` order — note y before x)

Base: `https://server.arcgisonline.com/ArcGIS/rest/services/<SERVICE>/MapServer/tile/{z}/{y}/{x}`

| Layer in the toggle | Esri service(s) — stack in a `L.layerGroup` where 2 are listed | maxNativeZoom |
| --- | --- | --- |
| **Light Gray Canvas** (default) | `Canvas/World_Light_Gray_Base` + `Canvas/World_Light_Gray_Reference` | 16 |
| **Imagery Hybrid** (the "satellite" option) | `World_Imagery` + `Reference/World_Boundaries_and_Places` + `Reference/World_Transportation` | 19 (imagery), 13 (ref labels) |
| **World Topographic** *(optional 3rd — build it, default off, owner decides on preview)* | `World_Topo_Map` | 19 |

- The `Base`/`Reference` split is how Esri does "hybrid": imagery (or grey
  canvas) on the bottom, transparent labels/boundaries on top. Bundle each
  pair as one `L.layerGroup` so the layer control shows one entry.
- Set the map `maxZoom` to `19` and give each tile layer its own
  `maxNativeZoom` (table above) so a quieter style overzooms cleanly
  instead of going blank.

## Style choice (default street layer)

The old code note says Esri **World Topo** was compared once and rejected
as too busy (relief tint + dense labels competing with pins). That is why
the default here is **Light Gray Canvas**, which is the opposite — almost
no colour, minimal labels, designed by Esri as a data-overlay backdrop. It
is the best "map as quiet background" Esri ship. World Topo is only offered
as an optional third choice for the owner to look at, not the default.

## Requirements

1. Both maps render Esri tiles via `L.tileLayer`, no `{s}` subdomain token
   (Esri `server.arcgisonline.com` doesn't use it).
2. A `L.control.layers(baseLayers, null, {position:'topright'})` (or
   bottom-left if it collides with existing controls) on **both** maps,
   with: Light Gray Canvas (added to the map by default), Imagery Hybrid,
   and World Topographic. Radio-style base layers (not checkboxes).
3. Per-layer `attribution` set on each tile layer so Leaflet swaps the
   credit automatically when the user switches:
   - Light Gray / Topo: `Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community`
   - Imagery: `Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community`
4. `detectRetina: true` on the tile layers (Esri arcgisonline has no clean
   `@2x` token; `detectRetina` requests a higher zoom level, which is the
   accepted approach).
5. **No API key anywhere.** Add a short comment where the tiles are built:
   these are Esri's long-standing keyless `arcgisonline` endpoints, widely
   used with `esri-leaflet`; domain-locking / tokens are not available on
   this path and not required. Same *class* of "covered by a usage policy,
   not a signed contract" as the OSM server we're leaving — but far more
   permissive about app use. A fully-contracted basemap remains a
   later-if-ever call, tracked under GOLF-106.
6. Update the `js/map.js` basemap-history comment: OSM public tile server
   is not production-licensed (R-8) → moved to Esri keyless tiles + added
   a satellite toggle; note World Topo stays non-default because it was
   previously judged too busy.
7. Shared view (`js/trip-share.js`): same three layers, same default,
   same control. Keep `scrollWheelZoom:false` and everything else in
   `renderSharedMap()`.
8. If a CSP exists (`<meta http-equiv>` in the HTML, or a `_headers` file
   from GOLF-35), add `server.arcgisonline.com` to `img-src`.

## Acceptance Criteria

- [ ] Main map loads with **Light Gray Canvas** tiles, no watermark, no
      console 4xx from `arcgisonline.com`.
- [ ] The layer control switches cleanly between Light Gray Canvas,
      Imagery Hybrid and World Topographic; Imagery Hybrid shows aerial
      imagery **with** place-name + road labels on top.
- [ ] Attribution text changes to match whichever base layer is active.
- [ ] Shared-trip view (`#share=…`) has the same three layers and the same
      Light Gray Canvas default.
- [ ] Switching to Imagery Hybrid, zooming to a single course, shows
      recognisable aerial detail of the course (imagery goes to z19).
- [ ] Course pins, clusters, drive routes, rail layer (if flag on),
      popups, bounds-fit and the mobile map/list toggle all behave exactly
      as before on every base layer.
- [ ] `node scripts/check_js.js` passes; `node scripts/test_data.js`
      passes; `TESTING.md` map checks pass.
- [ ] No API key / token string is present in the diff.

## Edge Cases

- Do not add tile hosts to the `sw.js` precache list — tiles are runtime
  assets. Leave any existing runtime-cache behaviour as-is; don't add new
  tile caching.
- A tile 4xx (Esri hiccup / quota) must degrade to blank tiles, never a JS
  error. No second fallback provider in v1.
- `Reference/World_Transportation` and `World_Boundaries_and_Places` stop
  at ~z13; that's expected — imagery keeps going underneath, labels just
  don't get denser. Acceptable.
- Layer control must not overlap the bottom-right zoom control
  (`L.control.zoom({position:'bottomright'})` in `js/map.js`) or the
  mobile map/list toggle — pick a corner that's clear on a 360px screen.

## Dependencies

- None blocking. If GOLF-35 adds a CSP, this updates it (req. 8).

## Out of Scope

- Vector tiles / MapLibre GL / continuous zoom / rotation — GOLF-106.
- Any keyed provider (MapTiler, Stadia, Mapbox, Apple) — explicitly
  rejected by the owner for this ticket.
- A bespoke Esri style via ArcGIS style editor (that needs an account).
- Dark-mode basemap; offline tiles; per-layer remembering the user's last
  choice across sessions (nice-to-have, not v1).

## Constraints

- No build step, no framework change, Leaflet stays. No new accounts, no
  tokens.
- Files that change: `js/map.js`, `js/trip-share.js`, possibly the HTML
  (CSP / attribution). Nothing else.
- Follow the existing terse comment style in `js/map.js`.

## Implementation Guidance

- One shared factory, e.g. `esriBaseLayers()` in `js/map.js` returning
  `{ "Light Gray Canvas": L.layerGroup([...]), "Imagery Hybrid": L.layerGroup([...]), "World Topographic": L.tileLayer(...) }`,
  used by both maps. Add the default group to the map, then
  `L.control.layers(groups).addTo(map)`.
- `L.tileLayer(url, { attribution, maxNativeZoom, maxZoom: 19, detectRetina: true })`.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

## Product-owner tasks

- **O1 — Pick the look.** The agent ships a branch + Cloudflare preview
  URL. Open it with course pins visible, try all three base layers, and
  tell the agent: (a) keep Light Gray Canvas as default? (b) keep World
  Topographic as the third option or drop it? (c) is Imagery Hybrid the
  right "satellite" (vs plain imagery with no labels)?
- **O2 — After go-live:** nothing to configure (no account, no key, no
  spend cap). Just be aware Esri could change the keyless endpoints one
  day; if the map ever goes blank in future, that's the first suspect and
  the answer is likely GOLF-106 (vector).

## Definition of Done

- Both maps use Esri tiles with the 3-way base-layer toggle; Light Gray
  Canvas default; attribution swaps per layer.
- Owner has signed off the look on the preview URL (O1).
- No API key in the source.
- `check_js.js` + `test_data.js` pass; no map regressions per `TESTING.md`.
- R-8 **downgraded** in `RISKS.md` (OSM production-ban risk removed; a
  residual "keyless Esri is a usage policy, not a contract" note remains,
  pointing at GOLF-106).
