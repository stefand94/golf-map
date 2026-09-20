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
6. **Separate ticket for §8 (ranking sources) — higher priority than §5.**
   Degrade `t100.*` positions to a boolean flag and/or seek permission.
   **Read Golf Australia Magazine's terms before the GOLF-157 AU build**,
   since that ranking is the spine of the AU dataset.

---

## 8. Ranking sources — this one cuts the other way

*Added 2026-09-20 at the owner's request. Not legal advice.*

§5 concluded the club-data risk is low, largely because club names and
coordinates are **facts**. **That argument does not transfer to rankings,
and this section is the more serious of the two.**

A Top 100 list is not a fact. It is original selection and arrangement —
the editorial product itself — and that is protected even under the
authority usually cited for "facts are free" (*Feist*, which expressly
protects original selection and arrangement while denying protection to
the underlying facts). These are also **commercial publishers**, for whom
the ranking *is* the product, rather than governing bodies for whom a club
list is administrative overhead.

### What we use, and what it says

| Source | Used for | robots.txt | Terms |
|---|---|---|---|
| **top100golfcourses.com** | `t100.gbi`; half the `zaRanked` union | `*` may crawl content. **`ClaudeBot` and `GPTBot` `Disallow: /`** — but **`Claude-User`, `Claude-SearchBot`, `ChatGPT-User`, `OAI-SearchBot` are `Allow: /`** | **Strictest found anywhere in this audit — see below** |
| **satop100courses.com** | `zaRanked` union; `t100.za` | none served | **No terms page exists.** But returns **406** to non-browser clients — a WAF bot block |
| **Golf Australia Magazine** | AU Top 100 (GOLF-157) | generic | **Not yet read — read before the AU build** |
| nationalclubgolfer.com, golfmonthly.com | secondary GB&I refs | block many AI crawlers | Not read; low usage |

**Top 100 Golf Courses Ltd, Terms §2** names our exact use case:

> *"All website content — including, but not limited to, design, text,
> graphics, layout, **course rankings**, reviews … are copyright Top 100 …
> You may print or download extracts … only for your **personal use** …
> **None of Top 100's material or information may be used for any
> commercial or public use.** You agree not to copy, reproduce, transmit,
> publish, display, distribute … or **create derivative works** … No part
> … may be **reproduced or stored in or transmitted to any other web
> site** … nor **included in any retrieval system or service** without
> prior written permission."*

English law, English courts. Rankings are named explicitly. There is no
fact/expression argument to fall back on.

**Note the robots.txt nuance, because it is easy to overstate:** they
block *training* crawlers (`ClaudeBot`, `GPTBot`) while explicitly
allowing *user-initiated* agent fetches (`Claude-User`, `ChatGPT-User`).
A human-directed one-off lookup is within what their robots.txt permits.
robots.txt governs **crawling**; §2 governs **republication**, and §2 is
the binding half here.

### What the app actually does with it

Not internal-only. `bestRankBadge()` and `rankChips()` in `js/map.js`
render **`England #7`, `Britain & Ireland #24`, `South Africa #12`** as
pin badges, popup chips and tooltips, and `rankNum()` in `js/util.js`
sorts by position. The published site reproduces the ordered lists.

### Options

1. **Degrade positions to a boolean `notable` flag.** The app's *functional*
   needs are which courses appear on the map (`courseShownOnMap()`,
   `zaRanked`) and a stable sort. A boolean "this is a recognised top-100
   course" is a fact-like derived signal, not a reproduction of an ordered
   list. **Removes nearly all the exposure, keeps map behaviour, costs the
   `#7` badges.** Cheapest real fix.
2. **Ask Top 100 Golf Courses Ltd for permission.** A small company; a free,
   non-commercial planner that links back is plausibly *good* for them.
   One email, and a genuine chance of yes.
3. **Attribute and link, keep the numbers.** Common practice, reduces the
   chance anyone minds — but attribution does not cure a reproduction bar.
   Weakest option; do not mistake it for a fix.
4. **Derive an own ranking** from permissive inputs. Expensive, and the
   result would be worse. Not recommended.

