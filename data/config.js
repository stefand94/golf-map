/* ============================================================
   data/config.js — access tiers, price bands, regions, architect
   filter tags, rail-line styling. See SCHEMA.md for field docs.
   Loaded as a plain <script> (not a module) for file:// portability.
   ============================================================ */

/* Data-provenance dates — set by hand each time a scripts/fetch_*.py
   run's output is merged into the data/ files. See scripts/README.md. */
const DATA_REFRESHED={stations:"2026-08-25",top100:"2026-08-25"};

/* ==========================================================
   ACCESS TIERS — now expressed as flag colour, per request.
   Palette chosen so no two are confusable under any common
   colour-vision deficiency: white, red, yellow, blue carries
   no red/green pairing at all.
   ========================================================== */
const ACCESS={
  public:{label:"Pay & play",colour:"#F2C230",pole:"#5B4A00"},   // yellow flag
  open:{label:"Visitors any day",colour:"#1C6FD1",pole:"#0B2E52"}, // blue flag
  weekday:{label:"Weekdays only",colour:"#FFFFFF",pole:"#3C4A42"}, // white flag
  limited:{label:"Restricted days",colour:"#D6392E",pole:"#5C0E09"}, // red flag
  application:{label:"Application/invitation only",colour:"#2B2B2B",pole:"#6B6B6B"} // black flag — no visitor fee published
};
const BANDS={low:"≤ £30",mid:"£31–70",high:"£71–150",premium:"£151+"};
const REGIONS=["N & NW London","W London","SW London","S London & Surrey","SE London & Kent","NE London & Essex","Herts","Bucks & Berks","South Coast & Sussex","East Anglia","South West England","Midlands","North of England"];
const ARCHS=[["colt","Colt"],["braid","Braid"],["mackenzie","MacKenzie"],["abercromby","Abercromby"],["taylor","J.H. Taylor"],["hawtree","Hawtree"],["vardon","Vardon"],["park","Willie Park Jr"],["fowler","Fowler"],["modern","Modern era"]];

/* dash patterns scaled for hairline weights */
const LINES={
  met:{n:"Metropolitan",c:"#9B0056",d:null}, jub:{n:"Jubilee",c:"#7A8285",d:"8 3"},
  nor:{n:"Northern",c:"#1C1C1C",d:null},     pic:{n:"Piccadilly",c:"#0019A8",d:"1.5 3.5"},
  cen:{n:"Central",c:"#DC241F",d:"11 3 2 3"},dis:{n:"District",c:"#00782A",d:"5 3"},
  eli:{n:"Elizabeth",c:"#6950A1",d:"13 4"},  ovg:{n:"Overground",c:"#EE7C0E",d:"2 3"},
  tl:{n:"Thameslink",c:"#E5157F",d:"9 3 2 3"},gn:{n:"Great Northern",c:"#0F9CD6",d:"6 3.5"},
  chil:{n:"Chiltern",c:"#00A19C",d:"4 2.5 1.5 2.5"}, sn:{n:"Southern",c:"#6FA82A",d:"10 3.5"},
  se:{n:"Southeastern",c:"#2C6EBD",d:"4.5 2.5 1.5 2.5"}, swr:{n:"South Western",c:"#24398C",d:"8 3 2 3"},
  wcml:{n:"West Coast Main Line",c:"#5C6B73",d:"3 3"}
};
