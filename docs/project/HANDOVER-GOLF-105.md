# Implementation Task — GOLF-105 (rescoped 2026-09-10, scope locked 2026-09-10)

**Feature:** GOLF-105 — Basemap upgrade: Esri tiles + street/satellite layer toggle (keep Leaflet, no API key)

## Scope (locked by owner 2026-09-10)

Ship **now**, two base layers only:

1. **Esri World Street Map** — the default. Road map, looks broadly like
   the current OSM style.
2. **Esri Imagery Hybrid** — satellite imagery with place/road labels on
   top. The "satellite view" toggle.

Both from **Esri's keyless ArcGIS Online tile services** — no account, no
API token of any kind. If a keyless Esri basemap can't be made to work,
**stop and report back** — do not reach for another keyed raster provider;
the fallback is to evaluate vector (GOLF-106) and defer/cancel.

Light Gray Canvas and World Topographic are **not** in v1. They're
one-line additions to the same layer factory later if wanted.

## Why this was rescoped

The original ticket was a MapTiler-vs-Stadia raster swap. Owner reviewed
both and was not impressed enough to sign up for either (DEC-010).

## Objective

Replace the single OSM raster basemap on both Leaflet maps with an Esri
tile layer, and give the user a Leaflet layer control to switch between an
Esri World Street Map basemap (default) and an Imagery Hybrid
(satellite + labels) view.

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

| Layer in the toggle | Esri service(s) — stack in a `L.layerGroup` where 2+ are listed | maxNativeZoom |
| --- | --- | --- |
| **Street** (default) | `World_Street_Map` | 19 |
| **Imagery Hybrid** (the "satellite" option) | `World_Imagery` + `Reference/World_Boundaries_and_Places` + `Reference/World_Transportation` | 19 (imagery), 13 (ref labels) |

- The `Base`/`Reference` split is how Esri does "hybrid": imagery on the
  bottom, transparent labels/boundaries on top. Bundle the imagery + its
  two reference layers as one `L.layerGroup` so the layer control shows a
  single "Imagery Hybrid" entry.
- Set the map `maxZoom` to `19`. Both layers go to z19 natively, so
  `maxNativeZoom` matters less here, but still set it (19) for clarity.

## Style choice — note for the agent

Esri **World Topo** was compared once in this project's history and
rejected as too busy (relief tint + dense labels vs pins). We are using
**World Street Map**, not World Topo — it has no relief tint and reads
more like the OSM street style the map has now. Do not substitute World
Topo. If World Street Map turns out to look too heavy against the pins,
flag it for the owner on the preview rather than swapping it yourself
(Light Gray Canvas is the fallback they'd consider).

## Requirements

1. Both maps render Esri tiles via `L.tileLayer`, no `{s}` subdomain token
   (Esri `server.arcgisonline.com` doesn't use it).
2. A `L.control.layers(baseLayers, null, {position:'topright'})` (or
   another corner if it collides with existing controls) on **both** maps,
   with exactly two radio-style base layers: **Street** (`World_Street_Map`,
   added to the map by default) and **Imagery Hybrid**.
3. Per-layer `attribution` set on each tile layer so Leaflet swaps the
   credit automatically when the user switches:
   - Street: `Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community`
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
   is not production-licensed (R-8) → moved to Esri keyless tiles (World
   Street Map default) + added an Imagery Hybrid satellite toggle; note
   World Topo was deliberately not used (previously judged too busy).
7. Shared view (`js/trip-share.js`): same two layers, same default (Street),
   same control. Keep `scrollWheelZoom:false` and everything else in
   `renderSharedMap()`.
8. If a CSP exists (`<meta http-equiv>` in the HTML, or a `_headers` file
   from GOLF-35), add `server.arcgisonline.com` to `img-src`.

## Acceptance Criteria

- [ ] Main map loads with **Esri World Street Map** tiles, no watermark, no
      console 4xx from `arcgisonline.com`.
- [ ] The layer control switches cleanly between Street and Imagery Hybrid;
      Imagery Hybrid shows aerial imagery **with** place-name + road labels
      on top.
- [ ] Attribution text changes to match whichever base layer is active.
- [ ] Shared-trip view (`#share=…`) has the same two layers and the same
      Street default.
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
  `{ "Street": L.tileLayer(...World_Street_Map...), "Imagery Hybrid": L.layerGroup([imagery, boundaries, transportation]) }`,
  used by both maps. Add the Street layer to the map, then
  `L.control.layers(baseLayers).addTo(map)`. Keeping it a factory (not a
  shared singleton) matters — the two maps are separate Leaflet instances
  and a layer object can't be on both.
- `L.tileLayer(url, { attribution, maxNativeZoom: 19, maxZoom: 19, detectRetina: true })`.
- Adding Light Gray Canvas / World Topo later = one more entry in that
  object; leave it easy.

> The coding agent should inspect the existing codebase and follow
> established project patterns before introducing new architecture.

## Product-owner tasks

- **O1 — Sanity-check the look.** The agent ships a branch + Cloudflare
  preview URL. Open it with course pins visible, toggle Street ↔ Imagery
  Hybrid, and confirm: Street isn't too heavy against the pins, and
  Imagery Hybrid is the right "satellite" (imagery + labels, not bare
  imagery). This is a confirmation, not an open design choice — scope is
  locked to these two layers.
- **O2 — After go-live:** nothing to configure (no account, no key, no
  spend cap). Just be aware Esri could change the keyless endpoints one
  day; if the map ever goes blank in future, that's the first suspect and
  the answer is likely GOLF-106 (vector).

## Definition of Done

- Both maps use Esri tiles with the 2-way Street / Imagery Hybrid toggle;
  Street default; attribution swaps per layer.
- Owner has signed off the look on the preview URL (O1).
- No API key in the source.
- `check_js.js` + `test_data.js` pass; no map regressions per `TESTING.md`.
- R-8 **downgraded** in `RISKS.md` (OSM production-ban risk removed; a
  residual "keyless Esri is a usage policy, not a contract" note remains,
  pointing at GOLF-106).
