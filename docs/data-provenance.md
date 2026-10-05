# Data provenance

GOLF-236. Where every piece of data the site ships or fetches comes from,
under what terms, what credit we show, and what restricts it. It is written
for a buyer's or licensee's due diligence, so it states the gaps plainly.

Counts are from the data files at `origin/main` `c6b770f` (2026-10-04),
loaded the way the app loads them. The fee and courseStats counts (§2.4, §2.9) were
recounted after GOLF-239 on 2026-10-05. A number with no other citation was
counted from the data files on that date. Re-run the counts before you quote
them anywhere else.

Every `data/*.js` file and every live API the browser or the Worker calls is
listed in §1. The sections after it give the detail. **§9 is the open risks.**

---

## 1. Inventory

| File / service | What it holds | Section |
|---|---|---|
| `data/courses-london.js` | 123 London-area courses | §2 |
| `data/courses-top100.js` | 114 England Top 100 courses | §2 |
| `data/courses-scotland.js` | 100 Scottish courses | §2 |
| `data/courses-wales.js` | 38 Welsh courses | §2 |
| `data/courses-ireland.js` | 83 Irish courses (island of Ireland) | §2 |
| `data/courses-southafrica.js` | 421 South African courses, 107 shown | §2 |
| `data/course-ids.js` | Frozen v1 `index → id` table | §5 |
| `data/config.js` | Bands, regions, architects, London rail lines `R`, `ROUTE_LINE`, `ISOLATED` | §4, §5 |
| `data/stations.js` | GB rail stations | §4 |
| `data/rail-geometry.js` | TfL track polylines | §4 |
| `data/pois-{england,scotland,wales,ireland,southafrica}.js` | Notable sights for the itinerary | §3 |
| `data/pois-categories.js` | POI category list | §3 |
| Worker → `api.heigit.org` | ORS driving directions | §6 |
| Worker → `api.openrouteservice.org` | ORS geocoding (place search) | §6 |
| Worker → Overpass API | Live hotels and heritage POIs | §6 |
| Browser → Esri ArcGIS Online | Map tiles (street + satellite) | §6 |
| Browser → `static.cloudflareinsights.com` | Cloudflare Web Analytics beacon | §6 |

No other host is contacted for data. The Worker's upstream URLs are in
`scripts/cloudflare-worker/ors-proxy.js`. The browser's are the tile URLs in
`js/map.js` and the analytics tag in `index.html` (GOLF-222).

---

## 2. Course data

### 2.1 Which courses exist (the course list)

- **Source:** each nation's governing-body club finder, the "DotGolf" API
  (England Golf, Scottish Golf, Wales Golf, Golf Ireland, Handicap Network
  Africa). Scripts: `scripts/fetch_{england,scottish,wales,ireland,south_africa}_golf_clubs.py`.
  The curated Top 100 / London lists were chosen by hand in the 2026-H1
  phases (`.claude/plans/history/2026-H1-archive.md`).
- **Terms:** all seven bodies' terms were read in GOLF-119
  (`docs/project/GOLF-119-coverage-audit.md` §5). **Only England (§4.2/4.3)
  and Scotland (§2.10/2.11)** restrict republication. Ireland and HNA have no
  relevant clause. Wales's IP claim covers the site's look, not the data.
- **Decision:** DEC-023 says DotGolf is used **as an index only**: it tells us
  which clubs exist, and the facts we publish come from elsewhere.
- **Restriction:** that holds for coordinates (§2.2). It does **not** yet
  hold for some other fields copied from England Golf (§2.6, §2.7). Those are
  open risks R1 and R2.

### 2.2 Coordinates (`lat`, `lng`, `coordSrc`, `osm`)

