#!/usr/bin/env python3
"""
GOLF-10: compute the nearest National Rail / TfL station to each course,
by straight-line (haversine) distance — not real routing. Used for the
England Top 100 courses, most of which sit outside the London network this
map draws, so they need a nationwide station list rather than the `R`/
`ISOLATED` tables in data/stations.js.

Input:
  --stations   scripts/output/rail_stations.json (from fetch_rail_stations.py)
  --courses    a JSON file: [{"n": "Course name", "lat": 51.1, "lng": -0.2}, ...]
               (extract this from data/courses-top100.js with
               scripts/extract_courses.py, or hand-write one for a smaller batch)

Output: scripts/output/nearest_stations.json — {courseName: {station, lat, lng, miles}}

Usage:
    python3 scripts/compute_nearest_stations.py --courses scripts/output/top100_courses.json

A naive nearest-neighbour can occasionally pick a closed/tiny halt over an
obvious nearby mainline station — spot-check a handful of results against
an actual map before merging.
"""
import argparse
import json
import math
import os


def haversine_miles(lat1, lng1, lat2, lng2):
    R = 3958.8  # earth radius, miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stations", default="scripts/output/rail_stations.json")
    parser.add_argument("--courses", required=True)
    parser.add_argument("--out", default="scripts/output/nearest_stations.json")
    args = parser.parse_args()

    with open(args.stations) as f:
        stations = json.load(f)["stations"]
    with open(args.courses) as f:
        courses = json.load(f)

    station_list = [(name, s["lat"], s["lng"]) for name, s in stations.items()]

    results = {}
    for c in courses:
        best, best_dist = None, float("inf")
        for name, lat, lng in station_list:
            d = haversine_miles(c["lat"], c["lng"], lat, lng)
            if d < best_dist:
                best, best_dist = name, d
        results[c["n"]] = {
            "station": best,
            "lat": stations[best]["lat"],
            "lng": stations[best]["lng"],
            "miles": round(best_dist, 1),
        }
        print(f"{c['n']} -> {best} ({best_dist:.1f} mi)")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(results, f, indent=2, sort_keys=True)
    print(f"\nWrote {len(results)} entries to {args.out}")


if __name__ == "__main__":
    main()
