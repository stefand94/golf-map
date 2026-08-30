/* ============================================================
   data/courses-southafrica.js — GOLF-78: 19 curated notable South
   African golf courses. Sourced via
   scripts/fetch_south_africa_golf_clubs.py against Handicap Network
   Africa's public club-finder API (handicaps.co.za — the same
   "DotGolf"-shaped POST /api/clubs/FindClubs endpoint name already
   integrated for England Golf/Scottish Golf/Wales Golf/Golf Ireland,
   though HNA's own search contract is location/radius-based rather
   than name-text-based; confirmed live via Browser-tool network
   inspection) for coordinates/phone, via a two-step
   GetClubHierarchies (449 clubs nationally) -> FindClubs(clubId)
   lookup. Course selection is a curated set of named anchor courses
   (option (b) from the Phase 24/25 plan — "full sweep" read as
   "cover South Africa properly with this list," not an enumeration
   of all 449 national clubs; worth revisiting with the stakeholder
   now that the national count is visible).

   Fee/architect/note data is NOT from a verified live source this
   round — HNA's FindClubs response carries no fee/architect/note
   fields at all (Website/LogoImage/TeeBookingUrl/MembershipUrl/
   FacilityDescription all null for every course fetched) — marked
   conf:"est" throughout, same convention used for Scotland/Wales/
   Ireland; treat as a starting point, not a quoted price. Fees in
   ZAR (R), South Africa's own currency — a new one for this map,
   distinct from Ireland's £/€ split.

   No stn/walk/book (outside any rail-catchment concept — same as
   C_TOP100/C_SCOTLAND/C_WALES/C_IRELAND); no nearStation — South
   Africa has no comparable GB-wide passenger rail dataset, so the
   field is simply omitted, degrading gracefully exactly as it
   already does for any course missing it. Regions are South
   Africa-specific groupings (Western Cape & Garden Route,
   KwaZulu-Natal, Gauteng, Eastern Cape, Mpumalanga & Kruger, North
   West), appended to REGIONS in data/config.js. See SCHEMA.md.
   ============================================================ */