**Recommended: 1 + 2 in parallel** — degrade now because it is cheap, ask
in parallel, restore the numbers if they say yes.

**Proportion:** this is a bigger deal than §5, not an emergency. Realistic
worst case is still a takedown email to a free hobby site. But unlike §5,
**we would not have a good answer**, and the mitigation is a few hours.

**Do not treat satop100courses.com as settled** — no terms page is not
permission. (**Corrected in §10.1:** the claim that "the 406 shows they
block bots" was wrong — robots.txt is allow-all and the site serves bare
`curl` fine. The no-terms-is-not-permission point stands; the bot-blocking
one does not.) Golf Australia Magazine was
the other unread source feeding GOLF-157; it has now been read — see §9a.

---

---

## 9. Ranking sources for GOLF-157 (AU + NZ) — terms read first

Assigned by BA/PM after DEC-022. Both were open questions at the end of
§8; both are now closed. Terms were read **before** any data was pulled,
which is the rule `docs/country-onboarding.md` now opens with.

### 9a. Australia — Golf Australia Magazine (the AU spine)

The AU Top 100 spine recorded in `GOLF-121-australia-sources.json` is
`golfaustralia.com.au/news/ranking-australias-top-100-courses-for-2026-622887`.
Golf Australia Magazine is published by **nextmedia**; terms live at
`nextmedia.com.au/terms-conditions/`. The operative clauses (§3.2/3.3):

> "the entire contents of the Nextmedia network are copyrighted as a
> collective work under the Australian copyright laws. Nextmedia is the
> owner of the copyright in the **selection, coordination, arrangement and
> enhancement** of such content"

> "Except as otherwise expressly permitted under copyright law, you may not
> copy, redistribute, publish, display or commercially exploit any material
> from the Nextmedia network without the express permission of Nextmedia
> and the copyright owner."

**Verdict: same class as top100golfcourses.com.** It claims precisely the
thing a Top 100 ranking consists of — selection and arrangement — so the
"it's only facts" argument from §5 does **not** rescue it, exactly as §8
predicted. It is not a new category and should not be raised as a new
risk: it falls inside the decision Stefan already made in DEC-022. Fold AU
into DEC-022's scope and into the same permission request.

Two things that soften it slightly, neither load-bearing:

- The bar is qualified by *"Except as otherwise expressly permitted under
  copyright law"*, so the fair-dealing carve-out survives rather than being
  contracted away.
- Australia has **no sui generis database right** (unlike the UK/EU), and
  *IceTV v Nine Network* (2009) rejected sweat-of-the-brow. The position
  rests on copyright in the arrangement alone — narrower than the UK
  position behind top100golfcourses.com, not broader.

Note this is a *separate and lesser* bar from the one in §3. §3 is Golf
Australia (the governing body, `golf.org.au`) blocking automated access to
the **club list**; this is nextmedia (a publisher) restricting reuse of the
**ranking**. Same country, unrelated organisations, different problem.

### 9b. New Zealand — the ranking source GOLF-157 actually needs

NZ had no ranking source at all, and it is on the critical path: the bulk
pull in §2 returns **424 clubs**, which cannot all go on the map, so
`nzRanked:1` needs something to rank from (the same ringfencing pattern as
`zaRanked:1`, GOLF-121d).

Four candidates found and checked. **Planet Golf** turned out not to be a
ranking author at all — `planetgolf.com/rankings/new-zealand` is an
*index* of five third-party lists. That is what made the rest findable:

| Source | List | Current | Terms | Verdict |
|---|---|---|---|---|
| **NZ Golf Rankings** | **Top 40** | **2026** | **none exist** | **USE THIS** — rights-holder, see §10.3 |
| NZ Golf Magazine | reprints the Top 40 | 2026 | none exist | outlet, not the owner |
| Australian Golf Digest | NZ Top 50 | 2025 | subscription terms only | Viable — see §10.2 |
| Golfweek | Aus/NZ Top 25 | 2021 | US publisher, stale | No |
| Planet Golf (own) | Top 10 | current | permissive | Too short; useful as index |
| top100golfcourses | NZ list | current | §2 bars it (DEC-022) | No |