- **Source:**
  - 339 records carry `coordSrc:"osm"` and an `osm` element reference.
    Their position is the OpenStreetMap golf-course feature. Scripts:
    `scripts/fetch_osm_golf_courses.py` and `scripts/merge_osm_coords.py`
    (GOLF-161, `637a36f`; complete per board commit `fd6f179`) for 292, and
    `scripts/fetch_golf238_osm.py` and `scripts/merge_golf238_coords.py`
    (GOLF-238, 2026-10-05) for 47 more. SA's OSM pass is
    `scripts/fetch_sa_golf_overpass.py` (GOLF-121a).
  - The remaining 540 have no `coordSrc`. Wales, Ireland and South Africa
    came from DotGolf or hand placement. DEC-023 records that those bodies'
    terms don't restrict this.
  - GOLF-183 (`9863425`) hand-corrected 11 flagged positions.
- **The England/Scotland gap (GOLF-238):** DEC-023 says England and
  Scotland coordinates must be OSM. GOLF-161 left 49 shown records without
  it (12 London, 19 Top 100, 18 Scotland; the 5 `dupOf` London records are
  excluded). Most were multi-course venues that GOLF-161's matcher refused
  on purpose, because one OSM object backed several of our courses.
  GOLF-238 matched them by hand against a fresh Overpass pull:
  - **47 re-sourced.** A course-specific OSM polygon where one exists
    (Carnoustie, Peterhead, Monifieth, Royal Dornoch), otherwise the venue's
    polygon, shared by its sibling courses (the map de-stacks those pins).
    Two unnamed polygons were accepted because each is the only course at
    that spot (Godstone, Kington).
  - **43 moved more than 300 m.** All are the same club's feature. The old
    pins mostly sat on the clubhouse (consistent with a directory address);
    the new ones are the course centroid, as GOLF-161 used. The largest is
    Walton Heath (New), 1.4 km. Full list:
    `scripts/output/golf238_merge_report.json` (gitignored).
  - **2 unresolved, old coordinate kept:** Sevenoaks Town (OSM has only an
    unnamed clubhouse) and Cabot Highlands Old Petty (not mapped; the nearest
    feature is Castle Stuart, a different course). Their source is still
    unrecorded. Open risk R3.
- **Licence:** OSM data is © OpenStreetMap contributors, **ODbL 1.0**.
- **Attribution shown:** "Data © OpenStreetMap contributors (ODbL)" (widened
  from "Course positions" in GOLF-240). It is in the map's credits on every
  base layer, added outside `esriBaseLayers()` so a layer switch can't drop
  it (`DATA_CREDIT`, `js/map.js`), and on the shared view's map
  (`js/trip-share.js`). The privacy dialog's Credits list repeats it in full
  (`privacyOpen()`, `js/trip-ui.js`).
- **Share-alike:** see §7.

### 2.3 Course names (`n`)

- **Source:** the club's own name, as listed by the governing body or the
  club. Normalised by `scripts/backfill_names.py`.
- **Terms:** GOLF-167 (BACKLOG, accepted) concluded that a club's name is a
  fact, not a protectable work. No restriction.
- **Attribution:** none needed.

### 2.4 Green fees (`feeV2`, legacy `wd`/`we`)

- **Method:** GOLF-97 and GOLF-98 entered fees by hand or by research agent,
  one course at a time. Background Haiku agents searched the web for each
  club's published rate and returned JSON. That JSON was merged by hand or by
  a small script, and never written to the data directly (CLAUDE.md,
  "Data-entry/research jobs"). GOLF-120 set the schema and GOLF-171 the
  confidence levels. `scripts/test_fee_v2.js` checks the shape.
- **The BRS lesson:** in Phase 34, the BRS Golf booking site was found to
  forbid scraping (archive, GOLF-97/98 entry). It was dropped as a source.
  **Zero `feeV2` records cite a BRS Golf URL** (audit on 2026-10-04).
