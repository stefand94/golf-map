# Risks

_Only material delivery/quality risks. Prune when resolved._

| ID | Risk | Impact | Likelihood | Mitigation / status |
| --- | --- | --- | --- | --- |
| R-1 | OpenRouteService **Geocoding** endpoint intermittently 403s (account-side, not code) | Place search degrades to "temporarily unavailable" | Recurring | App already fails soft. Confirm live before treating a place-search bug as new. |
| R-3 | Green-fee data (GOLF-98) is manually researched, 557 courses, incremental | Stale or wrong fees erode trust | Ongoing | `confidence` + `lastVerified` per course; spot-check each merge batch. |
| R-4 | No backend / localStorage-only | No cross-device trips; a browser wipe loses everything; sharing is hard | Accepted (DEC-004) | Known trade-off; sharing v1 (GOLF-99) is deliberately a demo. |
| R-5 | `main` auto-deploys to production on every push, no staging gate | A bad push is live immediately | Structural | Run `node scripts/test_data.js` + `node scripts/check_js.js` before every push; larger UI changes go via a branch + Cloudflare preview first. |
| R-6 | Docs drift (`TESTING.md` still cites 326 courses / old counts) | Agents act on stale facts | Present | `docs/project/` is now the SoT; refresh `TESTING.md` counts next time it's touched. |
| R-7 | ORS Worker has open CORS (`*`) and no rate limiting; once the URL is shared publicly, a third party can burn the 2,500/day OpenRouteService quota | Routing/geocoding silently fails for real visitors | Active until GOLF-102 lands | CORS allowlist in GOLF-35 Phase A; rate-limit rule in Phase B. Key itself is not exposed — this is quota abuse, not a leak. |
| R-8 | Basemap uses OSM's public tile server (`{s}.tile.openstreetmap.org`), which has a usage policy that excludes production/high-volume apps and can rate-limit or block | Map tiles fail to load for real visitors after go-live | Low now, rising with traffic | GOLF-105 (raster swap to MapTiler/Stadia free tier). Not urgent at demo traffic; do before promoting the link widely. |
| R-9 | GOLF-108/109 (map course-pin visibility) hinge on a product decision — "what course pins show in which trip-builder tab" — not just a code fix | Under-specified work → coding agent guesses → rework, or scope creep | Closed (2026-09-09) | Resolved to **toggle, default ON** (owner 2026-09-07); GOLF-108/109 implemented on branch `golf-108-109-course-pin-visibility`. See `GOLF-107-uxpass.md`. |
