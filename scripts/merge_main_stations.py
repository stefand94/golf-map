#!/usr/bin/env python3
"""
GOLF-243: turn scripts/output/stations_raw.json into data/rail-stations.js.

Reads the fetch script's JSON intermediate, applies the inclusion and
ranking rules below, and writes the data file. Re-runnable: it rebuilds
the whole file from the JSON, which is safe because nothing in it is
hand-edited and nothing else references a station by position. (That is
NOT true of data/courses-*.js — see CLAUDE.md — so do not copy this
pattern there.)

INCLUSION
---------
The whole OSM set is 3,732 stations and 59KB gzipped — a 30% rise in
what every visit downloads before the map draws, for a picker. So it is
cut to the stations this app could plausibly need, by two rules:

* **Within NEAR_KM of a course in data/courses-*.js.** This is the
  product's own definition of "worth including": a station is useful
  here if a golfer could start a round from it. It is also what keeps
  the small Scottish and Irish stations that matter to this app
  (Leuchars, Dornoch, Troon) while dropping a thousand English commuter
  halts nowhere near a course.
* **Or `big`** (see RANKING), so every intercity station is offered
  whether or not there is golf nearby — that is the station a visitor
  flies into and names first.

Anything else falls through to the existing place search, which is what
the brief asks for. On top of both:

* South Africa: only stations carrying a passenger network or operator
  (Metrorail, Gautrain, PRASA). OSM's South African station data is
  mostly Transnet freight sidings and long-closed halts — 852 of 1262
  carry no operator at all — and none of them is a place a golf trip
  starts.

RANKING
-------
`big` floats the stations someone would actually name as a trip endpoint
to the top of the picker. It is true when OSM says the station has
BIG_PLATFORMS or more platforms, or when the name is in TERMINI below —
the intercity stations and ferry/airport railheads whose OSM record
happens to carry no platform count (Inverness is the example that
started this list). Both halves are inspectable on purpose: if the
picker misses somewhere obvious, add the name, do not tune a score.

DEDUPLICATION
-------------
33 name+nation collisions, nearly all a heritage halt sharing a name
with a national-rail station. One row per name per nation, keeping the
better-tagged record, because the picker shows the name and the visitor
could not tell two identical rows apart anyway.

Usage:
    python3 scripts/merge_main_stations.py
    # reads scripts/output/stations_raw.json, writes data/rail-stations.js
"""
import glob
import json
import math
import re

RAW = "scripts/output/stations_raw.json"
OUT = "data/rail-stations.js"
BIG_PLATFORMS = 6
NEAR_KM = 10

TERMINI = set("""
Inverness
Aberdeen
Dundee
Perth
Stirling
Ayr
Oban
Fort William
Kyle of Lochalsh
Glasgow Queen Street
Newcastle
Carlisle
Preston
Manchester Victoria
Sheffield
Nottingham
Derby
Leicester
Peterborough
Doncaster
Darlington
Durham
Berwick-upon-Tweed
Swansea
Newport
Holyhead
Bangor
Shrewsbury
Hereford
Bath Spa
Bristol Parkway
Southampton Central
Portsmouth Harbour
Bournemouth
Truro
Penzance
Dover Priory
Folkestone Central
Canterbury West
Oxford
Winchester
Salisbury
Lincoln
Hull Paragon Interchange
Scarborough
Harrogate
Lancaster
Windermere
Belfast Lanyon Place
Belfast Grand Central
Derry~Londonderry
Coleraine
Portrush
Dublin Connolly
Dublin Heuston
Cork Kent
Galway Ceannt
Limerick Colbert
Killarney
Tralee Casement
Waterford Plunkett
Sligo Mac Diarmada
Westport
Ennis
Rosslare Europort
Cape Town Station
Johannesburg Park Station
Pretoria
Durban
Sandton
""".split("\n")) - {""}


