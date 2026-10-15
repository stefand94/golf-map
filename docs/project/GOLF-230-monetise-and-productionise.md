# GOLF-230 — Monetising and productionising golftripper.uk

Standing reference, written 2026-10-15 by the advisor session and reviewed by the BA (ORS and cookie points corrected the same day).
It's a planning document, not a pitch. **GOLF-230 outreach stays on hold:**
no emails, no sign-ups and no contacting anyone until the triggers in §4 are met.

Labels: **[Fact]** means checked against the repo, the live Worker or a
public source, on the date above. **[J]** means judgement or an estimate.

---

## 1. Where we are

**Revenue today**
- **[Fact]** These affiliate links are live:
  - Stay22 hotel links (aid `golftripper`, GOLF-242, live 2026-10-05).
  - Travelpayouts / EconomyBookings car hire (marker 778843).
  - Klook activity links for 10 towns (GOLF-233).
- **[J]** Revenue to date is about £0. Neither dashboard has reported a booking
  that I know of. Stefan should check both, because only he can see them.

**Traffic we can prove**
- **[Fact]** `api.golftripper.uk/stats` shows 2 real trips, 1 share and
  0 share-opens between 2026-10-05 and 2026-10-15.
- **[Fact]** Cloudflare Web Analytics and the Stay22 dashboard are owner-only,
  so the stats endpoint is the only number we can quote to a third party.
- **[J]** We can't sell anything on numbers this small. We need 2–3 months of
  steady usage before any partner conversation is worth having.

**Real edges vs Birdie (Open Links Golf, launched Oct 2025), GolfTrip.ai and the operators' own planners**
- **[Fact]** Per-person costs in £, € or R, which can now be edited (GOLF-247).
- **[Fact]** Real drive times, including ferry legs (GOLF-118).
- **[Fact]** Trip start and end points (GOLF-243) and a calendar view (GOLF-153).
- **[Fact]** No login, and trips can be shared with a single link.
- **[Fact]** Coverage: GB, Ireland and the ranked South African courses.
- **[J]** The edge is planning a group trip *across* clubs, with honest costs.
  Birdie and the operators sell packages.
- **[J]** The weakness: green-fee data goes stale (R-3), and 90 courses now
  say "Ask club" (GOLF-239).

---

## 2. Revenue routes, ranked for a solo owner with a day job

| # | Route | Year-1 £ [J] | Effort [J] | Prerequisites | What it re-opens |
|---|---|---|---|---|---|
| 1 | **Affiliates (live): Stay22, Travelpayouts, Klook** | £0–500 | Low. Already built, so the only work is traffic | Disclosure is in place. Traffic is the gap | Nothing new. ORS terms allow it (GOLF-234 part 2, §3) |
| 2 | **Golfbreaks via Awin** (they pay about $10–20 per lead, from their public terms) | £0–1k | Low–medium. Apply, then place a "get a quote" link on a built trip | Awin approval needs a credible site and traffic. Show stats first | DEC-022 (R-11) if placed near ranked courses |
| 3 | **Licence or partnership with Top 100 Golf Courses / Lockhart** (options A–D in `GOLF-230-consultant-options.md`) | £0–8k plus perks | Medium–high. Pitch, contract, co-branding, support | Provable traffic. ORS and Esri commercial terms confirmed. A clean position on rankings | DEC-022 / DEC-036 / DEC-038 (rankings). ORS terms. Esri tier and key. Possibly GOLF-104 if they want accounts |
| 4 | **Sponsorship** (a title sponsor, or a tour operator "featured" slot) | £1–3k | Medium. Selling, and one renewal a year | Traffic numbers. A media kit | DEC-022 if the sponsor is a ranked club. Advertising disclosure |
| 5 | **Paid features** (saved trips across devices, PDF export, group payments) | £0 until year 2 | High. Needs accounts, payments, support and GDPR controller duties | GOLF-104 (backend), terms of use, Stripe, privacy policy rewrite | GOLF-104, DEC on "no accounts", data-protection registration |

