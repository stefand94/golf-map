#!/usr/bin/env python3
"""GOLF-238: hand-decided OSM matches for the 49 England/Scotland records
GOLF-161 left without `coordSrc:"osm"`, applied in place.

Reads scripts/output/golf238_osm.json (fetch_golf238_osm.py) and writes the
OSM position, `coordSrc:"osm"` and the `osm` ref onto each matched record.
Patches each record's text in place — never rebuilds an array (GOLF-163).

Each match below was chosen by hand, with the same rule GOLF-161 used — the
golf-course feature, not the clubhouse:
  * a course-specific OSM polygon where one exists (Carnoustie, Peterhead,
    Monifieth, Royal Dornoch);
  * otherwise the venue's polygon, shared by its sibling courses. GOLF-161's
    drop_contested() refused that on purpose; here it is a reviewed choice,
    and the map's jitteredLatLng() de-stacks coincident pins;
  * an unnamed polygon only where it is the only course at that spot
    (Godstone, Kington).
Records not listed keep their coordinate (see UNRESOLVED).

Usage:
    python3 scripts/merge_golf238_coords.py --dry-run
    python3 scripts/merge_golf238_coords.py
"""

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MATCHES = {
    "data/courses-london.js": {
        "moor-park-west-course-74bc": "way/7991251",        # Moor Park Golf Club
        "richmond-park-duke-s-10d4": "way/4268580",         # Richmond Park Golf Course
        "richmond-park-prince-s-cd6a": "way/4268580",
        "walton-heath-old-course-e914": "way/22084377",     # Walton Heath Golf Course
        "walton-heath-new-course-41f4": "way/22084377",
        "godstone-golf-club-5a2e": "way/796702693",         # unnamed, only course there
        "sundridge-park-east-03c4": "way/4930823",          # Sundridge Park Golf Course
        "sundridge-park-west-5fde": "way/4930823",
        "chingford-royal-epping-forest-07bb": "way/23198505",  # Chingford Golf Course
        "hainault-forest-golf-club-1d8d": "way/25925045",   # Hainault GC, Upper + Lower, Romford Rd
        "batchwood-golf-sports-centre-5077": "way/4372571", # Batchwood Hall Golf Club
    },
    "data/courses-top100.js": {
        "sunningdale-old-8bde": "relation/15410213",        # Sunningdale Golf Club
        "sunningdale-new-86a7": "relation/15410213",
        "saunton-east-529a": "relation/9452839",            # Saunton Golf Course
        "saunton-west-0187": "relation/9452839",
        "the-berkshire-red-3762": "relation/11971832",      # The Berkshire Golf Club
        "the-berkshire-blue-cbcf": "relation/11971832",
        "kington-02f7": "relation/10815470",                # unnamed, Bradnor Hill, only course
        "centurion-af6b": "way/741950735",                  # Centurion Golf Club
        "enville-highgate-ed1b": "relation/3883245",        # Enville Golf Club
        "enville-lodge-fab0": "relation/3883245",
        "woburn-marquess-65ab": "relation/3466510",         # Woburn Golf Club
        "woburn-duke-s-0169": "relation/3466510",
        "woburn-duchess-d1f4": "relation/3466510",
        "wentworth-west-f8da": "way/22911115",              # Wentworth Club
        "wentworth-east-e5bf": "way/22911115",
        "hadley-wood-bca5": "way/3819393",                  # Hadley Wood Golf Course
        "moor-park-high-ab21": "way/7991251",               # Moor Park Golf Club
        "wildernesse-10fb": "way/5013935",                  # Wildernesse Club
        "beaconsfield-9d75": "way/242596862",               # Beaconsfield Golf Club
    },
    "data/courses-scotland.js": {
        "royal-dornoch-221d": "way/102270514",              # Championship Course
        "carnoustie-championship-5e36": "way/1459805268",
        "carnoustie-burnside-f2c9": "way/26237513",
        "gleneagles-king-s-973f": "way/269353306",          # Gleneagles Golf Resort
        "gleneagles-queen-s-521a": "way/269353306",
        "gleneagles-pga-centenary-5904": "way/269353306",
        "gullane-no-1-a66a": "way/1083233390",              # Gullane Golf Club
        "gullane-no-2-1724": "way/1083233390",
        "gullane-no-3-9a8d": "way/1083233390",
        "moray-old-cfad": "way/102611542",                  # Moray Golf Club
        "moray-new-c338": "way/102611542",
        "gailes-links-7c6c": "way/41275225",                # Glasgow Golf Club / Gailes Links
        "archerfield-fidra-54d4": "way/161228170",          # Archerfield Links
        "archerfield-dirleton-bf8b": "way/161228170",
        "askernish-3266": "way/360179254",                  # Raon Goilf Aisgernis
        "peterhead-d886": "way/116586104",                  # Craigewan Course (the 18)
        "monifieth-links-e3fb": "way/1245335145",           # Medal Course
    },
}

