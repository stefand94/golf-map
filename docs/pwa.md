# PWA basics

Two files make the site installable and give it basic offline access,
on top of the existing fully-static architecture — no build step, no
framework, progressive enhancement only.

- **`manifest.json`** — name, icons, start URL, `display:"standalone"`.
  Linked via `<link rel="manifest">` in `london-golf-map-v5_1.html`'s
  `<head>`.
- **`sw.js`** — a plain service worker, registered from `js/boot.js`
  after first render. Cache-first for the app shell (the HTML, every
  `js/*.js`/`data/*.js` file, the manifest, the icons); anything else
  (the ORS proxy, map tiles, Google Fonts) passes straight through to
  the network untouched. A same-origin file fetched later that wasn't
  in the precache list gets cached opportunistically too.
- **Icons**: `images/icon.svg` (any purpose) and
  `images/icon-maskable.svg` (maskable, extra padding for the safe
  zone Android/iOS crop to) — plain SVG, `sizes:"any"`, no PNG export
  step needed.

Browsers that don't understand `manifest`/service workers just ignore
these tags — the app is identical everywhere it always was. Bump
`CACHE_NAME` in `sw.js` whenever the precache file list changes; the
old cache is deleted on the next activation.

Live features that call out to the network (drive times, geocoding,
the "Show POIs" toggle) already degrade gracefully when a fetch fails
— see `ORS_PROXY_URL`'s empty-string default — so being offline just
means those specific features fall back exactly as they already do
when the Worker is unreachable for any other reason.
