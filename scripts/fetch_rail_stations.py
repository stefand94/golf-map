#!/usr/bin/env python3
"""
Fetch London rail-network station coordinates for the golf map.

Sources (both free, unauthenticated):
  - TfL StopPoint API: tube, overground, elizabeth-line, dlr
      https://api.tfl.gov.uk/StopPoint/Mode/{mode}
    Filtered to stopType in (NaptanMetroStation, NaptanRailStation) so we
    get station-level coordinates, not individual entrance/platform points.
  - davwheat/uk-railway-stations GitHub CSV (National Rail, GB-wide):
      https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.csv

Output: writes a single JSON file mapping station name -> {lat, lng, source}
to scripts/output/rail_stations.json. This script does NOT touch data.js —
merging fetched coordinates into the course/station data is a separate,
manual step so a bad fetch can never silently corrupt the live map.

Usage:
    python3 scripts/fetch_rail_stations.py [--out scripts/output/rail_stations.json]

Refresh cadence: manual/on-demand only. Re-run this whenever station
coordinates need re-verifying; there is no scheduler or automation.
"""
import argparse
import csv
import datetime
import io
import json
import sys
import urllib.request

TFL_MODES = ["tube", "overground", "elizabeth-line", "dlr"]
TFL_URL = "https://api.tfl.gov.uk/StopPoint/Mode/{mode}"
NATIONAL_RAIL_CSV_URL = (
    "https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.csv"
)


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def fetch_text(url):
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read().decode("utf-8")


def fetch_tfl_stations():
    """Returns {name: {lat, lng, source: 'tfl'}} for tube/overground/elizabeth-line/dlr."""
    stations = {}
    for mode in TFL_MODES:
        url = TFL_URL.format(mode=mode)
        try:
            data = fetch_json(url)
        except Exception as e:
            print(f"  ! failed to fetch TfL mode={mode}: {e}", file=sys.stderr)
            continue
        points = data.get("stopPoints", data) if isinstance(data, dict) else data
        for sp in points:
            if sp.get("stopType") not in ("NaptanMetroStation", "NaptanRailStation"):
                continue
            name = sp.get("commonName", "").replace(" Underground Station", "").replace(
                " Rail Station", ""
            ).strip()
            lat, lng = sp.get("lat"), sp.get("lon")
            if name and lat is not None and lng is not None:
                stations[name] = {"lat": lat, "lng": lng, "source": "tfl", "mode": mode}
        print(f"  tfl/{mode}: {len(points)} points scanned")
    return stations


def fetch_national_rail_stations():
    """Returns {name: {lat, lng, source: 'national-rail', crs}} from the davwheat CSV."""
    stations = {}
    try:
        text = fetch_text(NATIONAL_RAIL_CSV_URL)
    except Exception as e:
        print(f"  ! failed to fetch National Rail CSV: {e}", file=sys.stderr)
        return stations
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        name = (row.get("stationName") or "").strip()
        lat, lng = row.get("lat"), row.get("long")
        if not name or not lat or not lng:
            continue
        stations[name] = {
            "lat": float(lat),
            "lng": float(lng),
            "source": "national-rail",
            "crs": row.get("crsCode"),
        }
    return stations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="scripts/output/rail_stations.json")
    args = parser.parse_args()

    print("Fetching TfL stations (tube/overground/elizabeth-line/dlr)...")
    tfl = fetch_tfl_stations()
    print(f"  -> {len(tfl)} named stations")

    print("Fetching National Rail stations (davwheat/uk-railway-stations)...")
    nr = fetch_national_rail_stations()
    print(f"  -> {len(nr)} named stations")

    merged = {**nr, **tfl}  # TfL wins on name collisions (more precise for London metro stops)

    out = {
        "fetched_at": datetime.date.today().isoformat(),
        "sources": [
            "TfL StopPoint API (tube/overground/elizabeth-line/dlr)",
            NATIONAL_RAIL_CSV_URL,
        ],
        "station_count": len(merged),
        "stations": merged,
    }

    import os

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"Wrote {len(merged)} stations to {args.out}")


if __name__ == "__main__":
    main()