- **GOLF-239 re-verification (2026-10-05):** every fee whose only source
  was a third party, plus the 11 shown fees that had no source at all, was
  re-checked against the club's own site (146 records). Research agents
  returned JSON. Each claimed price was then audited by a second agent,
  which had to see the price on the club or operator page itself, and some
  were spot-checked by hand. The first pass cited club homepages that show
  no price for many Irish and South African courses, so all of those were
  rejected. Outcome:
  - **52 verified** at the club or operator site (`lastVerified`
    2026-10-05, `conf:"club"`), plus 1 `poa` (the club's own page says
    rates on application).
  - **90 dropped** to "Ask club" (`conf:"est"`, no `feeV2`, no v1 `fee`):
    no price could be seen on the club's own site, the only rates were for
    2024 or earlier, or the site was down.
  - **3 kept** on londongolfcourses.com, one of the three sources whose
    terms allow it (§8).
  - Askernish had been carrying Lundin's fee since an earlier merge; both
    now cite their own club.
- **Coverage:**
  - **475 records have `feeV2`. Every one carries a source URL.**
  - By confidence: 387 `published-rates`, 46 `estimated`, 29 `poa` and
    13 `published-from-only`.
- **Where the sources are:**
  - **Clubs' or operators' own sites:** all of them except the 3 below. A
    club's own published price list is the club telling the public its
    prices, so the risk is low.
  - **londongolfcourses.com, 3 records** (Hendon, the Hertsmere,
    Barnehurst). Its §9 bars only substantial extraction.
  - **No `feeV2` cites an aggregator whose terms forbid reuse or are
    unclear** (golfshake.com, leadingcourses.com, where2golf.com,
    top100golfcourses.com and the rest, see §8). `scripts/test_data.js`
    does not enforce this yet. Re-check before a bulk fee import.
- **Untraceable fees:** 314 records still have priced legacy `wd`/`we`
  with no source. **None of them is shown on the map.** All are hidden
  South African bulk-pull courses (GOLF-121a/d). R13 is now limited to
  those, and matters only if the "show all" toggle ships.
- **Attribution shown:** none. `feeV2.source` is stored but not rendered
  anywhere (no `js/` file reads it for display).

### 2.5 `notable` and the remaining `t100` labels

- **What it is:** `notable:1` marks 352 courses that held a numeric position
  on a published ranking list. That includes the England, Scotland, Wales,
  Ireland and SA Top 100s, plus Greater London, GB&I, London & SE and Surrey
  (`SCHEMA.md`). The numbers were deleted in GOLF-160 (`f9b4b5a`, live as
  build `12977b8ec9`) per DEC-038. The boolean drives the "top courses
  first" sort and the GB ranked pin style (`ranked()` in `js/map.js`,
  `notableFirst()` in `js/util.js`).
- **Plainly:** the flag is **still derived from those lists**, mostly
  top100golfcourses.com's. It is now a yes/no, with no position and no
  order, but the *set* of courses is their selection. Under the UK/IE
  *sui generis* database right, a selection whose making took substantial
  investment can be protected even where no single fact is. *BHB v William
  Hill* weakens this, because it protects the *obtaining* of data, not its
  *creation*, and a ranking is created. That argument helps us, but it has
  not been tested for rankings. Open risk R5.
- **Removing it:** removable within a week, per DEC-038. Drop the field from
  the six course files in place, and replace the sort and pin style with a
  neutral one. No share link depends on it.
- **The positions file:** the ordered lists and each course's former
  positions are kept privately at
  `scripts/output/golf-160-rank-positions.json`. That file is gitignored,
  never committed and never deployed. It is in the dev's worktree and the
  main checkout only.
- **Remaining `t100` string labels:** a few records keep `t100:{gl:"…"}` or
  similar text labels with no number. Verulam's reads "Hertfordshire list".
  Same derivation, same risk.

### 2.6 Club info (`clubInfo.phone`, `.membership`, `.teeBooking`)

- **Source:** England Golf's club-finder API, and the equivalent DotGolf
  finders for the other nations. Scripts: `scripts/fetch_england_golf_clubs.py`
  and siblings, merged by `scripts/merge_club_details.py` (GOLF-11,
  `SCHEMA.md`).
- **Counts:** 726 records carry a phone number: London 6, Top 100 111,
  Scotland 99, Wales 35, Ireland 81, SA 394.
