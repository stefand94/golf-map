/* ============================================================
   data/courses-southafrica.js — GOLF-78: originally 19 curated
   notable South African golf courses, grown to 23 by the 2026-08-30
   multi-course estate audit, then broadened to 99 (2026-09-02) at
   the stakeholder's explicit request ("do all the top 100 courses
   in SA") by diffing the existing list against satop100courses.com's
   full Top 100-by-name list and adding every course missing from it
   (~76 new entries). The new batch's fee/architect/note fields are
   deliberately generic placeholders (band:"mid", wd/we:"R750"/"R850",
   arch:"Unknown", spec:"18", note:"") — unlike the original 19/23,
   which had hand-researched fee/arch/note text (still marked
   conf:"est"), these were added purely to get coordinates/region
   right at Top 100 scale; revisit with real per-course research
   before trusting the fee figures. Sourced via
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

   2026-08-30 multi-course audit (mirrors the same pass on Ireland):
   three of the original 19 clubs are multi-course estates where a
   second (or third) course was missing. Fancourt (3 courses: The
   Links, Montagu, Outeniqua — only The Links was listed, and its
   arch/spec were corrected to name Ernie Els as the Links' own
   designer, not Player's Montagu/Outeniqua credit), Mount Edgecombe
   (2: The Woods, The Lakes — only one undifferentiated entry, now
   attributed to The Woods), Gary Player CC/Sun City (2: Gary Player
   CC, Lost City — only Gary Player CC). New sibling entries share
   their parent's coordinates (same estate/clubhouse) and carry
   topSouthAfrica:1 for nation-gating but no t100 rank, consistent
   with the Ireland audit's approach.
   ============================================================ */
