# Risks

_Only material delivery/quality risks. Prune when resolved._

| ID | Risk | Impact | Likelihood | Mitigation / status |
| --- | --- | --- | --- | --- |
| R-1 | OpenRouteService **Geocoding** endpoint intermittently 403s (account-side, not code) | Place search degrades to "temporarily unavailable" | Recurring | App already fails soft. Confirm live before treating a place-search bug as new. |
| R-2 | Cloudflare Worker `hotels` mode (GOLF-96) needs a manual dashboard redeploy | "Add a stay" silently does nothing until redeployed | Active | Redeploy pending; `curl` the Worker to check. |
| R-3 | Green-fee data (GOLF-98) is manually researched, 557 courses, incremental | Stale or wrong fees erode trust | Ongoing | `confidence` + `lastVerified` per course; spot-check each merge batch. |
| R-4 | No backend / localStorage-only | No cross-device trips; a browser wipe loses everything; sharing is hard | Accepted (DEC-004) | Known trade-off; sharing v1 (GOLF-99) is deliberately a demo. |
| R-5 | `main` auto-deploys to production on every push, no staging gate | A bad push is live immediately | Structural | Run `node scripts/test_data.js` + `node scripts/check_js.js` before every push; larger UI changes go via a branch + Cloudflare preview first. |
| R-6 | Docs drift (`TESTING.md` still cites 326 courses / old counts) | Agents act on stale facts | Present | `docs/project/` is now the SoT; refresh `TESTING.md` counts next time it's touched. |
| R-7 | ORS Worker has open CORS (`*`) and no rate limiting; once the URL is shared publicly, a third party can burn the 2,500/day OpenRouteService quota | Routing/geocoding silently fails for real visitors | Active until GOLF-102 lands | CORS allowlist in GOLF-35 Phase A; rate-limit rule in Phase B. Key itself is not exposed — this is quota abuse, not a leak. |