- **Blurbs: removed (GOLF-237).** 22 records used to carry
  `clubInfo.blurb`, England Golf's `FacilityDescription` prose (6 verbatim,
  16 reworded from it), shown in the popup as "— England Golf: …". The
  field was deleted from the data in place, the popup no longer reads it,
  `scripts/merge_club_details.py` no longer writes it, and
  `scripts/test_data.js` fails if it comes back. The raw text survives only
  in the gitignored `scripts/output/england_golf_clubs.json`, which is never
  deployed.
- **Terms:** England §4.2/4.3 and Scotland §2.10/2.11 restrict republication
  (GOLF-119 §5). DEC-023 moved **only coordinates** off DotGolf. The phone
  numbers for 216 England/Scotland records still come straight from the
  restricted APIs. A phone number is a fact the club publishes itself, so
  that is low risk. Open risk R1.

### 2.7 Club logos: removed (GOLF-237)

- **Was:** 71 `logo` fields (68 Top 100, 3 London) pointing at 67 distinct
  files, plus 4 unreferenced files: 71 files in `images/clubs/`. All were
  decoded from England Golf's `LogoImage` blob (GOLF-21).
- **How we know there was no other source:** every file in `images/clubs/`
  was added by the one GOLF-21 commit (`95aa809`), and the 71 files match
  the 71 entries of `scripts/output/club_images.json`, the England Golf
  decode script's output map, one to one.
- **Now:** the fields, all 71 files and both logo scripts are deleted.
  `scripts/test_data.js` fails on any `logo` field, so a new logo source
  has to pass a terms check first. No logos are shipped.

### 2.8 Course photos: removed (GOLF-240)

- **Was:** Wikimedia Commons photos, mostly geograph.org.uk, under CC BY-SA
  and similar licences (GOLF-88, `scripts/fetch_course_images.py` and
  `scripts/merge_course_images.py`). 260 `photo` fields and 298 files in
  `images/courses/` (17.3 MB).
- **Why removed:** GOLF-225 (`e1c5d8d`) stopped showing them, so their
  credit appeared nowhere, yet the files were still served. CC BY-SA needs
  the credit wherever the work is distributed.
- **Now:** all fields and files are deleted. `scripts/test_data.js` fails
  on any `photo` field. The scripts are kept, for a future return that
  ships with a visible credit line.

### 2.9 Course stats: removed (GOLF-239)

- **Was:** par, slope and rating on 69 England records (52 London,
  17 Top 100). They came from golfapi.uk through RapidAPI (GOLF-12/13,
  `scripts/fetch_course_stats.py` and `scripts/merge_course_stats.py`) and
  pre-filled the handicap calculator.
- **Why removed:** RapidAPI's terms defer to each API provider. golfapi.uk
  publishes no terms, and its RapidAPI listing says the slope and rating
  come straight from the England Golf, Scottish Golf and Wales Golf APIs.
  England Golf's terms restrict republishing that data.
- **Now:** all 69 fields are deleted. The calculator leaves the fields
  blank, and a visitor can still type them or add tees in the editor.
  `scripts/test_data.js` fails on any `courseStats` field, so a new source
  has to pass a terms check first. The scripts are kept, marked retired.

### 2.10 South Africa `zaRanked`

- **Origin:** GOLF-121d. `zaRanked:1` marks 107 SA courses that appear on
  the **union of satop100courses.com and Top100GolfCourses.com** SA lists
  (`SCHEMA.md`). `courseShownOnMap()` (`js/explore.js`) shows only these
  107 of the 421 SA records.
- **Restriction:** like `notable`, the set is derived from third-party
  rankings, partly the same rights holder. It also decides which SA courses
  the product shows at all. Removing it means choosing another SA filter.
  Open risk R5.

### 2.11 Notes, architects, bands (`note`, `arch`, `band`, `spec`)

- **Source:** written in-house by research sessions, from many sources.
  `arch` and `band` are facts (designer, price band).
- **Risk:** low. Notes were written by research agents that had read
  third-party descriptions. A sentence could sit close to its source. The
  GOLF-160 rewording pass removed rank-number mentions but did not check
  for paraphrase. Open risk R11.