**[J] Ranking:** do 1 → 2 now (low effort, no conversations). Hold 3 and 4
until the §4 triggers are met. Don't do 5 at this stage. It's a different
business with support costs that a day job can't absorb.

---

## 3. Productionising checklist

**Must-have** = before any revenue or partner deal. **Before-scale** = before
a traffic push, such as Reddit or press. **Later** = when a trigger in §4 fires.

### Terms and licences

| Item | Status | Priority |
|---|---|---|
| **ORS / HeiGIT commercial use** | **[Fact] BA-checked 2026-10-15 (GOLF-234 part 2):** the ToS (account.heigit.org/info/tos) has no ban on commercial use, and the Standard plan is €0 and "free to use for everyone". There is no paid tier: the only routes past the free limits are self-hosting (On-Premise) or contacting HeiGIT. Attribution is already compliant. Results are CC-BY-SA 4.0. The limits are per minute as well as per day: Directions 2,000/day and 40/min, Geocoding 3,000/day and 100/min. Repeatedly going over risks an account block. **GOLF-251** adds the per-minute guard. **[J]** Written confirmation from HeiGIT is nice to have before a signed licence deal, not before affiliate income. | **Must-have: GOLF-251** |
| **Overpass public instance** (live hotels and heritage POIs) | **[Fact]** The OSM wiki asks for under 10k queries and 1 GB a day per app (all users combined) and says "commercial use should use self-hosted or paid Overpass servers". There's no SLA. **[J]** The 24h edge cache keeps us well under the limit today. Before scale, either pre-fetch hotels as static files (as we do for courses and POIs) or move to a paid instance | **Before-scale** |
| **Esri basemap key** | **[Fact]** Referrer-locked Worker secret `ESRI_MAP`. It expires around 2027-10-05 (R-8). **[J]** Check the Esri tier's terms cover commercial use before any licence deal. Don't switch on Esri geocoding (GOLF-245): stored results cost $4 per 1,000 | Must-have (terms); calendar the renewal |
| **OSM ODbL attribution** | **[Fact]** Done (GOLF-238 / GOLF-240) | Done |
| **Rankings** | **[Fact]** Rank numbers removed (GOLF-160). 114 `notable:1` flags remain. Under R-11, any revenue re-opens DEC-022. **[J]** Before money flows, decide whether "notable" is defensible on its own sources | **Must-have** |
| **Fee and course data provenance** | **[Fact]** `docs/data-provenance.md` lists 13 open risks (R1–R13) | Work through it before-scale |

### Privacy, cookies and disclosure (UK)

- **[Fact]** The affiliate disclosure (`AFF_DISCLOSURE`, `js/trip-ui.js`) sits
  next to the links. The privacy dialog says links "may pay us a commission".
- **[Fact]** The ASA says affiliate content must be "obviously identifiable" as
  advertising, and prefers wording like "#ad" to "affiliate". The CMA can now
  fine directly under the DMCC Act.
  - **[J]** Our wording is probably fine. Before-scale, change it to start with
    "Ad:" or "Paid link:" for clarity.
- **[J]** Until GOLF-250 we set no tracking cookies. Our localStorage is "strictly
  necessary", and Stay22 and Klook set their cookies on their own sites.
  **GOLF-250 (Stay22 Let Me Allez, 2026-10-15) runs a Stay22 script on our pages.** If it sets cookies, a PECR consent banner may be needed. Barry's report decides this; it's an owner call.
  - So no cookie banner is needed today. That changes if we ever add
    analytics that set cookies, or embedded affiliate widgets.
- **[J]** Before-scale, a one-page privacy notice should cover: the feedback
  email, the `/count` beacon and the ICO fee question. A sole trader
  processing only feedback emails is very probably exempt, but check the
  ICO self-assessment once.

### Operations

