# GOLF-119 — DotGolf club-finder API: geographic coverage audit

**Status:** COMPLETE — 2026-09-20
**Type:** desk research. No shipped-code changes, no `data/*.js` changes.
**Feeds:** GOLF-157 (onboard Australia + New Zealand, and write the
country-onboarding runbook). This audit answers GOLF-157's first
question: *is AU/NZ a bulk pull or a hand-curated Top 100?*
**Supersedes the sequencing in** `HANDOVER-GOLF-119.md` (written
2026-09-09, when this fed the now-cancelled GOLF-121c).

---

## Headline

| | |
|---|---|
| **New Zealand** | **YES — bulk pull.** DotGolf, unauthenticated, 424 clubs with coordinates in **one** HTTP call. No anti-automation clause. Golf NZ's terms restrict *republication*, which is cheaply handled by taking published coordinates from OpenStreetMap — see §5. |
| **Australia** | **NO — hand-curate.** It *is* DotGolf and a bulk index does exist, but Golf Australia's Terms of Service §6.2(c) (v1.0, eff. 1 Oct 2025) expressly forbids "scraping tools, bots, or other automated methods", and the whole site is behind a Cloudflare bot challenge that returns 403 to any non-browser client. **Same call as the BRS Golf finding under GOLF-97/98: we may not use this source.** |

Net effect on GOLF-157: the two countries are **not** symmetric. Plan
them as two different jobs, not one.

---

## 1. Which national bodies expose the DotGolf API

All tenants share one shape: `https://<host>/api/clubs/<Endpoint>`.
Re-probed live on 2026-09-20 (a handful of requests each, ~2 s apart).

| Body | Host | Bulk list? | Clubs (bulk) | With coords | Notes |
|---|---|---|---|---|---|
| England Golf | `www.englandgolf.org` | **Yes** | 1905 | 1905 | hierarchy returns 2404 (incl. deleted/duplicate) |
| Scottish Golf | `www.scottishgolf.org` | **Yes** | 589 | 588 | hierarchy 727 |
| Wales Golf | `www.walesgolf.org` | **Yes** | 149 | 149 | hierarchy 160 |
| Golf Ireland | `www.golfireland.ie` | **Yes** | 382 | 380 | hierarchy 389 |
| Handicap Network Africa (SA) | `www.handicaps.co.za` | **Yes** | 447 | 418 | hierarchy 450; ~29 zero-coord, as GOLF-121a found |
| **Golf New Zealand** | **`www.golf.co.nz`** | **Yes** | **424** | **424** | hierarchy 429. New this audit. |
| Golf Australia | `golf.com.au` | Index yes, **but ToS-barred** | 1841 venues | **0** | see §3 |

**The bulk/name-only distinction — and a finding for the existing scripts.**
An **unfiltered** `POST /api/clubs/FindClubs {"pageNumber":1,"pageSize":5000}`
returns the **entire national list with coordinates in a single call** on
**all six** live tenants — including England, Scotland, Wales and Ireland,
which `scripts/fetch_*_golf_clubs.py` currently fetch **name-by-name** via
`GetClubsByName`. Nothing here is name-only. The two-step
`GetClubHierarchies` → per-club `FindClubs` dance that GOLF-78/121a built
for South Africa is not required for a *list*; it is only needed for
per-club enrichment.

> **Worth a separate ticket (not this one):** the four GB/Ireland fetch
> scripts could be reduced to one call each. That would also have avoided
> the class of bug the README documents — the difflib "closest match"
> picking *Royal Co Down Ladies GC* over the real club. Raised to BA/PM as
> a suggestion; no code touched here.
>
> **Sequencing (raised by the Developer session, who owns these scripts):**
> don't rebuild the fetch path until the terms question is settled, or the
> work could be wasted. **That question is now answered — see §5.** Ireland
> and South Africa have no relevant clause; England's and Scotland's bear
> on *republication*, not on how the list is fetched. So this optimisation
> is safe to do on its own merits.