### 2.12 Booking and site links (`site`, `book`)

- Links to the club's own or a booking site. A link is not a copy. No
  restriction. Affiliate deeplinks (Travelpayouts and Stay22, GOLF-230,
  DEC-038, GOLF-242) are covered by those programmes' own terms, not by data provenance.

---

## 3. POIs (`data/pois-*.js`, `data/pois-categories.js`)

- **Source:** OpenStreetMap, pulled once by `scripts/fetch_pois.py`. Then
  scored, deduped and categorised by `scripts/score_pois.py`,
  `scripts/dedupe_pois.py`, `scripts/recategorise_pois.py` and
  `scripts/build_poi_data.py` (GOLF-148). The score uses OSM's
  Wikidata/Wikipedia tags. Each file header says "Generated by
  `scripts/build_poi_data.py`; do not hand-edit". England alone has 12,970
  POIs.
- **Licence:** ODbL 1.0. Wikidata is CC0.
- **Attribution shown:** the map credit reads "Data © OpenStreetMap
  contributors (ODbL)" (GOLF-240), which covers the POI layer (GOLF-207)
  shown on the same map. The privacy dialog's Credits list names course
  positions, sights and hotels explicitly. The itinerary's POI cards in
  the side pane have no credit of their own; the map beside them carries
  it.
- **Restriction:** share-alike; see §7.
- `pois-categories.js` is our own category list. No external source.

---

## 4. Rail (`data/stations.js`, `data/rail-geometry.js`, rail parts of `data/config.js`)

- **Stations:** `scripts/fetch_rail_stations.py`, fetched 2026-08-25 (file
  header).
  - The TfL StopPoint API (`api.tfl.gov.uk`) gives Tube, Overground,
    Elizabeth line and DLR. TfL's open-data terms require "Powered by TfL
    Open Data" attribution and the OS/Geomni credits.
  - The `davwheat/uk-railway-stations` GitHub CSV gives National Rail. It
    is **ODbL 1.0** (repo licence, checked 2026-10-04), and its README asks
    for credit to its author, Trainline EU and Trainline's sources.
- **Track geometry:** `rail-geometry.js` was traced from OpenStreetMap
  route relations by `scripts/fetch_rail_geometry.py` and
  `scripts/merge_rail_geometry.py`. ODbL.
- **Derived fields:** `nearStation` (GOLF-10, computed by
  `scripts/compute_nearest_stations.py` and
  `scripts/merge_nearest_stations.py`) and `stn`/`walk` are computed from
  the above.
- **Shown?** The rail layer is **hidden** behind `RAIL_FEATURE=false`
  (GOLF-110, DEC-008). The files still load, so they are distributed even
  though they aren't drawn.
- **Attribution shown:** since GOLF-240, in the privacy dialog's Credits
  list: "Powered by TfL Open Data", the OS Crown copyright and Geomni lines
  TfL asks for, and the uk-railway-stations credit. Not on the map itself,
  because the rail layer isn't drawn; the credit goes on the map if
  `RAIL_FEATURE` is ever turned on.

---

## 5. Internal files with no external source

- `data/course-ids.js`: our frozen `index → id` table (GOLF-163). Generated
  from our own data and never regenerated.
- `data/config.js`: bands, regions, architects list and London line
  definitions. Hand-written. The station names in `R` are facts.

---

## 6. Live services