| Item | Status | Priority |
|---|---|---|
| **Uptime monitoring** | **[Fact]** `/health` exists (GOLF-229). The UptimeRobot free plan's commercial-use rule has been reported both ways since late 2024. **[J]** Use Better Stack's free tier instead. It pings `/health` and the home page and emails Stefan | **Before-scale** |
| **Cost ceilings** | **[Fact]** GOLF-223 caps per UTC day: directions at 300 per visitor and 1,900 site-wide, geocoding at 200 per visitor and 950 site-wide (ORS Standard limits: Directions 2,000/day and 40/min, Geocoding 3,000/day and 100/min; nothing yet caps the minute, see GOLF-251). When a cap is hit, the app degrades to straight-line estimates. **[J]** Also set a Cloudflare billing alert (Workers and Durable Objects) at about £5 a month, so a bug can't run up a bill | Must-have (alert) |
| **Worker deploy check** | **[Fact]** A green build check has deployed nothing 3 times. Check the `X-Worker-Build` header after each deploy | Ongoing |
| **Data freshness** | **[J]** Name an owner and a rhythm: a green-fee sweep every 6 months, ahead of each season (R-3). Show `lastVerified` on fees | Before-scale |

### Keys and renewal dates

- **[J]** Keep one calendar entry per item, for Stefan:
  - the Esri key (about 2027-10-05);
  - the golftripper.uk domain;
  - the HeiGIT account;
  - the Stay22, Travelpayouts and Klook accounts (terms change);
  - Cloudflare.
- Never write the keys down anywhere except the Worker secrets.

### Money and legal

- **[Fact]** HMRC trading allowance: the first £1,000 of gross trading income a
  year needs no tax return. Above it, register for Self Assessment by 5 Oct
  after the tax year ends.
- **[J]** A separate bank account (even a free personal one) is worth it from
  the first payout, because it makes the £1k test trivial. A business account
  and a limited company can wait until about £10k a year, or until a
  contract needs one.
- **[J]** Short terms of use ("planning aid, check fees with the club, no
  liability for bookings") are a **must-have** before any licence or
  sponsorship deal. Optional before that.

---

## 4. Triggers [J]

| Trigger | Action |
|---|---|
| About 100 trips a month on `/stats` for 2 months running, **and** at least 10% of shares get opened | Un-hold GOLF-230 outreach (option D first, then A) |
| Site-wide ORS cap hit on 3+ days in a month | Pay for an ORS plan or self-host. Bring the Overpass pre-fetch forward |
| A licensee asks for accounts, **or** at least 5 separate feedback emails ask to sync trips across devices | Start GOLF-104 |
| Affiliate income heading past £1k gross in a tax year | Register for Self Assessment. Open a separate account if not done |
| Any signed deal with money in it | ORS and Esri terms confirmed in writing. DEC-022 resolved. Terms of use live |
| Over 500 trips a month | Media kit and sponsorship approach. Consider a paid Cloudflare tier only if the free one actually limits us |

---

## 5. Recommended sequence

**Next 90 days (to mid-January 2027)**
1. **Weeks 1–2:** ship GOLF-251 (ORS per-minute guard). The HeiGIT terms are already checked (no commercial ban). Set the Cloudflare billing alert. Set up
   Better Stack on `/health`. Put the renewal dates in the calendar.
2. **Weeks 2–4:** soft launch on Reddit and golf forums (draft already done).
   Watch `/stats` and the caps for a week afterwards.
3. **Month 2:** change the disclosure wording to "Ad:". Write a one-page
   privacy notice and terms of use. Decide the `notable` question (DEC-022).
4. **Month 3:** review against §4. If the traffic trigger is met, the BA
   un-holds GOLF-230. If not, apply to Golfbreaks/Awin only once the stats
   look credible. Plan the pre-season fee sweep for spring.

**Not yet**
- No outreach to Top 100, Lockhart or operators (on hold).
- No accounts or backend (GOLF-104), no paid features, no Stripe.
- No paid ORS, Overpass or Cloudflare tiers before a trigger fires.
- No Esri geocoding (GOLF-245 stays parked).
- No limited company. No cookie-setting analytics.
- Don't buy traffic: there's nothing to convert it to yet.