# OSM has nothing that can be tied to these clubs; their coordinate stays.
UNRESOLVED = {
    "sevenoaks-town-golf-club-2307": "no course feature; only an unnamed clubhouse",
    "cabot-highlands-old-petty-75d0": "not mapped; the nearest feature is Castle Stuart, a different course",
}

FLAG_M = 300
RECORD = re.compile(r'\{n:"(?:[^"\\]|\\.)*".*?id:"([^"]+)"', re.S)
COORDS = re.compile(r',lat:(-?\d+\.?\d*),lng:(-?\d+\.?\d*)')


def dist_m(a, b, c, d):
    p = math.radians
    return 2 * 6371000 * math.asin(math.sqrt(
        math.sin(p(c - a) / 2) ** 2
        + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2))


def main():
    dry = "--dry-run" in sys.argv
    els = {e["osm"]: e for e in json.load(open(
        os.path.join(HERE, "output", "golf238_osm.json")))["elements"]}
    report = []
    for rel, matches in MATCHES.items():
        path = os.path.join(ROOT, rel)
        text = open(path, encoding="utf-8").read()
        for cid, ref in matches.items():
            el = els[ref]
            hits = [m.start() for m in re.finditer(r'id:"%s"' % re.escape(cid), text)]
            if len(hits) != 1:
                raise SystemExit(f"{cid}: expected one record in {rel}, found {len(hits)}")
            idpos = hits[0]
            start = text.rfind('{n:"', 0, idpos)
            m = COORDS.search(text, start)
            if not m or m.start() > idpos + 2000 or 'coordSrc:' in text[start:m.end() + 40]:
                raise SystemExit(f"{cid}: coordinate pair not found cleanly")
            old = (float(m.group(1)), float(m.group(2)))
            moved = dist_m(old[0], old[1], el["lat"], el["lng"])
            new = f',lat:{el["lat"]},lng:{el["lng"]},coordSrc:"osm",osm:"{ref}"'
            text = text[:m.start()] + new + text[m.end():]
            report.append({"id": cid, "osm": ref, "name": el["tags"].get("name", "(unnamed)"),
                           "old": old, "new": (el["lat"], el["lng"]), "moved_m": round(moved)})
        if not dry:
            tmp = path + ".tmp"
            open(tmp, "w", encoding="utf-8").write(text)
            os.replace(tmp, path)
    flagged = [r for r in report if r["moved_m"] > FLAG_M]
    for r in sorted(report, key=lambda r: -r["moved_m"]):
        print(f'{r["moved_m"]:6d} m  {"FLAG " if r["moved_m"] > FLAG_M else "     "}{r["id"]} -> {r["osm"]} {r["name"]}')
    print(f"\n{len(report)} re-sourced, {len(flagged)} moved > {FLAG_M} m, "
          f"{len(UNRESOLVED)} unresolved{' (dry run)' if dry else ''}")
    out = os.path.join(HERE, "output", "golf238_merge_report.json")
    json.dump({"resolved": report, "unresolved": UNRESOLVED}, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