def platforms(x):
    m = re.search(r"\d+", str(x.get("platforms") or ""))
    return int(m.group()) if m else 0


def keep(x):
    if x["nation"] != "za":
        return True
    return bool(x.get("network") or x.get("operator"))


def course_points():
    """Every course coordinate in data/courses-*.js, read with a regex
    rather than a JS parser: this only needs the two numbers, and the
    files are machine-written one record per line."""
    pts = []
    for f in sorted(glob.glob("data/courses-*.js")):
        for m in re.finditer(r'\blat:\s*(-?\d+\.?\d*)\s*,\s*lng:\s*(-?\d+\.?\d*)',
                             open(f, encoding="utf-8").read()):
            pts.append((float(m.group(1)), float(m.group(2))))
    if not pts:
        raise SystemExit("no course coordinates found — has the data format changed?")
    return pts


def near_a_course(x, pts):
    """Within NEAR_KM of any course. A flat equirectangular approximation
    is plenty at this distance and ~100x faster than haversine over 4,600
    stations x 879 courses; the cheap latitude gate below does most of the
    work anyway."""
    dlat = NEAR_KM / 111.0
    for lat, lng in pts:
        if abs(lat - x["lat"]) > dlat:
            continue
        dy = (lat - x["lat"]) * 111.0
        dx = (lng - x["lng"]) * 111.0 * math.cos(math.radians(x["lat"]))
        if dx * dx + dy * dy <= NEAR_KM * NEAR_KM:
            return True
    return False


def better(a, b):
    """The record to keep when two share a name: more platforms, then a
    network tag, then the one we already had."""
    if platforms(a) != platforms(b):
        return a if platforms(a) > platforms(b) else b
    if bool(a.get("network")) != bool(b.get("network")):
        return a if a.get("network") else b
    return a


def main():
    raw = [x for x in json.load(open(RAW)) if keep(x)]
    pts = course_points()
    raw = [x for x in raw
           if platforms(x) >= BIG_PLATFORMS or x["name"] in TERMINI
           or near_a_course(x, pts)]
    by_name = {}
    for x in raw:
        k = (x["name"], x["nation"])
        by_name[k] = better(by_name[k], x) if k in by_name else x
    rows = sorted(by_name.values(), key=lambda x: (x["nation"], x["name"]))

    out = []
    for x in rows:
        big = platforms(x) >= BIG_PLATFORMS or x["name"] in TERMINI
        out.append(json.dumps({
            "name": x["name"], "nation": x["nation"],
            "lat": x["lat"], "lng": x["lng"],
            **({"big": True} if big else {}),
        }, ensure_ascii=False, separators=(",", ":")))

    nbig = sum(1 for line in out if '"big":true' in line)
    header = f"""/* ============================================================
   data/rail-stations.js — the railway stations a trip can start
   from or end at (GOLF-243).

   Static on purpose: the start/end picker has to answer with no
   network call at all, which is the same reasoning as
   data/airports.js and the course data itself (CLAUDE.md).

   NOT data/stations.js — that one is the London Underground and
   Overground, drawn on the map. This is the national network.

   Source: OpenStreetMap `railway=station`, via Overpass, fetched
   2026-10-06. ODbL 1.0, © OpenStreetMap contributors — the credit
   the map already shows covers it. Rebuilt by
   scripts/fetch_main_stations.py + scripts/merge_main_stations.py —
   do not hand-edit. See docs/data-provenance.md.

   RAIL_STATIONS[] = {{name, nation:'gb'|'ie'|'za', lat, lng, big?}}
   `big` marks the {nbig} intercity stations the picker floats to the
   top; see the merge script for how it is decided.
   ============================================================ */

const RAIL_STATIONS=["""
    with open(OUT, "w") as f:
        f.write(header + "\n")
        f.write(",\n".join(out))
        f.write("\n];\n")
    print(f"wrote {OUT}: {len(out)} stations, {nbig} big")


if __name__ == "__main__":
    main()