| Service | Called from | Purpose | Terms | Credit shown |
|---|---|---|---|---|
| OpenRouteService directions, `api.heigit.org` | Worker | Drive legs | ORS/HeiGIT terms. Free tier is non-commercial. **Commercial use unconfirmed** (GOLF-234) | "routes © openrouteservice.org by HeiGIT" in the map credits and on the shared view's map (GOLF-240), and in the privacy dialog |
| OpenRouteService geocoding, `api.openrouteservice.org` | Worker | Place search | As above. Geocoding intermittently 403s (CLAUDE.md) | As above |
| Overpass API (OSM) | Worker | Hotels only: the "Add a stay" picker (GOLF-96) and the viewport hotel layer (GOLF-142). The live heritage mode was removed in GOLF-156 | ODbL data. Overpass has a fair-use policy, with rate limits handled by the Worker cache | Covered only by the general OSM credit. R12 |
| Esri ArcGIS Online tiles | Browser | Street and satellite base maps | Keyless use, with attribution, accepted while the site is **non-commercial** (DEC-036, gate item 6). **Affiliate income makes the site commercial (DEC-038); a commercial key is GOLF-234** | Esri's attribution string, via `esriBaseLayers()` in `js/map.js` |
| Cloudflare Web Analytics | Browser | Visit counts (GOLF-222) | Cloudflare's terms. No cookies | Named in the privacy note (GOLF-227, `privacyOpen()` in `js/trip-ui.js`) |

No API key reaches the browser. ORS keys are Worker secrets, set in the
dashboard by Stefan.

### 6.1 Klook destination ids: retired (GOLF-242, 2026-10-05)

- GOLF-233's hand-collected table of 10 Klook destination ids
  (`AFF_KLOOK_DESTS`) has been **removed from `js/affiliate.js`**. No Klook
  ids are in the code any more.
- Hotel "Check prices" links now go to **Stay22**'s Allez deeplink
  (`stay22.com/allez/roam`, aid `golftripper`, a public partner id). It
  takes the stay's own lat/lng, so there is no destination table to
  collect, keep or license. The app sends only the stay's position, the
  dates when set, the group size and a placement tag (`campaign=hotel`),
  and only when someone clicks. Stays with no coordinates get no link.
- Klook remains a joined Travelpayouts programme for a possible tours
  stage, but nothing links to it today. The car-hire link
  (EconomyBookings via Travelpayouts) is unchanged.
- `scripts/output/golf-233-klook-dests.json` (gitignored) is the only
  remaining copy of the old table, kept for reference.
- KKday had no hotel coverage in any of the 10 towns, so it was never used.

---

## 7. OSM, ODbL and a licensee

ODbL's share-alike applies to a **Derivative Database** that is **publicly
used**. In plain terms:

- **What is ODbL-derived here:** 339 course positions, every POI in
  `pois-*.js`, `rail-geometry.js`, SA positions from the OSM pass, and live
  hotel/POI results.
- **Showing it on a map** (a "Produced Work") needs only the attribution we
  already show. The map does not have to be ODbL.
- **If a licensee extracts or redistributes the data as a database**, for
  example by taking `data/courses-*.js` into their own product, then:
  - the OSM-derived parts must be offered under ODbL, or a compatible
    licence, together with the attribution;
  - and since our course records mix OSM coordinates with other fields in
    one record, a licensee could be forced to release the whole merged
    course table under ODbL, or to separate the OSM fields out first.
- **What we can't do:** licence the OSM-derived coordinates and POIs to
  anyone exclusively, or on terms stricter than ODbL.
- **What a licensee could do instead:** license the non-OSM fields (fees,
  notes, ids, structure) alone, with coordinates re-derived by them from
  OSM under their own ODbL compliance, or from the clubs.

Open risk R12.

---

## 8. What was checked and how

- **Field counts:** the data files were loaded in the app's own order in a
  Node `vm` sandbox, and each field counted.
- **Fee source audit:** every string under a `source`/`url` key in `feeV2`
  was collected, and its hostname tallied.
- **Live site:** the rendering of blurbs, logos, attribution and photos was
  checked against `js/map.js` on `main`. During GOLF-160 the live site's
  879 popups were scanned for leftover rank numbers.
