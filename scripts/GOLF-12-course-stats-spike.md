# GOLF-12 — research spike: course overview stats (par / slope / course rating)

**Scope:** an overview only — par, slope rating, course rating per course. No
hole-by-hole scorecard data. Deliverable is this findings memo, not an
integration commitment.

## Sources evaluated

### 1. England Golf's WHS platform — `isvapi.whsplatform.englandgolf.org` ("DotGolf ISV API")
This is the lead flagged in the original plan (the `IsWHSRated` facility flag
pointed here). It's real and documented, but it's an **ISV (Independent
Software Vendor) partner API**, not a public/self-serve one:
- Endpoints exist for a single course, all courses at a user's own club, and
  (in principle) all courses country-wide — but the country-wide endpoint is
  explicitly **not permitted for most National Associations**, England Golf
  included by default.
- Access model is built around a registered software vendor integrating on
  behalf of a club, not an open API key signup.
- **Verdict: not viable** without a formal partner/vendor agreement with
  England Golf — out of proportion for this project.

### 2. `golfapi.uk` (via RapidAPI)
- Confirms 99.3% coverage of WHS slope rating / course rating across its
  ~14,100 tee sets (2,668 UK clubs), alongside par and yardage — i.e. this
  is real, not just a hole-by-hole scorecard product.
- Self-serve signup through RapidAPI, no approval process.
- **Free tier:** 200 requests/month, 5 req/min, all 16 endpoints.
- **Paid tiers:** Basic $9.99/mo (5,000 req/mo), Pro $29.99/mo (25,000
  req/mo), Business $99.99/mo (100,000 req/mo).
- For this project: 221 courses fit comfortably in a *single month* of the
  free tier (200 req limit means it'd need splitting across two monthly
  windows, or the $9.99 Basic tier covers it in one run with huge headroom
  for later re-runs/corrections).
- **Verdict: viable.** This is the practical path if the stakeholder wants
  to fund it.

## Recommendation

**Go, conditional on budget approval** — `golfapi.uk`, either:
- (a) free tier, spread across two monthly batches (no cost, ~2 weeks slower), or
- (b) the $9.99/mo Basic tier for one-shot, no rate-limit friction (one month's
  spend, ~£8; can cancel after the batch fetch since this fits the project's
  "fetch once, store statically" model — no ongoing subscription needed).

This is a **paid third-party service** — per this project's own guardrails, I
won't sign up or spend money without your explicit go-ahead. Let me know which
of (a)/(b) you'd like, or say no and GOLF-13 (Course Handicap calculator)
stays shelved for lack of a data source.

The England Golf WHS platform lead is a dead end for a self-serve project —
worth knowing so we don't re-investigate it later.