const C_SOUTHAFRICA=[
{n:"Fancourt (The Links)",lat:-33.9513321,lng:22.4064865,clubInfo:{phone:"044 8040000"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R2,950",we:"R2,950",conf:"est",arch:"Ernie Els",spec:"18 · links",note:"South Africa's best-known golf resort's championship course, host of the 2003 Presidents Cup.",topSouthAfrica:1,t100:{za:1},site:"https://www.fancourt.co.za"},
{n:"Fancourt (Montagu)",lat:-33.9513321,lng:22.4064865,clubInfo:{phone:"044 8040000"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,800",we:"R1,800",conf:"est",arch:"Gary Player",spec:"18 · parkland",note:"One of Fancourt's two other Gary Player 18s alongside The Links, sharing the estate's clubhouse.",topSouthAfrica:1,site:"https://www.fancourt.co.za"},
{n:"Fancourt (Outeniqua)",lat:-33.9513321,lng:22.4064865,clubInfo:{phone:"044 8040000"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,800",we:"R1,800",conf:"est",arch:"Gary Player",spec:"18 · parkland",note:"Fancourt's third 18, named for the Outeniqua Mountains backdrop, alongside Montagu and The Links.",topSouthAfrica:1,site:"https://www.fancourt.co.za"},
{n:"Leopard Creek Country Club",lat:-25.4595718,lng:31.53917,clubInfo:{phone:"013 791 2000"},r:"Mpumalanga & Kruger",a:"open",band:"premium",wd:"R3,200",we:"R3,200",conf:"est",arch:"Gary Player",spec:"18 · bushveld parkland",note:"Borders Kruger National Park along the Crocodile River; long-time Alfred Dunhill Championship host.",topSouthAfrica:1,t100:{za:2},site:""},
{n:"Durban Country Club",lat:-29.8277149,lng:31.0341911,clubInfo:{phone:"031 313 1716"},r:"KwaZulu-Natal",a:"open",band:"high",wd:"R1,400",we:"R1,400",conf:"est",arch:"Laurie Waters & George Waterman (1922)",spec:"18 · parkland/dunes",note:"Widely regarded South Africa's best course; longtime South African Open host.",topSouthAfrica:1,t100:{za:3},site:""},
{n:"St Francis Links",lat:-34.1610069,lng:24.8266335,clubInfo:{phone:"0422004500"},r:"Eastern Cape",a:"open",band:"high",wd:"R1,100",we:"R1,100",conf:"est",arch:"Jack Nicklaus",spec:"18 · links",note:"A true links routed through coastal dunes at St Francis Bay, near Jeffreys Bay.",topSouthAfrica:1,t100:{za:4},site:""},
{n:"Royal Johannesburg & Kensington (East)",lat:-26.1562252,lng:28.1078758,clubInfo:{phone:"011 640 3021"},r:"Gauteng",a:"open",band:"high",wd:"R950",we:"R950",conf:"est",arch:"Established 1890, multiple redesigns",spec:"18 · parkland",note:"South Africa's most-capped South African Open venue.",topSouthAfrica:1,t100:{za:5},site:""},
{n:"Royal Cape Golf Club",lat:-34.0187073,lng:18.4889278,clubInfo:{phone:"021-7616551"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R850",we:"R850",conf:"est",arch:"Established 1885",spec:"18 · parkland",note:"South Africa's oldest golf club, beneath Table Mountain.",topSouthAfrica:1,t100:{za:6},site:""},
{n:"Pearl Valley Golf Club",lat:-33.8219566,lng:18.9858112,clubInfo:{phone:"021 8678000"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R1,600",we:"R1,600",conf:"est",arch:"Jack Nicklaus",spec:"18 · parkland",note:"A Nicklaus signature course on the Val de Vie Estate near Paarl.",topSouthAfrica:1,t100:{za:7},site:""},
{n:"Arabella Golf Club",lat:-34.3297653,lng:19.0385838,clubInfo:{phone:"+27 (28) 284 0105"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,050",we:"R1,050",conf:"est",arch:"Peter Matkovich",spec:"18 · parkland/estuary",note:"Plays along the Bot River Lagoon near Hermanus, with regular whale-watching from the fairways.",topSouthAfrica:1,t100:{za:8},site:""},
{n:"Gary Player Country Club (Sun City)",lat:-25.2025,lng:27.0527,clubInfo:{phone:"0145571245"},r:"North West",a:"open",band:"premium",wd:"R1,850",we:"R1,850",conf:"est",arch:"Gary Player",spec:"18 · parkland/bushveld",note:"Home of the Nedbank Golf Challenge; the par-5 9th's fairway crosses a lake stocked with real hippos and crocodiles.",topSouthAfrica:1,t100:{za:9},site:""},
{n:"Lost City Golf Course (Sun City)",lat:-25.2025,lng:27.0527,photo:{src:"images/courses/lost-city-golf-course-sun-city.jpg",photographer:"South African Tourism from South Africa",license:"CC BY 2.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Lost_City_Golf_Course,_Sun_City,_North_West,_South_Africa_(20342107110).jpg"},clubInfo:{phone:"0145571245"},r:"North West",a:"open",band:"high",wd:"R1,400",we:"R1,400",conf:"est",arch:"Gary Player",spec:"18 · bushveld",note:"Sun City's second course, alongside the Gary Player CC, famous for the crocodile pit guarding its 13th green.",topSouthAfrica:1,site:""},
{n:"Glendower Golf Club",lat:-26.1607227,lng:28.1422024,clubInfo:{phone:"011 453 1013"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R750",conf:"est",arch:"Robert Grimsdell",spec:"18 · parkland",note:"A frequent SA PGA Championship venue east of Johannesburg.",topSouthAfrica:1,t100:{za:10},site:""},
{n:"Humewood Golf Club",lat:-34.00052,lng:25.6778316,clubInfo:{phone:"041 - 5833011"},r:"Eastern Cape",a:"open",band:"mid",wd:"R850",we:"R850",conf:"est",arch:"S.V. Hotchkin (1929, in the style of Colt)",spec:"18 · links",note:"A genuine seaside links in Port Elizabeth, regularly ranked South Africa's best public-access course.",topSouthAfrica:1,t100:{za:11},site:""},
{n:"Erinvale Golf Club",lat:-34.06605,lng:18.88326,clubInfo:{phone:"021 847 1144"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,150",we:"R1,150",conf:"est",arch:"Gary Player",spec:"18 · parkland",note:"Hosted the 1996 World Cup of Golf, with Helderberg mountain views throughout.",topSouthAfrica:1,t100:{za:12},site:""},
{n:"Zimbali Country Club",lat:-29.5477,lng:31.1976,clubInfo:{phone:"0325381041"},r:"KwaZulu-Natal",a:"open",band:"high",wd:"R1,200",we:"R1,200",conf:"est",arch:"Tom Weiskopf",spec:"18 · coastal forest",note:"Routed through indigenous coastal forest on KwaZulu-Natal's North Coast.",topSouthAfrica:1,t100:{za:13},site:""},
{n:"Simola Golf & Country Estate",lat:-34.0025177,lng:23.03123,clubInfo:{phone:"044 302 9677"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,100",we:"R1,100",conf:"est",arch:"Jack Nicklaus",spec:"18 · hillside parkland",note:"A hillside Nicklaus design above the Knysna Lagoon.",topSouthAfrica:1,t100:{za:14},site:""},
{n:"Oubaai Golf Club",lat:-34.05122,lng:22.4268532,clubInfo:{phone:"0448511263"},r:"Western Cape & Garden Route",a:"open",band:"high",wd:"R1,150",we:"R1,150",conf:"est",arch:"Ernie Els",spec:"18 · coastal",note:"An Ernie Els design on the Garden Route coast near Herolds Bay.",topSouthAfrica:1,t100:{za:15},site:""},
{n:"Pinnacle Point Golf Club",lat:-34.1962051,lng:22.0869312,clubInfo:{phone:"(044) 606 5300"},r:"Western Cape & Garden Route",a:"open",band:"premium",wd:"R1,700",we:"R1,700",conf:"est",arch:"Mackenzie & Ebert",spec:"18 · clifftop",note:"Several holes play along dramatic cliffs above the Indian Ocean at Mossel Bay.",topSouthAfrica:1,t100:{za:16},site:""},
{n:"George Golf Club",lat:-33.9533958,lng:22.4453144,clubInfo:{phone:"044 873 6116"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R650",we:"R650",conf:"est",arch:"Established 1885",spec:"18 · parkland",note:"One of South Africa's oldest golf clubs, at the foot of the Outeniqua Mountains.",topSouthAfrica:1,t100:{za:17},site:""},
{n:"Mount Edgecombe (The Woods)",lat:-29.71694,lng:31.0448685,clubInfo:{phone:"031 5395330"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R700",we:"R700",conf:"est",arch:"Established mid-20th century",spec:"18 · parkland",note:"One of Mount Edgecombe's two courses on Durban's North Coast, host to national amateur events.",topSouthAfrica:1,t100:{za:18},site:""},
{n:"Mount Edgecombe (The Lakes)",lat:-29.71694,lng:31.0448685,clubInfo:{phone:"031 5395330"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R700",we:"R700",conf:"est",arch:"Established mid-20th century",spec:"18 · parkland",note:"Mount Edgecombe's second 18, alongside The Woods, sharing the same North Coast clubhouse.",topSouthAfrica:1,site:""},
{n:"Houghton Golf Club",lat:-26.1676559,lng:28.0741634,clubInfo:{phone:"0117287337"},r:"Gauteng",a:"open",band:"mid",wd:"R800",we:"R800",conf:"est",arch:"Established 1925",spec:"18 · parkland",note:"A historic Johannesburg club, host to several South African Opens.",topSouthAfrica:1,t100:{za:19},site:""},
{n:"Atlantic Beach Links",lat:-33.7472229,lng:18.44835,clubInfo:{phone:"+27 21 553 2221"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Benoni CC",lat:-26.17165,lng:28.3410835,clubInfo:{phone:"011 8495211"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Blair Atholl Golf & Equestrian Estate",lat:-25.9084,lng:27.908783,clubInfo:{phone:"011 300 5700"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Bloemfontein",lat:-29.1163139,lng:26.2574978,clubInfo:{phone:"051 447 0906"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Bosch Hoek",lat:-29.3521481,lng:30.0961437,clubInfo:{phone:"0332344232"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Bryanston",lat:-26.0619335,lng:28.0125179,clubInfo:{phone:"011 706 1361"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"CCJ Rocklands",lat:-26.0499477,lng:28.076664,clubInfo:{phone:"011 202 1603"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"CCJ Woodmead",lat:-26.0499477,lng:28.076664,clubInfo:{phone:"011 202 1603"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Centurion",lat:-25.873703,lng:28.204092,clubInfo:{phone:"012 665 0279"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Champagne Sports Resort",lat:-28.9968338,lng:29.47108,clubInfo:{phone:"0364688000"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Clovelly",lat:-34.1225166,lng:18.4239368,clubInfo:{phone:"021 784 2111"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Cotswold Downs",lat:-29.75063,lng:30.7939415,clubInfo:{phone:"0317623660"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Dainfern",lat:-25.9889317,lng:27.997406,clubInfo:{phone:"011 875 0401"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"De Zalze",lat:-33.9386826,lng:18.8497715,clubInfo:{phone:"0218807300"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Eagle Canyon",lat:-26.0975838,lng:27.9190273,clubInfo:{phone:"011 801 6600"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"East London Golf Club",lat:-32.9960175,lng:27.9360619,clubInfo:{phone:"0437351356"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Ebotse Links",lat:-26.153944,lng:28.3515568,clubInfo:{phone:"087 285 3557"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Elements",lat:-24.7992821,lng:28.1300259,clubInfo:{phone:"0105912951"},r:"Mpumalanga & Kruger",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Emfuleni",lat:-26.7426147,lng:27.8417187,clubInfo:{phone:"0161009230 / 0169323370"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Eye of Africa",lat:-26.3603725,lng:28.0246315,clubInfo:{phone:"010 5000 300"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Glenvista Golf Club",lat:-26.2822247,lng:28.0557289,clubInfo:{phone:"0114323150"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Goldfields West",lat:-26.3920059,lng:27.4735031,clubInfo:{phone:"018 011 2910/064 814 2177"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Goose Valley",lat:-34.02612,lng:23.3792858,clubInfo:{phone:"+27 44 533 5082"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Gowrie Farm",lat:-29.3627186,lng:30.0035973,clubInfo:{phone:"033 266 6348"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Hermanus",lat:-34.4101143,lng:19.2551823,clubInfo:{phone:"028 312 1954"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Highland Gate",lat:-25.4425678,lng:30.2087116,clubInfo:{phone:"087 287 4653"},r:"Mpumalanga & Kruger",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Huddle Park",lat:-26.1546783,lng:28.1050644,clubInfo:{phone:"0116406693"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Irene",lat:-25.8850613,lng:28.2237759,clubInfo:{phone:"012 6671081"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Jackal Creek",lat:-26.0581322,lng:27.9269028,clubInfo:{phone:"010 880 3999 "},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Kambaku",lat:-25.4330273,lng:31.9534817,clubInfo:{phone:"082 888 0188"},r:"Mpumalanga & Kruger",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Katberg",lat:-32.4993362,lng:26.6844177,clubInfo:{phone:"040 864 1010"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"King David Mowbray",lat:-33.94605,lng:18.4922466,clubInfo:{phone:"021 6853018"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Kingswood",lat:-33.965,lng:22.475,photo:{src:"images/courses/kingswood.jpg",photographer:"SkyPixels",license:"CC BY-SA 4.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Outeniqua_Mountains_backdrop_to_the_Kingswood_Golf_Estate_in_George.jpg"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Knysna Golf Club",lat:-34.0582161,lng:23.0788612,clubInfo:{phone:"044 3841150"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Krugersdorp",lat:-26.0812912,lng:27.7844181,clubInfo:{phone:"(011)660 4365"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Kyalami",lat:-25.9782066,lng:28.0527725,clubInfo:{phone:"010 5940034"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Maccauvlei",lat:-26.6821213,lng:27.9425163,clubInfo:{phone:"0164213196"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Mbombela",lat:-25.4819,lng:31.0015221,clubInfo:{phone:"013-744 0952/8"},r:"Mpumalanga & Kruger",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Modderfontein",lat:-26.1015911,lng:28.1622963,clubInfo:{phone:"011 6082033/4"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Mossel Bay Golf Club",lat:-34.1892624,lng:22.1313858,clubInfo:{phone:"0446912379"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Olivewood",lat:-32.83,lng:28.1,r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Paarl Golf Club",lat:-33.7608681,lng:18.9798336,clubInfo:{phone:"021 - 8631140"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Parkview",lat:-26.1617088,lng:28.0193863,clubInfo:{phone:"011 646-5400"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Parys",lat:-26.8893948,lng:27.4660435,clubInfo:{phone:"056 818 1567"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Pecanwood",lat:-25.7718754,lng:27.8532963,clubInfo:{phone:"012 244 8080"},r:"North West",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Pezula",lat:-34.0690575,lng:23.090292,photo:{src:"images/courses/pezula.jpg",photographer:"South African Tourism from South Africa",license:"CC BY 2.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Golf_Pesula_Knysna_-_South_Africa_(3609896211).jpg"},clubInfo:{phone:"044 302 5310"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Plettenberg Bay CC",lat:-34.0623741,lng:23.3556633,clubInfo:{phone:"044 533 2132"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Port Elizabeth Golf Club",lat:-33.9579048,lng:25.58799,clubInfo:{phone:"041 3743140"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Pretoria Country Club",lat:-25.78388,lng:28.2521915,photo:{src:"images/courses/pretoria-country-club.jpg",photographer:"Cards84664",license:"CC BY-SA 4.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Buckeye_Woodhill,_June_2019.jpg"},clubInfo:{phone:"0124606241"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Prince's Grant",lat:-29.3391685,lng:31.3750362,clubInfo:{phone:"0324820041"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Randpark",lat:-26.1146069,lng:27.9664364,clubInfo:{phone:"011 215 8600"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Reading Country Club",lat:-26.2653179,lng:28.1071434,photo:{src:"images/courses/reading-country-club.jpg",photographer:"PIETSNOR",license:"Public domain",sourceUrl:"https://commons.wikimedia.org/wiki/File:Reading_Golf_Course.jpg"},clubInfo:{phone:"011 907 8906"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Royal Johannesburg & Kensington (West)",lat:-26.1562252,lng:28.1078758,clubInfo:{phone:"011 640 3021"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Royal Port Alfred",lat:-33.6036453,lng:26.8843689,clubInfo:{phone:"046 624 4796"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Ruimsig",lat:-26.0828323,lng:27.8655319,clubInfo:{phone:"011 958 1905"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"San Lameer",lat:-30.944025,lng:30.2979813,photo:{src:"images/courses/san-lameer.jpg",photographer:"Ltz Raptor.",license:"CC BY-SA 3.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Golf_course._San_Lameer,_South_Africa_-_20070108.jpg"},clubInfo:{phone:"039 313 5141"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Selborne Park",lat:-30.37601,lng:30.67837,clubInfo:{phone:"087 135 0559"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Serengeti",lat:-26.0355568,lng:28.28139,clubInfo:{phone:"(011) 552 - 7200"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Sishen",lat:-27.68876,lng:23.0588856,clubInfo:{phone:"0530505727"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Somerset West CC",lat:-34.0817642,lng:18.8348026,photo:{src:"images/courses/somerset-west-cc.jpg",photographer:"Aerial Picture and Video",license:"CC BY-SA 4.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Erinvale_Estate_and_Golf_Club,_Somerset_West,_South_Africa.JPG"},clubInfo:{phone:"021 852 2925"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Southbroom",lat:-30.9179363,lng:30.3221817,clubInfo:{phone:"0393166026"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"St Francis Bay",lat:-34.1623878,lng:24.8258286,clubInfo:{phone:"042 2940467"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Steenberg",lat:-34.06797,lng:18.4268,clubInfo:{phone:"021 713-2233"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Stellenbosch",lat:-33.95875,lng:18.850378,photo:{src:"images/courses/stellenbosch.jpg",photographer:"Hburke",license:"CC BY 3.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Afternoon_Sun_Over_The_Golf_Course_01_-_panoramio.jpg"},clubInfo:{phone:"0218800103"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"The Club at Steyn City",lat:-25.98,lng:27.97,r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Umdoni Park",lat:-30.3924866,lng:30.6894112,clubInfo:{phone:"039 - 975 1615"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Umhlali",lat:-29.5095882,lng:31.1970882,clubInfo:{phone:"032 947 1181"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Victoria Golf Club",lat:-29.57367,lng:30.32664,clubInfo:{phone:"033-3471942"},r:"KwaZulu-Natal",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Wanderers",lat:-26.1334782,lng:28.0518188,clubInfo:{phone:"011 447 3311"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Waterkloof Golf Club",lat:-25.7911224,lng:28.21923,clubInfo:{phone:"(012) 007-1147"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Wedgewood",lat:-33.7139244,lng:25.5207367,clubInfo:{phone:"0414509595"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Westlake",lat:-34.082428,lng:18.446558,clubInfo:{phone:"0217882020"},r:"Western Cape & Garden Route",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Wild Coast Country Club",lat:-29.7706089,lng:30.8685665,clubInfo:{phone:"039 305 2799"},r:"Eastern Cape",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Wingate Park",lat:-25.8277359,lng:28.2769165,clubInfo:{phone:"012 997 1312"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Woodhill",lat:-25.8211823,lng:28.3121071,photo:{src:"images/courses/woodhill.jpg",photographer:"Cards84664",license:"CC BY-SA 4.0",sourceUrl:"https://commons.wikimedia.org/wiki/File:Buckeye_Woodhill,_June_2019.jpg"},clubInfo:{phone:"012-9980011"},r:"Gauteng",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""},
{n:"Zebula",lat:-24.7642365,lng:27.9500618,clubInfo:{phone:"014 734 7700"},r:"Mpumalanga & Kruger",a:"open",band:"mid",wd:"R750",we:"R850",conf:"est",arch:"Unknown",spec:"18",note:"",topSouthAfrica:1,site:""}
];


C.push(...C_SOUTHAFRICA);
