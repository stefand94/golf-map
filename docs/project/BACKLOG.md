# Backlog

_Continue the `GOLF-nnn` sequence (archive's latest ≈ GOLF-98). Never reuse
an ID. Check for an existing item before adding a new one._

| ID | Name | Priority | Status | Deps | Notes |
| --- | --- | --- | --- | --- | --- |
| GOLF-99 | Trip sharing v1 — shareable read-only trip (map overview, day-by-day costs, itemised total) | P1 | SCOPED | — | Explicitly a "get a demo out" v1, to be redone properly later. A `#share=…` read-only view already exists — confirm how much of this is already live before building. Scoped in archive Phase 31 (line 1). |
| GOLF-100 | Group / per-person costing | P1 | PARTIAL? | GOLF-99 | Specify a group size → whole-trip + per-person cost, following the per-room/per-person model from GOLF-74. Toolbar "group size" control already exists — audit what's done vs outstanding. |
| GOLF-101 | Course imagery sourcing — written proposal | P2 | SCOPED | — | Copyright-safe options for course photos. Proposal only, not build. Archive Phase 31. |
| GOLF-35 | Custom domain / production hosting consolidation | P3 | BLOCKED | user buys domain + picks canonical host | Technical checklist ready (manifest check, Worker CORS spot-check, host consolidation). Archive Phase 35. |
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