const C_SOUTHAFRICA=[
{n:"Fancourt (The Links)",lat:-33.9513321,lng:22.4064865,clubInfo:{phone:"044 8040000"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R2,950",we:"R2,950",conf:"est",arch:"Gary Player (Outeniqua/Montagu), Ernie Els (The Links)",spec:"18 · parkland/links",note:"South Africa's best-known golf resort, host of the 2003 Presidents Cup.",topSouthAfrica:1,t100:{za:1},site:"https://www.fancourt.co.za"},
{n:"Leopard Creek Country Club",lat:-25.4595718,lng:31.53917,clubInfo:{phone:"013 791 2000"},r:"Mpumalanga & Kruger",a:"open",band:"premium",wd:"R3,200",we:"R3,200",conf:"est",arch:"Gary Player",spec:"18 · bushveld parkland",note:"Borders Kruger National Park along the Crocodile River; long-time Alfred Dunhill Championship host.",topSouthAfrica:1,t100:{za:2},site:""},
{n:"Durban Country Club",lat:-29.8277149,lng:31.0341911,clubInfo:{phone:"031 313 1716"},r:"KwaZulu-Natal",a:"open",band:"high",wd:"R1,400",we:"R1,400",conf:"est",arch:"Laurie Waters & George Waterman (1922)",spec:"18 · parkland/dunes",note:"Widely regarded South Africa's best course; longtime South African Open host.",topSouthAfrica:1,t100:{za:3},site:""},
{n:"St Francis Links",lat:-34.1610069,lng:24.8266335,clubInfo:{phone:"0422004500"},r:"Eastern Cape",a:"open",band:"high",wd:"R1,100",we:"R1,100",conf:"est",arch:"Jack Nicklaus",spec:"18 · links",note:"A true links routed through coastal dunes at St Francis Bay, near Jeffreys Bay.",topSouthAfrica:1,t100:{za:4},site:""},
{n:"Royal Johannesburg & Kensington (East)",lat:-26.1562252,lng:28.1078758,clubInfo:{phone:"011 640 3021"},r:"Gauteng",a:"open",band:"high",wd:"R950",we:"R950",conf:"est",arch:"Established 1890, multiple redesigns",spec:"18 · parkland",note:"South Africa's most-capped South African Open venue.",topSouthAfrica:1,t100:{za:5},site:""},
{n:"Royal Cape Golf Club",lat:-34.0187073,lng:18.4889278,clubInfo:{phone:"021-7616551"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R850",we:"R850",conf:"est",arch:"Established 1885",spec:"18 · parkland",note:"South Africa's oldest golf club, beneath Table Mountain.",topSouthAfrica:1,t100:{za:6},site:""},
{n:"Pearl Valley Golf Club",lat:-33.8219566,lng:18.9858112,clubInfo:{phone:"021 8678000"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R1,600",we:"R1,600",conf:"est",arch:"Jack Nicklaus",spec:"18 · parkland",note:"A Nicklaus signature course on the Val de Vie Estate near Paarl.",topSouthAfrica:1,t100:{za:7},site:""},
{n:"Arabella Golf Club",lat:-34.3297653,lng:19.0385838,clubInfo:{phone:"+27 (28) 284 0105"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,050",we:"R1,050",conf:"est",arch:"Peter Matkovich",spec:"18 · parkland/estuary",note:"Plays along the Bot River Lagoon near Hermanus, with regular whale-watching from the fairways.",topSouthAfrica:1,t100:{za:8},site:""},
{n:"Gary Player Country Club (Sun City)",lat:-25.2025,lng:27.0527,clubInfo:{phone:"0145571245"},r:"North West",a:"open",band:"premium",wd:"R1,850",we:"R1,850",conf:"est",arch:"Gary Player",spec:"18 · parkland/bushveld",note:"Home of the Nedbank Golf Challenge; the par-5 9th's fairway crosses a lake stocked with real hippos and crocodiles.",topSouthAfrica:1,t100:{za:9},site:""},
{n:"Glendower Golf Club",lat:-26.1607227,lng:28.1422024,clubInfo:{phone:"011 453 1013"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R750",conf:"est",arch:"Robert Grimsdell",spec:"18 · parkland",note:"A frequent SA PGA Championship venue east of Johannesburg.",topSouthAfrica:1,t100:{za:10},site:""},
{n:"Humewood Golf Club",lat:-34.00052,lng:25.6778316,clubInfo:{phone:"041 - 5833011"},r:"Eastern Cape",a:"open",band:"mid",wd:"R850",we:"R850",conf:"est",arch:"S.V. Hotchkin (1929, in the style of Colt)",spec:"18 · links",note:"A genuine seaside links in Port Elizabeth, regularly ranked South Africa's best public-access course.",topSouthAfrica:1,t100:{za:11},site:""},
{n:"Erinvale Golf Club",lat:-34.06605,lng:18.88326,clubInfo:{phone:"021 847 1144"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,150",we:"R1,150",conf:"est",arch:"Gary Player",spec:"18 · parkland",note:"Hosted the 1996 World Cup of Golf, with Helderberg mountain views throughout.",topSouthAfrica:1,t100:{za:12},site:""},
{n:"Zimbali Country Club",lat:-29.5477,lng:31.1976,clubInfo:{phone:"0325381041"},r:"KwaZulu-Natal",a:"open",band:"high",wd:"R1,200",we:"R1,200",conf:"est",arch:"Tom Weiskopf",spec:"18 · coastal forest",note:"Routed through indigenous coastal forest on KwaZulu-Natal's North Coast.",topSouthAfrica:1,t100:{za:13},site:""},
{n:"Simola Golf & Country Estate",lat:-34.0025177,lng:23.03123,clubInfo:{phone:"044 302 9677"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,100",we:"R1,100",conf:"est",arch:"Jack Nicklaus",spec:"18 · hillside parkland",note:"A hillside Nicklaus design above the Knysna Lagoon.",topSouthAfrica:1,t100:{za:14},site:""},
{n:"Oubaai Golf Club",lat:-34.05122,lng:22.4268532,clubInfo:{phone:"0448511263"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,150",we:"R1,150",conf:"est",arch:"Ernie Els",spec:"18 · coastal",note:"An Ernie Els design on the Garden Route coast near Herolds Bay.",topSouthAfrica:1,t100:{za:15},site:""},
{n:"Pinnacle Point Golf Club",lat:-34.1962051,lng:22.0869312,clubInfo:{phone:"(044) 606 5300"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R1,700",we:"R1,700",conf:"est",arch:"Mackenzie & Ebert",spec:"18 · clifftop",note:"Several holes play along dramatic cliffs above the Indian Ocean at Mossel Bay.",topSouthAfrica:1,t100:{za:16},site:""},
{n:"George Golf Club",lat:-33.9533958,lng:22.4453144,clubInfo:{phone:"044 873 6116"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R650",we:"R650",conf:"est",arch:"Established 1885",spec:"18 · parkland",note:"One of South Africa's oldest golf clubs, at the foot of the Outeniqua Mountains.",topSouthAfrica:1,t100:{za:17},site:""},
{n:"Mount Edgecombe Country Club",lat:-29.71694,lng:31.0448685,clubInfo:{phone:"031 5395330"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R700",we:"R700",conf:"est",arch:"Two-course estate, established mid-20th century",spec:"18 · parkland",note:"A well-regarded two-course club on Durban's North Coast, host to national amateur events.",topSouthAfrica:1,t100:{za:18},site:""},
{n:"Houghton Golf Club",lat:-26.1676559,lng:28.0741634,clubInfo:{phone:"0117287337"},r:"Gauteng",a:"open",band:"mid",wd:"R800",we:"R800",conf:"est",arch:"Established 1925",spec:"18 · parkland",note:"A historic Johannesburg club, host to several South African Opens.",topSouthAfrica:1,t100:{za:19},site:""}
];


C.push(...C_SOUTHAFRICA);
