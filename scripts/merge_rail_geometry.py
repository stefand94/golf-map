#!/usr/bin/env python3
"""
Turns fetch_rail_geometry.py's output into data/rail-geometry.js — a plain
global-scope RAIL_GEOM constant, same loading convention as every other
data/*.js file (no build step, file:// portable).

Coordinates are rounded to 5 decimal places (~1.1m precision at London's
latitude, far tighter than needed for a line drawn a few px wide) purely
to keep the committed file small; the Overpass source data is otherwise
unmodified.

Usage:
    python3 scripts/merge_rail_geometry.py
"""
import json

SRC = "scripts/output/rail_geometry.json"
OUT = "data/rail-geometry.js"


def main():
    with open(SRC) as f:
        data = json.load(f)

    lines = [
        "/* ============================================================",
        "   data/rail-geometry.js — real track geometry for the TfL network",
        "   lines (Underground, Elizabeth line, Overground), traced from",
        "   OpenStreetMap via scripts/fetch_rail_geometry.py. Each family key",
        "   (met/jub/nor/pic/cen/dis/eli/ovg) maps to a list of polylines —",
        "   one per distinct route relation matched, which can mean several",
        "   overlapping segments through shared trunk sections; that's",
        "   harmless to draw (same colour, same path) and simpler than",
        "   trying to dedupe branches into one continuous line per key.",
        "",
        "   National Rail groupings (Thameslink, Southern, Southeastern,",
        "   South Western, Great Northern, Chiltern, WCML) are NOT here —",
        "   those are our own station groupings by corridor, not a single",
        "   physical route, so there's nothing single to trace. Their",
        "   polylines stay the spline-through-stations approximation in the",
        "   main app file.",
        "   ============================================================ */",
        "const RAIL_GEOM={",
    ]
    for fam, polylines in data.items():
        rounded = [[[round(lat, 5), round(lng, 5)] for lat, lng in poly] for poly in polylines]
        lines.append(f"{fam}:{json.dumps(rounded, separators=(',', ':'))},")
    lines.append("};")

    with open(OUT, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