**NZ Golf Magazine — recommended, but ask the right party.** The Top 40
is **NZ Golf Rankings'** ranking (`golfrankings.co.nz`, Andrew Whiley,
biennial since 2012); the magazine is one of the outlets that reprints
it. Everything below about the magazine's posture holds, but the
rights-holder is NZGR — see §10.3. Probed seven candidate paths
(`/terms`, `/terms-and-conditions`, `/terms-of-use`, `/terms-conditions`,
`/legal`, `/copyright`, `/disclaimer`) — **all 404**. The footer carries
only privacy-policy, about-us and contact-us. No `robots.txt` (404). The
ranking articles are free, no paywall and no sign-in wall. It is WordPress
and serves a `/feed/` RSS endpoint, i.e. a publisher-provided
machine-readable interface. This is the same posture as Golf Ireland and
HNA South Africa in §5: **no terms to breach**. It is also the *domestic*
national ranking — the direct NZ analogue of Golf Australia Magazine, but
without nextmedia's clause.

*Caveat, and it is a real one:* no terms page is not the same as
permission — the §8 warning about satop100courses.com applies here too.
Attribution should be on the pin either way.

**Golf Digest — see §10.2, this entry tested the wrong company.** I
probed `golfdigest.com` (the US title), which 403s every non-browser
request at the Akamai edge including `robots.txt` itself. But the NZ Top
50 is **Australian** Golf Digest's (`australiangolfdigest.com.au`,
publisher CMMA Digital & Print), which is allow-all in robots, serves
normally, and whose terms page carries no content-use clause at all. The
Akamai finding is real but irrelevant to this list.

**Planet Golf's own terms are the permissive outlier**, worth recording
because it is the only source audited so far that is genuinely clean. The
terms are an unmodified TermsFeed boilerplate — accounts, links,
termination, NSW governing law — and contain **zero** content-use clauses.
A scan for `scrape`, `bot`, `automated`, `crawl`, `spider`, `retrieval
system`, `republish`, `reproduce`, `redistribute`, `derivative`,
`commercial`, `personal use` and `database` returns **no hits at all**.
`robots.txt` is present and empty (0 bytes = nothing disallowed). The
`/copyright` page asserts copyright in non-photographic content but opens
with *"Except where content has been attributed to a third party source"* —
and the ranking lists **are** attributed to third parties, so Planet Golf
expressly disclaims copyright in exactly the lists we would want from it.
Hence: excellent as a **discovery index** for finding who owns which
ranking, not itself a thing to copy from. Photographs are explicitly
reserved to individual photographers — do not take images.

### 9c. The scoping consequence BA/PM should see

The largest NZ ranking we may actually use is **40 courses, out of 424
clubs**. For comparison South Africa shows 107 of 447. A 40-pin New
Zealand may be too thin to feel worth shipping, so this is a product
question, not a data question, and it should be decided before the build
rather than discovered after it:

1. Ship 40 and accept a sparse map, or
2. Widen the inclusion rule for NZ (union of NZ Golf Magazine's 40, Planet
   Golf's Top 10 and the Planet Golf community list — realistically ~45–55,
   still thin), or
3. Use a non-ranking inclusion rule for NZ (e.g. all 18-hole clubs) and let
   `nzRanked:1` mark only the ranked subset, decoupling "on the map" from
   "ranked". This is the only option that makes NZ look like a real map,
   and it needs no additional ranking source.

Option 3 is the recommendation. It is also the cheapest, and it sidesteps
the ranking-terms problem for the map itself, leaving rankings to do only
what they do elsewhere — badges and sort order.

One loose end, flagged rather than hidden: the NZ Golf Magazine instalment
articles I could reach and verify (`/new-zealands-top-40-golf-courses-the-top-5/`
and the `10 to 6` / `20 to 11` parts) are the **2020** edition. Planet Golf
indexes the series as current to 2026, so a newer edition exists; its
article URLs still need locating. That is a data-sourcing task for the
build, not a terms question — the terms answer is unchanged either way.