- **Fee source terms (GOLF-239 phase 1, 2026-10-05):** each fee source's
  terms page was read and classified.
  - **Forbid reuse (93 fees then):** golfshake.com 50 (terms cl. 11.3,
    11.8), leadingcourses.com 19, where2golf.com 11, thesocialgolfer.com 4,
    top100golfcourses.com 3, nationalclubgolfer.com 2, golfpass.com 2,
    golfmonthly.com 1 (Future plc terms), allsquaregolf.com 1.
  - **Unclear (36):** satop100courses 10, gogolfing.ie 7, golflux 4,
    litenews 3, todays-golfer 2 (its terms page returns 402), golfcards 2,
    1golf.eu 2, and single fees from ukgolfguy, golftipsmag,
    destinationgolf, localgreenfees, teefee and sagolfers.
  - **Allow it (6):** londongolfcourses.com (§9 bars only substantial
    extraction), birdiebrae.co.uk (with credit and link), golfempire.co.uk
    (brief extracts with attribution).
  - Phase 2 then re-verified all of them at the clubs' own sites (§2.4).
- **courseStats terms (GOLF-239):** RapidAPI's terms defer to the API
  provider. golfapi.uk publishes no terms, and its listing names England
  Golf, Scottish Golf and Wales Golf as the source (§2.9).
- **Not done:** apart from GOLF-239 and the terms already covered in
  GOLF-119 and DEC-022/023/036/038, no third-party terms were read. Every
  "unread" above means exactly that.

---

## 9. Open risks

Ordered by how much they would matter to a buyer or licensee.

1. **R1. Phone numbers from the restricted APIs.** 216 England/Scotland
   phone numbers still come from England Golf and Scottish Golf. A phone
   number is a fact the club publishes, so this is low risk. (The England
   Golf blurbs, the higher risk here, were removed in GOLF-237.)
2. **R2. Closed by GOLF-237.** The 71 England Golf club logos and their
   files were removed, and `test_data.js` blocks their return.
3. **R3. 2 England/Scotland coordinates are not from OSM** (was 49;
   GOLF-238 re-sourced 47). Sevenoaks Town and Cabot Highlands Old Petty
   still break DEC-023's rule, because OSM has nothing that can be tied to
   them. Nothing in the record says where their positions came from.
4. **R4. Tiles and routing are not cleared for commercial use.** Esri was
   accepted as keyless only while the site was non-commercial. ORS
   commercial terms are unconfirmed. DEC-038 makes the site commercial the
   day affiliate links go live (GOLF-234).
5. **R5. `notable` and `zaRanked` are derived from third-party rankings.**
   The 352-course `notable` set and the 107-course SA filter are selections
   made by top100golfcourses.com and satop100courses.com. The UK/IE
   database-right exposure is real, though weakened by *BHB v William Hill*.
   It can be removed within a week (DEC-038). The positions are kept
   privately in `scripts/output/golf-160-rank-positions.json`.
6. **R6. Closed by GOLF-239.** No fee cites an aggregator whose terms
   forbid reuse or are unclear. The 3 that remain cite londongolfcourses.com,
   whose terms allow it (§2.4).
7. **R7. Closed by GOLF-239.** The 69 `courseStats` records, which traced
   back to England Golf, were removed, and `test_data.js` blocks their return.
8. **R8. Closed by GOLF-240.** The 298 uncredited CC BY-SA photo files
   and the 260 `photo` fields were deleted.
9. **R9. Rail credit is in the dialog only.** GOLF-240 added the TfL and
   uk-railway-stations (ODbL) credits to the privacy dialog. If the rail
   layer is ever turned on, they must move onto the map.
10. **R10. Closed by GOLF-240.** ORS/HeiGIT is credited in the map credits,
    on the shared map and in the privacy dialog.
11. **R11. Notes may paraphrase their sources.** The research-agent-written
    notes were never checked for closeness to their sources. Low risk.
12. **R12. ODbL share-alike constrains licensing, and the OSM credit is
    narrow.** OSM-derived coordinates and POIs can't be licensed
    exclusively, and a licensee who redistributes the course table may have
    to release it under ODbL (§7). (The narrow "course positions" credit
    was widened to all OSM data in GOLF-240.)
13. **R13. 314 hidden legacy fees have no source.** These are free-text
    `wd`/`we` on the hidden South African bulk-pull records. None is shown
    since GOLF-239. Re-verify or drop them before any "show all" toggle.
