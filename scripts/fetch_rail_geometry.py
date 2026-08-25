#!/usr/bin/env python3
"""
GOLF: traces real rail-line track geometry from OpenStreetMap's Overpass
API, to replace the hand-drawn spline curves (which only interpolate
between station coordinates, not the actual track) for the TfL network
lines — Underground, Elizabeth line, and the two London Overground
branches we cover (Weaver, Lioness).

National Rail groupings (Thameslink, Southern, Southeastern, South
Western, Great Northern, Chiltern, WCML) are deliberately NOT traced here:
those are our own station groupings by rough geographic corridor, not a
single physical route the way "the Northern line" is — there's no one
relation in OSM that corresponds to what we've grouped as e.g. "sn"
(Southern), so tracing would mean picking one arbitrary branch out of many
and calling it representative. The spline approximation stays for those.

For each family (met/jub/nor/pic/cen/dis/eli/ovg) this queries every named
route relation belonging to that line, stitches each relation's member
ways into one ordered polyline (Overpass returns ways in route order for
well-formed PTv2 relations, but not necessarily all pointing the same
direction — this reverses a way when needed so consecutive points join
up), then simplifies with Ramer-Douglas-Peucker to keep the output small.
Forward/backward direction pairs produce near-identical geometry; a cheap
fingerprint (rounded endpoint pair) drops the second one.

No API key needed — Overpass is a free public OSM service. Rate-limited
gently (one query per family, ~1s gap) to be a considerate anonymous user.

Usage:
    python3 scripts/fetch_rail_geometry.py
"""
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
UA = "golf-map-dev-script (one-off static data fetch, see scripts/README.md)"
OUT = "scripts/output/rail_geometry.json"

# family -> (route tag value, name/ref regex)
QUERIES = {
    "met": ('subway', 'name', '^Metropolitan line'),
    "jub": ('subway', 'name', '^Jubilee line'),
    "nor": ('subway', 'name', '^Northern line'),
    "pic": ('subway', 'name', '^Piccadilly line'),
    "cen": ('subway', 'name', '^Central line'),
    "dis": ('subway', 'name', '^District line'),
    "eli": ('train', 'name', '^Elizabeth line'),
    "ovg": ('train', 'ref', '^(Weaver|Lioness)$'),
}


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def ways_of(relation):
    """Each member way's own geometry, as independent coord lists — NOT
    stitched into one continuous polyline. An earlier version tried to
    concatenate ways in relation-member order, reversing as needed to
    join endpoints; Overpass doesn't guarantee that order for every
    relation, and a handful of mismatches produced long straight "jump"
    lines across London (bad edges connecting unrelated ways). Each way's
    internal geometry is always correct and contiguous on its own, so
    drawing every way as its own short polyline segment is both simpler
    and avoids that failure mode entirely — Leaflet renders adjoining
    ways as one visual line regardless of them being separate objects."""
    return [[[p["lat"], p["lon"]] for p in m["geometry"]]
            for m in relation.get("members", [])
            if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 2]


def rdp(points, epsilon):
    """Ramer-Douglas-Peucker simplification, pure Python."""
    if len(points) < 3:
        return points

    def perp_dist(pt, a, b):
        if a == b:
            return math.hypot(pt[0] - a[0], pt[1] - a[1])
        num = abs((b[0] - a[0]) * (a[1] - pt[1]) - (a[0] - pt[0]) * (b[1] - a[1]))
        den = math.hypot(b[0] - a[0], b[1] - a[1])
        return num / den

    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = perp_dist(points[i], points[0], points[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > epsilon:
        left = rdp(points[:idx + 1], epsilon)
        right = rdp(points[idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def fingerprint(coords):
    """Endpoint pair + length bucket — good enough to catch the same way
    reused across several branch relations (a shared trunk segment) or the
    same physical way appearing in both a route's forward and backward
    relation, without needing exact float equality."""
    r = lambda p: (round(p[0], 4), round(p[1], 4))
    ends = tuple(sorted([r(coords[0]), r(coords[-1])]))
    return (ends, len(coords))


def main():
    result = {}
    for family, (route_tag, key, regex) in QUERIES.items():
        query = (
            f'[out:json][timeout:60];'
            f'relation["route"="{route_tag}"]["{key}"~"{regex}"]["type"="route"];'
            f'out geom;'
        )
        print(f"Fetching {family}...")
        try:
            data = overpass(query)
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"  ! failed: {e}")
            continue
        seen = set()
        polylines = []
        for rel in data.get("elements", []):
            for coords in ways_of(rel):
                fp = fingerprint(coords)
                if fp in seen:
                    continue
                seen.add(fp)
                simplified = rdp(coords, epsilon=0.00008)  # ~9m at London's latitude
                if len(simplified) >= 2:
                    polylines.append(simplified)
        total_pts = sum(len(p) for p in polylines)
        print(f"  {len(polylines)} distinct way segment(s), {total_pts} points after simplification")
        result[family] = polylines
        time.sleep(1)

    with open(OUT, "w") as f:
        json.dump(result, f)
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
