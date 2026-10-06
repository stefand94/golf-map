#!/usr/bin/env python3
"""
GOLF-243: the railway stations a trip can start from or end at.

Same reasoning as scripts/fetch_airports.py, and the same reasoning the
whole app runs on (CLAUDE.md): the picker has to answer instantly and
WITHOUT a Worker call, which rules out a runtime query. Stations do not
move, there are only a few thousand of them in the three countries this
app covers, and the whole useful set is small enough to ship as a static
file.

WHAT COUNTS AS A STATION HERE
-----------------------------
`railway=station` only — a place a scheduled train calls at. Halts,
tram stops, subway-only stations and light-rail stops are excluded:
nobody starts a golf trip at a tram stop, and including them would bury
"Edinburgh Waverley" under a hundred Edinburgh tram platforms. London
Underground is excluded for the same reason (and data/stations.js
already holds the Tube, for the map, which is a different job).

RANKING ("big")
---------------
The brief asks for MAIN stations first in the picker. OSM carries no
footfall figure, but it does carry `platforms` on most British and Irish
stations, and platform count is a decent, inspectable proxy for "is this
somewhere a trip would start": Edinburgh Waverley has 20, a village
station has 2. Final rule: big = platforms >= BIG_PLATFORMS, or the name
is in TERMINI (the handful of famous termini whose OSM record happens
not to carry a platform count). Deliberately simple — tune the table,
not the formula.

Fetch-once -> JSON intermediate -> scripted merge, like every other
script here. This writes JSON only; it never touches data/*.js.
Run scripts/merge_main_stations.py afterwards to build the data file.

Usage:
    python3 scripts/fetch_main_stations.py
    python3 scripts/fetch_main_stations.py --region scotland ireland
    # writes scripts/output/stations_raw.json
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Same mirrors, same order and the same reasoning as scripts/fetch_pois.py:
# a real User-Agent (overpass-api.de answers 406 without one), the big
# instances only, and never a small volunteer mirror.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = "golf-map-dev-script (one-off static data fetch, see scripts/README.md)"
OUT = "scripts/output/stations_raw.json"

# OSM relation ids -> area id is 3600000000 + relation id (as fetch_pois.py).
REGIONS = {
    "england":          {"area": 58447,  "nation": "gb"},
    "scotland":         {"area": 58446,  "nation": "gb"},
    "wales":            {"area": 58437,  "nation": "gb"},
    "northern-ireland": {"area": 156393, "nation": "gb"},
    "ireland":          {"area": 62273,  "nation": "ie"},
    "southafrica":      {"area": 87565,  "nation": "za"},
}

# Kinds of "station" that are not a train station for our purposes.
EXCLUDE_STATION = {"subway", "light_rail", "tram", "monorail", "funicular"}

QUERY = """
[out:json][timeout:180];
area(%d)->.a;
(
  node["railway"="station"]["name"](area.a);
  way["railway"="station"]["name"](area.a);
  relation["railway"="station"]["name"](area.a);
);
out center tags;
"""


def fetch(region, info, retries=3):
    q = QUERY % (3600000000 + info["area"])
    last = None
    for attempt in range(retries):
        for url in OVERPASS_URLS:
            try:
                req = urllib.request.Request(
                    url,
                    data=urllib.parse.urlencode({"data": q}).encode(),
                    headers={"User-Agent": UA},
                )
                with urllib.request.urlopen(req, timeout=300) as r:
                    return json.loads(r.read().decode())["elements"]
            except Exception as e:           # noqa: BLE001 - report and move on
                last = e
                print(f"  {region}: {url.split('/')[2]} -> {e}", file=sys.stderr)
        # Overpass fair use: back off rather than hammering the next mirror.
        time.sleep(20 * (attempt + 1))
    raise SystemExit(f"{region}: every mirror failed ({last})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", nargs="*", default=list(REGIONS))
    args = ap.parse_args()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out = []
    for region in args.region:
        info = REGIONS[region]
        print(f"{region}: fetching...", file=sys.stderr)
        els = fetch(region, info)
        kept = 0
        for e in els:
            t = e.get("tags") or {}
            if t.get("station") in EXCLUDE_STATION:
                continue
            if t.get("subway") == "yes" or t.get("tram") == "yes":
                continue
            if t.get("disused") or t.get("abandoned") or t.get("railway") != "station":
                continue
            lat = e.get("lat", (e.get("center") or {}).get("lat"))
            lng = e.get("lon", (e.get("center") or {}).get("lon"))
            if lat is None or lng is None:
                continue
            out.append({
                "name": t["name"],
                "lat": round(float(lat), 5),
                "lng": round(float(lng), 5),
                "nation": info["nation"],
                "region": region,
                "platforms": t.get("platforms"),
                "network": t.get("network"),
                "operator": t.get("operator"),
                "osm": f"{e['type']}/{e['id']}",
            })
            kept += 1
        print(f"  {region}: {kept} stations", file=sys.stderr)
        time.sleep(5)

    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {OUT} ({len(out)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
