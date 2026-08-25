#!/usr/bin/env python3
"""
GOLF-10: merge compute_nearest_stations.py's output into a data/courses-*.js
file as a `nearStation:{n,lat,lng,mi}` field per course object — a distinct
field from the London-only `stn`/`walk` pair, since these are nationwide,
straight-line distances rather than walkable London-network stations.

Usage:
    python3 scripts/merge_nearest_stations.py data/courses-top100.js \\
        --nearest scripts/output/nearest_stations.json

Edits the file in place. Idempotent: re-running replaces any existing
nearStation field rather than duplicating it. Review the diff before
committing, same as any other data-file change.
"""
import argparse
import json
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("--nearest", required=True)
    args = parser.parse_args()

    with open(args.nearest) as f:
        nearest = json.load(f)
    with open(args.infile) as f:
        text = f.read()

    # Strip any existing nearStation field first (idempotent re-runs).
    text = re.sub(r',nearStation:\{[^}]*\}', '', text)

    def repl(m):
        name = m.group(1).replace('\\"', '"')
        info = nearest.get(name)
        if not info:
            print(f"  ! no nearest-station entry for '{name}' — leaving as-is")
            return m.group(0)
        station = info["station"].replace('"', '\\"')
        frag = (
            f',nearStation:{{n:"{station}",lat:{info["lat"]},lng:{info["lng"]},mi:{info["miles"]}}}'
        )
        return m.group(0) + frag

    pattern = re.compile(r'\{n:"((?:[^"\\]|\\.)*)",lat:-?\d+\.?\d*,lng:-?\d+\.?\d*')
    new_text, n = pattern.subn(repl, text)

    with open(args.infile, "w") as f:
        f.write(new_text)
    print(f"Merged nearStation into {n} course entries in {args.infile}")


if __name__ == "__main__":
    main()
