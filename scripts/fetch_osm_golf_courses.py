#!/usr/bin/env python3
"""GOLF-161: pull golf-course positions from OpenStreetMap, by country.

WHY

England Golf's and Scottish Golf's terms (§4.2/4.3 and §2.10/2.11, read in
full in docs/project/GOLF-119-coverage-audit.md §5) bear on *republishing*
their directory data, and our coordinates for those two nations came from
there. OpenStreetMap under ODbL does not have that problem. Ireland, Wales
and South Africa have no equivalent clause, so they are out of scope — this
is a targeted fix, not a redo.

A generalisation of fetch_sa_golf_overpass.py (GOLF-121a), which did exactly
this for South Africa and proved the approach. Two differences worth knowing:

  * it reuses fetch_pois.overpass(), so it inherits the mirror rotation,
    backoff, dead-host retirement and — after GOLF-158 — the persisted block
    list. A script that knocks on a mirror that has already refused this IP
    is how a short block becomes a long one.
  * the area is a parameter, so onboarding a country later (GOLF-157) does
    not mean a third copy of this file.

Fetch-once -> JSON intermediate -> scripted merge, per the project
convention. This script writes JSON and never touches data/courses-*.js;
scripts/merge_osm_coords.py does the merge, in place.

Usage:
    python3 scripts/fetch_osm_golf_courses.py england
    python3 scripts/fetch_osm_golf_courses.py england scotland
    python3 scripts/fetch_osm_golf_courses.py --list
"""

import argparse
import importlib.util
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))

# OSM relation ids. An Overpass area id is 3600000000 + the relation id — the
# same convention fetch_sa_golf_overpass.py used for South Africa (87565).
AREAS = {
    "england": 58447,
    "scotland": 58446,
    "wales": 58437,
    "ireland": 62273,          # Republic of Ireland
    "northern-ireland": 156393,
    "south-africa": 87565,
}

QUERY = """
[out:json][timeout:300];
area(36{area:08d})->.a;
(
  nwr["leisure"="golf_course"](area.a);
  nwr["golf"="course"](area.a);
);
out center tags;
"""

# OSM tags individual holes as golf=hole with name "1".."18", and clubhouse
# and feature polygons carry names too. Same filter as the SA pull, which was
# checked against its results.
FEATURE_TAGS = {"hole", "tee", "green", "fairway", "bunker", "rough", "path"}


def load_fp():
    spec = importlib.util.spec_from_file_location(
        "fp", os.path.join(HERE, "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)
    return fp


def usable(el):
    """The element as a course record, or None if it isn't one."""
    tags = el.get("tags") or {}
    name = tags.get("name") or tags.get("official_name") or tags.get("alt_name")
    if not name or not name.strip():
        return None
    name = name.strip()
    if re.fullmatch(r"\d+[A-Za-z]?", name) or len(name) < 4:
        return None
    if tags.get("golf") in FEATURE_TAGS:
        return None
    if el.get("type") == "node":
        lat, lng = el.get("lat"), el.get("lon")
    else:
        centre = el.get("center") or {}
        lat, lng = centre.get("lat"), centre.get("lon")
    if lat is None or lng is None:
        return None
    holes = tags.get("holes")
    try:
        holes = int(holes) if holes is not None else None
    except (TypeError, ValueError):
        holes = None
    return {
        "name": name,
        # 6dp is ~0.1m — far finer than a course centroid means anything, but
        # it keeps the file honest about what OSM actually said.
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "holes": holes,
        "website": tags.get("website") or tags.get("contact:website") or "",
        "city": tags.get("addr:city") or tags.get("addr:suburb") or "",
        "osm": f"{el['type']}/{el['id']}",
        "alt_names": [tags[k] for k in ("alt_name", "old_name", "short_name")
                      if tags.get(k)],
    }


def fetch(fp, region):
    query = QUERY.format(area=AREAS[region])
    print(f"Querying Overpass for golf courses in {region}...", flush=True)
    data = fp.overpass(query, f"golf courses in {region}")
    if not data:
        print(f"  {region}: no response after {fp.MAX_ATTEMPTS} attempts — "
              f"not written, re-run later", file=sys.stderr)
        return None
    elements = data.get("elements", [])
    courses = [c for c in (usable(el) for el in elements) if c]
    courses.sort(key=lambda c: c["name"].lower())
    print(f"  {len(elements)} raw elements -> {len(courses)} named courses "
          f"({sum(1 for c in courses if c['holes'])} with a holes count)")
    return {
        "fetched_at": time.strftime("%Y-%m-%d"),
        "region": region,
        "source": "OpenStreetMap via the Overpass API "
                  "(leisure=golf_course / golf=course), ODbL",
        "attribution": "© OpenStreetMap contributors, ODbL "
                       "(https://www.openstreetmap.org/copyright)",
        "count": len(courses),
        "courses": courses,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("regions", nargs="*", help=f"one or more of: {', '.join(sorted(AREAS))}")
    ap.add_argument("--list", action="store_true", help="show the known regions and exit")
    args = ap.parse_args()

    if args.list or not args.regions:
        print("Known regions (OSM relation id):")
        for r, a in sorted(AREAS.items()):
            print(f"  {r:20} {a}")
        return 0 if args.list else 2

    unknown = [r for r in args.regions if r not in AREAS]
    if unknown:
        raise SystemExit(f"unknown region(s): {unknown}. --list shows the known ones.")

    fp = load_fp()
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    for region in args.regions:
        try:
            out = fetch(fp, region)
        except fp.AllMirrorsBlocked as exc:
            print(f"\nSTOPPED: {exc}", file=sys.stderr)
            print("A block clears on its own schedule and retrying now extends "
                  "it. Re-run this later; nothing has been written.", file=sys.stderr)
            return 2
        if not out:
            continue
        path = os.path.join(HERE, "output", f"osm_golf_{region}.json")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
        print(f"Wrote {out['count']} courses to scripts/output/osm_golf_{region}.json")
        time.sleep(fp.TILE_PAUSE_S)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