---

## 10. What a permission request would have to name (and three corrections)

Not on the critical path; done while GOLF-157 is parked and GOLF-161 is
blocked. **No email was sent** — that is the owner's to send, and this
section only establishes who to send it to and what to ask for.

Three things I got wrong earlier turned up in the process. They are
corrected below rather than quietly edited out of §8 and §9b.

### Correction 1 — satop100courses.com does *not* block non-browser clients

§8 said it "406s non-browser clients" and treated that as an intent
signal. **That was wrong.** Its `robots.txt` is `User-agent: * /
Disallow:` — an explicit allow-all — and it publishes a sitemap. The
homepage and the course pages return **200 to a bare `curl` with no
User-Agent at all**, and to `curl/8.4.0` and `Python-urllib/3.11`
identically. The 406 I saw is simply what the site returns for a path
that does not exist; it is its not-found response, not a bot block. I
had generalised one 406 on a guessed URL into a statement about the
site's posture.

What *is* true, and is the honest version: after sustained probing the
host stopped answering me altogether (connection timeouts rather than
any status code). So it does throttle. I stopped there rather than
working around it, which is why the ownership and panel details below
are thinner for this source than for the NZ ones.

Net effect on §8: satop100courses.com is *more* permissive than
recorded, not less. It still has **no terms page**, so the "no terms is
not permission" caveat stands unchanged — but it should not be described
as blocking bots.

### Correction 2 — the NZ Top 50 is *Australian* Golf Digest, a different publisher

§9b recorded "Golf Digest — 403s every non-browser request at the Akamai
edge". That test was against `golfdigest.com`, the US title, and
**`golfdigest.com` is not the publisher of the NZ Top 50.** The list is
Australian Golf Digest's (`australiangolfdigest.com.au`), published by
**CMMA Digital & Print**. I tested the wrong company.

The real publisher's posture is completely different from what §9b says:

- `robots.txt` is allow-all, with `Crawl-delay: 10` (respected here).
- The site serves normally; no edge blocking.
- Its "Terms & Conditions" page is **subscription terms only** —
  delivery, pricing, refunds, damaged magazines. There is **no
  content-use, republication or anti-automation clause anywhere in it.**
- The only IP assertion is a bare footer line: *"© 2026 Australian Golf
  Digest. All rights reserved."*
- It has a `/contact-us/` page, and the list itself is at
  `/2023-2024-new-zealand-top-50/`.

Worth noting a scan for the usual red-flag words returns hits that are
**all false positives** — `bot` inside `both`, `selection` inside
`select2-selection` in the CSS. The counts look alarming and mean
nothing. Read the context, never the count.

Also keep AGD distinct from §9a: **Golf Australia Magazine (nextmedia)
and Australian Golf Digest (CMMA) are different magazines from different
publishers with different terms.** Only nextmedia has the
selection-and-arrangement clause. It would be very easy to merge the two
in a year's time and attribute nextmedia's restriction to the wrong
company.

### Correction 3 — NZ Golf Magazine is an outlet, not the rights-holder

The more useful finding. The NZ Top 40 does not originate with NZ Golf
Magazine — it originates with **NZ Golf Rankings**
(`golfrankings.co.nz`), and the magazine is one of the places it gets
published. From their own About page: the rankings have been compiled
**every two years since 2012** and are *"showcased through the major NZ
Golf publications and international golf publications"*.

So §9b's recommendation stands but the *counterparty changes*: a
permission request goes to NZ Golf Rankings, not to the magazine that
reprints them.

| | |
|---|---|
| **Rights-holder** | NZ Golf Rankings (NZGR) |
| **Named individual** | Andrew Whiley, NZPGA Golf Professional & Rankings Coordinator |
| **Contact** | `contact-us@nzgr.co.nz` (from their own contact page) |
| **The list** | Top 40, biennial since 2012, on the homepage at `#top-40-courses` |
| **Per-course pages** | `/golf-courses/<slug>` |
| **robots.txt** | sitemap line only — no restrictions |
| **Terms** | none — five candidate paths probed, all 404 |