**Fields returned** (bulk `FindClubs`): `ClubId`, `ClubName`, address
lines, `PostalCode`, `Latitude`, `Longitude`, `Phone`, `Email`,
`GetDirectionsLink`, plus mostly-empty `NoOfHoles`, `Website`,
`TeeBookingUrl`, `MembershipUrl`, `FacilityTypes`, social URLs.
**Confirmed: no green fees anywhere, on any tenant.** GOLF-98 remains a
manual job for any new country.

---

## 2. New Zealand — definite YES

**Evidence, `www.golf.co.nz`, 2026-09-20:**

- `POST /api/clubs/GetClubHierarchies {}` → **200, 429 entries.** Carries
  a ready-made region taxonomy: `RegionID`/`RegionName` (e.g. Auckland,
  Hawkes Bay) with `RegionLatitude`/`RegionLongitude`, and
  `ProvinceName` = **North Island / South Island**.
- `POST /api/clubs/FindClubs {"pageNumber":1,"pageSize":5000}` → **200,
  424 full records, `TotalCount` 424, all 424 with non-zero coordinates.**
- `GET /api/clubs/GetClubDetails?clubId=<id>` → per-club enrichment:
  real `Website`, real `NoOfHoles`, `RegionName`.
- `GET /api/clubs/GetClubsByName?name=golf` → 200, 1328 lightweight rows.

No API key, no auth, no CORS obstacle, no rate-limit response, no
Cloudflare challenge, **no `robots.txt` at all**. A stdlib-only
`scripts/fetch_nz_golf_clubs.py` clone would work today.

Coverage is real, not a directory of driving ranges — Cape Kidnappers,
Tara Iti, Kauri Cliffs, Paraparaumu Beach, Millbrook, The Kinloch Club and
Wairakei are all present.

