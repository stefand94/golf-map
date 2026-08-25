#!/usr/bin/env python3
"""
Pull {n, lat, lng} out of a data/courses-*.js file into plain JSON, for
feeding into compute_nearest_stations.py. Regex-based, not a JS parser —
relies on the existing data files' consistent single-line-per-course,
double-quoted-name formatting (see SCHEMA.md).

Usage:
    python3 scripts/extract_courses.py data/courses-top100.js --out scripts/output/top100_courses.json
"""
import argparse
import json
import os
import re

PATTERN = re.compile(r'\{n:"((?:[^"\\]|\\.)*)",lat:(-?\d+\.?\d*),lng:(-?\d+\.?\d*)')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with open(args.infile) as f:
        text = f.read()

    courses = [
        {"n": m.group(1).replace('\\"', '"'), "lat": float(m.group(2)), "lng": float(m.group(3))}
        for m in PATTERN.finditer(text)
    ]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(courses, f, indent=2)
    print(f"Extracted {len(courses)} courses from {args.infile} -> {args.out}")


if __name__ == "__main__":
    main()
