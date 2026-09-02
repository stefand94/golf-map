/* ============================================================
   data/courses-ireland.js — GOLF-77: originally 37 curated notable
   Irish golf courses (Republic of Ireland + Northern Ireland), grown
   to 43 by the 2026-08-30 multi-course estate audit, then broadened
   to 83 (2026-09-02) by diffing the existing list against the full
   2026 Irish Golfer Top 100 ranking and adding every course missing
   from it (~40 new entries). The new batch's fee/access/architect/note
   fields are deliberately generic placeholders (band:"mid", a flat
   wd/we estimate per currency, arch:"Unknown", spec:"18", note:"") —
   unlike the original 37/43, which had hand-researched fee/arch/note
   text (still marked conf:"est"), these were added purely to get
   coordinates/region/currency right at Top 100 scale; revisit with
   real per-course research before trusting the fee figures. Sourced
   via scripts/fetch_ireland_golf_clubs.py against Golf Ireland's
   public club-finder API (golfireland.ie — same "DotGolf" white-label
   platform and API shape as England Golf/Scottish Golf/Wales Golf's,
   confirmed live via Browser-tool network inspection, 382 clubs found)
   for coordinates/phone/website, cross-checked against the 2026 Irish
   Golfer Top 100 ranking (irishgolfer.ie) and Top100GolfCourses.com's
   Ireland list for the course selection. Fee/access-tier data
   (wd/we/a/band) is NOT from a verified live source this round —
   marked conf:"est" throughout, same convention used for Scotland/
   Wales — treat as a starting point, not a quoted price. Northern Ireland clubs (Royal Portrush, Royal County
   Down, Portstewart, Malone, Castlerock) use £ (GBP); Republic of
   Ireland clubs use € (EUR) — a genuine currency split within one
   nation's data, unlike any prior nation added to this map.

   Old Head Golf Links is absent from Golf Ireland's own directory
   (confirmed via multiple search-term attempts) — genuinely not
   GUI-affiliated, same situation as Swinley Forest (England) and
   Castle Stuart (Scotland). Its coordinates were sourced from
   Wikipedia's "Old Head of Kinsale" article, cross-checked against
   oldhead.com.

   No stn/walk/book (outside any rail-catchment concept — same as
   C_TOP100/C_SCOTLAND/C_WALES); no nearStation (Ireland's rail network
   is much sparser than GB's relative to how remote these links courses
   are — the field is simply omitted, degrading gracefully exactly as
   it already does for any course missing it). Regions are Ireland-
   specific groupings (Causeway Coast & Mournes, Dublin & East Coast,
   South West Ireland — Kerry & Clare Links, Cork & South Coast,
   Northwest Ireland — Donegal & Sligo, West of Ireland — Galway &
   Mayo), appended to REGIONS in data/config.js. See SCHEMA.md.

   2026-08-30 multi-course audit: the original 37-course pass, curated
   by name via published rankings, missed that several of those clubs
   are actually multi-course estates where a second (or third) course
   is independently notable — the single-course entry silently implied
   there was nothing else there. Verified via WebSearch against each
   club's own site before adding: Rosapenna (3 courses: Old Tom Morris
   Links, Sandy Hills Links, St Patrick's Links — only St Patrick's was
   listed), Ballyliffin (2: Old Links, Glashedy — only Glashedy),
   The K Club (2: Palmer North, Palmer South — only Palmer North),
   Fota Island (3: Deerpark, Belvelly, Barryscourt, 27 holes total —
   only one undifferentiated entry, now attributed to Deerpark, its
   championship/Irish-Open course), Druids Glen (2: Druids Glen,
   Druids Heath — only Druids Glen). Portmarnock's own entry was also
   corrected — it's a genuine 27-hole complex (the "Championship"
   18 is drawn from three 9s), not a plain 18, which the old
   spec:"18 · links" understated. New sibling-course entries share
   their parent course's coordinates (same estate/clubhouse — several
   are literally adjacent fairways) rather than an invented separate
   point, and carry topIreland:1 for nation-gating but deliberately no
   t100 rank (they weren't part of the sourced ranking list this data
   set is built from — see the GOLF-81 rankings-inconsistency note
   flagged separately for a future ranking-model fix).
   ============================================================ */
