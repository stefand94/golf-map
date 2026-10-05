#!/usr/bin/env python3
"""GOLF-238: one Overpass pull around the 49 England/Scotland records that
GOLF-161 left without `coordSrc:"osm"`.

GOLF-161 (fetch_osm_golf_courses.py + merge_osm_coords.py) matched by name
and distance and, by design, refused any OSM object that backed more than one
of our courses. Most of the 49 are exactly that case — multi-course venues
(Woburn, Gleneagles, Gullane, ...) that OSM maps as one club. A few are
simply missing from the country-wide pull. This fetch looks again, more
widely, at just those points: golf courses and clubhouses within 3 km, named
or not, so the hand merge sees everything OSM has near each one.

Fetch-once -> JSON intermediate -> hand merge. This writes
scripts/output/golf238_osm.json and never touches data/courses-*.js.

Usage:
    python3 scripts/fetch_golf238_osm.py points.json
where points.json is a list of {id, lat, lng}.
"""

import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RADIUS_M = 3000


def load_fp():
    spec = importlib.util.spec_from_file_location(
        "fp", os.path.join(HERE, "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)
    return fp


def main():
    points = json.load(open(sys.argv[1]))
    arounds = []
    for p in points:
        a = f"(around:{RADIUS_M},{p['lat']},{p['lng']})"
        arounds += [f'nwr["leisure"="golf_course"]{a};',
                    f'nwr["golf"="course"]{a};',
                    f'nwr["golf"="clubhouse"]{a};']
    query = "[out:json][timeout:300];\n(\n" + "\n".join(arounds) + "\n);\nout center tags;"
    fp = load_fp()
    data = fp.overpass(query, "GOLF-238 points")
    if not data:
        raise SystemExit("no response — nothing written, re-run later")
    found = []
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        if el["type"] == "node":
            lat, lng = el.get("lat"), el.get("lon")
        else:
            lat, lng = (el.get("center") or {}).get("lat"), (el.get("center") or {}).get("lon")
        if lat is None:
            continue
        found.append({"osm": f"{el['type']}/{el['id']}", "lat": round(lat, 6),
                      "lng": round(lng, 6), "tags": tags})
    out = {"fetched_at": time.strftime("%Y-%m-%d"),
           "source": "OpenStreetMap via the Overpass API, ODbL",
           "attribution": "© OpenStreetMap contributors, ODbL "
                          "(https://www.openstreetmap.org/copyright)",
           "count": len(found), "elements": found}
    path = os.path.join(HERE, "output", "golf238_osm.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    print(f"Wrote {len(found)} elements to scripts/output/golf238_osm.json")


if __name__ == "__main__":
    main()