This is the best-placed request of any source in this audit, and not only
because there are no terms in the way. Their stated mission is to
*"showcase and celebrate the nation's finest golf courses, inviting both
local players and international visitors"*, and the site exists to share
the results with *"local and international golfers"*. The origin story on
the About page is a professional's frustration that good New Zealand
courses **were not being noticed by international visitors**. A free map
that puts those courses in front of exactly those visitors is aligned
with why the ranking exists, which is a materially better position to ask
from than top100golfcourses.com, where the ranking *is* the product.

### What the email should actually ask for

The same wording works for all of them, and being narrow is the point —
most of what makes these sources valuable to their owners is precisely
what we do not want:

- **What we want:** the **rank position only** — the integer — displayed
  as a badge against a course, plus the right to use it as a sort order.
- **What we are not asking for and will not take:** the reviews, the
  written descriptions, the photographs (explicitly reserved to
  individual photographers on Planet Golf, and likely elsewhere), the
  scoring, the criteria breakdowns, or the ranking as a browsable list.
  The app never reproduces a Top 100 *as a list* — which matters,
  because the list as a list is the copyrightable selection and
  arrangement, and a position attached to a course is the part closest
  to bare fact.
- **What they get:** attribution on the badge and a link back to the
  ranking.
- **What the site is:** free, no ads, no accounts, no revenue, no
  tracking. Worth stating plainly, because DEC-022's acceptability is
  coupled to the site staying non-commercial and unpublicised — if that
  ever changes, every permission here was granted on a premise that no
  longer holds and they all need revisiting.

Priority if only some get sent: **NZ Golf Rankings first** (best
alignment, no terms, real contact, and it unblocks NZ), then Australian
Golf Digest (no content clause, so possibly a formality), then
top100golfcourses.com and nextmedia together per DEC-022 — those two are
the actual asks, since both have clauses that squarely cover what we do.

---

## Method / reproducibility

Throwaway stdlib-Python probes plus the Browser tool for front-end
network inspection, run from the session scratchpad and **not committed**
to `scripts/`, per the ticket. A handful of requests per host, ~2 s apart;
nothing crawled. No API key was used, requested or seen. No attempt was
made to defeat Australia's bot protection, nor Golf Digest's (§9b).

For §9 the same rules applied: terms and `robots.txt` first, then a small
number of page reads. The Planet Golf rankings index is client-rendered,
so it was read with the Browser tool rather than guessed at from URLs —
the plain-HTTP fetch returns a shell with no course names in it, and the
near-identical byte counts across `/rankings`, `/rankings/australia` and
`/rankings/new-zealand` look like a soft-404 until you render them. The
site's consent banner was left untouched and nothing was accepted.

§10 added three source-posture checks on top of that: response codes by
User-Agent (bare `curl`, `curl/8.4.0`, `Python-urllib/3.11`, browser) to
tell a real bot block apart from a not-found response, `robots.txt` and
terms for each publisher, and the published contact route. Australian
Golf Digest declares `Crawl-delay: 10` and it was honoured.
satop100courses.com stopped answering after sustained probing; I stopped
rather than working around it, which is why its ownership details are
thinner than the others'. No email was sent to any of these parties —
that is the owner's to send.

Probe artefacts (`probe.py`, `sweep.sh`, `nz_findclubs.json` — the
424-club NZ intermediate) were written to the **session scratchpad**, not
the repo, per the ticket. **Do not plan on them surviving:** that
directory is session-scoped and goes away with the session, so an earlier
version of this line calling the NZ JSON "kept" was wrong.

Nothing is lost by that. The NZ pull is a **single unauthenticated
request**, and §2 records everything needed to redo it — host, endpoint,
exact payload, and the coordinate/null/name-join gotchas that the raw
response will not tell you. When GOLF-157 unparks, re-fetch into
`scripts/output/` (gitignored, which is where the fetch-once intermediate
belongs) rather than hunting for this file. The reproduction recipe is
the durable artefact here, not the JSON.

---
