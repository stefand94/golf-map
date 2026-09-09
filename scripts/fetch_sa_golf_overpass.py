#!/usr/bin/env python3
"""
GOLF-121a follow-up: pull every golf course OpenStreetMap knows about in
South Africa, via the Overpass API, to (a) fix coordinates on the bulk
DotGolf entries whose Handicap Network Africa coords were wrong or absent,
and (b) recover the ~11 real clubs HNA returned with 0,0 coordinates so
they never made it into data/courses-southafrica.js.

Overpass tags golf courses as leisure=golf_course (occasionally golf=course
or sport=golf on a separate node). Many carry a `holes` count, `website`,
`phone`, and address tags — none of which the DotGolf API gave us.

Same fetch-once -> JSON intermediate -> manual/scripted merge pattern as
every other script here. No API key (Overpass is a free public OSM
service). Two mirrors, same as the Cloudflare Worker uses.

Usage:
    python3 scripts/fetch_sa_golf_overpass.py
    # writes scripts/output/sa_golf_overpass.json
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "golf-map-dev-script (one-off static data fetch, see scripts/README.md)"
OUT = "scripts/output/sa_golf_overpass.json"

# ISO3166-1 for South Africa -> Overpass area id is 3600000000 + OSM relation id.
# South Africa's OSM relation id is 87565.
QUERY = """
[out:json][timeout:180];
area(3600087565)->.za;
(
  nwr["leisure"="golf_course"](area.za);
  nwr["golf"="course"](area.za);
);
out center tags;
"""


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=200) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"  ! {url} failed: {e}", file=sys.stderr)
            time.sleep(2)
    raise SystemExit(f"all Overpass mirrors failed: {last}")


def main():
    print("Querying Overpass for golf courses in South Africa...")
    res = overpass(QUERY)
    elements = res.get("elements", [])
    print(f"  {len(elements)} raw elements")

    courses = []
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("official_name") or tags.get("alt_name")
        if not name:
            continue
        # OSM tags individual holes as golf=hole with name="1".."18"; and some
        # clubhouse/feature polygons sneak in — drop numeric / too-short names.
        if re.fullmatch(r"\d+[A-Za-z]?", name.strip()) or len(name.strip()) < 4:
            continue
        if tags.get("golf") in ("hole", "tee", "green", "fairway", "bunker", "rough", "path"):
            continue
        if el["type"] == "node":
            lat, lng = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat, lng = c.get("lat"), c.get("lon")
        if lat is None or lng is None:
            continue
        holes = tags.get("holes")
        try:
            holes = int(holes) if holes is not None else None
        except ValueError:
            holes = None
        courses.append({
            "name": name,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "holes": holes,
            "website": tags.get("website") or tags.get("contact:website") or "",
            "phone": tags.get("phone") or tags.get("contact:phone") or "",
            "city": tags.get("addr:city") or tags.get("addr:suburb") or "",
            "osm": f"{el['type']}/{el['id']}",
            "alt_names": [tags[k] for k in ("alt_name", "old_name", "short_name") if tags.get(k)],
        })

    courses.sort(key=lambda c: c["name"].lower())
    out = {
        "fetched_at": time.strftime("%Y-%m-%d"),
        "source": "OpenStreetMap Overpass API (area South Africa, leisure=golf_course / golf=course)",
        "count": len(courses),
        "with_holes": sum(1 for c in courses if c["holes"]),
        "courses": courses,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(courses)} named courses to {OUT} ({out['with_holes']} with a holes count)")


if __name__ == "__main__":
    main()
