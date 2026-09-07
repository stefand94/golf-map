# Backlog

_Continue the `GOLF-nnn` sequence (archive's latest ≈ GOLF-98). Never reuse
an ID. Check for an existing item before adding a new one._

| ID | Name | Priority | Status | Deps | Notes |
| --- | --- | --- | --- | --- | --- |
| GOLF-99 | Trip sharing v1 — shareable read-only trip (map overview, day-by-day costs, itemised total) | P1 | SCOPED | — | Explicitly a "get a demo out" v1, to be redone properly later. A `#share=…` read-only view already exists — confirm how much of this is already live before building. Scoped in archive Phase 31 (line 1). |
| GOLF-100 | Group / per-person costing | P1 | PARTIAL? | GOLF-99 | Specify a group size → whole-trip + per-person cost, following the per-room/per-person model from GOLF-74. Toolbar "group size" control already exists — audit what's done vs outstanding. |
| GOLF-101 | Course imagery sourcing — written proposal | P2 | SCOPED | — | Copyright-safe options for course photos. Proposal only, not build. Archive Phase 31. |
| GOLF-103 | Better hotel data source for "Add a stay" (provider evaluation) | P1 | DISCOVERY | — | Extends GOLF-96 (Overpass pins + manual price). **Core need = coverage** (Overpass misses many real hotels); rough price = nice-to-have; live/date-based price = future (needs date selection). Does NOT block go-live. Price stays user-editable; keep Overpass as fallback. Candidates: **Travelpayouts/Hotellook** (free, aggregator coverage, indicative price, affiliate links = monetization built in — leading option), **Google Places** (best coverage + ratings/photos, no price, free at low traffic then ~$30–35/1k calls, spend-cappable), **Stay22** (drop-in affiliate map widget — benchmark), **Amadeus** (structured price/availability — parked until date-selection milestone). Next step: coverage bake-off across 6 real courses (city-adjacent + remote links). See chat 2026-09-07. |
| GOLF-104 | Backend / accounts / server-side persistence — direction paper | P2 | DISCOVERY | — | Move off localStorage-only (reopens DEC-004). Prerequisite for US expansion, cross-device trips, booking attribution, email. Big architectural shift; **not a go-live blocker** — launch on current model first to earn the feedback that justifies this. Written proposal only for now: options (managed BaaS vs minimal API + DB), auth model, migration of existing localStorage trips, cost, impact on the "zero-backend static" constraints. |
| GOLF-35 | Custom domain / production hosting consolidation + hidden dev instance | P2 | READY | Phase B blocked on user buying domain | Decisions locked (DEC-006). Handover: `HANDOVER-GOLF-35.md`. Phase A (dev password gate, noindex, GitHub Pages retire prep) needs no domain — ship first. **Handover process:** start a fresh Claude Code session (not a BA/PM one), point it at `HANDOVER-GOLF-35.md`, do Phase A only, on a branch (not `main`) so the preview URL can be tested before merge. Owner does dashboard task S3 (`DEV_PASSWORD`, Preview scope) when agent says code is ready. Verify acceptance criteria before REVIEW/COMPLETE. |
| GOLF-102 | ORS Worker abuse hardening — CORS allowlist + rate limiting | P2 | READY | GOLF-35 Phase B for rate limiting | Part 1 (CORS allowlist) ships with GOLF-35 Phase A. Part 2 (rate limit rule) needs Worker on the custom domain. In `HANDOVER-GOLF-35.md`. |
| — | Green-fee data for Scotland / Ireland / South Africa / Wales / London | P2 | QUEUED | GOLF-98 England batch merged | Continuation of GOLF-98 per-nation. |

## Recently completed (one line each — prune quarterly)

- GOLF-97 — banded green-fee schema (`fee:{…}`) — live
- GOLF-96 — "Add a stay" map hotel picker — app live, Worker redeploy pending
- GOLF-95 — prompt-based reorder suggestion (no silent reorder)
- GOLF-94 — nation pills moved to top; auto 1-day-per-course scheduling
- GOLF-83/83b/83c — heritage POIs wiki-first + wineries
- Explore mode retired; pin redesign; Nearby/place-search consolidation
- GOLF-85 — Scotland Top 100 broadening; Ireland/SA Top 100 broadening
- GOLF-70/71/72–76 — script modularisation + design-system pass