const C_IRELAND=[
{n:"Royal Portrush (Dunluce)",lat:55.1999741,lng:-6.635765,clubInfo:{phone:"02870822311"},r:"Causeway Coast & Mournes",a:"open",band:"premium",wd:"£300",we:"£300",conf:"est",arch:"Harry Colt (1932), restored by Martin Ebert",spec:"18 · links",note:"Host of The 2019 and 2025 Open Championship — Ireland's only Open venue.",topIreland:1,t100:{ire:1},site:"http://www.royalportrushgolfclub.com"},
{n:"Royal County Down",lat:54.2169151,lng:-5.885861,clubInfo:{phone:"02843723314"},r:"Causeway Coast & Mournes",a:"open",band:"premium",wd:"£295",we:"£295",conf:"est",arch:"Old Tom Morris (1889), Harry Vardon (1908)",spec:"18 · links",note:"Regularly ranked the world's best course; blind shots through gorse-lined dunes beneath the Mournes.",topIreland:1,t100:{ire:2},site:"http://www.royalcountydown.org"},
{n:"Portmarnock",lat:53.4074936,lng:-6.12623,clubInfo:{phone:"018462968"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€300",we:"€300",conf:"est",arch:"W.C. Pickeman & George Ross (1894)",spec:"27 · links (Championship 18 drawn from 3×9)",note:"A links peninsula course, host to multiple Irish Opens and the 1991 Walker Cup.",topIreland:1,t100:{ire:3},site:"https://www.portmarnockgolfclub.ie"},
{n:"Lahinch (Old)",lat:52.934494,lng:-9.34529,clubInfo:{phone:"0657081003"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€260",we:"€260",conf:"est",arch:"Old Tom Morris (1892), Alister MacKenzie (1927)",spec:"18 · links",note:"The 'St Andrews of Ireland' — the blind Dell and Klondyke holes are a signature quirk.",topIreland:1,t100:{ire:4},site:"http://www.lahinchgolf.com"},
{n:"Ballybunion (Old)",lat:52.49481,lng:-9.675984,clubInfo:{phone:"06827146"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€300",we:"€300",conf:"est",arch:"Evolved course, refined by Tom Simpson (1937)",spec:"18 · links",note:"Consistently ranked among the world's top links, along Atlantic dunes.",topIreland:1,t100:{ire:5},site:"http://www.ballybuniongolfclub.com"},
{n:"County Louth (Baltray)",lat:53.7383575,lng:-6.262767,clubInfo:{phone:"+353 41 988 1530"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€160",we:"€160",conf:"est",arch:"Tom Simpson & Molly Gourlay (1938)",spec:"18 · links",note:"A quietly world-class links north of Dublin, on the Boyne estuary.",topIreland:1,t100:{ire:6},site:"https://www.countylouthgolfclub.com"},
{n:"Waterville",lat:51.838398,lng:-10.1953449,clubInfo:{phone:"0669474102"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€295",we:"€295",conf:"est",arch:"Eddie Hackett, redesigned by Tom Fazio",spec:"18 · links",note:"A Ring of Kerry links long favoured by touring pros for pre-Open prep.",topIreland:1,t100:{ire:7},site:"http://watervillegolfclub.net"},
{n:"Adare Manor",lat:52.5643959,lng:-8.777948,clubInfo:{phone:"061-396204"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€650",we:"€650",conf:"est",arch:"Tom Fazio (2017 redesign)",spec:"18 · parkland",note:"Host of the 2027 Ryder Cup; a Fazio-remodelled parkland estate on the River Maigue.",topIreland:1,t100:{ire:8},site:""},
{n:"The Island",lat:53.4636536,lng:-6.135738,clubInfo:{phone:"+353 (0) 1 843 6205"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€175",we:"€175",conf:"est",arch:"Evolved course; Fred Hawtree revisions",spec:"18 · links",note:"A links squeezed onto a dune-covered peninsula north of Dublin.",topIreland:1,t100:{ire:9},site:"http://www.theislandgolfclub.com"},
{n:"Tralee",lat:52.30116,lng:-9.85759,clubInfo:{phone:"0667136379"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€195",we:"€195",conf:"est",arch:"Arnold Palmer (1984)",spec:"18 · links",note:"Palmer's front nine winds along Atlantic cliffs — 'the back nine God designed.'",topIreland:1,t100:{ire:10},site:"http://www.traleegolfclub.com"},
{n:"Rosapenna (St Patrick's Links)",lat:55.1872978,lng:-7.822957,clubInfo:{phone:"0749155000"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"premium",wd:"€160",we:"€160",conf:"est",arch:"Tom Doak & Jim Urbina (2021)",spec:"18 · links",note:"A modern-era links carved from Donegal's Sheephaven Bay dunes.",topIreland:1,t100:{ire:11},site:"https://www.rosapenna.ie"},
{n:"Rosapenna (Sandy Hills Links)",lat:55.1872978,lng:-7.822957,clubInfo:{phone:"0749155000"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€140",we:"€140",conf:"est",arch:"Pat Ruddy (2003)",spec:"18 · links",note:"Rosapenna's second course — big dune-set links alongside St Patrick's Links and the Old Tom Morris Links.",topIreland:1,site:"https://www.rosapenna.ie/sandy-hills-links.html"},
{n:"Rosapenna (Old Tom Morris Links)",lat:55.1872978,lng:-7.822957,clubInfo:{phone:"0749155000"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"mid",wd:"€100",we:"€100",conf:"est",arch:"Old Tom Morris (1893), revised by Vardon, Braid, Colt & Ruddy",spec:"18 · links",note:"Resort's original course, Old Tom Morris's only Donegal design.",topIreland:1,site:"https://www.rosapenna.ie"},
{n:"Carne (Belmullet)",lat:54.2258224,lng:-10.0320368,clubInfo:{phone:"097 82292"},r:"West of Ireland — Galway & Mayo",a:"open",band:"high",wd:"€90",we:"€90",conf:"est",arch:"Eddie Hackett, extended by Jim Engh",spec:"18 · links",note:"Remote, wild Mayo dunescape at the edge of the Atlantic.",topIreland:1,t100:{ire:12},site:"https://belmulletgolfclub.ie"},
{n:"County Sligo (Rosses Point)",lat:54.3070374,lng:-8.56642,clubInfo:{phone:"0719177134"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€150",we:"€150",conf:"est",arch:"George Combe & Harry Colt (evolved)",spec:"18 · links",note:"Beneath Benbulben, one of Ireland's classic championship links.",topIreland:1,t100:{ire:13},site:"http://www.countysligogolfclub.ie/"},
{n:"The K Club (Palmer North)",lat:53.3097229,lng:-6.626003,clubInfo:{phone:"0035316017302"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€295",we:"€295",conf:"est",arch:"Arnold Palmer (1991)",spec:"18 · parkland",note:"A Liffey-side parkland resort course, host of the 2006 Ryder Cup.",topIreland:1,t100:{ire:14},site:"https://www.kclub.ie"},
{n:"The K Club (Palmer South)",lat:53.3097229,lng:-6.626003,clubInfo:{phone:"0035316017302"},r:"Dublin & East Coast",a:"open",band:"high",wd:"€195",we:"€195",conf:"est",arch:"Arnold Palmer",spec:"18 · parkland",note:"The K Club's second Palmer design, alongside the Ryder Cup-hosting Palmer North.",topIreland:1,site:"https://www.kclub.ie"},
{n:"Enniscrone",lat:54.2071228,lng:-9.106036,clubInfo:{phone:"09636297"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€95",we:"€95",conf:"est",arch:"Eddie Hackett (1974 extension)",spec:"18 · links",note:"A big, rolling Sligo Bay links, underrated relative to its neighbours.",topIreland:1,t100:{ire:15},site:"http://www.enniscronegolf.com"},
{n:"Doonbeg",lat:52.7461243,lng:-9.502586,clubInfo:{phone:"0659055246"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"premium",wd:"€295",we:"€295",conf:"est",arch:"Greg Norman (2002), Martin Hawtree (renovation)",spec:"18 · links",note:"A dramatic dunes links on the Clare coast.",topIreland:1,t100:{ire:16},site:""},
{n:"Portstewart (Strand)",lat:55.1720047,lng:-6.724793,clubInfo:{phone:"02870832015"},r:"Causeway Coast & Mournes",a:"open",band:"premium",wd:"£180",we:"£180",conf:"est",arch:"Willie Park Jr, extended by Des Giffin",spec:"18 · links",note:"One of the most photographed opening holes in golf, through towering dunes.",topIreland:1,t100:{ire:17},site:"http://www.portstewartgc.co.uk"},
{n:"Ballyliffin (Glashedy)",lat:55.29097,lng:-7.372772,clubInfo:{phone:"0749376119"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€120",we:"€120",conf:"est",arch:"Pat Ruddy & Tom Craddock (1995)",spec:"18 · links",note:"Ireland's most northerly links, on the wild Inishowen peninsula.",topIreland:1,t100:{ire:18},site:"http://www.ballyliffingolfclub.com"},
{n:"Ballyliffin (Old Links)",lat:55.29097,lng:-7.372772,clubInfo:{phone:"0749376119"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€100",we:"€100",conf:"est",arch:"Eddie Hackett, Charles Lawrie & Frank Pennink (1973), Nick Faldo revisions",spec:"18 · links",note:"Ballyliffin's shorter, original links, sitting alongside Glashedy — 36 holes at Ireland's northernmost club.",topIreland:1,site:"http://www.ballyliffingolfclub.com"},
{n:"Royal Dublin",lat:53.35692,lng:-6.17097,clubInfo:{phone:"0035318336346"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€195",we:"€195",conf:"est",arch:"Harry Colt (1920)",spec:"18 · links",note:"A classic Colt links on Bull Island, minutes from the city centre.",topIreland:1,t100:{ire:19},site:"http://www.theroyaldublingolfclub.com"},
{n:"Portsalon",lat:55.207283,lng:-7.624471,clubInfo:{phone:"0749159459"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€90",we:"€90",conf:"est",arch:"Evolved course; Pat Ruddy revisions",spec:"18 · links",note:"A quiet, beautiful links on Donegal's Ballymastocker Bay.",topIreland:1,t100:{ire:20},site:"http://www.portsalongolfclub.ie"},
{n:"Dooks",lat:52.0824623,lng:-9.925978,clubInfo:{phone:"066 9768205"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"high",wd:"€95",we:"€95",conf:"est",arch:"Evolved course, Eddie Hackett revisions",spec:"18 · links",note:"A charming, understated links on Dingle Bay.",topIreland:1,t100:{ire:21},site:""},
{n:"Old Head",lat:51.604783,lng:-8.533633,r:"Cork & South Coast",a:"open",band:"premium",wd:"€345",we:"€345",conf:"est",arch:"Ron Kirby, Paddy Merrigan & Joe Carr (1997)",spec:"18 · clifftop links",note:"Perched on a dramatic Atlantic headland — several holes play along 300ft cliffs.",topIreland:1,t100:{ire:22},site:"https://www.oldhead.com"},
{n:"Druids Glen",lat:53.0962143,lng:-6.078787,clubInfo:{phone:"0128070812"},r:"Dublin & East Coast",a:"open",band:"high",wd:"€95",we:"€95",conf:"est",arch:"Pat Ruddy & Tom Craddock (1995)",spec:"18 · parkland",note:"'The Augusta of Europe' — a lush Wicklow parkland course, former Irish Open host.",topIreland:1,t100:{ire:23},site:"http://www.druidsglenresort.com"},
{n:"Druids Glen (Druids Heath)",lat:53.0962143,lng:-6.078787,clubInfo:{phone:"0128070812"},r:"Dublin & East Coast",a:"open",band:"high",wd:"€85",we:"€85",conf:"est",arch:"Pat Ruddy & Tom Craddock (2003)",spec:"18 · heathland/links",note:"Druids Glen's sister course, opened 2003 and host to the Irish PGA — sea views from the front nine, the Wicklow Mountains from the back.",topIreland:1,site:"http://www.druidsglenresort.com"},
{n:"Slieve Russell",lat:54.09568,lng:-7.557051,clubInfo:{phone:"0499525090"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€55",we:"€55",conf:"est",arch:"Paddy Merrigan (1992)",spec:"18 · parkland",note:"A well-regarded inland parkland course in Cavan.",topIreland:1,t100:{ire:24},site:"http://Slieverussell.ie"},
{n:"Connemara",lat:53.4207878,lng:-10.14399,clubInfo:{phone:"09523502"},r:"West of Ireland — Galway & Mayo",a:"open",band:"high",wd:"€85",we:"€85",conf:"est",arch:"Eddie Hackett (1973)",spec:"18 · links/moorland",note:"A rugged links beneath the Twelve Bens in Connemara.",topIreland:1,t100:{ire:25},site:"http://www.connemaragolflinks.com"},
{n:"Killeen Castle",lat:53.53551,lng:-6.593918,clubInfo:{phone:"016893000"},r:"Dublin & East Coast",a:"open",band:"high",wd:"€85",we:"€85",conf:"est",arch:"Jack Nicklaus (2010)",spec:"18 · parkland",note:"Hosted the 2011 Solheim Cup; a Nicklaus design in the Boyne Valley.",topIreland:1,t100:{ire:26},site:"http://www.killeencastle.com"},
{n:"Narin & Portnoo",lat:54.8441734,lng:-8.4257,clubInfo:{phone:"0749545107"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"mid",wd:"€65",we:"€65",conf:"est",arch:"Evolved course",spec:"18 · links",note:"A hidden-gem links on a Donegal peninsula.",topIreland:1,t100:{ire:27},site:"http://https://www.narinandportnoolinks.com/"},
{n:"Strandhill",lat:54.2664871,lng:-8.60409,clubInfo:{phone:"0719168188"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"mid",wd:"€55",we:"€55",conf:"est",arch:"Evolved course",spec:"18 · links",note:"A short, quirky Sligo links with genuine championship pedigree.",topIreland:1,t100:{ire:28},site:"http://strandhillgolfclub.com"},
{n:"Fota Island (Deerpark)",lat:51.8988457,lng:-8.291089,clubInfo:{phone:"0214883700"},r:"Cork & South Coast",a:"open",band:"high",wd:"€100",we:"€100",conf:"est",arch:"Christy O'Connor Jr, Peter McEvoy & Jeff Howes",spec:"18 · parkland",note:"A Cork Harbour parkland resort's championship course, former Irish Open host.",topIreland:1,t100:{ire:29},site:"http://www.fotamembers.com"},
{n:"Fota Island (Belvelly)",lat:51.8988457,lng:-8.291089,clubInfo:{phone:"0214883700"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€70",we:"€70",conf:"est",arch:"Jeff Howes (2007)",spec:"18 · parkland",note:"One of Fota Island's two other 18s (with Barryscourt), completing 27 holes at the resort alongside Deerpark.",topIreland:1,site:"http://www.fotamembers.com"},
{n:"Cork (Little Island)",lat:51.9013367,lng:-8.353946,clubInfo:{phone:"0214353451"},r:"Cork & South Coast",a:"open",band:"high",wd:"€95",we:"€95",conf:"est",arch:"Alister MacKenzie (1927)",spec:"18 · parkland",note:"A MacKenzie design on a former island estate in Cork Harbour.",topIreland:1,t100:{ire:30},site:"http://www.corkgolfclub.ie"},
{n:"Mount Juliet",lat:52.5252838,lng:-7.188537,clubInfo:{phone:"056 777 3071"},r:"Dublin & East Coast",a:"open",band:"high",wd:"€135",we:"€135",conf:"est",arch:"Jack Nicklaus (1991)",spec:"18 · parkland",note:"A Nicklaus parkland estate course, former Irish Open host.",topIreland:1,t100:{ire:31},site:"http://www.mountjuliet.ie/golf"},
{n:"Donegal (Murvagh)",lat:54.61294,lng:-8.159539,clubInfo:{phone:"0749734054"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"high",wd:"€95",we:"€95",conf:"est",arch:"Eddie Hackett (1973)",spec:"18 · links",note:"A long, championship links on the Murvagh peninsula.",topIreland:1,t100:{ire:32},site:"http://www.donegalgolfclub.com"},
{n:"Malone",lat:54.5394974,lng:-5.981027,clubInfo:{phone:"02890612758"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£60",we:"£60",conf:"est",arch:"James Braid (1962 relocation)",spec:"18 · parkland",note:"A well-regarded Belfast parkland course around two lakes.",topIreland:1,t100:{ire:33},site:""},
{n:"Carlow",lat:52.8524551,lng:-6.893686,clubInfo:{phone:"0599131695"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€55",we:"€55",conf:"est",arch:"Cecil Barcroft, revised by Harry Colt",spec:"18 · heathland",note:"An inland heathland course, considered one of Ireland's best non-links.",topIreland:1,t100:{ire:34},site:"http://www.carlowgolfclub.ie"},
{n:"Castlerock",lat:55.1651421,lng:-6.78303,clubInfo:{phone:"70848314"},r:"Causeway Coast & Mournes",a:"open",band:"premium",wd:"£160",we:"£160",conf:"est",arch:"Ben Sayers (1901)",spec:"18 · links",note:"A Causeway Coast links neighbouring Royal Portrush.",topIreland:1,t100:{ire:35},site:"http://www.castlerockgc.co.uk"},
{n:"Galway Bay",lat:53.2493973,lng:-8.975981,clubInfo:{phone:"091790711"},r:"West of Ireland — Galway & Mayo",a:"open",band:"high",wd:"€85",we:"€85",conf:"est",arch:"Christy O'Connor Jr (1993)",spec:"18 · links/parkland",note:"A Christy O'Connor Jr resort course on Galway Bay.",topIreland:1,t100:{ire:36},site:""},
{n:"The European Club",lat:52.85944,lng:-6.071839,clubInfo:{phone:"47415"},r:"Dublin & East Coast",a:"open",band:"premium",wd:"€200",we:"€200",conf:"est",arch:"Pat Ruddy (1986)",spec:"18 · links",note:"A modern-classic links built by its own owner-architect on the Wicklow coast.",topIreland:1,t100:{ire:37},site:"https://www.theeuropeanclub.com"},
{n:"Ardglass Golf Club",lat:54.2586327,lng:-5.605249,clubInfo:{phone:"02844841219"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Balbriggan Golf Club",lat:53.5951767,lng:-6.182618,clubInfo:{phone:"018412229"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Belvoir Park Golf Club",lat:54.5615,lng:-5.913478,clubInfo:{phone:"02890491693"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Bunclody Golf Club",lat:52.6584549,lng:-6.671018,clubInfo:{phone:"0539374444"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Carton House (Montgomerie) Golf Club",lat:53.390522,lng:-6.566736,clubInfo:{phone:"015052000"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Clandeboye (Dufferin) Golf Club",lat:54.626358,lng:-5.683152,clubInfo:{phone:"02891271767"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Concra Wood Golf Club",lat:54.118866,lng:-6.731274,clubInfo:{phone:"00353429749485"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Dun Laoghaire Golf Club",lat:53.2064972,lng:-6.156725,clubInfo:{phone:"012721866"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Dundalk Golf Club",lat:53.9731026,lng:-6.372931,clubInfo:{phone:"0429321731"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Farnham Estate Golf Club",lat:54.0022545,lng:-7.40002537,clubInfo:{phone:"0494326482"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Galgorm Castle Golf Club",lat:54.85828,lng:-6.313579,clubInfo:{phone:"02825646161"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Glasson Golf Club",lat:53.47575,lng:-7.900952,clubInfo:{phone:"0906485120"},r:"West of Ireland — Galway & Mayo",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Golf at The Hawthorn Golf Club",lat:53.268,lng:-8.933,r:"West of Ireland — Galway & Mayo",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Grange Golf Club",lat:53.2808151,lng:-6.282296,clubInfo:{phone:"01-4932889"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Headfort (New) Golf Club",lat:53.7250557,lng:-6.859977,clubInfo:{phone:"00353469240146"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Hermitage Golf Club",lat:53.3593369,lng:-6.417649,clubInfo:{phone:"016268491"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Killarney (Killeen)",lat:52.0604935,lng:-9.563369,clubInfo:{phone:"0646631034"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Killarney (Mahony's Point)",lat:52.0604935,lng:-9.563369,clubInfo:{phone:"0646631034"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Laytown & Bettystown Golf Club",lat:53.7048874,lng:-6.246931,clubInfo:{phone:"0419827170"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Lough Erne Golf Club",lat:54.38989,lng:-7.69582844,clubInfo:{phone:"02866345766"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Macreddin Golf Club",lat:52.8808441,lng:-6.329934,clubInfo:{phone:"0402 36999"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Monkstown Golf Club",lat:51.8502274,lng:-8.343904,clubInfo:{phone:"00353214841376"},r:"South West Ireland — Kerry & Clare Links",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Moyola Park Golf Club",lat:54.7825775,lng:-6.572232,clubInfo:{phone:"02879468468"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Moyvalley Golf Club",lat:53.41859,lng:-6.927517,clubInfo:{phone:"0469548080"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Mullingar Golf Club",lat:53.48173,lng:-7.357139,clubInfo:{phone:"0449348366"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Naas Golf Club",lat:53.2476768,lng:-6.640637,clubInfo:{phone:"045897509"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"New Forest Golf Club",lat:53.3999138,lng:-7.42762,clubInfo:{phone:"0449221100"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"North West Golf Club",lat:55.1092148,lng:-7.468647,clubInfo:{phone:"0866047299"},r:"Causeway Coast & Mournes",a:"open",band:"mid",wd:"£65",we:"£75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Palmerstown House Estate Golf Club",lat:53.24376,lng:-6.628126,clubInfo:{phone:"045906901"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Powerscourt (East) Golf Club",lat:53.1871872,lng:-6.185906,clubInfo:{phone:"012046033"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Powerscourt (West) Golf Club",lat:53.1871872,lng:-6.185906,clubInfo:{phone:"012046033"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Rathsallagh Golf Club",lat:53.02604,lng:-6.73895741,clubInfo:{phone:"045403316"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Rosslare Golf Club",lat:52.2842026,lng:-6.394002,clubInfo:{phone:"0539132203"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Seapoint Golf Club",lat:53.7525444,lng:-6.255986,clubInfo:{phone:"0419822333"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"St. Anne's Golf Club",lat:53.3752136,lng:-6.137757,clubInfo:{phone:"018336471"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"St. Margaret's Golf Club",lat:53.4231,lng:-6.3639,clubInfo:{phone:"018640400"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"The Heritage Golf Club",lat:53.13269,lng:-7.151716,clubInfo:{phone:"0578642321"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Tulfarris Golf Club",lat:53.1252747,lng:-6.559183,clubInfo:{phone:"045867609"},r:"Dublin & East Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Tullamore Golf Club",lat:53.2416954,lng:-7.520573,clubInfo:{phone:"0579321439"},r:"Cork & South Coast",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""},
{n:"Westport Golf Club",lat:53.812397,lng:-9.564694,clubInfo:{phone:"09828262"},r:"Northwest Ireland — Donegal & Sligo",a:"open",band:"mid",wd:"€65",we:"€75",conf:"est",arch:"Unknown",spec:"18",note:"",topIreland:1,site:""}
];


C.push(...C_IRELAND);