**Gotchas to carry into GOLF-157** (all match prior nations' lessons):

- In the **bulk** call `RegionName` is `null` for all 424 and `NoOfHoles`
  is `0` for all 424 — take regions from `GetClubHierarchies` and holes
  from `GetClubDetails`. `Website`/`TeeBookingUrl` are empty in bulk too.
- **Two bad coordinates**, so run the usual spot-check: *The Green
  Pinnacle* at lat −83.05 (Antarctica), and *The Morgans — Pauatahanui*
  at lat **+**41.08 (sign-flipped; should be −41.08).
- Names in `GetClubHierarchies` are short forms (`Afrikaans`), in
  `FindClubs` long forms (`Afrikaans Golf Club`) — join on `ClubId`,
  never on name.

**Cost for GOLF-157:** one call for the list, plus ~100–424 detail calls
at 0.3 s throttle. Minutes, not a research project.

---

## 3. Australia — definite NO (ToS)

**It is DotGolf.** `golf.org.au` redirects to **`golf.com.au`**, which
loads `dotgolf.clubcms-utils.js`, `knockout.dotgolf.extensions.js` and
`js/utils/dotgolf.utils.js`, and — tellingly — serves part of its layout
from `/layouts/terraces_golfnz/`. `controls-vue/services/club-service.js`
exposes `/api/clubs/` with `GetClubDetails`, `GetClubByAlias`,
`GetClubsByName`, `GetClubImages`, `GetFacilityTypes`, `ListMarkers`.

**A bulk index exists.** The live finder at `/find-a-place-to-play` calls
`POST /api/finder/GetVenueResult` and returns **1841 venues**
(`TotalCount` 1841) — but `"Latitude":null,"Longitude":null` on **every
row**, and each row inlines a base64 JPEG. There is **no map view**;
coordinates only come from per-club
`GET /api/clubs/GetClubByAlias?clubAlias=<slug>`, which does return them
(verified: 1770 Golf Club, −24.2447/151.8661, `NoOfHoles` 18, website).
So AU would be a 1841-call job even if it were permitted.

**It is not permitted.** Two independent bars:

1. **Terms of Service, §6.2(c)** (Australian Golf Terms of Service v1.0,
   effective 1 October 2025): users must not *"…use scraping tools, bots,
   or other automated methods; bypass security controls…"*. §7.1 further
   grants only a *"personal, non-commercial"* licence.
2. **Cloudflare bot protection, site-wide.** Every request from a plain
   HTTP client — `GetClubByAlias`, `GetFacilityTypes`,
   `GetVenueResult`, **and even the static `/venue/<slug>` page** —
   returns **403** with a "Just a moment…" interstitial. This is not an
   API quirk; it is an explicit operator signal.

Per the project's standing rule and the BRS Golf precedent (GOLF-97/98),
**that is the finding. No workaround was attempted and none should be.**

**`golflink.com.au` is dead** — 503 to both a plain client and a real
browser. GolfLink's handicap/club functions have been folded into
`golf.com.au`. It is not a separate source; strike it from the handover.

**Therefore Australia is hand-curation**, which is fine, because the work
is largely done: `GOLF-121-australia-research.md` already holds a
reviewed Top 100 table, with `GOLF-121-australia-sources.json` behind it.

---

## 4. One-line verdict per other geography

Probed the same `/api/clubs/GetClubHierarchies` path on each.

| Geography | Verdict |
|---|---|
| **United States** (GHIN/USGA) | Not DotGolf — `usga.org` 403, `ghin.com` 405 (S3-style). GHIN is the USGA's own handicap platform, account-gated; its own research ticket, not a quick win. |
| **Canada** (Golf Canada) | Not DotGolf — `golfcanada.ca` 404s the endpoint. Custom platform. |
| **Spain** (RFEG) | Not DotGolf — `rfegolf.es` 302. Per-country federation site. |
| **France** (ffgolf) | Not DotGolf — `ffgolf.org` 404. |
| **Germany** (DGV) | Not DotGolf — `golf.de` 404. |
| **Sweden** (SGF) | Not DotGolf — `golf.se` 301. |
| **Portugal** (FPG) | Not DotGolf — `fpg.pt` 302. |
| **Italy** (FIG) | Not DotGolf — `federgolf.it` 404. |
| **Netherlands** (NGF) | Not DotGolf — `golf.nl` 301. |
| **Singapore / Hong Kong** | Not DotGolf — `sga.org.sg` 404; `golf.org.hk` did not resolve. |
| **UAE, Thailand, Mauritius** | No national-body DotGolf tenant found. Golf-travel markets served by commercial tee-time aggregators, whose ToS would need checking first — assume hand-curation. |

**There is no pan-European equivalent.** Continental Europe is
per-country federations on bespoke platforms — every one is its own
research ticket. **DotGolf is a Commonwealth/Anglosphere platform**, which
is consistent with its operator: Golf NZ's own T&Cs name it *"New Zealand
Golf Network Limited ('DotGolf')"*. The seven tenants in §1 are
plausibly close to the complete list. **After NZ, there is no cheap next
country.**

---

## 5. Republication terms — all seven read (revised 2026-09-20)

*Not legal advice; this is a practical read for the owner to decide on.*

The first version of this section flagged a republication risk from Golf
NZ's terms and warned it **might** extend to the five nations already
shipped. The owner pushed back — the data is public fact, obtainable
elsewhere — and asked for the other countries' terms to be read. They now
have been, and **the earlier framing was too broad.** Correction below.

### What each body's terms actually say

| Body | Anti-scraping / bot clause | Republication bar | Weight |
|---|---|---|---|
| **Golf Australia** | **YES — ToS §6.2(c), explicit** | Yes (§7.1, personal non-commercial) | **Hard bar** |
| **Scottish Golf** | No | **Yes — strongest.** §2.11: *"no part of the Website may be reproduced or stored in any other website or included in any public or private electronic retrieval system"*; §2.10 reaches *"extracts, information or data"* | Strong |
| **England Golf** | No | Yes. §4.2 bars copying/reproduction/distribution without written consent; §4.3 allows only *"private and personal non-commercial"* use | Moderate |
| **Golf New Zealand** | No | Yes. Personal use only; no reproduction *"in any form on the Internet"* without permission | Moderate |
| **Wales Golf** | No | Boilerplate only. IP claim is limited to *"the design, layout, look, appearance and graphics"* — **does not claim the data** | Weak |
| **Golf Ireland** | No | **None.** Only §1.4: do not *"damage, disable or impair"* the service | None |
| **Handicap Network Africa (SA)** | No | **None — no terms-of-use page exists**, only a privacy notice | None |

### Correcting the earlier version

**The live exposure is two nations, not five.** Ireland and South Africa
have no relevant clause at all, and Wales's IP claim explicitly covers
presentation rather than data. Only **England and Scotland** have terms
that plausibly reach what this project publishes. The previous
"five shipped nations" framing — mine, reinforced by the Developer
session — escalated urgency that the actual terms do not support.

**Australia is the only one of the seven with an anti-automation clause.**
That is the real dividing line, and it holds: AU is different *in kind*,
not merely stricter. Everything else is a copyright/contract question
about republication, not about how the data was fetched.

### How much is the remaining risk actually worth?

The owner's argument is sound as far as it goes:

- **Facts are not copyrightable.** A club's name, coordinates and phone
  number are facts. Copyright protects expression, and a plain club list
  has little to no originality in that sense.
- **The data is genuinely obtainable elsewhere** — OpenStreetMap, club
  websites, the clubs themselves.
- **These are browsewrap terms**, accepted merely by accessing. Their
  enforceability against an anonymous, unregistered client is weak.

Two things cut the other way, and only for England and Scotland:

- **The UK and Ireland have a sui generis database right** (UK: Copyright
  and Rights in Databases Regs 1997; IE: EU Directive 96/9/EC) which
  protects investment in a database *independently of copyright* and bars
  extraction of a substantial part. A national club register is close to
  the paradigm case, and Scottish Golf's §2.11 reads as though drafted to
  invoke it. **NZ, Australia and South Africa have no such right** — for
  those three it is contract only.
- But even that is arguable: *British Horseracing Board v William Hill*
  (ECJ, 2004) held that investment in **creating** data does not count,
  only in **obtaining, verifying or presenting** it. A governing body
  that generates its own membership register may therefore have a
  *weaker* database right, not a stronger one.

**Realistic worst case** for a free, non-commercial trip planner: a
takedown email or an IP block. Litigation over a golf club directory is
vanishingly unlikely — the cost/benefit for a governing body is absurd.
The owner is right that the risk is low.

### Why the recommendation does not change much anyway

**Because compliance is nearly free.** The coordinates can come from
**OpenStreetMap** (ODbL, explicitly reuse-friendly, attribution required)
— and the project *already runs an OSM correction pass*, added in
GOLF-121a. Using DotGolf as an index of *which clubs exist* and OSM as the
source of *published* coordinates costs roughly a day and moots the whole
question for every nation at once.

That is the point worth weighing: the risk premium buys almost nothing,
because the alternative is cheap and already built. A small risk is still
worth avoiding when avoiding it is close to free.

**Suggested disposition — owner's call:**

1. **Do nothing for Ireland, South Africa, Wales.** No clause, no issue.
2. **England and Scotland:** either source published coordinates from OSM
   (preferred — one existing pipeline step), or send one email asking
   permission. Both are cheap; neither is urgent.
3. **New Zealand (GOLF-157):** use DotGolf as the index, OSM for published
   coordinates. Same pattern, decided before the pull rather than after.
4. **Australia:** unchanged — hand-curate, coordinates from OSM, never
   fetch from `golf.com.au`.

Not actioned here: `RISKS.md` and `DECISIONS.md` are BA/PM-owned. See §7.

## 6. Recommendation for GOLF-157

**Split AU and NZ. They are different jobs.**

**New Zealand — bulk pull.** Clone the SA fetch pattern against
`www.golf.co.nz`: `FindClubs {pageSize:5000}` for the list with coords,
`GetClubHierarchies` for the region taxonomy (`ProvinceName` gives a
free North Island / South Island split, `RegionName` gives the map
regions), `GetClubDetails` per club for website and hole count. Follow the
project's fetch-once → JSON intermediate → manual merge pattern. Expect
the zero/sign-flipped coordinate spot-check and the OSM correction pass.
**Resolve §5 before the data goes live** — option 1 or 2.

**Australia — hand-curated Top 100.** The ToS bar is not negotiable, and
the Cloudflare challenge makes it moot anyway. Build
`data/courses-australia.js` from the already-reviewed
`GOLF-121-australia-research.md` table, with coordinates from
**OpenStreetMap**, not from `golf.com.au`. The open decision carried from
GOLF-121e still stands and is untouched by this audit: the Australian
ranking is effectively single-source (Golf Australia Magazine 2026), so
either find a second independent ranking or record a DEC accepting
single-source — **do not merge silently**.

**Consequence for GOLF-157's estimate:** the AU half does not get cheaper
than hand-curation, so the ~100-course manual build stands. The NZ half is
much cheaper than assumed — *if* §5 clears. **NZ also needs a ranking
decision of its own**: 424 clubs is far more than belongs on the map, so
NZ will need the same ringfencing treatment South Africa got in GOLF-121d
(`nzRanked:1` + `courseShownOnMap()`), and therefore a NZ ranking source.
That is not yet sourced and is the one genuinely open piece of NZ work.

**Runbook note (GOLF-157 deliverable 1):** `docs/country-onboarding.md`
should open with the step this ticket turned out to be — **check the
source's terms before writing any fetch code**, with AU as the worked
example of a country that fails at step one.

---

## Method / reproducibility

Throwaway stdlib-Python probes plus the Browser tool for front-end
network inspection, run from the session scratchpad and **not committed**
to `scripts/`, per the ticket. A handful of requests per host, ~2 s apart;
nothing crawled. No API key was used, requested or seen. No attempt was
made to defeat Australia's bot protection.

Probe artefacts (session scratchpad, not in the repo): `probe.py`,
`sweep.sh`, `nz_findclubs.json` (the 424-club NZ intermediate, kept as the
fetch-once JSON should GOLF-157 want it).

---

## 7. Board updates requested (BA/PM)

No BA/PM session was running when this audit completed, so the board is
untouched. Requested:

1. **GOLF-119 → COMPLETE.** One-line summary: *NZ is a one-call bulk pull;
   Australia is ToS-barred and must be hand-curated; no other DotGolf
   tenant exists.* Add a "Recently completed" line.
2. **GOLF-157 — update the estimate and split AU/NZ.** They are different
   jobs (§6). NZ additionally needs a **ranking source** to support
   `nzRanked:1` ringfencing — 424 clubs is far too many for the map. That
   is the one genuinely unsourced piece of NZ work.
3. **A DEC, not a RISK.** On the strength of §5 as revised, this is better
   recorded as a decision — *"published coordinates come from
   OpenStreetMap; DotGolf is used as an index only"* — than as a standing
   risk. It closes the question for all seven nations at once and costs
   about a day, reusing the OSM correction pass built in GOLF-121a.
   If the owner prefers, a narrow RISK covering **England and Scotland
   only** would also be accurate. **Do not** raise it as a five-nation
   risk — that framing was mine and it was wrong; §5 explains why.
4. **New ticket:** replace the name-by-name `GetClubsByName` + difflib step
   in the four GB/Ireland fetch scripts with a single unfiltered
   `FindClubs` call (§1). Owned by the Developer session's area
   (`scripts/`), unblocked by §5.
5. **Strike `golflink.com.au`** from `HANDOVER-GOLF-119.md` and any
   GOLF-157 notes — it is dead (503), folded into `golf.com.au`.
